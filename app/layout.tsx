import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Getex - Messenger',
  description: 'Modern messaging platform with calls, channels, and stories',
  generator: 'v0.app',
  other: {
    google: 'notranslate',
  },
  icons: {
    icon: [
      {
        url: '/icon-light-32x32.png',
        media: '(prefers-color-scheme: light)',
      },
      {
        url: '/icon-dark-32x32.png',
        media: '(prefers-color-scheme: dark)',
      },
      {
        url: '/icon.svg',
        type: 'image/svg+xml',
      },
    ],
    apple: '/apple-icon.png',
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="ru" translate="no" className="notranslate">
      <body className="font-sans antialiased notranslate" translate="no">
        {children}
      </body>
    </html>
  )
}
