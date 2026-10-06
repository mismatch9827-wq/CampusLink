import React from 'react'
import Link from 'next/link'
import { Building2, CalendarDays, IndianRupee, MapPin } from 'lucide-react'
import type { Drive } from '@/lib/types'
import { StatusBadge } from './StatusBadge'
import { Button } from './ui/Button'

export function DriveCard({drive,studentMode=false,onOptIn}:{drive:Drive;studentMode?:boolean;onOptIn?:(id:string)=>void}) {
  return <article className="panel overflow-hidden transition hover:-translate-y-0.5 hover:shadow-lift">
    <div className="border-b border-slate-100 p-5">
      <div className="flex items-start justify-between gap-3"><div className="flex min-w-0 gap-3"><span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-mist text-navy"><Building2 size={20}/></span><div className="min-w-0"><h3 className="truncate text-base font-extrabold">{drive.company}</h3><p className="mt-0.5 truncate text-xs text-slate-500">{drive.role}</p></div></div><StatusBadge status={drive.status}/></div>
      <div className="mt-4 grid grid-cols-2 gap-2 text-[11px] text-slate-500"><span className="flex items-center gap-1.5"><CalendarDays size={13}/>{drive.date} · {drive.slot}</span><span className="flex items-center gap-1.5"><IndianRupee size={13}/>{drive.ctc} LPA</span><span className="col-span-2 flex items-center gap-1.5"><MapPin size={13}/>{drive.venue}</span></div>
    </div>
    <div className="p-5">
      <div className="mb-4 flex flex-wrap gap-1.5">{drive.required_skills.slice(0,4).map(s=><span key={s} className="rounded-lg bg-slate-100 px-2 py-1 text-[9px] font-semibold text-slate-600">{s}</span>)}</div>
      {studentMode ? <>
        <div className={`mb-3 rounded-xl border p-3 text-[11px] leading-5 ${drive.eligible?'border-emerald-100 bg-emerald-50 text-emerald-700':'border-red-100 bg-red-50 text-red-700'}`}><b>{drive.eligible?'Eligible':'Not eligible'}</b><div>{drive.eligibility_reason}</div></div>
        <Button className="w-full" disabled={!drive.eligible || drive.status!=='open_for_optin'} onClick={()=>onOptIn?.(drive.id)}>Opt in to drive</Button>
      </> : <Link href={`/recruiter/drives/${drive.id}`}><Button variant="secondary" className="w-full">Open drive workspace</Button></Link>}
    </div>
  </article>
}
