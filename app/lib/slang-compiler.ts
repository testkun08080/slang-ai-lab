/**
 * Slang compiler integration for Slang AI Lab
 *
 * Architecture:
 *   - The canonical shader source is Slang.
 *   - Compilation (Slang -> WGSL / GLSL / HLSL / Metal / SPIR-V) is performed by
 *     the REAL Slang compiler running as WebAssembly in the browser. No server
 *     API and no AI translation is involved.
 *
 * The wasm build (slang-wasm.js + slang-wasm.wasm) is bundled under
 * `public/slang/` and loaded on demand from the client.
 *
 * Usage:
 *   import { loadSlang, compileSlangToWgsl } from '@/lib/slang-compiler'
 *   await loadSlang()
 *   const { code } = await compileSlangToWgsl(slangSource)
 */

export type SlangTarget = "wgsl" | "glsl" | "hlsl" | "spirv" | "metal";

export interface SlangCompileOptions {
  target: SlangTarget;
  /** Entry point function name. Defaults to "fragmentMain". */
  entryPoint?: string;
  /** Slang stage number. Defaults to fragment (5). Use STAGE_VERTEX for vertex. */
  stage?: number;
}

export interface SlangCompileResult {
  code: string;
  warnings: string[];
}

/** Slang stage enum values (from slang.h). */
export const STAGE_VERTEX = 1;
export const STAGE_FRAGMENT = 5;
export const STAGE_COMPUTE = 6;

/** Public path where the bundled wasm assets are served. */
const WASM_JS_URL = "/slang/slang-wasm.js";
const WASM_BINARY_URL = "/slang/slang-wasm.wasm";

/** Fallback SlangCompileTarget enum values if runtime lookup fails. */
const TARGET_FALLBACK: Record<string, number> = {
  GLSL: 2,
  HLSL: 5,
  SPIRV: 6,
  METAL: 24,
  WGSL: 28,
};

// Minimal shape of the embind objects we use. The full typings live in
// public/slang/slang-wasm.d.ts but that file is not part of the TS project.
type EmbindHandle = { delete?: () => void };
type SlangModuleInstance = {
  createGlobalSession: () => GlobalSession | null;
  getCompileTargets: () => { name: string; value: number }[];
  getVersionString: () => string;
  getLastError?: () => { type?: string; message?: string } | undefined;
};
type GlobalSession = EmbindHandle & {
  createSession: (target: number) => Session | null;
};
type Session = EmbindHandle & {
  loadModuleFromSource: (
    source: string,
    name: string,
    path: string,
  ) => SlangProgramModule | null;
  createCompositeComponentType: (
    components: EmbindHandle[],
  ) => ComponentType | null;
};
type SlangProgramModule = EmbindHandle & {
  findAndCheckEntryPoint: (name: string, stage: number) => EmbindHandle | null;
  findEntryPointByName?: (name: string) => EmbindHandle | null;
};
type ComponentType = EmbindHandle & {
  link: () => LinkedProgram | null;
};
type LinkedProgram = EmbindHandle & {
  getEntryPointCode: (entryPointIndex: number, targetIndex: number) => string;
  /** Whole-program code for the target (all linked entry points in one module). */
  getTargetCode: (targetIndex: number) => string;
};

let modulePromise: Promise<SlangModuleInstance> | null = null;
let slangModule: SlangModuleInstance | null = null;
let globalSession: GlobalSession | null = null;
let targetMap: Record<string, number> | null = null;

export class SlangCompileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SlangCompileError";
  }
}

/**
 * Dynamic import that hides the module URL from the bundler so it is fetched
 * at runtime from the public directory rather than being statically analyzed.
 */
function importRuntime(url: string): Promise<Record<string, unknown>> {
  const dynamicImport = new Function(
    "u",
    "return import(u)",
  ) as (u: string) => Promise<Record<string, unknown>>;
  return dynamicImport(url);
}

