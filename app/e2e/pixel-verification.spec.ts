/**
 * Samples WebGPU / WebGL canvas pixels for visual verification.
 */
import { test, expect } from "@playwright/test";
import path from "path";
import {
  clearAppStorage,
  openProjectsPanel,
  openTemplateGallery,
  slangEditor,
  visibleTestId,
  waitForSlangPreview,
} from "./helpers";

const OUT = path.join(__dirname, "visual-review");

async function sampleWebGLCanvas(
  page: import("@playwright/test").Page,
  testId: "shader-canvas",
) {
  return page
    .getByTestId(testId)
    .filter({ visible: true })
    .first()
    .evaluate((canvas: HTMLCanvasElement) => {
      const gl = canvas.getContext("webgl") ?? canvas.getContext("webgl2");
      if (!gl) return { error: "no-webgl", width: canvas.width, height: canvas.height };
      const cx = Math.floor(canvas.width / 2);
      const cy = Math.floor(canvas.height / 2);
      const pixels = new Uint8Array(4);
      gl.readPixels(cx, cy, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
      return {
        width: canvas.width,
        height: canvas.height,
        center: [pixels[0], pixels[1], pixels[2], pixels[3]],
        luminance: (pixels[0] + pixels[1] + pixels[2]) / 3,
      };
    });
}

async function sampleCanvas(
  page: import("@playwright/test").Page,
  testId: "webgpu-canvas" | "shader-canvas",
) {
  return page
    .getByTestId(testId)
    .filter({ visible: true })
    .first()
    .evaluate((canvas: HTMLCanvasElement) => {
      try {
        // Readback-fallback canvases expose a 2D context directly; presented
        // WebGPU/WebGL canvases are captured via drawImage.
        let ctx = canvas.getContext("2d");
        if (!ctx) {
          const off = document.createElement("canvas");
          off.width = canvas.width;
          off.height = canvas.height;
          ctx = off.getContext("2d");
          if (!ctx) return { error: "no-2d", width: canvas.width, height: canvas.height };
          ctx.drawImage(canvas, 0, 0);
        }
        const cx = Math.floor(canvas.width / 2);
        const cy = Math.floor(canvas.height / 2);
        const d = ctx.getImageData(cx, cy, 1, 1).data;
        const row = ctx.getImageData(0, cy, canvas.width, 1).data;
        let nonBlack = 0;
        for (let i = 0; i < row.length; i += 4) {
          if (row[i] + row[i + 1] + row[i + 2] > 0) nonBlack++;
        }
        return {
          width: canvas.width,
          height: canvas.height,
          center: [d[0], d[1], d[2], d[3]],
          luminance: (d[0] + d[1] + d[2]) / 3,
          nonBlackOnCenterRow: nonBlack,
        };
      } catch (e) {
        return { error: String(e), width: canvas.width, height: canvas.height };
      }
    });
}

test.describe("Canvas pixel verification", () => {
  test.beforeEach(async ({ page }) => {
    await clearAppStorage(page);
    await page.goto("/");
  });

  test("pixel samples + annotated screenshots", async ({ page }) => {
    // Generous budget: this spec shares the dev server with fully-parallel
    // WebGPU specs, and cold Slang-WASM compiles are slow under contention.
    test.setTimeout(240_000);
    const report: Record<string, unknown> = {};

    await waitForSlangPreview(page, "2d");
    report.defaultPaletteFlow = {
      canvas: await sampleCanvas(page, "webgpu-canvas"),
    };
    await page.screenshot({ path: path.join(OUT, "pixel-01-default-palette-flow.png") });

    await openTemplateGallery(page);
    await visibleTestId(page, "template-default2d").click();
    await waitForSlangPreview(page, "2d");
    report.default2d = {
      canvas: await sampleCanvas(page, "webgpu-canvas"),
    };
    await page.screenshot({ path: path.join(OUT, "pixel-02-default2d-gradient.png") });

    await openTemplateGallery(page);
    await visibleTestId(page, "template-textureSample").click();
    await waitForSlangPreview(page, "2d");
    report.textureSample = {
      canvas: await sampleCanvas(page, "webgpu-canvas"),
    };
    await page.screenshot({ path: path.join(OUT, "pixel-03-texture-sample.png") });

    await openProjectsPanel(page);
    await visibleTestId(page, "new-project-3d").click();
    await page.getByTestId("panel-projects").filter({ visible: true }).first().click();
    await page.waitForTimeout(3000);
    report.default3d = {
      canvas: await sampleCanvas(page, "shader-canvas"),
    };
    await page.screenshot({ path: path.join(OUT, "pixel-04-3d-cube.png") });

    await page.addInitScript((projectsJson: string) => {
      localStorage.setItem("slang-ai-lab-projects", projectsJson);
    }, JSON.stringify([
      {
        id: "legacy-pixel",
        name: "Legacy GLSL",
        vertexShader: `attribute vec4 a_position;attribute vec2 a_texCoord;varying vec2 v_texCoord;void main(){gl_Position=a_position;v_texCoord=a_texCoord;}`,
        fragmentShader: `precision mediump float;void main(){gl_FragColor=vec4(1.0,0.0,0.0,1.0);}`,
        language: "glsl",
        renderMode: "2d",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    ]));
    await page.reload();
    await page.waitForLoadState("domcontentloaded");
    await expect(slangEditor(page)).toHaveValue(/gl_FragColor/);
    await expect(visibleTestId(page, "shader-canvas")).toBeVisible();
    await page.evaluate(
      () =>
        new Promise<void>((resolve) => {
          let frames = 0;
          const tick = () => {
            frames += 1;
            if (frames >= 8) resolve();
            else requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
        }),
    );
    report.legacyGlsl = {
      editorLabel: await page
        .getByTestId("shader-code-editor")
        .filter({ visible: true })
        .first()
        .getAttribute("aria-label"),
      canvas: await sampleWebGLCanvas(page, "shader-canvas"),
    };
    await page.screenshot({ path: path.join(OUT, "pixel-05-legacy-glsl-red.png") });

    const fs = await import("fs");
    fs.writeFileSync(path.join(OUT, "pixel-report.json"), JSON.stringify(report, null, 2));

    // WebGPU canvases must actually render — an all-black center row means
    // the device/pipeline silently failed. (The exact center pixel can be
    // legitimately dark depending on the shader/time, so scan the row.)
    const flow = report.defaultPaletteFlow as { canvas: { nonBlackOnCenterRow?: number } };
    expect(flow.canvas?.nonBlackOnCenterRow ?? 0).toBeGreaterThan(0);

    const grad = report.default2d as { canvas: { width?: number; nonBlackOnCenterRow?: number } };
    expect(grad.canvas?.width ?? 0).toBeGreaterThan(0);
    expect(grad.canvas?.nonBlackOnCenterRow ?? 0).toBeGreaterThan(0);

    const leg = report.legacyGlsl as { canvas: { center?: number[] } };
    expect(leg.canvas?.center?.[0] ?? 0).toBeGreaterThan(200);
    expect(leg.canvas?.center?.[1] ?? 255).toBeLessThan(50);
  });
});
