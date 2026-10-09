from __future__ import annotations

from io import BytesIO
from datetime import datetime, timezone
import re
from urllib.parse import quote
from fastapi import File, Form, UploadFile, APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
import pdfplumber

from ai_tools import gemini_is_configured, parse_jd, parse_jd_schedule
from pydantic import BaseModel, Field

from auth import require_role
from db import delete_drive_jd_file, find_many, find_one, insert_one, new_id, open_drive_jd_file, store_drive_jd_file, update_one, log_action
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
    company: str = ''
    role: str = ''
    jd: str = ''
    required_skills: list[str] = []
    min_cgpa: float = Field(default=0.0, ge=0, le=10)
    branches: list[str] = []
    max_backlogs: int = Field(default=0, ge=0)
    ctc: float = Field(default=0.0, ge=0)
    date: str = ''
    slot: str = ''
    venue: str = ''


class DriveUpdate(BaseModel):
    company: str | None = None
    role: str | None = None
    jd: str | None = None
    required_skills: list[str] | None = None
    min_cgpa: float | None = Field(default=None, ge=0, le=10)
    branches: list[str] | None = None
    max_backlogs: int | None = Field(default=None, ge=0)
    ctc: float | None = Field(default=None, ge=0)
    date: str | None = None
    slot: str | None = None
    venue: str | None = None


class ApprovalBody(BaseModel):
    approve: bool


class ScheduleProposalBody(BaseModel):
    date: str = Field(min_length=1, max_length=20)
    slot: str = Field(min_length=1, max_length=100)
    venue: str = Field(min_length=1, max_length=200)


class ScheduleResponseBody(BaseModel):
    proposal_id: str
    accept: bool


def _time_range(slot: str) -> tuple[int, int] | None:
    matches = list(re.finditer(r'(?<!\d)(\d{1,2})(?::(\d{2}))?\s*(am|pm|morning|afternoon|evening)?', slot, re.IGNORECASE))
    if len(matches) < 2:
        return None

    def to_minutes(match: re.Match) -> int | None:
        hour = int(match.group(1))
        minute = int(match.group(2) or 0)
        meridiem = (match.group(3) or '').lower()
        if meridiem in {'morning', 'afternoon', 'evening'}:
            meridiem = 'am' if meridiem == 'morning' else 'pm'
        if minute > 59 or hour > 23:
            return None
        if meridiem:
            if not 1 <= hour <= 12:
                return None
            hour = hour % 12 + (12 if meridiem == 'pm' else 0)
        return hour * 60 + minute

    start = to_minutes(matches[0])
    end = to_minutes(matches[1])
    if start is None or end is None:
        return None
    if end <= start:
        end += 24 * 60
    return start, end


def _schedule_conflicts(drive: dict, schedule: dict) -> list[str]:
    conflicts = []
    new_range = _time_range(schedule['slot'])
    for other in find_many('drives'):
        if other.get('id') == drive.get('id') or other.get('status') == 'drive_rejected':
            continue
        other_schedules = [{key: other.get(key, '') for key in ('date', 'slot', 'venue')}]
        proposal = other.get('schedule_proposal') or {}
        if proposal.get('status') == 'pending_recruiter':
            other_schedules.append(proposal)
        for other_schedule in other_schedules:
            if other_schedule.get('date') != schedule['date']:
                continue
            same_venue = (other_schedule.get('venue') or '').strip().casefold() == schedule['venue'].strip().casefold()
            same_recruiter = bool(drive.get('recruiter_id') and drive.get('recruiter_id') == other.get('recruiter_id'))
            if not same_venue and not same_recruiter:
                continue
            old_range = _time_range(other_schedule.get('slot', ''))
            overlaps = (
                new_range is None or old_range is None
                or (new_range[0] < old_range[1] and old_range[0] < new_range[1])
            )
            if overlaps:
                conflicts.append(f"{other.get('company', 'Another drive')} · {other.get('role', '')} at {other_schedule.get('venue') or 'an unspecified venue'} ({other_schedule.get('slot') or 'time not specified'})")
                break
    return conflicts


