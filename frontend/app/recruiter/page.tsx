"use client";
import React, { useEffect, useState } from "react";
import Link from "next/link";
import { BriefcaseBusiness, CheckCircle2, PlusCircle, Users } from "lucide-react";
import { DashboardShell } from "@/components/DashboardShell";
import { Button } from "@/components/ui/Button";
import { api } from "@/lib/api";
import type { Drive } from "@/lib/types";

export default function RecruiterDashboard() {
  const [drives, setDrives] = useState<Drive[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    api
      .recruiterDrives()
      .then(setDrives)
      .catch((reason: Error) => setError(reason.message))
      .finally(() => setLoading(false));
  }, []);

  const openCount = drives.filter(drive => drive.status === "open_for_optin").length;
  const reviewCount = drives.filter(drive => drive.status === "pending_admin_review").length;
  const publishedCount = drives.filter(drive => drive.status === "shortlist_published").length;
  return (
    <DashboardShell
      role="recruiter"
      title="Recruiter dashboard"
      subtitle="Manage your drives and review ranked candidates."
    >
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="eyebrow">Recruitment overview</p>
          <h2 className="mt-1 text-xl font-black">Your hiring at a glance</h2>
        </div>
        <Link href="/recruiter/new-drive">
          <Button className="w-full px-5 sm:w-auto">
            <PlusCircle size={17} /> Create new drive
          </Button>
        </Link>
      </div>
      {error && <div className="mb-4 rounded-xl border border-red-100 bg-red-50 p-3 text-xs text-red-700">{error}</div>}

      <div className="mb-7 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: "Total drives", value: drives.length, icon: BriefcaseBusiness, color: "text-blue-600" },
          { label: "Open for opt-in", value: openCount, icon: Users, color: "text-teal-700" },
          { label: "Awaiting review", value: reviewCount, icon: CheckCircle2, color: "text-emerald-700" },
          { label: "Published shortlists", value: publishedCount, icon: CheckCircle2, color: "text-indigo-600" },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="panel flex min-h-24 items-center gap-4 p-4">
            <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-mist ${color}`}>
              <Icon size={19} />
            </span>
            <div>
              <div className={`text-2xl font-black leading-none ${color}`}>{value}</div>
              <div className="mt-1.5 text-[11px] font-semibold text-slate-500">{label}</div>
            </div>
          </div>
        ))}
      </div>

      <section className="panel flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-base font-black">Manage your drives</h2>
          <p className="mt-1 text-xs text-slate-500">View postings, check their status, and open ranked candidates.</p>
        </div>
        <Link href="/recruiter/drives">
          <Button variant="secondary" className="w-full px-5 sm:w-auto">
            <BriefcaseBusiness size={16} /> View my drives
          </Button>
        </Link>
      </section>
    </DashboardShell>
  );
}
