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

export async function waitForSlangPreview(page: Page, mode: "2d" | "3d" = "2d") {
  const testId = mode === "2d" ? "webgpu-canvas" : "shader-canvas";
  const canvas = visibleTestId(page, testId);
  await canvas.waitFor({ state: "visible" });
  // Slang WASM compile + pipeline build (debounced ~400ms).
  await page.waitForTimeout(1_500);
  const preError = page.locator("pre").filter({
    hasText:
      /SlangCompileError|compilation failed|WebGPU is not supported|minimum binding size|WebGPU:|ERROR:|invalid version|syntax error/i,
  });
  if (await preError.count()) {
    const text = await preError.first().textContent();
    throw new Error(`Preview error overlay: ${text}`);
  }

  const shaderCanvasError = page.locator("p").filter({
    hasText: /shader error|failed to create|failed to link|syntax error|invalid version/i,
  });
  if (await shaderCanvasError.count()) {
    const text = await shaderCanvasError.first().textContent();
    throw new Error(`Preview error overlay: ${text}`);
  }
  const size = await canvas.evaluate((el: HTMLCanvasElement) => ({
    width: el.width,
    height: el.height,
  }));
  if (size.width < 1 || size.height < 1) {
    throw new Error(`Canvas has zero size: ${JSON.stringify(size)}`);
  }

  if (mode === "2d") {
    // Wait until the WebGPU canvas has actually been painted (any pixel with
    // non-zero alpha on the center row). A freshly created canvas is fully
    // transparent; the render pass clears to opaque black, so paint implies a
    // completed frame. Software WebGPU (SwiftShader CI) can take a while for
    // the first compile + frame, hence the generous timeout.
    await expect
      .poll(
        () =>
          canvas.evaluate((el: HTMLCanvasElement) => {
            const readPixels = (src: CanvasRenderingContext2D, w: number, h: number) => {
              const line = src.getImageData(0, Math.floor(h / 2), w, 1).data;
              let painted = 0;
              for (let i = 3; i < line.length; i += 4) if (line[i] > 0) painted++;
              return painted;
            };
            try {
              const direct = el.getContext("2d");
              if (direct) return readPixels(direct, el.width, el.height);
              const probe = document.createElement("canvas");
              probe.width = el.width;
              probe.height = el.height;
              const ctx = probe.getContext("2d");
              if (!ctx) return -1;
              ctx.drawImage(el, 0, 0);
              return readPixels(ctx, probe.width, probe.height);
            } catch {
              return -1;
            }
          }),
        { timeout: 90_000, message: "WebGPU canvas was never painted" },
      )
      .toBeGreaterThan(0);
  }
}
