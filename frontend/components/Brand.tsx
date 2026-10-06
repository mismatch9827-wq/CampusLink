import React from 'react'
import { Link2 } from 'lucide-react'
export function Brand({inverse=false}:{inverse?:boolean}) {
  return <div className="flex items-center gap-3"><span className={`grid h-10 w-10 place-items-center rounded-2xl ${inverse?'bg-white text-navy':'bg-navy text-white'}`}><Link2 size={19}/></span><div className="leading-tight"><div className={`text-sm font-black tracking-[.08em] ${inverse?'text-white':'text-ink'}`}>CAMPUSLINK</div><div className={`text-[9px] font-semibold uppercase tracking-[.14em] ${inverse?'text-white/55':'text-slate-400'}`}>Placement intelligence</div></div></div>
}
