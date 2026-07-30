# Slang AI Lab — AI Shader Playground

A browser-based playground for generating and previewing shaders with AI.
Describe a visual effect in natural language — the AI writes Slang, the browser compiles it, and you see the result in real time.

**Live**: [slang-ai-lab.vercel.app](https://slang-ai-lab.vercel.app) <!-- update if deployed elsewhere -->

---

## Features

- **AI shader generation** — Powered by Groq (Llama). Supports multi-turn refinement.
- **Slang-first workflow** — AI generates canonical [Slang](https://shader-slang.org) source; the in-browser Slang compiler (WebAssembly) compiles it to WGSL, GLSL, HLSL, Metal, or SPIR-V for preview and export.
- **Real-time WebGPU preview** — 2D fragment shaders (and custom vertex stages) on WebGPU.
- **3D mesh preview** — Built-in cube/sphere or uploaded `.obj`; for Slang 3D templates the WebGL preview uses a hand-written GLSL ES 1.00 pair matched to the preset (edited Slang falls back to a lit cube until full WebGPU 3D lands).
- **User-adjustable parameters** — AI annotates uniforms; sliders and color pickers appear automatically.
- **Texture slots** — Upload up to 4 images as `iChannel0`–`iChannel3` for the shader to sample.
- **Chat history** — Conversations are saved per-project in the browser (`localStorage`).
- **Project management** — Create, rename, duplicate, and delete shader projects.
- **Export** — Copy compiled output (WGSL / GLSL / HLSL / …) or the Slang source, or download a PNG snapshot of the canvas.

---

## Quick Start

### Prerequisites

- Node.js 18+ (CI and Docker use Node 22)
- A [WebGPU](https://gpuweb.github.io/gpuweb/)-capable browser (Chrome or Edge recommended)
- A [Groq](https://console.groq.com/keys) API key (free tier available)

### Setup

```bash
git clone https://github.com/testkun08080/slang-ai-lab.git
cd slang-ai-lab/app
npm install
cp .env.local.example .env.local
```

Edit `.env.local` and add your key:

```
GROQ_API_KEY=your_groq_api_key_here
```

Start the dev server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

> **No server key?** Leave `GROQ_API_KEY` blank. Users can paste their own key directly in the Settings panel — it is stored in the browser's `localStorage` only, and is forwarded per-request through this app's API route to Groq. It is never persisted server-side.

> **Public multi-tenant deploys:** Do not expose a funded shared `GROQ_API_KEY` without a shared rate-limit store. See [SECURITY.md](./SECURITY.md).

### Docker

Run the production build in a container (includes the bundled Slang WASM compiler under `public/slang/`):

```bash
# From the repository root
docker compose up --build
```

Open [http://localhost:3000](http://localhost:3000).

Optional: create a `.env` file next to `docker-compose.yml` to set a server-side default API key:

```
GROQ_API_KEY=your_groq_api_key_here
```

Without Docker Compose:

```bash
docker build -t slang-ai-lab .
docker run --rm -p 3000:3000 -e GROQ_API_KEY=your_groq_api_key_here slang-ai-lab
```

> **Requirements:** Docker with Compose v2. The image builds the Next.js standalone server from `app/` and exposes port `3000`.

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `GROQ_API_KEY` | No | Server-side default API key. If omitted, users must supply their own. |
| `NEXT_PUBLIC_GA_MEASUREMENT_ID` | No | Google Analytics 4 measurement ID. Analytics loads only in Vercel production. |
| `NEXT_PUBLIC_SITE_URL` | No | Canonical URL used for OG metadata (e.g. `https://slang-ai-lab.vercel.app`). |

---

## Project Structure

```
app/
├── app/
│   ├── api/
│   │   ├── generate-shader/route.ts   # Groq Slang generation endpoint
│   │   └── models/route.ts            # Groq model list endpoint
│   ├── layout.tsx
│   └── page.tsx
├── components/
│   ├── shader-playground.tsx          # Root state + layout
│   ├── webgpu-canvas.tsx              # WebGPU rendering (Slang → WGSL)
│   ├── shader-canvas.tsx              # WebGL rendering engine (legacy GLSL / 3D hybrid)
│   ├── ai-chat-panel.tsx              # AI prompt UI + chat history
│   ├── code-editor.tsx                # Shader code editor
│   ├── compiled-output-panel.tsx      # Compiled WGSL/GLSL/… display
│   ├── history-panel.tsx              # Project list sidebar
│   ├── settings-panel.tsx             # API key + model selector
│   ├── texture-panel.tsx              # Texture slot management
│   ├── template-gallery.tsx           # Slang preset gallery
│   └── parameter-panel.tsx            # Auto-generated uniform controls
├── public/slang/                      # Bundled slang-wasm (Apache-2.0 WITH LLVM-exception)
└── lib/
    ├── types.ts                        # Shared TypeScript types
    ├── slang-templates.ts              # Built-in Slang shader presets
    ├── slang-compiler.ts               # In-browser Slang → WGSL/GLSL/HLSL/…
    ├── slang-normalize.ts              # Generated Slang normalization
    ├── compile-to-target.ts            # Multi-target compile orchestration
    ├── parameter-parser.ts             # @param annotation parser
    ├── texture-utils.ts                # Image loading + texture helpers
    ├── rate-limit.ts                   # IP-based request rate limiter
    └── utils.ts                        # General utilities
```

---

## Deployment

One-click deploy to Vercel:

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/testkun08080/slang-ai-lab)

Set `GROQ_API_KEY` in the Vercel project environment variables if you want a server-side default key.
For a public demo, prefer leaving it unset so each user supplies their own key (see [SECURITY.md](./SECURITY.md)).

---

## Lighthouse QA

```bash
cd app
npm run qa:lighthouse
```

Reports are saved to `app/lighthouse-report/`.

---

## Testing

Slang sample data and legacy GLSL compatibility are covered by **Vitest** (unit) and **Playwright** (E2E).

```bash
cd app
npm install
npm run test:e2e:install   # first time only — downloads Chromium

# Unit tests
npm run test:unit

# E2E tests (starts dev server automatically, or reuses one on :3000)
npm run test:e2e

# Interactive Playwright UI
npm run test:e2e:ui

# CI-style: production build + all tests
npm run test:ci
```

E2E tests verify:

- Default editor content is Slang (Palette Flow)
- WebGPU preview compiles and renders (2D)
- Template gallery switches Slang presets
- New 2D/3D projects use Slang
- Legacy `language: "glsl"` projects still open in the GLSL editor

Playwright reports are written to `app/playwright-report/`.

---

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md). Please also read our
[Code of Conduct](./CODE_OF_CONDUCT.md).

## Security

To report a vulnerability, see [SECURITY.md](./SECURITY.md) — please do not open
a public issue for security problems.

## Third-party

This project bundles the [Slang](https://github.com/shader-slang/slang) compiler as
WebAssembly under `app/public/slang/` (Apache License 2.0 WITH LLVM-exception).
See [NOTICE](./NOTICE) and [app/public/slang/LICENSE](./app/public/slang/LICENSE).

## License

[MIT](./LICENSE) (application code). Third-party components retain their own licenses.
