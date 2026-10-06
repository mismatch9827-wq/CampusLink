'use client'

import React, { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowRight, ShieldCheck, Sparkles } from 'lucide-react'
import { Brand } from '@/components/Brand'
import { Button } from '@/components/ui/Button'
import { api, API_URL } from '@/lib/api'
import { saveAuth } from '@/lib/auth'
import type { Role } from '@/lib/types'

export default function LoginPage() {
  const router = useRouter()
  const [role, setRole] = useState<Role>('student')
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [identifier, setIdentifier] = useState('')
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [backendStatus, setBackendStatus] = useState<{ online: boolean; database?: string; loading: boolean }>({
    online: false,
    loading: true,
  })

  useEffect(() => {
    fetch(`${API_URL}/health`)
      .then(res => {
        if (!res.ok) throw new Error('Backend health check failed')
        return res.json()
      })
      .then(data => {
        setBackendStatus({ online: true, database: data.database, loading: false })
      })
      .catch(() => {
        setBackendStatus({ online: false, loading: false })
      })
  }, [])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      if (mode === 'register' && password !== confirmPassword) {
        throw new Error('Passwords do not match.')
      }
      const r = mode === 'login'
        ? await api.login(identifier, password, role)
        : await api.register({ role, identifier, password, name: role === 'student' ? undefined : name })
      saveAuth(r.access_token, r.role, r.name)
      router.push('/' + r.role)
    } catch (err: any) {
      setError(err.message || 'Login failed. Please verify backend connection.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="min-h-screen bg-white lg:grid lg:grid-cols-[1.08fr_.92fr]">
      <section className="relative hidden overflow-hidden bg-navy p-10 text-white lg:flex lg:flex-col lg:justify-between xl:p-14">
        <div className="absolute -right-24 top-12 h-80 w-80 rounded-full border border-white/10" />
        <div className="absolute right-14 top-36 h-44 w-44 rounded-full border border-teal-300/20" />
        <div className="absolute bottom-[-7rem] left-[-5rem] h-80 w-80 rounded-full bg-brand/20 blur-3xl" />
        <Brand inverse />
        <div className="relative max-w-xl">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[.07] px-3 py-1.5 text-[10px] font-bold uppercase tracking-[.12em] text-white/75">
            <Sparkles size={13} /> Campus-to-corporate operating system
          </div>
          <h1 className="mt-6 text-5xl font-black leading-[1.02] tracking-[-.055em] xl:text-6xl">
            One record.<br />Three dashboards.<br /><span className="text-[#8fd5c9]">Zero placement chaos.</span>
          </h1>
          <p className="mt-6 max-w-lg text-sm leading-7 text-white/62">
            CampusLink connects students, recruiters and the placement cell through a single verified workflow — from readiness to shortlist to joining.
          </p>
          <div className="mt-8 grid gap-3 sm:grid-cols-3">
            {[
              ['Readiness', 'Explainable scoring'],
              ['Matching', 'Fit + reasons'],
              ['Governance', '3 admin gates'],
            ].map(([a, b]) => (
              <div key={a} className="rounded-2xl border border-white/10 bg-white/[.06] p-4">
                <b className="block text-sm">{a}</b>
                <span className="mt-1 block text-[10px] text-white/45">{b}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="relative flex items-center gap-2 text-xs text-white/45">
          <ShieldCheck size={15} /> Built for transparent, controlled campus hiring.
        </div>
      </section>

      <section className="flex min-h-screen items-center justify-center bg-canvas px-5 py-10">
        <div className="w-full max-w-md">
          <div className="mb-8 lg:hidden">
            <Brand />
          </div>

          {/* Real Backend Live Indicator */}
          <div className="mb-4 flex items-center justify-between">
            <div className="eyebrow">Secure access</div>
            <div className="flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-bold">
              {backendStatus.loading ? (
                <span className="text-slate-400">Checking backend...</span>
              ) : backendStatus.online ? (
                <span className="flex items-center gap-1.5 text-emerald-700">
                  <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                  Live API ({backendStatus.database || 'FastAPI'})
                </span>
              ) : (
                <span className="flex items-center gap-1.5 text-red-600">
                  <span className="h-2 w-2 rounded-full bg-red-500" />
                  Backend Offline
                </span>
              )}
            </div>
          </div>

          <div className="grid grid-cols-3 rounded-xl border border-slate-200 bg-white p-1">
            {(['student', 'recruiter', 'admin'] as Role[]).map(option => (
              <button
                key={option}
                type="button"
                aria-pressed={role === option}
                onClick={() => { setRole(option); setMode('login'); setError('') }}
                className={`rounded-lg px-2 py-2 text-xs font-bold capitalize transition ${role === option ? 'bg-navy text-white' : 'text-slate-500 hover:bg-slate-50'}`}
              >
                {option === 'admin' ? 'Placement cell' : option}
              </button>
            ))}
          </div>

          <div className="mt-4 grid grid-cols-2 rounded-xl bg-slate-100 p-1">
            {(['login', 'register'] as const).map(option => (
              <button
                key={option}
                type="button"
                aria-pressed={mode === option}
                onClick={() => { setMode(option); setError('') }}
                className={`rounded-lg px-3 py-2 text-xs font-bold capitalize transition ${mode === option ? 'bg-white text-navy shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
              >
                {option === 'login' ? 'Sign in' : 'Create account'}
              </button>
            ))}
          </div>

          <h2 className="mt-5 text-3xl font-black tracking-[-.04em]">
            {mode === 'register' ? 'Create your account' : role === 'admin' ? 'Placement cell sign in' : `${role === 'student' ? 'Student' : 'Recruiter'} sign in`}
          </h2>
          <p className="mt-2 text-sm text-slate-500">
            {mode === 'register' && role === 'student'
              ? 'Use the email or registration number from the uploaded college roster.'
              : mode === 'register' && role === 'recruiter'
                ? 'Create a recruiter account with your work email.'
                : mode === 'register'
                  ? 'Create the first placement-cell account. This option is available once.'
                  : 'Sign in with your account credentials.'}
          </p>

          <form onSubmit={submit} className="panel mt-4 p-5 sm:p-6">
            {mode === 'register' && role !== 'student' && (
              <label className="mb-4 block">
                <span className="mb-2 block text-xs font-bold text-slate-600">Full name</span>
                <input className="field" value={name} onChange={e => setName(e.target.value)} autoComplete="name" required />
              </label>
            )}
            <label className="block">
              <span className="mb-2 block text-xs font-bold text-slate-600">
                {role === 'student' ? 'Registration number or email' : 'Email address'}
              </span>
              <input
                className="field"
                value={identifier}
                onChange={e => setIdentifier(e.target.value)}
                type={role === 'student' ? 'text' : 'email'}
                placeholder={role === 'student' ? 'Registration number or email' : 'name@company.com'}
                autoComplete={mode === 'login' ? 'username' : 'email'}
                required
              />
            </label>
            <label className="mt-4 block">
              <span className="mb-2 block text-xs font-bold text-slate-600">Password</span>
              <input
                className="field"
                value={password}
                onChange={e => setPassword(e.target.value)}
                type="password"
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                minLength={8}
                required
              />
            </label>
            {mode === 'register' && (
              <label className="mt-4 block">
                <span className="mb-2 block text-xs font-bold text-slate-600">Confirm password</span>
                <input
                  className="field"
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  type="password"
                  autoComplete="new-password"
                  minLength={8}
                  required
                />
              </label>
            )}
            {error && (
              <div className="mt-3 rounded-xl border border-red-100 bg-red-50 p-3 text-xs text-red-700">
                {error}
              </div>
            )}
            <Button className="mt-5 w-full" disabled={loading}>
              {loading ? 'Please wait…' : mode === 'register' ? 'Create account' : 'Sign in'}
              <ArrowRight size={16} />
            </Button>
            {role === 'admin' && mode === 'login' && <p className="mt-3 text-[10px] leading-5 text-slate-500">Only the initial placement-cell account can be created here. Additional admins require local provisioning.</p>}
          </form>
        </div>
      </section>
    </main>
  )
}
