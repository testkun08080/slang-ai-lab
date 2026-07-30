/**
 * Slang shader templates for Slang AI Lab
 *
 * Slang is a modern shading language that compiles to GLSL, HLSL, WGSL, Metal, SPIR-V.
 * Syntax is HLSL-like. Entry points use [shader("fragment")] / [shader("vertex")] attributes.
 *
 * Required uniforms (auto-provided by the renderer):
 *   float  u_time        — animation time in seconds
 *   float2 u_resolution  — canvas resolution
 *   float2 u_mouse       — normalized mouse position
 *
 * Texture sampling (Slang / compiled GLSL):
 *   Texture2D iChannel0; SamplerState iChannel0Sampler;
 *   float4 col = iChannel0.Sample(iChannel0Sampler, uv);
 */

import type { RenderMode } from "./types";

export interface SlangTemplate {
  id: string;
  name: string;
  description: string;
  slang: string;   // Slang source (canonical)
  glsl: string;    // Pre-written GLSL ES 1.00 fragment for the WebGL preview
  /** GLSL ES 1.00 vertex for the WebGL 3D preview. Omit to use the default 3D vertex. */
  glslVertex?: string;
  renderMode: RenderMode;
}

/** Preset passed from the template gallery to shader-playground. */
export interface SlangShaderTemplatePreset {
  slangSource: string;
  language: "slang";
  renderMode?: RenderMode;
}

export function toSlangPreset(template: SlangTemplate): SlangShaderTemplatePreset {
  return {
    slangSource: template.slang,
    language: "slang",
    renderMode: template.renderMode,
  };
}

// ---------------------------------------------------------------------------
// Default 2D fragment shader
// ---------------------------------------------------------------------------
export const DEFAULT_SLANG_FRAGMENT_2D: SlangTemplate = {
  id: "default2d",
  name: "Default 2D",
  description: "Animated gradient using Slang",
  renderMode: "2d",
  slang: `// Slang shader — compiles to GLSL/HLSL/WGSL/Metal/SPIR-V
uniform float  u_time;
uniform float2 u_resolution;
uniform float2 u_mouse;

[shader("fragment")]
float4 fragmentMain(float4 fragCoord : SV_Position) : SV_Target
{
    float2 uv = fragCoord.xy / u_resolution;
    float t = u_time * 0.5;

    float3 col = float3(
        0.5 + 0.5 * sin(uv.x * 3.14159 + t),
        0.5 + 0.5 * sin(uv.y * 3.14159 + t + 2.094),
        0.5 + 0.5 * sin((uv.x + uv.y) * 3.14159 + t + 4.189)
    );

    return float4(col, 1.0);
}`,
  glsl: `precision mediump float;

uniform float u_time;
uniform vec2 u_resolution;
uniform vec2 u_mouse;

void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution;
  float t = u_time * 0.5;

  vec3 col = vec3(
    0.5 + 0.5 * sin(uv.x * 3.14159 + t),
    0.5 + 0.5 * sin(uv.y * 3.14159 + t + 2.094),
    0.5 + 0.5 * sin((uv.x + uv.y) * 3.14159 + t + 4.189)
  );

  gl_FragColor = vec4(col, 1.0);
}`,
};

// ---------------------------------------------------------------------------
// Default 3D fragment shader
// ---------------------------------------------------------------------------
export const DEFAULT_SLANG_FRAGMENT_3D: SlangTemplate = {
  id: "default3d",
  name: "Default 3D",
  description: "Lit surface with rim lighting",
  renderMode: "3d",
  slang: `// Slang 3D shader
uniform float  u_time;
uniform float2 u_resolution;
uniform float2 u_mouse;
uniform float4x4 u_modelViewMatrix;
uniform float4x4 u_projectionMatrix;
uniform float3x3 u_normalMatrix;

struct VSInput {
    float4 position : POSITION;
    float3 normal   : NORMAL;
    float2 texCoord : TEXCOORD0;
};

struct PSInput {
    float4 position : SV_Position;
    float3 normal   : NORMAL;
    float2 texCoord : TEXCOORD0;
    float3 viewPos  : TEXCOORD1;
};

[shader("vertex")]
PSInput vertexMain(VSInput input)
{
    PSInput output;
    float4 viewPos = mul(u_modelViewMatrix, input.position);
    output.position = mul(u_projectionMatrix, viewPos);
    output.normal   = mul(u_normalMatrix, input.normal);
    output.texCoord = input.texCoord;
    output.viewPos  = viewPos.xyz;
    return output;
}

[shader("fragment")]
float4 fragmentMain(PSInput input) : SV_Target
{
    float3 normal   = normalize(input.normal);
    float3 lightDir = normalize(float3(1.0, 1.0, 1.0));
    float  diff     = max(dot(normal, lightDir), 0.0);
    float  ambient  = 0.3;

    float3 baseColor = float3(0.4 + input.texCoord.x * 0.4, 0.6, 0.8 - input.texCoord.y * 0.4);
    float3 col       = baseColor * (ambient + diff * 0.7);

    float3 viewDir = normalize(-input.viewPos);
    float  rim     = pow(1.0 - max(dot(viewDir, normal), 0.0), 3.0);
    col += float3(0.3, 0.5, 0.7) * rim;

    return float4(col, 1.0);
}`,
  glsl: `precision mediump float;

uniform float u_time;
uniform vec2 u_resolution;

varying vec3 v_normal;
varying vec2 v_texCoord;
varying vec3 v_position;

void main() {
  vec3 normal = normalize(v_normal);
  vec3 lightDir = normalize(vec3(1.0, 1.0, 1.0));
  float diff = max(dot(normal, lightDir), 0.0);
  float ambient = 0.3;

  vec3 baseColor = vec3(0.4 + v_texCoord.x * 0.4, 0.6, 0.8 - v_texCoord.y * 0.4);
  vec3 col = baseColor * (ambient + diff * 0.7);

  vec3 viewDir = normalize(-v_position);
  float rim = 1.0 - max(dot(viewDir, normal), 0.0);
  rim = pow(rim, 3.0);
  col += vec3(0.3, 0.5, 0.7) * rim;

  gl_FragColor = vec4(col, 1.0);
}`,
};

