'use client'
import React, { useEffect, useState } from 'react'
import {
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  CircleAlert,
  Code2,
  ExternalLink,
  Github,
  GraduationCap,
  Lightbulb,
  Loader2,
  LockKeyhole,
  Plus,
  ShieldCheck,
  Sparkles,
  Star,
  Target,
  UploadCloud,
} from 'lucide-react'
import { DashboardShell } from '@/components/DashboardShell'
import { Progress } from '@/components/ui/Progress'
import { StatusBadge } from '@/components/StatusBadge'
import { Button } from '@/components/ui/Button'
import { api } from '@/lib/api'
import type { ProjectItem, SkillGapResult, Student } from '@/lib/types'

export default function StudentDashboard() {
  const [student, setStudent] = useState<Student | null>(null)
  const [profileError, setProfileError] = useState('')
  const [uploadMessage, setUploadMessage] = useState('')
  const [recommendations, setRecommendations] = useState<string[]>([])
  const [addingProject, setAddingProject] = useState(false)
  const [projectForm, setProjectForm] = useState({ title: '', github_url: '' })
  const [verifying, setVerifying] = useState(false)
  const [projectNotice, setProjectNotice] = useState('')

  // Company-specific skill gap analysis state
  const [skillGap, setSkillGap] = useState<SkillGapResult | null>(null)
  const [selectedDriveId, setSelectedDriveId] = useState<string>('')
  const [customCompany, setCustomCompany] = useState<string>('')
  const [gapLoading, setGapLoading] = useState<boolean>(false)

  useEffect(() => {
    loadData()
  }, [])

  function loadData() {
    api.studentProfile()
      .then(setStudent)
      .catch((err: Error) => setProfileError(err.message))

    api.readiness()
      .then(r => setRecommendations(r.recommendations || []))
      .catch(() => {})

    api.skillGapAnalysis()
      .then(res => {
        setSkillGap(res)
        if (res.drive_id) setSelectedDriveId(res.drive_id)
      })
      .catch(() => {})
  }

  async function handleSelectDrive(driveId: string) {
    setSelectedDriveId(driveId)
    setGapLoading(true)
    try {
      const res = await api.skillGapAnalysis({ drive_id: driveId })
      setSkillGap(res)
    } catch (err) {
      console.error(err)
    } finally {
      setGapLoading(false)
    }
  }

  async function handleCustomCompanySearch(e: React.FormEvent) {
    e.preventDefault()
    if (!customCompany.trim()) return
    setGapLoading(true)
    try {
      const res = await api.skillGapAnalysis({ company_name: customCompany })
      setSkillGap(res)
      if (res.drive_id) setSelectedDriveId(res.drive_id)
    } catch (err) {
      console.error(err)
    } finally {
      setGapLoading(false)
    }
  }

  async function uploadResume(file?: File) {
    if (!file || !student) return
    setUploadMessage('Analysing resume & scanning for GitHub project repositories…')
    try {
      const r = await api.uploadResume(file)
      setStudent(prev => prev && ({
        ...prev,
        parsed_skills: r.skills,
        readiness_score: r.readiness_score,
        readiness_level: r.readiness_level,
        skill_gaps: r.skill_gaps,
      }))
      loadData()
      setUploadMessage('Resume parsed, GitHub repositories scanned, and readiness refreshed!')
    } catch (err) {
      setUploadMessage(err instanceof Error ? err.message : 'Could not upload resume')
    }
  }

  async function handleAddProject(e: React.FormEvent) {
    e.preventDefault()
    if (!projectForm.title.trim()) return
    setVerifying(true)
    setProjectNotice('')
    try {
      const updated = await api.addProject(projectForm)
      setStudent(updated)
      setProjectForm({ title: '', github_url: '' })
      setAddingProject(false)
      setProjectNotice('Project linked and verified via GitHub API! Readiness score updated.')
      api.readiness().then(r => setRecommendations(r.recommendations || [])).catch(() => {})
    } catch (err) {
      setProjectNotice(err instanceof Error ? err.message : 'Could not verify project')
    } finally {
      setVerifying(false)
    }
  }

  if (!student) {
    return (
      <DashboardShell role="student" title="My readiness" subtitle="Your verified academic profile and placement status.">
        <section className="panel p-10 text-center text-sm text-slate-500">
          {profileError || 'Loading your student profile…'}
        </section>
      </DashboardShell>
    )
  }

  const journeyItems = student.journey || []
  const projectsList = student.project_details || []
  const verifiedCount = student.verified_projects_count || projectsList.filter(p => p.verified).length

  return (
    <DashboardShell
      role="student"
      title="My readiness"
      subtitle="Verified academic profile, employability signals, and code evidence verification."
    >
      <div className="grid gap-5 xl:grid-cols-[1.25fr_.75fr]">
        {/* Main Profile & Score Card */}
        <section className="panel overflow-hidden shadow-sm">
          <div className="border-b border-slate-100 bg-gradient-to-br from-white via-white to-mist/70 p-6 md:p-7">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
              <div className="grid h-20 w-20 shrink-0 place-items-center rounded-[24px] bg-navy text-xl font-black text-white shadow-sm">
                {student.name.split(' ').map(x => x[0]).slice(0, 2).join('')}
              </div>
              <div className="min-w-0 flex-1">
                <div className="eyebrow">Student 360° profile</div>
                <h2 className="mt-1 truncate text-2xl font-black tracking-[-.035em] text-ink">{student.name}</h2>
                <p className="mt-1 text-xs text-slate-500 font-medium">
                  {student.registration_number} · {student.branch} · Batch {student.passing_year}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <span className="rounded-full bg-white px-3 py-1 text-[10px] font-bold text-navy shadow-2xs">
                    CGPA {student.cgpa}
                  </span>
                  <span className="rounded-full bg-white px-3 py-1 text-[10px] font-bold text-navy shadow-2xs">
                    {student.backlogs} backlogs
                  </span>
                  <span className="flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1 text-[10px] font-bold text-slate-600">
                    <LockKeyhole size={11} /> Master record locked
                  </span>
                </div>
                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-[11px] font-bold text-navy shadow-2xs transition hover:border-brand/40">
                    <UploadCloud size={14} className="text-brand" /> Upload / refresh resume
                    <input className="hidden" type="file" accept=".pdf,.txt" onChange={e => uploadResume(e.target.files?.[0])} />
                  </label>
                  {uploadMessage && <span className="text-[10px] font-semibold text-teal-800">{uploadMessage}</span>}
                </div>
              </div>
            </div>
          </div>

          <div className="grid gap-6 p-6 md:grid-cols-[200px_1fr]">
            <div className="rounded-2xl bg-navy p-5 text-white shadow-sm flex flex-col justify-between">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-[.13em] text-white/50">Readiness score</div>
                <div className="mt-3 text-5xl font-black tracking-[-.05em]">{student.readiness_score}</div>
                <div className="mt-2 inline-flex rounded-full bg-white/10 px-2.5 py-1 text-[10px] font-bold">
                  {student.readiness_level}
                </div>
              </div>
              <div className="mt-5">
                <div className="flex justify-between text-[10px] text-white/70 mb-1">
                  <span>Score index</span>
                  <span>{student.readiness_score}/100</span>
                </div>
                <div className="h-2 rounded-full bg-white/15 overflow-hidden">
                  <i
                    className="block h-full rounded-full bg-gradient-to-r from-teal-400 to-[#8fd5c9] transition-all duration-500"
                    style={{ width: `${Math.min(100, student.readiness_score)}%` }}
                  />
                </div>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-extrabold text-ink">Readiness breakdown</h3>
                <span className="text-[10px] font-semibold text-slate-400">Live multi-pillar calculation</span>
              </div>
              <div className="mt-4 space-y-3.5">
                {[
                  ['Technical skills', student.breakdown.technical, '30% weight'],
                  ['Projects & code evidence', student.breakdown.projects, `15% weight · ${verifiedCount} verified`],
                  ['Aptitude score', student.breakdown.aptitude, '10% weight'],
                  ['Communication score', student.breakdown.communication, '10% weight'],
                ].map(([n, v, sub]) => (
                  <div key={n as string}>
                    <div className="mb-1 flex justify-between items-baseline text-[11px]">
                      <div>
                        <span className="font-bold text-slate-700">{n as string}</span>
                        <span className="ml-2 text-[10px] text-slate-400">({sub as string})</span>
                      </div>
                      <b className="text-ink">{v}%</b>
                    </div>
                    <Progress value={Number(v)} />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Right Column: Dynamic Company-Specific Skill Gap Analysis */}
        <section className="panel p-5 shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 border-b border-slate-100 pb-3">
            <div>
              <div className="eyebrow flex items-center gap-1.5 text-teal-700">
                <Target size={12} className="text-teal-600" />
                Drive Skill-Gap Comparator
              </div>
              <h3 className="mt-1 text-lg font-black tracking-[-.03em] text-ink">
                {skillGap?.company || student.target_role || 'Campus Placement Drive'}
              </h3>
              <p className="text-[11px] text-slate-500 font-medium">
                {skillGap?.role || 'Software Engineering'} {skillGap?.ctc ? `· ₹${skillGap.ctc} LPA` : ''}
              </p>
            </div>
            {skillGap && (
              <div className="flex sm:flex-col items-center sm:items-end justify-between gap-1.5">
                <span className={`rounded-full px-2.5 py-1 text-xs font-black shadow-2xs ${
                  skillGap.match_percentage >= 70
                    ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                    : skillGap.match_percentage >= 45
                    ? 'bg-amber-100 text-amber-800 border border-amber-200'
                    : 'bg-rose-100 text-rose-800 border border-rose-200'
                }`}>
                  {skillGap.match_percentage}% JD Match
                </span>
                {skillGap.eligible ? (
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-600">
                    <CheckCircle2 size={10} /> Eligible
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold text-rose-500" title={skillGap.eligibility_reason}>
                    <CircleAlert size={10} /> Criteria Alert
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Arriving Campus Drives Dropdown & Custom Search */}
          <div className="rounded-xl border border-teal-100 bg-teal-50/40 p-3">
            <div className="flex flex-col sm:flex-row gap-2.5 items-stretch sm:items-end justify-between">
              <div className="flex-1">
                <label className="text-[10px] font-black uppercase tracking-wider text-teal-900 block mb-1">
                  Compare with Arriving Campus Drive:
                </label>
                <select
                  value={selectedDriveId}
                  onChange={(e) => handleSelectDrive(e.target.value)}
                  disabled={gapLoading}
                  className="w-full rounded-lg border border-teal-200 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-800 shadow-2xs focus:border-teal-500 focus:outline-none"
                >
                  {skillGap?.available_drives?.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.company} — {d.role} {d.ctc ? `(₹${d.ctc} LPA)` : ''}
                    </option>
                  ))}
                  {(!skillGap?.available_drives || skillGap.available_drives.length === 0) && (
                    <option value="">No active drives</option>
                  )}
                </select>
              </div>

              <form onSubmit={handleCustomCompanySearch} className="flex items-center gap-1.5">
                <input
                  type="text"
                  placeholder="Or enter company name…"
                  value={customCompany}
                  onChange={(e) => setCustomCompany(e.target.value)}
                  className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700 shadow-2xs focus:border-teal-500 focus:outline-none w-full sm:w-40"
                />
                <Button
                  size="sm"
                  type="submit"
                  disabled={gapLoading || !customCompany.trim()}
                  className="h-8 text-xs font-bold shrink-0 bg-teal-700 hover:bg-teal-800 text-white"
                >
                  {gapLoading ? <Loader2 size={12} className="animate-spin" /> : 'Compare'}
                </Button>
              </form>
            </div>
          </div>

          {/* Comparative Skill Grid */}
          <div className="grid gap-3 sm:grid-cols-2">
            {/* Matched Skills for this Company's JD */}
            <div className="rounded-xl bg-slate-50 p-3.5 border border-slate-100 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between border-b border-slate-200/60 pb-2">
                  <span className="text-[10px] font-bold uppercase tracking-[.1em] text-slate-600">
                    JD Requirements Met ({skillGap?.matched_skills?.length || 0})
                  </span>
                  <span className="text-[10px] font-bold text-emerald-600">✓ On Resume</span>
                </div>
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  {skillGap?.matched_skills?.map((item) => (
                    <span
                      key={item.skill}
                      title={`Matched via: ${item.matched_by.join(', ')}`}
                      className="inline-flex items-center gap-1.5 rounded-md bg-emerald-50 border border-emerald-200 px-2 py-1 text-[11px] font-semibold text-emerald-950 shadow-2xs"
                    >
                      <CheckCircle2 size={11} className="text-emerald-600 shrink-0" />
                      <span>{item.skill}</span>
                    </span>
                  ))}
                  {(!skillGap?.matched_skills || skillGap.matched_skills.length === 0) && (
                    <p className="text-xs text-slate-400 italic py-1">No direct skill matches found for this JD.</p>
                  )}
                </div>
              </div>
            </div>

            {/* Targeted Skill Gaps to Close */}
            <div className="rounded-xl bg-amber-50/50 p-3.5 border border-amber-200/60 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between border-b border-amber-200/60 pb-2">
                  <span className="text-[10px] font-bold uppercase tracking-[.1em] text-amber-900">
                    Gaps for this Company ({skillGap?.missing_skills?.length || 0})
                  </span>
                  <span className="text-[10px] font-bold text-amber-800">Targeted</span>
                </div>
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  {skillGap?.missing_skills?.map((item) => (
                    <span
                      key={item.skill}
                      className={`inline-flex items-center gap-1.5 rounded-md bg-white px-2 py-1 text-[11px] font-semibold shadow-2xs ${
                        item.importance === 'high'
                          ? 'border border-rose-300 text-rose-900'
                          : 'border border-amber-200 text-amber-900'
                      }`}
                    >
                      <CircleAlert
                        size={11}
                        className={item.importance === 'high' ? 'text-rose-600 shrink-0' : 'text-amber-600 shrink-0'}
                      />
                      <span>{item.skill}</span>
                    </span>
                  ))}
                  {(!skillGap?.missing_skills || skillGap.missing_skills.length === 0) && (
                    <p className="text-xs text-emerald-700 font-semibold py-1">
                      ✓ Perfect match! You fulfill all technical requirements for this company.
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Company-Specific Preparation Roadmap */}
          {skillGap?.company_advice && skillGap.company_advice.length > 0 && (
            <div className="rounded-xl bg-slate-900 p-3.5 text-white shadow-xs">
              <div className="flex items-center gap-2 text-xs font-black text-amber-300">
                <Lightbulb size={13} className="shrink-0" />
                <span>Preparation Strategy for {skillGap.company}</span>
              </div>
              <ul className="mt-2 space-y-1.5">
                {skillGap.company_advice.map((tip, idx) => (
                  <li key={idx} className="flex items-start gap-2 text-[11px] text-slate-200">
                    <span className="text-teal-400 font-bold shrink-0 mt-0.5">›</span>
                    <span>{tip}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>

        {/* VERIFIED GITHUB PROJECTS & CODE EVIDENCE ENGINE */}
        <section className="panel p-5 md:p-6 shadow-sm xl:col-span-2">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-100 pb-4">
            <div>
              <div className="inline-flex items-center gap-1.5 text-xs font-bold text-navy">
                <Github size={15} className="text-ink" />
                Project Code Verification Engine
              </div>
              <p className="text-xs text-slate-500 mt-1">
                Verified GitHub repositories with real commits award <b>35 pts</b> each to your readiness score.
                Self-declared projects without GitHub repositories award only <b>12 pts</b>.
              </p>
            </div>

            <Button
              variant="secondary"
              className="text-xs font-bold shrink-0"
              onClick={() => setAddingProject(!addingProject)}
            >
              <Plus size={14} /> Link GitHub project
            </Button>
          </div>

          {projectNotice && (
            <div className="mt-4 rounded-xl border border-teal-200 bg-teal-50 p-3 text-xs font-semibold text-teal-800 flex items-center gap-2">
              <CheckCircle2 size={16} className="text-teal-600 shrink-0" />
              {projectNotice}
            </div>
          )}

          {/* Add / Link GitHub Project Form */}
          {addingProject && (
            <form onSubmit={handleAddProject} className="mt-4 rounded-2xl border border-slate-200 bg-slate-50/80 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-black text-ink">Verify a project repository</h4>
                <span className="text-[10px] text-slate-500">Public GitHub repos only</span>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-[11px] font-bold text-slate-600">
                  Project Title
                  <input
                    type="text"
                    required
                    placeholder="e.g. AI Placement Platform"
                    className="field mt-1 py-1.5 text-xs bg-white"
                    value={projectForm.title}
                    onChange={e => setProjectForm(f => ({ ...f, title: e.target.value }))}
                  />
                </label>
                <label className="block text-[11px] font-bold text-slate-600">
                  GitHub Repository URL
                  <input
                    type="text"
                    required
                    placeholder="https://github.com/username/project-repo"
                    className="field mt-1 py-1.5 text-xs bg-white"
                    value={projectForm.github_url}
                    onChange={e => setProjectForm(f => ({ ...f, github_url: e.target.value }))}
                  />
                </label>
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <Button variant="secondary" type="button" onClick={() => setAddingProject(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={verifying}>
                  {verifying ? <Loader2 size={14} className="animate-spin" /> : <ShieldCheck size={14} />}
                  {verifying ? 'Verifying on GitHub…' : 'Verify & update score'}
                </Button>
              </div>
            </form>
          )}

          {/* Project Cards Grid */}
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {projectsList.map((item, idx) => (
              <div
                key={idx}
                className={`rounded-xl border p-4 transition ${
                  item.verified
                    ? 'border-teal-200 bg-teal-50/20 hover:border-teal-300'
                    : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <h4 className="text-xs font-black text-ink truncate">{item.title}</h4>
                  {item.verified ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100/70 text-emerald-800 px-2 py-0.5 text-[9px] font-bold shrink-0">
                      <ShieldCheck size={10} /> Verified
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 text-amber-800 px-2 py-0.5 text-[9px] font-bold shrink-0">
                      <AlertTriangle size={10} /> Unverified
                    </span>
                  )}
                </div>

                <div className="mt-3 flex items-center gap-2 text-[11px] text-slate-500">
                  {item.language && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-slate-600 bg-slate-100 rounded px-1.5 py-0.5">
                      <Code2 size={11} /> {item.language}
                    </span>
                  )}
                  {item.stars ? (
                    <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-amber-700">
                      <Star size={10} className="fill-amber-500 text-amber-500" /> {item.stars}
                    </span>
                  ) : null}
                </div>

                <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-[11px]">
                  {item.github_url ? (
                    <a
                      href={item.github_url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-teal-800 font-bold hover:underline"
                    >
                      GitHub Repo <ExternalLink size={11} />
                    </a>
                  ) : (
                    <span className="text-slate-400 text-[10px]">No repository linked</span>
                  )}
                  <span className="text-[10px] font-bold text-slate-400">
                    {item.verified ? '+35 pts evidence' : '+12 pts (self-declared)'}
                  </span>
                </div>
              </div>
            ))}

            {!projectsList.length && (
              <div className="col-span-full rounded-xl border border-dashed border-slate-200 p-8 text-center text-xs text-slate-500">
                No projects listed yet. Upload a resume or click <b>"Link GitHub project"</b> above to add code evidence and boost your readiness score.
              </div>
            )}
          </div>
        </section>

        {/* AI PLACEMENT RECOMMENDATIONS & ACTION PLAN */}
        {recommendations.length > 0 && (
          <section className="panel p-5 md:p-6 shadow-sm xl:col-span-2 bg-gradient-to-br from-white via-white to-teal-50/30">
            <div className="flex items-center gap-2">
              <span className="grid h-8 w-8 place-items-center rounded-xl bg-teal-100 text-teal-800">
                <Lightbulb size={16} />
              </span>
              <div>
                <h3 className="text-sm font-black text-ink">Personalized Placement Action Plan</h3>
                <p className="text-[11px] text-slate-500">
                  Targeted recommendations based on your verified code evidence and active campus hiring demand
                </p>
              </div>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-3">
              {recommendations.map((rec, i) => (
                <div
                  key={i}
                  className="rounded-xl border border-teal-100 bg-white p-3.5 shadow-2xs flex items-start gap-2.5"
                >
                  <span className="grid h-5 w-5 place-items-center rounded-full bg-teal-50 text-[10px] font-black text-teal-800 shrink-0 mt-0.5">
                    {i + 1}
                  </span>
                  <p className="text-xs font-semibold text-slate-700 leading-relaxed">{rec}</p>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Current Placement Journey */}
        <section className="panel p-5 shadow-sm xl:col-span-2">
          <div className="eyebrow">Placement journey</div>
          <h3 className="mt-1 text-lg font-black text-ink">Active Application Status</h3>
          <div className="mt-4 space-y-2.5">
            {journeyItems.map(item => (
              <div
                key={item.id || item.company}
                className="flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50/70 p-3"
              >
                <span className="grid h-9 w-9 place-items-center rounded-xl bg-white text-brand shadow-2xs">
                  <Target size={15} />
                </span>
                <div className="min-w-0 flex-1">
                  <b className="block truncate text-xs text-ink">{item.company} · {item.role}</b>
                  <small className="text-[10px] text-slate-500">{item.detail}</small>
                </div>
                <StatusBadge status={item.status} />
              </div>
            ))}
            {!journeyItems.length && (
              <p className="text-xs text-slate-500 py-3 text-center">No active applications submitted yet.</p>
            )}
          </div>
        </section>
      </div>
    </DashboardShell>
  )
}