async function initModule(): Promise<SlangModuleInstance> {
  if (slangModule && globalSession) return slangModule;
  if (typeof window === "undefined") {
    throw new SlangCompileError("Slang compiler can only run in the browser");
  }
  if (!modulePromise) {
    modulePromise = (async () => {
      const mod = await importRuntime(WASM_JS_URL);
      const factory = (mod.default ?? mod) as (
        config?: Record<string, unknown>,
      ) => Promise<SlangModuleInstance>;
      if (typeof factory !== "function") {
        throw new SlangCompileError("slang-wasm module factory not found");
      }
      const instance = await factory({
        locateFile: (path: string) =>
          path.endsWith(".wasm") ? WASM_BINARY_URL : path,
      });
      const gs = instance.createGlobalSession();
      if (!gs) {
        throw new SlangCompileError("Failed to create Slang global session");
      }
      slangModule = instance;
      globalSession = gs;
      targetMap = {};
      try {
        for (const t of instance.getCompileTargets()) {
          targetMap[t.name.toUpperCase()] = t.value;
        }
      } catch {
        targetMap = { ...TARGET_FALLBACK };
      }
      return instance;
    })();
    // If initialization fails (e.g. a transient error fetching the wasm assets),
    // clear the cached promise so a later call can retry instead of being stuck.
    modulePromise = modulePromise.catch((e) => {
      modulePromise = null;
      slangModule = null;
      globalSession = null;
      targetMap = null;
      throw e;
    });
  }
  return modulePromise;
}

/** Eagerly load and initialize the Slang compiler. Returns false on failure. */
export async function loadSlang(): Promise<boolean> {
  try {
    await initModule();
    return true;
  } catch (e) {
    console.error("[slang-compiler] load failed", e);
    return false;
  }
}

export function isSlangReady(): boolean {
  return !!slangModule && !!globalSession;
}

export function getSlangVersion(): string {
  try {
    return slangModule?.getVersionString() ?? "";
  } catch {
    return "";
  }
}

function lastError(): string {
  try {
    const e = slangModule?.getLastError?.();
    return e?.message ?? "";
  } catch {
    return "";
  }
}

function targetValue(target: SlangTarget): number {
  const key = target.toUpperCase();
  return targetMap?.[key] ?? TARGET_FALLBACK[key];
}

/**
 * Compile Slang source to the requested target language using the in-browser
 * Slang compiler. Throws SlangCompileError with the compiler diagnostics on
 * failure.
 */
export async function compileSlang(
  source: string,
  options: SlangCompileOptions,
): Promise<SlangCompileResult> {
  await initModule();
  if (!globalSession || !slangModule) {
    throw new SlangCompileError("Slang compiler not initialized");
  }

  const entryName = options.entryPoint ?? "fragmentMain";
  const stage = options.stage ?? STAGE_FRAGMENT;

  const session = globalSession.createSession(targetValue(options.target));
  if (!session) {
    throw new SlangCompileError(lastError() || "Failed to create Slang session");
  }

  const disposables: EmbindHandle[] = [session];
  try {
    const slangProgram = session.loadModuleFromSource(source, "user", "/user.slang");
    if (!slangProgram) {
      throw new SlangCompileError(lastError() || "Slang compilation failed");
    }
    disposables.push(slangProgram);

    const entry =
      slangProgram.findAndCheckEntryPoint(entryName, stage) ??
      slangProgram.findEntryPointByName?.(entryName) ??
      null;
    if (!entry) {
      throw new SlangCompileError(
        lastError() || `Entry point '${entryName}' not found`,
      );
    }
    disposables.push(entry);

    const composite = session.createCompositeComponentType([slangProgram, entry]);
    if (!composite) {
      throw new SlangCompileError(
        lastError() || "Failed to create composite component type",
      );
    }
    disposables.push(composite);

    const linked = composite.link();
    if (!linked) {
      throw new SlangCompileError(lastError() || "Slang linking failed");
    }
    disposables.push(linked);

    const code = linked.getEntryPointCode(0, 0);
    if (!code) {
      throw new SlangCompileError(lastError() || "No code was generated");
    }
    return { code, warnings: [] };
  } finally {
    for (const obj of disposables.reverse()) {
      try {
        obj.delete?.();
      } catch {
        /* ignore cleanup errors */
      }
    }
  }
}

export interface SlangEntryPointSpec {
  /** Entry point function name in the Slang source. */
  name: string;
  /** Slang stage (STAGE_VERTEX / STAGE_FRAGMENT / STAGE_COMPUTE). */
  stage: number;
}

/**
 * Compile a whole Slang *program* (multiple entry points) into a single target
 * module. Unlike `compileSlang`, which emits code for one entry point, this
 * links all requested entry points together and returns the combined module via
 * `getTargetCode`, so a custom `@vertex` and `@fragment` share one uniform
 * layout / binding set — exactly what the WebGPU render pipeline needs.
 */
