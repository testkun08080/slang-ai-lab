import { describe, expect, it } from "vitest";
import {
  normalizeSlangSource,
  normalizeSlangSourceVerbose,
  slangHasVertexEntry,
  parseVertexCountDirective,
} from "@/lib/slang-normalize";

describe("slang-normalize", () => {
  it("injects the required globals when the AI omits them (the Groq bug)", () => {
    // Reproduces error[E30015]: undefined identifier 'u_resolution' / 'u_time'.
    const broken = `[shader("fragment")]
float4 fragmentMain(float4 fragCoord : SV_Position) : SV_Target
{
    float2 uv = fragCoord.xy / u_resolution;
    uv += sin((uv + u_time * u_speed) * 6.2831) * 0.05;
    return float4(uv, 0.5, 1.0);
}`;
    const { source, injected } = normalizeSlangSourceVerbose(broken);

    expect(injected).toEqual(expect.arrayContaining(["u_resolution", "u_time", "u_speed"]));
    expect(source).toContain("uniform float u_time;");
    expect(source).toContain("uniform float2 u_resolution;");
    // Unknown scalar gets a float uniform + an adjustable @param control.
    expect(source).toContain("uniform float u_speed;");
    expect(source).toMatch(/@param u_speed \{[^}]*value: 1\.0/);
    // Declarations must precede the entry point that uses them.
    expect(source.indexOf("uniform float u_time;")).toBeLessThan(
      source.indexOf('[shader("fragment")]'),
    );
  });

  it("is a no-op when every uniform is already declared", () => {
    const good = `uniform float u_time;
uniform float2 u_resolution;
uniform float2 u_mouse;

[shader("fragment")]
float4 fragmentMain(float4 fragCoord : SV_Position) : SV_Target
{
    return float4(fragCoord.xy / u_resolution, 0.0, 1.0);
}`;
    expect(normalizeSlangSource(good)).toBe(good);
  });

  it("ignores u_* identifiers that only appear in comments", () => {
    const src = `uniform float u_time;
// this mentions u_ghost but never uses it
[shader("fragment")]
float4 fragmentMain(float4 c : SV_Position) : SV_Target { return float4(u_time); }`;
    expect(normalizeSlangSource(src)).not.toContain("uniform float u_ghost;");
  });

  it("detects a custom vertex entry point", () => {
    expect(slangHasVertexEntry('[shader("vertex")] VOut vertexMain() {}')).toBe(true);
    expect(slangHasVertexEntry("[shader( 'vertex' )] void v() {}")).toBe(true);
    expect(slangHasVertexEntry('[shader("fragment")] void f() {}')).toBe(false);
  });

  it("parses @vertexCount and clamps invalid values", () => {
    expect(parseVertexCountDirective("// @vertexCount 9600")).toBe(9600);
    expect(parseVertexCountDirective("// @VertexCount 6")).toBe(6);
    expect(parseVertexCountDirective("no directive here")).toBe(3);
    expect(parseVertexCountDirective("// @vertexCount 1")).toBe(3);
  });
});