// ---------------------------------------------------------------------------
// Palette flow (Slang version)
// ---------------------------------------------------------------------------
export const SLANG_PALETTE_FLOW: SlangTemplate = {
  id: "paletteFlow",
  name: "Palette Flow",
  description: "Cosine palette concentric rings",
  renderMode: "2d",
  slang: `// Slang — Palette Flow
// @param u_speed {type: "float", min: 0.1, max: 2.5, step: 0.05, value: 1.0, label: "Flow Speed"}
// @param u_density {type: "float", min: 4.0, max: 16.0, step: 0.25, value: 8.0, label: "Ring Density"}
// @param u_intensity {type: "float", min: 0.4, max: 2.2, step: 0.05, value: 1.2, label: "Glow Intensity"}
uniform float  u_time;
uniform float2 u_resolution;
uniform float2 u_mouse;
uniform float  u_speed;
uniform float  u_density;
uniform float  u_intensity;

float3 palette(float t) {
    float3 a = float3(0.5, 0.5, 0.5);
    float3 b = float3(0.5, 0.5, 0.5);
    float3 c = float3(1.0, 1.0, 1.0);
    float3 d = float3(0.263, 0.416, 0.557);
    return a + b * cos(6.28318 * (c * t + d));
}

[shader("fragment")]
float4 fragmentMain(float4 fragCoord : SV_Position) : SV_Target
{
    float2 uv  = (fragCoord.xy * 2.0 - u_resolution) / u_resolution.y;
    float2 uv0 = uv;
    float3 col = float3(0.0, 0.0, 0.0);

    for (int i = 0; i < 4; i++) {
        uv = frac(uv * 1.5) - 0.5;
        float d = length(uv) * exp(-length(uv0));
        float3 c = palette(length(uv0) + float(i) * 0.4 + u_time * 0.4 * u_speed);
        d = sin(d * u_density + u_time * u_speed) / u_density;
        d = abs(d);
        d = pow(0.01 / d, u_intensity);
        col += c * d;
    }

    col = pow(clamp(col, float3(0.0), float3(1.0)), float3(0.9));
    return float4(col, 1.0);
}`,
  glsl: `precision highp float;

uniform float u_time;
uniform vec2 u_resolution;
// @param u_speed {type: "float", min: 0.1, max: 2.5, step: 0.05, value: 1.0, label: "Flow Speed"}
uniform float u_speed;
// @param u_density {type: "float", min: 4.0, max: 16.0, step: 0.25, value: 8.0, label: "Ring Density"}
uniform float u_density;
// @param u_intensity {type: "float", min: 0.4, max: 2.2, step: 0.05, value: 1.2, label: "Glow Intensity"}
uniform float u_intensity;

vec3 palette(float t) {
  vec3 a = vec3(0.5, 0.5, 0.5);
  vec3 b = vec3(0.5, 0.5, 0.5);
  vec3 c = vec3(1.0, 1.0, 1.0);
  vec3 d = vec3(0.263, 0.416, 0.557);
  return a + b * cos(6.28318 * (c * t + d));
}

void main() {
  vec2 uv = (gl_FragCoord.xy * 2.0 - u_resolution.xy) / u_resolution.y;
  vec2 uv0 = uv;
  vec3 finalCol = vec3(0.0);

  for (int i = 0; i < 4; i++) {
    uv = fract(uv * 1.5) - 0.5;
    float d = length(uv) * exp(-length(uv0));
    vec3 col = palette(length(uv0) + float(i) * 0.4 + u_time * 0.4 * u_speed);
    d = sin(d * u_density + u_time * u_speed) / u_density;
    d = abs(d);
    d = pow(0.01 / d, u_intensity);
    finalCol += col * d;
  }

  finalCol = pow(clamp(finalCol, 0.0, 1.0), vec3(0.9));
  gl_FragColor = vec4(finalCol, 1.0);
}`,
};

// ---------------------------------------------------------------------------
// Texture sampling example
// ---------------------------------------------------------------------------
export const SLANG_TEXTURE_SAMPLE: SlangTemplate = {
  id: "textureSample",
  name: "Texture Sample",
  description: "Sample iChannel0 with UV distortion",
  renderMode: "2d",
  slang: `// Slang — Texture Sampling
// iChannel0 is bound to the first uploaded texture
uniform float     u_time;
uniform float2    u_resolution;
uniform float2    u_mouse;
uniform Texture2D iChannel0;
uniform SamplerState iChannel0Sampler;

[shader("fragment")]
float4 fragmentMain(float4 fragCoord : SV_Position) : SV_Target
{
    float2 uv = fragCoord.xy / u_resolution;

    // UV distortion
    float wave = sin(uv.y * 20.0 + u_time * 2.0) * 0.02;
    uv.x += wave;

    float4 tex = iChannel0.Sample(iChannel0Sampler, uv);
    float3 col = tex.rgb * (0.8 + 0.2 * sin(u_time));

    return float4(col, 1.0);
}`,
  glsl: `precision mediump float;

uniform float u_time;
uniform vec2 u_resolution;
uniform sampler2D iChannel0;

void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution;

  float wave = sin(uv.y * 20.0 + u_time * 2.0) * 0.02;
  uv.x += wave;

  vec4 tex = texture2D(iChannel0, uv);
  vec3 col = tex.rgb * (0.8 + 0.2 * sin(u_time));

  gl_FragColor = vec4(col, 1.0);
}`,
};

