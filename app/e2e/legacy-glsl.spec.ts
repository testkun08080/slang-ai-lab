import { test, expect } from "@playwright/test";
import { slangEditor, visibleTestId } from "./helpers";

const LEGACY_GLSL_FRAGMENT = `precision mediump float;
uniform float u_time;
uniform vec2 u_resolution;
void main() {
  gl_FragColor = vec4(1.0, 0.0, 0.0, 1.0);
}`;

test.describe("Legacy GLSL projects", () => {
  test("stored GLSL project opens GLSL editor and WebGL canvas", async ({ page }) => {
    await page.addInitScript((fragment: string) => {
      const project = {
        id: "legacy-glsl-test",
        name: "Legacy GLSL",
        vertexShader: `attribute vec4 a_position;
attribute vec2 a_texCoord;
varying vec2 v_texCoord;
void main() {
  gl_Position = a_position;
  v_texCoord = a_texCoord;
}`,
        fragmentShader: fragment,
        language: "glsl",
        renderMode: "2d",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      localStorage.setItem("slang-ai-lab-projects", JSON.stringify([project]));
    }, LEGACY_GLSL_FRAGMENT);

    await page.goto("/");

    await expect(slangEditor(page)).toBeVisible();
    await expect(slangEditor(page)).toHaveValue(/gl_FragColor/);
    await expect(visibleTestId(page, "shader-canvas")).toBeVisible();
    await expect(page.getByTestId("webgpu-canvas")).toHaveCount(0);
  });
});
