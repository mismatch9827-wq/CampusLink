from __future__ import annotations

from io import BytesIO
from fastapi import File, UploadFile, APIRouter, Depends, HTTPException, status
import pdfplumber

from ai_tools import gemini_is_configured, parse_jd
from pydantic import BaseModel, Field

from auth import require_role
from db import find_many, find_one, insert_one, new_id, update_one, log_action
from students import is_eligible
from verification import run_verification

router = APIRouter(tags=['drives'])
MAX_JD_PDF_BYTES = 20 * 1024 * 1024
MAX_JD_PDF_PAGES = 40


def extract_page_tables(page) -> str:
    table_blocks = []
    for table in page.extract_tables() or []:
        rows = []
        for row in table:
            cells = [str(cell).strip().replace('\n', ' ') if cell else '' for cell in row]
            if any(cells):
                rows.append(' | '.join(cells))
        if rows:
            table_blocks.append('[Extracted table]\n' + '\n'.join(rows))
    return '\n'.join(table_blocks)


def extract_jd_pdf(raw: bytes, enable_ocr: bool = True) -> tuple[str, list[str], bool]:
    pages_text = []
    warnings = []
    ocr_used = False

    try:
        with pdfplumber.open(BytesIO(raw)) as pdf:
            if len(pdf.pages) > MAX_JD_PDF_PAGES:
                raise HTTPException(status_code=413, detail=f'PDF exceeds the {MAX_JD_PDF_PAGES}-page limit')
            for page_number, page in enumerate(pdf.pages, start=1):
                text = page.extract_text(layout=True) or page.extract_text() or ''
                try:
                    tables_text = extract_page_tables(page)
                except Exception:
                    tables_text = ''
                    warnings.append(f'Could not reliably extract tables from page {page_number}.')

                page_text = '\n'.join(part for part in (text, tables_text) if part).strip()
                if len(page_text) < 50:
                    if not enable_ocr:
                        warnings.append(f'Page {page_number} may be scanned; OCR was not enabled.')
                    else:
                        try:
                            from pdf2image import convert_from_bytes
                            import pytesseract

                            images = convert_from_bytes(raw, first_page=page_number, last_page=page_number, fmt='png')
                            ocr_text = pytesseract.image_to_string(images[0]).strip() if images else ''
                            if ocr_text:
                                page_text = '\n'.join(part for part in (page_text, '[OCR text]', ocr_text) if part)
                                ocr_used = True
                            else:
                                warnings.append(f'No readable text was extracted from page {page_number}; check OCR or enter its requirements manually.')
                        except Exception:
                            warnings.append(f'Page {page_number} may be scanned, but OCR is unavailable. Install/configure Tesseract and Poppler or enter its requirements manually.')

                pages_text.append(f'--- PAGE {page_number} ---\n{page_text}')
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=400, detail='Could not read this PDF. Try a valid, non-password-protected PDF.') from exc

    return '\n\n'.join(pages_text).strip(), warnings, ocr_used


class DriveCreate(BaseModel):
    company: str
    role: str
    jd: str
    required_skills: list[str]
    min_cgpa: float = Field(ge=0, le=10)
    branches: list[str]
    max_backlogs: int = Field(ge=0)
    ctc: float = Field(gt=0)
    date: str
    slot: str
    venue: str


class ApprovalBody(BaseModel):
    approve: bool


@router.post('/drives')
def create_drive(body: DriveCreate, recruiter: dict = Depends(require_role('recruiter'))):
    drive = {
        'id': new_id('d'),
        **body.model_dump(),
        'recruiter_id': recruiter['id'],
        'status': 'pending_admin_review'
    }
    
    insert_one('drives', drive)
    return drive


@router.post('/drives/parse-pdf')
async def parse_jd_pdf(file: UploadFile = File(...), recruiter: dict = Depends(require_role('recruiter'))):
    if not file.filename or not file.filename.lower().endswith('.pdf'):
        raise HTTPException(status_code=415, detail='Upload a PDF job description')
    raw = await file.read(MAX_JD_PDF_BYTES + 1)
    if len(raw) > MAX_JD_PDF_BYTES:
        raise HTTPException(status_code=413, detail='PDF exceeds the 20 MB upload limit')
    if not raw:
        raise HTTPException(status_code=400, detail='The uploaded PDF is empty')

    text, warnings, ocr_used = extract_jd_pdf(raw)
    if not text:
        raise HTTPException(status_code=422, detail='No readable text was found. Check OCR support or enter the job requirements manually.')
    extracted = parse_jd(text[:25000])
    if not gemini_is_configured():
        warnings.append('Gemini is not configured; basic rule-based extraction was used. Review every field.')

    return {
        "message": "PDF text and tables extracted; review the fields before submitting",
        "extracted_data": extracted,
        "raw_text": text[:25000],
        "warnings": warnings,
        "ocr_used": ocr_used,
        "manual_review_required": True,
    }


@router.get('/drives/{drive_id}')
def get_drive(drive_id: str):
    drive = find_one('drives', {'id': drive_id})
    if not drive:
        raise HTTPException(status_code=404, detail='Drive not found')
    return drive


@router.get('/recruiter/drives')
def recruiter_drives(recruiter: dict = Depends(require_role('recruiter'))):
    return find_many('drives', {'recruiter_id': recruiter['id']})



@router.get('/admin/drives')
def admin_drives(admin: dict = Depends(require_role('admin'))):
    return find_many('drives')


@router.post('/admin/drives/{drive_id}/approve')
def approve_drive(drive_id: str, body: ApprovalBody, admin: dict = Depends(require_role('admin'))):
    drive=find_one('drives', {'id':drive_id})
    if not drive:
        raise HTTPException(status_code=404,detail='Drive not found')
    if drive.get('status')!='pending_admin_review':
        raise HTTPException(status_code=409,detail='Gate 1 only accepts pending_admin_review drives')
    status='open_for_optin' if body.approve else 'drive_rejected'
    updated=update_one('drives', {'id':drive_id}, {'status':status,'gate1_by':admin['id']})
    log_action(admin['id'], 'gate1_approve' if body.approve else 'gate1_reject', drive_id, {'status':status})
    return updated


@router.post('/drives/{drive_id}/optin')
def opt_in(drive_id: str, user: dict = Depends(require_role('student'))):
    drive=find_one('drives', {'id':drive_id})
    if not drive:
        raise HTTPException(status_code=404,detail='Drive not found')
    if drive.get('status')!='open_for_optin':
        raise HTTPException(status_code=409,detail='Drive is not open for opt-in')
    master=find_one('master_students', {'registration_number':user.get('registration_number')})
    if not master:
        raise HTTPException(status_code=404,detail='Master student record not found')
    eligible, reason=is_eligible(master,drive)
    if not eligible:
        raise HTTPException(status_code=403,detail=reason)
    if find_one('applications', {'drive_id':drive_id,'student_id':master['id']}):
        raise HTTPException(status_code=409,detail='Already opted in')
    profile=find_one('students', {'student_id':master['id']}) or {}
    flags=run_verification(master,profile)
    app={'id':new_id('a'),'drive_id':drive_id,'student_id':master['id'],'status':'opted_in','flags':flags}
    insert_one('applications',app)
    log_action(user['id'], 'student_optin', app['id'], {'drive_id':drive_id})
    return {'message':'Opt-in successful','application':app}
