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
  limit (`app/lib/rate-limit.ts`). For multi-instance deployments, replace it
  with a shared store (e.g. Upstash Redis) before exposing a funded key.
- **Generated shaders** run entirely in the client's GPU sandbox (WebGPU/WebGL);
  they cannot access the DOM or network.
