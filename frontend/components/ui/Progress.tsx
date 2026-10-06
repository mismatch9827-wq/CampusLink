'use client'
import * as ProgressPrimitive from '@radix-ui/react-progress'
export function Progress({value=0}: {value?:number}) {
  return <ProgressPrimitive.Root className="relative h-2 overflow-hidden rounded-full bg-slate-100"><ProgressPrimitive.Indicator className="h-full rounded-full bg-brand transition-transform" style={{transform:`translateX(-${100-value}%)`}} /></ProgressPrimitive.Root>
}