def _save_drive(
    body: DriveCreate,
    recruiter: dict,
    jd_pdf_file_id: str | None = None,
    jd_pdf_filename: str | None = None,
):
    drive = {
        'id': new_id('d'),
        **body.model_dump(),
        'recruiter_id': recruiter['id'],
        'status': 'pending_admin_review',
        'jd_source': 'pdf' if jd_pdf_file_id else 'text',
    }
    if jd_pdf_file_id:
        drive['jd_pdf_file_id'] = jd_pdf_file_id
        drive['jd_pdf_filename'] = jd_pdf_filename
    insert_one('drives', drive)
    return drive


@router.post('/drives')
def create_drive(body: DriveCreate, recruiter: dict = Depends(require_role('recruiter'))):
    return _save_drive(body, recruiter)


@router.post('/drives/with-pdf')
async def create_drive_with_pdf(
    company: str = Form(''),
    role: str = Form(''),
    jd: str = Form(''),
    required_skills: list[str] = Form(default=[]),
    min_cgpa: float = Form(0.0),
    branches: list[str] = Form(default=[]),
    max_backlogs: int = Form(0),
    ctc: float = Form(0.0),
    date: str = Form(''),
    slot: str = Form(''),
    venue: str = Form(''),
    file: UploadFile = File(...),
    recruiter: dict = Depends(require_role('recruiter')),
):
    if not file.filename or not file.filename.lower().endswith('.pdf'):
        raise HTTPException(status_code=415, detail='Upload a PDF job description')
    raw = await file.read(MAX_JD_PDF_BYTES + 1)
    if len(raw) > MAX_JD_PDF_BYTES:
        raise HTTPException(status_code=413, detail='PDF exceeds the 20 MB upload limit')
    if not raw:
        raise HTTPException(status_code=400, detail='The uploaded PDF is empty')

    if not jd:
        try:
            pdf_text, _, _ = extract_jd_pdf(raw, enable_ocr=False)
            jd = pdf_text
        except Exception:
            jd = ''

    if jd and (not company or not role or not required_skills):
        try:
            auto_parsed = parse_jd(jd[:25000])
            if not company and auto_parsed.get('company'):
                company = auto_parsed['company']
            if not role and auto_parsed.get('role'):
                role = auto_parsed['role']
            if not required_skills and auto_parsed.get('required_skills'):
                required_skills = auto_parsed['required_skills']
            if not min_cgpa and auto_parsed.get('min_cgpa'):
                min_cgpa = auto_parsed['min_cgpa']
            if not branches and auto_parsed.get('branches'):
                branches = auto_parsed['branches']
            if not ctc and auto_parsed.get('ctc'):
                ctc = auto_parsed['ctc']
        except Exception:
            pass

    comp = company.strip() or recruiter.get('name') or 'Recruiter Company'
    rol = role.strip() or 'Job Opening (From JD)'

    body = DriveCreate(
        company=comp,
        role=rol,
        jd=jd,
        required_skills=required_skills,
        min_cgpa=min_cgpa,
        branches=branches,
        max_backlogs=max_backlogs,
        ctc=ctc,
        date=date,
        slot=slot,
        venue=venue,
    )
    pdf_file_id = store_drive_jd_file(raw, file.filename, {
        'content_type': 'application/pdf',
        'uploaded_by': recruiter['id'],
    })
    try:
        return _save_drive(body, recruiter, pdf_file_id, file.filename)
    except Exception:
        delete_drive_jd_file(pdf_file_id)
        raise


