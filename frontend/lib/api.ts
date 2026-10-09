import { getToken } from './auth'
import type { Application, Drive, Notification, Offer, Role, SkillGapResult, Student } from './types'

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

async function requestBlob(path: string): Promise<Blob> {
  const token = getToken()
  const response = await fetch(`${API_URL}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })
  if (!response.ok) {
    let message = `Request failed (${response.status})`
    try {
      const body = await response.json()
      message = body.detail || body.message || message
    } catch {}
    throw new Error(message)
  }
  return response.blob()
}

export const api = {
  login: (identifier: string, password: string, role: Role) => request<{access_token:string; role:Role; name:string}>('/auth/login', {
    method: 'POST', body: JSON.stringify({ identifier, email: identifier, password, role })
  }),
  register: (payload: { role: Role; identifier: string; password: string; name?: string }) => request<{access_token:string; role:Role; name:string}>('/auth/register', {
    method: 'POST', body: JSON.stringify(payload)
  }),
  parseJdPdf: (file: File) => {
    const form = new FormData();
    form.append('file', file);
    return request<{
      message: string;
      extracted_data: {
        company?: string | null;
        role?: string | null;
        required_skills?: string[] | null;
        branches?: string[] | null;
        min_cgpa?: number | null;
        max_backlogs?: number | null;
        ctc?: number | null;
        drive_date?: string | null;
        slot?: string | null;
        venue?: string | null;
      };
      raw_text?: string;
      warnings: string[];
      ocr_used: boolean;
      manual_review_required: boolean;
    }>('/drives/parse-pdf', { method: 'POST', body: form });
  },
  studentProfile: () => request<Student>('/students/me'),
  uploadResume: (file: File) => { const form = new FormData(); form.append('file', file); return request<any>('/students/resume', { method: 'POST', body: form }) },
  uploadMasterCsv: (file: File) => { const form = new FormData(); form.append('file', file); return request<any>('/admin/master-students/upload', { method: 'POST', body: form }) },
  readiness: () => request<any>('/students/readiness'),
  addProject: (payload: { title: string; github_url: string }) => request<Student>('/students/projects', { method: 'POST', body: JSON.stringify(payload) }),
  skillGapAnalysis: (payload?: { drive_id?: string; company_name?: string }) => request<SkillGapResult>('/students/skill-gap', { method: 'POST', body: JSON.stringify(payload || {}) }),
  studentDrives: () => request<Drive[]>('/students/drives'),
  optIn: (driveId: string) => request<any>(`/drives/${driveId}/optin`, { method: 'POST' }),
  recruiterDrives: () => request<Drive[]>('/recruiter/drives'),
  drive: (driveId: string) => request<Drive>(`/drives/${driveId}`),
  createDrive: (payload: Partial<Drive>) => request<Drive>('/drives', { method: 'POST', body: JSON.stringify(payload) }),
  createDriveWithPdf: (payload: Partial<Drive>, file: File) => {
    const form = new FormData()
    form.append('company', payload.company || '')
    form.append('role', payload.role || '')
    form.append('jd', payload.jd || '')
    form.append('min_cgpa', String(payload.min_cgpa ?? ''))
    form.append('max_backlogs', String(payload.max_backlogs ?? ''))
    form.append('ctc', String(payload.ctc ?? ''))
    form.append('date', payload.date || '')
    form.append('slot', payload.slot || '')
    form.append('venue', payload.venue || '')
    payload.required_skills?.forEach(skill => form.append('required_skills', skill))
    payload.branches?.forEach(branch => form.append('branches', branch))
    form.append('file', file)
    return request<Drive>('/drives/with-pdf', { method: 'POST', body: form })
  },
  ranked: (driveId: string) => request<Application[]>(`/recruiter/drives/${driveId}/ranked`),
  selectCandidates: (driveId: string, applicationIds: string[]) => request<any>(`/recruiter/drives/${driveId}/select`, { method:'POST', body: JSON.stringify({ application_ids: applicationIds }) }),
  adminDrives: () => request<Drive[]>('/admin/drives'),
  updateDriveAdmin: (driveId: string, payload: Partial<Drive>) => request<Drive>(`/admin/drives/${driveId}`, { method: 'PATCH', body: JSON.stringify(payload) }),
  approveDrive: (driveId: string, approve: boolean) => request<any>(`/admin/drives/${driveId}/approve`, { method:'POST', body: JSON.stringify({ approve }) }),
  proposeDriveSchedule: (driveId: string, schedule: { date: string; slot: string; venue: string }) => request<Drive>(`/admin/drives/${driveId}/schedule-proposal`, { method:'POST', body: JSON.stringify(schedule) }),
  adminDriveJdPdf: (driveId: string) => requestBlob(`/admin/drives/${driveId}/jd-pdf`),
  respondToSchedule: (driveId: string, proposalId: string, accept: boolean) => request<Drive>(`/drives/${driveId}/schedule-response`, { method:'POST', body: JSON.stringify({ proposal_id: proposalId, accept }) }),
  verificationQueue: () => request<Application[]>('/admin/verification'),
  verifyApplication: (id: string, approve: boolean) => request<any>(`/admin/applications/${id}/verify`, { method:'POST', body: JSON.stringify({ approve }) }),
  batchVerifyApplications: (applicationIds: string[], approve: boolean) => request<any>('/admin/applications/batch-verify', { method:'POST', body: JSON.stringify({ application_ids: applicationIds, approve }) }),
  shortlistQueue: () => request<any[]>('/admin/shortlists'),
  approveShortlist: (driveId: string, payload?: { resolved_slot?: string; resolved_venue?: string }) => request<any>(`/admin/drives/${driveId}/approve-shortlist`, { method:'POST', body: JSON.stringify(payload || {}) }),

  offers: () => request<Offer[]>('/offers'),
  analytics: () => request<any>('/analytics/dashboard'),
  nudgeOnboarding: () => request<any>('/analytics/nudge-onboarding', { method: 'POST' }),
  masterStudents: () => request<any[]>('/admin/master-students'),
  uploadHistoricalPlacements: (file: File) => {
    const form = new FormData();
    form.append('file', file);
    return request<{ message: string; created: number; updated: number }>('/admin/historical-placements/upload', { method: 'POST', body: form });
  },
  historicalPlacements: () => request<any[]>('/admin/historical-placements'),
  deleteHistoricalPlacement: (id: string) => request<any>(`/admin/historical-placements/${id}`, { method: 'DELETE' }),
  notifications: () => request<Notification[]>('/notifications'),
  markNotificationRead: (notificationId: string) => request<Notification>(`/notifications/${notificationId}/read`, { method:'POST' }),
}
