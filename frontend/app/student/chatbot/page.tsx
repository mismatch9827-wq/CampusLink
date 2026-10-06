"use client";
import React from "react";
import { Bot } from "lucide-react";
import { DashboardShell } from "@/components/DashboardShell";

export default function ChatbotPage() {
  return (
    <DashboardShell
      role="student"
      title="Eligibility assistant"
      subtitle="The assistant is unavailable until a live service is configured."
    >
      <div className="mx-auto max-w-3xl">
        <section className="panel overflow-hidden">
          <div className="border-b border-slate-100 bg-mist/60 p-5">
            <div className="flex items-center gap-3">
              <span className="grid h-11 w-11 place-items-center rounded-2xl bg-navy text-white">
                <Bot size={19} />
              </span>
              <div>
                <h2 className="text-base font-black">CampusLink Assistant</h2>
                <p className="text-[10px] text-slate-500">
                  Explains rules — it does not override placement-cell
                  decisions.
                </p>
              </div>
            </div>
          </div>
          <div className="grid min-h-[280px] place-items-center p-8 text-center text-sm text-slate-500">
            No chatbot backend is configured.
          </div>
        </section>
      </div>
    </DashboardShell>
  );
}
