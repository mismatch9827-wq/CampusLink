"use client";
import React, { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, PlusCircle } from "lucide-react";
import { DashboardShell } from "@/components/DashboardShell";
import { DriveCard } from "@/components/DriveCard";
import { Button } from "@/components/ui/Button";
import { GateStepper } from "@/components/GateStepper";
import { api } from "@/lib/api";
import type { Drive } from "@/lib/types";

export default function RecruiterDashboard() {
  const [drives, setDrives] = useState<Drive[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    api
      .recruiterDrives()
      .then(setDrives)
      .catch((reason: Error) => setError(reason.message));
  }, []);
  return (
    <DashboardShell
      role="recruiter"
      title="My drives"
      subtitle="Post roles, wait for placement-cell approval, then review verified ranked candidates."
    >
      <div className="mb-5 grid gap-4 lg:grid-cols-[1fr_auto]">
        <section className="panel p-5">
          <div className="eyebrow">Controlled hiring flow</div>
          <h2 className="mt-1 text-lg font-black">
            Every shortlist passes three trust gates.
          </h2>
          <div className="mt-4">
            <GateStepper active={1} />
          </div>
        </section>
        <Link href="/recruiter/new-drive" className="flex">
          <Button className="w-full self-stretch px-6">
            <PlusCircle size={17} /> Post a new job
          </Button>
        </Link>
      </div>
      {error && <div className="mb-4 rounded-xl border border-red-100 bg-red-50 p-3 text-xs text-red-700">{error}</div>}
      <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
        {drives.map((d) => (
          <DriveCard key={d.id} drive={d} />
        ))}
      </div>
      {!drives.length && !error && <div className="panel p-10 text-center text-sm text-slate-500">No jobs posted yet.</div>}
      <div className="mt-5 rounded-2xl border border-slate-200 bg-white p-4 text-xs text-slate-500">
        Once Gate 2 verification is complete, the recruiter sees a{" "}
        <b className="text-ink">
          ranked list with fit score and written reasons
        </b>
        , then selects candidates for Gate 3.{" "}
        <ArrowRight size={13} className="ml-1 inline" />
      </div>
    </DashboardShell>
  );
}
