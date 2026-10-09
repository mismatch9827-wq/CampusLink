'use client'

import React, { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  BriefcaseBusiness,
  Building2,
  CalendarDays,
  CheckCircle2,
  Clock,
  Code2,
  FileCheck,
  FileText,
  GraduationCap,
  IndianRupee,
  Loader2,
  MapPin,
  Sparkles,
  Trash2,
  UploadCloud,
} from 'lucide-react'
import { DashboardShell } from '@/components/DashboardShell'
import { Button } from '@/components/ui/Button'
import { api } from '@/lib/api'

export default function NewDrivePage() {
  const router = useRouter()
  const [mode, setMode] = useState<'pdf' | 'manual'>('pdf')
  const [saved, setSaved] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [jdPdfFile, setJdPdfFile] = useState<File | null>(null)
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
    setUploadStatus('Analyzing Job Description PDF with AI to extract role, eligibility, skills, and schedule…')
    setSubmitError('')
    try {
      const res = await api.parseJdPdf(file)
      setJdPdfFile(file)
      const data = res.extracted_data || {}
      setForm(prev => ({
        ...prev,
        company: data.company || prev.company,
        role: data.role || prev.role,
        min_cgpa: data.min_cgpa != null ? data.min_cgpa : prev.min_cgpa,
        max_backlogs: data.max_backlogs != null ? data.max_backlogs : prev.max_backlogs,
        ctc: data.ctc != null ? data.ctc : prev.ctc,
        branches: Array.isArray(data.branches) && data.branches.length ? data.branches.join(', ') : prev.branches,
        required_skills:
          Array.isArray(data.required_skills) && data.required_skills.length
            ? data.required_skills.join(', ')
            : prev.required_skills,
        jd: res.raw_text || prev.jd,
        date: data.drive_date && /^\d{4}-\d{2}-\d{2}$/.test(data.drive_date) ? data.drive_date : '',
        slot: data.slot || '',
        venue: data.venue || '',
      }))

      const hasSchedule = Boolean(data.drive_date || data.slot || data.venue)
      const scheduleNote = hasSchedule
        ? 'Schedule details were detected in the JD.'
        : 'Date, time, and venue were not in the JD (placement cell will propose schedule).'

      const warnings = res.warnings || []
      setUploadStatus(
        [...warnings, `Extracted requirements, skills, and eligibility criteria from PDF. ${scheduleNote}`].join(' ')
      )
    } catch (error) {
      setUploadStatus(error instanceof Error ? error.message : 'Could not parse this PDF')
    } finally {
      setUploading(false)
    }
  }

  function handleFileDrop(e: React.DragEvent<HTMLLabelElement>) {
    e.preventDefault()
    if (uploading) return
    const file = e.dataTransfer.files?.[0]
    if (file && file.type === 'application/pdf') {
      void handlePdfUpload(file)
    } else {
      setUploadStatus('Please drop a valid PDF file.')
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (submitting) return
    setSubmitError('')

    if (mode === 'pdf') {
      if (!jdPdfFile) {
        setSubmitError('Please upload a Job Description PDF before submitting.')
        return
      }

      try {
        setSubmitting(true)
        const payload = {
          company: form.company.trim(),
          role: form.role.trim(),
          jd: form.jd,
          min_cgpa: form.min_cgpa !== '' ? Number(form.min_cgpa) : 0,
          ctc: form.ctc !== '' ? Number(form.ctc) : 0,
          max_backlogs: Number(form.max_backlogs) || 0,
          branches: form.branches ? form.branches.split(',').map(x => x.trim()).filter(Boolean) : [],
          required_skills: form.required_skills
            ? form.required_skills.split(',').map(x => x.trim()).filter(Boolean)
            : [],
          date: form.date,
          slot: form.slot,
          venue: form.venue,
        }
        await api.createDriveWithPdf(payload, jdPdfFile)
        setSaved(true)
        setTimeout(() => router.push('/recruiter/drives'), 900)
      } catch (error) {
        setSubmitError(error instanceof Error ? error.message : 'Could not submit the job')
      } finally {
        setSubmitting(false)
      }
      return
    }

    // Manual Form Mode Validation
    const missing: string[] = []
    if (!form.company.trim()) missing.push('Company')
    if (!form.role.trim()) missing.push('Role')
    if (form.min_cgpa === '' || Number(form.min_cgpa) < 0 || Number(form.min_cgpa) > 10)
      missing.push('Minimum CGPA (0-10)')
    if (form.max_backlogs < 0) missing.push('Max backlogs')
    if (form.ctc === '' || Number(form.ctc) <= 0) missing.push('CTC')
    if (!form.branches.trim()) missing.push('Eligible branches')
    if (!form.required_skills.trim()) missing.push('Required skills')
    if (!form.jd.trim()) missing.push('Job description')

    if (missing.length) {
      setSubmitError(`Complete these required fields: ${missing.join(', ')}.`)
      return
    }

    try {
      setSubmitting(true)
      const payload = {
        ...form,
        min_cgpa: Number(form.min_cgpa),
        ctc: Number(form.ctc),
        required_skills: form.required_skills.split(',').map(x => x.trim()).filter(Boolean),
        branches: form.branches.split(',').map(x => x.trim()).filter(Boolean),
      }
      await api.createDrive(payload as any)
      setSaved(true)
      setTimeout(() => router.push('/recruiter/drives'), 900)
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Could not submit the job')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <DashboardShell
      role="recruiter"
      title="Post a job"
      subtitle="Upload your Job Description or enter details manually. Platform engines will index requirements for candidate matching."
    >
      <div className="mx-auto max-w-4xl">
        <form onSubmit={submit} noValidate className="panel overflow-hidden shadow-sm">
          {/* Header */}
          <div className="border-b border-slate-100 bg-mist/50 p-5 md:p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <span className="grid h-11 w-11 place-items-center rounded-2xl bg-navy text-white shadow-sm">
                  <BriefcaseBusiness size={19} />
                </span>
                <div>
                  <div className="eyebrow">New opening</div>
                  <h2 className="mt-0.5 text-xl font-black">Recruiter requirement submission</h2>
                </div>
              </div>

              {/* Mode Toggle Tabs */}
              <div className="inline-flex rounded-xl bg-slate-100 p-1">
                <button
                  type="button"
                  onClick={() => setMode('pdf')}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-bold transition ${
                    mode === 'pdf' ? 'bg-white text-navy shadow-sm' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Sparkles size={14} className={mode === 'pdf' ? 'text-brand' : 'text-slate-400'} />
                  Upload JD PDF (Auto-extract)
                </button>
                <button
                  type="button"
                  onClick={() => setMode('manual')}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-bold transition ${
                    mode === 'manual' ? 'bg-white text-navy shadow-sm' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <FileText size={14} className={mode === 'manual' ? 'text-brand' : 'text-slate-400'} />
                  Fill form manually
                </button>
              </div>
            </div>
          </div>

          {/* ===================== MODE: PDF UPLOAD ===================== */}
          {mode === 'pdf' && (
            <div className="space-y-6 p-5 md:p-6">
              {/* PDF Dropzone */}
              <div>
                <label
                  onDragOver={e => e.preventDefault()}
                  onDrop={handleFileDrop}
                  className={`relative flex flex-col items-center justify-center rounded-2xl border-2 border-dashed p-7 text-center transition cursor-pointer ${
                    jdPdfFile
                      ? 'border-teal-300 bg-teal-50/30 hover:bg-teal-50/50'
                      : 'border-slate-300 bg-slate-50/50 hover:border-brand/40 hover:bg-teal-50/20'
                  }`}
                >
                  <input
                    type="file"
                    accept=".pdf"
                    className="hidden"
                    disabled={uploading}
                    onChange={e => void handlePdfUpload(e.target.files?.[0])}
                  />

                  {uploading ? (
                    <div className="flex flex-col items-center py-4">
                      <Loader2 size={36} className="animate-spin text-brand" />
                      <p className="mt-3 text-sm font-bold text-slate-800">Reading & parsing JD PDF…</p>
                      <p className="mt-1 text-xs text-slate-500">
                        Extracting company, role, eligibility cutoffs, technical skills, and schedule
                      </p>
                    </div>
                  ) : jdPdfFile ? (
                    <div className="flex flex-col items-center py-2">
                      <div className="grid h-14 w-14 place-items-center rounded-2xl bg-teal-100 text-teal-800 shadow-sm">
                        <FileCheck size={28} />
                      </div>
                      <p className="mt-3 text-sm font-black text-slate-800">{jdPdfFile.name}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        {(jdPdfFile.size / (1024 * 1024)).toFixed(2)} MB · Parsed and attached for AI engines and placement review
                      </p>
                      <div className="mt-4 flex items-center gap-2">
                        <span className="rounded-xl bg-navy px-3 py-1.5 text-xs font-bold text-white shadow-sm hover:bg-slate-800">
                          Replace PDF
                        </span>
                        <button
                          type="button"
                          onClick={e => {
                            e.preventDefault()
                            e.stopPropagation()
                            setJdPdfFile(null)
                            setUploadStatus('')
                          }}
                          className="inline-flex items-center gap-1 rounded-xl border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-bold text-red-700 hover:bg-red-100"
                        >
                          <Trash2 size={13} /> Remove
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center py-3">
                      <div className="grid h-14 w-14 place-items-center rounded-2xl bg-brand/10 text-brand">
                        <UploadCloud size={28} />
                      </div>
                      <p className="mt-3 text-sm font-black text-slate-800">Click or drag & drop Job Description PDF</p>
                      <p className="mt-1.5 max-w-md text-xs text-slate-500 leading-relaxed">
                        Upload your JD PDF. The platform automatically extracts company requirements, eligibility, CTC,
                        and skills into the database for candidate ranking and fit score analysis.
                      </p>
                      <span className="mt-4 rounded-xl bg-navy px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-slate-800">
                        Choose PDF file
                      </span>
                    </div>
                  )}
                </label>

                {uploadStatus && (
                  <div
                    className={`mt-3 rounded-xl border p-3 text-xs font-medium flex items-start gap-2.5 ${
                      uploadStatus.includes('unavailable') ||
                      uploadStatus.includes('failed') ||
                      uploadStatus.includes('Could not')
                        ? 'border-red-200 bg-red-50 text-red-700'
                        : 'border-teal-200 bg-teal-50 text-teal-800'
                    }`}
                  >
                    <Sparkles size={16} className="shrink-0 mt-0.5 text-brand" />
                    <p className="leading-5">{uploadStatus}</p>
                  </div>
                )}
              </div>

              {/* Extracted Details & Engine Data (Auto-populated from PDF) */}
              {jdPdfFile && (
                <div className="space-y-4">
                  {/* Job & Eligibility Requirements */}
                  <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs">
                    <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                      <div>
                        <h3 className="text-sm font-black text-slate-800">Extracted requirements & criteria</h3>
                        <p className="text-[11px] text-slate-500">
                          These fields are extracted directly from your PDF and saved to database for candidate matching and scoring.
                        </p>
                      </div>
                      <span className="rounded-md bg-teal-50 px-2 py-0.5 text-[10px] font-bold text-teal-800">
                        From JD PDF
                      </span>
                    </div>

                    <div className="mt-4 grid gap-4 sm:grid-cols-2">
                      <label>
                        <span className="mb-1.5 flex items-center gap-1.5 text-xs font-bold text-slate-700">
                          <Building2 size={13} className="text-brand" /> Company
                        </span>
                        <input
                          type="text"
                          className="field"
                          placeholder="Company name"
                          value={form.company}
                          onChange={e => setForm(f => ({ ...f, company: e.target.value }))}
                        />
                      </label>

                      <label>
                        <span className="mb-1.5 flex items-center gap-1.5 text-xs font-bold text-slate-700">
                          <BriefcaseBusiness size={13} className="text-brand" /> Role / Position
                        </span>
                        <input
                          type="text"
                          className="field"
                          placeholder="Job role"
                          value={form.role}
                          onChange={e => setForm(f => ({ ...f, role: e.target.value }))}
                        />
                      </label>

                      <label>
                        <span className="mb-1.5 flex items-center gap-1.5 text-xs font-bold text-slate-700">
                          <IndianRupee size={13} className="text-brand" /> CTC (LPA)
                        </span>
                        <input
                          type="number"
                          step="0.1"
                          className="field"
                          placeholder="e.g. 12"
                          value={form.ctc}
                          onChange={e =>
                            setForm(f => ({ ...f, ctc: e.target.value !== '' ? Number(e.target.value) : '' }))
                          }
                        />
                      </label>

                      <div className="grid grid-cols-2 gap-3">
                        <label>
                          <span className="mb-1.5 flex items-center gap-1.5 text-xs font-bold text-slate-700">
                            <GraduationCap size={13} className="text-brand" /> Min CGPA
                          </span>
                          <input
                            type="number"
                            step="0.1"
                            min="0"
                            max="10"
                            className="field"
                            placeholder="e.g. 7.5"
                            value={form.min_cgpa}
                            onChange={e =>
                              setForm(f => ({
                                ...f,
                                min_cgpa: e.target.value !== '' ? Number(e.target.value) : '',
                              }))
                            }
                          />
                        </label>

                        <label>
                          <span className="mb-1.5 block text-xs font-bold text-slate-700">Max backlogs</span>
                          <input
                            type="number"
                            min="0"
                            className="field"
                            placeholder="0"
                            value={form.max_backlogs}
                            onChange={e =>
                              setForm(f => ({ ...f, max_backlogs: Number(e.target.value) || 0 }))
                            }
                          />
                        </label>
                      </div>

                      <label className="sm:col-span-2">
                        <span className="mb-1.5 block text-xs font-bold text-slate-700">
                          Eligible branches (comma-separated)
                        </span>
                        <input
                          type="text"
                          className="field"
                          placeholder="e.g. CSE, IT, ECE"
                          value={form.branches}
                          onChange={e => setForm(f => ({ ...f, branches: e.target.value }))}
                        />
                      </label>

                      <label className="sm:col-span-2">
                        <span className="mb-1.5 flex items-center gap-1.5 text-xs font-bold text-slate-700">
                          <Code2 size={13} className="text-brand" /> Required technical skills (comma-separated)
                        </span>
                        <input
                          type="text"
                          className="field"
                          placeholder="e.g. Python, SQL, React, Node.js"
                          value={form.required_skills}
                          onChange={e => setForm(f => ({ ...f, required_skills: e.target.value }))}
                        />
                      </label>
                    </div>
                  </div>

                  {/* Schedule Details Card */}
                  <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-5">
                    <div className="border-b border-slate-200/60 pb-3">
                      <h3 className="text-sm font-black text-slate-800">Drive schedule logistics</h3>
                      <p className="text-[11px] text-slate-500">
                        {form.date || form.slot || form.venue
                          ? 'Schedule detected in the JD. You can adjust if needed.'
                          : 'No schedule was found in the JD. If left blank, the placement cell will propose date, time, and venue during review.'}
                      </p>
                    </div>

                    <div className="mt-4 grid gap-4 sm:grid-cols-3">
                      <label>
                        <span className="mb-1.5 flex items-center gap-1.5 text-xs font-bold text-slate-700">
                          <CalendarDays size={13} className="text-brand" /> Drive date
                        </span>
                        <input
                          type="date"
                          className="field bg-white"
                          value={form.date}
                          onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                        />
                      </label>

                      <label>
                        <span className="mb-1.5 flex items-center gap-1.5 text-xs font-bold text-slate-700">
                          <Clock size={13} className="text-brand" /> Time slot
                        </span>
                        <input
                          type="text"
                          className="field bg-white"
                          placeholder="e.g. 10:00 AM - 4:00 PM"
                          value={form.slot}
                          onChange={e => setForm(f => ({ ...f, slot: e.target.value }))}
                        />
                      </label>

                      <label>
                        <span className="mb-1.5 flex items-center gap-1.5 text-xs font-bold text-slate-700">
                          <MapPin size={13} className="text-brand" /> Venue
                        </span>
                        <input
                          type="text"
                          className="field bg-white"
                          placeholder="e.g. Campus Auditorium / Virtual"
                          value={form.venue}
                          onChange={e => setForm(f => ({ ...f, venue: e.target.value }))}
                        />
                      </label>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ===================== MODE: MANUAL FORM ===================== */}
          {mode === 'manual' && (
            <div className="p-5 md:p-6 space-y-5">
              <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-3.5 text-xs text-amber-900">
                <b>Manual entry mode:</b> Fill out all required fields below. Students and placement administrators
                will see your requirements in text format.
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                {[
                  ['Company', 'company', 'text', true],
                  ['Role', 'role', 'text', true],
                  ['Minimum CGPA (0 - 10)', 'min_cgpa', 'number', true],
                  ['Max active backlogs', 'max_backlogs', 'number', true],
                  ['CTC (LPA)', 'ctc', 'number', true],
                  ['Drive date', 'date', 'date', false],
                  ['Time slot', 'slot', 'text', false],
                  ['Venue', 'venue', 'text', false],
                ].map(([label, key, type, required]) => (
                  <label key={key as string}>
                    <span className="mb-1.5 block text-xs font-bold text-slate-700">
                      {label as string}
                      {required && <span className="ml-1 text-red-500">*</span>}
                    </span>
                    <input
                      className="field"
                      type={type as string}
                      required={required as boolean}
                      min={key === 'min_cgpa' ? 0 : key === 'max_backlogs' ? 0 : key === 'ctc' ? 0.01 : undefined}
                      max={key === 'min_cgpa' ? 10 : undefined}
                      value={(form as any)[key as string]}
                      onChange={e =>
                        setForm({
                          ...form,
                          [key as string]:
                            type === 'number' && e.target.value !== '' ? Number(e.target.value) : e.target.value,
                        })
                      }
                    />
                  </label>
                ))}

                <label className="md:col-span-2">
                  <span className="mb-1.5 block text-xs font-bold text-slate-700">
                    Eligible branches (comma-separated) <span className="text-red-500">*</span>
                  </span>
                  <input
                    className="field"
                    required
                    placeholder="e.g. CSE, IT, ECE"
                    value={form.branches}
                    onChange={e => setForm({ ...form, branches: e.target.value })}
                  />
                </label>

                <label className="md:col-span-2">
                  <span className="mb-1.5 block text-xs font-bold text-slate-700">
                    Required skills (comma-separated) <span className="text-red-500">*</span>
                  </span>
                  <input
                    className="field"
                    required
                    placeholder="e.g. React, Node.js, Python, SQL"
                    value={form.required_skills}
                    onChange={e => setForm({ ...form, required_skills: e.target.value })}
                  />
                </label>

                <label className="md:col-span-2">
                  <span className="mb-1.5 block text-xs font-bold text-slate-700">
                    Job description <span className="text-red-500">*</span>
                  </span>
                  <textarea
                    className="field min-h-32 resize-y"
                    required
                    placeholder="Detail the role responsibilities, qualifications, and expectations..."
                    value={form.jd}
                    onChange={e => setForm({ ...form, jd: e.target.value })}
                  />
                </label>
              </div>
            </div>
          )}

          {/* Footer Submit Bar */}
          <div className="border-t border-slate-100 bg-slate-50/50 p-5">
            {submitError && (
              <div
                role="alert"
                aria-live="assertive"
                className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-700"
              >
                {submitError}
              </div>
            )}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-[11px] leading-relaxed text-slate-500">
                {mode === 'pdf'
                  ? 'All extracted requirements and original PDF will be stored and submitted for review.'
                  : 'Your job submission will be reviewed by admin before opening for student opt-ins.'}
              </div>
              <Button
                type="submit"
                disabled={submitting || saved || (mode === 'pdf' && !jdPdfFile)}
                className="px-6 py-2.5 font-bold shadow-sm"
              >
                {submitting ? (
                  <>
                    <Loader2 size={16} className="animate-spin" /> Submitting…
                  </>
                ) : saved ? (
                  <>
                    <CheckCircle2 size={16} /> Submitted
                  </>
                ) : mode === 'pdf' ? (
                  <>Submit PDF for review</>
                ) : (
                  <>Submit job requirements</>
                )}
              </Button>
            </div>
          </div>
        </form>
      </div>
    </DashboardShell>
  )
}
