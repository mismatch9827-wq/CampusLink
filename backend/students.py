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
from verification import parse_github_repo, verify_github_project
import csv
import openpyxl
from io import StringIO, BytesIO

router = APIRouter(tags=['students'])


class ProfileBody(BaseModel):
    skills: list[str] = []
    projects: list[str] = []
    certificates: list[str] = []


class ProjectAddBody(BaseModel):
    title: str
    github_url: str = ''


def _student_records(user: dict):
    reg = user.get('registration_number')
    master = find_one('master_students', {'registration_number': reg})
    if not master:
        raise HTTPException(status_code=404, detail='Master student record not found')
    profile = find_one('students', {'student_id': master['id']})
    if not profile:
        profile = {
            'student_id': master['id'],
            'parsed_skills': [],
            'projects': [],
            'certificates': [],
            'resume_text': '',
            'certificate_proofs': [],
        }
        insert_one('students', profile)
    return master, profile


def readiness(master: dict, profile: dict) -> tuple[float, str, list[str]]:
    academic = min(float(master.get('cgpa', 0)) * 10, 100)
    technical = min(len(profile.get('parsed_skills', [])) * 15, 100)

    # --- PROJECT VERIFICATION IMPACT ON READINESS ---
    projects = profile.get('projects', [])
    verified_count = 0
    unverified_count = 0
    for p in projects:
        if isinstance(p, dict) and p.get('verified'):
            verified_count += 1
        else:
            p_str = p.get('github_url', '') if isinstance(p, dict) else str(p)
            if parse_github_repo(p_str):
                v = verify_github_project(p_str)
                if v.get('verified'):
                    verified_count += 1
                else:
                    unverified_count += 1
            else:
                unverified_count += 1

    # Verified projects with real code award 35 pts each; unverified self-declared award only 12 pts
    project_score = min(100, verified_count * 35 + unverified_count * 12)
    cert_score = min(len(profile.get('certificates', [])) * 20, 100)
    aptitude = float(master.get('aptitude') or 0)
    communication = float(master.get('communication') or 0)
    mock = float(master.get('mock_interview') or 0)

    score = round(
        academic * 0.20 +
        technical * 0.30 +
        project_score * 0.15 +
        cert_score * 0.10 +
        aptitude * 0.10 +
        communication * 0.10 +
        mock * 0.05,
        1
    )
    level = 'Not Ready' if score < 40 else 'Developing' if score < 60 else 'Ready' if score < 80 else 'Highly Employable'

    # --- DYNAMIC JD-DRIVEN TARGET SKILLS FROM ACTIVE CAMPUS DRIVES ---
    active_drives = find_many('drives')
    student_branch = master.get('branch', '')
    campus_skills = []
    for d in active_drives:
        if d.get('status') != 'drive_rejected':
            branches = d.get('branches', [])
            if not branches or student_branch in branches:
                campus_skills.extend(d.get('required_skills', []))

    if campus_skills:
        from collections import Counter
        target = {skill for skill, _ in Counter(campus_skills).most_common(8)}
    else:
        target = {'Python', 'Machine Learning', 'SQL', 'FastAPI', 'Docker', 'AWS'}

    have = {x.lower() for x in profile.get('parsed_skills', [])}
    gaps = [x for x in target if x.lower() not in have]
    return score, level, gaps


def _public_student(master: dict, profile: dict) -> dict:
    score, level, gaps = readiness(master, profile)
    
    academic = min(round(float(master.get('cgpa', 0)) * 10), 100)
    technical = min(len(profile.get('parsed_skills', [])) * 15, 100)

    # Process structured project details with verification status
    projects = profile.get('projects', [])
    project_details = []
    verified_count = 0
    for p in projects:
        if isinstance(p, dict):
            if p.get('verified'):
                verified_count += 1
            project_details.append(p)
        else:
            p_str = str(p)
            parsed = parse_github_repo(p_str)
            if parsed:
                v = verify_github_project(p_str)
                is_v = v.get('verified', False)
                if is_v:
                    verified_count += 1
                project_details.append({
                    'title': p_str.split('http')[0].strip(' -:') or f"{parsed[0]}/{parsed[1]}",
                    'github_url': v.get('url') or p_str,
                    'verified': is_v,
                    'language': v.get('language') or 'Code',
                    'stars': v.get('stars', 0),
                    'status': v.get('status', 'unlinked')
                })
            else:
                project_details.append({
                    'title': p_str,
                    'github_url': '',
                    'verified': False,
                    'status': 'unverified'
                })

    project_score = min(100, verified_count * 35 + (len(projects) - verified_count) * 12)
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
        'projects': [p.get('title') if isinstance(p, dict) else str(p) for p in projects],
        'project_details': project_details,
        'verified_projects_count': verified_count,
        'certificates': profile.get('certificates', []),
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


