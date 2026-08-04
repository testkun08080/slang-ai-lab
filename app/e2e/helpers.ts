import { expect, type Locator, type Page } from "@playwright/test";

/** First visible element with the given test id (avoids desktop + mobile duplicates). */
export function visibleTestId(page: Page, testId: string): Locator {
  return page.getByTestId(testId).filter({ visible: true }).first();
}

/** Clear persisted projects so each test starts from the Slang default state. */
export async function clearAppStorage(page: Page) {
  await page.addInitScript(() => {
    localStorage.removeItem("slang-ai-lab-projects");
    localStorage.removeItem("slang-ai-lab-project-textures");
    localStorage.removeItem("slang-ai-lab-settings");
    localStorage.removeItem("slang-ai-lab-ai-shader-history");
  });
}

export async function openProjectsPanel(page: Page) {
  const heading = page.getByRole("heading", { name: "Projects" }).filter({ visible: true }).first();
  if (await heading.isVisible().catch(() => false)) {
    return;
  }
  await visibleTestId(page, "panel-projects").click();
  await heading.waitFor({ state: "visible" });
}

export async function openTemplateGallery(page: Page) {
  await openProjectsPanel(page);
  const toggle = page
    .getByRole("button", { name: /Templates \(2D\)|Templates \(3D\)/ })
    .filter({ visible: true })
    .first();
  const expanded = await toggle.getAttribute("aria-expanded");
  if (expanded !== "true") {
    await toggle.click();
  }
  await visibleTestId(page, "template-default2d")
    .or(visibleTestId(page, "template-paletteFlow"))
    .or(visibleTestId(page, "template-default3d"))
    .first()
    .waitFor({ state: "visible" });
}

export function slangEditor(page: Page) {
  return visibleTestId(page, "shader-code-editor");
}

/** Preview error overlays (Slang compile / WebGPU / WebGL link). */
function previewErrorLocators(page: Page) {
  const preError = page.locator("pre").filter({
    hasText:
      /SlangCompileError|compilation failed|WebGPU is not supported|minimum binding size|WebGPU:|ERROR:|invalid version|syntax error/i,
  });
  const shaderCanvasError = page.locator("p").filter({
    hasText: /shader error|failed to create|failed to link|syntax error|invalid version/i,
  });
  return { preError, shaderCanvasError };
}

async function assertNoPreviewErrors(page: Page) {
  const { preError, shaderCanvasError } = previewErrorLocators(page);
  if (await preError.count()) {
    throw new Error(`Preview error overlay: ${await preError.first().textContent()}`);
  }
  if (await shaderCanvasError.count()) {
    throw new Error(`Preview error overlay: ${await shaderCanvasError.first().textContent()}`);
  }
}

/** Parse the bottom-left HUD "N fps" value (0 if not yet shown). */
async function readPreviewFps(page: Page): Promise<number> {
  const hud = page.getByText(/\d+\s*fps/).filter({ visible: true });
  if ((await hud.count()) === 0) return 0;
  const text = (await hud.first().textContent()) ?? "";
  const match = text.match(/(\d+)\s*fps/i);
  return match ? Number(match[1]) : 0;
}

/**
 * Wait until the Slang preview is compiling/running without error overlays.
 *
 * For 2D (WebGPU): Chrome's WebGPU swapchain is not readable via
 * drawImage/getImageData — headed Metal and headless SwiftShader both return
 * transparent zeros even while the compositor paints and FPS ticks. Treat a
 * non-zero FPS HUD + visible non-zero canvas as proof the sample is running.
 */
export async function waitForSlangPreview(page: Page, mode: "2d" | "3d" = "2d") {
  const testId = mode === "2d" ? "webgpu-canvas" : "shader-canvas";
  const canvas = visibleTestId(page, testId);
  await canvas.waitFor({ state: "visible" });
  // Slang WASM compile + pipeline build (debounced ~400ms).
  await page.waitForTimeout(1_500);
  await assertNoPreviewErrors(page);

  const size = await canvas.evaluate((el: HTMLCanvasElement) => ({
    width: el.width,
    height: el.height,
  }));
  if (size.width < 1 || size.height < 1) {
    throw new Error(`Canvas has zero size: ${JSON.stringify(size)}`);
  }

  if (mode === "2d") {
    await expect
      .poll(
        async () => {
          await assertNoPreviewErrors(page);
          return readPreviewFps(page);
        },
        {
          timeout: 45_000,
          message: "WebGPU preview never reported FPS > 0 (compile/run loop)",
        },
      )
      .toBeGreaterThan(0);
  }
}

/** Open the Compiled output panel and assert successful WGSL (or target) output. */
export async function assertCompiledOutputSuccess(page: Page) {
  const title = page.getByText("Compiled output", { exact: true }).filter({ visible: true });
  if (!(await title.first().isVisible().catch(() => false))) {
    await page
      .getByRole("button", { name: "Output" })
      .filter({ visible: true })
      .first()
      .click();
  }
  await expect(title.first()).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText(/^Success$/i).filter({ visible: true }).first()).toBeVisible({
    timeout: 30_000,
  });
  // Compiled WGSL/GLSL module body lives in a textarea inside the panel.
  const outputEditor = page
    .getByRole("textbox", { name: /code editor/i })
    .filter({ visible: true })
    .last();
  await expect(outputEditor).toBeVisible();
  await expect
    .poll(async () => (await outputEditor.inputValue()).trim().length, {
      timeout: 15_000,
      message: "Compiled output panel stayed empty",
    })
    .toBeGreaterThan(20);
  // Sanity: WGSL fragment entry or binding markers from the real Slang compiler.
  await expect(outputEditor).toHaveValue(/@fragment|@binding|fn\s+fragmentMain/);
}
