"use client";
import React, { useEffect, useState } from "react";
import {
  ArrowUpRight,
  BriefcaseBusiness,
  FileCheck2,
  GraduationCap,
  ShieldCheck,
  UploadCloud,
} from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import { DashboardShell } from "@/components/DashboardShell";
import { GateStepper } from "@/components/GateStepper";
import { api } from "@/lib/api";

export default function AdminDashboard() {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState("");
  const [uploadMessage, setUploadMessage] = useState("");
  useEffect(() => {
    api
      .analytics()
      .then(setData)
      .catch((reason: Error) => setError(reason.message));
  }, []);
  async function uploadMaster(file?: File) {
    if (!file) return;
    setUploadMessage("Importing records…");
    setError("");
    try {
      const r = await api.uploadMasterCsv(file);
      setUploadMessage(
        `${r.created} records created · ${r.updated} updated`,
      );
      setData(await api.analytics());
    } catch (reason) {
      setUploadMessage("");
      setError(reason instanceof Error ? reason.message : "Could not import records");
    }
  }
  const cards = data ? [
    [
      GraduationCap,
      "Registered students",
      data.registered_students,
      "Master records",
    ],
    [
      ShieldCheck,
      "Placement ready",
      data.placement_ready,
      "Readiness threshold met",
    ],
    [
      BriefcaseBusiness,
      "Active drives",
      data.active_drives,
      "Across all recruiters",
    ],
    [
      FileCheck2,
      "Offers made",
      data.offers_made,
      `${data.accepted_offers} accepted`,
    ],
  ] : [];
  return (
    <DashboardShell
      role="admin"
      title="Placement command dashboard"
      subtitle="Approval queues, placement velocity, risk signals and outcome tracking in one operating view."
    >
      <div className="space-y-5">
        {error && <div className="rounded-xl border border-red-100 bg-red-50 p-3 text-xs text-red-700">{error}</div>}
        {!data && !error && <div className="panel p-8 text-center text-sm text-slate-500">Loading placement data…</div>}
        {data && <>
        <section className="grid gap-5 xl:grid-cols-[1.35fr_.65fr]">
          <div className="panel overflow-hidden bg-navy p-6 text-white md:p-7">
            <div className="eyebrow !text-white/45">Placement season pulse</div>
            <div className="mt-4 grid gap-6 md:grid-cols-[1fr_auto] md:items-end">
              <div>
                <h2 className="max-w-2xl text-3xl font-black leading-tight tracking-[-.045em] md:text-4xl">
                  Three approval gates.
                  <br />
                  <span className="text-[#8fd5c9]">
                    One trusted hiring pipeline.
                  </span>
                </h2>
                <p className="mt-3 max-w-xl text-xs leading-6 text-white/60">
                  CampusLink makes every movement auditable: recruiter job →
                  student opt-in → verification → ranking → shortlist → offer.
                </p>
              </div>
            </div>
          </div>
          <div className="panel p-5">
            <div className="flex items-start justify-between">
              <div>
                <div className="eyebrow">Early warning</div>
                <h3 className="mt-1 text-lg font-black">At-risk students</h3>
              </div>
              <div className="text-4xl font-black text-dangerx">
                {data.at_risk}
              </div>
            </div>
            <div className="mt-5 rounded-2xl border border-slate-100 bg-slate-50 p-4 text-xs text-slate-600">
              Counted from current student readiness scores.
            </div>
          </div>
        </section>
        <section className="panel flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="eyebrow">Official master records</div>
            <h3 className="mt-1 text-sm font-black">Academic CSV import</h3>
            <p className="mt-1 text-[10px] text-slate-500">
              Uploads registration number, branch, CGPA, backlogs and passing year.
              Student academic fields remain locked to this source.
            </p>
          </div>
          <div className="flex flex-col items-start gap-2 sm:items-end">
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-navy px-4 py-2.5 text-xs font-bold text-white">
              <UploadCloud size={15} /> Upload master CSV
              <input
                className="hidden"
                type="file"
                accept=".csv"
                onChange={(e) => uploadMaster(e.target.files?.[0])}
              />
            </label>
            {uploadMessage && (
              <span className="text-[10px] text-slate-500">
                {uploadMessage}
              </span>
            )}
          </div>
        </section>
        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {cards.map(([Icon, label, value, note]: any) => (
            <article key={label} className="panel p-5">
              <div className="flex items-start justify-between">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-mist text-navy">
                  <Icon size={18} />
                </span>
                <ArrowUpRight size={15} className="text-slate-300" />
              </div>
              <div className="mt-4 text-3xl font-black tracking-[-.04em]">
                {value}
              </div>
              <b className="mt-1 block text-xs">{label}</b>
              <span className="mt-1 block text-[10px] text-slate-500">
                {note}
              </span>
            </article>
          ))}
        </section>
        <section className="grid gap-5 xl:grid-cols-[1fr_.85fr]">
          <div className="panel p-5">
            <div className="eyebrow">Workflow health</div>
            <h3 className="mt-1 text-lg font-black">Approval gates</h3>
            <div className="mt-4">
              <GateStepper active={2} />
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-3">
            </div>
          </div>
          <div className="panel p-5">
            <div className="eyebrow">Branch conversion</div>
            <h3 className="mt-1 text-lg font-black">Shortlist → offer</h3>
            {data.branch_conversion.length ? <div className="mt-3 h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.branch_conversion}>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    vertical={false}
                    stroke="#edf1f4"
                  />
                  <XAxis
                    dataKey="name"
                    tick={{ fontSize: 10, fill: "#64748b" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    contentStyle={{
                      borderRadius: 12,
                      border: "1px solid #e3e9ee",
                      fontSize: 11,
                    }}
                  />
                  <Bar dataKey="value" fill="#0D8B7D" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div> : <p className="mt-6 text-sm text-slate-500">No student activity to chart yet.</p>}
          </div>
        </section>
        <section className="grid gap-3 sm:grid-cols-3">
          <div className="panel p-4">
            <div className="eyebrow">Average package</div>
            <div className="mt-2 text-3xl font-black">
              ₹{data.average_package}L
            </div>
          </div>
          <div className="panel p-4">
            <div className="eyebrow">Highest package</div>
            <div className="mt-2 text-3xl font-black">
              ₹{data.highest_package}L
            </div>
          </div>
          <div className="panel p-4">
            <div className="eyebrow">Acceptance rate</div>
            <div className="mt-2 text-3xl font-black">
              {data.offers_made ? Math.round((data.accepted_offers / data.offers_made) * 100) : 0}%
            </div>
          </div>
        </section>
        </>}
      </div>
    </DashboardShell>
  );
}
