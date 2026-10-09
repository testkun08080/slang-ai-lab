# Security Policy

## Supported Versions

Only the latest release on the `main` branch is supported with security updates.

## Reporting a Vulnerability

Please **do not open a public GitHub issue** for security vulnerabilities.

Instead, report them privately via
[GitHub Security Advisories](https://github.com/testkun08080/slang-ai-lab/security/advisories/new)
("Report a vulnerability" on the repository's Security tab).

Include as much of the following as you can:

- A description of the vulnerability and its impact
- Steps to reproduce
- Affected component (API route, client component, dependency, …)
- Any suggested fix

You can expect an initial response within 7 days.

## Scope Notes

- **API keys**: The app never stores user-supplied Groq API keys on the server.
  Keys entered in the Settings panel live in the browser's `localStorage` and are
  forwarded per-request to the app's API route, which passes them to Groq only.
- **Server default key** (`GROQ_API_KEY`): protected by an in-memory, per-IP rate
  limit (`app/lib/rate-limit.ts`). For multi-instance or public multi-tenant
  deployments, do **not** expose a funded shared key unless you replace the limiter
  with a shared store (e.g. Upstash Redis). Prefer leaving `GROQ_API_KEY` unset so
  each user supplies their own key in Settings.
- **Rate limiting & request limits**: `/api/generate-shader` and `/api/models` are limited per
  client IP. Requests that use the server's `GROQ_API_KEY` additionally share a global
  budget, and request bodies are capped at 512 KB. Because the limiter is in-memory and
  trusts `X-Forwarded-For`, run the app behind a reverse proxy that overwrites that header.
- **HTTP security headers**: `next.config.mjs` sets a Content-Security-Policy, `X-Frame-Options`,
  `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy` and HSTS. The CSP allows
  `'unsafe-eval'` only because the bundled slang-wasm (Emscripten embind) needs `new Function`.
- **Dependencies**: CI runs `npm audit --omit=dev` and fails on moderate or higher findings.
  The only known remaining advisory is `braces` (dev-only, via the ESLint toolchain; no
  patched release exists yet).
- **Generated shaders** run entirely in the client's GPU sandbox (WebGPU/WebGL);
  they cannot access the DOM or network.
