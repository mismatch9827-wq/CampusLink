'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import { CheckCircle2, Eye, EyeOff, Users } from 'lucide-react'
import { DashboardShell } from '@/components/DashboardShell'
import { FitScoreCard } from '@/components/FitScoreCard'
import { Button } from '@/components/ui/Button'
import { StatusBadge } from '@/components/StatusBadge'
import { api } from '@/lib/api'
import type { Application, Drive } from '@/lib/types'


export default function RankedDrivePage() {
  const params = useParams<{ id: string }>()
  const id = String(params.id)
  const [drive, setDrive] = useState<Drive | null>(null)
  const [apps, setApps] = useState<Application[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<string[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState('')
  const [errorMsg, setErrorMsg] = useState('')

  const rankedApps = useMemo(
    () => [...apps].sort((a, b) => (b.fit_score || 0) - (a.fit_score || 0)),
    [apps],
  )

  useEffect(() => {
    setLoading(true)
    setDrive(null)
    setApps([])
    setSelected([])
    setExpandedId(null)
    setSuccessMsg('')
    setErrorMsg('')
    Promise.all([
      api.drive(id),
      api.ranked(id),
    ]).then(([d, rankedApps]) => {
      setDrive(d as Drive)
      setApps(rankedApps)
    }).catch((err: Error) => setErrorMsg(err.message)).finally(() => setLoading(false))
  }, [id])

  function toggle(id: string) {
    const application = apps.find(app => app.id === id)
    if (!application || application.status !== 'verified' || submitting) return
    setSelected(current => (
      current.includes(id)
        ? current.filter(selectedId => selectedId !== id)
        : current.length < 50
          ? [...current, id]
          : current
    ))
  }

  function handleQuickSelect(countStr: string) {
    if (countStr === 'none') {
      setSelected([])
      return
    }
    const selectable = rankedApps.filter(app => app.status === 'verified')
    if (countStr === 'all') {
      setSelected(selectable.slice(0, 50).map(a => a.id))
    } else {
      const n = parseInt(countStr, 10)
      if (!isNaN(n)) {
        setSelected(selectable.slice(0, Math.min(50, n)).map(a => a.id))
      }
    }
  }

  async function submit() {
    if (!selected.length || submitting) return
    setErrorMsg('')
    setSuccessMsg('')
    setSubmitting(true)
    const submittedIds = [...selected]
    try {
      await api.selectCandidates(id, submittedIds)
      setApps(current => current.map(app => (
        submittedIds.includes(app.id)
          ? { ...app, status: 'selected_by_recruiter' }
          : app
      )))
      setSelected([])
      setSuccessMsg(`${submittedIds.length} candidate${submittedIds.length === 1 ? '' : 's'} sent to admin.`)
    } catch (err: any) {
      setErrorMsg(err.message || 'Could not send selection to admin')
      try {
        const latest = await api.ranked(id)
        setApps(latest)
        const verifiedIds = new Set(latest.filter(app => app.status === 'verified').map(app => app.id))
        setSelected(current => current.filter(selectedId => verifiedIds.has(selectedId)))
      } catch {}
    } finally {
      setSubmitting(false)
    }
  }

  if (!loading && !drive) {
    return (
      <DashboardShell role="recruiter" title="Drive unavailable" subtitle="The requested job could not be loaded.">
        <div className="panel p-8 text-center text-sm text-slate-500">{errorMsg || 'Drive not found.'}</div>
      </DashboardShell>
    )
  }

  return (
    <DashboardShell
      role="recruiter"
      title={drive ? `${drive.company} · ${drive.role}` : 'Loading drive'}
      subtitle="Review ranked candidates and send your selection to admin."
    >
      <div className="mb-5 flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-4 sm:flex-row sm:items-center">
        <div className="flex-1">
          <div className="eyebrow">Candidate ranking & fitness engine</div>
          <h2 className="mt-1 text-lg font-black">Ranked candidates</h2>
          <p className="mt-1 text-[11px] text-slate-500">
            Select candidates individually or use the dropdown to select top ranked candidates (up to 50).
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex items-center gap-1.5 text-xs font-bold text-slate-600">
            <span>Select top:</span>
            <select
              onChange={(e) => handleQuickSelect(e.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-bold text-navy shadow-2xs focus:border-brand focus:outline-none"
              defaultValue="none"
            >
              <option value="none">Manual / Clear</option>
              <option value="5">Top 5 candidates</option>
              <option value="10">Top 10 candidates</option>
              <option value="20">Top 20 candidates</option>
              <option value="50">Top 50 candidates</option>
              <option value="all">Select all eligible</option>
            </select>
          </div>
          <div className="flex items-center gap-1.5 rounded-xl bg-mist px-3 py-2 text-xs font-bold text-navy">
            <Users size={15} />
            {selected.length} selected
          </div>
          <Button onClick={submit} disabled={!selected.length || submitting}>
            {submitting ? 'Sending…' : 'Send selection to admin'}
          </Button>
        </div>
      </div>

      {successMsg && (
        <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs font-semibold text-emerald-800">
          <CheckCircle2 size={14} className="mr-1.5 inline" />{successMsg} Those candidates can no longer be selected again.
        </div>
      )}

      {errorMsg && (
        <div className="mb-4 rounded-xl border border-red-100 bg-red-50 p-3 text-xs text-red-700">
          {errorMsg}
        </div>
      )}

      {loading ? (
        <div className="panel p-10 text-center text-xs text-slate-500">Loading ranked candidates from backend…</div>
      ) : apps.length === 0 ? (
        <div className="panel p-12 text-center text-sm text-slate-500">
          <div className="font-bold text-base text-slate-700">No verified candidates yet for this drive</div>
          <p className="mt-1.5 text-xs text-slate-500 max-w-md mx-auto">
            Candidates will appear here after students apply and their academic information is verified by the placement cell (Gate 2).
          </p>
        </div>
      ) : (
        <div className="panel overflow-hidden">
          <div className="table-scroll">
            <table className="w-full min-w-[760px] text-left text-xs">
              <thead className="bg-mist/70 text-[10px] uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-bold">Rank</th>
                  <th className="px-4 py-3 font-bold">Student</th>
                  <th className="px-4 py-3 font-bold">Branch</th>
                  <th className="px-4 py-3 font-bold">CGPA</th>
                  <th className="px-4 py-3 font-bold">Fit score</th>
                  <th className="px-4 py-3 font-bold">Status</th>
                  <th className="px-4 py-3 text-right font-bold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rankedApps.map((app, index) => (
                  <React.Fragment key={app.id}>
                    <tr className={`transition hover:bg-slate-50/70 ${selected.includes(app.id) ? 'bg-brand/[.04]' : ''}`}>
                      <td className="px-4 py-3.5 font-black text-slate-400">#{index + 1}</td>
                      <td className="px-4 py-3.5">
                        <div className="font-bold text-ink">{app.student_name}</div>
                      </td>
                      <td className="px-4 py-3.5 text-slate-600">{app.branch || '—'}</td>
                      <td className="px-4 py-3.5 font-semibold text-slate-700">{app.cgpa ?? '—'}</td>
                      <td className="px-4 py-3.5">
                        <span className="font-black text-navy">{app.fit_score ?? 0}</span>
                        <span className="text-slate-400">/100</span>
                      </td>
                      <td className="px-4 py-3.5"><StatusBadge status={app.status} /></td>
                      <td className="px-4 py-3.5">
                        <div className="flex items-center justify-end gap-3">
                          {app.status === 'verified' ? (
                            <label className="flex cursor-pointer items-center gap-1.5 font-semibold text-slate-600">
                              <input
                                type="checkbox"
                                className="h-4 w-4 accent-brand cursor-pointer"
                                checked={selected.includes(app.id)}
                                disabled={submitting}
                                onChange={() => toggle(app.id)}
                                aria-label={`Select ${app.student_name}`}
                              />
                              Select
                            </label>
                          ) : (
                            <span className="text-[10px] font-semibold text-slate-400">
                              {app.status === 'selected_by_recruiter' ? 'Selected' : 'Shortlisted'}
                            </span>
                          )}
                          <Button
                            variant="secondary"
                            className="px-3 py-1.5"
                            onClick={() => setExpandedId(current => current === app.id ? null : app.id)}
                            aria-expanded={expandedId === app.id}
                          >
                            {expandedId === app.id ? <EyeOff size={14} /> : <Eye size={14} />}
                            {expandedId === app.id ? 'Hide' : 'View'}
                          </Button>
                        </div>
                      </td>
                    </tr>
                    {expandedId === app.id && (
                      <tr className="bg-slate-50/70">
                        <td colSpan={7} className="p-4 md:p-5">
                          <div className="grid gap-5 lg:grid-cols-[1fr_1.1fr]">
                            <section className="min-w-0">
                              <div className="eyebrow">Candidate details</div>
                              <h3 className="mt-1 text-base font-black">{app.student_name}</h3>
                              <p className="mt-1 text-xs text-slate-500">{app.branch || 'Branch not provided'} · CGPA {app.cgpa ?? '—'}</p>
                              <div className="mt-4">
                                <div className="mb-2 text-[10px] font-bold uppercase tracking-wide text-slate-500">Skills</div>
                                <div className="flex flex-wrap gap-1.5">
                                  {app.skills?.length ? app.skills.map(skill => (
                                    <span key={skill} className="rounded-md bg-white px-2.5 py-1.5 text-[10px] font-semibold text-slate-600 ring-1 ring-slate-200">
                                      {skill}
                                    </span>
                                  )) : <span className="text-xs text-slate-500">No parsed skills available.</span>}
                                </div>
                              </div>
                              {app.flags?.length > 0 && (
                                <div className="mt-4">
                                  <div className="mb-2 text-[10px] font-bold uppercase tracking-wide text-slate-500">Verification notes</div>
                                  <ul className="space-y-2">
                                    {app.flags.map((flag, flagIndex) => (
                                      <li key={`${flag.label}-${flagIndex}`} className="rounded-lg bg-white p-2.5 ring-1 ring-slate-200">
                                        <div className="text-xs font-bold text-slate-700">{flag.label}</div>
                                        <p className="mt-0.5 text-[11px] leading-relaxed text-slate-500">{flag.detail}</p>
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                            </section>
                            <div className="min-w-0">
                              <FitScoreCard score={app.fit_score || 0} reasons={app.reasons} />
                              {(app.matched_skills?.length || app.missing_skills?.length) ? (
                                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                                  <div className="rounded-xl border border-emerald-100 bg-emerald-50/70 p-3">
                                    <div className="text-[10px] font-bold uppercase tracking-wide text-emerald-800">Matched skills</div>
                                    <p className="mt-1.5 text-xs leading-relaxed text-emerald-900">{app.matched_skills?.join(', ') || 'None listed'}</p>
                                  </div>
                                  <div className="rounded-xl border border-amber-100 bg-amber-50/70 p-3">
                                    <div className="text-[10px] font-bold uppercase tracking-wide text-amber-800">Skills to develop</div>
                                    <p className="mt-1.5 text-xs leading-relaxed text-amber-900">{app.missing_skills?.join(', ') || 'None listed'}</p>
                                  </div>
                                </div>
                              ) : null}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </div>

      )}
    </DashboardShell>
  )
}