@router.post('/students/projects')
def add_project(body: ProjectAddBody, user: dict = Depends(require_role('student'))):
    master, profile = _student_records(user)
    url = body.github_url.strip()
    v = verify_github_project(url) if url else {'verified': False, 'status': 'unlinked'}
    new_proj = {
        'title': body.title.strip(),
        'github_url': v.get('url') or url,
        'verified': v.get('verified', False),
        'language': v.get('language') or 'Code',
        'stars': v.get('stars', 0),
        'status': v.get('status', 'unlinked')
    }
    existing = profile.get('projects', [])
    updated = [*existing, new_proj]
    update_one('students', {'student_id': master['id']}, {'projects': updated})
    master, profile = _student_records(user)
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
        
    extracted_data = parse_resume(text[:25000])
    raw_projects = extracted_data.get('projects', [])

    # Automatically scan for GitHub project links in resume text
    github_links = re.findall(r'(?:https?://)?(?:www\.)?github\.com/[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+', text)
    processed_projects = []
    for idx, p in enumerate(raw_projects):
        url = github_links[idx] if idx < len(github_links) else ''
        if not url:
            parsed = parse_github_repo(str(p))
            if parsed:
                url = f"https://github.com/{parsed[0]}/{parsed[1]}"
        v = verify_github_project(url) if url else {'verified': False, 'status': 'unlinked'}
        processed_projects.append({
            'title': str(p).split('http')[0].strip(' -:') or 'Project',
            'github_url': v.get('url') or url,
            'verified': v.get('verified', False),
            'language': v.get('language') or 'Code',
            'stars': v.get('stars', 0),
            'status': v.get('status', 'unlinked')
        })

    fields = {
        'resume_text': text[:25000], 
        'resume_filename': file.filename, 
        'parsed_skills': extracted_data.get('skills', []), 
        'projects': processed_projects,
        'certificates': extracted_data.get('certificates', []),
        'resume_claimed_cgpa': extracted_data.get('cgpa')
    }
    
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

    projects = profile.get('projects', [])
    unverified_count = 0
    for p in projects:
        if isinstance(p, dict):
            if not p.get('verified'):
                unverified_count += 1
        elif not parse_github_repo(str(p)):
            unverified_count += 1

    recommendations = []
    if unverified_count > 0:
        recommendations.append(
            f"Link GitHub repositories for your {unverified_count} unverified project(s) to boost evidence score by up to +{min(50, unverified_count * 23)} points."
        )

    aptitude = float(master.get('aptitude') or 0)
    mock = float(master.get('mock_interview') or 0)
    if aptitude < 65:
        recommendations.append(f"Aptitude score is {int(aptitude)}/100. Practice quantitative tests to pass recruiter Gate 1 cutoffs.")
    elif mock < 65:
        recommendations.append(f"Mock interview score is {int(mock)}/100. Complete an additional technical mock round.")

    if gaps:
        recommendations.append(f"Close the '{gaps[0]}' skill gap demanded by active campus recruitment drives.")
    else:
        recommendations.append("Technical profile matches current campus drive requirements. Focus on code quality and project evidence.")

    return {
        'score': score,
        'level': level,
        'skill_gaps': gaps,
        'recommendations': recommendations[:3]
    }


class SkillGapAnalysisQuery(BaseModel):
    drive_id: str | None = None
    company_name: str | None = None


def normalize_skill_token(token: str) -> str:
    return re.sub(r'^[^\w\+#]+|[^\w\+#]+$', '', token.strip().lower())


