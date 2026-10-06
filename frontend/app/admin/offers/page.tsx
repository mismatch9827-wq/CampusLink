"use client";
import React, { useEffect, useState } from "react";
import { FileCheck2, Search } from "lucide-react";
import { DashboardShell } from "@/components/DashboardShell";
import { StatusBadge } from "@/components/StatusBadge";
import { api } from "@/lib/api";
import type { Offer } from "@/lib/types";

export default function OffersPage() {
  const [offers, setOffers] = useState<Offer[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    api
      .offers()
      .then(setOffers)
      .catch((reason: Error) => setError(reason.message));
  }, []);
  return (
    <DashboardShell
      role="admin"
      title="Offers & joining"
      subtitle="Track offer release, documents, acceptance decisions and joining status after selection."
    >
      {error && <div className="mb-4 rounded-xl border border-red-100 bg-red-50 p-3 text-xs text-red-700">{error}</div>}
      <section className="panel overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-slate-100 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="eyebrow">Post-selection lifecycle</div>
            <h2 className="mt-1 text-lg font-black">Offer tracker</h2>
          </div>
          <div className="flex items-center gap-2 rounded-xl border border-slate-200 px-3">
            <Search size={14} className="text-slate-400" />
            <input
              className="w-48 bg-transparent py-2.5 text-xs outline-none"
              placeholder="Search student or company"
            />
          </div>
        </div>
        <div className="table-scroll">
          <div className="min-w-[820px]">
            <div className="grid grid-cols-[1.3fr_1.1fr_.55fr_.65fr_.55fr_1fr] gap-3 border-b border-slate-100 bg-slate-50 px-5 py-3 text-[9px] font-bold uppercase tracking-[.1em] text-slate-400">
              <span>Company / role</span>
              <span>Student</span>
              <span>CTC</span>
              <span>Status</span>
              <span>Docs</span>
              <span>Joining</span>
            </div>
            {offers.map((o) => (
              <div
                key={o.id}
                className="grid grid-cols-[1.3fr_1.1fr_.55fr_.65fr_.55fr_1fr] items-center gap-3 border-b border-slate-100 px-5 py-4 text-xs last:border-0"
              >
                <div>
                  <b className="block">{o.company}</b>
                  <small className="text-[10px] text-slate-500">{o.role}</small>
                </div>
                <span>{o.student_name}</span>
                <b>₹{o.ctc}L</b>
                <StatusBadge status={o.status} />
                <span className="flex items-center gap-1">
                  <FileCheck2 size={13} className="text-brand" />
                  {o.documents}
                </span>
                <span className="text-slate-500">{o.joining_status}</span>
              </div>
            ))}
            {!offers.length && !error && <p className="p-8 text-center text-sm text-slate-500">No offers recorded.</p>}
          </div>
        </div>
      </section>
    </DashboardShell>
  );
}
