import React from 'react'

const map: Record<string, {label:string; cls:string}> = {
  pending_admin_review: {label:'Waiting for approval', cls:'bg-amber-50 text-amber-700 border-amber-200'},
  open_for_optin: {label:'Open for opt-in', cls:'bg-teal-50 text-teal-700 border-teal-200'},
  ranking_ready: {label:'Ranking ready', cls:'bg-sky-50 text-sky-700 border-sky-200'},
  recruiter_selected: {label:'Recruiter selected', cls:'bg-violet-50 text-violet-700 border-violet-200'},
  admin_approved: {label:'Admin approved', cls:'bg-emerald-50 text-emerald-700 border-emerald-200'},
  shortlist_published: {label:'Shortlist published', cls:'bg-emerald-50 text-emerald-700 border-emerald-200'},
  drive_rejected: {label:'Rejected', cls:'bg-red-50 text-red-700 border-red-200'},
  opted_in: {label:'Under verification', cls:'bg-amber-50 text-amber-700 border-amber-200'},
  verified: {label:'Verified', cls:'bg-sky-50 text-sky-700 border-sky-200'},
  selected_by_recruiter: {label:'Under admin review', cls:'bg-violet-50 text-violet-700 border-violet-200'},
  shortlisted: {label:'Shortlisted', cls:'bg-emerald-50 text-emerald-700 border-emerald-200'},
  offered: {label:'Offer released', cls:'bg-sky-50 text-sky-700 border-sky-200'},
  accepted: {label:'Accepted', cls:'bg-emerald-50 text-emerald-700 border-emerald-200'},
  deferred: {label:'Deferred', cls:'bg-amber-50 text-amber-700 border-amber-200'},
  withdrawn: {label:'Withdrawn', cls:'bg-slate-100 text-slate-600 border-slate-200'},
  rejected: {label:'Rejected', cls:'bg-red-50 text-red-700 border-red-200'},
}

export function StatusBadge({status}:{status:string}) {
  const item=map[status] || {label:status.replace(/_/g,' '), cls:'bg-slate-100 text-slate-600 border-slate-200'}
  return <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-extrabold ${item.cls}`}>{item.label}</span>
}
