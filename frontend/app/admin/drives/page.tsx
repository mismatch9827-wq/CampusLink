"use client";
import React, { useEffect, useState } from "react";
import { CalendarClock, Check, MapPin, X } from "lucide-react";
import { DashboardShell } from "@/components/DashboardShell";
import { GateStepper } from "@/components/GateStepper";
import { StatusBadge } from "@/components/StatusBadge";
import { JobDescriptionPreview } from "@/components/JobDescriptionPreview";
import { Button } from "@/components/ui/Button";
import { api } from "@/lib/api";
import type { Drive } from "@/lib/types";

export default function AdminDrives() {
  const [drives, setDrives] = useState<Drive[]>([]);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    api
      .adminDrives()
      .then(setDrives)
      .catch((reason: Error) => setError(reason.message));
  }, []);
  async function decide(id: string, approve: boolean) {
    try {
      await api.approveDrive(id, approve);
      setDrives((ds) => ds.filter((drive) => drive.id !== id));
      setNotice(approve ? "Drive approved." : "Drive rejected.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not update drive");
    }
  }
  return (
    <DashboardShell
      role="admin"
      title="Gate 1 · Drive approval"
      subtitle="Review recruiter requirements and scheduling details before a drive becomes visible to students."
    >
      <div className="mb-5">
        <GateStepper active={1} />
      </div>
      {notice && (
        <div className="mb-4 rounded-xl border border-emerald-100 bg-emerald-50 p-3 text-xs text-emerald-700">
          {notice}
        </div>
      )}
      {error && <div className="mb-4 rounded-xl border border-red-100 bg-red-50 p-3 text-xs text-red-700">{error}</div>}
      <div className="space-y-3">
        {drives.map((d) => (
          <article key={d.id} className="panel p-5">
            <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_370px_auto] xl:items-start">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-black">
                    {d.company} · {d.role}
                  </h2>
                  <StatusBadge status={d.status} />
                </div>
                <div className="mt-4">
                  <div className="eyebrow">Job description</div>
                  <JobDescriptionPreview text={d.jd} />
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {d.required_skills.map((s) => (
                    <span
                      key={s}
                      className="rounded-lg bg-slate-100 px-2 py-1 text-[9px] font-semibold text-slate-600"
                    >
                      {s}
                    </span>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 text-[10px] xl:grid-cols-1">
                <div className="rounded-xl bg-slate-50 p-3">
                  <b className="block text-slate-400">Eligibility</b>
                  <span>
                    CGPA ≥ {d.min_cgpa}
                    <br />
                    {d.branches.join(", ")}
                    <br />
                    Backlogs ≤ {d.max_backlogs}
                  </span>
                </div>
                <div className="rounded-xl bg-slate-50 p-3">
                  <b className="block text-slate-400">Schedule</b>
                  <span className="flex items-center gap-1">
                    <CalendarClock size={12} />
                    {d.date}
                  </span>
                  <span>{d.slot}</span>
                  <span className="flex items-center gap-1">
                    <MapPin size={12} />
                    {d.venue}
                  </span>
                </div>
              </div>
              <div className="flex gap-2 xl:flex-col">
                {d.status === "pending_admin_review" ? (
                  <>
                    <Button onClick={() => decide(d.id, true)}>
                      <Check size={15} />
                      Approve
                    </Button>
                    <Button
                      variant="danger"
                      onClick={() => decide(d.id, false)}
                    >
                      <X size={15} />
                      Reject
                    </Button>
                  </>
                ) : (
                  <span className="text-[10px] text-slate-400">
                    Decision recorded
                  </span>
                )}
              </div>
            </div>
          </article>
        ))}
        {!drives.length && !error && <div className="panel p-10 text-center text-sm text-slate-500">No drives are waiting for review.</div>}
      </div>
    </DashboardShell>
  );
}
