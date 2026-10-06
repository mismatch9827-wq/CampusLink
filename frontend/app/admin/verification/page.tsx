"use client";
import React, { useEffect, useState } from "react";
import { Check, FileSearch, X } from "lucide-react";
import { DashboardShell } from "@/components/DashboardShell";
import { GateStepper } from "@/components/GateStepper";
import { FlagList } from "@/components/FlagList";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/Button";
import { api } from "@/lib/api";
import type { Application } from "@/lib/types";

export default function VerificationPage() {
  const [apps, setApps] = useState<Application[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    api
      .verificationQueue()
      .then(setApps)
      .catch((reason: Error) => setError(reason.message));
  }, []);
  async function decide(id: string, approve: boolean) {
    try {
      await api.verifyApplication(id, approve);
      setApps((xs) => xs.filter((x) => x.id !== id));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not update application");
    }
  }
  return (
    <DashboardShell
      role="admin"
      title="Gate 2 · Verification"
      subtitle="Compare resume claims and student-entered evidence against the official master academic record."
    >
      <div className="mb-5">
        <GateStepper active={2} />
      </div>
      {error && <div className="mb-4 rounded-xl border border-red-100 bg-red-50 p-3 text-xs text-red-700">{error}</div>}
      <div className="grid gap-4 xl:grid-cols-2">
        {apps.map((a) => (
          <article className="panel p-5" key={a.id}>
            <div className="flex items-start justify-between gap-3">
              <div className="flex gap-3">
                <span className="grid h-11 w-11 place-items-center rounded-2xl bg-mist text-navy">
                  <FileSearch size={18} />
                </span>
                <div>
                  <h2 className="text-sm font-black">{a.student_name}</h2>
                  <p className="text-[10px] text-slate-500">
                    {a.branch} · Master CGPA {a.cgpa}
                  </p>
                </div>
              </div>
              <StatusBadge status={a.status} />
            </div>
            <div className="mt-4">
              <FlagList flags={a.flags} />
            </div>
            <div className="mt-4 rounded-xl bg-slate-50 p-3">
              <div className="text-[10px] font-bold uppercase tracking-[.1em] text-slate-400">
                Evidence snapshot
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {a.skills?.map((s) => (
                  <span
                    key={s}
                    className="rounded-lg bg-white px-2 py-1 text-[9px] font-semibold text-slate-600 shadow-sm"
                  >
                    {s}
                  </span>
                ))}
              </div>
            </div>
            <div className="mt-4 flex gap-2">
              <Button className="flex-1" onClick={() => decide(a.id, true)}>
                <Check size={15} />
                Verify
              </Button>
              <Button
                className="flex-1"
                variant="danger"
                onClick={() => decide(a.id, false)}
              >
                <X size={15} />
                Reject
              </Button>
            </div>
          </article>
        ))}
        {!apps.length && (
          <div className="panel col-span-full p-10 text-center text-sm text-slate-500">
            Verification queue is clear.
          </div>
        )}
      </div>
    </DashboardShell>
  );
}
