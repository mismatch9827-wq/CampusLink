export type Role = 'student' | 'recruiter' | 'admin'

export type DriveStatus =
  | 'pending_admin_review'
  | 'open_for_optin'
  | 'ranking_ready'
  | 'recruiter_selected'
  | 'admin_approved'
  | 'shortlist_published'
  | 'drive_rejected'

export type ApplicationStatus =
  | 'opted_in'
  | 'verified'
  | 'rejected'
  | 'selected_by_recruiter'
  | 'shortlisted'
  | 'offered'
  | 'accepted'
  | 'deferred'
  | 'withdrawn'

export interface Student {
  id: string
  registration_number: string
  name: string
  email: string
  branch: string
  cgpa: number
  backlogs: number
  passing_year: number
  parsed_skills: string[]
  projects: string[]
  certificates: string[]
  readiness_score: number
  readiness_level: string
  skill_gaps: string[]
  breakdown: {
    technical: number
    projects: number
    aptitude: number
    communication: number
  }
  journey?: {
    id: string
    company: string
    role: string
    status: ApplicationStatus
    detail: string
  }[]
  target_role?: string
  target_company?: string
  target_fit?: number
}


export interface Drive {
  id: string
  company: string
  role: string
  jd: string
  required_skills: string[]
  min_cgpa: number
  branches: string[]
  max_backlogs: number
  ctc: number
  date: string
  slot: string
  venue: string
  status: DriveStatus
  recruiter_id?: string
  eligible?: boolean
  eligibility_reason?: string
}

export interface VerificationFlag {
  level: 'red' | 'yellow' | 'green'
  label: string
  detail: string
}

export interface Application {
  id: string
  drive_id: string
  student_id: string
  student_name: string
  status: ApplicationStatus
  flags: VerificationFlag[]
  fit_score?: number
  reasons?: string[]
  skills?: string[]
  branch?: string
  cgpa?: number
}

export interface Offer {
  id: string
  application_id: string
  company: string
  role: string
  student_name: string
  ctc: number
  status: 'offered' | 'accepted' | 'deferred' | 'withdrawn'
  documents: string
  joining_status: string
}