// ---------------------------------------------------------------------------
// Animated vertex shader — procedural warped grid mesh (WebGPU)
// ---------------------------------------------------------------------------
// This sample proves that Slang *vertex* shaders are fully customizable: the
// mesh is generated procedurally from SV_VertexID (no vertex buffers) and every
// vertex is displaced on the GPU each frame by the vertexMain entry point.
export const SLANG_VERTEX_WAVE: SlangTemplate = {
  id: "vertexWave",
  name: "Vertex Wave",
  description: "Animated grid mesh deformed in the vertex shader",
  renderMode: "2d",
  slang: `// Slang — Animated Vertex Shader (procedural grid)
// The mesh has no vertex buffer: a 40x40 grid of quads is expanded from
// SV_VertexID (6 vertices per quad) and warped every frame in vertexMain.
// @vertexCount 9600
uniform float  u_time;
uniform float2 u_resolution;
uniform float2 u_mouse;
// @param u_amp {type: "float", min: 0.0, max: 0.25, step: 0.005, value: 0.06, label: "Wave Amplitude"}
uniform float  u_amp;
// @param u_speed {type: "float", min: 0.0, max: 4.0, step: 0.05, value: 1.6, label: "Wave Speed"}
uniform float  u_speed;

static const uint GRID = 40u;

struct VOut {
    float4 position : SV_Position;
    float3 color    : COLOR0;
};

float3 palette(float t) {
    float3 a = float3(0.5, 0.5, 0.5);
    float3 b = float3(0.5, 0.5, 0.5);
    float3 c = float3(1.0, 1.0, 1.0);
    float3 d = float3(0.0, 0.33, 0.67);
    return a + b * cos(6.28318 * (c * t + d));
}

[shader("vertex")]
VOut vertexMain(uint vid : SV_VertexID)
{
    VOut o;

    uint quad   = vid / 6u;          // which grid cell
    uint corner = vid % 6u;          // which of the 6 triangle vertices
    uint cx = quad % GRID;
    uint cy = quad / GRID;

    // Two triangles per cell: (0,0)(1,0)(0,1) and (1,0)(1,1)(0,1)
    uint dx = (corner == 1u || corner == 3u || corner == 4u) ? 1u : 0u;
    uint dy = (corner == 2u || corner == 4u || corner == 5u) ? 1u : 0u;

    float2 p   = float2(float(cx + dx), float(cy + dy)) / float(GRID); // 0..1
    float2 ndc = p * 2.0 - 1.0;

    // Displace each vertex with travelling sine waves.
    float t = u_time * u_speed;
    ndc.x += sin(p.y * 10.0 + t) * u_amp;
    ndc.y += cos(p.x * 10.0 + t * 0.85) * u_amp;

    o.position = float4(ndc, 0.0, 1.0);

    float wave = 0.5 + 0.5 * sin(p.x * 6.2831 + p.y * 6.2831 + t);
    o.color = palette(wave + 0.15 * u_time);
    return o;
}

[shader("fragment")]
float4 fragmentMain(VOut input) : SV_Target
{
    return float4(input.color, 1.0);
}`,
  glsl: `precision mediump float;

uniform float u_time;
uniform vec2 u_resolution;
// @param u_amp {type: "float", min: 0.0, max: 0.25, step: 0.005, value: 0.06, label: "Wave Amplitude"}
uniform float u_amp;
// @param u_speed {type: "float", min: 0.0, max: 4.0, step: 0.05, value: 1.6, label: "Wave Speed"}
uniform float u_speed;

vec3 palette(float t) {
  vec3 a = vec3(0.5), b = vec3(0.5), c = vec3(1.0), d = vec3(0.0, 0.33, 0.67);
  return a + b * cos(6.28318 * (c * t + d));
}

// WebGL fallback: approximate the warped grid in the fragment stage.
void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution;
  float t = u_time * u_speed;
  uv.x += sin(uv.y * 10.0 + t) * u_amp;
  uv.y += cos(uv.x * 10.0 + t * 0.85) * u_amp;

  vec2 g = abs(fract(uv * 20.0) - 0.5);
  float line = smoothstep(0.42, 0.5, max(g.x, g.y));
  vec3 col = palette(0.5 + 0.5 * sin(uv.x * 6.2831 + uv.y * 6.2831 + t) + 0.15 * u_time);
  gl_FragColor = vec4(col * (0.35 + 0.65 * line), 1.0);
}`,
};

