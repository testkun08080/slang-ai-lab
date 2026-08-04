import { test, expect } from "@playwright/test";
import {
  assertCompiledOutputSuccess,
  clearAppStorage,
  openProjectsPanel,
  openTemplateGallery,
  slangEditor,
  visibleTestId,
  waitForSlangPreview,
} from "./helpers";

test.describe("Slang sample data", () => {
  test.beforeEach(async ({ page }) => {
    await clearAppStorage(page);
    await page.goto("/");
  });

  test("first visit shows default Palette Flow Slang in the editor", async ({ page }) => {
    const editor = slangEditor(page);
    await expect(editor).toBeVisible();
    await expect(editor).toHaveValue(/Palette Flow/);
    await expect(editor).toHaveValue(/\[shader\("fragment"\)\]/);
    await expect(editor).toHaveValue(/fragmentMain/);
  });

  test("2D Slang compiles and renders in WebGPU preview", async ({ page }) => {
    await waitForSlangPreview(page, "2d");
    await expect(visibleTestId(page, "webgpu-canvas")).toBeVisible();
    await assertCompiledOutputSuccess(page);
  });

  test("new 2D project is created as Slang", async ({ page }) => {
    await openProjectsPanel(page);
    await visibleTestId(page, "new-project-2d").click();
    const editor = slangEditor(page);
    await expect(editor).toHaveValue(/Palette Flow/);
    await expect(editor).toHaveValue(/fragmentMain/);
    await waitForSlangPreview(page, "2d");
  });

  test("template gallery switches between Slang presets (2D)", async ({ page }) => {
    await openTemplateGallery(page);

    await visibleTestId(page, "template-default2d").click();
    await expect(slangEditor(page)).toHaveValue(/Slang shader — compiles to GLSL/);

    await openTemplateGallery(page);
    await visibleTestId(page, "template-textureSample").click();
    await expect(slangEditor(page)).toHaveValue(/iChannel0/);
    await expect(slangEditor(page)).toHaveValue(/Texture2D/);

    await waitForSlangPreview(page, "2d");
  });

  test("Vertex Wave template compiles a custom vertex stage and renders", async ({ page }) => {
    await openTemplateGallery(page);
    await visibleTestId(page, "template-vertexWave").click();
    const editor = slangEditor(page);
    await expect(editor).toHaveValue(/\[shader\("vertex"\)\]/);
    await expect(editor).toHaveValue(/SV_VertexID/);
    await expect(editor).toHaveValue(/@vertexCount/);
    // Real Slang wasm compiles vertexMain + fragmentMain into one WGSL module;
    // FPS > 0 confirms the WebGPU pipeline is drawing the procedural grid.
    await waitForSlangPreview(page, "2d");
    await expect(visibleTestId(page, "webgpu-canvas")).toBeVisible();
  });

  for (const { id, marker } of [
    { id: "plasmaGlow", marker: /Plasma Glow/ },
    { id: "hexGrid", marker: /Hex Grid/ },
    { id: "fireFlame", marker: /Fire Flame/ },
  ]) {
    test(`2D sample ${id} compiles and runs without errors`, async ({ page }) => {
      await openTemplateGallery(page);
      await visibleTestId(page, `template-${id}`).click();
      await expect(slangEditor(page)).toHaveValue(marker);
      await expect(slangEditor(page)).toHaveValue(/\[shader\("fragment"\)\]/);
      await waitForSlangPreview(page, "2d");
    });
  }

  test("new 3D project shows Slang with vertexMain and WebGL preview", async ({ page }) => {
    await openProjectsPanel(page);
    await visibleTestId(page, "new-project-3d").click();
    const editor = slangEditor(page);
    await expect(editor).toHaveValue(/\[shader\("vertex"\)\]/);
    await expect(editor).toHaveValue(/vertexMain/);
    await waitForSlangPreview(page, "3d");
    await expect(visibleTestId(page, "shader-canvas")).toBeVisible();
  });

  test("3D template gallery applies Default 3D Slang", async ({ page }) => {
    await openProjectsPanel(page);
    await visibleTestId(page, "new-project-3d").click();
    await page
      .getByRole("button", { name: /Templates \(3D\)/ })
      .filter({ visible: true })
      .first()
      .click();
    await visibleTestId(page, "template-default3d").click();
    await expect(slangEditor(page)).toHaveValue(/Slang 3D shader/);
    await waitForSlangPreview(page, "3d");
  });

  for (const { id, marker } of [
    { id: "vertexDisplace3d", marker: /animated vertex displacement/ },
    { id: "fresnel3d", marker: /Fresnel rim glow/ },
    { id: "uvChecker3d", marker: /animated UV checker/ },
    { id: "toonShade3d", marker: /Toon shading/ },
    { id: "iridescent3d", marker: /Iridescent coating/ },
    { id: "wireGrid3d", marker: /Wire grid overlay/ },
  ]) {
    test(`3D sample ${id} compiles via real Slang and renders`, async ({ page }) => {
      await openProjectsPanel(page);
      await visibleTestId(page, "new-project-3d").click();
      await page
        .getByRole("button", { name: /Templates \(3D\)/ })
        .filter({ visible: true })
        .first()
        .click();
      await visibleTestId(page, `template-${id}`).click();
      await expect(slangEditor(page)).toHaveValue(marker);
      await expect(slangEditor(page)).toHaveValue(/\[shader\("vertex"\)\]/);
      // No SlangCompileError / WebGL link error overlay ⇒ Slang compiled + program linked.
      await waitForSlangPreview(page, "3d");
    });
  }

  test(".vert tab is hidden for Slang 3D projects (vertex lives in .slang)", async ({ page }) => {
    await openProjectsPanel(page);
    await visibleTestId(page, "new-project-3d").click();
    await expect(page.getByRole("button", { name: /\.vert/ })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /\.slang/ }).first()).toBeVisible();
  });
});
