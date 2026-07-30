/**
 * Captures screenshots for manual / agent visual review of Slang sample flows.
 * Run: npx playwright test e2e/visual-review.spec.ts --config playwright.config.ts
 */
import { test } from "@playwright/test";
import path from "path";
import {
  clearAppStorage,
  openProjectsPanel,
  openTemplateGallery,
  waitForSlangPreview,
  visibleTestId,
} from "./helpers";

const OUT = path.join(__dirname, "visual-review");

test.describe("Visual review captures", () => {
  test.beforeEach(async ({ page }) => {
    await clearAppStorage(page);
    await page.goto("/");
  });

  test("capture all key screens", async ({ page }) => {
    test.setTimeout(120_000);

    await page.setViewportSize({ width: 1440, height: 900 });

    // 1. Default Palette Flow + WebGPU preview
    await waitForSlangPreview(page, "2d");
    await page.screenshot({ path: path.join(OUT, "01-default-palette-flow.png"), fullPage: false });

    // 2. Code panel close-up (editor text visible)
    const editor = page.getByTestId("shader-code-editor").filter({ visible: true }).first();
    await editor.scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(OUT, "02-slang-editor-default.png"), fullPage: false });

    // 3. Template gallery — Default 2D gradient
    await openTemplateGallery(page);
    await page.screenshot({ path: path.join(OUT, "03-template-gallery-2d.png"), fullPage: false });
    await visibleTestId(page, "template-default2d").click();
    await waitForSlangPreview(page, "2d");
    await page.screenshot({ path: path.join(OUT, "04-template-default2d-preview.png"), fullPage: false });

    // 4. Texture sample template
    await openTemplateGallery(page);
    await visibleTestId(page, "template-textureSample").click();
    await waitForSlangPreview(page, "2d");
    await page.screenshot({ path: path.join(OUT, "05-template-texture-sample.png"), fullPage: false });

    // 5. 3D project — lit cube
    await openProjectsPanel(page);
    await visibleTestId(page, "new-project-3d").click();
    await waitForSlangPreview(page, "3d");
    await page.screenshot({ path: path.join(OUT, "06-3d-default-cube.png"), fullPage: false });

    // 6. Legacy GLSL (red fullscreen)
    await page.addInitScript((projectsJson: string) => {
      localStorage.setItem("slang-ai-lab-projects", projectsJson);
    }, JSON.stringify([
      {
        id: "legacy-visual",
        name: "Legacy GLSL",
        vertexShader: `attribute vec4 a_position;
attribute vec2 a_texCoord;
varying vec2 v_texCoord;
void main() {
  gl_Position = a_position;
  v_texCoord = a_texCoord;
}`,
        fragmentShader: `precision mediump float;
void main() { gl_FragColor = vec4(1.0, 0.0, 0.0, 1.0); }`,
        language: "glsl",
        renderMode: "2d",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    ]));
    await page.reload();
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(OUT, "07-legacy-glsl-red.png"), fullPage: false });
  });
});
