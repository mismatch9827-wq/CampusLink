"use client";
import React, { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Building2,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Eye,
  EyeOff,
  FileSearch,
  FileText,
  Link2,
  Search,
  Sparkles,
  Users,
  X,
} from "lucide-react";
import { DashboardShell } from "@/components/DashboardShell";
import { GateStepper } from "@/components/GateStepper";
import { FlagList } from "@/components/FlagList";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/Button";
import { api } from "@/lib/api";
import type { Application } from "@/lib/types";

interface CompanyGroup {
  driveId: string;
  company: string;
  role: string;
  ctc: number;
  apps: Application[];
  cleanCount: number;
  criticalCount: number;
}

export default function VerificationPage() {
  const [apps, setApps] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  // Company Expansion state (like Gate 1 expandedId)
  const [expandedCompanyId, setExpandedCompanyId] = useState<string | null>(null);

  // Student row expansion state
  const [expandedStudentIds, setExpandedStudentIds] = useState<Set<string>>(new Set());

  // Filter tab for the active company
  const [activeTab, setActiveTab] = useState<"clean" | "critical" | "all">("clean");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedAppIds, setSelectedAppIds] = useState<Set<string>>(new Set());
  const [batchBusy, setBatchBusy] = useState(false);

  useEffect(() => {
    loadQueue();
  }, []);

  function loadQueue() {
    setLoading(true);
    api
      .verificationQueue()
      .then((data) => {
        setApps(data);
        setError("");
      })
      .catch((reason: Error) => setError(reason.message))
      .finally(() => setLoading(false));
  }

  // Group applications by company drive
  const companyGroups = useMemo<CompanyGroup[]>(() => {
    const map = new Map<string, CompanyGroup>();
    apps.forEach((a) => {
      const driveKey = a.drive_id || a.company || "unknown_drive";
      if (!map.has(driveKey)) {
        map.set(driveKey, {
          driveId: a.drive_id,
          company: a.company || "Campus Recruitment Drive",
          role: a.role || "Job Role",
          ctc: a.ctc || 0,
          apps: [],
          cleanCount: 0,
          criticalCount: 0,
        });
      }
      const group = map.get(driveKey)!;
      group.apps.push(a);

      const isCritical = Boolean(a.has_critical_mismatch || a.has_cgpa_mismatch || a.has_red_flags);
      if (isCritical) {
        group.criticalCount += 1;
      } else {
        group.cleanCount += 1;
      }
    });
    return Array.from(map.values());
  }, [apps]);

  // Auto-expand first company if only 1 exists and none selected
  useEffect(() => {
    if (companyGroups.length === 1 && !expandedCompanyId) {
      setExpandedCompanyId(companyGroups[0].driveId);
    }
  }, [companyGroups, expandedCompanyId]);

  function toggleCompany(driveId: string) {
    if (expandedCompanyId === driveId) {
      setExpandedCompanyId(null);
    } else {
      setExpandedCompanyId(driveId);
      setSelectedAppIds(new Set());
      setExpandedStudentIds(new Set());
      setSearchQuery("");
      // Default to critical if there are any critical, otherwise clean
      const grp = companyGroups.find((g) => g.driveId === driveId);
      if (grp && grp.criticalCount > 0) {
        setActiveTab("critical");
      } else {
        setActiveTab("clean");
      }
    }
  }

  function toggleStudentDetails(studentAppId: string) {
    setExpandedStudentIds((prev) => {
      const next = new Set(prev);
      if (next.has(studentAppId)) {
        next.delete(studentAppId);
      } else {
        next.add(studentAppId);
      }
      return next;
    });
  }

  async function decide(id: string, approve: boolean) {
    try {
      await api.verifyApplication(id, approve);
      setApps((xs) => xs.filter((x) => x.id !== id));
      setSelectedAppIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      setNotice(
        approve
          ? "Application verified. Student is now accessible to the recruiter."
          : "Application rejected."
      );
      setTimeout(() => setNotice(""), 5000);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not update application");
    }
  }

  // 1-Click Batch Verify for Clean Students
  async function handleBatchVerifyClean(group: CompanyGroup) {
    const cleanApps = group.apps.filter(
      (a) => !a.has_critical_mismatch && !a.has_cgpa_mismatch && !a.has_red_flags
    );
    if (!cleanApps.length) return;

    setBatchBusy(true);
    try {
      const ids = cleanApps.map((a) => a.id);
      await api.batchVerifyApplications(ids, true);
      setApps((xs) => xs.filter((x) => !ids.includes(x.id)));
      setSelectedAppIds(new Set());
      setNotice(
        `⚡ Successfully verified all ${ids.length} clean student(s) for ${group.company}! Recruiter can now view them in rankings.`
      );
      setTimeout(() => setNotice(""), 6000);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Batch verification failed");
    } finally {
      setBatchBusy(false);
    }
  }

  // Batch verify individually checked students
  async function handleBatchVerifySelected(approve: boolean) {
    if (!selectedAppIds.size) return;
    setBatchBusy(true);
    try {
      const ids = Array.from(selectedAppIds);
      await api.batchVerifyApplications(ids, approve);
      setApps((xs) => xs.filter((x) => !ids.includes(x.id)));
      setSelectedAppIds(new Set());
      setNotice(
        approve
          ? `Verified ${ids.length} selected candidate(s).`
          : `Rejected ${ids.length} selected application(s).`
      );
      setTimeout(() => setNotice(""), 5000);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Batch operation failed");
    } finally {
      setBatchBusy(false);
    }
  }

  const totalCritical = useMemo(
    () =>
      apps.filter(
        (a) => Boolean(a.has_critical_mismatch || a.has_cgpa_mismatch || a.has_red_flags)
      ).length,
    [apps]
  );
  const totalClean = useMemo(() => apps.length - totalCritical, [apps, totalCritical]);

  return (
    <DashboardShell
      role="admin"
      title="Gate 2 · Verification"
      subtitle="Compare resume claims and student-entered evidence against the official master academic record."
    >
      <div className="mb-5">
        <GateStepper active={2} />
      </div>

      {notice && (
        <div className="mb-4 flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 p-3.5 text-xs font-semibold text-emerald-800 shadow-sm">
          <div className="flex items-center gap-2">
            <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
            <span>{notice}</span>
          </div>
          <button onClick={() => setNotice("")} className="font-bold hover:underline">
            ✕
          </button>
        </div>
      )}

      {error && (
        <div className="mb-4 flex items-center justify-between rounded-xl border border-red-200 bg-red-50 p-3.5 text-xs font-semibold text-red-700 shadow-sm">
          <div className="flex items-center gap-2">
            <X size={16} className="text-red-500 shrink-0" />
            <span>{error}</span>
          </div>
          <button onClick={() => setError("")} className="font-bold hover:underline">
            ✕
          </button>
        </div>
      )}

      {/* Overview Stats */}
      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="panel p-3.5 bg-white border border-slate-200">
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
            Drives With Opt-ins
          </div>
          <div className="mt-1 text-2xl font-black text-ink">{companyGroups.length}</div>
          <div className="text-[11px] text-slate-500">visiting companies</div>
        </div>

        <div className="panel p-3.5 bg-white border border-slate-200">
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
            Total Opted-in
          </div>
          <div className="mt-1 text-2xl font-black text-ink">{apps.length}</div>
          <div className="text-[11px] text-slate-500">applicants in queue</div>
        </div>

        <div className="panel p-3.5 bg-white border border-slate-200">
          <div className="text-[10px] font-bold uppercase tracking-wider text-amber-700">
            Critical Mismatches
          </div>
          <div className="mt-1 text-2xl font-black text-amber-600">{totalCritical}</div>
          <div className="text-[11px] text-slate-500">CGPA / record violations</div>
        </div>

        <div className="panel p-3.5 bg-white border border-slate-200">
          <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-700">
            Clean Records
          </div>
          <div className="mt-1 text-2xl font-black text-emerald-600">{totalClean}</div>
          <div className="text-[11px] text-slate-500">ready for 1-click verify</div>
        </div>
      </div>

      {companyGroups.length === 0 && !loading && (
        <div className="panel p-10 text-center text-sm text-slate-500 shadow-sm">
          <CheckCircle2 className="mx-auto mb-2 text-emerald-500" size={32} />
          Verification queue is completely clear. No pending student applications.
        </div>
      )}

      {/* Companies List (Gate 1 layout style) */}
      <div className="space-y-4">
        {companyGroups.map((group) => {
          const isExpanded = expandedCompanyId === group.driveId;

          // Filter applicants for the selected subtab & search
          let currentStudents = group.apps;
          if (activeTab === "critical") {
            currentStudents = currentStudents.filter(
              (a) => Boolean(a.has_critical_mismatch || a.has_cgpa_mismatch || a.has_red_flags)
            );
          } else if (activeTab === "clean") {
            currentStudents = currentStudents.filter(
              (a) => !a.has_critical_mismatch && !a.has_cgpa_mismatch && !a.has_red_flags
            );
          }

          if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase();
            currentStudents = currentStudents.filter(
              (a) =>
                a.student_name.toLowerCase().includes(q) ||
                (a.branch && a.branch.toLowerCase().includes(q))
            );
          }

          return (
            <article
              key={group.driveId}
              className={`panel overflow-hidden transition shadow-sm border ${
                isExpanded ? "border-navy/40 ring-1 ring-navy/20" : "border-slate-200"
              }`}
            >
              {/* COMPANY ROW (Gate 1 style) */}
              <div
                onClick={() => toggleCompany(group.driveId)}
                className="flex flex-wrap items-center justify-between gap-4 px-5 py-4 cursor-pointer hover:bg-slate-50/70 transition"
              >
                {/* Left: Company name + badges just like Gate 1 */}
                <div className="flex min-w-0 flex-wrap items-center gap-2.5">
                  <h2 className="text-base font-black text-ink">{group.company}</h2>

                  <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">
                    {group.role}
                  </span>

                  {group.ctc > 0 && (
                    <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">
                      ₹{group.ctc} LPA
                    </span>
                  )}

                  {/* Number of students opted in */}
                  <span className="rounded-md bg-blue-50 px-2.5 py-0.5 text-[11px] font-bold text-blue-700 border border-blue-100">
                    {group.apps.length} student{group.apps.length > 1 ? "s" : ""} opted in
                  </span>

                  {/* Critical mismatch alert badge */}
                  {group.criticalCount > 0 && (
                    <span className="inline-flex items-center gap-1 rounded-md bg-red-50 px-2 py-0.5 text-[10px] font-bold text-red-700 border border-red-100">
                      <AlertTriangle size={11} className="text-red-600" />
                      {group.criticalCount} critical mismatch
                    </span>
                  )}

                  {/* Clean records count */}
                  {group.cleanCount > 0 && (
                    <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700 border border-emerald-100">
                      <CheckCircle2 size={11} className="text-emerald-600" />
                      {group.cleanCount} clean
                    </span>
                  )}
                </div>

                {/* Right: Expand/Collapse button like Gate 1 */}
                <div className="flex items-center gap-3">
                  <Button
                    variant="secondary"
                    className="shrink-0 px-3.5"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleCompany(group.driveId);
                    }}
                    aria-expanded={isExpanded}
                  >
                    {isExpanded ? <EyeOff size={15} /> : <Eye size={15} />}
                    {isExpanded ? "Close workspace" : "Verify applicants"}
                  </Button>
                </div>
              </div>

              {/* VERIFICATION WORKSPACE (Opens when clicked) */}
              {isExpanded && (
                <div className="border-t border-slate-100 bg-slate-50/50 p-5 space-y-4">
                  {/* Top Bar inside Workspace: Subtabs + 1-Click Clean Verify */}
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    {/* Sub-tabs */}
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => setActiveTab("clean")}
                        className={`flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold transition ${
                          activeTab === "clean"
                            ? "bg-emerald-600 text-white shadow-sm"
                            : "bg-white text-slate-700 hover:bg-slate-100 border border-slate-200"
                        }`}
                      >
                        <CheckCircle2 size={14} />
                        Clean Records ({group.cleanCount})
                      </button>

                      <button
                        type="button"
                        onClick={() => setActiveTab("critical")}
                        className={`flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold transition ${
                          activeTab === "critical"
                            ? "bg-red-600 text-white shadow-sm"
                            : "bg-white text-slate-700 hover:bg-slate-100 border border-slate-200"
                        }`}
                      >
                        <AlertTriangle size={14} />
                        Critical Mismatches ({group.criticalCount})
                      </button>

                      <button
                        type="button"
                        onClick={() => setActiveTab("all")}
                        className={`rounded-xl px-3 py-2 text-xs font-bold transition ${
                          activeTab === "all"
                            ? "bg-slate-800 text-white shadow-sm"
                            : "bg-white text-slate-700 hover:bg-slate-100 border border-slate-200"
                        }`}
                      >
                        All Candidates ({group.apps.length})
                      </button>
                    </div>

                    {/* Quick 1-Click Action & Toolbar */}
                    <div className="flex flex-wrap items-center gap-2">
                      {/* Search box */}
                      <div className="relative">
                        <Search size={13} className="absolute left-3 top-2.5 text-slate-400" />
                        <input
                          type="text"
                          placeholder="Filter name / branch..."
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          className="rounded-xl border border-slate-200 bg-white py-1.5 pl-8 pr-3 text-xs outline-none focus:border-navy"
                        />
                      </div>

                      {/* 1-Click Verify Clean */}
                      {group.cleanCount > 0 && (
                        <button
                          type="button"
                          disabled={batchBusy}
                          onClick={() => handleBatchVerifyClean(group)}
                          className="flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-bold text-white shadow hover:bg-emerald-700 transition disabled:opacity-50"
                        >
                          <Sparkles size={14} />
                          ⚡ 1-Click Verify Clean ({group.cleanCount})
                        </button>
                      )}

                      {/* Batch Selected Actions */}
                      {selectedAppIds.size > 0 && (
                        <div className="flex items-center gap-1.5 bg-white border border-slate-200 p-1 rounded-xl">
                          <span className="text-[11px] font-bold px-2 text-slate-600">
                            {selectedAppIds.size} selected
                          </span>
                          <button
                            type="button"
                            disabled={batchBusy}
                            onClick={() => handleBatchVerifySelected(true)}
                            className="rounded-lg bg-emerald-600 hover:bg-emerald-700 px-2.5 py-1 text-xs font-bold text-white transition"
                          >
                            Verify
                          </button>
                          <button
                            type="button"
                            disabled={batchBusy}
                            onClick={() => handleBatchVerifySelected(false)}
                            className="rounded-lg bg-red-600 hover:bg-red-700 px-2.5 py-1 text-xs font-bold text-white transition"
                          >
                            Reject
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* STUDENT CANDIDATE LIST (Row layout matching company style) */}
                  <div className="space-y-2.5 pt-1">
                    {currentStudents.map((a) => {
                      const isStudentExpanded = expandedStudentIds.has(a.id);
                      const isSelected = selectedAppIds.has(a.id);
                      const isCritical = Boolean(
                        a.has_critical_mismatch || a.has_cgpa_mismatch || a.has_red_flags
                      );
                      const hasLinkPending = Boolean(a.has_link_mismatch);

                      return (
                        <div
                          key={a.id}
                          className={`rounded-2xl border bg-white transition shadow-sm overflow-hidden ${
                            isCritical
                              ? "border-red-200"
                              : hasLinkPending
                              ? "border-amber-200"
                              : "border-slate-200"
                          }`}
                        >
                          {/* STUDENT COMPACT ROW (Matches company name style) */}
                          <div
                            onClick={() => toggleStudentDetails(a.id)}
                            className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 cursor-pointer hover:bg-slate-50 transition"
                          >
                            {/* Left: Checkbox + Name + Branch + CGPA + Status Tags */}
                            <div className="flex min-w-0 flex-wrap items-center gap-2.5">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onClick={(e) => e.stopPropagation()}
                                onChange={(e) => {
                                  const checked = e.target.checked;
                                  setSelectedAppIds((prev) => {
                                    const next = new Set(prev);
                                    if (checked) next.add(a.id);
                                    else next.delete(a.id);
                                    return next;
                                  });
                                }}
                                className="h-4 w-4 rounded text-navy focus:ring-navy"
                              />

                              {/* Student Name */}
                              <h3 className="text-sm font-black text-ink">{a.student_name}</h3>

                              {/* Branch Badge */}
                              <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">
                                {a.branch || "N/A"}
                              </span>

                              {/* Master CGPA Badge */}
                              <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-700">
                                Master CGPA: {a.cgpa ?? "N/A"}
                              </span>

                              {/* Critical Mismatch Tag */}
                              {isCritical && (
                                <span className="inline-flex items-center gap-1 rounded-md bg-red-50 border border-red-200 px-2 py-0.5 text-[10px] font-bold text-red-700">
                                  <AlertTriangle size={11} className="text-red-600" />
                                  Critical CGPA Mismatch
                                </span>
                              )}

                              {/* Non-critical link verification tag (kept in clean records) */}
                              {!isCritical && hasLinkPending && (
                                <span className="inline-flex items-center gap-1 rounded-md bg-amber-50 border border-amber-200 px-2 py-0.5 text-[10px] font-bold text-amber-700">
                                  <Link2 size={11} className="text-amber-600" />
                                  Link verification pending (proof unlinked)
                                </span>
                              )}

                              {/* Clean Tag */}
                              {!isCritical && !hasLinkPending && (
                                <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                                  <CheckCircle2 size={11} className="text-emerald-600" />
                                  Clean
                                </span>
                              )}
                            </div>

                            {/* Right: Quick Actions + Details toggle */}
                            <div
                              className="flex items-center gap-2"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <Button
                                size="sm"
                                className="bg-navy hover:bg-navy/90 text-white px-2.5 py-1 text-xs"
                                onClick={() => decide(a.id, true)}
                              >
                                <Check size={13} />
                                Verify
                              </Button>

                              <Button
                                size="sm"
                                variant="danger"
                                className="px-2.5 py-1 text-xs"
                                onClick={() => decide(a.id, false)}
                              >
                                <X size={13} />
                                Reject
                              </Button>

                              <button
                                type="button"
                                onClick={() => toggleStudentDetails(a.id)}
                                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition"
                              >
                                {isStudentExpanded ? (
                                  <>
                                    <ChevronUp size={13} /> Hide
                                  </>
                                ) : (
                                  <>
                                    <ChevronDown size={13} /> Details
                                  </>
                                )}
                              </button>
                            </div>
                          </div>

                          {/* EXPANDED STUDENT DETAILS (Only appears on click) */}
                          {isStudentExpanded && (
                            <div className="border-t border-slate-100 bg-slate-50/70 p-4 space-y-3">
                              {/* If Critical Mismatch: Comparative CGPA Inspector */}
                              {isCritical && (
                                <div className="rounded-xl border border-red-300 bg-red-50/80 p-3 text-xs text-red-950">
                                  <div className="flex items-center gap-1.5 font-bold text-red-800">
                                    <AlertTriangle size={15} className="text-red-600 shrink-0" />
                                    Critical Academic Discrepancy Detected
                                  </div>
                                  <div className="mt-2 rounded-lg bg-white p-3 border border-red-200 flex flex-wrap items-center justify-between gap-2">
                                    <div>
                                      <span className="text-[11px] font-semibold text-slate-500 block">
                                        Official College Master Record:
                                      </span>
                                      <span className="text-base font-black text-emerald-700">
                                        CGPA {a.cgpa ?? "N/A"}
                                      </span>
                                    </div>
                                    <div className="text-right">
                                      <span className="text-[11px] font-semibold text-slate-500 block">
                                        Resume Claimed CGPA:
                                      </span>
                                      <span className="text-base font-black text-red-600 line-through">
                                        {a.claimed_cgpa ?? "Mismatch"}
                                      </span>
                                      <span className="ml-1.5 text-[10px] font-bold text-red-700">
                                        (Violates Official DB)
                                      </span>
                                    </div>
                                  </div>
                                </div>
                              )}

                              {/* Non-critical Link Verification Notice */}
                              {!isCritical && hasLinkPending && (
                                <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-3 text-xs text-amber-900">
                                  <div className="flex items-center gap-1.5 font-bold text-amber-800">
                                    <Link2 size={14} className="text-amber-700 shrink-0" />
                                    Link Verification Notice (Non-critical):
                                  </div>
                                  <p className="mt-1 text-[11px] text-amber-800">
                                    Student has listed certificates or project repositories without an uploaded file or external GitHub link. Their official CGPA and academic eligibility are verified and clean.
                                  </p>
                                </div>
                              )}

                              {/* Flags list */}
                              {a.flags && a.flags.length > 0 && (
                                <div>
                                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                                    System Verification Flags
                                  </div>
                                  <FlagList flags={a.flags} />
                                </div>
                              )}

                              {/* Evidence Snapshot (Skills extracted from resume) */}
                              <div className="rounded-xl bg-white p-3 border border-slate-200">
                                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                                  Evidence Snapshot · Extracted Technical Skills
                                </div>
                                <div className="mt-2 flex flex-wrap gap-1.5">
                                  {a.skills && a.skills.length > 0 ? (
                                    a.skills.map((s) => (
                                      <span
                                        key={s}
                                        className="rounded-lg bg-slate-50 px-2 py-1 text-[10px] font-semibold text-slate-700 border border-slate-200"
                                      >
                                        {s}
                                      </span>
                                    ))
                                  ) : (
                                    <span className="text-xs text-slate-400 italic">
                                      No specific skills extracted
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}

                    {currentStudents.length === 0 && (
                      <div className="p-8 text-center text-xs text-slate-500 bg-white rounded-xl border border-slate-200">
                        {activeTab === "critical"
                          ? "No critical mismatches for this company! All records are clean."
                          : activeTab === "clean"
                          ? "No clean applications pending."
                          : "No students match this query."}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </article>
          );
        })}
      </div>
    </DashboardShell>
  );
}
