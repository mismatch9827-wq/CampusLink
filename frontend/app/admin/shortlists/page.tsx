'use client'

import React, { useEffect, useState } from 'react'
import { AlertTriangle, CheckCircle2, Clock3, Users } from 'lucide-react'
import { DashboardShell } from '@/components/DashboardShell'
import { GateStepper } from '@/components/GateStepper'
import { Button } from '@/components/ui/Button'
import { StatusBadge } from '@/components/StatusBadge'
import { api } from '@/lib/api'

export default function Shortlists() {
  const [items, setItems] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    loadQueue()
  }, [])

  function loadQueue() {
    setLoading(true)
    api.shortlistQueue()
      .then(res => {
        setItems(res)
        setLoading(false)
      })
      .catch((reason: Error) => {
        setError(reason.message)
        setLoading(false)
      })
  }

  async function resolveAndApprove(id: string, alternateSlot?: string) {
    try {
      await api.approveShortlist(id, alternateSlot ? { resolved_slot: alternateSlot } : undefined)
      setNotice(alternateSlot ? `Slot resolved to ${alternateSlot} and shortlist published!` : 'Shortlist approved and published to students!')
      setItems(xs => xs.filter(x => x.id !== id))
    } catch (err: any) {
      alert(err.message || 'Could not approve shortlist')
    }
  }

  return (
    <DashboardShell
      role="admin"
      title="Gate 3 · Shortlist approval"
      subtitle="Final admin approval runs drive, venue and student-overlap conflict checks before publishing."
    >
      <div className="mb-5">
        <GateStepper active={3} />
      </div>

      {notice && (
        <div className="mb-4 rounded-xl border border-emerald-100 bg-emerald-50 p-3 text-xs text-emerald-700">
          {notice}
        </div>
      )}
      {error && <div className="mb-4 rounded-xl border border-red-100 bg-red-50 p-3 text-xs text-red-700">{error}</div>}

      {loading ? (
        <div className="panel p-10 text-center text-xs text-slate-500">
          Checking shortlist queue and running conflict checks…
        </div>
      ) : (
        <div className="space-y-4">
          {items.map(q => (
            <article key={q.id} className="panel p-5">
              <div className="grid gap-5 xl:grid-cols-[1fr_.85fr_auto] xl:items-center">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-base font-black">{q.company} · {q.role}</h2>
                    <StatusBadge status={q.status} />
                  </div>
                  <div className="mt-3 flex items-center gap-3 text-[11px] text-slate-500">
                    <span className="flex items-center gap-1">
                      <Users size={14} />
                      {q.count} recruiter-selected
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock3 size={14} />
                      Ready for final review
                    </span>
                  </div>
                </div>

                <div className={`rounded-2xl border p-4 ${q.conflicts ? 'border-amber-100 bg-amber-50' : 'border-emerald-100 bg-emerald-50'}`}>
                  <div className={`flex items-center gap-2 text-xs font-black ${q.conflicts ? 'text-amber-700' : 'text-emerald-700'}`}>
                    {q.conflicts ? <AlertTriangle size={16} /> : <CheckCircle2 size={16} />}
                    {q.conflicts ? `${q.conflicts} conflict(s) detected` : 'Conflict check passed'}
                  </div>
                  <p className="mt-1 text-[10px] leading-5 text-slate-600">{q.detail}</p>
                  {q.conflicts > 0 && (
                    <button
                      onClick={() => resolveAndApprove(q.id, '14:00–16:00')}
                      className="mt-2 text-[10px] font-bold text-amber-700 underline hover:text-amber-900"
                    >
                      Resolve conflict using suggested alternate slot: 14:00–16:00 →
                    </button>
                  )}
                </div>

                <Button onClick={() => resolveAndApprove(q.id)} disabled={q.conflicts > 0}>
                  Approve & publish
                </Button>
              </div>
            </article>
          ))}

          {!items.length && (
            <div className="panel p-10 text-center text-sm text-slate-500">
              <div className="font-bold text-slate-700">All pending shortlists have been processed.</div>
              <p className="mt-1 text-xs">New shortlists will appear here as recruiters complete their candidate selections in Gate 3.</p>
            </div>
          )}
        </div>
      )}
    </DashboardShell>
  )
}

