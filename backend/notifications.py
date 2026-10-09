from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

from auth import get_current_user
from db import find_many, find_one, update_one

router = APIRouter(tags=['notifications'])


@router.get('/notifications')
def notifications(user: dict = Depends(get_current_user)):
    notes=find_many('notifications')
    if user['role']=='admin':return notes
    if user['role']=='student':
        master=find_one('master_students', {'registration_number':user.get('registration_number')}) or {}
        return [n for n in notes if n.get('student_id')==master.get('id') or n.get('user_id')==user['id']]
    return [n for n in notes if n.get('user_id')==user['id']]


@router.post('/notifications/{notification_id}/read')
def mark_read(notification_id: str, user: dict = Depends(get_current_user)):
    note=find_one('notifications', {'id':notification_id})
    if not note:raise HTTPException(status_code=404,detail='Notification not found')
    owns_note = note.get('user_id') == user['id']
    if user['role'] == 'student' and not owns_note:
        master=find_one('master_students', {'registration_number':user.get('registration_number')}) or {}
        owns_note = note.get('student_id') == master.get('id')
    if user['role'] != 'admin' and not owns_note:
        raise HTTPException(status_code=403, detail='You can only update your own notifications')
    return update_one('notifications', {'id':notification_id}, {'read':True})
