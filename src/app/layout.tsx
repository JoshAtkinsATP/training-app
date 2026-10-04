import type { Metadata, Viewport } from 'next'
import { RegisterServiceWorker } from './register-sw'
import './globals.css'

export const metadata: Metadata = {
  title: { default: 'Training', template: '%s | Training' },
  description: 'Your programme, sessions and check-ins.',
  appleWebApp: { capable: true, title: 'Training', statusBarStyle: 'black-translucent' },
  icons: { apple: '/icons/apple-touch-icon.png' },
  robots: { index: false, follow: false },
}

export const viewport: Viewport = {
  themeColor: '#111827',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-AU" className="h-full antialiased">
      <body className="flex min-h-full flex-col">
        {children}
        <RegisterServiceWorker />
      </body>
    </html>
  )
}
