"use client";
import React, { useEffect, useState } from "react";
import { DashboardShell } from "@/components/DashboardShell";
import { DriveCard } from "@/components/DriveCard";
import { api } from "@/lib/api";
import type { Drive } from "@/lib/types";

export default function StudentDrives() {
  const [drives, setDrives] = useState<Drive[]>([]);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    api
      .studentDrives()
      .then(setDrives)
      .catch((reason: Error) => setError(reason.message));
  }, []);
  async function optIn(id: string) {
    try {
      await api.optIn(id);
      setNotice("Opt-in recorded. Your application is now under verification.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not record opt-in");
    }
  }
  return (
    <DashboardShell
      role="student"
      title="Eligible drives"
      subtitle="Rules use official master CGPA, branch and backlog data — not self-declared values."
    >
      <div className="mb-5 rounded-2xl border border-brand/15 bg-brand/5 p-4 text-xs leading-5 text-slate-600">
        <b className="text-teal-800">Eligibility is deterministic.</b> If a
        drive is unavailable, CampusLink shows the exact academic rule that
        blocked it.
      </div>
      {notice && (
        <div className="mb-5 rounded-2xl border border-emerald-100 bg-emerald-50 p-3 text-xs text-emerald-700">
          {notice}
        </div>
      )}
      {error && <div className="mb-4 rounded-xl border border-red-100 bg-red-50 p-3 text-xs text-red-700">{error}</div>}
      <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
        {drives.map((d) => (
          <DriveCard key={d.id} drive={d} studentMode onOptIn={optIn} />
        ))}
      </div>
      {!drives.length && !error && <div className="panel p-10 text-center text-sm text-slate-500">No eligible drives are currently open.</div>}
    </DashboardShell>
  );
}