// ---------------------------------------------------------------------------
// 3D — Vertex Displacement (animated vertex shader on a cube)
// ---------------------------------------------------------------------------
// Demonstrates a *3D* custom vertex shader: each cube vertex is pushed along its
// normal by a travelling sine wave in vertexMain, so the mesh visibly breathes.
export const SLANG_3D_VERTEX_DISPLACE: SlangTemplate = {
  id: "vertexDisplace3d",
  name: "Vertex Displace",
  description: "Cube vertices pushed along normals in the vertex shader",
  renderMode: "3d",
  slang: `// Slang 3D — animated vertex displacement
uniform float  u_time;
uniform float2 u_resolution;
uniform float2 u_mouse;
uniform float4x4 u_modelViewMatrix;
uniform float4x4 u_projectionMatrix;
uniform float3x3 u_normalMatrix;
// @param u_amp {type: "float", min: 0.0, max: 0.6, step: 0.01, value: 0.18, label: "Displace"}
uniform float u_amp;
// @param u_freq {type: "float", min: 0.5, max: 12.0, step: 0.1, value: 4.0, label: "Frequency"}
uniform float u_freq;

struct VSInput {
    float4 position : POSITION;
    float3 normal   : NORMAL;
    float2 texCoord : TEXCOORD0;
};

struct PSInput {
    float4 position : SV_Position;
    float3 normal   : NORMAL;
    float2 texCoord : TEXCOORD0;
    float3 viewPos  : TEXCOORD1;
};

[shader("vertex")]
PSInput vertexMain(VSInput input)
{
    PSInput output;
    float  disp      = sin(input.position.y * u_freq + u_time * 2.0) * u_amp;
    float4 displaced = input.position + float4(input.normal * disp, 0.0);
    float4 viewPos   = mul(u_modelViewMatrix, displaced);
    output.position  = mul(u_projectionMatrix, viewPos);
    output.normal    = mul(u_normalMatrix, input.normal);
    output.texCoord  = input.texCoord;
    output.viewPos   = viewPos.xyz;
    return output;
}

[shader("fragment")]
float4 fragmentMain(PSInput input) : SV_Target
{
    float3 normal   = normalize(input.normal);
    float3 lightDir = normalize(float3(0.6, 0.8, 0.5));
    float  diff     = max(dot(normal, lightDir), 0.0);
    float3 base     = float3(0.9, 0.5, 0.3);
    float3 col      = base * (0.25 + diff * 0.85);
    return float4(col, 1.0);
}`,
  glslVertex: `attribute vec4 a_position;
attribute vec3 a_normal;
attribute vec2 a_texCoord;

uniform mat4 u_modelViewMatrix;
uniform mat4 u_projectionMatrix;
uniform mat3 u_normalMatrix;
uniform float u_time;
uniform float u_amp;
uniform float u_freq;

varying vec3 v_normal;
varying vec2 v_texCoord;
varying vec3 v_position;

void main() {
  float disp = sin(a_position.y * u_freq + u_time * 2.0) * u_amp;
  vec4 displaced = a_position + vec4(a_normal * disp, 0.0);
  v_position = (u_modelViewMatrix * displaced).xyz;
  v_normal = u_normalMatrix * a_normal;
  v_texCoord = a_texCoord;
  gl_Position = u_projectionMatrix * u_modelViewMatrix * displaced;
}`,
  glsl: `precision mediump float;

uniform float u_amp;
varying vec3 v_normal;
varying vec3 v_position;

void main() {
  vec3 normal = normalize(v_normal);
  vec3 lightDir = normalize(vec3(0.6, 0.8, 0.5));
  float diff = max(dot(normal, lightDir), 0.0);
  vec3 base = vec3(0.9, 0.5, 0.3);
  vec3 col = base * (0.25 + diff * 0.85);
  gl_FragColor = vec4(col, 1.0);
}`,
};

// ---------------------------------------------------------------------------
// 3D — Fresnel Glow (rim-lit fragment shader)
// ---------------------------------------------------------------------------
export const SLANG_3D_FRESNEL: SlangTemplate = {
  id: "fresnel3d",
  name: "Fresnel Glow",
  description: "View-dependent rim glow on the cube",
  renderMode: "3d",
  slang: `// Slang 3D — Fresnel rim glow
uniform float  u_time;
uniform float2 u_resolution;
uniform float2 u_mouse;
uniform float4x4 u_modelViewMatrix;
uniform float4x4 u_projectionMatrix;
uniform float3x3 u_normalMatrix;
// @param u_power {type: "float", min: 0.5, max: 6.0, step: 0.1, value: 3.0, label: "Rim Power"}
uniform float u_power;

struct VSInput {
    float4 position : POSITION;
    float3 normal   : NORMAL;
    float2 texCoord : TEXCOORD0;
};

struct PSInput {
    float4 position : SV_Position;
    float3 normal   : NORMAL;
    float2 texCoord : TEXCOORD0;
    float3 viewPos  : TEXCOORD1;
};

[shader("vertex")]
PSInput vertexMain(VSInput input)
{
    PSInput output;
    float4 viewPos  = mul(u_modelViewMatrix, input.position);
    output.position = mul(u_projectionMatrix, viewPos);
    output.normal   = mul(u_normalMatrix, input.normal);
    output.texCoord = input.texCoord;
    output.viewPos  = viewPos.xyz;
    return output;
}

[shader("fragment")]
float4 fragmentMain(PSInput input) : SV_Target
{
    float3 normal  = normalize(input.normal);
    float3 viewDir = normalize(-input.viewPos);
    float  fresnel = pow(1.0 - max(dot(viewDir, normal), 0.0), u_power);
    float3 core    = float3(0.05, 0.08, 0.12);
    float3 glow    = float3(0.3, 0.7, 1.0);
    float3 col     = core + glow * fresnel;
    return float4(col, 1.0);
}`,
  glsl: `precision mediump float;

uniform float u_power;
varying vec3 v_normal;
varying vec3 v_position;

void main() {
  vec3 normal = normalize(v_normal);
  vec3 viewDir = normalize(-v_position);
  float fresnel = pow(1.0 - max(dot(viewDir, normal), 0.0), u_power);
  vec3 core = vec3(0.05, 0.08, 0.12);
  vec3 glow = vec3(0.3, 0.7, 1.0);
  vec3 col = core + glow * fresnel;
  gl_FragColor = vec4(col, 1.0);
}`,
};

