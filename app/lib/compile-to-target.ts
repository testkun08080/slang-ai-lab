import {
  compileSlang,
  compileSlangProgram,
  compileSlangProgramToTarget,
  compileSlangToGlsl,
  compileSlangToHlsl,
  compileSlangToMetal,
  compileSlangToSpirv,
  compileSlangToWgsl,
  STAGE_FRAGMENT,
  STAGE_VERTEX,
  type SlangTarget,
} from "@/lib/slang-compiler";
import { normalizeSlangSource, slangHasVertexEntry } from "@/lib/slang-normalize";
import type { CompileTarget, CompiledArtifact, RenderMode, SourceLanguage, WebGLCompileReport } from "@/lib/types";
import { createEmptyArtifact } from "@/lib/compiled-artifact";

function slangTargetFromCompileTarget(target: CompileTarget): SlangTarget {
  return target;
}

export async function compileSlangSourceToTarget(
  slangSource: string,
  target: CompileTarget,
  renderMode: RenderMode,
): Promise<CompiledArtifact> {
  const base = createEmptyArtifact("slang", target, renderMode);
  const src = slangSource.trim();
  if (!src) {
    return { ...base, status: "idle" };
  }

  const normalized = normalizeSlangSource(slangSource);
  const hasVertex = slangHasVertexEntry(normalized);

  try {
    if (target === "wgsl") {
      if (hasVertex) {
        const { code, warnings } = await compileSlangProgramToTarget(normalized, "wgsl");
        return {
          ...base,
          status: "success",
          singleOutput: code,
          warnings,
          errors: [],
          timestamp: Date.now(),
        };
      }
      const { code, warnings } = await compileSlangToWgsl(normalized);
      return {
        ...base,
        status: "success",
        singleOutput: code,
        warnings,
        errors: [],
        timestamp: Date.now(),
      };
    }

    if (target === "glsl" || target === "hlsl" || target === "metal" || target === "spirv") {
      const compileEntry = async (entryPoint: string, stage: number) => {
        const fn =
          target === "glsl"
            ? compileSlangToGlsl
            : target === "hlsl"
              ? compileSlangToHlsl
              : target === "metal"
                ? compileSlangToMetal
                : compileSlangToSpirv;
        return fn(normalized, { entryPoint, stage });
      };

      const fragmentResult = await compileEntry("fragmentMain", STAGE_FRAGMENT);
      if (!hasVertex) {
        return {
          ...base,
          status: "success",
          fragmentOutput: fragmentResult.code,
          warnings: fragmentResult.warnings,
          errors: [],
          timestamp: Date.now(),
        };
      }

      const vertexResult = await compileEntry("vertexMain", STAGE_VERTEX);
      return {
        ...base,
        status: "success",
        vertexOutput: vertexResult.code,
        fragmentOutput: fragmentResult.code,
        warnings: [...vertexResult.warnings, ...fragmentResult.warnings],
        errors: [],
        timestamp: Date.now(),
      };
    }

    // Fallback: program compile for unknown future targets
    const entries = hasVertex
      ? [
          { name: "vertexMain", stage: STAGE_VERTEX },
          { name: "fragmentMain", stage: STAGE_FRAGMENT },
        ]
      : [{ name: "fragmentMain", stage: STAGE_FRAGMENT }];
    const { code, warnings } = await compileSlangProgram(
      normalized,
      entries,
      { target: slangTargetFromCompileTarget(target) },
    );
    return {
      ...base,
      status: "success",
      singleOutput: code,
      warnings,
      errors: [],
      timestamp: Date.now(),
    };
  } catch (e) {
    return {
      ...base,
      status: "error",
      errors: [(e as Error).message],
      warnings: [],
      timestamp: Date.now(),
    };
  }
}

export function buildArtifactFromWebGLReport(
  sourceLanguage: SourceLanguage,
  renderMode: RenderMode,
  report: WebGLCompileReport,
): CompiledArtifact {
  const logs = [
    report.vertexCompileLog ? `Vertex: ${report.vertexCompileLog}` : "",
    report.fragmentCompileLog ? `Fragment: ${report.fragmentCompileLog}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  return {
    sourceLanguage,
    targetLanguage: "glsl",
    renderMode,
    status: report.success ? "success" : "error",
    vertexOutput: report.vertexSource,
    fragmentOutput: report.fragmentSource,
    compileLog: logs || undefined,
    linkLog: report.linkLog,
    warnings: [],
    errors: report.success
      ? []
      : [report.errorMessage ?? "WebGL shader compilation failed"],
    timestamp: Date.now(),
  };
}
