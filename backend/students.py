from __future__ import annotations

from io import BytesIO, StringIO
import csv
import re

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from pydantic import BaseModel
from pypdf import PdfReader

from auth import require_role
from db import find_many, find_one, insert_one, update_one, new_id
from ai_tools import parse_resume
import csv
import openpyxl
from io import StringIO, BytesIO

router = APIRouter(tags=['students'])



class ProfileBody(BaseModel):
    skills: list[str] = []
    projects: list[str] = []
    certificates: list[str] = []


def _student_records(user: dict):
    reg = user.get('registration_number')
    master = find_one('master_students', {'registration_number': reg})
    if not master:
        raise HTTPException(status_code=404, detail='Master student record not found')
    profile = find_one('students', {'student_id': master['id']}) or {
        'student_id': master['id'], 'parsed_skills': [], 'projects': [], 'certificates': [],
        'resume_text': '', 'certificate_proofs': [],
    }
    return master, profile


def readiness(master: dict, profile: dict) -> tuple[float, str, list[str]]:
    academic = min(float(master.get('cgpa', 0)) * 10, 100)
    technical = min(len(profile.get('parsed_skills', [])) * 15, 100)
    project_score = min(len(profile.get('projects', [])) * 25, 100)
    cert_score = min(len(profile.get('certificates', [])) * 20, 100)
    aptitude = float(master.get('aptitude') or 0)
    communication = float(master.get('communication') or 0)
    mock = float(master.get('mock_interview') or 0)
    score = round(academic*.20 + technical*.30 + project_score*.15 + cert_score*.10 + aptitude*.10 + communication*.10 + mock*.05, 1)
    level = 'Not Ready' if score < 40 else 'Developing' if score < 60 else 'Ready' if score < 80 else 'Highly Employable'
    target = {'Python','Machine Learning','SQL','FastAPI','Docker','AWS'}
    have = {x.lower() for x in profile.get('parsed_skills', [])}
    gaps = [x for x in target if x.lower() not in have]
    return score, level, gaps


def _public_student(master: dict, profile: dict) -> dict:
    score, level, gaps = readiness(master, profile)
    
    academic = min(round(float(master.get('cgpa', 0)) * 10), 100)
    technical = min(len(profile.get('parsed_skills', [])) * 15, 100)
    project_score = min(len(profile.get('projects', [])) * 25, 100)
    aptitude = int(master.get('aptitude') or 0)
    communication = int(master.get('communication') or 0)
    
    # Query real applications for this student
    apps = find_many('applications', {'student_id': master['id']})
    journey = []
    for a in apps:
        drive = find_one('drives', {'id': a.get('drive_id')}) or {}
        st = a.get('status', 'opted_in')
        subtext = 'Verification complete' if st == 'verified' else (
            'Shortlisted for drive' if st == 'shortlisted' else (
                'Under verification' if st == 'opted_in' else (
                    'Selected by recruiter' if st == 'selected_by_recruiter' else st.replace('_', ' ')
                )
            )
        )
        journey.append({
            'id': a.get('id'),
            'company': drive.get('company', ''),
            'role': drive.get('role', ''),
            'status': st,
            'detail': subtext,
        })
    
    # Derive target role and fit from available drives
    drives = find_many('drives')
    first_drive = drives[0] if drives else {}
    target_role = first_drive.get('role', '')
    target_company = first_drive.get('company', '')
    
    return {
        'id': master['id'], 'registration_number': master['registration_number'], 'name': master['name'], 'email': master.get('email', ''),
        'branch': master['branch'], 'cgpa': master['cgpa'], 'backlogs': master['backlogs'],
        'passing_year': master['passing_year'], 'parsed_skills': profile.get('parsed_skills', []),
        'projects': profile.get('projects', []), 'certificates': profile.get('certificates', []),
        'readiness_score': score, 'readiness_level': level, 'skill_gaps': gaps,
        'breakdown': {
            'technical': technical,
            'projects': project_score,
            'aptitude': aptitude,
            'communication': communication,
        },
        'journey': journey,
        'target_role': target_role,
        'target_company': target_company,
        'target_fit': min(98, round(score * 1.05)),
    }



