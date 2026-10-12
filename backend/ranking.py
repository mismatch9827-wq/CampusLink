from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from auth import require_role
from db import find_many, find_one, update_one, log_action
from ai_tools import get_semantic_similarity, generate_explanation, semantic_match_skills
from students import match_required_skill

router = APIRouter(tags=['ranking'])


class SelectBody(BaseModel):
    application_ids: list[str]


def score_application(app: dict) -> dict:
    drive = find_one('drives', {'id': app['drive_id']}) or {}
    master = find_one('master_students', {'id': app['student_id']}) or {}
    profile = find_one('students', {'student_id': app['student_id']}) or {}

    required_skills = drive.get('required_skills', [])
    student_skills = profile.get('parsed_skills', [])
    resume_text = profile.get('resume_text', '')

    # --- ENGINE 5: Genuine Semantic Embedding Similarity via Gemini Vectors ---
    match_result = semantic_match_skills(student_skills, required_skills, resume_text)
    matched_skills = match_result['matched_skills']
    missing_skills = match_result['missing_skills']
    similarity = match_result['similarity']
    match_provider = match_result.get('match_provider', 'deterministic_fallback')
    match_details = match_result.get('match_details', [])

    skill_score = round(similarity * 100, 1)

    evidence = min(100, len(profile.get('projects', [])) * 28 + len(profile.get('certificates', [])) * 12)
    assessment = (float(master.get('mock_interview') or 0) + float(master.get('aptitude') or 0)) / 2
    cgpa = min(100, float(master.get('cgpa', 0)) * 10)
    fit = round(skill_score * 0.40 + evidence * 0.20 + assessment * 0.25 + cgpa * 0.15, 1)

    # --- ENGINE 6: Natural Language Explanation via Gemini ---
    reasons = generate_explanation(
        role=drive.get('role', 'Candidate Role'),
        score=fit,
        matched=matched_skills if matched_skills else student_skills[:5],
        missing=missing_skills,
        projects=len(profile.get('projects', []))
    )

    return {
        'fit_score': fit,
        'reasons': reasons,
        'matched_skills': matched_skills,
        'missing_skills': missing_skills,
        'match_provider': match_provider,
        'match_details': match_details,
    }


@router.get('/recruiter/drives/{drive_id}/ranked')
def ranked(drive_id: str, recruiter: dict = Depends(require_role('recruiter'))):
    drive = find_one('drives', {'id': drive_id})
    if not drive:
        raise HTTPException(status_code=404, detail='Drive not found')
    if drive.get('recruiter_id') != recruiter['id']:
        raise HTTPException(status_code=403, detail='You can only view your own drive')
    apps = find_many('applications', {'drive_id': drive_id})
    out = []
    for app in apps:
        if app.get('status') not in {'verified', 'selected_by_recruiter', 'shortlisted'}:
            continue

        # ONLY call the AI if this application hasn't been scored yet
        if app.get('fit_score') is None:
            scored = score_application(app)
            update_one('applications', {'id': app['id']}, {
                'fit_score': scored['fit_score'],
                'reasons': scored['reasons'],
                'matched_skills': scored.get('matched_skills', []),
                'missing_skills': scored.get('missing_skills', []),
                'match_provider': scored.get('match_provider', 'deterministic_fallback'),
            })
            # Attach the new scores to the current object so they render immediately
            app['fit_score'] = scored['fit_score']
            app['reasons'] = scored['reasons']
            app['matched_skills'] = scored.get('matched_skills', [])
            app['missing_skills'] = scored.get('missing_skills', [])
            app['match_provider'] = scored.get('match_provider', 'deterministic_fallback')

        master = find_one('master_students', {'id': app['student_id']}) or {}
        profile = find_one('students', {'student_id': app['student_id']}) or {}

        out.append({
            **app,
            'matched_skills': app.get('matched_skills', []),
            'missing_skills': app.get('missing_skills', []),
            'match_provider': app.get('match_provider', 'deterministic_fallback'),
            'student_name': master.get('name'),
            'branch': master.get('branch'),
            'cgpa': master.get('cgpa'),
            'skills': profile.get('parsed_skills', [])
        })
    return sorted(out, key=lambda x: x.get('fit_score', 0), reverse=True)


@router.post('/recruiter/drives/{drive_id}/select')
def select_candidates(drive_id: str, body: SelectBody, recruiter: dict = Depends(require_role('recruiter'))):
    drive=find_one('drives', {'id':drive_id})
    if not drive:
        raise HTTPException(status_code=404,detail='Drive not found')
    if drive.get('recruiter_id')!=recruiter['id']:
        raise HTTPException(status_code=403,detail='You can only select candidates for your own drive')
    if len(body.application_ids)>50:
        raise HTTPException(status_code=400,detail='Maximum 50 candidates can be selected')
    valid=[]
    for app_id in body.application_ids:
        app=find_one('applications', {'id':app_id})
        if not app or app.get('drive_id')!=drive_id or app.get('status')!='verified':
            raise HTTPException(status_code=409,detail=f'Application {app_id} is not verified for this drive')
        valid.append(app)
    for app in valid:
        update_one('applications', {'id':app['id']}, {'status':'selected_by_recruiter'})
    update_one('drives', {'id':drive_id}, {'status':'recruiter_selected','selected_count':len(valid)})
    log_action(recruiter['id'], 'recruiter_select', drive_id, {'selected_count':len(valid)})
    return {'message':'Selection sent to Gate 3','selected_count':len(valid)}
