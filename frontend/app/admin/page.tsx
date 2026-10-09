"use client";
import React, { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowUpRight,
  BriefcaseBusiness,
  Building2,
  CalendarClock,
  CheckCircle2,
  Clock,
  Database,
  FileCheck2,
  GraduationCap,
  History,
  Layers,
  Search,
  Send,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Users,
  X,
} from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  Tooltip,
  CartesianGrid,
  LineChart,
  Line,
} from "recharts";
import { DashboardShell } from "@/components/DashboardShell";
import { GateStepper } from "@/components/GateStepper";
import { api } from "@/lib/api";

type RiskTierKey = "critical_academic" | "skill_risk" | "onboarding_pending" | "placement_ready";

export default function AdminDashboard() {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  // Modal / Drill-down state
  const [activeRiskModal, setActiveRiskModal] = useState<RiskTierKey | null>(null);
  const [modalSearch, setModalSearch] = useState("");
  const [nudgeLoading, setNudgeLoading] = useState(false);

  useEffect(() => {
    loadAnalytics();
  }, []);

  function loadAnalytics() {
    api
      .analytics()
      .then(setData)
      .catch((reason: Error) => setError(reason.message));
  }

  async function triggerOnboardingNudge() {
    setNudgeLoading(true);
    try {
      const res = await api.nudgeOnboarding();
      setNotice(res.message || "Sent onboarding notification nudges to pending students.");
      setTimeout(() => setNotice(""), 6000);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Failed to send nudge alerts");
    } finally {
      setNudgeLoading(false);
    }
  }

  const breakdown = data?.risk_breakdown;
  const velocity = data?.pipeline_velocity;
  const historyTrends = data?.historical_trends || [];

  const currentTierStudents = useMemo(() => {
    if (!activeRiskModal || !breakdown?.[activeRiskModal]) return [];
    const list = breakdown[activeRiskModal].students || [];
    if (!modalSearch.trim()) return list;
    const q = modalSearch.toLowerCase();
    return list.filter(
      (s: any) =>
        s.name.toLowerCase().includes(q) ||
        (s.branch && s.branch.toLowerCase().includes(q)) ||
        (s.registration_number && s.registration_number.toLowerCase().includes(q))
    );
  }, [activeRiskModal, breakdown, modalSearch]);

  const cards = data
    ? [
        [
          GraduationCap,
          "Registered Students",
          data.registered_students,
          "Official master records",
          "/admin/imports",
        ],
        [
          ShieldCheck,
          "Placement Ready",
          data.placement_ready,
          "Score ≥ 60 & clean record",
          "/admin/verification",
        ],
        [
          ShieldAlert,
          "Genuine At-Risk",
          data.at_risk,
          `${breakdown?.critical_academic?.count || 0} Academic · ${breakdown?.skill_risk?.count || 0} Skill`,
          null,
        ],
        [
          BriefcaseBusiness,
          "Active Drives",
          data.active_drives,
          "Visiting campus employers",
          "/admin/drives",
        ],
      ]
    : [];

  return (
    <DashboardShell
      role="admin"
      title="Placement Command Dashboard"
      subtitle="Executive intelligence: gate velocity, multi-tier risk signals, and institutional placement outcomes."
    >
      <div className="space-y-5">
        {/* Alerts */}
        {notice && (
          <div className="flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 p-3.5 text-xs font-semibold text-emerald-800 shadow-sm">
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
          <div className="flex items-center justify-between rounded-xl border border-red-200 bg-red-50 p-3.5 text-xs font-semibold text-red-700 shadow-sm">
            <div className="flex items-center gap-2">
              <AlertTriangle size={16} className="text-red-500 shrink-0" />
              <span>{error}</span>
            </div>
            <button onClick={() => setError("")} className="font-bold hover:underline">
              ✕
            </button>
          </div>
        )}

        {!data && !error && (
          <div className="panel p-10 text-center text-sm text-slate-500">
            Loading placement intelligence…
          </div>
        )}

        {data && (
          <>
            {/* TOP ROW: Live Pipeline Velocity + Multi-Tier Risk Radar */}
            <section className="grid gap-5 xl:grid-cols-[1.25fr_.75fr]">
              {/* Card 1: Live Placement Pipeline Velocity */}
              <div className="panel p-6 bg-white border border-slate-200 flex flex-col justify-between shadow-sm">
                <div>
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="eyebrow text-navy font-bold">Live Hiring Funnel</div>
                      <h3 className="mt-1 text-xl font-black text-slate-900">
                        Three-Gate Placement Velocity
                      </h3>
                    </div>
                    <Link
                      href="/admin/imports"
                      className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-100 transition"
                    >
                      <Database size={13} /> Master Data Hub →
                    </Link>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    Real-time candidate movement through each audit gate of the current placement season.
                  </p>

                  {/* 3 Gates Funnel Progress */}
                  <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <Link
                      href="/admin/drives"
                      className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 hover:border-slate-300 hover:bg-slate-50 transition group"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                          Gate 1 · Drives
                        </span>
                        <span className="h-2 w-2 rounded-full bg-blue-500"></span>
                      </div>
                      <div className="mt-2 text-2xl font-black text-slate-900">
                        {data.active_drives}
                      </div>
                      <div className="text-[11px] text-slate-500 group-hover:text-navy group-hover:underline">
                        {velocity?.gate1_pending_drives ? `${velocity.gate1_pending_drives} pending review` : "All drives approved"} →
                      </div>
                    </Link>

                    <Link
                      href="/admin/verification"
                      className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 hover:border-slate-300 hover:bg-slate-50 transition group"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                          Gate 2 · Verification
                        </span>
                        <span className="h-2 w-2 rounded-full bg-amber-500"></span>
                      </div>
                      <div className="mt-2 text-2xl font-black text-slate-900">
                        {velocity?.gate2_pending_verifications ?? 0}
                      </div>
                      <div className="text-[11px] text-slate-500 group-hover:text-navy group-hover:underline">
                        Applications to verify →
                      </div>
                    </Link>

                    <Link
                      href="/admin/shortlists"
                      className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 hover:border-slate-300 hover:bg-slate-50 transition group"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                          Gate 3 · Shortlists
                        </span>
                        <span className="h-2 w-2 rounded-full bg-emerald-500"></span>
                      </div>
                      <div className="mt-2 text-2xl font-black text-slate-900">
                        {data.offers_made}
                      </div>
                      <div className="text-[11px] text-slate-500 group-hover:text-navy group-hover:underline">
                        {data.accepted_offers} offers accepted →
                      </div>
                    </Link>
                  </div>
                </div>

                <div className="mt-5 pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between text-xs text-slate-500">
                  <span>Enrolled: <b>{data.registered_students}</b> students</span>
                  <span>Average CTC: <b className="text-emerald-700">₹{data.average_package} LPA</b></span>
                  <span>Highest CTC: <b className="text-navy">₹{data.highest_package} LPA</b></span>
                </div>
              </div>

              {/* Card 2: Multi-Tier Risk Radar */}
              <div className="panel p-6 bg-white border border-slate-200 flex flex-col justify-between shadow-sm">
                <div>
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="eyebrow text-amber-700 font-bold">Early Warning Radar</div>
                      <h3 className="mt-1 text-lg font-black text-slate-900">
                        Multi-Tier Risk Classification
                      </h3>
                    </div>
                    <span className="rounded-full bg-red-50 border border-red-200 px-2.5 py-0.5 text-xs font-black text-red-700">
                      {data.at_risk} Genuine Risks
                    </span>
                  </div>

                  <p className="mt-1 text-[11px] text-slate-500">
                    Segregated by root cause. Click any tier to inspect student roster:
                  </p>

                  {/* 3 Clickable Tiers */}
                  <div className="mt-3.5 space-y-2">
                    {/* Tier 1: Critical Academic Risk */}
                    <button
                      type="button"
                      onClick={() => setActiveRiskModal("critical_academic")}
                      className="w-full flex items-center justify-between p-2.5 rounded-xl border border-red-200 bg-red-50/60 hover:bg-red-100/70 transition text-left group"
                    >
                      <div className="flex items-center gap-2.5">
                        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-red-100 text-red-700 font-bold">
                          🔴
                        </span>
                        <div>
                          <div className="text-xs font-black text-red-900 flex items-center gap-1.5">
                            Critical Academic Risk
                            <span className="text-[10px] bg-red-200/80 text-red-800 px-1.5 py-0.2 rounded font-bold">
                              High Priority
                            </span>
                          </div>
                          <div className="text-[10px] text-red-700/80">
                            Active backlogs (&gt;0) or CGPA &lt; 6.0
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <span className="text-lg font-black text-red-700">
                          {breakdown?.critical_academic?.count ?? 0}
                        </span>
                        <span className="block text-[9px] text-red-600 font-semibold group-hover:underline">
                          Inspect →
                        </span>
                      </div>
                    </button>

                    {/* Tier 2: Placement & Skill Risk */}
                    <button
                      type="button"
                      onClick={() => setActiveRiskModal("skill_risk")}
                      className="w-full flex items-center justify-between p-2.5 rounded-xl border border-amber-200 bg-amber-50/60 hover:bg-amber-100/70 transition text-left group"
                    >
                      <div className="flex items-center gap-2.5">
                        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-100 text-amber-700 font-bold">
                          🟡
                        </span>
                        <div>
                          <div className="text-xs font-black text-amber-900 flex items-center gap-1.5">
                            Placement & Skill Risk
                            <span className="text-[10px] bg-amber-200/80 text-amber-800 px-1.5 py-0.2 rounded font-bold">
                              Needs Training
                            </span>
                          </div>
                          <div className="text-[10px] text-amber-700/80">
                            Academically fine, but readiness score &lt; 60
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <span className="text-lg font-black text-amber-700">
                          {breakdown?.skill_risk?.count ?? 0}
                        </span>
                        <span className="block text-[9px] text-amber-600 font-semibold group-hover:underline">
                          Inspect →
                        </span>
                      </div>
                    </button>

                    {/* Tier 3: Onboarding Incomplete */}
                    <button
                      type="button"
                      onClick={() => setActiveRiskModal("onboarding_pending")}
                      className="w-full flex items-center justify-between p-2.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 transition text-left group"
                    >
                      <div className="flex items-center gap-2.5">
                        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-200 text-slate-700 font-bold">
                          ⚪
                        </span>
                        <div>
                          <div className="text-xs font-black text-slate-900 flex items-center gap-1.5">
                            Onboarding Incomplete
                            <span className="text-[10px] bg-slate-200 text-slate-700 px-1.5 py-0.2 rounded font-bold">
                              Action Required
                            </span>
                          </div>
                          <div className="text-[10px] text-slate-500">
                            Pending resume & project evidence setup
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <span className="text-lg font-black text-slate-800">
                          {breakdown?.onboarding_pending?.count ?? 0}
                        </span>
                        <span className="block text-[9px] text-slate-600 font-semibold group-hover:underline">
                          Inspect →
                        </span>
                      </div>
                    </button>
                  </div>
                </div>

                <div className="mt-3 flex items-center justify-between pt-2 border-t border-slate-100 text-[10px] text-slate-500">
                  <span>Pending profiles: <b>{breakdown?.onboarding_pending?.count ?? 0}</b></span>
                  <button
                    type="button"
                    onClick={triggerOnboardingNudge}
                    disabled={nudgeLoading}
                    className="inline-flex items-center gap-1 text-[11px] font-bold text-navy hover:underline disabled:opacity-50"
                  >
                    <Send size={11} /> Nudge pending profiles
                  </button>
                </div>
              </div>
            </section>

            {/* MIDDLE ROW: 4 Clean Executive Metric Cards */}
            <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {cards.map(([Icon, label, value, note, linkHref]: any) => {
                const Wrapper = linkHref ? Link : "div";
                return (
                  <Wrapper
                    key={label}
                    href={linkHref || "#"}
                    className="panel p-5 bg-white border border-slate-200 hover:border-slate-300 transition group block"
                  >
                    <div className="flex items-start justify-between">
                      <span className="grid h-10 w-10 place-items-center rounded-xl bg-mist text-navy">
                        <Icon size={18} />
                      </span>
                      {linkHref && (
                        <ArrowUpRight
                          size={15}
                          className="text-slate-300 group-hover:text-navy transition"
                        />
                      )}
                    </div>
                    <div className="mt-4 text-3xl font-black tracking-[-.04em] text-slate-900">
                      {value}
                    </div>
                    <b className="mt-1 block text-xs text-slate-800">{label}</b>
                    <span className="mt-1 block text-[10px] text-slate-500">{note}</span>
                  </Wrapper>
                );
              })}
            </section>

            {/* BOTTOM SECTION: Analytics Charts & Multi-Year Benchmarks */}
            <section className="grid gap-5 xl:grid-cols-[1fr_1fr]">
              {/* Branch Conversion Chart */}
              <div className="panel p-5 bg-white border border-slate-200">
                <div className="eyebrow text-slate-500">Current Season Yield</div>
                <h3 className="mt-1 text-lg font-black text-slate-900">
                  Branch Conversion (Shortlist → Offer)
                </h3>
                {data.branch_conversion?.length ? (
                  <div className="mt-4 h-60">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={data.branch_conversion}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#edf1f4" />
                        <XAxis
                          dataKey="name"
                          tick={{ fontSize: 11, fill: "#64748b" }}
                          axisLine={false}
                          tickLine={false}
                        />
                        <Tooltip
                          contentStyle={{
                            borderRadius: 12,
                            border: "1px solid #e3e9ee",
                            fontSize: 12,
                          }}
                        />
                        <Bar dataKey="value" fill="#0D8B7D" radius={[6, 6, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <p className="mt-8 text-sm text-slate-400 text-center">
                    No active student drive applications to chart yet.
                  </p>
                )}
              </div>

              {/* Multi-Year Historical Placement Trend Chart */}
              <div className="panel p-5 bg-white border border-slate-200 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="eyebrow text-purple-700 font-bold">Multi-Year Trajectory</div>
                      <h3 className="mt-1 text-lg font-black text-slate-900">
                        Historical Placement Progression
                      </h3>
                    </div>
                    <Link
                      href="/admin/imports"
                      className="text-xs font-bold text-navy hover:underline"
                    >
                      Manage Archives →
                    </Link>
                  </div>

                  {historyTrends.length > 0 ? (
                    <div className="mt-4 h-60">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={historyTrends}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#edf1f4" />
                          <XAxis
                            dataKey="year"
                            tick={{ fontSize: 11, fill: "#64748b" }}
                            axisLine={false}
                            tickLine={false}
                          />
                          <Tooltip
                            contentStyle={{
                              borderRadius: 12,
                              border: "1px solid #e3e9ee",
                              fontSize: 12,
                            }}
                          />
                          <Bar
                            dataKey="total_placed"
                            name="Students Placed"
                            fill="#1e3a5f"
                            radius={[6, 6, 0, 0]}
                          />
                          <Bar
                            dataKey="avg_ctc"
                            name="Avg Package (LPA)"
                            fill="#f59e0b"
                            radius={[6, 6, 0, 0]}
                          />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <div className="mt-8 rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 p-6 text-center">
                      <History className="mx-auto mb-2 text-slate-400" size={28} />
                      <div className="text-sm font-bold text-slate-700">
                        No Historical Archives Uploaded Yet
                      </div>
                      <p className="mt-1 text-xs text-slate-500 max-w-sm mx-auto">
                        New to CampusLink? Upload past placement batch records (2022–2025) in the
                        Master Data Hub to unlock automated YoY growth charts and CTC trends.
                      </p>
                      <Link
                        href="/admin/imports"
                        className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-navy px-4 py-2 text-xs font-bold text-white hover:bg-navy/90 transition shadow-sm"
                      >
                        <Database size={13} /> Go to Master Data & Imports
                      </Link>
                    </div>
                  )}
                </div>

                {historyTrends.length > 0 && (
                  <div className="mt-3 flex items-center justify-between pt-2 border-t border-slate-100 text-xs text-slate-500">
                    <span>Archived Batches: <b>{historyTrends.length} years</b></span>
                    <span>Recent Batch Avg: <b>₹{historyTrends[historyTrends.length - 1]?.avg_ctc} LPA</b></span>
                  </div>
                )}
              </div>
            </section>
          </>
        )}
      </div>

      {/* INTERACTIVE DRILL-DOWN MODAL FOR RISK TIERS */}
      {activeRiskModal && breakdown?.[activeRiskModal] && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm">
          <div className="relative w-full max-w-2xl rounded-2xl bg-white shadow-2xl overflow-hidden border border-slate-200">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-100 p-5 bg-slate-50">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  Risk Radar Drill-down
                </div>
                <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
                  {breakdown[activeRiskModal].label}
                  <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-bold text-slate-800">
                    {breakdown[activeRiskModal].count} students
                  </span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  {breakdown[activeRiskModal].description}
                </p>
              </div>

              <button
                type="button"
                onClick={() => {
                  setActiveRiskModal(null);
                  setModalSearch("");
                }}
                className="rounded-xl p-1.5 text-slate-400 hover:bg-slate-200 hover:text-slate-700 transition"
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal Search & Action Bar */}
            <div className="flex items-center justify-between gap-3 border-b border-slate-100 p-3 bg-white">
              <div className="relative flex-1">
                <Search size={14} className="absolute left-3 top-2.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Filter student by name, branch, reg number…"
                  value={modalSearch}
                  onChange={(e) => setModalSearch(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white py-1.5 pl-8 pr-3 text-xs outline-none focus:border-navy"
                />
              </div>

              {activeRiskModal === "onboarding_pending" && (
                <button
                  type="button"
                  disabled={nudgeLoading}
                  onClick={triggerOnboardingNudge}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-navy px-3.5 py-1.5 text-xs font-bold text-white hover:bg-navy/90 transition disabled:opacity-50"
                >
                  <Send size={12} />
                  ⚡ Send Bulk Nudge
                </button>
              )}
            </div>

            {/* Students List in Modal */}
            <div className="max-h-96 overflow-y-auto p-4 space-y-2">
              {currentTierStudents.map((s: any) => (
                <div
                  key={s.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-100 bg-slate-50 p-3 hover:bg-white hover:border-slate-200 transition"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-xs text-slate-900">{s.name}</span>
                      <span className="rounded bg-white px-1.5 py-0.5 text-[9px] font-bold text-slate-500 border border-slate-200">
                        {s.branch}
                      </span>
                      <span className="text-[10px] text-slate-400">
                        Reg: {s.registration_number}
                      </span>
                    </div>
                    <div className="mt-1 text-[11px] font-semibold text-slate-700">
                      Trigger: <span className="text-amber-800">{s.risk_reason}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <div className="text-right">
                      <div className="text-xs font-black text-slate-800">
                        CGPA: {s.cgpa}
                      </div>
                      <div className="text-[10px] text-slate-500">
                        {s.backlogs > 0 ? (
                          <span className="font-bold text-red-600">
                            {s.backlogs} backlog{s.backlogs > 1 ? "s" : ""}
                          </span>
                        ) : (
                          <span className="text-emerald-700">0 backlogs</span>
                        )}
                      </div>
                    </div>

                    {s.has_profile ? (
                      <span className="rounded-lg bg-navy/5 px-2 py-1 text-[10px] font-bold text-navy">
                        Score: {s.readiness_score}
                      </span>
                    ) : (
                      <span className="rounded-lg bg-slate-200 px-2 py-1 text-[10px] font-bold text-slate-600">
                        No Profile
                      </span>
                    )}
                  </div>
                </div>
              ))}

              {currentTierStudents.length === 0 && (
                <div className="p-8 text-center text-xs text-slate-400">
                  No students match this search filter.
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-between border-t border-slate-100 p-3.5 bg-slate-50 text-xs text-slate-500">
              <span>Showing {currentTierStudents.length} students</span>
              <button
                type="button"
                onClick={() => {
                  setActiveRiskModal(null);
                  setModalSearch("");
                }}
                className="font-bold text-slate-700 hover:underline"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </DashboardShell>
  );
}
