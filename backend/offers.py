from __future__ import annotations

import math
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
    ctc: float | None = None


VALID_OFFER_STATUSES = {'offered', 'accepted', 'deferred', 'withdrawn'}

ROLE_STATUS_TRANSITIONS: dict[str, dict[str, set[str]]] = {
    'student': {
        'offered': {'accepted', 'deferred'},
        'deferred': {'accepted'},
        'accepted': set(),  # terminal for student
        'withdrawn': set(),  # terminal
    },
    'recruiter': {
        'offered': {'withdrawn'},
        'deferred': {'accepted', 'withdrawn'},
        'accepted': {'withdrawn'},
        'withdrawn': set(),  # terminal
    },
    'admin': {
        'offered': {'accepted', 'deferred', 'withdrawn'},
        'deferred': {'accepted', 'withdrawn'},
        'accepted': {'withdrawn'},
        'withdrawn': set(),  # terminal
    },
}


@router.post('/offers')
def create_offer(body: OfferCreate, user: dict = Depends(require_role('recruiter', 'admin'))):
    # 1. Validate CTC is a valid non-negative number
    if body.ctc is None or not math.isfinite(body.ctc) or body.ctc < 0:
        raise HTTPException(status_code=400, detail='CTC must be a valid non-negative number')

    # 2. Check application exists and is shortlisted
    app = find_one('applications', {'id': body.application_id})
    if not app:
        raise HTTPException(status_code=404, detail='Application not found')
    if app.get('status') != 'shortlisted':
        raise HTTPException(status_code=409, detail='Offer can only be created for shortlisted applications')

    # 3. Prevent duplicate offers for the same application
    existing_offer = find_one('offers', {'application_id': body.application_id})
    if existing_offer:
        raise HTTPException(status_code=409, detail='An offer already exists for this application')

    # 4. Drive ownership check: recruiter may only create offers for their own drives
    drive = find_one('drives', {'id': app['drive_id']}) or {}
    if user['role'] == 'recruiter' and drive.get('recruiter_id') != user['id']:
        raise HTTPException(status_code=403, detail='You can only create offers for your own drives')

    student = find_one('master_students', {'id': app['student_id']}) or {}
    offer = {
        'id': new_id('o'),
        'application_id': app['id'],
        'company': drive.get('company'),
        'role': drive.get('role'),
        'student_id': app['student_id'],
        'student_name': student.get('name'),
        'ctc': body.ctc,
        'status': 'offered',
        'documents': '0/4',
        'joining_status': 'Awaiting acceptance'
    }
    insert_one('offers', offer)
    update_one('applications', {'id': app['id']}, {'status': 'offered'})
    log_action(user['id'], 'offer_created', offer['id'], {'application_id': app['id'], 'ctc': body.ctc})
    return offer


@router.get('/offers')
def list_offers(user: dict = Depends(get_current_user)):
    offers = find_many('offers')
    if user['role'] == 'admin':
        return offers
    if user['role'] == 'student':
        master = find_one('master_students', {'registration_number': user.get('registration_number')}) or {}
        return [o for o in offers if o.get('student_id') == master.get('id')]
    if user['role'] == 'recruiter':
        own_drive_ids = {d['id'] for d in find_many('drives', {'recruiter_id': user['id']})}
        app_ids = {a['id'] for a in find_many('applications') if a.get('drive_id') in own_drive_ids}
        return [o for o in offers if o.get('application_id') in app_ids]
    return []


@router.get('/offers/{offer_id}')
def get_offer(offer_id: str, user: dict = Depends(get_current_user)):
    offer = find_one('offers', {'id': offer_id})
    if not offer:
        raise HTTPException(status_code=404, detail='Offer not found')

    if user['role'] == 'admin':
        return offer

    if user['role'] == 'student':
        master = find_one('master_students', {'registration_number': user.get('registration_number')}) or {}
        if not master or offer.get('student_id') != master.get('id'):
            raise HTTPException(status_code=403, detail='You can only view your own offer')
        return offer

    if user['role'] == 'recruiter':
        app = find_one('applications', {'id': offer.get('application_id')}) or {}
        drive = find_one('drives', {'id': app.get('drive_id')}) or {}
        if drive.get('recruiter_id') != user['id']:
            raise HTTPException(status_code=403, detail='You can only view offers for your own drives')
        return offer

    raise HTTPException(status_code=403, detail='Unauthorized to view this offer')


