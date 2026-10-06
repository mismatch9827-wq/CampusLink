'use client'
import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { BarChart3, Bell, BriefcaseBusiness, CalendarDays, CheckSquare2, FileCheck2, LayoutDashboard, LogOut, Menu, MessageCircleQuestion, PlusCircle, ShieldCheck, X } from 'lucide-react'
import { Brand } from './Brand'
import { clearAuth, getName } from '@/lib/auth'
import { API_URL } from '@/lib/api'
import type { Role } from '@/lib/types'

const nav: Record<Role, {href:string;label:string;icon:any}[]> = {
  student: [
    {href:'/student',label:'My readiness',icon:LayoutDashboard},
    {href:'/student/drives',label:'Eligible drives',icon:BriefcaseBusiness},
    {href:'/student/chatbot',label:'Eligibility assistant',icon:MessageCircleQuestion},
  ],
  recruiter: [
    {href:'/recruiter',label:'My drives',icon:LayoutDashboard},
    {href:'/recruiter/new-drive',label:'Post a job',icon:PlusCircle},
  ],
  admin: [
    {href:'/admin',label:'Command dashboard',icon:BarChart3},
    {href:'/admin/drives',label:'Gate 1 · Drives',icon:CalendarDays},
    {href:'/admin/verification',label:'Gate 2 · Verification',icon:ShieldCheck},
    {href:'/admin/shortlists',label:'Gate 3 · Shortlists',icon:CheckSquare2},
    {href:'/admin/offers',label:'Offers & joining',icon:FileCheck2},
  ],
}

export function DashboardShell({role,children,title,subtitle}:{role:Role;children:React.ReactNode;title:string;subtitle:string}) {
  const [open,setOpen]=useState(false)
  const [name,setName]=useState('')
  const pathname=usePathname()
  const router=useRouter()
  const [backendLive, setBackendLive] = useState<boolean | null>(null)

  useEffect(() => {
    setName(getName() || role)
    fetch(`${API_URL}/health`)
      .then(res => res.ok ? setBackendLive(true) : setBackendLive(false))
      .catch(() => setBackendLive(false))
  }, [role])

  function logout() {
    clearAuth()
    router.push('/')
  }

  return (
    <div className="min-h-screen">
      {open && <button className="fixed inset-0 z-40 bg-slate-950/35 backdrop-blur-sm lg:hidden" onClick={() => setOpen(false)} aria-label="Close menu" />}
      <aside className={`fixed inset-y-0 left-0 z-50 flex w-[278px] flex-col bg-navy p-4 text-white transition-transform lg:translate-x-0 ${open ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex h-14 items-center justify-between px-2">
          <Brand inverse />
          <button className="grid h-9 w-9 place-items-center rounded-xl bg-white/10 lg:hidden" onClick={() => setOpen(false)}>
            <X size={18} />
          </button>
        </div>
        <div className="mt-6 rounded-2xl border border-white/10 bg-white/[.06] p-3">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-extrabold uppercase tracking-[.13em] text-white/45">Signed in as</span>
            {backendLive === true && (
              <span className="flex items-center gap-1 text-[9px] font-bold text-emerald-400">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Live API
              </span>
            )}
            {backendLive === false && (
              <span className="flex items-center gap-1 text-[9px] font-bold text-red-400">
                <span className="h-1.5 w-1.5 rounded-full bg-red-400" />
                Offline
              </span>
            )}
          </div>
          <div className="mt-1 truncate text-sm font-extrabold">{name}</div>
          <div className="mt-1 text-[10px] capitalize text-white/55">{role} workspace</div>
        </div>
        <div className="mt-7 px-2 text-[9px] font-bold uppercase tracking-[.16em] text-white/35">Workflow</div>
        <nav className="mt-2 flex-1 space-y-1">
          {nav[role].map(item => {
            const Icon = item.icon
            const active = pathname === item.href || (item.href !== '/' + role && pathname.startsWith(item.href + '/'))
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className={`flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold transition ${
                  active ? 'bg-white text-navy shadow-sm' : 'text-white/65 hover:bg-white/10 hover:text-white'
                }`}
              >
                <Icon size={17} />
                {item.label}
              </Link>
            )
          })}
        </nav>
        <button onClick={logout} className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold text-white/55 hover:bg-white/10 hover:text-white">
          <LogOut size={17} />
          Sign out
        </button>
      </aside>
      <div className="lg:pl-[278px]">
        <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/90 backdrop-blur-xl">
          <div className="mx-auto flex min-h-[74px] max-w-[1600px] items-center gap-3 px-4 md:px-6 lg:px-8">
            <button onClick={() => setOpen(true)} className="grid h-10 w-10 place-items-center rounded-xl border border-slate-200 bg-white lg:hidden">
              <Menu size={19} />
            </button>
            <div className="min-w-0 flex-1">
              <h1 className="page-title truncate">{title}</h1>
              <p className="hidden truncate text-xs text-slate-500 sm:block">{subtitle}</p>
            </div>
            {backendLive === true ? (
              <div className="hidden sm:flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[11px] font-bold text-emerald-800">
                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                Backend: Connected
              </div>
            ) : backendLive === false ? (
              <div className="hidden sm:flex items-center gap-1.5 rounded-full border border-red-200 bg-red-50 px-3 py-1 text-[11px] font-bold text-red-700">
                <span className="h-2 w-2 rounded-full bg-red-500" />
                Backend: Offline
              </div>
            ) : null}
            <button className="relative grid h-10 w-10 place-items-center rounded-xl border border-slate-200 bg-white">
              <Bell size={18} />
            </button>
          </div>
        </header>
      <main className="mx-auto max-w-[1600px] p-4 md:p-6 lg:p-8">{children}</main>
    </div>
  </div>
  )
}

