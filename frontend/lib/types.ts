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

export interface ProjectItem {
  title: string
  github_url?: string
  verified?: boolean
  language?: string
  stars?: number
  status?: string
}

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
  project_details?: ProjectItem[]
  verified_projects_count?: number
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


export interface MatchedSkillItem {
  skill: string
  matched_by: string[]
}

export interface MissingSkillItem {
  skill: string
  importance: 'high' | 'medium' | 'low'
}

export interface DriveSummaryItem {
  id: string
  company: string
  role: string
  ctc: number
  date?: string
}

export interface SkillGapResult {
  drive_id: string
  company: string
  role: string
  ctc: number
  min_cgpa: number
  eligible: boolean
  eligibility_reason: string
  total_required: number
  match_percentage: number
  matched_skills: MatchedSkillItem[]
  missing_skills: MissingSkillItem[]
  company_advice: string[]
  available_drives: DriveSummaryItem[]
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
  recruiter_email?: string
  jd_source?: 'pdf' | 'text'
  jd_pdf_file_id?: string
  jd_pdf_filename?: string
  schedule_status?: 'pending_recruiter' | 'accepted' | 'rejected'
  schedule_proposal?: {
    id: string
    date: string
    slot: string
    venue: string
    status: 'pending_recruiter' | 'accepted' | 'rejected'
    proposed_by?: string
    proposed_by_email?: string
  }
  eligible?: boolean
  eligibility_reason?: string
}

export interface Notification {
  id: string
  user_id?: string
  drive_id?: string
  proposal_id?: string
  type?: 'schedule_proposal' | 'schedule_response' | string
  title?: string
  message: string
  date?: string
  slot?: string
  venue?: string
  contact_email?: string
  accepted?: boolean
  read: boolean
  created_at?: string
  action_state?: string
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
  matched_skills?: string[]
  missing_skills?: string[]
  branch?: string
  cgpa?: number
  company?: string
  role?: string
  ctc?: number
  claimed_cgpa?: number
  has_red_flags?: boolean
  has_cgpa_mismatch?: boolean
  has_link_mismatch?: boolean
  has_critical_mismatch?: boolean
  has_mismatch?: boolean
  is_clean?: boolean
  created_at?: string
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
