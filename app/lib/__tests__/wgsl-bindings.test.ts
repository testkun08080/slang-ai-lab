import { describe, expect, it } from "vitest";
import {
  channelIdFromWgslName,
  normalizeSlangName,
  parseWgslGroup0Bindings,
  parseWgslUniformLayout,
} from "@/lib/wgsl-bindings";
import { adaptGlslForWebGL1 } from "@/lib/glsl-webgl";

// Fixtures mirror the real slang-wasm WGSL output: mangled `_0` identifier
// suffixes, per-field @align attributes, and `@binding(n) @group(0)` order.
const TEXTURE_SAMPLE_WGSL = `
struct GlobalParams_std140_0
{
    @align(16) u_time_0 : f32,
    @align(8) u_resolution_0 : vec2<f32>,
    @align(16) u_mouse_0 : vec2<f32>,
};

@binding(0) @group(0) var<uniform> globalParams_0 : GlobalParams_std140_0;
@binding(1) @group(0) var iChannel0_0 : texture_2d<f32>;
@binding(2) @group(0) var iChannel0Sampler_0 : sampler;
`;

const PALETTE_FLOW_WGSL = `
struct GlobalParams_std140_0
{
    @align(16) u_time_0 : f32,
    @align(8) u_resolution_0 : vec2<f32>,
    @align(16) u_mouse_0 : vec2<f32>,
    @align(8) u_speed_0 : f32,
    @align(4) u_density_0 : f32,
    @align(16) u_intensity_0 : f32,
};

@binding(0) @group(0) var<uniform> globalParams_0 : GlobalParams_std140_0;
`;

describe("wgsl-bindings", () => {
  it("parses uniform, texture, and sampler bindings for group 0", () => {
    const bindings = parseWgslGroup0Bindings(TEXTURE_SAMPLE_WGSL);
    expect(bindings).toEqual([
      { binding: 0, kind: "uniform", name: "globalParams_0" },
      { binding: 1, kind: "texture", name: "iChannel0_0" },
      { binding: 2, kind: "sampler", name: "iChannel0Sampler_0" },
    ]);
  });

  it("maps WGSL resource names (mangled or not) to iChannel ids", () => {
    expect(channelIdFromWgslName("iChannel0")).toBe("iChannel0");
    expect(channelIdFromWgslName("iChannel0_0")).toBe("iChannel0");
    expect(channelIdFromWgslName("iChannel2Sampler_0")).toBe("iChannel2");
    expect(channelIdFromWgslName("globalParams_0")).toBeNull();
  });

  it("strips Slang name mangling", () => {
    expect(normalizeSlangName("u_time_0")).toBe("u_time");
    expect(normalizeSlangName("u_layer_1_0")).toBe("u_layer_1");
    expect(normalizeSlangName("u_time")).toBe("u_time");
  });

  it("parses Palette Flow uniform layout with std140 offsets and 48-byte size", () => {
    const layout = parseWgslUniformLayout(PALETTE_FLOW_WGSL);
    expect(layout).not.toBeNull();
    expect(layout!.size).toBe(48);
    expect(layout!.fields.map((f) => [f.name, f.offset])).toEqual([
      ["u_time", 0],
      ["u_resolution", 8],
      ["u_mouse", 16],
      ["u_speed", 24],
      ["u_density", 28],
      ["u_intensity", 32],
    ]);
  });
});

describe("glsl-webgl", () => {
  it("strips layout qualifiers and prepends GLSL ES 1.00", () => {
    const adapted = adaptGlslForWebGL1(
      `#version 450
layout(location = 0) in vec3 position;
layout(location = 1) out vec4 fragColor;
void main() { fragColor = vec4(1.0); }`,
      "vertex",
    );
    expect(adapted.startsWith("#version 100")).toBe(true);
    expect(adapted).not.toMatch(/layout\s*\(/);
    expect(adapted).toMatch(/attribute\s+vec3\s+a_position/);
  });
});
