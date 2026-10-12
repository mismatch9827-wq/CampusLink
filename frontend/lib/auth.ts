import type { Role } from './types'

const TOKEN_KEY = 'campusconnect_token'
const ROLE_KEY = 'campusconnect_role'
const NAME_KEY = 'campusconnect_name'

const LEGACY_TOKEN_KEY = 'campuslink_token'
const LEGACY_ROLE_KEY = 'campuslink_role'
const LEGACY_NAME_KEY = 'campuslink_name'

export function saveAuth(token: string, role: Role, name = '') {
  if (typeof window === 'undefined') return
  localStorage.setItem(TOKEN_KEY, token)
  localStorage.setItem(ROLE_KEY, role)
  localStorage.setItem(NAME_KEY, name)
}

export function getToken() {
  if (typeof window === 'undefined') return ''
  return localStorage.getItem(TOKEN_KEY) || localStorage.getItem(LEGACY_TOKEN_KEY) || ''
}

export function getRole(): Role | null {
  if (typeof window === 'undefined') return null
  return (localStorage.getItem(ROLE_KEY) || localStorage.getItem(LEGACY_ROLE_KEY)) as Role | null
}

export function getName() {
  if (typeof window === 'undefined') return ''
  return localStorage.getItem(NAME_KEY) || localStorage.getItem(LEGACY_NAME_KEY) || ''
}

export function clearAuth() {
  if (typeof window === 'undefined') return
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(ROLE_KEY)
  localStorage.removeItem(NAME_KEY)
  localStorage.removeItem(LEGACY_TOKEN_KEY)
  localStorage.removeItem(LEGACY_ROLE_KEY)
  localStorage.removeItem(LEGACY_NAME_KEY)
}