export async function compileSlangProgram(
  source: string,
  entryPoints: SlangEntryPointSpec[],
  options: SlangCompileOptions,
): Promise<SlangCompileResult> {
  await initModule();
  if (!globalSession || !slangModule) {
    throw new SlangCompileError("Slang compiler not initialized");
  }
  if (entryPoints.length === 0) {
    throw new SlangCompileError("At least one entry point is required");
  }

  const session = globalSession.createSession(targetValue(options.target));
  if (!session) {
    throw new SlangCompileError(lastError() || "Failed to create Slang session");
  }

  const disposables: EmbindHandle[] = [session];
  try {
    const slangProgram = session.loadModuleFromSource(source, "user", "/user.slang");
    if (!slangProgram) {
      throw new SlangCompileError(lastError() || "Slang compilation failed");
    }
    disposables.push(slangProgram);

    const components: EmbindHandle[] = [slangProgram];
    for (const ep of entryPoints) {
      const entry =
        slangProgram.findAndCheckEntryPoint(ep.name, ep.stage) ??
        slangProgram.findEntryPointByName?.(ep.name) ??
        null;
      if (!entry) {
        throw new SlangCompileError(
          lastError() || `Entry point '${ep.name}' not found`,
        );
      }
      disposables.push(entry);
      components.push(entry);
    }

    const composite = session.createCompositeComponentType(components);
    if (!composite) {
      throw new SlangCompileError(
        lastError() || "Failed to create composite component type",
      );
    }
    disposables.push(composite);

    const linked = composite.link();
    if (!linked) {
      throw new SlangCompileError(lastError() || "Slang linking failed");
    }
    disposables.push(linked);

    const code = linked.getTargetCode(0);
    if (!code) {
      throw new SlangCompileError(lastError() || "No code was generated");
    }
    return { code, warnings: [] };
  } finally {
    for (const obj of disposables.reverse()) {
      try {
        obj.delete?.();
      } catch {
        /* ignore cleanup errors */
      }
    }
  }
}

/**
 * Convenience: compile a Slang program that contains both a `vertexMain` and a
 * `fragmentMain` entry point into a single WGSL module (for WebGPU rendering
 * with a custom vertex stage).
 */
export function compileSlangProgramToWgsl(
  source: string,
  entryPoints: SlangEntryPointSpec[] = [
    { name: "vertexMain", stage: STAGE_VERTEX },
    { name: "fragmentMain", stage: STAGE_FRAGMENT },
  ],
): Promise<SlangCompileResult> {
  return compileSlangProgram(source, entryPoints, { target: "wgsl" });
}

/** Convenience: Slang fragment -> WGSL (for WebGPU rendering). */
export function compileSlangToWgsl(
  source: string,
  opts: Omit<SlangCompileOptions, "target"> = {},
): Promise<SlangCompileResult> {
  return compileSlang(source, { ...opts, target: "wgsl" });
}

/** Convenience: Slang -> GLSL. */
export function compileSlangToGlsl(
  source: string,
  opts: Omit<SlangCompileOptions, "target"> = {},
): Promise<SlangCompileResult> {
  return compileSlang(source, { ...opts, target: "glsl" });
}

/** Convenience: Slang -> HLSL. */
export function compileSlangToHlsl(
  source: string,
  opts: Omit<SlangCompileOptions, "target"> = {},
): Promise<SlangCompileResult> {
  return compileSlang(source, { ...opts, target: "hlsl" });
}

/** Convenience: Slang -> SPIR-V (text representation from the wasm compiler). */
export function compileSlangToSpirv(
  source: string,
  opts: Omit<SlangCompileOptions, "target"> = {},
): Promise<SlangCompileResult> {
  return compileSlang(source, { ...opts, target: "spirv" });
}

/** Convenience: Slang -> Metal Shading Language. */
export function compileSlangToMetal(
  source: string,
  opts: Omit<SlangCompileOptions, "target"> = {},
): Promise<SlangCompileResult> {
  return compileSlang(source, { ...opts, target: "metal" });
}

/** Compile a Slang program to the requested target (multi-entry-point). */
export function compileSlangProgramToTarget(
  source: string,
  target: SlangTarget,
  entryPoints: SlangEntryPointSpec[] = [
    { name: "vertexMain", stage: STAGE_VERTEX },
    { name: "fragmentMain", stage: STAGE_FRAGMENT },
  ],
): Promise<SlangCompileResult> {
  return compileSlangProgram(source, entryPoints, { target });
}
