'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import { CheckCircle2, ListFilter, Users } from 'lucide-react'
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
  const [sent, setSent] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  useEffect(() => {
    setLoading(true)
    setDrive(null)
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
    setSelected(s => (s.includes(id) ? s.filter(x => x !== id) : s.length < 50 ? [...s, id] : s))
  }

  async function submit() {
    setErrorMsg('')
    try {
      await api.selectCandidates(id, selected)
      setSent(true)
    } catch (err: any) {
      setErrorMsg(err.message || 'Could not send selection to admin')
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
      subtitle="Verified candidates ranked by skill match, evidence, assessments and official academic data."
    >
      <div className="mb-5 flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-4 sm:flex-row sm:items-center">
        <div className="flex-1">
          <div className="eyebrow">Ranking workspace</div>
          <h2 className="mt-1 text-lg font-black">Pick up to 50 candidates</h2>
          <p className="mt-1 text-[11px] text-slate-500">Only Gate 2 verified applications appear here.</p>
        </div>
        <div className="flex items-center gap-2 rounded-xl bg-mist px-3 py-2 text-xs font-bold text-navy">
          <Users size={15} />
          {selected.length} selected
        </div>
        <Button onClick={submit} disabled={!selected.length || sent}>
          {sent ? (
            <>
              <CheckCircle2 size={15} />
              Sent to Gate 3
            </>
          ) : (
            'Send selection to admin'
          )}
        </Button>
      </div>

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
            Candidates will appear here automatically once eligible students opt in and the placement cell verifies their academic claims in Gate 2.
          </p>
        </div>
      ) : (
        <div className="space-y-3">

        {apps
          .sort((a, b) => (b.fit_score || 0) - (a.fit_score || 0))
          .map((a, i) => (
            <article
              key={a.id}
              className={`panel p-4 transition ${selected.includes(a.id) ? 'ring-2 ring-brand/30' : ''}`}
            >
              <div className="grid gap-4 xl:grid-cols-[40px_1.1fr_.9fr_330px_auto] xl:items-center">
                <div className="text-center text-xs font-black text-slate-400">#{i + 1}</div>
                <div className="min-w-0">
                  <div className="flex items-center gap-3">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-navy text-[10px] font-black text-white">
                      {a.student_name
                        .split(' ')
                        .map(x => x[0])
                        .slice(0, 2)
                        .join('')}
                    </span>
                    <div className="min-w-0">
                      <h3 className="truncate text-sm font-black">{a.student_name}</h3>
                      <p className="text-[10px] text-slate-500">
                        {a.branch} · CGPA {a.cgpa}
                      </p>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {a.skills?.map(s => (
                      <span
                        key={s}
                        className="rounded-lg bg-slate-100 px-2 py-1 text-[9px] font-semibold text-slate-600"
                      >
                        {s}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="min-w-0">
                  <div className="mb-2 flex items-center gap-2">
                    <StatusBadge status={a.status} />
                    <span className="text-[10px] text-slate-400">Verified evidence</span>
                  </div>
                  <ul className="space-y-1.5 text-[10px] leading-relaxed text-slate-600">
                    {a.reasons?.slice(0, 3).map((r, j) => (
                      <li key={j} className="break-words">
                        • {r}
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="min-w-0">
                  <FitScoreCard score={a.fit_score || 0} reasons={a.reasons} />
                </div>

                <label className="flex items-center gap-2 text-xs font-bold text-slate-600">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-brand"
                    checked={selected.includes(a.id)}
                    onChange={() => toggle(a.id)}
                  />
                  Select
                </label>
              </div>
            </article>
          ))}
        </div>

      )}
    </DashboardShell>
  )
}

