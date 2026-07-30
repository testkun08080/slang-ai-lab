/** Brand hex for favicon / OG (matches `:root --primary` in app/globals.css) */
export const LOGO_MARK_BRAND_HEX = '#4d5a98'

const PATH_OUTER = 'M12 2L2 7V17L12 22L22 17V7L12 2Z'
const PATH_MID = 'M12 6L6 9V15L12 18L18 15V9L12 6Z'
const PATH_INNER = 'M12 10L9 11.5V14.5L12 16L15 14.5V11.5L12 10Z'

export function LogoMark({
  className,
  size = 24,
}: {
  className?: string
  size?: number
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      aria-hidden
    >
      <path
        d={PATH_OUTER}
        stroke="currentColor"
        strokeWidth={1.5}
        fill="none"
      />
      <path d={PATH_MID} fill="currentColor" opacity={0.3} />
      <path d={PATH_INNER} fill="currentColor" />
    </svg>
  )
}

/** Same geometry as `LogoMark` with fixed stroke/fill for ImageResponse and static raster icons */
export function LogoMarkBrand({
  size,
  color = LOGO_MARK_BRAND_HEX,
}: {
  size: number
  color?: string
}) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d={PATH_OUTER} stroke={color} strokeWidth={1.5} fill="none" />
      <path d={PATH_MID} fill={color} opacity={0.3} />
      <path d={PATH_INNER} fill={color} />
    </svg>
  )
}
