"use client";
import React, { useEffect, useState } from "react";
import Link from "next/link";
import { PlusCircle } from "lucide-react";
import { DashboardShell } from "@/components/DashboardShell";
import { Button } from "@/components/ui/Button";
import { StatusBadge } from "@/components/StatusBadge";
import { api } from "@/lib/api";
import type { Drive } from "@/lib/types";

export default function RecruiterDrivesPage() {
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

  return (
    <DashboardShell
      role="recruiter"
      title="My drives"
      subtitle="Manage job postings and open a drive to review ranked candidates."
    >
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="eyebrow">Recruitment</p>
          <h2 className="mt-1 text-xl font-black">Your job postings</h2>
        </div>
        <Link href="/recruiter/new-drive">
          <Button className="w-full px-5 sm:w-auto">
            <PlusCircle size={16} /> Create new drive
          </Button>
        </Link>
      </div>

      {error && <div className="mb-4 rounded-xl border border-red-100 bg-red-50 p-3 text-xs text-red-700">{error}</div>}

      <section className="panel overflow-hidden">
        {loading ? (
          <div className="p-10 text-center text-sm text-slate-500">Loading your drives…</div>
        ) : drives.length === 0 ? (
          <div className="p-10 text-center">
            <h3 className="text-base font-black text-ink">No drives yet</h3>
            <p className="mt-1 text-xs text-slate-500">Create a drive to start receiving applications.</p>
            <Link href="/recruiter/new-drive" className="mt-4 inline-flex">
              <Button><PlusCircle size={16} /> Create new drive</Button>
            </Link>
          </div>
        ) : (
          <div className="table-scroll">
            <table className="w-full min-w-[720px] text-left text-xs">
              <thead className="bg-mist/70 text-[10px] uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-3 font-bold">Role</th>
                  <th className="px-4 py-3 font-bold">Schedule</th>
                  <th className="px-4 py-3 font-bold">Compensation</th>
                  <th className="px-4 py-3 font-bold">Status</th>
                  <th className="px-5 py-3 text-right font-bold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {drives.map(drive => (
                  <tr key={drive.id} className="transition hover:bg-slate-50/70">
                    <td className="px-5 py-3.5">
                      <div className="font-bold text-ink">{drive.role}</div>
                      <div className="mt-0.5 text-[10px] text-slate-500">{drive.company}</div>
                    </td>
                    <td className="px-4 py-3.5 text-slate-600">{drive.date} · {drive.slot}</td>
                    <td className="px-4 py-3.5 text-slate-600">{drive.ctc} LPA</td>
                    <td className="px-4 py-3.5"><StatusBadge status={drive.status} /></td>
                    <td className="px-5 py-3.5 text-right">
                      <Link href={`/recruiter/drives/${drive.id}`}>
                        <Button variant="secondary" className="px-3 py-1.5">View</Button>
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </DashboardShell>
  );
}