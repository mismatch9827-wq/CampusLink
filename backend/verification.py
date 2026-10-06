from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from auth import require_role
from db import find_many, find_one, update_one, log_action

router = APIRouter(tags=['verification'])


class DecisionBody(BaseModel):
    approve: bool


def run_verification(master: dict, profile: dict) -> list[dict]:
    flags: list[dict] = []
    claimed_cgpa = profile.get('resume_claimed_cgpa')
    if claimed_cgpa is not None and abs(float(claimed_cgpa) - float(master.get('cgpa', 0))) >= 0.05:
        flags.append({'level':'red','label':'CGPA mismatch','detail':f"Resume says {claimed_cgpa}; official master record says {master.get('cgpa')}."})
    resume = (profile.get('resume_text') or '').lower()
    project_text = ' '.join(profile.get('projects', [])).lower()
    weak_skills = [s for s in profile.get('parsed_skills', []) if s.lower() not in resume and s.lower() not in project_text]
    if weak_skills:
        flags.append({'level':'yellow','label':'Weak skill evidence','detail':f"No resume/project evidence found for: {', '.join(weak_skills[:4])}."})
    certs = profile.get('certificates', [])
    proofs = profile.get('certificate_proofs', [])
    if certs and len(proofs) < len(certs):
        flags.append({'level':'yellow','label':'Certificate proof pending','detail':'One or more listed certificates do not have a proof file or link.'})
    if not flags:
        flags.append({'level':'green','label':'Clean verification','detail':'Academic fields and available evidence are consistent.'})
    return flags


@router.get('/admin/verification')
def verification_queue(admin: dict = Depends(require_role('admin'))):
    apps = find_many('applications', {'status':'opted_in'})
    result=[]
    for app in apps:
        master=find_one('master_students', {'id':app['student_id']}) or {}
        profile=find_one('students', {'student_id':app['student_id']}) or {}
        flags=app.get('flags') or run_verification(master,profile)
        result.append({**app,'student_name':master.get('name','Unknown'),'branch':master.get('branch'), 'cgpa':master.get('cgpa'),'skills':profile.get('parsed_skills',[]),'flags':flags})
    return result


@router.post('/admin/applications/{application_id}/verify')
def verify_application(application_id: str, body: DecisionBody, admin: dict = Depends(require_role('admin'))):
    app=find_one('applications', {'id':application_id})
    if not app:
        raise HTTPException(status_code=404,detail='Application not found')
    if app.get('status')!='opted_in':
        raise HTTPException(status_code=409,detail='Only opted_in applications can be verified')
    new_status='verified' if body.approve else 'rejected'
    fields={'status':new_status,'verified_by':admin['id']}
    if body.approve:
        from ranking import score_application
        scored=score_application(app)
        fields.update({'fit_score':scored['fit_score'],'reasons':scored['reasons']})
    updated=update_one('applications', {'id':application_id}, fields)
    log_action(admin['id'], 'gate2_verify' if body.approve else 'gate2_reject', application_id, {'status':new_status})
    return updated
