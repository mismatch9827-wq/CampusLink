from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from auth import get_current_user, require_role
from db import find_many, find_one, insert_one, new_id, update_one, log_action

router = APIRouter(tags=['offers'])


class OfferCreate(BaseModel):
    application_id: str
    ctc: float


class OfferUpdate(BaseModel):
    status: str | None = None
    documents: str | None = None
    joining_status: str | None = None


@router.post('/offers')
def create_offer(body: OfferCreate, user: dict = Depends(require_role('recruiter','admin'))):
    app=find_one('applications', {'id':body.application_id})
    if not app or app.get('status')!='shortlisted':
        raise HTTPException(status_code=409,detail='Offer can only be created for shortlisted applications')
    drive=find_one('drives', {'id':app['drive_id']}) or {}
    student=find_one('master_students', {'id':app['student_id']}) or {}
    offer={'id':new_id('o'),'application_id':app['id'],'company':drive.get('company'),'role':drive.get('role'),'student_id':app['student_id'],'student_name':student.get('name'),'ctc':body.ctc,'status':'offered','documents':'0/4','joining_status':'Awaiting acceptance'}
    insert_one('offers',offer);update_one('applications', {'id':app['id']}, {'status':'offered'})
    log_action(user['id'], 'offer_created', offer['id'], {'application_id':app['id']})
    return offer


@router.get('/offers')
def list_offers(user: dict = Depends(get_current_user)):
    offers=find_many('offers')
    if user['role']=='admin':return offers
    if user['role']=='student':
        master=find_one('master_students', {'registration_number':user.get('registration_number')}) or {}
        return [o for o in offers if o.get('student_id')==master.get('id')]
    own_drive_ids={d['id'] for d in find_many('drives', {'recruiter_id':user['id']})}
    app_ids={a['id'] for a in find_many('applications') if a.get('drive_id') in own_drive_ids}
    return [o for o in offers if o.get('application_id') in app_ids]


@router.patch('/offers/{offer_id}')
def update_offer(offer_id: str, body: OfferUpdate, user: dict = Depends(get_current_user)):
    offer=find_one('offers', {'id':offer_id})
    if not offer:raise HTTPException(status_code=404,detail='Offer not found')
    fields={k:v for k,v in body.model_dump().items() if v is not None}
    if 'status' in fields and fields['status'] not in {'offered','accepted','deferred','withdrawn'}:
        raise HTTPException(status_code=400,detail='Invalid offer status')
    if user['role']=='student':
        master=find_one('master_students', {'registration_number':user.get('registration_number')}) or {}
        if offer.get('student_id')!=master.get('id'):raise HTTPException(status_code=403,detail='Not your offer')
        fields={k:v for k,v in fields.items() if k=='status'}
    updated=update_one('offers', {'id':offer_id}, fields)
    if fields.get('status'):
        update_one('applications', {'id':offer['application_id']}, {'status':fields['status']})
    return updated
