import React from 'react'

export function Brand({ inverse = false }: { inverse?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <span
        className={`relative grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-2xl shadow-sm ${
          inverse ? 'bg-white/10 ring-1 ring-white/25' : 'bg-white ring-1 ring-slate-900/10'
        }`}
      >
        <img
          src="/logo.png"
          alt="CampusConnect"
          className="h-full w-full object-cover"
        />
      </span>
      <div className="leading-tight">
        <div className={`text-sm font-black tracking-[.08em] ${inverse ? 'text-white' : 'text-ink'}`}>
          CAMPUSCONNECT
        </div>
        <div className={`text-[9px] font-semibold uppercase tracking-[.14em] ${inverse ? 'text-white/55' : 'text-slate-400'}`}>
          Placement intelligence
        </div>
      </div>
    </div>
  )
}

