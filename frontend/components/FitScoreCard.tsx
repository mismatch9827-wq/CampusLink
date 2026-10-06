import React from 'react'
import { Sparkles } from 'lucide-react'
import { Progress } from './ui/Progress'

export function FitScoreCard({ score, reasons = [] }: { score: number; reasons?: string[] }) {
  const level = score >= 85 ? 'Strong fit' : score >= 70 ? 'Good fit' : 'Needs review'

  return (
    <div className="min-w-0 max-w-full overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <div className="flex items-end justify-between">
        <div>
          <span className="eyebrow">Fit score</span>
          <div className="mt-1 text-3xl font-black tracking-tight text-navy">
            {score}
            <span className="text-base text-slate-400">/100</span>
          </div>
        </div>
        <span className="rounded-full bg-teal-50 px-2.5 py-1 text-[10px] font-bold text-teal-700">
          {level}
        </span>
      </div>

      <div className="mt-3">
        <Progress value={score} />
      </div>

      {reasons.length > 0 && (
        <div className="mt-3.5 space-y-2">
          {reasons.slice(0, 3).map((r, i) => (
            <div
              key={i}
              className="flex items-start gap-2 text-[11px] leading-relaxed text-slate-600"
            >
              <Sparkles size={13} className="mt-0.5 shrink-0 text-brand" />
              <span className="min-w-0 flex-1 break-words">{r}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