def match_required_skill(required_item: str, student_skills: list[str], resume_text: str = '') -> tuple[bool, list[str]]:
    """
    Intelligently checks if student satisfies a required skill phrase from a recruiter's JD.
    Handles 'or', '/', '&', 'and', and common technology aliases.
    """
    req_clean = required_item.strip()
    if not req_clean:
        return False, []

    student_skills_clean = {normalize_skill_token(s) for s in student_skills if s}
    resume_lower = f" {resume_text.lower()} " if resume_text else ''

    ALIASES = {
        'oop': {'oop', 'oops', 'object-oriented programming', 'object oriented'},
        'oop basics': {'oop', 'oops', 'object-oriented programming', 'object oriented'},
        'dsa': {'dsa', 'data structures', 'algorithms', 'data structures & algorithms', 'data structures and algorithms'},
        'data structures & algorithms': {'dsa', 'data structures', 'algorithms', 'data structures & algorithms'},
        'rest apis': {'rest', 'rest api', 'rest apis', 'restful', 'api', 'fastapi', 'flask', 'express'},
        'sql': {'sql', 'mysql', 'postgresql', 'postgres', 'sqlite', 'oracle'},
        'mongodb': {'mongodb', 'mongo', 'nosql'},
        'git': {'git', 'github', 'gitlab', 'version control'},
        'html & css': {'html', 'css', 'html5', 'css3', 'web development'},
        'problem solving': {'problem solving', 'competitive programming', 'leetcode', 'hackerrank', 'dsa', 'algorithms'},
        'communication skills': {'communication', 'presentation', 'teamwork', 'leadership'},
        'logical reasoning': {'reasoning', 'aptitude', 'problem solving', 'analytical'},
    }

    def atom_matches(atom: str) -> tuple[bool, str]:
        cleaned_atom = normalize_skill_token(atom)
        if not cleaned_atom:
            return False, ''

        if cleaned_atom in student_skills_clean:
            return True, atom.strip()

        for alias_key, aliases in ALIASES.items():
            if cleaned_atom in aliases or cleaned_atom == alias_key:
                for a in aliases:
                    if a in student_skills_clean:
                        return True, a
                    if resume_lower and f" {a} " in resume_lower:
                        return True, a

        if resume_lower and (f" {cleaned_atom} " in resume_lower or f"/{cleaned_atom}" in resume_lower or f"{cleaned_atom}/" in resume_lower):
            return True, atom.strip()

        for s in student_skills_clean:
            if len(cleaned_atom) >= 3 and len(s) >= 3 and (cleaned_atom in s or s in cleaned_atom):
                return True, s

        return False, ''

    # Handle OR-separated skills: "Python or Java", "SQL / MongoDB"
    or_parts = [p.strip() for p in re.split(r'\s+or\s+|\s*/\s*', req_clean, flags=re.IGNORECASE) if p.strip()]
    if len(or_parts) > 1:
        matched_sub = []
        for part in or_parts:
            ok, m_kw = atom_matches(part)
            if ok:
                matched_sub.append(m_kw)
        if matched_sub:
            return True, matched_sub

    # Handle AND-separated skills: "HTML & CSS", "Data Structures & Algorithms"
    and_parts = [p.strip() for p in re.split(r'\s+and\s+|\s*&\s*', req_clean, flags=re.IGNORECASE) if p.strip()]
    if len(and_parts) > 1:
        whole_ok, whole_kw = atom_matches(req_clean)
        if whole_ok:
            return True, [whole_kw]
        matched_sub = []
        for part in and_parts:
            ok, m_kw = atom_matches(part)
            if ok:
                matched_sub.append(m_kw)
        if matched_sub:
            return True, matched_sub

    # Single atom check
    ok, m_kw = atom_matches(req_clean)
    if ok:
        return True, [m_kw]

    return False, []


