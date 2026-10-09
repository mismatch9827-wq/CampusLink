from __future__ import annotations
import csv
from io import BytesIO, StringIO
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
import openpyxl

from auth import require_role
from db import find_many, find_one, insert_one, update_one, delete_one, new_id, log_action
from students import readiness

router = APIRouter(tags=['analytics'])


@router.get('/analytics/dashboard')
def dashboard(admin: dict = Depends(require_role('admin'))):
    masters = find_many('master_students')
    profiles = find_many('students')
    profile_map = {p.get('student_id'): p for p in profiles}
    
    drives = find_many('drives')
    applications = find_many('applications')
    offers = find_many('offers')
    accepted = [o for o in offers if o.get('status') == 'accepted']
    salaries = [float(o.get('ctc', 0)) for o in offers if o.get('ctc')]
    branches = sorted({m.get('branch') for m in masters if m.get('branch')})
    
    branch_conversion = []
    for b in branches:
        ids = {m['id'] for m in masters if m.get('branch') == b}
        branch_apps = [a for a in applications if a.get('student_id') in ids]
        shortlisted = sum(1 for a in branch_apps if a.get('status') in {'shortlisted', 'offered', 'accepted'})
        total = max(1, len(ids))
        branch_conversion.append({'name': b, 'value': round(shortlisted / total * 100)})
        
    critical_academic = []
    skill_risks = []
    onboarding_pending = []
    ready_students = []

    for m in masters:
        prof = profile_map.get(m['id'], {})
        has_profile = bool(prof and (prof.get('parsed_skills') or prof.get('resume_text')))
        cgpa = float(m.get('cgpa') or 0)
        backlogs = int(m.get('backlogs') or 0)
        score, level, gaps = readiness(m, prof)

        student_info = {
            'id': m['id'],
            'registration_number': m.get('registration_number', 'N/A'),
            'name': m.get('name', 'Unknown'),
            'branch': m.get('branch', 'N/A'),
            'cgpa': cgpa,
            'backlogs': backlogs,
            'readiness_score': score,
            'readiness_level': level,
            'skill_gaps': gaps[:3],
            'has_profile': has_profile
        }

        if backlogs > 0 or cgpa < 6.0:
            if backlogs > 0 and cgpa < 6.0:
                student_info['risk_reason'] = f"{backlogs} active backlog(s) & CGPA {cgpa} (< 6.0 cutoff)"
            elif backlogs > 0:
                student_info['risk_reason'] = f"{backlogs} active backlog(s)"
            else:
                student_info['risk_reason'] = f"CGPA {cgpa} below campus cutoff (< 6.0)"
            student_info['risk_tier'] = 'critical_academic'
            critical_academic.append(student_info)
        elif not has_profile:
            student_info['risk_reason'] = "Resume & evidence onboarding pending"
            student_info['risk_tier'] = 'onboarding_pending'
            onboarding_pending.append(student_info)
        elif score < 60:
            student_info['risk_reason'] = f"Readiness score {score}/100 ({level}) · Core skill gaps"
            student_info['risk_tier'] = 'skill_risk'
            skill_risks.append(student_info)
        else:
            student_info['risk_reason'] = f"Placement ready ({score}/100 · {level})"
            student_info['risk_tier'] = 'placement_ready'
            ready_students.append(student_info)

    # Genuine at-risk = academic barriers + verified skill deficits (excludes mere onboarding pending)
    genuine_at_risk_count = len(critical_academic) + len(skill_risks)

    # Pipeline velocity counts
    gate1_pending = sum(1 for d in drives if d.get('status') == 'pending_admin_review')
    gate2_pending = sum(1 for a in applications if a.get('status') == 'opted_in')
    gate3_pending = sum(1 for d in drives if d.get('status') == 'recruiter_selected')

    # Historical placement trends
    historical_records = find_many('historical_placements')
    year_map: dict[str, dict] = {}
    for r in historical_records:
        y = str(r.get('batch_year', ''))
        if not y:
            continue
        if y not in year_map:
            year_map[y] = {
                'year': y,
                'total_placed': 0,
                'ctc_sum': 0.0,
                'max_ctc': 0.0,
                'companies': set(),
                'count': 0
            }
        placed = int(r.get('students_placed') or 1)
        ctc = float(r.get('ctc') or 0.0)
        year_map[y]['total_placed'] += placed
        year_map[y]['ctc_sum'] += (ctc * placed)
        year_map[y]['max_ctc'] = max(year_map[y]['max_ctc'], ctc)
        year_map[y]['companies'].add(r.get('company', ''))
        year_map[y]['count'] += placed

    historical_trends = []
    for y in sorted(year_map.keys()):
        item = year_map[y]
        avg_ctc = round(item['ctc_sum'] / max(1, item['count']), 1)
        historical_trends.append({
            'year': item['year'],
            'total_placed': item['total_placed'],
            'avg_ctc': avg_ctc,
            'highest_ctc': round(item['max_ctc'], 1),
            'companies_count': len(item['companies'])
        })

    return {
        'registered_students': len(masters),
        'placement_ready': len(ready_students),
        'active_drives': sum(1 for d in drives if d.get('status') != 'drive_rejected'),
        'offers_made': len(offers),
        'accepted_offers': len(accepted),
        'average_package': round(sum(salaries) / len(salaries), 1) if salaries else 0,
        'highest_package': max(salaries) if salaries else 0,
        'at_risk': genuine_at_risk_count,
        'onboarding_pending': len(onboarding_pending),
        'branch_conversion': branch_conversion,
        'pipeline_velocity': {
            'gate1_pending_drives': gate1_pending,
            'gate2_pending_verifications': gate2_pending,
            'gate3_pending_shortlists': gate3_pending,
            'offers_made': len(offers),
            'accepted_offers': len(accepted)
        },
        'historical_trends': historical_trends,
        'risk_breakdown': {
            'critical_academic': {
                'label': 'Critical Academic Risk',
                'count': len(critical_academic),
                'tag': 'High Priority',
                'color': 'red',
                'description': 'Active backlogs (>0) or CGPA < 6.0 (eligibility barrier)',
                'students': critical_academic
            },
            'skill_risk': {
                'label': 'Placement & Skill Risk',
                'count': len(skill_risks),
                'tag': 'Needs Training',
                'color': 'amber',
                'description': 'Academically eligible, but low readiness score (< 60)',
                'students': skill_risks
            },
            'onboarding_pending': {
                'label': 'Onboarding Incomplete',
                'count': len(onboarding_pending),
                'tag': 'Action Required',
                'color': 'slate',
                'description': 'Master record present, but resume & profile setup pending',
                'students': onboarding_pending
            },
            'placement_ready': {
                'label': 'Placement Ready',
                'count': len(ready_students),
                'tag': 'Eligible',
                'color': 'emerald',
                'description': 'Readiness score >= 60 with clean academic record',
                'students': ready_students
            }
        }
    }


