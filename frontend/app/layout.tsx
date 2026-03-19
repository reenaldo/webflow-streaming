import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Webflow Masterclass 4.0 PRO',
  description: 'Professional Webflow course streaming platform',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
