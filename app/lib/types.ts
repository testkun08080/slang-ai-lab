export type RenderMode = "2d" | "3d";

/** Languages the user edits as canonical source. */
export type SourceLanguage = "glsl" | "hlsl" | "slang";

/** Output format produced by the in-browser compiler. */
export type CompileTarget = "wgsl" | "glsl" | "hlsl" | "spirv" | "metal";

export type CompileStatus = "idle" | "compiling" | "success" | "error";

/** Normalized snapshot of the latest compile result for preview/export. */
export interface CompiledArtifact {
  sourceLanguage: SourceLanguage;
  targetLanguage: CompileTarget;
  renderMode: RenderMode;
  status: CompileStatus;
  singleOutput?: string;
  vertexOutput?: string;
  fragmentOutput?: string;
  compileLog?: string;
  linkLog?: string;
  warnings: string[];
  errors: string[];
  timestamp: number;
}
export type UniformType = "float" | "vec2" | "vec3" | "vec4" | "color" | "texture" | "int";

export type MeshPresetId = "cube" | "sphere";

export interface MeshData {
  positions: Float32Array;
  normals: Float32Array;
  texCoords: Float32Array;
  indices: Uint16Array;
}

export type MeshSource =
  | { kind: "preset"; presetId: MeshPresetId }
  | { kind: "obj"; name: string; objText: string };

export interface UniformParameter {
  name: string;           // e.g., "u_speed", "u_color"
  type: UniformType;
  value: number | number[] | string;  // string for texture path
  min?: number;
  max?: number;
  step?: number;
  label?: string;
  description?: string;
}

export interface TextureSlot {
  id: "iChannel0" | "iChannel1" | "iChannel2" | "iChannel3";
  name: string;
  base64Data: string; // Data URL format: data:image/png;base64,...
  width: number;
  height: number;
  mimeType: "image/png" | "image/jpeg" | "image/webp" | "image/heic" | "image/heif" | "image/bmp" | "image/gif";
  uploadedAt: number;
}

export interface ShaderProject {
  id: string;
  name: string;
  vertexShader: string;
  fragmentShader: string; // WebGL GLSL used for legacy rendering (unchanged)
  language: SourceLanguage;
  renderMode: RenderMode;
  /** Preferred compile output target for this project. */
  compileTarget?: CompileTarget;
  meshSource?: MeshSource;
  createdAt: number;
  updatedAt: number;
  textures?: TextureSlot[]; // Optional for backward compatibility
  parameters?: UniformParameter[]; // Optional for backward compatibility
  /** Canonical Slang source (edited in the editor, compiled to WGSL for preview). */
  slangSource?: string;
}

export interface AISettings {
  model: string;
  apiKey: string;
  useCustomKey: boolean;
}

export interface AIModelOption {
  id: string;
  name: string;
  provider: string;
  tier: "fast" | "balanced" | "pro";
}

export interface WebGLCompileReport {
  success: boolean;
  vertexSource: string;
  fragmentSource: string;
  vertexCompileLog?: string;
  fragmentCompileLog?: string;
  linkLog?: string;
  errorMessage?: string;
}

/** Snapshot of shader code produced from AI chat (per project, for re-apply from sidebar). */
export interface AIShaderHistoryEntry {
  id: string;
  createdAt: number;
  /** Short label (e.g. model description). */
  summary: string;
  fragmentShader: string;
  vertexShader: string;
  /** Canonical Slang source, when the entry was generated as Slang. */
  slangSource?: string;
}

/**
 * Fallback model list used when the live `/api/models` fetch (groq.models.list())
 * is unavailable. Groq deprecated the Llama 3.x chat models in June 2026 in favor
 * of openai/gpt-oss-*, so keep this list aligned with the current Groq catalog.
 */
export const DEFAULT_AI_MODELS: AIModelOption[] = [
  { id: "openai/gpt-oss-20b",  name: "GPT-OSS 20B",  provider: "Groq", tier: "fast" },
  { id: "openai/gpt-oss-120b", name: "GPT-OSS 120B", provider: "Groq", tier: "balanced" },
];

/** Default model for shader generation (Groq's recommended llama-3.x replacement). */
export const DEFAULT_AI_MODEL_ID = "openai/gpt-oss-120b";

/**
 * Model ids Groq has deprecated/decommissioned; stored settings pointing at one
 * of these are migrated to DEFAULT_AI_MODEL_ID on load so generation keeps working.
 */
export const DEPRECATED_AI_MODEL_IDS: string[] = [
  "llama-3.1-8b-instant",
  "llama-3.3-70b-versatile",
  "moonshotai/kimi-k2-instruct",
  "moonshotai/kimi-k2-instruct-0905",
  "qwen/qwen3-32b",
];

export const DEFAULT_VERTEX_SHADER_GLSL = `attribute vec4 a_position;
attribute vec2 a_texCoord;
varying vec2 v_texCoord;

void main() {
  gl_Position = a_position;
  v_texCoord = a_texCoord;
}`;

export const DEFAULT_VERTEX_SHADER_3D_GLSL = `attribute vec4 a_position;
attribute vec3 a_normal;
attribute vec2 a_texCoord;

uniform mat4 u_modelViewMatrix;
uniform mat4 u_projectionMatrix;
uniform mat3 u_normalMatrix;

varying vec3 v_normal;
varying vec2 v_texCoord;
varying vec3 v_position;

void main() {
  v_position = (u_modelViewMatrix * a_position).xyz;
  v_normal = u_normalMatrix * a_normal;
  v_texCoord = a_texCoord;
  gl_Position = u_projectionMatrix * u_modelViewMatrix * a_position;
}`;

export const DEFAULT_FRAGMENT_SHADER_3D_GLSL = `precision mediump float;

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

  // Use UV coordinates for color variation
  vec3 baseColor = vec3(0.4 + v_texCoord.x * 0.4, 0.6, 0.8 - v_texCoord.y * 0.4);
  vec3 col = baseColor * (ambient + diff * 0.7);

  // Add rim lighting
  vec3 viewDir = normalize(-v_position);
  float rim = 1.0 - max(dot(viewDir, normal), 0.0);
  rim = pow(rim, 3.0);
  col += vec3(0.3, 0.5, 0.7) * rim;

  gl_FragColor = vec4(col, 1.0);
}`;

export const DEFAULT_VERTEX_SHADER_HLSL = `struct VS_INPUT {
  float4 Position : POSITION;
  float2 TexCoord : TEXCOORD0;
};

struct VS_OUTPUT {
  float4 Position : SV_POSITION;
  float2 TexCoord : TEXCOORD0;
};

VS_OUTPUT VSMain(VS_INPUT input) {
  VS_OUTPUT output;
  output.Position = input.Position;
  output.TexCoord = input.TexCoord;
  return output;
}`;