// ---------------------------------------------------------------------------
// 3D — Animated UV Checker
// ---------------------------------------------------------------------------
export const SLANG_3D_UV_CHECKER: SlangTemplate = {
  id: "uvChecker3d",
  name: "UV Checker",
  description: "Scrolling checker pattern shaded by lighting",
  renderMode: "3d",
  slang: `// Slang 3D — animated UV checker
uniform float  u_time;
uniform float2 u_resolution;
uniform float2 u_mouse;
uniform float4x4 u_modelViewMatrix;
uniform float4x4 u_projectionMatrix;
uniform float3x3 u_normalMatrix;
// @param u_scale {type: "float", min: 1.0, max: 16.0, step: 0.5, value: 6.0, label: "Checker Scale"}
uniform float u_scale;
// @param u_speed {type: "float", min: 0.0, max: 3.0, step: 0.05, value: 0.6, label: "Scroll Speed"}
uniform float u_speed;

struct VSInput {
    float4 position : POSITION;
    float3 normal   : NORMAL;
    float2 texCoord : TEXCOORD0;
};

struct PSInput {
    float4 position : SV_Position;
    float3 normal   : NORMAL;
    float2 texCoord : TEXCOORD0;
    float3 viewPos  : TEXCOORD1;
};

[shader("vertex")]
PSInput vertexMain(VSInput input)
{
    PSInput output;
    float4 viewPos  = mul(u_modelViewMatrix, input.position);
    output.position = mul(u_projectionMatrix, viewPos);
    output.normal   = mul(u_normalMatrix, input.normal);
    output.texCoord = input.texCoord;
    output.viewPos  = viewPos.xyz;
    return output;
}

[shader("fragment")]
float4 fragmentMain(PSInput input) : SV_Target
{
    float2 uv = input.texCoord * u_scale + float2(u_time * u_speed, 0.0);
    float2 c  = floor(uv);
    float  checker = frac((c.x + c.y) * 0.5) * 2.0;

    float3 normal   = normalize(input.normal);
    float3 lightDir = normalize(float3(0.5, 0.8, 0.6));
    float  diff     = max(dot(normal, lightDir), 0.0) * 0.7 + 0.3;

    float3 a = float3(0.95, 0.85, 0.4);
    float3 b = float3(0.15, 0.25, 0.5);
    float3 col = lerp(b, a, checker) * diff;
    return float4(col, 1.0);
}`,
  glsl: `precision mediump float;

uniform float u_time;
uniform float u_scale;
uniform float u_speed;
varying vec3 v_normal;
varying vec2 v_texCoord;

void main() {
  vec2 uv = v_texCoord * u_scale + vec2(u_time * u_speed, 0.0);
  vec2 c = floor(uv);
  float checker = fract((c.x + c.y) * 0.5) * 2.0;

  vec3 normal = normalize(v_normal);
  vec3 lightDir = normalize(vec3(0.5, 0.8, 0.6));
  float diff = max(dot(normal, lightDir), 0.0) * 0.7 + 0.3;

  vec3 a = vec3(0.95, 0.85, 0.4);
  vec3 b = vec3(0.15, 0.25, 0.5);
  vec3 col = mix(b, a, checker) * diff;
  gl_FragColor = vec4(col, 1.0);
}`,
};

// ---------------------------------------------------------------------------
// Plasma Glow — layered sine-wave plasma with mouse-driven glow center
// ---------------------------------------------------------------------------
export const SLANG_PLASMA_GLOW: SlangTemplate = {
  id: "plasmaGlow",
  name: "Plasma Glow",
  description: "Layered sine-wave plasma reacting to the mouse",
  renderMode: "2d",
  slang: `// Slang — Plasma Glow
// @param u_speed {type: "float", min: 0.1, max: 3.0, step: 0.05, value: 1.0, label: "Speed"}
// @param u_scale {type: "float", min: 1.0, max: 10.0, step: 0.25, value: 4.0, label: "Scale"}
uniform float  u_time;
uniform float2 u_resolution;
uniform float2 u_mouse;
uniform float  u_speed;
uniform float  u_scale;

[shader("fragment")]
float4 fragmentMain(float4 fragCoord : SV_Position) : SV_Target
{
    float2 uv = (fragCoord.xy * 2.0 - u_resolution) / u_resolution.y;
    float  t  = u_time * u_speed;

    float plasma = sin(uv.x * u_scale + t);
    plasma += sin(uv.y * u_scale + t * 1.3);
    plasma += sin((uv.x + uv.y) * u_scale * 0.7 + t * 0.6);

    float2 mouseP = u_mouse * 2.0 - 1.0;
    mouseP.x *= u_resolution.x / u_resolution.y;
    float  glow = 0.15 / length(uv - mouseP);
    plasma += glow;

    float3 col = 0.5 + 0.5 * cos(plasma + float3(0.0, 2.094, 4.189));
    return float4(col, 1.0);
}`,
  glsl: `precision highp float;

uniform float u_time;
uniform vec2 u_resolution;
// @param u_speed {type: "float", min: 0.1, max: 3.0, step: 0.05, value: 1.0, label: "Speed"}
uniform float u_speed;
// @param u_scale {type: "float", min: 1.0, max: 10.0, step: 0.25, value: 4.0, label: "Scale"}
uniform float u_scale;
uniform vec2 u_mouse;

void main() {
  vec2 uv = (gl_FragCoord.xy * 2.0 - u_resolution) / u_resolution.y;
  float t = u_time * u_speed;

  float plasma = sin(uv.x * u_scale + t);
  plasma += sin(uv.y * u_scale + t * 1.3);
  plasma += sin((uv.x + uv.y) * u_scale * 0.7 + t * 0.6);

  vec2 mouseP = u_mouse * 2.0 - 1.0;
  mouseP.x *= u_resolution.x / u_resolution.y;
  float glow = 0.15 / length(uv - mouseP);
  plasma += glow;

  vec3 col = 0.5 + 0.5 * cos(plasma + vec3(0.0, 2.094, 4.189));
  gl_FragColor = vec4(col, 1.0);
}`,
};