@router.get('/students/me')
def student_me(user: dict = Depends(require_role('student'))):
    master, profile = _student_records(user)
    return _public_student(master, profile)


@router.patch('/students/profile')
def update_profile(body: ProfileBody, user: dict = Depends(require_role('student'))):
    master, profile = _student_records(user)
    fields = {'parsed_skills': body.skills, 'projects': body.projects, 'certificates': body.certificates}
    if find_one('students', {'student_id': master['id']}):
        profile = update_one('students', {'student_id': master['id']}, fields) or profile
    else:
        profile = insert_one('students', {'student_id': master['id'], **fields, 'resume_text': '', 'certificate_proofs': []})
    return _public_student(master, profile)


@router.post('/students/resume')
async def upload_resume(file: UploadFile = File(...), user: dict = Depends(require_role('student'))):
    master, profile = _student_records(user)
    raw = await file.read()
    
    text = ''
    if file.filename and file.filename.lower().endswith('.pdf'):
        try:
            reader = PdfReader(BytesIO(raw))
            text = '\n'.join((page.extract_text() or '') for page in reader.pages)
        except Exception:
            raise HTTPException(status_code=400, detail='Could not parse PDF resume')
    else:
        text = raw.decode('utf-8', errors='ignore')
        
    # --- NEW AI INTEGRATION START ---
    # Call your LangChain Gemini tool to extract structured JSON
    extracted_data = parse_resume(text[:25000])
    
    fields = {
        'resume_text': text[:25000], 
        'resume_filename': file.filename, 
        'parsed_skills': extracted_data.get('skills', []), 
        'projects': extracted_data.get('projects', []),
        'certificates': extracted_data.get('certificates', []),
        'resume_claimed_cgpa': extracted_data.get('cgpa')
    }
    # --- NEW AI INTEGRATION END ---
    
    if find_one('students', {'student_id': master['id']}):
        profile = update_one('students', {'student_id': master['id']}, fields) or profile
    else:
        profile = insert_one('students', {'student_id': master['id'], 'certificate_proofs': [], **fields})
        
    score, level, gaps = readiness(master, profile)
    
    return {
        'skills': profile['parsed_skills'], 
        'projects': profile['projects'],
        'certificates': profile['certificates'],
        'readiness_score': score, 
        'readiness_level': level, 
        'skill_gaps': gaps
    }

@router.get('/students/readiness')
def student_readiness(user: dict = Depends(require_role('student'))):
    master, profile = _student_records(user)
    score, level, gaps = readiness(master, profile)
    return {
        'score': score, 'level': level, 'skill_gaps': gaps,
        'recommendations': [
            f'Close the {gaps[0]} gap first' if gaps else 'Maintain current technical depth',
            'Complete one role-aligned portfolio project',
            'Attempt one additional mock interview',
        ]
    }


def is_eligible(master: dict, drive: dict) -> tuple[bool, str]:
    reasons = []
    if float(master.get('cgpa', 0)) < float(drive.get('min_cgpa', 0)):
        reasons.append(f"CGPA {master.get('cgpa')} is below {drive.get('min_cgpa')}")
    if master.get('branch') not in drive.get('branches', []):
        reasons.append(f"Branch {master.get('branch')} is not eligible")
    if int(master.get('backlogs', 0)) > int(drive.get('max_backlogs', 0)):
        reasons.append(f"Backlogs exceed allowed maximum ({drive.get('max_backlogs')})")
    return (not reasons, 'All academic eligibility rules are satisfied.' if not reasons else '; '.join(reasons))


@router.get('/students/drives')
def student_drives(user: dict = Depends(require_role('student'))):
    master, _ = _student_records(user)
    drives = find_many('drives')
    visible = []
    for drive in drives:
        if drive.get('status') not in {'open_for_optin','shortlist_published','admin_approved'}:
            continue
        ok, reason = is_eligible(master, drive)
        visible.append({**drive, 'eligible': ok, 'eligibility_reason': reason})
    return visible


