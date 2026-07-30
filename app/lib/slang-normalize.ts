/**
 * Slang source normalization.
 *
 * AI models (especially the smaller/faster Groq models) frequently emit Slang
 * that *uses* the required global uniforms (u_time, u_resolution, u_mouse) or a
 * custom scalar (u_speed, u_scale, ...) without ever declaring them. The real
 * Slang compiler then aborts with:
 *
 *   error[E30015]: undefined identifier 'u_resolution'.
 *   ...
 *   fatal error[E40003]: compilation ceased
 *
 * `normalizeSlangSource` makes generation robust by scanning the source for
 * referenced-but-undeclared `u_*` identifiers and injecting the missing
 * `uniform` declarations (plus a `@param` annotation for unknown scalars so
 * they show up as an adjustable control with a sensible non-zero default
 * instead of freezing the effect at 0).
 */

/** Global uniforms whose type + provisioning is known to the renderer. */
const KNOWN_UNIFORM_TYPES: Record<string, string> = {
  u_time: "float",
  u_resolution: "float2",
  u_mouse: "float2",
  u_modelViewMatrix: "float4x4",
  u_projectionMatrix: "float4x4",
  u_normalMatrix: "float3x3",
};

/** These are auto-provided every frame and must never get a @param control. */
const AUTO_PROVIDED = new Set(Object.keys(KNOWN_UNIFORM_TYPES));

/** Strip line + block comments so identifier scanning ignores commented code. */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/\/\/[^\n]*/g, " ");
}

/** Names already declared as `uniform <type> u_name`. */
function collectDeclaredUniforms(src: string): Set<string> {
  const declared = new Set<string>();
  const re = /\buniform\s+[A-Za-z_][\w<>]*\s+(u_[A-Za-z0-9_]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) declared.add(m[1]);
  return declared;
}

/** Every `u_*` identifier referenced in non-comment code. */
function collectReferencedUniforms(codeWithoutComments: string): Set<string> {
  const refs = new Set<string>();
  const re = /\bu_[A-Za-z0-9_]+\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(codeWithoutComments)) !== null) refs.add(m[0]);
  return refs;
}

export interface SlangNormalizeResult {
  source: string;
  /** Uniform names that were injected because they were used but not declared. */
  injected: string[];
}

/**
 * Some Groq models (esp. smaller/faster ones) slip into GLSL syntax despite the
 * prompt requiring Slang, producing e.g. "error[E30015]: undefined identifier
 * 'mix'". These GLSL identifiers map 1:1 onto a Slang equivalent regardless of
 * argument shape, so they can be safely rewritten outside of comments/strings.
 * `texture2D()` / `mod()` are intentionally excluded — they need a sampler
 * variable name or operand reordering that isn't a safe blind rewrite.
 */
const GLSL_TO_SLANG_IDENTIFIERS: Array<[RegExp, string]> = [
  [/\bmix(?=\s*\()/g, "lerp"],
  [/\bfract(?=\s*\()/g, "frac"],
  [/\bvec2(?=\s*\()/g, "float2"],
  [/\bvec3(?=\s*\()/g, "float3"],
  [/\bvec4(?=\s*\()/g, "float4"],
  [/\bmat3(?=\s*\()/g, "float3x3"],
  [/\bmat4(?=\s*\()/g, "float4x4"],
];

/** Rewrite common GLSL identifiers (mix, vec3, ...) to their Slang equivalents. */
export function fixGlslIdentifiers(src: string): string {
  if (!src) return src;
  // Split on string/comment boundaries so replacements never touch commented
  // examples or string literals, only live code.
  const parts = src.split(/(\/\*[\s\S]*?\*\/|\/\/[^\n]*|"(?:[^"\\]|\\.)*")/g);
  for (let i = 0; i < parts.length; i++) {
    // Every other element is a captured comment/string — leave it untouched.
    if (i % 2 === 1) continue;
    for (const [pattern, replacement] of GLSL_TO_SLANG_IDENTIFIERS) {
      parts[i] = parts[i].replace(pattern, replacement);
    }
  }
  return parts.join("");
}

/**
 * Ensure every `u_*` referenced in the shader is declared. Returns the possibly
 * rewritten source. Idempotent: running it on already-valid source is a no-op.
 */
export function normalizeSlangSourceVerbose(rawSrc: string): SlangNormalizeResult {
  if (!rawSrc || !rawSrc.trim()) return { source: rawSrc, injected: [] };

  const src = fixGlslIdentifiers(rawSrc);
  const code = stripComments(src);
  const declared = collectDeclaredUniforms(src);
  const referenced = collectReferencedUniforms(code);

  const missing: string[] = [];
  for (const name of referenced) {
    if (!declared.has(name)) missing.push(name);
  }
  if (missing.length === 0) return { source: src, injected: [] };

  // Emit known globals first (in a stable order), then unknown scalars.
  const knownMissing = missing
    .filter((n) => KNOWN_UNIFORM_TYPES[n])
    .sort((a, b) => Object.keys(KNOWN_UNIFORM_TYPES).indexOf(a) - Object.keys(KNOWN_UNIFORM_TYPES).indexOf(b));
  const unknownMissing = missing.filter((n) => !KNOWN_UNIFORM_TYPES[n]).sort();

  const blockLines: string[] = [
    "// --- auto-injected uniform declarations (see slang-normalize.ts) ---",
  ];
  for (const name of knownMissing) {
    blockLines.push(`uniform ${KNOWN_UNIFORM_TYPES[name]} ${name};`);
  }
  for (const name of unknownMissing) {
    if (!AUTO_PROVIDED.has(name)) {
      const label = name.replace(/^u_/, "");
      blockLines.push(
        `// @param ${name} {type: "float", min: 0.0, max: 5.0, step: 0.05, value: 1.0, label: "${label}"}`,
      );
    }
    blockLines.push(`uniform float ${name};`);
  }
  const block = blockLines.join("\n");

  // Insert before the first entry-point attribute so declarations precede use;
  // fall back to the top of the file.
  const lines = src.split("\n");
  let insertAt = lines.findIndex((l) => /\[\s*shader\s*\(/.test(l));
  if (insertAt < 0) insertAt = 0;

  lines.splice(insertAt, 0, block, "");
  return { source: lines.join("\n"), injected: missing };
}

/** Convenience wrapper returning just the normalized source. */
export function normalizeSlangSource(src: string): string {
  return normalizeSlangSourceVerbose(src).source;
}

/** True when the Slang source declares a `[shader("vertex")]` entry point. */
export function slangHasVertexEntry(src: string): boolean {
  return /\[\s*shader\s*\(\s*["']vertex["']\s*\)\s*\]/.test(src);
}

/**
 * Number of vertices a custom-vertex Slang shader wants drawn. Authors declare
 * it with `// @vertexCount N` (e.g. a procedural grid mesh). Defaults to 3
 * (the fullscreen triangle) and is clamped to a safe range.
 */
export function parseVertexCountDirective(src: string): number {
  const m = src.match(/\/\/\s*@vertexcount\s+(\d+)/i);
  if (!m) return 3;
  const n = parseInt(m[1], 10);
  if (!Number.isFinite(n) || n < 3) return 3;
  return Math.min(n, 1_500_000);
}