@router.patch('/admin/drives/{drive_id}')
def update_drive_admin(
    drive_id: str,
    body: DriveUpdate,
    admin: dict = Depends(require_role('admin')),
):
    drive = find_one('drives', {'id': drive_id})
    if not drive:
        raise HTTPException(status_code=404, detail='Drive not found')

    update_data = {k: v for k, v in body.model_dump().items() if v is not None}
    if not update_data:
        return drive

    updated = update_one('drives', {'id': drive_id}, update_data)
    log_action(admin['id'], 'admin_update_drive', drive_id, update_data)
    return updated


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


@router.get('/admin/drives/{drive_id}/jd-pdf')
def admin_drive_jd_pdf(drive_id: str, admin: dict = Depends(require_role('admin'))):
    drive = find_one('drives', {'id': drive_id})
    if not drive:
        raise HTTPException(status_code=404, detail='Drive not found')
    if not drive.get('jd_pdf_file_id'):
        raise HTTPException(status_code=404, detail='This drive has no uploaded PDF')
    pdf_file = open_drive_jd_file(drive['jd_pdf_file_id'])
    if pdf_file is None:
        raise HTTPException(status_code=404, detail='The uploaded PDF could not be found')

    def content():
        try:
            while chunk := pdf_file.read(64 * 1024):
                yield chunk
        finally:
            pdf_file.close()

    filename = quote(drive.get('jd_pdf_filename') or 'job-description.pdf', safe='')
    return StreamingResponse(
        content(),
        media_type='application/pdf',
        headers={'Content-Disposition': f"inline; filename*=UTF-8''{filename}"},
    )


@router.get('/drives/{drive_id}')
def get_drive(drive_id: str):
    drive = find_one('drives', {'id': drive_id})
    if not drive:
        raise HTTPException(status_code=404, detail='Drive not found')
    return {key: value for key, value in drive.items() if key != 'jd_pdf_file_id'}


@router.get('/recruiter/drives')
def recruiter_drives(recruiter: dict = Depends(require_role('recruiter'))):
    return [
        {key: value for key, value in drive.items() if key != 'jd_pdf_file_id'}
        for drive in find_many('drives', {'recruiter_id': recruiter['id']})
    ]



@router.get('/admin/drives')
def admin_drives(admin: dict = Depends(require_role('admin'))):
    drives = find_many('drives')
    for drive in drives:
        recruiter = find_one('users', {'id': drive.get('recruiter_id')}) or {}
        drive['recruiter_email'] = recruiter.get('email', '')
    return drives


@router.post('/admin/drives/{drive_id}/schedule-proposal')
def propose_schedule(drive_id: str, body: ScheduleProposalBody, admin: dict = Depends(require_role('admin'))):
    drive = find_one('drives', {'id': drive_id})
    if not drive:
        raise HTTPException(status_code=404, detail='Drive not found')
    if drive.get('status') == 'drive_rejected':
        raise HTTPException(status_code=409, detail='A rejected drive cannot be scheduled')
    try:
        datetime.strptime(body.date, '%Y-%m-%d')
    except ValueError as exc:
        raise HTTPException(status_code=422, detail='Use a valid date in YYYY-MM-DD format') from exc

    schedule = body.model_dump()
    conflicts = _schedule_conflicts(drive, schedule)
    if conflicts:
        raise HTTPException(
            status_code=409,
            detail='Schedule conflict: ' + '; '.join(conflicts) + '. Choose a different time or venue.',
        )

    recruiter = find_one('users', {'id': drive.get('recruiter_id')})
    if not recruiter:
        raise HTTPException(status_code=409, detail='The recruiter account for this drive could not be found')

    old_proposal = drive.get('schedule_proposal') or {}
    if old_proposal.get('status') == 'pending_recruiter':
        for note in find_many('notifications', {'proposal_id': old_proposal.get('id')}):
            update_one('notifications', {'id': note['id']}, {'read': True, 'action_state': 'superseded'})

    proposal = {
        'id': new_id('sp'),
        **schedule,
        'status': 'pending_recruiter',
        'proposed_by': admin['id'],
        'proposed_by_email': admin.get('email', ''),
    }
    update_one('drives', {'id': drive_id}, {
        'schedule_proposal': proposal,
        'schedule_status': 'pending_recruiter',
    })
    insert_one('notifications', {
        'id': new_id('n'),
        'user_id': recruiter['id'],
        'drive_id': drive_id,
        'proposal_id': proposal['id'],
        'type': 'schedule_proposal',
        'title': 'Schedule proposal',
        'message': f"Admin proposed a schedule for {drive['company']} · {drive['role']}.",
        **schedule,
        'contact_email': admin.get('email', ''),
        'read': False,
        'created_at': datetime.now(timezone.utc).isoformat(),
    })
    log_action(admin['id'], 'schedule_proposed', drive_id, proposal)
    return find_one('drives', {'id': drive_id})


