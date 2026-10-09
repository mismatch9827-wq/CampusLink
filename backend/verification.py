from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from auth import require_role
from db import find_many, find_one, update_one, log_action

router = APIRouter(tags=['verification'])


class DecisionBody(BaseModel):
    approve: bool


import json
import re
import urllib.error
import urllib.request


def parse_github_repo(text: str) -> tuple[str, str] | None:
    if not isinstance(text, str):
        return None
    match = re.search(r'(?:https?://)?(?:www\.)?github\.com/([A-Za-z0-9_.-]+)/([A-Za-z0-9_.-]+)', text)
    if match:
        owner = match.group(1).strip()
        repo = match.group(2).rstrip('/').removesuffix('.git').strip()
        return owner, repo
    return None


def verify_github_project(url_or_text: str) -> dict:
    parsed = parse_github_repo(url_or_text)
    if not parsed:
        return {'verified': False, 'reason': 'No GitHub repository link provided', 'status': 'unlinked'}
    owner, repo = parsed
    api_url = f"https://api.github.com/repos/{owner}/{repo}"
    req = urllib.request.Request(api_url, headers={
        'User-Agent': 'CampusLink-Verification-Engine',
        'Accept': 'application/vnd.github.v3+json'
    })
    try:
        with urllib.request.urlopen(req, timeout=4) as resp:
            if resp.status == 200:
                data = json.loads(resp.read().decode('utf-8'))
                has_code = data.get('size', 0) > 0
                return {
                    'verified': has_code,
                    'owner': owner,
                    'repo': repo,
                    'url': f"https://github.com/{owner}/{repo}",
                    'language': data.get('language') or 'Code',
                    'stars': data.get('stargazers_count', 0),
                    'forks': data.get('forks_count', 0),
                    'size_kb': data.get('size', 0),
                    'status': 'verified' if has_code else 'empty_repo',
                    'description': data.get('description') or ''
                }
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return {'verified': False, 'reason': f'Repository {owner}/{repo} not found on GitHub', 'status': 'not_found'}
        return {'verified': False, 'reason': f'GitHub API returned HTTP {e.code}', 'status': 'api_error'}
    except Exception as e:
        return {'verified': False, 'reason': str(e), 'status': 'network_error'}
    return {'verified': False, 'reason': 'Unknown verification issue', 'status': 'unknown'}


def run_verification(master: dict, profile: dict) -> list[dict]:
    flags: list[dict] = []
    claimed_cgpa = profile.get('resume_claimed_cgpa')
    if claimed_cgpa is not None and abs(float(claimed_cgpa) - float(master.get('cgpa', 0))) >= 0.05:
        flags.append({'level':'red','label':'CGPA mismatch','detail':f"Resume says {claimed_cgpa}; official master record says {master.get('cgpa')}."})
    
    projects = profile.get('projects', [])
    project_text = ' '.join(p.get('title', '') if isinstance(p, dict) else str(p) for p in projects).lower()
    resume = (profile.get('resume_text') or '').lower()
    weak_skills = [s for s in profile.get('parsed_skills', []) if s.lower() not in resume and s.lower() not in project_text]
    if weak_skills:
        flags.append({'level':'yellow','label':'Weak skill evidence','detail':f"No resume/project evidence found for: {', '.join(weak_skills[:4])}."})

    # GitHub Project Evidence Check
    verified_projs = 0
    if projects:
        for p in projects:
            if isinstance(p, dict) and p.get('verified'):
                verified_projs += 1
            else:
                p_str = p.get('github_url', '') if isinstance(p, dict) else str(p)
                if parse_github_repo(p_str):
                    v = verify_github_project(p_str)
                    if v.get('verified'):
                        verified_projs += 1
        if verified_projs > 0:
            flags.append({
                'level': 'green',
                'label': 'GitHub projects verified',
                'detail': f"{verified_projs} of {len(projects)} project(s) verified via active GitHub code repositories."
            })
        else:
            flags.append({
                'level': 'yellow',
                'label': 'Projects unverified',
                'detail': 'Projects are self-declared. Link active GitHub repositories with real commits to verify original work.'
            })

    certs = profile.get('certificates', [])
    proofs = profile.get('certificate_proofs', [])
    if certs and len(proofs) < len(certs):
        flags.append({'level':'yellow','label':'Certificate proof pending','detail':'One or more listed certificates do not have a proof file or link.'})
    if not flags:
        flags.append({'level':'green','label':'Clean verification','detail':'Academic fields and available evidence are consistent.'})
    return flags


