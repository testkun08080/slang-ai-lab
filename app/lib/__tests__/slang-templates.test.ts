import { describe, expect, it } from "vitest";
import {
  DEFAULT_SLANG_FRAGMENT_2D,
  DEFAULT_SLANG_FRAGMENT_3D,
  SLANG_PALETTE_FLOW,
  SLANG_TEXTURE_SAMPLE,
  SLANG_VERTEX_WAVE,
  defaultSlangShader,
  defaultSlangShader3D,
  findSlangTemplateBySource,
  slangTemplates2D,
  slangTemplates3D,
  toSlangPreset,
} from "@/lib/slang-templates";

describe("slang-templates", () => {
  it("exports Palette Flow as the default 2D Slang sample", () => {
    expect(defaultSlangShader).toBe(SLANG_PALETTE_FLOW.slang);
    expect(defaultSlangShader).toContain("Palette Flow");
    expect(defaultSlangShader).toContain('[shader("fragment")]');
    expect(defaultSlangShader).toContain("fragmentMain");
  });

  it("lists seven 2D and seven 3D gallery templates", () => {
    expect(slangTemplates2D).toHaveLength(7);
    expect(slangTemplates3D).toHaveLength(7);
    expect(slangTemplates2D.map((t) => t.id)).toEqual([
      "default2d",
      "paletteFlow",
      "vertexWave",
      "textureSample",
      "plasmaGlow",
      "hexGrid",
      "fireFlame",
    ]);
    expect(slangTemplates3D.map((t) => t.id)).toEqual([
      "default3d",
      "vertexDisplace3d",
      "fresnel3d",
      "uvChecker3d",
      "toonShade3d",
      "iridescent3d",
      "wireGrid3d",
    ]);
  });

  it("every 3D sample declares a vertex + fragment entry point and compiles GLSL", () => {
    for (const t of slangTemplates3D) {
      expect(t.slang).toContain('[shader("vertex")]');
      expect(t.slang).toContain('[shader("fragment")]');
      expect(t.glsl.length).toBeGreaterThan(20);
    }
  });

  it("findSlangTemplateBySource matches a known template exactly", () => {
    expect(findSlangTemplateBySource(SLANG_VERTEX_WAVE.slang)?.id).toBe("vertexWave");
    expect(findSlangTemplateBySource("  not a template  ")).toBeUndefined();
  });

  it("Vertex Wave sample drives a custom animated vertex stage", () => {
    expect(SLANG_VERTEX_WAVE.slang).toContain('[shader("vertex")]');
    expect(SLANG_VERTEX_WAVE.slang).toContain("vertexMain");
    expect(SLANG_VERTEX_WAVE.slang).toContain("SV_VertexID");
    expect(SLANG_VERTEX_WAVE.slang).toMatch(/@vertexCount\s+\d+/);
    expect(SLANG_VERTEX_WAVE.slang).toContain("u_time");
  });

  it("each template has canonical Slang and fallback GLSL", () => {
    for (const template of [
      DEFAULT_SLANG_FRAGMENT_2D,
      SLANG_PALETTE_FLOW,
      SLANG_VERTEX_WAVE,
      SLANG_TEXTURE_SAMPLE,
      DEFAULT_SLANG_FRAGMENT_3D,
    ]) {
      expect(template.slang.length).toBeGreaterThan(20);
      expect(template.glsl.length).toBeGreaterThan(20);
      expect(template.slang).toContain("uniform");
    }
  });

  it("3D default includes vertex and fragment entry points", () => {
    expect(defaultSlangShader3D).toContain('[shader("vertex")]');
    expect(defaultSlangShader3D).toContain('[shader("fragment")]');
    expect(defaultSlangShader3D).toContain("vertexMain");
    expect(defaultSlangShader3D).toContain("fragmentMain");
  });

  it("toSlangPreset maps templates for the gallery", () => {
    const preset = toSlangPreset(SLANG_TEXTURE_SAMPLE);
    expect(preset).toEqual({
      slangSource: SLANG_TEXTURE_SAMPLE.slang,
      language: "slang",
      renderMode: "2d",
    });
  });
});
