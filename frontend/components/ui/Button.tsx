import React from 'react'

type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost'
  size?: 'sm' | 'md'
}

export function Button({ variant='primary', size='md', className='', ...props }: Props) {
  const variants = {
    primary: 'bg-navy text-white hover:bg-[#102f48] shadow-sm',
    secondary: 'border border-slate-200 bg-white text-ink hover:bg-slate-50',
    danger: 'bg-red-50 text-dangerx border border-red-100 hover:bg-red-100',
    ghost: 'text-slate-600 hover:bg-slate-100',
  }
  const sizes = { sm: 'px-3 py-2 text-xs', md: 'px-4 py-2.5 text-sm' }
  return <button className={`inline-flex items-center justify-center gap-2 rounded-xl font-bold transition disabled:cursor-not-allowed disabled:opacity-50 ${variants[variant]} ${sizes[size]} ${className}`} {...props} />
}
