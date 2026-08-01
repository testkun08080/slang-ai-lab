# AGENTS.md

## Cursor Cloud specific instructions

Slang AI Lab is a single Next.js app that lives entirely in `app/`. Run every
command from `app/` (or with `npm --prefix app ...`). The full, canonical command
list is in `README.md` and `CLAUDE.md` (dev/build/lint/test/lighthouse) — use those
instead of memorizing new commands. This section only records the non-obvious
caveats discovered while setting up this VM.

### Services

There is one service: the Next.js dev server (`npm run dev`, http://127.0.0.1:3000).
`npm run dev` uses the webpack dev server bound to `127.0.0.1`. There is no
database, backend, or external service — shaders are compiled in-browser by the
bundled Slang WebAssembly compiler (`app/public/slang/`) and previewed with WebGPU.

### Lint / unit tests / build (no GPU needed)

`npm run lint`, `npm run test:unit` (Vitest), and `npm run build` all work out of
the box and are the reliable signals for most changes. Lint currently reports
warnings only (no errors). No `GROQ_API_KEY` is required for these.

### WebGPU is the big gotcha (E2E + any live-preview verification)

The preview canvas needs WebGPU. This VM has no hardware GPU, so WebGPU only works
through SwiftShader (software Vulkan), and only if you launch the **full** Chromium
(not `chrome-headless-shell`) with the SwiftShader ICD env var set. Playwright's
default managed browser for headless is the headless-shell, which has **no
`navigator.gpu`** at all — that is why a plain `npm run test:e2e` renders nothing.

To get a working WebGPU adapter, set both of these (version-robust, from `app/`):

```bash
CHROME="$(node -e "console.log(require('@playwright/test').chromium.executablePath())")"
export PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH="$CHROME"
export VK_ICD_FILENAMES="$(dirname "$CHROME")/vk_swiftshader_icd.json"
```

With both set, `navigator.gpu.requestAdapter()` succeeds (vendor = SwiftShader) and
offscreen render + `copyTextureToBuffer` readback produces correct pixels.

### Verifying the live preview actually renders

The app renders visibly only through a real window compositor. Drive a **headed**
Chromium under Xvfb and screenshot the page (the compositor captures the WebGPU
swapchain):

```bash
xvfb-run -a -s "-screen 0 1600x1000x24" node your-playwright-script.mjs
```

Launch with these args: `--enable-unsafe-webgpu --enable-features=Vulkan
--use-angle=vulkan --use-vulkan=swiftshader --enable-unsafe-swiftshader
--no-sandbox` and `headless: false`, plus the two env vars above. `page.screenshot()`
then captures the rendered shader. The default "Palette Flow" template renders and
animates on first load — a clean end-to-end proof of Slang → WGSL → WebGPU.

### Known SwiftShader-only limitations (not app bugs)

- The WebGPU-paint E2E specs (`e2e/slang-samples.spec.ts` 2D-render cases,
  `e2e/ai-generation.spec.ts`, `e2e/pixel-verification.spec.ts`,
  `e2e/visual-review.spec.ts`) verify paint by reading canvas pixels with
  `drawImage` + `getImageData`. SwiftShader's WebGPU **swapchain** is not readable
  that way (returns transparent), and the app's device-loss→CPU-readback fallback
  never fires because SwiftShader does not report a device loss here. These specs
  therefore fail on this software-rendering VM even though the shader renders
  correctly on screen — they need real GPU hardware. The remaining ~8 E2E specs
  (default editor content, template text, legacy GLSL, project creation) pass.
- Switching templates / editing shader source while the canvas is running can flash
  a transient `WebGPU: [Buffer (unlabeled)] used in submit while destroyed` overlay
  under SwiftShader (a pipeline-rebuild timing artifact); it does not reproduce on
  real GPUs. Interactions that only update uniforms (playback pause/play, the
  bottom speed slider, `@param` sliders) never trigger it.

### Other notes

- AI shader generation calls Groq. For real generation set `GROQ_API_KEY` (server
  default) or paste a key into the in-app Settings panel. The AI E2E specs mock the
  route, so tests do not need a key.
- The bottom toolbar slider labeled `u_time` is actually the playback **speed**
  multiplier (0.00x–3.00x), not a time scrubber.
