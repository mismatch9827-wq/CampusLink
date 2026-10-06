import React from 'react'
import { AlertTriangle, CheckCircle2, CircleAlert } from 'lucide-react'
import type { VerificationFlag } from '@/lib/types'

export function FlagList({flags}:{flags:VerificationFlag[]}) {
  if (!flags?.length) return <span className="text-xs text-slate-500">No verification flags</span>
  return <div className="space-y-2">{flags.map((f,i)=>{
    const Icon=f.level==='red'?CircleAlert:f.level==='yellow'?AlertTriangle:CheckCircle2
    const style=f.level==='red'?'border-red-100 bg-red-50 text-red-700':f.level==='yellow'?'border-amber-100 bg-amber-50 text-amber-700':'border-emerald-100 bg-emerald-50 text-emerald-700'
    return <div key={`${f.label}-${i}`} className={`flex gap-2 rounded-xl border p-2.5 ${style}`}><Icon className="mt-0.5 shrink-0" size={15}/><div><b className="block text-xs">{f.label}</b><span className="text-[10px] opacity-80">{f.detail}</span></div></div>
  })}</div>
}
