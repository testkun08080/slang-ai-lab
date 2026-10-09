import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))

const isDev = process.env.NODE_ENV !== 'production'

// Content-Security-Policy.
// - 'unsafe-inline' scripts/styles: Next.js emits inline bootstrap scripts and
//   the app uses inline styles; a nonce-based policy would force fully dynamic
//   rendering, so it is not used.
// - 'unsafe-eval': the bundled slang-wasm (Emscripten embind) builds its
//   invokers with `new Function`, so the compiler cannot run without it.
//   'wasm-unsafe-eval' is required for WebAssembly.compile.
// - Analytics hosts are only reachable when the optional GA / Vercel Analytics
//   integrations are enabled in production.
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval' https://www.googletagmanager.com https://va.vercel-scripts.com`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://www.google-analytics.com https://www.googletagmanager.com",
  "font-src 'self' data:",
  `connect-src 'self' https://www.google-analytics.com https://*.google-analytics.com https://*.analytics.google.com https://www.googletagmanager.com https://vitals.vercel-insights.com${isDev ? ' ws://127.0.0.1:* ws://localhost:*' : ''}`,
  "worker-src 'self' blob:",
  "media-src 'self' blob:",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ')

const securityHeaders = [
  { key: 'Content-Security-Policy', value: contentSecurityPolicy },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  { key: 'X-DNS-Prefetch-Control', value: 'off' },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()',
  },
  // Ignored over plain http (e.g. localhost / docker), enforced over https.
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
]

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Emit a self-contained server bundle for Docker (.next/standalone).
  output: 'standalone',
  images: {
    unoptimized: true,
  },
  outputFileTracingRoot: path.join(__dirname, '../'),
  // Don't advertise the framework/version in a response header.
  poweredByHeader: false,
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }]
  },
}

export default nextConfig
