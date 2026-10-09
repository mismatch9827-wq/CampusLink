"use client";
import React, { useEffect, useRef, useState } from "react";
import {
  BriefcaseBusiness,
  Building2,
  CalendarClock,
  Check,
  CheckCircle2,
  Code2,
  ExternalLink,
  Eye,
  EyeOff,
  FileText,
  GraduationCap,
  IndianRupee,
  Loader2,
  Mail,
  MapPin,
  Sparkles,
  X,
} from "lucide-react";
import { DashboardShell } from "@/components/DashboardShell";
import { GateStepper } from "@/components/GateStepper";
import { StatusBadge } from "@/components/StatusBadge";
import { JobDescriptionPreview } from "@/components/JobDescriptionPreview";
import { Button } from "@/components/ui/Button";
import { api } from "@/lib/api";
import type { Drive } from "@/lib/types";

export default function AdminDrives() {
  const [drives, setDrives] = useState<Drive[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [schedule, setSchedule] = useState({ date: "", slot: "", venue: "" });
  const [busyId, setBusyId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // PDF Viewer State
  const [pdfLoadingId, setPdfLoadingId] = useState<string | null>(null);
  const [pdfUrls, setPdfUrls] = useState<Record<string, string>>({});
  const [pdfError, setPdfError] = useState("");
  const pdfUrlsRef = useRef<Record<string, string>>({});

  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .adminDrives()
      .then(setDrives)
      .catch((reason: Error) => setError(reason.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => () => {
    Object.values(pdfUrlsRef.current).forEach(url => URL.revokeObjectURL(url));
  }, []);

  async function loadPdf(drive: Drive) {
    if (!drive.jd_pdf_file_id) return;
    if (pdfUrlsRef.current[drive.id]) return;

    setPdfError("");
    setPdfLoadingId(drive.id);
    try {
      const blob = await api.adminDriveJdPdf(drive.id);
      const url = URL.createObjectURL(blob);
      pdfUrlsRef.current[drive.id] = url;
      setPdfUrls(current => ({ ...current, [drive.id]: url }));
    } catch (reason) {
      setPdfError(reason instanceof Error ? reason.message : "Could not load the uploaded PDF");
    } finally {
      setPdfLoadingId(null);
    }
  }

  function toggleDetails(drive: Drive) {
    if (expandedId === drive.id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(drive.id);

    // If date, slot, venue are not given in JD, leave inputs blank so placement cell adds them on their own
    setSchedule({
      date: drive.date || "",
      slot: drive.slot || "",
      venue: drive.venue || "",
    });
    setError("");
    setNotice("");

    // If drive has a PDF, automatically load the PDF
    if (drive.jd_pdf_file_id) {
      void loadPdf(drive);
    }
  }

  async function decide(drive: Drive, approve: boolean) {
    setBusyId(drive.id);
    setError("");
    try {
      const updated = await api.approveDrive(drive.id, approve);
      setDrives(current => current.map(item => item.id === drive.id ? { ...item, ...updated } : item));
      setNotice(approve ? `${drive.company} approved.` : `${drive.company} rejected.`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not update drive");
    } finally {
      setBusyId(null);
    }
  }

  async function proposeSchedule(drive: Drive) {
    setBusyId(drive.id);
    setError("");
    setNotice("");
    try {
      const updated = await api.proposeDriveSchedule(drive.id, schedule);
      setDrives(current => current.map(item => item.id === drive.id ? { ...item, ...updated } : item));
      setNotice(`Schedule proposal sent to ${drive.company}.`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not propose this schedule");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <DashboardShell
      role="admin"
      title="Drive review"
      subtitle="Review company requirements, inspect the Job Description, and agree on a schedule before approval."
    >
      <div className="mb-5">
        <GateStepper active={1} />
      </div>

      {notice && (
        <div className="mb-4 flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3.5 text-xs font-semibold text-emerald-800 shadow-sm">
          <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
          {notice}
        </div>
      )}

      {error && (
        <div className="mb-4 flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-3.5 text-xs font-semibold text-red-700 shadow-sm">
          <X size={16} className="text-red-500 shrink-0" />
          {error}
        </div>
      )}

      <div className="space-y-4">
        {drives.map(drive => {
          const expanded = expandedId === drive.id;
          const pendingProposal = drive.schedule_proposal?.status === "pending_recruiter";
          const canApprove = Boolean(drive.date && drive.slot && drive.venue) && !pendingProposal;
          const isPdfDrive = Boolean(drive.jd_pdf_file_id || drive.jd_source === "pdf");
          const hasConfirmedSchedule = Boolean(drive.date && drive.slot && drive.venue);

          return (
            <article key={drive.id} className="panel overflow-hidden transition shadow-sm">
              <div className="flex items-center justify-between gap-4 px-5 py-4">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2.5">
                      <h2 className="truncate text-base font-black text-ink">{drive.company}</h2>
                      <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">
                        {drive.role}
                      </span>
                      {isPdfDrive ? (
                        <span className="inline-flex items-center gap-1 rounded-md bg-teal-50 px-2 py-0.5 text-[10px] font-bold text-teal-800">
                          <Sparkles size={11} className="text-brand" /> PDF JD
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">
                          <FileText size={11} /> Text JD
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <StatusBadge status={drive.status} />
                  <Button
                    variant="secondary"
                    className="shrink-0 px-3.5"
                    onClick={() => toggleDetails(drive)}
                    aria-expanded={expanded}
                  >
                    {expanded ? <EyeOff size={15} /> : <Eye size={15} />}
                    {expanded ? "Collapse" : "Review drive"}
                  </Button>
                </div>
              </div>

              {expanded && (
                <div className="grid gap-6 border-t border-slate-100 p-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(380px,1fr)]">
                  {/* LEFT COLUMN: Job Description Viewer (PDF or Text) */}
                  <div className="min-w-0 space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
                      <div>
                        <div className="eyebrow">Job description viewer</div>
                        <h3 className="text-sm font-black text-ink">
                          {isPdfDrive ? "Original Recruiter JD (PDF)" : "Submitted Job Description (Text)"}
                        </h3>
                      </div>
                      {drive.recruiter_email && (
                        <a
                          className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-brand"
                          href={`mailto:${drive.recruiter_email}`}
                        >
                          <Mail size={13} /> {drive.recruiter_email}
                        </a>
                      )}
                    </div>

                    {isPdfDrive ? (
                      /* PDF Viewer Section */
                      <section className="space-y-3">
                        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-teal-100 bg-teal-50/50 p-3">
                          <div className="flex items-center gap-2 min-w-0">
                            <FileText size={18} className="text-teal-700 shrink-0" />
                            <div className="min-w-0">
                              <p className="truncate text-xs font-bold text-teal-900">
                                {drive.jd_pdf_filename || "Job Description.pdf"}
                              </p>
                              <p className="text-[10px] text-teal-700/80">
                                Original document submitted by recruiter · Stored in database for AI engines
                              </p>
                            </div>
                          </div>

                          {pdfUrls[drive.id] && (
                            <a
                              href={pdfUrls[drive.id]}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1.5 rounded-lg border border-teal-200 bg-white px-3 py-1.5 text-xs font-bold text-teal-800 shadow-2xs hover:bg-teal-50"
                            >
                              <ExternalLink size={13} /> Open in new tab
                            </a>
                          )}
                        </div>

                        {pdfLoadingId === drive.id && (
                          <div className="flex h-96 flex-col items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-500">
                            <Loader2 size={28} className="animate-spin text-brand" />
                            <p className="mt-3 text-xs font-bold">Loading PDF document…</p>
                          </div>
                        )}

                        {pdfError && (
                          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-xs font-semibold text-red-700">
                            {pdfError}
                          </div>
                        )}

                        {pdfUrls[drive.id] && (
                          <iframe
                            className="h-[min(80vh,850px)] w-full rounded-xl border border-slate-200 bg-white shadow-2xs"
                            src={pdfUrls[drive.id]}
                            title={`${drive.company} job description PDF`}
                          />
                        )}
                      </section>
                    ) : (
                      /* Text JD Section */
                      <section className="rounded-xl border border-slate-200 bg-white p-4">
                        <JobDescriptionPreview text={drive.jd || "No job description text provided."} />
                      </section>
                    )}
                  </div>

                  {/* RIGHT COLUMN: Recruiter's Requirements & Schedule Proposal */}
                  <div className="space-y-5">
                    {/* RECRUITER REQUIREMENTS DISPLAY CARD (Decided by recruiter, read-only for placement cell) */}
                    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs space-y-4">
                      <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                        <div>
                          <div className="eyebrow">Recruiter Requirements</div>
                          <h4 className="text-sm font-black text-slate-800">Job & eligibility criteria</h4>
                        </div>
                        <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">
                          Decided by Recruiter
                        </span>
                      </div>

                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="rounded-xl bg-slate-50 p-3">
                          <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400 block mb-0.5">
                            Company
                          </span>
                          <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                            <Building2 size={13} className="text-brand shrink-0" />
                            {drive.company || "Not specified"}
                          </span>
                        </div>

                        <div className="rounded-xl bg-slate-50 p-3">
                          <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400 block mb-0.5">
                            Position / Role
                          </span>
                          <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                            <BriefcaseBusiness size={13} className="text-brand shrink-0" />
                            {drive.role || "Not specified"}
                          </span>
                        </div>
                      </div>

                      <div className="grid gap-3 sm:grid-cols-3">
                        <div className="rounded-xl bg-slate-50 p-3">
                          <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400 block mb-0.5">
                            CTC Package
                          </span>
                          <span className="text-xs font-bold text-slate-800 flex items-center gap-1">
                            <IndianRupee size={12} className="text-brand shrink-0" />
                            {drive.ctc ? `${drive.ctc} LPA` : "Not specified"}
                          </span>
                        </div>

                        <div className="rounded-xl bg-slate-50 p-3">
                          <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400 block mb-0.5">
                            Min CGPA
                          </span>
                          <span className="text-xs font-bold text-slate-800 flex items-center gap-1">
                            <GraduationCap size={13} className="text-brand shrink-0" />
                            {drive.min_cgpa ? `≥ ${drive.min_cgpa}` : "No cutoff"}
                          </span>
                        </div>

                        <div className="rounded-xl bg-slate-50 p-3">
                          <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400 block mb-0.5">
                            Max Backlogs
                          </span>
                          <span className="text-xs font-bold text-slate-800">
                            {drive.max_backlogs != null ? `≤ ${drive.max_backlogs}` : "0"}
                          </span>
                        </div>
                      </div>

                      <div className="rounded-xl bg-slate-50 p-3">
                        <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400 block mb-1">
                          Eligible Branches
                        </span>
                        <div className="flex flex-wrap gap-1.5">
                          {drive.branches?.length ? (
                            drive.branches.map(branch => (
                              <span
                                key={branch}
                                className="rounded-md bg-white border border-slate-200 px-2 py-0.5 text-[11px] font-semibold text-slate-700 shadow-2xs"
                              >
                                {branch}
                              </span>
                            ))
                          ) : (
                            <span className="text-xs text-slate-500">All branches eligible</span>
                          )}
                        </div>
                      </div>

                      <div className="rounded-xl bg-slate-50 p-3">
                        <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400 block mb-1">
                          Required Technical Skills
                        </span>
                        <div className="flex flex-wrap gap-1.5">
                          {drive.required_skills?.length ? (
                            drive.required_skills.map(skill => (
                              <span
                                key={skill}
                                className="rounded-md bg-teal-50 border border-teal-100 px-2 py-0.5 text-[11px] font-semibold text-teal-800"
                              >
                                {skill}
                              </span>
                            ))
                          ) : (
                            <span className="text-xs text-slate-500">No specific skills indexed</span>
                          )}
                        </div>
                      </div>
                    </section>

                    {/* CONFIRMED SCHEDULE SUMMARY */}
                    <section className="rounded-2xl bg-slate-50 p-4 border border-slate-200/80">
                      <div className="eyebrow">Drive schedule</div>
                      {hasConfirmedSchedule ? (
                        <div className="mt-2 space-y-1.5 text-xs text-slate-700">
                          <div className="flex items-center gap-2 font-medium">
                            <CalendarClock size={14} className="text-brand" />
                            {drive.date} · {drive.slot}
                          </div>
                          <div className="flex items-center gap-2 font-medium">
                            <MapPin size={14} className="text-brand" />
                            {drive.venue}
                          </div>
                        </div>
                      ) : (
                        <p className="mt-2 text-xs text-amber-800 bg-amber-50/80 rounded-lg p-2.5 border border-amber-200 font-medium">
                          No schedule was specified in the JD. Placement cell can set and propose date, time, and venue below.
                        </p>
                      )}

                      {pendingProposal && (
                        <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-[11px] font-semibold text-amber-800">
                          Waiting for recruiter response: {drive.schedule_proposal?.date} ·{" "}
                          {drive.schedule_proposal?.slot} · {drive.schedule_proposal?.venue}
                        </p>
                      )}
                      {drive.schedule_status === "rejected" && !pendingProposal && (
                        <p className="mt-3 text-[11px] font-semibold text-amber-800">
                          The recruiter declined the last proposal. You can suggest another schedule.
                        </p>
                      )}
                      {drive.schedule_status === "accepted" && (
                        <p className="mt-3 text-[11px] font-semibold text-emerald-700">
                          The recruiter accepted the proposed schedule.
                        </p>
                      )}
                    </section>

                    {/* PROPOSE OR CHANGE SCHEDULE (Placement cell fills this if date/time/venue not in JD) */}
                    <form
                      className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs"
                      onSubmit={event => {
                        event.preventDefault();
                        void proposeSchedule(drive);
                      }}
                    >
                      <div>
                        <h4 className="text-sm font-black text-slate-800">Propose or change schedule</h4>
                        <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
                          Add or adjust the schedule date, time, and venue for the recruiter to confirm.
                        </p>
                      </div>

                      <label className="block text-[11px] font-bold text-slate-600">
                        Date
                        <input
                          className="field mt-1.5 py-2 text-xs"
                          type="date"
                          required
                          value={schedule.date}
                          onChange={event =>
                            setSchedule(current => ({ ...current, date: event.target.value }))
                          }
                        />
                      </label>

                      <label className="block text-[11px] font-bold text-slate-600">
                        Time slot
                        <input
                          className="field mt-1.5 py-2 text-xs"
                          required
                          value={schedule.slot}
                          onChange={event =>
                            setSchedule(current => ({ ...current, slot: event.target.value }))
                          }
                          placeholder="e.g. 10:00 AM - 4:00 PM"
                        />
                      </label>

                      <label className="block text-[11px] font-bold text-slate-600">
                        Venue
                        <input
                          className="field mt-1.5 py-2 text-xs"
                          required
                          value={schedule.venue}
                          onChange={event =>
                            setSchedule(current => ({ ...current, venue: event.target.value }))
                          }
                          placeholder="e.g. Training & Placement Cell Lab / Virtual"
                        />
                      </label>

                      <Button
                        className="w-full"
                        disabled={pendingProposal || busyId === drive.id}
                      >
                        <CalendarClock size={15} />
                        {busyId === drive.id
                          ? "Sending proposal…"
                          : pendingProposal
                          ? "Awaiting recruiter response"
                          : "Send schedule proposal"}
                      </Button>
                    </form>

                    {/* GATE 1 APPROVAL ACTIONS */}
                    {drive.status === "pending_admin_review" && (
                      <div className="space-y-2 pt-1">
                        <div className="flex gap-2">
                          <Button
                            className="flex-1"
                            disabled={!canApprove || busyId === drive.id}
                            onClick={() => void decide(drive, true)}
                          >
                            <Check size={15} /> Approve drive (Gate 1)
                          </Button>
                          <Button
                            className="flex-1"
                            variant="danger"
                            disabled={busyId === drive.id}
                            onClick={() => void decide(drive, false)}
                          >
                            <X size={15} /> Reject
                          </Button>
                        </div>
                        {!canApprove && !pendingProposal && (
                          <p className="text-[11px] text-slate-500">
                            Confirm a date, time, and venue before approving the drive.
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </article>
          );
        })}

        {loading && <div className="panel p-10 text-center text-sm text-slate-500">Loading drives…</div>}
        {!loading && !drives.length && !error && (
          <div className="panel p-10 text-center text-sm text-slate-500">No drives found.</div>
        )}
      </div>
    </DashboardShell>
  );
}