@router.post('/admin/master-students/upload')
async def upload_master_students(file: UploadFile = File(...), admin: dict = Depends(require_role('admin'))):
    raw = await file.read()
    rows = []
    
    try:
        if file.filename.lower().endswith('.xlsx'):
            # Load Excel workbook and parse rows
            wb = openpyxl.load_workbook(BytesIO(raw), data_only=True)
            sheet = wb.active
            # Normalize headers (lowercase, replace spaces with underscores)
            headers = [str(cell.value).strip().lower().replace(" ", "_") for cell in sheet[1]]
            for row in sheet.iter_rows(min_row=2, values_only=True):
                if any(row):  # Skip empty rows
                    rows.append(dict(zip(headers, row)))
        else:
            # Fallback for CSV
            text = raw.decode('utf-8-sig')
            reader = csv.DictReader(StringIO(text))
            reader.fieldnames = [str(h).strip().lower().replace(" ", "_") for h in reader.fieldnames] if reader.fieldnames else []
            rows = list(reader)
    except Exception:
        raise HTTPException(status_code=400, detail='Could not parse file. Ensure it is a valid CSV or XLSX.')
        
    if not rows:
        raise HTTPException(status_code=400, detail="File is empty")
        
    def _parse_opt_float(val, field: str, row_number: int):
        if val is None or str(val).strip() in ('', 'None', 'null', 'nan'):
            return None
        try:
            score = float(val)
        except (ValueError, TypeError) as exc:
            raise HTTPException(status_code=400, detail=f'Invalid {field} on row {row_number}') from exc
        if not 0 <= score <= 100:
            raise HTTPException(status_code=400, detail=f'{field} must be between 0 and 100 on row {row_number}')
        return score

    created = updated = 0
    records = []
    for row_number, row in enumerate(rows, start=2):
        reg_no = row.get('registration_number') or row.get('reg_no')
        name = str(row.get('name') or '').strip()
        branch = str(row.get('branch') or '').strip().upper()
        cgpa_value = row.get('cgpa')
        backlogs_value = row.get('backlogs')
        passing_year_value = row.get('passing_year') or row.get('year')
        if not reg_no or not name or not branch or cgpa_value in (None, '') or backlogs_value in (None, '') or not passing_year_value:
            raise HTTPException(status_code=400, detail=f'Missing required student data on row {row_number}')

        try:
            cgpa = float(cgpa_value)
            backlogs = int(backlogs_value)
            passing_year = int(passing_year_value)
        except (ValueError, TypeError) as exc:
            raise HTTPException(status_code=400, detail=f'Invalid academic data on row {row_number}') from exc
        if not 0 <= cgpa <= 10 or backlogs < 0 or passing_year <= 0:
            raise HTTPException(status_code=400, detail=f'Academic values are out of range on row {row_number}')

        clean_reg = str(reg_no).strip().upper()
        record = {
            'registration_number': clean_reg,
            'name': name,
            'branch': branch,
            'cgpa': cgpa,
            'passing_year': passing_year,
            'backlogs': backlogs,
            'aptitude': _parse_opt_float(row.get('aptitude'), 'aptitude', row_number),
            'mock_interview': _parse_opt_float(row.get('mock_interview'), 'mock_interview', row_number),
            'communication': _parse_opt_float(row.get('communication'), 'communication', row_number),
        }
        if row.get('email'):
            record['email'] = str(row['email']).strip().lower()
        if row.get('college'):
            record['college'] = str(row['college']).strip()
        records.append(record)

    for record in records:
        clean_reg = record['registration_number']
        existing = find_one('master_students', {'registration_number': clean_reg})
        if existing:
            update_one('master_students', {'id': existing['id']}, record)
            updated += 1
        else:
            insert_one('master_students', {'id': new_id('s'), **record, 'user_id': None})
            created += 1

    return {'message': 'Master records imported successfully', 'created': created, 'updated': updated}