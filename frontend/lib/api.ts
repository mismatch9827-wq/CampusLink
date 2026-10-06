import { getToken } from './auth'
import type { Application, Drive, Offer, Role, Student } from './types'

export const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000'

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken()
  const headers: Record<string, string> = {
    ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
    ...(options.headers as Record<string, string> | undefined),
  }
  if (token) headers.Authorization = `Bearer ${token}`

  const response = await fetch(`${API_URL}${path}`, { ...options, headers })
  if (!response.ok) {
    let message = `Request failed (${response.status})`
    try {
      const body = await response.json()
      message = body.detail || body.message || message
    } catch {}
    throw new Error(message)
  }
  return response.json()
}

export const api = {
  login: (identifier: string, password: string, role: Role) => request<{access_token:string; role:Role; name:string}>('/auth/login', {
    method: 'POST', body: JSON.stringify({ identifier, email: identifier, password, role })
  }),
  register: (payload: { role: Role; identifier: string; password: string; name?: string }) => request<{access_token:string; role:Role; name:string}>('/auth/register', {
    method: 'POST', body: JSON.stringify(payload)
  }),
  parseJdPdf: (file: File) => { const form = new FormData(); form.append('file', file); return request<{message: string; extracted_data: { company: string | null; role: string | null; required_skills: string[]; branches: string[]; min_cgpa: number | null; max_backlogs: number | null; ctc: number | null; drive_date: string | null; slot: string | null; venue: string | null }; raw_text: string; warnings: string[]; ocr_used: boolean; manual_review_required: boolean}>('/drives/parse-pdf', { method: 'POST', body: form }) },
  studentProfile: () => request<Student>('/students/me'),
  uploadResume: (file: File) => { const form = new FormData(); form.append('file', file); return request<any>('/students/resume', { method: 'POST', body: form }) },
  uploadMasterCsv: (file: File) => { const form = new FormData(); form.append('file', file); return request<any>('/admin/master-students/upload', { method: 'POST', body: form }) },
  readiness: () => request<any>('/students/readiness'),
  studentDrives: () => request<Drive[]>('/students/drives'),
  optIn: (driveId: string) => request<any>(`/drives/${driveId}/optin`, { method: 'POST' }),
  recruiterDrives: () => request<Drive[]>('/recruiter/drives'),
  drive: (driveId: string) => request<Drive>(`/drives/${driveId}`),
  createDrive: (payload: Partial<Drive>) => request<Drive>('/drives', { method: 'POST', body: JSON.stringify(payload) }),
  ranked: (driveId: string) => request<Application[]>(`/recruiter/drives/${driveId}/ranked`),
  selectCandidates: (driveId: string, applicationIds: string[]) => request<any>(`/recruiter/drives/${driveId}/select`, { method:'POST', body: JSON.stringify({ application_ids: applicationIds }) }),
  adminDrives: () => request<Drive[]>('/admin/drives'),
  approveDrive: (driveId: string, approve: boolean) => request<any>(`/admin/drives/${driveId}/approve`, { method:'POST', body: JSON.stringify({ approve }) }),
  verificationQueue: () => request<Application[]>('/admin/verification'),
  verifyApplication: (id: string, approve: boolean) => request<any>(`/admin/applications/${id}/verify`, { method:'POST', body: JSON.stringify({ approve }) }),
  shortlistQueue: () => request<any[]>('/admin/shortlists'),
  approveShortlist: (driveId: string, payload?: { resolved_slot?: string; resolved_venue?: string }) => request<any>(`/admin/drives/${driveId}/approve-shortlist`, { method:'POST', body: JSON.stringify(payload || {}) }),

  offers: () => request<Offer[]>('/offers'),
  analytics: () => request<any>('/analytics/dashboard'),
  notifications: () => request<any[]>('/notifications'),
}
