import type { Metadata, Viewport } from 'next'
import { Toaster } from 'sonner'
import { Inter, Noto_Serif, JetBrains_Mono } from 'next/font/google'
import { GoogleAnalytics } from '@next/third-parties/google'
import { Analytics } from '@vercel/analytics/next'
import './globals.css'

/** ローカル開発・Vercel Preview では計測しない（本番のみ） */
function shouldLoadProductionAnalytics(): boolean {
  if (process.env.NODE_ENV !== 'production') return false
  if (process.env.VERCEL !== '1') return false
  const vercelEnv = process.env.VERCEL_ENV
  if (vercelEnv === 'preview' || vercelEnv === 'development') return false
  return true
}

const inter = Inter({ subsets: ["latin"], variable: '--font-inter' })
const notoSerif = Noto_Serif({ subsets: ["latin"], variable: '--font-noto-serif' })
const jetbrainsMono = JetBrains_Mono({ subsets: ["latin"], variable: '--font-jetbrains-mono' })

function getMetadataBase(): URL {
  const fromEnv = process.env.NEXT_PUBLIC_SITE_URL
  if (fromEnv) return new URL(fromEnv)
  if (process.env.VERCEL_URL) return new URL(`https://${process.env.VERCEL_URL}`)
  return new URL('http://localhost:3000')
}

const siteDescription = 'A Playground for AI & Shaders'

/** Avoid iOS auto-zoom on inputs without blocking user pinch-zoom */
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  colorScheme: 'dark light',
  themeColor: '#0d0b08',
}

export const metadata: Metadata = {
  metadataBase: getMetadataBase(),
  applicationName: 'Slang AI Lab',
  title: {
    default: 'Slang AI Lab - A Playground for AI & Shaders',
    template: '%s | Slang AI Lab',
  },
  description: siteDescription,
  keywords: [
    'GLSL',
    'HLSL',
    'shader',
    'WebGL',
    'fragment shader',
    'vertex shader',
    'AI',
    'Slang AI Lab',
  ],
  authors: [{ name: 'Slang AI Lab' }],
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
  },
  openGraph: {
    type: 'website',
    locale: 'en_US',
    siteName: 'Slang AI Lab',
    title: 'Slang AI Lab - A Playground for AI & Shaders',
    description: siteDescription,
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Slang AI Lab - A Playground for AI & Shaders',
    description: siteDescription,
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const gaId = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID
  const loadAnalytics = shouldLoadProductionAnalytics()

  return (
    <html lang="en">
      <body className={`${inter.variable} ${notoSerif.variable} ${jetbrainsMono.variable} font-sans antialiased`} suppressHydrationWarning>
        {children}
        <Toaster />
        {loadAnalytics ? <Analytics /> : null}
        {loadAnalytics && gaId ? <GoogleAnalytics gaId={gaId} /> : null}
      </body>
    </html>
  )
}