def compute_company_skill_gap(master: dict, profile: dict, drive: dict) -> dict:
    required_skills = drive.get('required_skills') or []
    if not required_skills:
        jd_text = drive.get('jd') or drive.get('job_description') or ''
        if jd_text:
            extracted_tech = [t for t in ['Python', 'Java', 'SQL', 'React', 'Node.js', 'Data Structures', 'REST APIs', 'Git'] if t.lower() in jd_text.lower()]
            required_skills = extracted_tech or ['Problem Solving', 'Data Structures', 'Communication', 'Core Programming']
        else:
            required_skills = ['Problem Solving', 'Data Structures', 'Communication', 'Core Programming']

    student_skills = profile.get('parsed_skills', [])
    resume_text = profile.get('resume_text', '')

    matched = []
    gaps = []
    for req in required_skills:
        is_match, matched_kws = match_required_skill(req, student_skills, resume_text)
        if is_match:
            matched.append({
                'skill': req,
                'matched_by': matched_kws,
            })
        else:
            importance = 'high' if any(w in req.lower() for w in ['dsa', 'algorithm', 'api', 'sql', 'system', 'core', 'code']) else 'medium'
            gaps.append({
                'skill': req,
                'importance': importance
            })

    total_req = len(required_skills)
    match_pct = round((len(matched) / total_req * 100)) if total_req > 0 else 100

    eligible, reason = is_eligible(master, drive)
    company = drive.get('company', 'Recruiter')
    role = drive.get('role', 'Candidate')

    advice = []
    if not eligible:
        advice.append(f"Eligibility note: {reason}")
    if gaps:
        top_gaps = [g['skill'] for g in gaps[:3]]
        advice.append(f"Targeted prep for {company}: Focus on {', '.join(top_gaps)} demanded by this JD.")
    else:
        advice.append(f"All core requirements matched for {company} ({role})! Polish system design and mock interviews.")

    verified_projects = [p for p in profile.get('projects', []) if (isinstance(p, dict) and p.get('verified'))]
    if not verified_projects:
        advice.append(f"Link a verified GitHub repository in your profile to strengthen your candidacy for {company}.")
    else:
        advice.append(f"Be ready to walk interviewers through your verified codebase: {verified_projects[0].get('title', 'Project')}.")

    return {
        'drive_id': drive.get('id', ''),
        'company': company,
        'role': role,
        'ctc': drive.get('ctc', 0),
        'min_cgpa': drive.get('min_cgpa', 0),
        'eligible': eligible,
        'eligibility_reason': reason,
        'total_required': total_req,
        'match_percentage': match_pct,
        'matched_skills': matched,
        'missing_skills': gaps,
        'company_advice': advice,
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


@router.post('/students/skill-gap')
@router.get('/students/skill-gap')
def student_company_skill_gap(
    drive_id: str | None = None,
    company: str | None = None,
    payload: SkillGapAnalysisQuery | None = None,
    user: dict = Depends(require_role('student'))
):
    master, profile = _student_records(user)
    active_drives = find_many('drives')
    valid_drives = [
        d for d in active_drives
        if d.get('status') not in {'drive_rejected'} and d.get('company')
    ]

    target_id = (payload.drive_id if payload and payload.drive_id else None) or drive_id
    target_comp = (payload.company_name if payload and payload.company_name else None) or company

    selected_drive = None
    if target_id:
        selected_drive = find_one('drives', {'id': target_id})
    elif target_comp:
        t_clean = target_comp.strip().lower()
        for d in valid_drives:
            if t_clean in d.get('company', '').lower():
                selected_drive = d
                break

    if not selected_drive and valid_drives:
        selected_drive = valid_drives[0]

    available_summary = [
        {
            'id': d.get('id', ''),
            'company': d.get('company', ''),
            'role': d.get('role', ''),
            'ctc': d.get('ctc', 0),
            'date': d.get('date', ''),
        }
        for d in valid_drives
    ]

    if not selected_drive:
        return {
            'drive_id': '',
            'company': 'Campus Placement Benchmark',
            'role': 'Software Engineering',
            'ctc': 0,
            'min_cgpa': 7.0,
            'eligible': True,
            'eligibility_reason': 'No active campus drives found yet.',
            'total_required': 0,
            'match_percentage': 100,
            'matched_skills': [],
            'missing_skills': [],
            'company_advice': ['Upload your resume and monitor the Eligible Drives tab as recruiters schedule visits.'],
            'available_drives': []
        }

    res = compute_company_skill_gap(master, profile, selected_drive)
    res['available_drives'] = available_summary
    return res


@router.get('/students/drives')
def student_drives(user: dict = Depends(require_role('student'))):
    master, _ = _student_records(user)
    drives = find_many('drives')
    apps = find_many('applications', {'student_id': master['id']})
    apps_by_drive = {app.get('drive_id'): app for app in apps}

    visible = []
    for drive in drives:
        if drive.get('status') not in {'open_for_optin','shortlist_published','admin_approved'}:
            continue
        ok, reason = is_eligible(master, drive)
        app = apps_by_drive.get(drive['id'])
        visible.append({
            **{key: value for key, value in drive.items() if key != 'jd_pdf_file_id'},
            'eligible': ok,
            'eligibility_reason': reason,
            'opted_in': app is not None,
            'application_id': app.get('id') if app else None,
            'application_status': app.get('status') if app else None,
            'application_flags': app.get('flags') if app else None,
            'fit_score': app.get('fit_score') if app else None,
            'matched_skills': app.get('matched_skills') if app else None,
            'missing_skills': app.get('missing_skills') if app else None,
        })
    return visible


@router.post('/admin/master-students/upload')
async def upload_master_students(file: UploadFile = File(...), admin: dict = Depends(require_role('admin'))):
    raw = await file.read()
    rows = []
    
    try:
        filename = (file.filename or '').lower()
        if filename.endswith('.xlsx'):
            # Load Excel workbook and parse rows
            wb = openpyxl.load_workbook(BytesIO(raw), data_only=True)
            sheet = wb.active
            if sheet is None:
                raise HTTPException(status_code=400, detail='Invalid Excel sheet.')
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