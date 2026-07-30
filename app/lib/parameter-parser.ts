import { UniformParameter, UniformType } from "./types";

interface ParameterMetadata {
  type?: UniformType;
  min?: number;
  max?: number;
  step?: number;
  label?: string;
  description?: string;
  value?: number | number[] | string;
}

function coerceNumericArray(raw: unknown, expectedLength: number, fallbackValue: number): number[] {
  if (Array.isArray(raw)) {
    const nums = raw
      .map((item) => (typeof item === "number" ? item : Number(item)))
      .filter((item) => Number.isFinite(item));
    if (nums.length >= expectedLength) return nums.slice(0, expectedLength);
  }
  if (typeof raw === "string") {
    const nums = raw
      .split(",")
      .map((item) => Number(item.trim()))
      .filter((item) => Number.isFinite(item));
    if (nums.length >= expectedLength) return nums.slice(0, expectedLength);
  }
  return Array.from({ length: expectedLength }, () => fallbackValue);
}

function coerceParameterValue(
  type: UniformType,
  rawValue: number | number[] | string,
  minFallback: number
): number | number[] | string {
  switch (type) {
    case "float":
    case "int": {
      const n = typeof rawValue === "number" ? rawValue : Number(rawValue);
      return Number.isFinite(n) ? n : minFallback;
    }
    case "vec2":
      return coerceNumericArray(rawValue, 2, minFallback);
    case "vec3":
      return coerceNumericArray(rawValue, 3, minFallback);
    case "vec4":
      return coerceNumericArray(rawValue, 4, minFallback);
    case "color":
      if (typeof rawValue === "string") return normalizeColorToVec3(rawValue);
      return coerceNumericArray(rawValue, 3, minFallback);
    case "texture":
      return typeof rawValue === "string" ? rawValue : "";
    default:
      return rawValue;
  }
}