// ---------------------------------------------------------------------------
// Hex Grid — pulsing hexagonal tiling
// ---------------------------------------------------------------------------
export const SLANG_HEX_GRID: SlangTemplate = {
  id: "hexGrid",
  name: "Hex Grid",
  description: "Pulsing hexagonal tiling with glowing edges",
  renderMode: "2d",
  slang: `// Slang — Hex Grid
// @param u_scale {type: "float", min: 2.0, max: 20.0, step: 0.5, value: 8.0, label: "Grid Scale"}
// @param u_glow {type: "float", min: 0.0, max: 1.0, step: 0.02, value: 0.35, label: "Edge Glow"}
uniform float  u_time;
uniform float2 u_resolution;
uniform float2 u_mouse;
uniform float  u_scale;
uniform float  u_glow;

float hexDist(float2 p)
{
    p = abs(p);
    float c = dot(p, normalize(float2(1.0, 1.7320508)));
    c = max(c, p.x);
    return c;
}

[shader("fragment")]
float4 fragmentMain(float4 fragCoord : SV_Position) : SV_Target
{
    float2 uv = (fragCoord.xy * 2.0 - u_resolution) / u_resolution.y * u_scale;

    float2 r = float2(1.0, 1.7320508);
    float2 h = r * 0.5;
    float2 a = fmod(uv, r) - h;
    float2 b = fmod(uv - h, r) - h;
    float2 cell = length(a) < length(b) ? a : b;

    float dist = hexDist(cell);
    float edge = smoothstep(0.5, 0.5 - u_glow * 0.5, dist);
    float pulse = 0.5 + 0.5 * sin(u_time * 1.5 - dist * 6.0);

    float3 base = float3(0.05, 0.08, 0.14);
    float3 line = lerp(float3(0.1, 0.6, 0.9), float3(0.8, 0.3, 0.9), pulse);
    float3 col = lerp(base, line, edge);

    return float4(col, 1.0);
}`,
  glsl: `precision highp float;

uniform float u_time;
uniform vec2 u_resolution;
// @param u_scale {type: "float", min: 2.0, max: 20.0, step: 0.5, value: 8.0, label: "Grid Scale"}
uniform float u_scale;
// @param u_glow {type: "float", min: 0.0, max: 1.0, step: 0.02, value: 0.35, label: "Edge Glow"}
uniform float u_glow;

float hexDist(vec2 p) {
  p = abs(p);
  float c = dot(p, normalize(vec2(1.0, 1.7320508)));
  c = max(c, p.x);
  return c;
}

void main() {
  vec2 uv = (gl_FragCoord.xy * 2.0 - u_resolution) / u_resolution.y * u_scale;

  vec2 r = vec2(1.0, 1.7320508);
  vec2 h = r * 0.5;
  vec2 a = mod(uv, r) - h;
  vec2 b = mod(uv - h, r) - h;
  vec2 cell = length(a) < length(b) ? a : b;

  float dist = hexDist(cell);
  float edge = smoothstep(0.5, 0.5 - u_glow * 0.5, dist);
  float pulse = 0.5 + 0.5 * sin(u_time * 1.5 - dist * 6.0);

  vec3 base = vec3(0.05, 0.08, 0.14);
  vec3 line = mix(vec3(0.1, 0.6, 0.9), vec3(0.8, 0.3, 0.9), pulse);
  vec3 col = mix(base, line, edge);

  gl_FragColor = vec4(col, 1.0);
}`,
};

// ---------------------------------------------------------------------------
// Fire Flame — hand-rolled noise-driven flame column
// ---------------------------------------------------------------------------
export const SLANG_FIRE_FLAME: SlangTemplate = {
  id: "fireFlame",
  name: "Fire Flame",
  description: "Noise-driven flame rising from the bottom edge",
  renderMode: "2d",
  slang: `// Slang — Fire Flame
// @param u_speed {type: "float", min: 0.2, max: 3.0, step: 0.05, value: 1.2, label: "Rise Speed"}
// @param u_intensity {type: "float", min: 0.5, max: 2.5, step: 0.05, value: 1.3, label: "Intensity"}
uniform float  u_time;
uniform float2 u_resolution;
uniform float2 u_mouse;
uniform float  u_speed;
uniform float  u_intensity;

float hash(float2 p)
{
    return frac(sin(dot(p, float2(127.1, 311.7))) * 43758.5453123);
}

float noise(float2 p)
{
    float2 i = floor(p);
    float2 f = frac(p);
    float2 u = f * f * (3.0 - 2.0 * f);
    float a = hash(i);
    float b = hash(i + float2(1.0, 0.0));
    float c = hash(i + float2(0.0, 1.0));
    float d = hash(i + float2(1.0, 1.0));
    return lerp(lerp(a, b, u.x), lerp(c, d, u.x), u.y);
}

[shader("fragment")]
float4 fragmentMain(float4 fragCoord : SV_Position) : SV_Target
{
    float2 uv = fragCoord.xy / u_resolution;
    float2 p  = uv * float2(4.0, 6.0);
    p.y -= u_time * u_speed;

    float n = noise(p) * 0.6 + noise(p * 2.0) * 0.3 + noise(p * 4.0) * 0.1;
    float flame = n * (1.0 - uv.y) * u_intensity;
    flame = saturate(flame - (uv.y * 0.3));

    float3 dark  = float3(0.05, 0.0, 0.0);
    float3 mid   = float3(0.9, 0.35, 0.0);
    float3 bright= float3(1.0, 0.9, 0.4);

    float3 col = lerp(dark, mid, saturate(flame * 1.6));
    col = lerp(col, bright, saturate((flame - 0.55) * 2.2));

    return float4(col, 1.0);
}`,
  glsl: `precision highp float;

uniform float u_time;
uniform vec2 u_resolution;
// @param u_speed {type: "float", min: 0.2, max: 3.0, step: 0.05, value: 1.2, label: "Rise Speed"}
uniform float u_speed;
// @param u_intensity {type: "float", min: 0.5, max: 2.5, step: 0.05, value: 1.3, label: "Intensity"}
uniform float u_intensity;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution;
  vec2 p = uv * vec2(4.0, 6.0);
  p.y -= u_time * u_speed;

  float n = noise(p) * 0.6 + noise(p * 2.0) * 0.3 + noise(p * 4.0) * 0.1;
  float flame = n * (1.0 - uv.y) * u_intensity;
  flame = clamp(flame - (uv.y * 0.3), 0.0, 1.0);

  vec3 dark = vec3(0.05, 0.0, 0.0);
  vec3 mid = vec3(0.9, 0.35, 0.0);
  vec3 bright = vec3(1.0, 0.9, 0.4);

  vec3 col = mix(dark, mid, clamp(flame * 1.6, 0.0, 1.0));
  col = mix(col, bright, clamp((flame - 0.55) * 2.2, 0.0, 1.0));

  gl_FragColor = vec4(col, 1.0);
}`,
};

