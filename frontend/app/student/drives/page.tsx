"use client"

import React, { useEffect, useState } from "react"
import { DashboardShell } from "@/components/DashboardShell"
import { DriveCard } from "@/components/DriveCard"
import { api } from "@/lib/api"
import type { Drive } from "@/lib/types"
import {
  Briefcase,
  CheckCircle2,
  Clock,
  Sparkles,
  AlertCircle,
  X,
  Search,
  Filter,
} from "lucide-react"

export default function StudentDrives() {
  const [drives, setDrives] = useState<Drive[]>([])
  const [loading, setLoading] = useState(true)
  const [optInProgress, setOptInProgress] = useState<Record<string, boolean>>({})
  const [notice, setNotice] = useState("")
  const [error, setError] = useState("")
  const [filterTab, setFilterTab] = useState<"all" | "open" | "opted_in">("all")
  const [searchQuery, setSearchQuery] = useState("")

  const loadDrives = async () => {
    try {
      const data = await api.studentDrives()
      setDrives(data)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not load campus drives")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadDrives()
  }, [])

  async function handleOptIn(id: string) {
    if (optInProgress[id]) return

    setOptInProgress(prev => ({ ...prev, [id]: true }))
    setError("")
    setNotice("")

    try {
      const res = await api.optIn(id)
      setNotice(
        res?.message
          ? `${res.message}! Your application is now queued for Gate 2 placement verification.`
          : "Opt-in recorded successfully! Your application is now queued for Gate 2 placement verification."
      )

      // Optimistically update drive card immediately in local state
      setDrives(prev =>
        prev.map(d =>
          d.id === id
            ? {
                ...d,
                opted_in: true,
                application_status: "opted_in",
              }
            : d
        )
      )

      // Refresh latest data from backend
      await loadDrives()
    } catch (reason) {
      const msg = reason instanceof Error ? reason.message : "Could not record opt-in"
      setError(msg)
      // If backend says already opted in, mark it locally so the UI locks immediately
      if (msg.toLowerCase().includes("already opted in")) {
        setDrives(prev =>
          prev.map(d =>
            d.id === id
              ? {
                  ...d,
                  opted_in: true,
                  application_status: d.application_status || "opted_in",
                }
              : d
          )
        )
      }
    } finally {
      setOptInProgress(prev => ({ ...prev, [id]: false }))
    }
  }

  // Derived counts
  const totalDrives = drives.length
  const optedInCount = drives.filter(d => d.opted_in).length
  const openCount = drives.filter(d => d.status === "open_for_optin" && !d.opted_in).length
  const shortlistedCount = drives.filter(d =>
    ["shortlisted", "selected_by_recruiter", "offered"].includes(d.application_status || "")
  ).length

  // Filtered drives
  const filteredDrives = drives.filter(d => {
    if (filterTab === "open" && (d.status !== "open_for_optin" || d.opted_in)) return false
    if (filterTab === "opted_in" && !d.opted_in) return false

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase()
      const matchCompany = d.company?.toLowerCase().includes(query)
      const matchRole = d.role?.toLowerCase().includes(query)
      const matchSkill = d.required_skills?.some(s => s.toLowerCase().includes(query))
      if (!matchCompany && !matchRole && !matchSkill) return false
    }

    return true
  })

  return (
    <DashboardShell
      role="student"
      title="Eligible drives"
      subtitle="Deterministic academic eligibility, placement opt-in, and live recruitment stage tracking."
    >
      {/* Top Banner Notice */}
      <div className="mb-6 rounded-2xl border border-brand/15 bg-brand/5 p-4 text-xs leading-5 text-slate-600 flex items-start gap-3">
        <Sparkles size={16} className="text-teal-700 shrink-0 mt-0.5" />
        <div>
          <b className="text-teal-900">Deterministic Campus Eligibility:</b> Eligibility rules are calculated
          strictly from the university master academic record (official CGPA, active backlogs, and registered branch).
          Once you opt in, your profile is routed through <b>Gate 2 (Placement Cell Verification)</b> before
          recruiter shortlisting.
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div className="mb-6 grid gap-4 grid-cols-2 lg:grid-cols-4">
        <div className="panel p-4 flex items-center gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-blue-50 text-blue-600">
            <Briefcase size={18} />
          </span>
          <div>
            <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Eligible Drives</div>
            <div className="text-xl font-black text-ink">{totalDrives}</div>
          </div>
        </div>

        <div className="panel p-4 flex items-center gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-emerald-50 text-emerald-600">
            <CheckCircle2 size={18} />
          </span>
          <div>
            <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Applied / Opted In</div>
            <div className="text-xl font-black text-emerald-700">{optedInCount}</div>
          </div>
        </div>

        <div className="panel p-4 flex items-center gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-amber-50 text-amber-600">
            <Clock size={18} />
          </span>
          <div>
            <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Open for Opt-In</div>
            <div className="text-xl font-black text-amber-700">{openCount}</div>
          </div>
        </div>

        <div className="panel p-4 flex items-center gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-purple-50 text-purple-600">
            <Sparkles size={18} />
          </span>
          <div>
            <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Shortlisted</div>
            <div className="text-xl font-black text-purple-700">{shortlistedCount}</div>
          </div>
        </div>
      </div>

      {/* Success Notification */}
      {notice && (
        <div className="mb-5 flex items-center justify-between rounded-2xl border border-emerald-200 bg-emerald-50/90 p-4 text-xs font-semibold text-emerald-800 shadow-2xs">
          <div className="flex items-center gap-2">
            <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
            <span>{notice}</span>
          </div>
          <button
            onClick={() => setNotice("")}
            className="rounded-lg p-1 text-emerald-600 hover:bg-emerald-100 transition"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* Error Notification */}
      {error && (
        <div className="mb-5 flex items-center justify-between rounded-2xl border border-red-200 bg-red-50/90 p-4 text-xs font-semibold text-red-800 shadow-2xs">
          <div className="flex items-center gap-2">
            <AlertCircle size={16} className="text-red-600 shrink-0" />
            <span>{error}</span>
          </div>
          <button
            onClick={() => setError("")}
            className="rounded-lg p-1 text-red-600 hover:bg-red-100 transition"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* Filter and Search Controls */}
      <div className="mb-6 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 rounded-xl bg-slate-100/90 p-1">
          <button
            onClick={() => setFilterTab("all")}
            className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${
              filterTab === "all" ? "bg-white text-ink shadow-2xs" : "text-slate-600 hover:text-ink"
            }`}
          >
            All Drives ({totalDrives})
          </button>
          <button
            onClick={() => setFilterTab("open")}
            className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${
              filterTab === "open" ? "bg-white text-ink shadow-2xs" : "text-slate-600 hover:text-ink"
            }`}
          >
            Open for Opt-in ({openCount})
          </button>
          <button
            onClick={() => setFilterTab("opted_in")}
            className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${
              filterTab === "opted_in" ? "bg-white text-ink shadow-2xs" : "text-slate-600 hover:text-ink"
            }`}
          >
            Applied / Opted In ({optedInCount})
          </button>
        </div>

        <div className="relative min-w-[220px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search company, role, or skills..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="field pl-9 pr-3 py-1.5 text-xs bg-white w-full rounded-xl"
          />
        </div>
      </div>

      {/* Drives Grid */}
      {loading ? (
        <div className="panel p-12 text-center text-sm text-slate-500">
          Loading campus hiring drives…
        </div>
      ) : filteredDrives.length > 0 ? (
        <div className="grid gap-5 md:grid-cols-2 2xl:grid-cols-3">
          {filteredDrives.map(d => (
            <DriveCard
              key={d.id}
              drive={d}
              studentMode
              onOptIn={handleOptIn}
              loading={optInProgress[d.id]}
            />
          ))}
        </div>
      ) : (
        <div className="panel p-12 text-center text-sm text-slate-500">
          {searchQuery
            ? "No campus drives match your search query."
            : filterTab === "opted_in"
            ? "You haven't opted into any drives yet. Check the 'Open for Opt-in' tab to apply."
            : "No eligible drives are currently available."}
        </div>
      )}
    </DashboardShell>
  )
}