@router.patch('/offers/{offer_id}')
def update_offer(offer_id: str, body: OfferUpdate, user: dict = Depends(get_current_user)):
    offer = find_one('offers', {'id': offer_id})
    if not offer:
        raise HTTPException(status_code=404, detail='Offer not found')

    app = find_one('applications', {'id': offer.get('application_id')}) or {}
    drive = find_one('drives', {'id': app.get('drive_id')}) or {}

    role = user.get('role')

    # 1. Ownership & Authorization checks
    if role == 'admin':
        pass
    elif role == 'recruiter':
        if drive.get('recruiter_id') != user['id']:
            raise HTTPException(status_code=403, detail='You can only update offers for your own drives')
    elif role == 'student':
        master = find_one('master_students', {'registration_number': user.get('registration_number')}) or {}
        if not master or offer.get('student_id') != master.get('id'):
            raise HTTPException(status_code=403, detail='You can only respond to your own offer')
    else:
        raise HTTPException(status_code=403, detail='Unauthorized role for offer updates')

    # 2. Extract and validate fields
    fields = {k: v for k, v in body.model_dump().items() if v is not None}
    if not fields:
        return offer

    current_status = offer.get('status', 'offered')

    # 3. Role-based field restrictions
    if role == 'student':
        # Students may only respond with a new status decision
        forbidden_fields = [k for k in ['documents', 'joining_status', 'ctc'] if getattr(body, k, None) is not None]
        if forbidden_fields:
            raise HTTPException(status_code=403, detail=f'Students are not permitted to edit {", ".join(forbidden_fields)}')
        if 'status' not in fields:
            raise HTTPException(status_code=400, detail='Student must specify a valid response status')
    else:
        # Recruiter / Admin: Validate CTC if provided
        if 'ctc' in fields:
            ctc_val = fields['ctc']
            if ctc_val is None or not math.isfinite(ctc_val) or ctc_val < 0:
                raise HTTPException(status_code=400, detail='CTC must be a valid non-negative number')

        # Recruiter / Admin: Cannot edit documents or joining_status on a withdrawn offer
        if current_status == 'withdrawn' and 'status' not in fields:
            raise HTTPException(status_code=400, detail='Cannot modify details of a withdrawn offer')

    # 4. Status Transition Validation
    target_status = fields.get('status')
    if target_status is not None:
        if target_status not in VALID_OFFER_STATUSES:
            raise HTTPException(status_code=400, detail=f'Invalid offer status: {target_status}')

        if target_status != current_status:
            allowed_transitions = ROLE_STATUS_TRANSITIONS.get(role, {}).get(current_status, set())
            if target_status not in allowed_transitions:
                raise HTTPException(
                    status_code=400,
                    detail=f"Invalid transition from '{current_status}' to '{target_status}' for role '{role}'"
                )

            # Auto-align joining_status if not explicitly customized
            if 'joining_status' not in fields:
                if target_status == 'accepted':
                    fields['joining_status'] = 'Offer accepted'
                elif target_status == 'deferred':
                    fields['joining_status'] = 'Deferred by student'
                elif target_status == 'withdrawn':
                    fields['joining_status'] = 'Offer withdrawn'

    # 5. Persist updates and sync application status
    updated = update_one('offers', {'id': offer_id}, fields)
    if target_status and target_status != current_status:
        update_one('applications', {'id': offer['application_id']}, {'status': target_status})
        log_action(user['id'], f'offer_status_{target_status}', offer_id, {'from': current_status, 'to': target_status})

    return updated

