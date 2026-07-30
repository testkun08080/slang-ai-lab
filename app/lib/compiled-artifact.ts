import type {
  CompileTarget,
  CompiledArtifact,
  RenderMode,
  SourceLanguage,
} from "@/lib/types";

export type { CompileTarget, CompiledArtifact, SourceLanguage };

export type CompileStatus = CompiledArtifact["status"];

export const COMPILE_TARGET_OPTIONS: {
  value: CompileTarget;
  label: string;
  description: string;
  /** Requires Slang source to produce real compiler output. */
  slangOnly?: boolean;
}[] = [
  { value: "wgsl", label: "WGSL", description: "WebGPU Shading Language", slangOnly: true },
  { value: "glsl", label: "GLSL", description: "OpenGL Shading Language" },
  { value: "hlsl", label: "HLSL", description: "DirectX High Level Shading Language", slangOnly: true },
  { value: "spirv", label: "SPIR-V", description: "Vulkan intermediate representation", slangOnly: true },
  { value: "metal", label: "Metal", description: "Apple Metal Shading Language", slangOnly: true },
];

export function getDefaultCompileTarget(
  sourceLanguage: SourceLanguage,
  renderMode: RenderMode,
): CompileTarget {
  if (sourceLanguage === "slang") {
    return renderMode === "2d" ? "wgsl" : "glsl";
  }
  if (sourceLanguage === "hlsl") return "hlsl";
  return "glsl";
}

export function getAvailableCompileTargets(sourceLanguage: SourceLanguage): CompileTarget[] {
  if (sourceLanguage === "slang") {
    return ["wgsl", "glsl", "hlsl", "spirv", "metal"];
  }
  if (sourceLanguage === "hlsl") return ["hlsl"];
  return ["glsl"];
}

export function compileTargetToEditorLanguage(
  target: CompileTarget,
): "glsl" | "hlsl" | "slang" {
  switch (target) {
    case "wgsl":
      return "slang";
    case "hlsl":
    case "metal":
      return "hlsl";
    case "glsl":
    case "spirv":
    default:
      return "glsl";
  }
}

export function getFileExtensionForTarget(
  target: CompileTarget,
  stage?: "vertex" | "fragment" | "module",
): string {
  switch (target) {
    case "wgsl":
      return stage === "vertex" ? "vert.wgsl" : stage === "fragment" ? "frag.wgsl" : "wgsl";
    case "hlsl":
      return stage === "vertex" ? "vert.hlsl" : stage === "fragment" ? "frag.hlsl" : "hlsl";
    case "metal":
      return stage === "vertex" ? "vert.metal" : stage === "fragment" ? "frag.metal" : "metal";
    case "spirv":
      return stage === "vertex" ? "vert.spv" : stage === "fragment" ? "frag.spv" : "spv";
    case "glsl":
    default:
      return stage === "vertex" ? "vert" : stage === "fragment" ? "frag" : "glsl";
  }
}

export function createEmptyArtifact(
  sourceLanguage: SourceLanguage,
  targetLanguage: CompileTarget,
  renderMode: RenderMode,
): CompiledArtifact {
  return {
    sourceLanguage,
    targetLanguage,
    renderMode,
    status: "idle",
    warnings: [],
    errors: [],
    timestamp: Date.now(),
  };
}

export function buildGlslPassthroughArtifact(
  sourceLanguage: SourceLanguage,
  renderMode: RenderMode,
  vertexShader: string,
  fragmentShader: string,
  logs?: { compileLog?: string; linkLog?: string; errors?: string[] },
): CompiledArtifact {
  return {
    sourceLanguage,
    targetLanguage: "glsl",
    renderMode,
    status: logs?.errors?.length ? "error" : "success",
    vertexOutput: vertexShader,
    fragmentOutput: fragmentShader,
    compileLog: logs?.compileLog,
    linkLog: logs?.linkLog,
    warnings: [],
    errors: logs?.errors ?? [],
    timestamp: Date.now(),
  };
}

export function buildHlslPassthroughArtifact(
  sourceLanguage: SourceLanguage,
  renderMode: RenderMode,
  vertexShader: string,
  fragmentShader: string,
): CompiledArtifact {
  return {
    sourceLanguage,
    targetLanguage: "hlsl",
    renderMode,
    status: "success",
    vertexOutput: vertexShader,
    fragmentOutput: fragmentShader,
    warnings: sourceLanguage !== "hlsl"
      ? ["HLSL export is a direct copy of source; no cross-compilation was performed."]
      : [],
    errors: [],
    timestamp: Date.now(),
  };
}

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "shader";
}

function triggerDownload(filename: string, content: string, mime = "text/plain"): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export type ExportLanguage = CompileTarget | "slang";

export const SLANG_EXPORT_OPTIONS: {
  value: ExportLanguage;
  label: string;
  description: string;
}[] = [
  { value: "slang", label: "Slang (source)", description: "Canonical .slang source file" },
  ...COMPILE_TARGET_OPTIONS.map((opt) => ({
    value: opt.value as ExportLanguage,
    label: opt.label,
    description: opt.description,
  })),
];

export function getDefaultExportLanguage(
  sourceLanguage: SourceLanguage,
  renderMode: RenderMode,
): ExportLanguage {
  if (sourceLanguage === "slang") {
    return getDefaultCompileTarget(sourceLanguage, renderMode);
  }
  if (sourceLanguage === "hlsl") return "hlsl";
  return "glsl";
}

export function downloadSlangSource(slangSource: string, projectName: string): void {
  const base = sanitizeFilename(projectName);
  triggerDownload(`${base}-source-${Date.now()}.slang`, slangSource);
}

export function downloadArtifactFromExport(
  artifact: CompiledArtifact,
  projectName: string,
): void {
  if (artifact.singleOutput?.trim()) {
    downloadCompiledArtifact(artifact, projectName, "module");
    return;
  }
  downloadCompiledArtifact(artifact, projectName, "fragment");
  if (artifact.vertexOutput?.trim()) {
    downloadCompiledArtifact(artifact, projectName, "vertex");
  }
}

export function downloadCompiledArtifact(
  artifact: CompiledArtifact,
  projectName: string,
  stage: "vertex" | "fragment" | "module" = "fragment",
): void {
  const base = sanitizeFilename(projectName);
  const ts = artifact.timestamp || Date.now();
  const target = artifact.targetLanguage;

  if (stage === "module" && artifact.singleOutput) {
    triggerDownload(
      `${base}-${target}-${ts}.${getFileExtensionForTarget(target, "module")}`,
      artifact.singleOutput,
    );
    return;
  }

  const code =
    stage === "vertex"
      ? artifact.vertexOutput
      : artifact.fragmentOutput;
  if (!code) return;

  triggerDownload(
    `${base}-${target}-${stage}-${ts}.${getFileExtensionForTarget(target, stage)}`,
    code,
  );
}

export function downloadArtifactMetadata(
  artifact: CompiledArtifact,
  projectName: string,
  extra?: Record<string, unknown>,
): void {
  const payload = {
    projectName,
    exportedAt: new Date().toISOString(),
    artifact,
    ...extra,
  };
  triggerDownload(
    `${sanitizeFilename(projectName)}-compile-metadata-${artifact.timestamp || Date.now()}.json`,
    JSON.stringify(payload, null, 2),
    "application/json",
  );
}
