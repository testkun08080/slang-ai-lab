/**
 * AI shader generation flow (Slang).
 *
 * The Groq-backed /api/generate-shader route is mocked so the test runs
 * without an API key, but everything downstream is real: the mocked Slang
 * source goes through the in-browser slang-wasm compiler, the WGSL output
 * feeds the WebGPU canvas, and the AI Shader History records the result.
 *
 * The route now streams Server-Sent Events (`delta` frames + one `final`
 * payload), so the mock fulfils a `text/event-stream` body to exercise the
 * client's streaming consumer end-to-end.
 */
import { test, expect } from "@playwright/test";
import {
  clearAppStorage,
  openProjectsPanel,
  slangEditor,
  visibleTestId,
  waitForSlangPreview,
} from "./helpers";

const GENERATED_MARKER = "AI generated: neon pulse";

const GENERATED_SLANG = `// ${GENERATED_MARKER}
uniform float  u_time;
uniform float2 u_resolution;
uniform float2 u_mouse;

[shader("fragment")]
float4 fragmentMain(float4 fragCoord : SV_Position) : SV_Target
{
    float2 uv = fragCoord.xy / u_resolution;
    float pulse = 0.5 + 0.5 * sin(u_time * 2.0);
    float3 col = float3(uv.x, pulse, 1.0 - uv.y);
    return float4(col, 1.0);
}
`;

/**
 * Build an SSE body mirroring what the real route emits: the model's JSON
 * object split into `delta` frames, followed by the authoritative `final`.
 */
function buildSseBody(): string {
  const json = JSON.stringify({
    title: "Neon Pulse",
    description: "A pulsing neon gradient shader.",
    warnings: [],
    slang: GENERATED_SLANG,
  });
  const frame = (obj: unknown) => `data: ${JSON.stringify(obj)}\n\n`;
  let body = "";
  for (let i = 0; i < json.length; i += 40) {
    body += frame({ type: "delta", text: json.slice(i, i + 40) });
  }
  body += frame({
    type: "final",
    payload: {
      title: "Neon Pulse",
      description: "A pulsing neon gradient shader.",
      slang: GENERATED_SLANG,
      warnings: [],
    },
  });
  return body;
}

test.describe("AI Slang generation", () => {
  test.beforeEach(async ({ page }) => {
    await clearAppStorage(page);
    await page.route("**/api/generate-shader", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "text/event-stream",
        body: buildSseBody(),
      });
    });
    await page.goto("/");
  });

  test("prompt generates Slang that compiles and renders", async ({ page }) => {
    // Default project renders before we prompt.
    await waitForSlangPreview(page, "2d");

    // Open the AI prompt panel and send a prompt.
    await page.getByRole("button", { name: "AI", exact: true }).filter({ visible: true }).first().click();
    const input = visibleTestId(page, "ai-prompt-input");
    await input.fill("neon pulse gradient");
    await visibleTestId(page, "ai-send-button").click();

    // The streamed Slang is applied to the editor…
    // (The chat view switches to the newly created project's history, so the
    // reply text itself is not asserted here — the applied shader is.)
    await expect(slangEditor(page)).toHaveValue(new RegExp(GENERATED_MARKER));

    // …and compiles + renders through slang-wasm -> WGSL -> WebGPU.
    await waitForSlangPreview(page, "2d");

    // The AI Shader History records the generation with an Apply action.
    await openProjectsPanel(page);
    await expect(
      page.getByRole("button", { name: "Apply", exact: true }).filter({ visible: true }).first(),
    ).toBeVisible();
  });

  test("preview shows a waiting pulse while a shader is generating", async ({ page }) => {
    // Hold the response open so the in-flight "waiting" state is observable.
    await page.unroute("**/api/generate-shader");
    await page.route("**/api/generate-shader", async (route) => {
      await new Promise((r) => setTimeout(r, 700));
      await route.fulfill({
        status: 200,
        contentType: "text/event-stream",
        body: buildSseBody(),
      });
    });

    await waitForSlangPreview(page, "2d");

    await page.getByRole("button", { name: "AI", exact: true }).filter({ visible: true }).first().click();
    const input = visibleTestId(page, "ai-prompt-input");
    await input.fill("neon pulse gradient");
    await visibleTestId(page, "ai-send-button").click();

    // While the request is in flight the preview stands by (dim/restore pulse).
    await expect(page.locator('[data-preview-pending="true"]')).toBeVisible();

    // Once the shader lands, the waiting state clears and the preview renders.
    await expect(slangEditor(page)).toHaveValue(new RegExp(GENERATED_MARKER));
    await expect(page.locator('[data-preview-pending="true"]')).toHaveCount(0);
    await waitForSlangPreview(page, "2d");
  });

  test("API error is surfaced in chat without breaking the preview", async ({ page }) => {
    await page.route("**/api/generate-shader", async (route) => {
      await route.fulfill({
        status: 429,
        contentType: "application/json",
        body: JSON.stringify({ error: "Rate limit exceeded. Please retry later." }),
      });
    });

    await waitForSlangPreview(page, "2d");
    const before = await slangEditor(page).inputValue();

    await page.getByRole("button", { name: "AI", exact: true }).filter({ visible: true }).first().click();
    const input = visibleTestId(page, "ai-prompt-input");
    await input.fill("anything");
    await visibleTestId(page, "ai-send-button").click();

    await expect(page.getByText(/Rate limit exceeded/).first()).toBeVisible();
    // Editor content is untouched and the preview still renders.
    await expect(slangEditor(page)).toHaveValue(before);
    await waitForSlangPreview(page, "2d");
  });
});
