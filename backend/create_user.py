from __future__ import annotations

from getpass import getpass

from auth import hash_password
from db import find_one, insert_one, new_id


def main() -> None:
    role = input('Account role (admin/recruiter): ').strip().lower()
    if role not in {'admin', 'recruiter'}:
        raise ValueError('Role must be admin or recruiter')

    name = input('Name: ').strip()
    email = input('Email: ').strip().lower()
    if not name or not email:
        raise ValueError('Name and email are required')
    if find_one('users', {'email': email}):
        raise ValueError('An account with that email already exists')

    password = getpass('Password (at least 12 characters): ')
    confirmation = getpass('Confirm password: ')
    if len(password) < 12:
        raise ValueError('Password must be at least 12 characters')
    if password != confirmation:
        raise ValueError('Passwords do not match')

    insert_one('users', {
        'id': new_id('u'),
        'email': email,
        'password_hash': hash_password(password),
        'role': role,
        'name': name,
    })
    print(f'Created {role} account for {email}')


if __name__ == '__main__':
    try:
        main()
    except ValueError as error:
        raise SystemExit(str(error)) from error