// ---------------------------------------------------------------------------
// 3D — Toon Shading (cel-shaded lighting bands)
// ---------------------------------------------------------------------------
export const SLANG_3D_TOON_SHADE: SlangTemplate = {
  id: "toonShade3d",
  name: "Toon Shade",
  description: "Cel-shaded lighting with quantized bands",
  renderMode: "3d",
  slang: `// Slang 3D — Toon shading
uniform float  u_time;
uniform float2 u_resolution;
uniform float2 u_mouse;
uniform float4x4 u_modelViewMatrix;
uniform float4x4 u_projectionMatrix;
uniform float3x3 u_normalMatrix;
// @param u_bands {type: "float", min: 2.0, max: 8.0, step: 1.0, value: 4.0, label: "Shade Bands"}
uniform float u_bands;

struct VSInput {
    float4 position : POSITION;
    float3 normal   : NORMAL;
    float2 texCoord : TEXCOORD0;
};

struct PSInput {
    float4 position : SV_Position;
    float3 normal   : NORMAL;
    float2 texCoord : TEXCOORD0;
    float3 viewPos  : TEXCOORD1;
};

[shader("vertex")]
PSInput vertexMain(VSInput input)
{
    PSInput output;
    float4 viewPos  = mul(u_modelViewMatrix, input.position);
    output.position = mul(u_projectionMatrix, viewPos);
    output.normal   = mul(u_normalMatrix, input.normal);
    output.texCoord = input.texCoord;
    output.viewPos  = viewPos.xyz;
    return output;
}

[shader("fragment")]
float4 fragmentMain(PSInput input) : SV_Target
{
    float3 normal   = normalize(input.normal);
    float3 lightDir = normalize(float3(0.6, 0.8, 0.5));
    float  diff     = max(dot(normal, lightDir), 0.0);
    float  banded   = floor(diff * u_bands) / u_bands;

    float3 base = float3(0.85, 0.55, 0.2);
    float3 col  = base * (0.35 + banded * 0.75);

    float3 viewDir = normalize(-input.viewPos);
    float  rim     = pow(1.0 - max(dot(viewDir, normal), 0.0), 4.0);
    col += float3(1.0, 1.0, 1.0) * step(0.75, rim);

    return float4(col, 1.0);
}`,
  glsl: `precision mediump float;

uniform float u_bands;
varying vec3 v_normal;
varying vec3 v_position;

void main() {
  vec3 normal = normalize(v_normal);
  vec3 lightDir = normalize(vec3(0.6, 0.8, 0.5));
  float diff = max(dot(normal, lightDir), 0.0);
  float banded = floor(diff * u_bands) / u_bands;

  vec3 base = vec3(0.85, 0.55, 0.2);
  vec3 col = base * (0.35 + banded * 0.75);

  vec3 viewDir = normalize(-v_position);
  float rim = pow(1.0 - max(dot(viewDir, normal), 0.0), 4.0);
  col += vec3(1.0, 1.0, 1.0) * step(0.75, rim);

  gl_FragColor = vec4(col, 1.0);
}`,
};

// ---------------------------------------------------------------------------
// 3D — Iridescent (view-dependent hue-shifting coating)
// ---------------------------------------------------------------------------
export const SLANG_3D_IRIDESCENT: SlangTemplate = {
  id: "iridescent3d",
  name: "Iridescent",
  description: "View-dependent color-shifting coating",
  renderMode: "3d",
  slang: `// Slang 3D — Iridescent coating
uniform float  u_time;
uniform float2 u_resolution;
uniform float2 u_mouse;
uniform float4x4 u_modelViewMatrix;
uniform float4x4 u_projectionMatrix;
uniform float3x3 u_normalMatrix;
// @param u_shift {type: "float", min: 0.5, max: 6.0, step: 0.1, value: 2.5, label: "Hue Shift"}
uniform float u_shift;

struct VSInput {
    float4 position : POSITION;
    float3 normal   : NORMAL;
    float2 texCoord : TEXCOORD0;
};

struct PSInput {
    float4 position : SV_Position;
    float3 normal   : NORMAL;
    float2 texCoord : TEXCOORD0;
    float3 viewPos  : TEXCOORD1;
};

[shader("vertex")]
PSInput vertexMain(VSInput input)
{
    PSInput output;
    float4 viewPos  = mul(u_modelViewMatrix, input.position);
    output.position = mul(u_projectionMatrix, viewPos);
    output.normal   = mul(u_normalMatrix, input.normal);
    output.texCoord = input.texCoord;
    output.viewPos  = viewPos.xyz;
    return output;
}

float3 palette(float t)
{
    float3 a = float3(0.5, 0.5, 0.5);
    float3 b = float3(0.5, 0.5, 0.5);
    float3 c = float3(1.0, 1.0, 1.0);
    float3 d = float3(0.0, 0.33, 0.67);
    return a + b * cos(6.28318 * (c * t + d));
}

[shader("fragment")]
float4 fragmentMain(PSInput input) : SV_Target
{
    float3 normal   = normalize(input.normal);
    float3 viewDir  = normalize(-input.viewPos);
    float  fresnel  = pow(1.0 - max(dot(viewDir, normal), 0.0), 2.0);
    float3 hueShift = palette(fresnel * u_shift + u_time * 0.1);

    float3 lightDir = normalize(float3(0.5, 0.7, 0.6));
    float  diff     = max(dot(normal, lightDir), 0.0) * 0.5 + 0.5;

    float3 col = hueShift * diff;
    return float4(col, 1.0);
}`,
  glsl: `precision mediump float;

uniform float u_time;
uniform float u_shift;
varying vec3 v_normal;
varying vec3 v_position;

vec3 palette(float t) {
  vec3 a = vec3(0.5), b = vec3(0.5), c = vec3(1.0), d = vec3(0.0, 0.33, 0.67);
  return a + b * cos(6.28318 * (c * t + d));
}

void main() {
  vec3 normal = normalize(v_normal);
  vec3 viewDir = normalize(-v_position);
  float fresnel = pow(1.0 - max(dot(viewDir, normal), 0.0), 2.0);
  vec3 hueShift = palette(fresnel * u_shift + u_time * 0.1);

  vec3 lightDir = normalize(vec3(0.5, 0.7, 0.6));
  float diff = max(dot(normal, lightDir), 0.0) * 0.5 + 0.5;

  vec3 col = hueShift * diff;
  gl_FragColor = vec4(col, 1.0);
}`,
};

