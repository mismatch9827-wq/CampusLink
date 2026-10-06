'use client'

import React, { useState } from 'react'
import { useRouter } from 'next/navigation'
import { BriefcaseBusiness, CheckCircle2, FileText, Loader2, Sparkles, UploadCloud } from 'lucide-react'
import { DashboardShell } from '@/components/DashboardShell'
import { Button } from '@/components/ui/Button'
import { api } from '@/lib/api'

export default function NewDrivePage() {
  const router = useRouter()
  const [saved, setSaved] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadStatus, setUploadStatus] = useState('')
  const [submitError, setSubmitError] = useState('')

  const [form, setForm] = useState<{
    company: string
    role: string
    jd: string
    required_skills: string
    min_cgpa: number | ''
    branches: string
    max_backlogs: number
    ctc: number | ''
    date: string
    slot: string
    venue: string
  }>({
    company: '',
    role: '',
    jd: '',
    required_skills: '',
    min_cgpa: '',
    branches: '',
    max_backlogs: 0,
    ctc: '',
    date: '',
    slot: '',
    venue: '',
  })

  async function handlePdfUpload(file?: File) {
    if (!file) return
    setUploading(true)
    setUploadStatus('Extracting PDF text and tables…')
    try {
      const res = await api.parseJdPdf(file)
      const data = res.extracted_data || {}
      setForm(prev => ({
        ...prev,
        company: data.company || prev.company,
        role: data.role || prev.role,
        required_skills: data.required_skills?.length
          ? data.required_skills.join(', ')
          : prev.required_skills,
        branches: data.branches?.length
          ? data.branches.join(', ')
          : prev.branches,
        min_cgpa: data.min_cgpa !== undefined && data.min_cgpa !== null ? Number(data.min_cgpa) : prev.min_cgpa,
        max_backlogs: data.max_backlogs !== undefined && data.max_backlogs !== null ? Number(data.max_backlogs) : prev.max_backlogs,
        ctc: data.ctc !== undefined && data.ctc !== null && data.ctc > 0 ? Number(data.ctc) : prev.ctc,
        date: data.drive_date && /^\d{4}-\d{2}-\d{2}$/.test(data.drive_date) ? data.drive_date : prev.date,
        slot: data.slot || prev.slot,
        venue: data.venue || prev.venue,
        jd: res.raw_text || prev.jd,
      }))
      const warnings = res.warnings || []
      const reviewMessage = res.manual_review_required
        ? 'Review every field and correct it before submitting.'
        : 'Review the extracted fields before submitting.'
      setUploadStatus([...warnings, reviewMessage].join(' '))
    } catch (error) {
      setUploadStatus(error instanceof Error ? error.message : 'Could not parse this PDF')
    } finally {
      setUploading(false)
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitError('')
    try {
      await api.createDrive({
        ...form,
        min_cgpa: Number(form.min_cgpa),
        ctc: Number(form.ctc),
        required_skills: form.required_skills.split(',').map(x => x.trim()),
        branches: form.branches.split(',').map(x => x.trim()),
      } as any)
      setSaved(true)
      setTimeout(() => router.push('/recruiter'), 900)
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Could not submit the job')
    }
  }

  return (
    <DashboardShell
      role="recruiter"
      title="Post a job"
      subtitle="New drives enter Gate 1 as pending_admin_review. Students cannot see them before approval."
    >
      <div className="mx-auto max-w-4xl">
        <form onSubmit={submit} className="panel overflow-hidden">
          <div className="border-b border-slate-100 bg-mist/50 p-5 md:p-6">
            <div className="flex items-center gap-3">
              <span className="grid h-11 w-11 place-items-center rounded-2xl bg-navy text-white">
                <BriefcaseBusiness size={19} />
              </span>
              <div>
                <div className="eyebrow">Gate 1 submission</div>
                <h2 className="mt-1 text-xl font-black">Recruiter requirement form</h2>
              </div>
            </div>
          </div>

          {/* AI JD Upload Section */}
          <div className="border-b border-slate-100 bg-teal-50/40 p-5 md:p-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="inline-flex items-center gap-1.5 text-xs font-bold text-teal-900">
                  <Sparkles size={14} className="text-brand" />
                  AI Job Description Auto-Fill
                </div>
                <p className="mt-1 text-[11px] text-slate-500">
                  Extract company, role, eligibility, CTC, date, time, venue, skills, and table requirements. Review every field before submitting.
                </p>
              </div>
              <div>
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-navy px-4 py-2.5 text-xs font-bold text-white shadow-sm transition hover:bg-slate-800">
                  {uploading ? <Loader2 size={15} className="animate-spin" /> : <UploadCloud size={15} />}
                  {uploading ? 'Extracting with AI…' : 'Upload JD PDF'}
                  <input
                    type="file"
                    accept=".pdf"
                    className="hidden"
                    disabled={uploading}
                    onChange={e => handlePdfUpload(e.target.files?.[0])}
                  />
                </label>
              </div>
            </div>
            {uploadStatus && (
              <div className={`mt-2.5 text-[11px] font-semibold ${uploadStatus.includes('unavailable') || uploadStatus.includes('failed') || uploadStatus.includes('Could not') ? 'text-red-700' : 'text-amber-800'}`}>
                <FileText size={13} className="shrink-0" />
                {uploadStatus}
              </div>
            )}
          </div>

          <div className="grid gap-4 p-5 md:grid-cols-2 md:p-6">
            {submitError && <div className="md:col-span-2 rounded-xl border border-red-100 bg-red-50 p-3 text-xs text-red-700">{submitError}</div>}
            {[
              ['Company', 'company', 'text'],
              ['Role', 'role', 'text'],
              ['Minimum CGPA', 'min_cgpa', 'number'],
              ['Max backlogs', 'max_backlogs', 'number'],
              ['CTC (LPA)', 'ctc', 'number'],
              ['Drive date', 'date', 'date'],
              ['Time slot', 'slot', 'text'],
              ['Venue', 'venue', 'text'],
            ].map(([label, key, type]) => (
              <label key={key}>
                <span className="mb-2 block text-xs font-bold text-slate-600">{label}</span>
                <input
                  className="field"
                  type={type}
                  required
                  min={key === 'min_cgpa' ? 0 : key === 'max_backlogs' ? 0 : key === 'ctc' ? 0.01 : undefined}
                  max={key === 'min_cgpa' ? 10 : undefined}
                  value={(form as any)[key]}
                  onChange={e =>
                    setForm({
                      ...form,
                      [key]: type === 'number' && e.target.value !== '' ? Number(e.target.value) : e.target.value,
                    })
                  }
                />
              </label>
            ))}
            <label className="md:col-span-2">
              <span className="mb-2 block text-xs font-bold text-slate-600">Eligible branches</span>
              <input
                className="field"
                required
                value={form.branches}
                onChange={e => setForm({ ...form, branches: e.target.value })}
              />
            </label>
            <label className="md:col-span-2">
              <span className="mb-2 block text-xs font-bold text-slate-600">Required skills</span>
              <input
                className="field"
                required
                value={form.required_skills}
                onChange={e => setForm({ ...form, required_skills: e.target.value })}
              />
            </label>
            <label className="md:col-span-2">
              <span className="mb-2 block text-xs font-bold text-slate-600">Job description</span>
              <textarea
                className="field min-h-28 resize-y"
                required
                value={form.jd}
                onChange={e => setForm({ ...form, jd: e.target.value })}
              />
            </label>
          </div>

          <div className="flex flex-col gap-3 border-t border-slate-100 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-[10px] leading-5 text-slate-500">
              Submitting creates status <b>pending_admin_review</b>.
              <br />
              Placement cell must approve before student opt-in opens.
            </div>
            <Button>
              {saved ? (
                <>
                  <CheckCircle2 size={16} /> Submitted
                </>
              ) : (
                <>Submit for Gate 1</>
              )}
            </Button>
          </div>
        </form>
      </div>
    </DashboardShell>
  )
}
