import type { Role } from './types'

const TOKEN_KEY = 'campuslink_token'
const ROLE_KEY = 'campuslink_role'
const NAME_KEY = 'campuslink_name'

export function saveAuth(token: string, role: Role, name = '') {
  if (typeof window === 'undefined') return
  localStorage.setItem(TOKEN_KEY, token)
  localStorage.setItem(ROLE_KEY, role)
  localStorage.setItem(NAME_KEY, name)
}

export function getToken() {
  if (typeof window === 'undefined') return ''
  return localStorage.getItem(TOKEN_KEY) || ''
}

export function getRole(): Role | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem(ROLE_KEY) as Role | null
}

export function getName() {
  if (typeof window === 'undefined') return ''
  return localStorage.getItem(NAME_KEY) || ''
}

export function clearAuth() {
  if (typeof window === 'undefined') return
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(ROLE_KEY)
  localStorage.removeItem(NAME_KEY)
}