class BatchVerifyBody(BaseModel):
    application_ids: list[str]
    approve: bool


@router.get('/admin/verification')
def verification_queue(admin: dict = Depends(require_role('admin'))):
    apps = find_many('applications', {'status':'opted_in'})
    result=[]
    for app in apps:
        drive=find_one('drives', {'id':app.get('drive_id')}) or {}
        master=find_one('master_students', {'id':app['student_id']}) or {}
        profile=find_one('students', {'student_id':app['student_id']}) or {}
        flags=app.get('flags') or run_verification(master,profile)
        has_red = any(f.get('level') == 'red' for f in flags)
        has_cgpa_mismatch = any(f.get('label') == 'CGPA mismatch' for f in flags)
        # Link issues (missing cert proof or unverified repo links) are non-critical
        has_link_mismatch = any(f.get('label') in {'Certificate proof pending', 'Unverified project claims'} for f in flags)
        has_critical_mismatch = has_red or has_cgpa_mismatch
        has_mismatch = has_critical_mismatch or has_link_mismatch
        claimed_cgpa = profile.get('resume_claimed_cgpa')
        master_cgpa = master.get('cgpa')
        
        result.append({
            **app,
            'company': drive.get('company', 'Drive Company'),
            'role': drive.get('role', 'Candidate Role'),
            'ctc': drive.get('ctc', 0),
            'student_name': master.get('name','Unknown'),
            'branch': master.get('branch'),
            'cgpa': master_cgpa,
            'claimed_cgpa': claimed_cgpa,
            'skills': profile.get('parsed_skills',[]),
            'flags': flags,
            'has_red_flags': has_red,
            'has_cgpa_mismatch': has_cgpa_mismatch,
            'has_link_mismatch': has_link_mismatch,
            'has_critical_mismatch': has_critical_mismatch,
            'has_mismatch': has_mismatch,
            'is_clean': not has_critical_mismatch
        })
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
        scored = score_application(app)
        fields.update({
            'fit_score': scored['fit_score'],
            'reasons': scored['reasons'],
            'matched_skills': scored.get('matched_skills', []),
            'missing_skills': scored.get('missing_skills', [])
        })
    updated=update_one('applications', {'id':application_id}, fields)
    log_action(admin['id'], 'gate2_verify' if body.approve else 'gate2_reject', application_id, {'status':new_status})
    return updated


@router.post('/admin/applications/batch-verify')
def batch_verify_applications(body: BatchVerifyBody, admin: dict = Depends(require_role('admin'))):
    from ranking import score_application
    processed = []
    for app_id in body.application_ids:
        app = find_one('applications', {'id': app_id})
        if not app or app.get('status') != 'opted_in':
            continue
        new_status = 'verified' if body.approve else 'rejected'
        fields = {'status': new_status, 'verified_by': admin['id']}
        if body.approve:
            scored = score_application(app)
            fields.update({
                'fit_score': scored['fit_score'],
                'reasons': scored['reasons'],
                'matched_skills': scored.get('matched_skills', []),
                'missing_skills': scored.get('missing_skills', [])
            })
        update_one('applications', {'id': app_id}, fields)
        log_action(admin['id'], 'gate2_verify' if body.approve else 'gate2_reject', app_id, {'status': new_status})
        processed.append(app_id)
    return {'message': f'{len(processed)} applications processed', 'processed': processed}
