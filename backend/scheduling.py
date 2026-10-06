from __future__ import annotations

from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from auth import require_role
from db import find_many, find_one, insert_one, new_id, update_one, log_action

router = APIRouter(tags=['scheduling'])


class ResolveBody(BaseModel):
    resolved_slot: str | None = None
    resolved_venue: str | None = None


def _parse_slot(slot: str):
    clean=slot.replace('–','-').replace('—','-')
    start,end=[x.strip() for x in clean.split('-',1)]
    return datetime.strptime(start,'%H:%M').time(), datetime.strptime(end,'%H:%M').time()


def _overlap(a: str,b: str) -> bool:
    try:
        a1,a2=_parse_slot(a);b1,b2=_parse_slot(b)
        return a1 < b2 and b1 < a2
    except Exception:
        return a==b


def conflicts_for_drive(drive_id: str) -> list[dict]:
    drive=find_one('drives', {'id':drive_id})
    if not drive:return []
    conflicts=[]
    selected={a['student_id'] for a in find_many('applications', {'drive_id':drive_id}) if a.get('status') in {'selected_by_recruiter','shortlisted'}}
    for other in find_many('drives'):
        if other['id']==drive_id or other.get('date')!=drive.get('date') or not _overlap(other.get('slot',''),drive.get('slot','')):
            continue
        if other.get('venue')==drive.get('venue'):
            conflicts.append({'type':'venue','with_drive':other['id'],'message':f"{drive.get('venue')} is double-booked with {other.get('company')}."})
        other_students={a['student_id'] for a in find_many('applications', {'drive_id':other['id']}) if a.get('status') in {'selected_by_recruiter','shortlisted'}}
        clash=sorted(selected & other_students)
        if clash:
            conflicts.append({'type':'student','with_drive':other['id'],'students':clash,'message':f"{len(clash)} selected student(s) are booked in both drives."})
    return conflicts


@router.get('/admin/shortlists')
def get_shortlists(admin: dict = Depends(require_role('admin'))):
    drives = find_many('drives', {'status': 'recruiter_selected'})
    out = []
    for d in drives:
        selected = find_many('applications', {'drive_id': d['id'], 'status': 'selected_by_recruiter'})
        confs = conflicts_for_drive(d['id'])
        detail = (
            confs[0]['message'] if confs else 'No student, venue or panel conflicts detected.'
        )
        out.append({
            'id': d['id'],
            'company': d.get('company'),
            'role': d.get('role'),
            'count': len(selected) or d.get('selected_count', 0),
            'status': d.get('status'),
            'conflicts': len(confs),
            'detail': detail,
            'suggested_slot': '14:00–16:00' if confs else None
        })
    return out


@router.get('/admin/drives/{drive_id}/conflicts')
def get_conflicts(drive_id: str, admin: dict = Depends(require_role('admin'))):
    return {'drive_id':drive_id,'conflicts':conflicts_for_drive(drive_id)}



@router.post('/admin/drives/{drive_id}/approve-shortlist')
def approve_shortlist(drive_id: str, body: ResolveBody | None = None, admin: dict = Depends(require_role('admin'))):
    drive=find_one('drives', {'id':drive_id})
    if not drive:raise HTTPException(status_code=404,detail='Drive not found')
    if drive.get('status')!='recruiter_selected':raise HTTPException(status_code=409,detail='Drive must be recruiter_selected before Gate 3')
    if body and (body.resolved_slot or body.resolved_venue):
        update={}
        if body.resolved_slot:update['slot']=body.resolved_slot
        if body.resolved_venue:update['venue']=body.resolved_venue
        update_one('drives', {'id':drive_id}, update)
    conflicts=conflicts_for_drive(drive_id)
    if conflicts:
        raise HTTPException(status_code=409,detail={'message':'Conflicts must be resolved before publishing','conflicts':conflicts,'suggested_slot':'14:00–16:00'})
    selected=[a for a in find_many('applications', {'drive_id':drive_id}) if a.get('status')=='selected_by_recruiter']
    for app in selected:
        update_one('applications', {'id':app['id']}, {'status':'shortlisted'})
        master=find_one('master_students', {'id':app['student_id']}) or {}
        insert_one('notifications', {'id':new_id('n'),'user_id':master.get('user_id'),'student_id':app['student_id'],'message':f"Shortlisted for {drive['company']} · {drive['role']}",'read':False})
    update_one('drives', {'id':drive_id}, {'status':'shortlist_published','gate3_by':admin['id']})
    log_action(admin['id'], 'gate3_publish', drive_id, {'shortlisted_count':len(selected)})
    return {'message':'Shortlist published','count':len(selected)}