// Parse JS-object-like string where keys may lack quotes
// e.g. {type: "float", min: 0, max: 5} or {"type": "float", "min": 0}
function parseMetadataString(str: string): ParameterMetadata {
  const result: Record<string, unknown> = {};
  // Split by comma not inside quotes
  const pairs = str.split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/);
  for (const pair of pairs) {
    const colonIdx = pair.indexOf(":");
    if (colonIdx === -1) continue;
    const key = pair.slice(0, colonIdx).trim().replace(/^["']|["']$/g, "");
    const rawValue = pair.slice(colonIdx + 1).trim();
    if (!key) continue;
    // Parse value: try JSON first, then fallback to string
    try {
      result[key] = JSON.parse(rawValue);
    } catch {
      result[key] = rawValue.replace(/^["']|["']$/g, "");
    }
  }
  return result as ParameterMetadata;
}

export function parseParametersFromShader(
  fragmentShader: string
): UniformParameter[] {
  const parameters: UniformParameter[] = [];
  const lines = fragmentShader.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Match comment lines with @param annotations (with optional parameter name)
    // Two formats supported:
    // 1. // @param u_speed {type: "float", ...}
    // 2. // @param {type: "float", ...}  (use uniform name from next line)
    const paramMatch = line.match(/\/\/\s*@param\s*(?:(\w+)\s*)?\{([^}]+)\}/);
    if (!paramMatch) continue;

    const [, paramNameFromComment, metadataStr] = paramMatch;
    let paramName = paramNameFromComment;

    // Parse JS-object-like metadata (keys may lack quotes)
    let metadata: ParameterMetadata = {};
    try {
      metadata = parseMetadataString(metadataStr);
    } catch (e) {
      console.warn(`Failed to parse parameter metadata for ${paramName}:`, e);
      continue;
    }

    // Validate required fields
    if (!metadata.type) {
      console.warn(`Parameter ${paramName} missing required 'type' field`);
      continue;
    }

    // If parameter name not in comment, extract from next uniform declaration
    if (!paramName) {
      // Look at next few lines for uniform declaration
      for (let j = i + 1; j < Math.min(i + 5, lines.length); j++) {
        const nextLine = lines[j];
        const uniformMatch = nextLine.match(/uniform\s+\w+\s+(\w+)/);
        if (uniformMatch) {
          paramName = uniformMatch[1];
          break;
        }
      }
    }

    if (!paramName) {
      console.warn(`Could not determine parameter name for @param at line ${i + 1}`);
      continue;
    }

    // Determine initial value based on type
    let value: number | number[] | string;
    if (metadata.value !== undefined) {
      const minFallback = metadata.min ?? 0;
      value = coerceParameterValue(metadata.type, metadata.value, minFallback);
    } else {
      switch (metadata.type) {
        case "float":
        case "int":
          value = metadata.min ?? 0;
          break;
        case "vec2":
          value = [metadata.min ?? 0, metadata.min ?? 0];
          break;
        case "vec3":
        case "color":
          value = [metadata.min ?? 0, metadata.min ?? 0, metadata.min ?? 0];
          break;
        case "vec4":
          value = [
            metadata.min ?? 0,
            metadata.min ?? 0,
            metadata.min ?? 0,
            metadata.min ?? 1,
          ];
          break;
        case "texture":
          value = "";
          break;
        default:
          value = 0;
      }
    }

    // Set default min/max if not provided
    let min = metadata.min;
    let max = metadata.max;
    if (metadata.type === "float" || metadata.type === "int") {
      if (min === undefined) min = 0;
      if (max === undefined) max = 1;
    }

    parameters.push({
      name: paramName,
      type: metadata.type,
      value,
      min,
      max,
      step: metadata.step,
      label: metadata.label || paramName,
      description: metadata.description,
    });
  }

  return parameters;
}

export function injectParameterDeclarations(
  fragmentShader: string,
  parameters: UniformParameter[]
): string {
  if (!parameters || parameters.length === 0) return fragmentShader;

  const lines = fragmentShader.split("\n");
  let insertIndex = 0;

  // Find the insertion point after precision statement
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim().startsWith("precision")) {
      insertIndex = i + 1;
      break;
    }
  }

  // Check which parameters are already declared
  const existingDeclarations = new Set<string>();
  for (const line of lines) {
    const match = line.match(/uniform\s+\w+\s+(\w+)/);
    if (match) {
      existingDeclarations.add(match[1]);
    }
  }

  // Build declarations for missing parameters
  const declarations: string[] = [];
  for (const param of parameters) {
    if (existingDeclarations.has(param.name)) continue;

    const uniformType = getUniformGLSLType(param.type);
    declarations.push(`uniform ${uniformType} ${param.name};`);
  }

  if (declarations.length === 0) return fragmentShader;

  // Insert declarations
  lines.splice(insertIndex, 0, ...declarations);
  return lines.join("\n");
}

function getUniformGLSLType(type: UniformType): string {
  const typeMap: Record<UniformType, string> = {
    float: "float",
    int: "int",
    vec2: "vec2",
    vec3: "vec3",
    vec4: "vec4",
    color: "vec3",
    texture: "sampler2D",
  };
  return typeMap[type] || "float";
}

export function normalizeColorToVec3(color: string): [number, number, number] {
  // Handle hex color strings
  if (color.startsWith("#")) {
    const hex = color.slice(1);
    const r = parseInt(hex.slice(0, 2), 16) / 255;
    const g = parseInt(hex.slice(2, 4), 16) / 255;
    const b = parseInt(hex.slice(4, 6), 16) / 255;
    return [r, g, b];
  }

  // Handle rgb/rgba strings
  const match = color.match(/rgba?\(([^)]+)\)/);
  if (match) {
    const values = match[1].split(",").map((v) => parseInt(v.trim()) / 255);
    return [values[0], values[1], values[2]];
  }

  // Default to white
  return [1, 1, 1];
}

export function vec3ToHexColor(vec: [number, number, number]): string {
  const r = Math.round(vec[0] * 255)
    .toString(16)
    .padStart(2, "0");
  const g = Math.round(vec[1] * 255)
    .toString(16)
    .padStart(2, "0");
  const b = Math.round(vec[2] * 255)
    .toString(16)
    .padStart(2, "0");
  return `#${r}${g}${b}`;
}
