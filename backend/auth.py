from __future__ import annotations

import base64
import hashlib
import hmac
import os
import re
import secrets
from datetime import datetime, timedelta, timezone
from typing import Callable, Literal

import jwt  # PyJWT
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from passlib.context import CryptContext
from pydantic import BaseModel, Field
from pymongo.errors import DuplicateKeyError

from db import count, delete_many, find_one, insert_one, update_one, new_id

router = APIRouter(prefix='/auth', tags=['auth'])

# Security Configuration
SECRET_KEY = os.getenv('JWT_SECRET')
if not SECRET_KEY:
    raise RuntimeError('JWT_SECRET must be set in the environment')
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 600

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac('sha256', password.encode(), salt, 180_000)
    return f'pbkdf2_sha256${base64.b64encode(salt).decode()}${base64.b64encode(digest).decode()}'


def verify_password(plain_password: str, hashed_password: str) -> bool:
    if not hashed_password:
        return False
    if hashed_password.startswith('pbkdf2_sha256$'):
        try:
            _, salt_b64, digest_b64 = hashed_password.split('$', 2)
            salt = base64.b64decode(salt_b64)
            expected = base64.b64decode(digest_b64)
            actual = hashlib.pbkdf2_hmac('sha256', plain_password.encode(), salt, 180_000)
            return hmac.compare_digest(actual, expected)
        except Exception:
            return False
    try:
        return pwd_context.verify(plain_password, hashed_password)
    except Exception:
        return False


def create_access_token(data: dict) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


def create_token(user: dict) -> str:
    return create_access_token({"sub": user['id']})


async def get_current_user(token: str = Depends(oauth2_scheme)) -> dict:
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id: str | None = payload.get("sub")
        if user_id is None:
            raise HTTPException(status_code=401, detail="Invalid token")
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    user = find_one('users', {'id': user_id})
    if user is None:
        raise HTTPException(status_code=401, detail="User not found")
    return user


class LoginBody(BaseModel):
    identifier: str | None = None  # Accepts Email OR Registration Number
    email: str | None = None       # Frontend compatibility
    password: str
    role: Literal['student', 'recruiter', 'admin'] | None = None


class RegisterBody(BaseModel):
    role: Literal['student', 'recruiter', 'admin']
    identifier: str = Field(min_length=1, max_length=254)
    password: str = Field(min_length=8, max_length=128)
    name: str | None = Field(default=None, max_length=120)


def _auth_response(user: dict) -> dict:
    return {
        'access_token': create_access_token({"sub": user['id']}),
        'token_type': 'bearer',
        'role': user['role'],
        'name': user['name'],
    }


@router.post('/register')
def register(body: RegisterBody):
    ident = body.identifier.strip()
    if not ident:
        raise HTTPException(status_code=400, detail='Email or Registration Number is required')

    if body.role == 'student':
        master = (
            find_one('master_students', {'registration_number': ident.upper()}) or
            find_one('master_students', {'email': ident.lower()})
        )
        if not master:
            raise HTTPException(status_code=403, detail='Student record not found. Contact the placement cell.')
        registration_number = master['registration_number']
        existing_student = find_one('users', {'registration_number': registration_number})
        if existing_student or master.get('user_id'):
            raise HTTPException(status_code=409, detail='An account already exists for this student.')
        existing_email = find_one('users', {'email': master['email'].strip().lower()}) if master.get('email') else None
        if existing_email:
            owner_role = existing_email.get('role', 'another user')
            raise HTTPException(
                status_code=409,
                detail=f'This roster email is already used by a {owner_role} account. The placement cell must update this student to a unique email.',
            )
        user = {
            'id': new_id('u'),
            'password_hash': hash_password(body.password),
            'role': 'student',
            'name': master['name'],
            'registration_number': registration_number,
        }
        if master.get('email'):
            user['email'] = master['email'].strip().lower()
        insert_one('users', user)
        update_one('master_students', {'id': master['id']}, {'user_id': user['id']})
        return _auth_response(user)

    email = ident.lower()
    if not re.fullmatch(r'[^@\s]+@[^@\s]+\.[^@\s]+', email):
        raise HTTPException(status_code=400, detail='Enter a valid email address')
    name = (body.name or '').strip()
    if not name:
        raise HTTPException(status_code=400, detail='Name is required')
    if find_one('users', {'email': email}):
        raise HTTPException(status_code=409, detail='An account already exists for this email.')

    if body.role == 'admin':
        try:
            insert_one('system_flags', {'_id': 'admin_bootstrap'})
        except DuplicateKeyError as exc:
            raise HTTPException(status_code=409, detail='The initial placement-cell account has already been created.') from exc
        if count('users', {'role': 'admin'}):
            delete_many('system_flags', {'_id': 'admin_bootstrap'})
            raise HTTPException(status_code=409, detail='A placement-cell account already exists. Contact an administrator.')

    user = {
        'id': new_id('u'),
        'email': email,
        'password_hash': hash_password(body.password),
        'role': body.role,
        'name': name,
    }
    try:
        insert_one('users', user)
    except Exception:
        if body.role == 'admin':
            delete_many('system_flags', {'_id': 'admin_bootstrap'})
        raise
    return _auth_response(user)


def require_role(*roles: str) -> Callable:
    def dependency(user: dict = Depends(get_current_user)) -> dict:
        if user.get('role') not in roles:
            raise HTTPException(status_code=403, detail=f'Requires role: {", ".join(roles)}')
        return user
    return dependency


@router.post('/login')
def login(body: LoginBody):
    ident = (body.identifier or body.email or '').strip()
    if not ident:
        raise HTTPException(status_code=400, detail='Email or Registration Number is required')

    # 1. Check if user already exists (by email or registration number)
    user = (
        find_one('users', {'email': ident.lower()}) or
        find_one('users', {'registration_number': ident.upper()})
    )

    if user:
        if not verify_password(body.password, user.get('password_hash', '')):
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail='Invalid credentials')
    else:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail='Account not found. Create an account first.')

    if body.role and user.get('role') != body.role:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail='This account belongs to a different role.')

    return _auth_response(user)


@router.get('/me')
def me(user: dict = Depends(get_current_user)):
    return {k: v for k, v in user.items() if k != 'password_hash'}