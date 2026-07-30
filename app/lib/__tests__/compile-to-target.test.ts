import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  compileSlangToGlsl,
  compileSlangToHlsl,
  compileSlangToMetal,
  compileSlangToSpirv,
  compileSlangToWgsl,
  compileSlangProgramToTarget,
  compileSlangProgram,
} = vi.hoisted(() => ({
  compileSlangToGlsl: vi.fn(),
  compileSlangToHlsl: vi.fn(),
  compileSlangToMetal: vi.fn(),
  compileSlangToSpirv: vi.fn(),
  compileSlangToWgsl: vi.fn(),
  compileSlangProgramToTarget: vi.fn(),
  compileSlangProgram: vi.fn(),
}));

vi.mock("@/lib/slang-compiler", () => ({
  compileSlang: vi.fn(),
  compileSlangProgram,
  compileSlangProgramToTarget,
  compileSlangToGlsl,
  compileSlangToHlsl,
  compileSlangToMetal,
  compileSlangToSpirv,
  compileSlangToWgsl,
  STAGE_FRAGMENT: 1,
  STAGE_VERTEX: 0,
}));

import { compileSlangSourceToTarget } from "@/lib/compile-to-target";

const FRAGMENT_ONLY = `uniform float u_time;
uniform float2 u_resolution;
uniform float2 u_mouse;

[shader("fragment")]
float4 fragmentMain(float4 fragCoord : SV_Position) : SV_Target
{
    float2 uv = fragCoord.xy / u_resolution;
    return float4(uv, sin(u_time) * 0.5 + 0.5, 1.0);
}`;

const WITH_VERTEX = `uniform float u_time;
uniform float2 u_resolution;
uniform float2 u_mouse;

struct VOut {
    float4 pos : SV_Position;
};

[shader("vertex")]
VOut vertexMain(uint vid : SV_VertexID)
{
    VOut o;
    o.pos = float4(0.0, 0.0, 0.0, 1.0);
    return o;
}

[shader("fragment")]
float4 fragmentMain(VOut input) : SV_Target
{
    return float4(1.0, 0.0, 0.0, 1.0);
}`;

describe("compileSlangSourceToTarget", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    compileSlangToGlsl.mockResolvedValue({ code: "//glsl", warnings: [] });
    compileSlangToHlsl.mockResolvedValue({ code: "//hlsl", warnings: [] });
    compileSlangToMetal.mockResolvedValue({ code: "//metal", warnings: [] });
    compileSlangToSpirv.mockResolvedValue({ code: "//spirv", warnings: [] });
    compileSlangToWgsl.mockResolvedValue({ code: "//wgsl", warnings: [] });
    compileSlangProgramToTarget.mockResolvedValue({ code: "//wgsl-prog", warnings: [] });
    compileSlangProgram.mockResolvedValue({ code: "//prog", warnings: [] });
  });

  it("compiles fragment-only GLSL without calling vertexMain", async () => {
    const artifact = await compileSlangSourceToTarget(FRAGMENT_ONLY, "glsl", "2d");

    expect(artifact.status).toBe("success");
    expect(artifact.fragmentOutput).toBe("//glsl");
    expect(artifact.vertexOutput).toBeUndefined();
    expect(compileSlangToGlsl).toHaveBeenCalledTimes(1);
    expect(compileSlangToGlsl).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ entryPoint: "fragmentMain" }),
    );
  });

  it("compiles both stages when vertexMain is present", async () => {
    const artifact = await compileSlangSourceToTarget(WITH_VERTEX, "glsl", "3d");

    expect(artifact.status).toBe("success");
    expect(artifact.vertexOutput).toBe("//glsl");
    expect(artifact.fragmentOutput).toBe("//glsl");
    expect(compileSlangToGlsl).toHaveBeenCalledTimes(2);
    expect(compileSlangToGlsl).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ entryPoint: "vertexMain" }),
    );
    expect(compileSlangToGlsl).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ entryPoint: "fragmentMain" }),
    );
  });

  it("uses fragment-only WGSL path when there is no vertex entry", async () => {
    const artifact = await compileSlangSourceToTarget(FRAGMENT_ONLY, "wgsl", "2d");

    expect(artifact.status).toBe("success");
    expect(artifact.singleOutput).toBe("//wgsl");
    expect(compileSlangToWgsl).toHaveBeenCalledTimes(1);
    expect(compileSlangProgramToTarget).not.toHaveBeenCalled();
  });
});
