import React from 'react'
import { Check, LockKeyhole } from 'lucide-react'
const gates=[['Gate 1','Job approval'],['Gate 2','Verification'],['Gate 3','Shortlist + conflict check']]
export function GateStepper({active=1}:{active?:1|2|3}) {
 return <div className="grid gap-2 md:grid-cols-3">{gates.map(([a,b],i)=>{const n=i+1;const done=n<active;const now=n===active;return <div key={a} className={`rounded-2xl border p-3 ${now?'border-brand/30 bg-brand/5':done?'border-emerald-100 bg-emerald-50/60':'border-slate-200 bg-white'}`}><div className="flex items-center gap-2"><span className={`grid h-7 w-7 place-items-center rounded-full text-[10px] font-black ${now?'bg-brand text-white':done?'bg-emerald-600 text-white':'bg-slate-100 text-slate-500'}`}>{done?<Check size={13}/>:n}</span><div><b className="block text-xs">{a}</b><span className="text-[10px] text-slate-500">{b}</span></div>{!done&&!now&&<LockKeyhole size={13} className="ml-auto text-slate-300"/>}</div></div>})}</div>
}
