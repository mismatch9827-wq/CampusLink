'use client'
import React, { useEffect, useState } from 'react'
import { CheckCircle2, CircleAlert, LockKeyhole, Sparkles, Target, UploadCloud } from 'lucide-react'
import { DashboardShell } from '@/components/DashboardShell'
import { Progress } from '@/components/ui/Progress'
import { StatusBadge } from '@/components/StatusBadge'
import { api } from '@/lib/api'
import type { Student } from '@/lib/types'

export default function StudentDashboard() {
  const [student, setStudent] = useState<Student | null>(null)
  const [profileError, setProfileError] = useState('')
  const [uploadMessage, setUploadMessage] = useState('')

  useEffect(() => {
    api.studentProfile()
      .then(setStudent)
      .catch((err: Error) => setProfileError(err.message))
  }, [])

  async function uploadResume(file?: File) {
    if (!file || !student) return
    setUploadMessage('Analysing resume…')
    try {
      const r = await api.uploadResume(file)
      setStudent(prev => prev && ({
        ...prev,
        parsed_skills: r.skills,
        readiness_score: r.readiness_score,
        readiness_level: r.readiness_level,
        skill_gaps: r.skill_gaps,
      }))
      // Also fetch full updated profile
      api.studentProfile().then(setStudent).catch(() => {})
      setUploadMessage('Resume parsed and readiness refreshed.')
    } catch (err) {
      setUploadMessage(err instanceof Error ? err.message : 'Could not upload resume')
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

  return (
    <DashboardShell role="student" title="My readiness" subtitle="Verified academic profile, employability signals and current placement status.">
      <div className="grid gap-5 xl:grid-cols-[1.25fr_.75fr]">
        <section className="panel overflow-hidden">
          <div className="border-b border-slate-100 bg-gradient-to-br from-white via-white to-mist/70 p-6 md:p-7">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
              <div className="grid h-20 w-20 shrink-0 place-items-center rounded-[24px] bg-navy text-xl font-black text-white">
                {student.name.split(' ').map(x => x[0]).slice(0, 2).join('')}
              </div>
              <div className="min-w-0 flex-1">
                <div className="eyebrow">Student 360° profile</div>
                <h2 className="mt-1 truncate text-2xl font-black tracking-[-.035em]">{student.name}</h2>
                <p className="mt-1 text-xs text-slate-500">{student.registration_number} · {student.branch} · Batch {student.passing_year}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <span className="rounded-full bg-white px-3 py-1 text-[10px] font-bold text-navy shadow-sm">CGPA {student.cgpa}</span>
                  <span className="rounded-full bg-white px-3 py-1 text-[10px] font-bold text-navy shadow-sm">{student.backlogs} backlogs</span>
                  <span className="flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1 text-[10px] font-bold text-slate-600">
                    <LockKeyhole size={11} /> Academic fields locked
                  </span>
                </div>
                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-[11px] font-bold text-navy shadow-sm transition hover:border-brand/30">
                    <UploadCloud size={14} /> Upload / refresh resume
                    <input className="hidden" type="file" accept=".pdf,.txt" onChange={e => uploadResume(e.target.files?.[0])} />
                  </label>
                  {uploadMessage && <span className="text-[10px] text-slate-500">{uploadMessage}</span>}
                </div>
              </div>
            </div>
          </div>
          <div className="grid gap-6 p-6 md:grid-cols-[200px_1fr]">
            <div className="rounded-2xl bg-navy p-5 text-white">
              <div className="text-[10px] font-bold uppercase tracking-[.13em] text-white/50">Readiness score</div>
              <div className="mt-3 text-5xl font-black tracking-[-.05em]">{student.readiness_score}</div>
              <div className="mt-2 inline-flex rounded-full bg-white/10 px-2.5 py-1 text-[10px] font-bold">{student.readiness_level}</div>
              <div className="mt-5 h-1.5 rounded-full bg-white/10">
                <i className="block h-full rounded-full bg-[#8fd5c9]" style={{ width: `${Math.min(100, student.readiness_score)}%` }} />
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-extrabold">Readiness breakdown</h3>
                <span className="text-[10px] text-slate-400">Live backend calculation</span>
              </div>
              <div className="mt-4 space-y-4">
                {[
                  ['Technical skills', student.breakdown.technical],
                  ['Projects & evidence', student.breakdown.projects],
                  ['Aptitude', student.breakdown.aptitude],
                  ['Communication', student.breakdown.communication],
                ].map(([n, v]) => (
                  <div key={n as string}>
                    <div className="mb-1.5 flex justify-between text-[11px]">
                      <span className="text-slate-500">{n as string}</span>
                      <b>{v}%</b>
                    </div>
                    <Progress value={Number(v)} />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="panel p-5">
          <div className="flex items-start justify-between">
            <div>
              <div className="eyebrow">Skill-gap intelligence</div>
              <h3 className="mt-1 text-xl font-black tracking-[-.03em]">{student.target_role || 'No active target role'}</h3>
            </div>
            {student.target_role && <span className="rounded-full bg-teal-50 px-2.5 py-1 text-[10px] font-bold text-teal-700">{student.target_fit}% role fit</span>}
          </div>
          <div className="mt-5 grid gap-5 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-[.1em] text-slate-400">Evidence found</div>
              <div className="mt-2 space-y-2">
                {student.parsed_skills.slice(0, 4).map(s => (
                  <div key={s} className="flex items-center gap-2 text-xs">
                    <CheckCircle2 size={14} className="text-successx" />
                    {s}
                  </div>
                ))}
              </div>
            </div>
            <div>
              <div className="text-[10px] font-bold uppercase tracking-[.1em] text-slate-400">Close these gaps</div>
              <div className="mt-2 space-y-2">
                {student.skill_gaps.map(s => (
                  <div key={s} className="flex items-center gap-2 text-xs">
                    <CircleAlert size={14} className="text-amberx" />
                    {s}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="panel p-5">
          <div className="eyebrow">Placement journey</div>
          <h3 className="mt-1 text-lg font-black">Current status</h3>
          <div className="mt-5 space-y-3">
            {journeyItems.map((item) => (
              <div key={item.id || item.company} className="flex items-center gap-3 rounded-2xl border border-slate-100 bg-slate-50/70 p-3">
                <span className="grid h-9 w-9 place-items-center rounded-xl bg-white text-brand shadow-sm">
                  <Target size={15} />
                </span>
                <div className="min-w-0 flex-1">
                  <b className="block truncate text-xs">{item.company} · {item.role}</b>
                  <small className="text-[10px] text-slate-500">{item.detail}</small>
                </div>
                <StatusBadge status={item.status} />
              </div>
            ))}
            {!journeyItems.length && <p className="text-xs text-slate-500">No placement activity yet.</p>}
          </div>
        </section>

      </div>
    </DashboardShell>
  )
}

