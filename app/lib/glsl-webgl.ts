/**
 * Adapt Slang-compiled desktop GLSL to GLSL ES 1.00 for WebGL 1.0 preview.
 */

export function sanitizeShaderSource(src: string): string {
  return src
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/[\uFEFF\u200B\u200C\u2060]/g, "")
    .replace(/\u200D/g, "")
    .replace(/[\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000]/g, " ");
}

const VERTEX_ATTRIBUTE_ALIASES: Record<string, string> = {
  position: "a_position",
  in_position: "a_position",
  aPosition: "a_position",
  normal: "a_normal",
  in_normal: "a_normal",
  aNormal: "a_normal",
  texCoord: "a_texCoord",
  texcoord: "a_texCoord",
  uv: "a_texCoord",
  aTexCoord: "a_texCoord",
};

function remapVertexAttributes(code: string): string {
  let out = code;
  for (const [from, to] of Object.entries(VERTEX_ATTRIBUTE_ALIASES)) {
    out = out.replace(
      new RegExp(`\\battribute\\s+(vec[234f])\\s+${from}\\b`, "g"),
      `attribute $1 ${to}`,
    );
  }
  return out;
}

function flattenInterfaceBlocks(code: string): string {
  return code.replace(
    /\b(?:uniform|buffer)\s+\w+\s*\{([\s\S]*?)\}\s*\w*\s*;/g,
    (_, body: string) => {
      const lines = body
        .split(";")
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => line.replace(/^layout\s*\([^)]*\)\s*/g, ""))
        .map((line) => {
          if (/^(uniform|attribute|varying|const)\b/.test(line)) return line;
          return `uniform ${line}`;
        });
      return `${lines.join(";\n")};`;
    },
  );
}

function rewriteSlangTypesToGlsl(code: string): string {
  return code
    .replace(/\bfloat2\b/g, "vec2")
    .replace(/\bfloat3\b/g, "vec3")
    .replace(/\bfloat4\b/g, "vec4")
    .replace(/\bint2\b/g, "ivec2")
    .replace(/\bint3\b/g, "ivec3")
    .replace(/\bint4\b/g, "ivec4")
    .replace(/\buint2\b/g, "uvec2")
    .replace(/\buint3\b/g, "uvec3")
    .replace(/\buint4\b/g, "uvec4")
    .replace(/\bfloat2x2\b/g, "mat2")
    .replace(/\bfloat3x3\b/g, "mat3")
    .replace(/\bfloat4x4\b/g, "mat4")
    .replace(/\bmat2x2\b/g, "mat2")
    .replace(/\bmat3x3\b/g, "mat3")
    .replace(/\bmat4x4\b/g, "mat4");
}

function normalizeGeneratedUniformNames(code: string): string {
  return code
    .replace(/\bglobalParams_\d+\./g, "")
    .replace(/\b(u_[A-Za-z0-9]+)_\d+\b/g, "$1");
}

/**
 * Strip desktop GLSL syntax that WebGL 1.0 cannot compile and prepend ES headers.
 */
export function adaptGlslForWebGL1(
  source: string,
  stage: "vertex" | "fragment",
): string {
  let code = sanitizeShaderSource(source).trim();
  code = code.replace(/^#version\s+[^\n]+\n?/gm, "");
  code = code.replace(/^\s*#extension[^\n]+\n?/gm, "");
  code = code.replace(/layout\s*\([^)]*\)\s*/g, "");
  code = code.replace(/\bflat\b/g, "");
  code = code.replace(/\bsmooth\b/g, "");
  code = code.replace(/\bcentroid\b/g, "");
  code = code.replace(/\bhighp\b/g, "");
  code = code.replace(/\bmediump\b/g, "");
  code = code.replace(/\blowp\b/g, "");
  code = rewriteSlangTypesToGlsl(code);
  code = flattenInterfaceBlocks(code);
  code = code.replace(/\bbuffer\b/g, "uniform");
  code = normalizeGeneratedUniformNames(code);
  code = code.replace(/^\s*layout[^\n]*$/gm, "");

  if (stage === "vertex") {
    code = code.replace(/\bin\s+/g, "attribute ");
    code = code.replace(/\bout\s+/g, "varying ");
    code = remapVertexAttributes(code);
  } else {
    code = code.replace(/\bin\s+/g, "varying ");
    code = code.replace(/\bout\s+vec4\s+\w+\s*;\s*/g, "");
    if (!/void\s+main\s*\(/.test(code) && /vec4\s+\w+\s*\(/.test(code)) {
      code = code.replace(
        /vec4\s+(\w+)\s*\(([^)]*)\)\s*\{/,
        "void main() { gl_FragColor = $1($2); return; {",
      );
    }
  }

  const header = "precision mediump float;\n";
  if (!code.includes("precision")) {
    code = header + code;
  }

  if (stage === "fragment" && !code.includes("gl_FragColor")) {
    code = code.replace(
      /return\s+([^;]+);/g,
      "gl_FragColor = $1; return;",
    );
  }

  return `#version 100\n${code}`;
}
