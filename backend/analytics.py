from __future__ import annotations
from fastapi import APIRouter, Depends

from auth import require_role
from db import find_many
from students import readiness

router = APIRouter(tags=['analytics'])

@router.get('/analytics/dashboard')
def dashboard(admin: dict = Depends(require_role('admin'))):
    masters = find_many('master_students')
    profiles = find_many('students')
    profile_map = {p.get('student_id'): p for p in profiles}
    
    ready = 0
    at_risk = 0
    
    drives = find_many('drives')
    offers = find_many('offers')
    accepted = [o for o in offers if o.get('status') == 'accepted']
    salaries = [float(o.get('ctc', 0)) for o in offers if o.get('ctc')]
    branches = sorted({m.get('branch') for m in masters if m.get('branch')})
    
    branch_conversion = []
    for b in branches:
        ids = {m['id'] for m in masters if m.get('branch') == b}
        branch_apps = [a for a in find_many('applications') if a.get('student_id') in ids]
        shortlisted = sum(1 for a in branch_apps if a.get('status') in {'shortlisted', 'offered', 'accepted'})
        total = max(1, len(ids))
        branch_conversion.append({'name': b, 'value': round(shortlisted / total * 100)})
        
    for m in masters:
        score, _, _ = readiness(m, profile_map.get(m['id'], {}))
        if score >= 60:
            ready += 1
        else:
            at_risk += 1

    return {
        'registered_students': len(masters),
        'placement_ready': ready,
        'active_drives': sum(1 for d in drives if d.get('status') != 'drive_rejected'),
        'offers_made': len(offers),
        'accepted_offers': len(accepted),
        'average_package': round(sum(salaries) / len(salaries), 1) if salaries else 0,
        'highest_package': max(salaries) if salaries else 0,
        'at_risk': at_risk,
        'branch_conversion': branch_conversion,
    }