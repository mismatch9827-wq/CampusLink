import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'CampusLink | Placement Intelligence',
  description: 'AI-powered campus-to-corporate placement management platform',
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
