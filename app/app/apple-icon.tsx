import { ImageResponse } from 'next/og'
import { LogoMarkBrand } from '@/lib/logo-mark'

export const runtime = 'edge'

export const size = { width: 180, height: 180 }
export const contentType = 'image/png'

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#fbf9f4',
        }}
      >
        <LogoMarkBrand size={128} />
      </div>
    ),
    { ...size }
  )
}