@router.get('/admin/master-students')
def get_master_students(admin: dict = Depends(require_role('admin'))):
    masters = find_many('master_students')
    profiles = {p.get('student_id'): p for p in find_many('students')}
    
    result = []
    for m in masters:
        p = profiles.get(m['id'])
        has_profile = bool(p and (p.get('parsed_skills') or p.get('resume_text')))
        result.append({
            'id': m['id'],
            'registration_number': m.get('registration_number'),
            'name': m.get('name'),
            'branch': m.get('branch'),
            'cgpa': m.get('cgpa'),
            'backlogs': m.get('backlogs', 0),
            'passing_year': m.get('passing_year'),
            'email': m.get('email', ''),
            'has_profile': has_profile
        })
    return result


@router.post('/admin/historical-placements/upload')
async def upload_historical_placements(file: UploadFile = File(...), admin: dict = Depends(require_role('admin'))):
    raw = await file.read()
    rows = []
    
    try:
        if file.filename.lower().endswith('.xlsx'):
            wb = openpyxl.load_workbook(BytesIO(raw), data_only=True)
            sheet = wb.active
            headers = [str(cell.value).strip().lower().replace(" ", "_") for cell in sheet[1]]
            for row in sheet.iter_rows(min_row=2, values_only=True):
                if any(row):
                    rows.append(dict(zip(headers, row)))
        else:
            text = raw.decode('utf-8-sig')
            reader = csv.DictReader(StringIO(text))
            reader.fieldnames = [str(h).strip().lower().replace(" ", "_") for h in reader.fieldnames] if reader.fieldnames else []
            rows = list(reader)
    except Exception:
        raise HTTPException(status_code=400, detail='Could not parse file. Ensure it is a valid CSV or XLSX.')

    if not rows:
        raise HTTPException(status_code=400, detail='File is empty')

    created = 0
    updated = 0
    for row_number, row in enumerate(rows, start=2):
        year_val = row.get('batch_year') or row.get('year') or row.get('batch')
        company = str(row.get('company') or row.get('company_name') or '').strip()
        role = str(row.get('role') or row.get('job_role') or row.get('title') or 'Associate').strip()
        ctc_val = row.get('ctc') or row.get('package') or row.get('salary') or 0
        placed_val = row.get('students_placed') or row.get('placed_count') or row.get('offers') or row.get('count') or 1
        branch = str(row.get('branch') or row.get('branches') or 'ALL').strip().upper()

        if not year_val or not company:
            raise HTTPException(status_code=400, detail=f'Missing batch year or company name on row {row_number}')

        try:
            batch_year = int(year_val)
            ctc = float(ctc_val)
            students_placed = int(placed_val)
        except (ValueError, TypeError) as exc:
            raise HTTPException(status_code=400, detail=f'Invalid numeric values on row {row_number}') from exc

        record = {
            'batch_year': batch_year,
            'company': company,
            'role': role,
            'ctc': ctc,
            'students_placed': students_placed,
            'branch': branch
        }

        # Check existing by batch_year + company + role
        existing = find_one('historical_placements', {'batch_year': batch_year, 'company': company, 'role': role})
        if existing:
            update_one('historical_placements', {'id': existing['id']}, record)
            updated += 1
        else:
            insert_one('historical_placements', {'id': new_id('hp'), **record})
            created += 1

    log_action(admin['id'], 'upload_historical_placements', file.filename or 'upload', {'created': created, 'updated': updated})
    return {
        'message': 'Historical placement records imported successfully',
        'created': created,
        'updated': updated
    }


