import './globals.css'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Adressbuch',
  description: 'Modern address book with Supabase backend',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="de">
      <body>{children}</body>
    </html>
  )
}
