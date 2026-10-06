import React from 'react'
export function Card({ className='', children }: {className?:string; children:React.ReactNode}) {
  return <section className={`panel ${className}`}>{children}</section>
}