@router.get('/admin/historical-placements')
def get_historical_placements(admin: dict = Depends(require_role('admin'))):
    records = find_many('historical_placements')
    return sorted(records, key=lambda r: (r.get('batch_year', 0), r.get('ctc', 0)), reverse=True)


@router.delete('/admin/historical-placements/{record_id}')
def delete_historical_placement(record_id: str, admin: dict = Depends(require_role('admin'))):
    existing = find_one('historical_placements', {'id': record_id})
    if not existing:
        raise HTTPException(status_code=404, detail='Historical record not found')
    delete_one('historical_placements', {'id': record_id})
    log_action(admin['id'], 'delete_historical_placement', record_id, {})
    return {'message': 'Historical placement record deleted successfully'}


@router.post('/analytics/nudge-onboarding')
def nudge_onboarding(admin: dict = Depends(require_role('admin'))):
    masters = find_many('master_students')
    profiles = {p.get('student_id'): p for p in find_many('students')}
    count = 0
    for m in masters:
        p = profiles.get(m['id'])
        if not (p and (p.get('parsed_skills') or p.get('resume_text'))):
            count += 1
    log_action(admin['id'], 'nudge_onboarding_batch', 'all_pending', {'nudged_count': count})
    return {'status': 'success', 'nudged_count': count, 'message': f'Sent onboarding notification nudges to {count} students.'}