@router.post('/drives/{drive_id}/schedule-response')
def respond_to_schedule(drive_id: str, body: ScheduleResponseBody, recruiter: dict = Depends(require_role('recruiter'))):
    drive = find_one('drives', {'id': drive_id})
    if not drive:
        raise HTTPException(status_code=404, detail='Drive not found')
    if drive.get('recruiter_id') != recruiter['id']:
        raise HTTPException(status_code=403, detail='You can only respond to schedules for your own drives')
    proposal = drive.get('schedule_proposal') or {}
    if proposal.get('id') != body.proposal_id or proposal.get('status') != 'pending_recruiter':
        raise HTTPException(status_code=409, detail='This schedule proposal is no longer awaiting a response')

    fields = {
        'schedule_status': 'accepted' if body.accept else 'rejected',
        'schedule_proposal': {**proposal, 'status': 'accepted' if body.accept else 'rejected'},
    }
    if body.accept:
        conflicts = _schedule_conflicts(drive, proposal)
        if conflicts:
            raise HTTPException(status_code=409, detail='Schedule conflict: ' + '; '.join(conflicts) + '. Contact admin to propose another time or venue.')
        fields.update({key: proposal[key] for key in ('date', 'slot', 'venue')})
    updated = update_one('drives', {'id': drive_id}, fields)

    for note in find_many('notifications', {'proposal_id': proposal['id']}):
        update_one('notifications', {'id': note['id']}, {'read': True, 'action_state': fields['schedule_status']})

    result = 'accepted' if body.accept else 'rejected'
    insert_one('notifications', {
        'id': new_id('n'),
        'user_id': proposal.get('proposed_by'),
        'drive_id': drive_id,
        'type': 'schedule_response',
        'title': f'Recruiter {result} the schedule',
        'message': f"{recruiter.get('name', 'The recruiter')} {result} the proposed schedule for {drive['company']} · {drive['role']}.",
        'contact_email': recruiter.get('email', ''),
        'accepted': body.accept,
        'read': False,
        'created_at': datetime.now(timezone.utc).isoformat(),
    })
    log_action(recruiter['id'], f'schedule_{result}', drive_id, {'proposal_id': proposal['id']})
    return updated


@router.post('/admin/drives/{drive_id}/approve')
def approve_drive(drive_id: str, body: ApprovalBody, admin: dict = Depends(require_role('admin'))):
    drive=find_one('drives', {'id':drive_id})
    if not drive:
        raise HTTPException(status_code=404,detail='Drive not found')
    if drive.get('status')!='pending_admin_review':
        raise HTTPException(status_code=409,detail='Gate 1 only accepts pending_admin_review drives')
    if body.approve and (drive.get('schedule_proposal') or {}).get('status') == 'pending_recruiter':
        raise HTTPException(status_code=409, detail='Wait for the recruiter to respond to the schedule proposal')
    if body.approve and not all(drive.get(field) for field in ('date', 'slot', 'venue')):
        raise HTTPException(status_code=409, detail='Set and confirm a date, time, and venue before approving this drive')
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
