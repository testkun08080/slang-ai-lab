/**
 * Parse @group(0) resource bindings from Slang-compiled WGSL so the WebGPU
 * renderer can build a matching bind group (uniforms, textures, samplers).
 */

export type WgslBindingKind = "uniform" | "texture" | "sampler";

export interface WgslBinding {
  binding: number;
  kind: WgslBindingKind;
  name: string;
}

const GROUP0_BINDING_RE =
  /@group\s*\(\s*0\s*\)\s*@binding\s*\(\s*(\d+)\s*\)\s*var(?:\s*<uniform>)?\s+(\w+)\s*:\s*([^;{]+)/g;

const BINDING_GROUP0_RE =
  /@binding\s*\(\s*(\d+)\s*\)\s*@group\s*\(\s*0\s*\)\s*var(?:\s*<uniform>)?\s+(\w+)\s*:\s*([^;{]+)/g;

function pushBinding(
  bindings: WgslBinding[],
  binding: number,
  name: string,
  typeStr: string,
) {
  if (bindings.some((b) => b.binding === binding)) return;
  bindings.push({
    binding,
    name,
    kind: classifyBindingType(typeStr),
  });
}

function scanBindingPattern(
  wgsl: string,
  pattern: RegExp,
  bindings: WgslBinding[],
) {
  pattern.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(wgsl)) !== null) {
    pushBinding(bindings, Number.parseInt(match[1], 10), match[2], match[3]);
  }
}

function classifyBindingType(typeStr: string): WgslBindingKind {
  const t = typeStr.trim().toLowerCase();
  if (t.startsWith("sampler")) return "sampler";
  if (t.includes("texture")) return "texture";
  return "uniform";
}

export interface WgslUniformField {
  name: string;
  type: string;
  offset: number;
  /** Number of 32-bit words (f32/i32) this field occupies in the packed buffer. */
  wordCount: number;
}

export interface WgslUniformLayout {
  structName: string;
  /** std140 size rounded up to a 16-byte WebGPU binding minimum. */
  size: number;
  fields: WgslUniformField[];
}

function wgslScalarLayout(type: string): { size: number; align: number; wordCount: number } {
  const t = type.replace(/\s/g, "");
  if (t === "f32" || t === "i32" || t === "u32") {
    return { size: 4, align: 4, wordCount: 1 };
  }
  if (t === "vec2<f32>" || t === "vec2<i32>") {
    return { size: 8, align: 8, wordCount: 2 };
  }
  if (t === "vec3<f32>" || t === "vec3<i32>") {
    return { size: 12, align: 16, wordCount: 4 };
  }
  if (t === "vec4<f32>" || t === "vec4<i32>") {
    return { size: 16, align: 16, wordCount: 4 };
  }
  if (t === "mat4x4<f32>") {
    return { size: 64, align: 16, wordCount: 16 };
  }
  if (t === "mat3x3<f32>") {
    return { size: 48, align: 16, wordCount: 12 };
  }
  // Default to float scalar for unknown types.
  return { size: 4, align: 4, wordCount: 1 };
}

/**
 * Strip the numeric suffix Slang appends when mangling identifiers
 * (`u_time` -> `u_time_0`), so fields can be matched against the canonical
 * uniform names used by the renderer and by `@param` annotations.
 */
export function normalizeSlangName(name: string): string {
  return name.replace(/_\d+$/, "");
}

function parseStructFields(
  body: string,
): { name: string; type: string; explicitAlign?: number }[] {
  return body
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((line) => {
      // Slang emits layout attributes on each field, e.g.
      //   @align(16) u_time_0 : f32
      const alignMatch = line.match(/@align\s*\(\s*(\d+)\s*\)/);
      const explicitAlign = alignMatch ? Number.parseInt(alignMatch[1], 10) : undefined;
      const cleaned = line.replace(/@\w+\s*\([^)]*\)\s*/g, "").trim();
      const colon = cleaned.indexOf(":");
      if (colon === -1) return { name: normalizeSlangName(cleaned), type: "f32", explicitAlign };
      return {
        name: normalizeSlangName(cleaned.slice(0, colon).trim()),
        type: cleaned.slice(colon + 1).replace(/;$/, "").trim(),
        explicitAlign,
      };
    });
}

/** Compute std140 layout for a WGSL struct body (field list inside `{ ... }`). */
export function layoutStd140Fields(
  rawFields: { name: string; type: string; explicitAlign?: number }[],
): WgslUniformField[] {
  const fields: WgslUniformField[] = [];
  let offset = 0;
  let maxAlign = 1;

  for (const raw of rawFields) {
    const { size, align: intrinsicAlign, wordCount } = wgslScalarLayout(raw.type);
    // An explicit @align from the compiler wins over the intrinsic alignment
    // (Slang emits std140 attributes, e.g. vec2 fields aligned to 16).
    const align = Math.max(intrinsicAlign, raw.explicitAlign ?? 0);
    const aligned = Math.ceil(offset / align) * align;
    fields.push({
      name: raw.name,
      type: raw.type,
      offset: aligned,
      wordCount,
    });
    offset = aligned + size;
    maxAlign = Math.max(maxAlign, align);
  }

  return fields;
}

export function std140BufferSize(fields: WgslUniformField[]): number {
  if (fields.length === 0) return 16;
  const last = fields[fields.length - 1];
  const { size, align } = wgslScalarLayout(last.type);
  const end = last.offset + size;
  const structSize = Math.ceil(end / align) * align;
  return Math.max(16, Math.ceil(structSize / 16) * 16);
}

/**
 * Parse the uniform struct layout from Slang-compiled WGSL (std140).
 * Returns null when no `var<uniform>` global exists.
 */
export function parseWgslUniformLayout(wgsl: string): WgslUniformLayout | null {
  const varMatch = wgsl.match(
    /var\s*<\s*uniform\s*>\s+\w+\s*:\s*(\w+)\s*;/,
  );
  if (!varMatch) return null;

  const structName = varMatch[1];
  const structRe = new RegExp(
    `struct\\s+${structName}\\s*\\{([^}]+)\\}`,
    "m",
  );
  const structMatch = structRe.exec(wgsl);
  if (!structMatch) return null;

  const fields = layoutStd140Fields(parseStructFields(structMatch[1]));
  return {
    structName,
    size: std140BufferSize(fields),
    fields,
  };
}

export function parseWgslGroup0Bindings(wgsl: string): WgslBinding[] {
  const bindings: WgslBinding[] = [];
  scanBindingPattern(wgsl, GROUP0_BINDING_RE, bindings);
  scanBindingPattern(wgsl, BINDING_GROUP0_RE, bindings);
  return bindings.sort((a, b) => a.binding - b.binding);
}

/** Map a WGSL resource name (e.g. iChannel0 / iChannel0Sampler) to a channel id. */
export function channelIdFromWgslName(name: string): "iChannel0" | "iChannel1" | "iChannel2" | "iChannel3" | null {
  const match = name.match(/iChannel[0-3]/);
  return match ? (match[0] as "iChannel0" | "iChannel1" | "iChannel2" | "iChannel3") : null;
}
