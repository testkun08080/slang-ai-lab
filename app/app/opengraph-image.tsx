import { ImageResponse } from 'next/og'
import { LogoMarkBrand } from '@/lib/logo-mark'

export const runtime = 'edge'

export const alt = 'Slang AI Lab - A Playground for AI & Shaders'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 64,
          position: 'relative',
          overflow: 'hidden',
          background: '#0d0b08',
          fontFamily:
            'ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif',
        }}
      >
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background:
              'radial-gradient(circle at 18% 28%, rgba(251,191,36,0.24), transparent 34%), radial-gradient(circle at 78% 72%, rgba(77,90,152,0.28), transparent 36%), linear-gradient(135deg, rgba(255,245,220,0.08), transparent 46%)',
          }}
        />
        <div
          style={{
            position: 'absolute',
            inset: 48,
            border: '1px solid rgba(255,245,220,0.12)',
            borderRadius: 40,
            background: 'rgba(20,16,12,0.58)',
          }}
        />
        <div
          style={{
            width: 244,
            height: 244,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: 999,
            border: '1px solid rgba(255,245,220,0.16)',
            background: 'rgba(255,245,220,0.06)',
            position: 'relative',
          }}
        >
          <LogoMarkBrand size={156} color="#fbbf24" />
        </div>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 22,
            maxWidth: 720,
            position: 'relative',
          }}
        >
          <div
            style={{
              fontSize: 88,
              fontStyle: 'italic',
              letterSpacing: '-0.055em',
              color: '#e8dcc4',
              lineHeight: 0.95,
            }}
          >
            Slang AI Lab
          </div>
          <div
            style={{
              fontSize: 34,
              color: 'rgba(232,220,196,0.68)',
              lineHeight: 1.35,
              letterSpacing: '-0.01em',
            }}
          >
            A Playground for AI &amp; Shaders
          </div>
        </div>
      </div>
    ),
    { ...size }
  )
}
