import React from 'react'
import Link from 'next/link'
import { Building2, CalendarDays, IndianRupee, MapPin, CheckCircle2, Clock, Sparkles, Trophy, Award, Loader2 } from 'lucide-react'
import type { Drive } from '@/lib/types'
import { StatusBadge } from './StatusBadge'
import { Button } from './ui/Button'

interface DriveCardProps {
  drive: Drive
  studentMode?: boolean
  onOptIn?: (id: string) => void
  loading?: boolean
}

export function DriveCard({ drive, studentMode = false, onOptIn, loading = false }: DriveCardProps) {
  const isOptedIn = Boolean(drive.opted_in)
  const appStatus = drive.application_status

  // Determine application status text and styling if opted in
  const renderStudentStatus = () => {
    if (isOptedIn) {
      if (appStatus === 'shortlisted') {
        return (
          <div className="mb-3 rounded-xl border border-indigo-200 bg-indigo-50/70 p-3 text-[11px] leading-5 text-indigo-900">
            <div className="flex items-center gap-1.5 font-bold text-indigo-700">
              <Sparkles size={14} className="text-indigo-600" /> Shortlisted for Interview!
            </div>
            <div className="text-slate-600">Congratulations! The recruiter has shortlisted your profile for the next round.</div>
            {drive.fit_score != null && (
              <div className="mt-1 font-semibold text-indigo-800">AI Match Score: {drive.fit_score}%</div>
            )}
          </div>
        )
      }
      if (appStatus === 'selected_by_recruiter' || appStatus === 'offered') {
        return (
          <div className="mb-3 rounded-xl border border-emerald-200 bg-emerald-50/70 p-3 text-[11px] leading-5 text-emerald-900">
            <div className="flex items-center gap-1.5 font-bold text-emerald-800">
              <Trophy size={14} className="text-emerald-700" /> {appStatus === 'offered' ? 'Official Offer Issued!' : 'Selected by Recruiter!'}
            </div>
            <div className="text-slate-600">You have been selected for this position. Awaiting Gate 3 formal offer workflow.</div>
          </div>
        )
      }
      if (appStatus === 'verified') {
        return (
          <div className="mb-3 rounded-xl border border-teal-200 bg-teal-50/70 p-3 text-[11px] leading-5 text-teal-900">
            <div className="flex items-center gap-1.5 font-bold text-teal-800">
              <CheckCircle2 size={14} className="text-teal-600" /> Admin Verified & AI Ranked
            </div>
            <div className="text-slate-600">Academic credentials verified. Recruiter will evaluate profiles for shortlisting.</div>
            {drive.fit_score != null && (
              <div className="mt-1 font-semibold text-teal-900">AI Placement Fit Score: {drive.fit_score}%</div>
            )}
          </div>
        )
      }
      if (appStatus === 'rejected') {
        return (
          <div className="mb-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-[11px] leading-5 text-slate-700">
            <div className="font-bold text-slate-700">Application Closed</div>
            <div className="text-slate-500">Your application was not progressed for this hiring drive.</div>
          </div>
        )
      }
      // Default: opted_in (awaiting Gate 2 verification)
      return (
        <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50/80 p-3 text-[11px] leading-5 text-amber-900">
          <div className="flex items-center gap-1.5 font-bold text-amber-800">
            <Clock size={14} className="text-amber-700" /> Opted In · Under Verification
          </div>
          <div className="text-amber-800/80">Application submitted. Placement admin is validating academic & project credentials.</div>
        </div>
      )
    }

    // Not opted in yet
    return (
      <div
        className={`mb-3 rounded-xl border p-3 text-[11px] leading-5 ${
          drive.eligible ? 'border-emerald-100 bg-emerald-50 text-emerald-800' : 'border-red-100 bg-red-50 text-red-700'
        }`}
      >
        <b className="block">{drive.eligible ? 'Academic Eligibility Satisfied' : 'Not eligible'}</b>
        <div className="text-slate-600">{drive.eligibility_reason || 'Eligible based on academic master records.'}</div>
      </div>
    )
  }

  // Determine button state and text
  const renderStudentButton = () => {
    if (isOptedIn) {
      const label =
        appStatus === 'shortlisted'
          ? '🎉 Shortlisted'
          : appStatus === 'selected_by_recruiter' || appStatus === 'offered'
          ? '🏆 Selected'
          : appStatus === 'verified'
          ? '✓ Verified Candidate'
          : '✓ Already Opted In'

      return (
        <Button
          type="button"
          disabled
          className="w-full bg-slate-100 text-slate-600 border border-slate-200 cursor-not-allowed hover:bg-slate-100 font-bold"
        >
          {label}
        </Button>
      )
    }

    if (!drive.eligible) {
      return (
        <Button type="button" disabled className="w-full opacity-60 cursor-not-allowed font-semibold">
          Ineligible for this drive
        </Button>
      )
    }

    if (drive.status !== 'open_for_optin') {
      return (
        <Button type="button" disabled className="w-full opacity-60 cursor-not-allowed font-semibold">
          Opt-in closed
        </Button>
      )
    }

    return (
      <Button
        type="button"
        className="w-full font-bold shadow-sm"
        disabled={loading}
        onClick={() => onOptIn?.(drive.id)}
      >
        {loading ? (
          <>
            <Loader2 size={15} className="animate-spin mr-1.5" /> Opting in…
          </>
        ) : (
          'Opt in to drive'
        )}
      </Button>
    )
  }

  return (
    <article className="panel overflow-hidden transition hover:-translate-y-0.5 hover:shadow-lift flex flex-col justify-between">
      <div>
        <div className="border-b border-slate-100 p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 gap-3">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-mist text-navy">
                <Building2 size={20} />
              </span>
              <div className="min-w-0">
                <h3 className="truncate text-base font-extrabold text-ink">{drive.company}</h3>
                <p className="mt-0.5 truncate text-xs text-slate-500 font-medium">{drive.role}</p>
              </div>
            </div>
            <StatusBadge status={drive.status} />
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2 text-[11px] text-slate-500">
            <span className="flex items-center gap-1.5">
              <CalendarDays size={13} className="text-slate-400" />
              {drive.date} · {drive.slot}
            </span>
            <span className="flex items-center gap-1.5 font-semibold text-slate-700">
              <IndianRupee size={13} className="text-slate-400" />
              {drive.ctc} LPA
            </span>
            <span className="col-span-2 flex items-center gap-1.5 truncate">
              <MapPin size={13} className="text-slate-400 shrink-0" />
              {drive.venue}
            </span>
          </div>
        </div>

        <div className="p-5 pb-3">
          <div className="mb-4 flex flex-wrap gap-1.5">
            {drive.required_skills.slice(0, 5).map(s => (
              <span key={s} className="rounded-lg bg-slate-100 px-2 py-1 text-[9px] font-semibold text-slate-600">
                {s}
              </span>
            ))}
          </div>
          {studentMode ? renderStudentStatus() : null}
        </div>
      </div>

      <div className="p-5 pt-0">
        {studentMode ? (
          renderStudentButton()
        ) : (
          <Link href={`/recruiter/drives/${drive.id}`}>
            <Button variant="secondary" className="w-full">
              Open drive workspace
            </Button>
          </Link>
        )}
      </div>
    </article>
  )
}
