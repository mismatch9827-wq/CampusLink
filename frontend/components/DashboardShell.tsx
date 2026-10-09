'use client'
import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { BarChart3, Bell, BriefcaseBusiness, CalendarDays, Check, CheckSquare2, Database, FileCheck2, LayoutDashboard, LogOut, Mail, Menu, MessageCircleQuestion, PlusCircle, ShieldCheck, X } from 'lucide-react'
import { Brand } from './Brand'
import { clearAuth, getName } from '@/lib/auth'
import { API_URL, api } from '@/lib/api'
import type { Notification, Role } from '@/lib/types'

const nav: Record<Role, {href:string;label:string;icon:any}[]> = {
  student: [
    {href:'/student',label:'My readiness',icon:LayoutDashboard},
    {href:'/student/drives',label:'Eligible drives',icon:BriefcaseBusiness},
    {href:'/student/chatbot',label:'Eligibility assistant',icon:MessageCircleQuestion},
  ],
  recruiter: [
    {href:'/recruiter',label:'Dashboard',icon:LayoutDashboard},
    {href:'/recruiter/drives',label:'My drives',icon:BriefcaseBusiness},
    {href:'/recruiter/new-drive',label:'Post a job',icon:PlusCircle},
  ],
  admin: [
    {href:'/admin',label:'Command dashboard',icon:BarChart3},
    {href:'/admin/imports',label:'Master data & imports',icon:Database},
    {href:'/admin/drives',label:'Gate 1 · Drives',icon:CalendarDays},
    {href:'/admin/verification',label:'Gate 2 · Verification',icon:ShieldCheck},
    {href:'/admin/shortlists',label:'Gate 3 · Shortlists',icon:CheckSquare2},
    {href:'/admin/offers',label:'Offers & joining',icon:FileCheck2},
  ],
}

export function DashboardShell({role,children,title,subtitle}:{role:Role;children:React.ReactNode;title:string;subtitle:string}) {
  const [open,setOpen]=useState(false)
  const [name,setName]=useState('')
  const [notifications,setNotifications]=useState<Notification[]>([])
  const [notificationsOpen,setNotificationsOpen]=useState(false)
  const [notificationsLoading,setNotificationsLoading]=useState(false)
  const [notificationBusyId,setNotificationBusyId]=useState<string | null>(null)
  const [notificationError,setNotificationError]=useState('')
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

  async function toggleNotifications() {
    const willOpen = !notificationsOpen
    setNotificationsOpen(willOpen)
    if (!willOpen) return
    setNotificationsLoading(true)
    setNotificationError('')
    try {
      setNotifications(await api.notifications())
    } catch (reason) {
      setNotificationError(reason instanceof Error ? reason.message : 'Could not load notifications')
    } finally {
      setNotificationsLoading(false)
    }
  }

  async function respondToProposal(note: Notification, accept: boolean) {
    if (!note.drive_id || !note.proposal_id) return
    setNotificationBusyId(note.id)
    setNotificationError('')
    try {
      await api.respondToSchedule(note.drive_id, note.proposal_id, accept)
      setNotifications(current => current.map(item => item.id === note.id ? { ...item, read: true, action_state: accept ? 'accepted' : 'rejected' } : item))
    } catch (reason) {
      setNotificationError(reason instanceof Error ? reason.message : 'Could not respond to this schedule')
    } finally {
      setNotificationBusyId(null)
    }
  }

  async function markNotificationRead(note: Notification) {
    try {
      await api.markNotificationRead(note.id)
      setNotifications(current => current.map(item => item.id === note.id ? { ...item, read: true } : item))
    } catch (reason) {
      setNotificationError(reason instanceof Error ? reason.message : 'Could not update notification')
    }
  }

  const unreadCount = notifications.filter(note => !note.read).length

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
            <div className="relative">
              <button onClick={toggleNotifications} aria-label="Notifications" aria-expanded={notificationsOpen} className="relative grid h-10 w-10 place-items-center rounded-xl border border-slate-200 bg-white">
                <Bell size={18} />
                {unreadCount > 0 && <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-red-600 px-1 text-[9px] font-bold text-white">{unreadCount}</span>}
              </button>
              {notificationsOpen && (
                <section className="absolute right-0 top-[calc(100%+0.5rem)] z-50 max-h-[min(70vh,34rem)] w-[min(24rem,calc(100vw-2rem))] overflow-y-auto rounded-xl border border-slate-200 bg-white p-3 text-left shadow-xl">
                  <div className="flex items-center justify-between border-b border-slate-100 px-1 pb-2">
                    <h2 className="text-sm font-black">Notifications</h2>
                    <button onClick={() => setNotificationsOpen(false)} aria-label="Close notifications" className="grid h-7 w-7 place-items-center rounded-md text-slate-500 hover:bg-slate-100"><X size={15} /></button>
                  </div>
                  {notificationError && <p className="mt-2 rounded-lg bg-red-50 p-2 text-[11px] text-red-700">{notificationError}</p>}
                  {notificationsLoading ? (
                    <p className="p-5 text-center text-xs text-slate-500">Loading notifications…</p>
                  ) : notifications.length === 0 ? (
                    <p className="p-5 text-center text-xs text-slate-500">No notifications.</p>
                  ) : (
                    <div className="divide-y divide-slate-100">
                      {notifications.map(note => {
                        const canRespond = role === 'recruiter' && note.type === 'schedule_proposal' && !note.read && note.action_state !== 'superseded'
                        return (
                          <article key={note.id} className={`py-3 ${note.read ? 'opacity-70' : ''}`}>
                            <div className="flex items-start justify-between gap-2">
                              <h3 className="text-xs font-bold text-slate-800">{note.title || 'Update'}</h3>
                              {!note.read && <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-teal-600" />}
                            </div>
                            <p className="mt-1 text-[11px] leading-relaxed text-slate-600">{note.message}</p>
                            {note.date && <p className="mt-1 text-[11px] font-semibold text-slate-700">{note.date} · {note.slot} · {note.venue}</p>}
                            {note.contact_email && <a className="mt-1 inline-flex items-center gap-1 text-[11px] text-brand hover:underline" href={`mailto:${note.contact_email}`}><Mail size={12} />{note.contact_email}</a>}
                            {canRespond ? (
                              <div className="mt-2 flex gap-2">
                                <button disabled={notificationBusyId === note.id} onClick={() => void respondToProposal(note, true)} className="inline-flex items-center gap-1 rounded-md bg-emerald-700 px-2.5 py-1.5 text-[10px] font-bold text-white disabled:opacity-50"><Check size={12} />Accept</button>
                                <button disabled={notificationBusyId === note.id} onClick={() => void respondToProposal(note, false)} className="inline-flex items-center gap-1 rounded-md border border-red-200 px-2.5 py-1.5 text-[10px] font-bold text-red-700 disabled:opacity-50"><X size={12} />Reject</button>
                              </div>
                            ) : !note.read ? (
                              <button onClick={() => void markNotificationRead(note)} className="mt-2 text-[10px] font-bold text-brand hover:underline">Mark read</button>
                            ) : note.action_state && note.action_state !== 'superseded' ? (
                              <p className="mt-2 text-[10px] font-bold capitalize text-slate-500">{note.action_state}</p>
                            ) : null}
                          </article>
                        )
                      })}
                    </div>
                  )}
                </section>
              )}
            </div>
          </div>
        </header>
      <main className="mx-auto max-w-[1600px] p-4 md:p-6 lg:p-8">{children}</main>
    </div>
  </div>
  )
}