// ---------------------------------------------------------------------------
// 3D — Wire Grid (procedural wireframe overlay on the cube surface)
// ---------------------------------------------------------------------------
export const SLANG_3D_WIRE_GRID: SlangTemplate = {
  id: "wireGrid3d",
  name: "Wire Grid",
  description: "Procedural wireframe overlay with base lighting",
  renderMode: "3d",
  slang: `// Slang 3D — Wire grid overlay
uniform float  u_time;
uniform float2 u_resolution;
uniform float2 u_mouse;
uniform float4x4 u_modelViewMatrix;
uniform float4x4 u_projectionMatrix;
uniform float3x3 u_normalMatrix;
// @param u_lineWidth {type: "float", min: 0.01, max: 0.2, step: 0.005, value: 0.05, label: "Line Width"}
uniform float u_lineWidth;
// @param u_scale {type: "float", min: 2.0, max: 24.0, step: 1.0, value: 8.0, label: "Grid Scale"}
uniform float u_scale;

struct VSInput {
    float4 position : POSITION;
    float3 normal   : NORMAL;
    float2 texCoord : TEXCOORD0;
};

struct PSInput {
    float4 position : SV_Position;
    float3 normal   : NORMAL;
    float2 texCoord : TEXCOORD0;
    float3 viewPos  : TEXCOORD1;
};

[shader("vertex")]
PSInput vertexMain(VSInput input)
{
    PSInput output;
    float4 viewPos  = mul(u_modelViewMatrix, input.position);
    output.position = mul(u_projectionMatrix, viewPos);
    output.normal   = mul(u_normalMatrix, input.normal);
    output.texCoord = input.texCoord;
    output.viewPos  = viewPos.xyz;
    return output;
}

[shader("fragment")]
float4 fragmentMain(PSInput input) : SV_Target
{
    float2 g     = frac(input.texCoord * u_scale);
    float2 lines = smoothstep(0.0, u_lineWidth, g) * smoothstep(0.0, u_lineWidth, 1.0 - g);
    float  wire  = 1.0 - min(lines.x, lines.y);

    float3 normal   = normalize(input.normal);
    float3 lightDir = normalize(float3(0.5, 0.8, 0.6));
    float  diff     = max(dot(normal, lightDir), 0.0) * 0.7 + 0.3;

    float3 base = float3(0.1, 0.15, 0.2) * diff;
    float3 col  = lerp(base, float3(0.2, 0.9, 0.8), wire);

    return float4(col, 1.0);
}`,
  glsl: `precision mediump float;

uniform float u_lineWidth;
uniform float u_scale;
varying vec3 v_normal;
varying vec2 v_texCoord;

void main() {
  vec2 g = fract(v_texCoord * u_scale);
  vec2 lines = smoothstep(0.0, u_lineWidth, g) * smoothstep(0.0, u_lineWidth, 1.0 - g);
  float wire = 1.0 - min(lines.x, lines.y);

  vec3 normal = normalize(v_normal);
  vec3 lightDir = normalize(vec3(0.5, 0.8, 0.6));
  float diff = max(dot(normal, lightDir), 0.0) * 0.7 + 0.3;

  vec3 base = vec3(0.1, 0.15, 0.2) * diff;
  vec3 col = mix(base, vec3(0.2, 0.9, 0.8), wire);

  gl_FragColor = vec4(col, 1.0);
}`,
};

export const DEFAULT_SLANG_TEMPLATES: SlangTemplate[] = [
  DEFAULT_SLANG_FRAGMENT_2D,
  SLANG_PALETTE_FLOW,
  SLANG_VERTEX_WAVE,
  SLANG_PLASMA_GLOW,
  SLANG_HEX_GRID,
  SLANG_FIRE_FLAME,
  DEFAULT_SLANG_FRAGMENT_3D,
  SLANG_3D_VERTEX_DISPLACE,
  SLANG_3D_FRESNEL,
  SLANG_3D_UV_CHECKER,
  SLANG_3D_TOON_SHADE,
  SLANG_3D_IRIDESCENT,
  SLANG_3D_WIRE_GRID,
  SLANG_TEXTURE_SAMPLE,
];

/** Find a built-in template whose canonical Slang source matches exactly. */
export function findSlangTemplateBySource(source: string): SlangTemplate | undefined {
  const trimmed = source.trim();
  return DEFAULT_SLANG_TEMPLATES.find((t) => t.slang.trim() === trimmed);
}

/** Default Slang source for new 2D projects (matches former GLSL paletteFlow default). */
export const defaultSlangShader = SLANG_PALETTE_FLOW.slang;

export const defaultSlangShader2D = DEFAULT_SLANG_FRAGMENT_2D.slang;
export const defaultSlangShader3D = DEFAULT_SLANG_FRAGMENT_3D.slang;

export const slangTemplates2D: SlangTemplate[] = [
  DEFAULT_SLANG_FRAGMENT_2D,
  SLANG_PALETTE_FLOW,
  SLANG_VERTEX_WAVE,
  SLANG_TEXTURE_SAMPLE,
  SLANG_PLASMA_GLOW,
  SLANG_HEX_GRID,
  SLANG_FIRE_FLAME,
];

export const slangTemplates3D: SlangTemplate[] = [
  DEFAULT_SLANG_FRAGMENT_3D,
  SLANG_3D_VERTEX_DISPLACE,
  SLANG_3D_FRESNEL,
  SLANG_3D_UV_CHECKER,
  SLANG_3D_TOON_SHADE,
  SLANG_3D_IRIDESCENT,
  SLANG_3D_WIRE_GRID,
];

export type SlangTemplate2DId = (typeof slangTemplates2D)[number]["id"];
export type SlangTemplate3DId = (typeof slangTemplates3D)[number]["id"];
