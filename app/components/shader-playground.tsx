"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Download,
  Copy,
  Check,
  Code,
  MessageSquare,
  Layers,
  Play,
  Pause,
  RotateCcw,
  X,
  Image as ImageIcon,
  FolderOpen,
  ChevronDown,
  Maximize,
  Minimize,
  Send,
  Settings,
  Box,
  FileOutput,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { ShaderCanvas, ShaderCanvasHandle } from "@/components/shader-canvas";
import { WebGPUCanvas } from "@/components/webgpu-canvas";
import { CompiledOutputPanel } from "@/components/compiled-output-panel";
import {
  defaultSlangShader,
  defaultSlangShader3D,
  SLANG_PALETTE_FLOW,
  DEFAULT_SLANG_FRAGMENT_3D,
  findSlangTemplateBySource,
  type SlangShaderTemplatePreset,
} from "@/lib/slang-templates";
import { loadSlang, compileSlangToWgsl, compileSlangToGlsl, compileSlangProgramToWgsl, STAGE_VERTEX, STAGE_FRAGMENT } from "@/lib/slang-compiler";
import { normalizeSlangSource, slangHasVertexEntry, parseVertexCountDirective } from "@/lib/slang-normalize";
import { CodeEditor } from "@/components/code-editor";
import { AIChatPanel, AIChatPanelHandle } from "@/components/ai-chat-panel";
import { HistoryPanel } from "@/components/history-panel";
import { SettingsPanel } from "@/components/settings-panel";
import { TexturePanel } from "@/components/texture-panel";
import { ParameterPanel } from "@/components/parameter-panel";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  DEFAULT_AI_MODEL_ID,
  DEFAULT_VERTEX_SHADER_3D_GLSL,
  DEFAULT_VERTEX_SHADER_GLSL,
  DEPRECATED_AI_MODEL_IDS,
} from "@/lib/types";
import { getMeshPresetOptions } from "@/lib/mesh-presets";
import { parseObjToMeshData } from "@/lib/obj-parser";
import { parseParametersFromShader, injectParameterDeclarations } from "@/lib/parameter-parser";
import {
  createEmptyArtifact,
  downloadArtifactMetadata,
  downloadArtifactFromExport,
  downloadSlangSource,
  getDefaultCompileTarget,
  getDefaultExportLanguage,
  buildGlslPassthroughArtifact,
  buildHlslPassthroughArtifact,
  SLANG_EXPORT_OPTIONS,
  type ExportLanguage,
} from "@/lib/compiled-artifact";
import {
  buildArtifactFromWebGLReport,
  compileSlangSourceToTarget,
} from "@/lib/compile-to-target";
import {
  computeDesktopPanelLayout,
  type PanelLayoutRect,
} from "@/lib/desktop-panel-layout";
import type {
  MeshData,
  MeshPresetId,
  MeshSource,
  ShaderProject,
  AISettings,
  AIShaderHistoryEntry,
  RenderMode,
  TextureSlot,
  UniformParameter,
  CompileTarget,
  CompiledArtifact,
  SourceLanguage,
  WebGLCompileReport,
} from "@/lib/types";

const generateId = () => crypto.randomUUID();

const ENABLE_3D_PREVIEW = true;

const DEFAULT_MESH_SOURCE: MeshSource = { kind: "preset", presetId: "cube" };

const DEFAULT_GLSL_FALLBACK = SLANG_PALETTE_FLOW.glsl;

function panelLayoutStyle(rect?: PanelLayoutRect): React.CSSProperties | undefined {
  if (!rect) return undefined;
  return {
    top: rect.top,
    left: rect.left,
    right: rect.right,
    width: rect.width,
    height: rect.height,
  };
}

function is3DOnlyVertexShader(source: string) {
  return /\b(a_normal|u_modelViewMatrix|u_projectionMatrix|u_normalMatrix|v_normal|v_position)\b/.test(source);
}

function is3DOnlyFragmentShader(source: string) {
  return /\b(v_normal|v_position|u_modelViewMatrix|u_projectionMatrix|u_normalMatrix)\b/.test(source);
}

/**
 * Validate and coerce the raw `slang-ai-lab-projects` localStorage payload into a
 * well-formed ShaderProject[]. Malformed entries are dropped and the language
 * enum is constrained to the allowed values (preserving slang/hlsl).
 */
function sanitizeStoredProjects(raw: unknown): ShaderProject[] {
  if (!Array.isArray(raw)) return [];
  const out: ShaderProject[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const p = item as Record<string, unknown>;
    if (
      typeof p.id !== "string" ||
      typeof p.name !== "string" ||
      typeof p.vertexShader !== "string" ||
      typeof p.fragmentShader !== "string"
    ) {
      continue;
    }
    const language: ShaderProject["language"] =
      p.language === "slang" ? "slang" : p.language === "hlsl" ? "hlsl" : "glsl";
    const compileTarget: CompileTarget | undefined =
      p.compileTarget === "wgsl" ||
      p.compileTarget === "glsl" ||
      p.compileTarget === "hlsl" ||
      p.compileTarget === "spirv" ||
      p.compileTarget === "metal"
        ? p.compileTarget
        : undefined;
    const now = Date.now();
    out.push({
      ...(p as unknown as ShaderProject),
      id: p.id,
      name: p.name,
      vertexShader: p.vertexShader,
      fragmentShader: p.fragmentShader,
      language,
      compileTarget,
      renderMode: p.renderMode === "3d" ? "3d" : "2d",
      createdAt: typeof p.createdAt === "number" ? p.createdAt : now,
      updatedAt: typeof p.updatedAt === "number" ? p.updatedAt : now,
      slangSource: typeof p.slangSource === "string" ? p.slangSource : undefined,
    });
  }
  return out;
}

const defaultSettings: AISettings = {
  model: DEFAULT_AI_MODEL_ID,
  apiKey: "",
  useCustomKey: false,
};

interface DeletedProjectSnapshot {
  project: ShaderProject;
  index: number;
  textures: TextureSlot[];
  aiHistory: AIShaderHistoryEntry[];
  renderMode: RenderMode;
  meshSource: MeshSource;
  meshData: MeshData;
  parameters?: UniformParameter[];
}

function mergeParsedParameters(
  parsed: UniformParameter[],
  previous: UniformParameter[],
): UniformParameter[] {
  const prevByName = new Map(previous.map((param) => [param.name, param]));
  return parsed.map((param) => {
    const prev = prevByName.get(param.name);
    if (!prev || prev.type !== param.type) return param;
    return { ...param, value: prev.value };
  });
}

// ── Dark theme CSS variable overrides for float panels ───────────────────────
const DARK_PANEL_VARS: React.CSSProperties = {
  "--background": "transparent",
  "--foreground": "#e8dcc4",
  "--card": "rgba(20,16,12,0.82)",
  "--card-foreground": "#e8dcc4",
  "--muted": "rgba(255,245,220,0.08)",
  "--muted-foreground": "rgba(232,220,196,0.55)",
  "--border": "rgba(255,245,220,0.12)",
  "--input": "rgba(255,245,220,0.08)",
  "--primary": "#fbbf24",
  "--primary-foreground": "#0d0b08",
  "--accent": "rgba(255,245,220,0.1)",
  "--accent-foreground": "#e8dcc4",
  "--secondary": "rgba(255,245,220,0.08)",
  "--secondary-foreground": "#e8dcc4",
  "--destructive": "#f87171",
  "--destructive-foreground": "#0d0b08",
} as React.CSSProperties;

// ── Floating UI primitives ────────────────────────────────────────────────────

function FloatChip({
  children,
  onClick,
  className,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  className?: string;
}) {
  return (
    <div
      className={cn("float-chip text-sm cursor-default select-none", className)}
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => { if (e.key === "Enter" || e.key === " ") onClick(); } : undefined}
    >
      {children}
    </div>
  );
}

function TogglePill({
  active,
  onClick,
  children,
  testId,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  testId?: string;
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      onClick={onClick}
      className={cn(
        "float-chip text-xs font-medium transition-colors",
        active ? "toggle-pill-active" : "hover:bg-[rgba(255,245,220,0.08)]",
      )}
    >
      {children}
    </button>
  );
}

function DockBtn({
  onClick,
  children,
  title,
  active,
}: {
  onClick?: () => void;
  children: React.ReactNode;
  title?: string;
  active?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={cn(
        "w-[30px] h-[30px] border-none rounded-full cursor-pointer flex items-center justify-center transition-colors",
        active
          ? "bg-[rgba(255,245,220,0.2)] text-[#e8dcc4]"
          : "bg-transparent text-[#e8dcc4] hover:bg-[rgba(255,245,220,0.1)]",
      )}
    >
      {children}
    </button>
  );
}

function FloatPanel({
  title,
  subtitle,
  children,
  onClose,
  tone,
  style,
  className,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  onClose: () => void;
  tone?: "code";
  style?: React.CSSProperties;
  className?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.97, y: -4 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97, y: -4 }}
      transition={{ duration: 0.15, ease: "easeOut" }}
      className={cn(
        "float-panel absolute flex flex-col overflow-hidden",
        tone === "code" && "float-panel-code",
        className,
      )}
      style={style}
    >
      {/* Panel header */}
      <div
        className="flex items-center px-3.5 py-2.5 shrink-0"
        style={{ borderBottom: "1px solid rgba(255,245,220,0.1)" }}
      >
        <div>
          <div className="text-xs font-semibold text-[#e8dcc4]">{title}</div>
          {subtitle && (
            <div className="text-[10px] opacity-55 font-mono text-[#e8dcc4] mt-0.5">
              {subtitle}
            </div>
          )}
        </div>
        <div className="flex-1" />
        <button
          onClick={onClose}
          aria-label="Close panel"
          className="w-[22px] h-[22px] flex items-center justify-center rounded bg-transparent border-none text-[#e8dcc4] opacity-60 hover:opacity-100 cursor-pointer transition-opacity"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
      {children}
    </motion.div>
  );
}

// ── Logo mark ─────────────────────────────────────────────────────────────────
function LogoMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" className="shrink-0">
      <path
        d="M12 2L2 7V17L12 22L22 17V7L12 2Z"
        stroke="#e8dcc4"
        strokeWidth="1.5"
        fill="none"
      />
      <path d="M12 6L6 9V15L12 18L18 15V9L12 6Z" fill="#e8dcc4" opacity="0.3" />
      <path d="M12 10L9 11.5V14.5L12 16L15 14.5V11.5L12 10Z" fill="#e8dcc4" />
    </svg>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export function ShaderPlayground() {
  const meshPresetOptions = getMeshPresetOptions();
  const [projects, setProjects] = useState<ShaderProject[]>([]);
  const [projectTextures, setProjectTextures] = useState<Record<string, TextureSlot[]>>({});
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);
  const [vertexShader, setVertexShader] = useState(DEFAULT_VERTEX_SHADER_GLSL);
  const [fragmentShader, setFragmentShader] = useState("");
  // Canonical Slang source for slang projects (edited in the editor, compiled to WGSL).
  const [slangSource, setSlangSource] = useState<string>("");
  // Compiled GLSL from Slang for 3D WebGL preview.
  const [slangGlslVertex, setSlangGlslVertex] = useState("");
  const [slangGlslFragment, setSlangGlslFragment] = useState("");
  // Compiled WGSL fed to the WebGPU renderer.
  const [wgslCode, setWgslCode] = useState<string>("");
  // Custom vertex stage for the WebGPU renderer (when the Slang source declares
  // a [shader("vertex")] entry point). null => built-in fullscreen triangle.
  const [wgslVertexEntry, setWgslVertexEntry] = useState<string | null>(null);
  const [wgslVertexCount, setWgslVertexCount] = useState<number>(3);
  const [slangError, setSlangError] = useState<string | null>(null);
  // True while an AI generation request is in flight (network + streaming).
  const [aiGenerating, setAiGenerating] = useState(false);
  // The project whose Slang code is currently streaming in from the AI, or null.
  const [streamingProjectId, setStreamingProjectId] = useState<string | null>(null);
  const [renderMode, setRenderMode] = useState<RenderMode>("2d");
  const [meshSource, setMeshSource] = useState<MeshSource>({ kind: "preset", presetId: "cube" });
  const [meshData, setMeshData] = useState<MeshData>(meshPresetOptions[0].mesh);
  const [meshError, setMeshError] = useState<string | null>(null);
  const [textures, setTextures] = useState<TextureSlot[]>([]);
  const [parameters, setParameters] = useState<UniformParameter[]>([]);
  const [isParametersPanelOpen, setIsParametersPanelOpen] = useState(true);
  const [isTexturesPanelOpen, setIsTexturesPanelOpen] = useState(true);
  const [isPlaying, setIsPlaying] = useState(true);
  const [speed, setSpeed] = useState(1.0);
  const [copiedFragment, setCopiedFragment] = useState(false);
  const [copiedVertex, setCopiedVertex] = useState(false);
  const [editorTab, setEditorTab] = useState<"fragment" | "vertex">("fragment");
  const [settings, setSettings] = useState<AISettings>(defaultSettings);
  const canvasRef = useRef<ShaderCanvasHandle>(null);
  const chatRef = useRef<AIChatPanelHandle>(null);
  const lastCompiledSlangRef = useRef<string>("");
  const lastCompiledSlang3dRef = useRef<string>("");
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [exportLanguage, setExportLanguage] = useState<ExportLanguage>("wgsl");
  const [exportIncludeMetadata, setExportIncludeMetadata] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [compiledArtifact, setCompiledArtifact] = useState<CompiledArtifact>(() =>
    createEmptyArtifact("slang", "wgsl", "2d"),
  );
  const webglCompileReportRef = useRef<WebGLCompileReport | null>(null);
  const [viewportSize, setViewportSize] = useState({ width: 1280, height: 800 });

  // True while the current project's Slang code is streaming in from the AI.
  const streamingCode =
    streamingProjectId !== null && streamingProjectId === currentProjectId;

  // HUD state
  const [fps, setFps] = useState(0);
  const [canvasSize, setCanvasSize] = useState({ w: 0, h: 0 });
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  // Fullscreen state
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Unified bottom bar: prompt open/close
  const [promptOpen, setPromptOpen] = useState(false);
  const [promptInput, setPromptInput] = useState("");

  const handleFpsUpdate = useCallback((f: number, w: number, h: number, mx: number, my: number) => {
    setFps(f);
    setCanvasSize({ w, h });
    setMousePos({ x: mx, y: my });
  }, [meshPresetOptions]);

  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  }, [meshPresetOptions]);

  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, [meshPresetOptions]);

  const handlePromptSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!promptInput.trim()) return;
    const text = promptInput;
    setPromptInput("");
    chatRef.current?.submitPrompt(text);
  }, [promptInput]);

  const [aiShaderHistoryByProject, setAiShaderHistoryByProject] = useState<
    Record<string, AIShaderHistoryEntry[]>
  >({});
  const deletedUndoStackRef = useRef<DeletedProjectSnapshot[]>([]);
  const deletedRedoStackRef = useRef<DeletedProjectSnapshot[]>([]);

  // Floating panels visibility
  const [panels, setPanels] = useState({
    projects: false,
    chat: true,
    code: true,
    compiled: false,
    textures: false,
    model3d: true,
  });
  const togglePanel = (key: keyof typeof panels) =>
    setPanels((p) => ({ ...p, [key]: !p[key] }));

  // Mobile tab
  const [mobileTabIndex, setMobileTabIndex] = useState<"ai" | "editor" | "textures" | "projects" | "model3d" | "compiled">("editor");
  const [showMobilePanel, setShowMobilePanel] = useState(true);
  const [isDesktop, setIsDesktop] = useState(false);

  // ── localStorage ─────────────────────────────────────────────────────────

  useEffect(() => {
    try {
      const savedProjects = localStorage.getItem("slang-ai-lab-projects");
      const savedProjectTextures = localStorage.getItem("slang-ai-lab-project-textures");
      const savedSettings = localStorage.getItem("slang-ai-lab-settings");

      if (savedProjects) {
        // Validate/coerce the persisted payload before trusting it as state.
        const normalized = sanitizeStoredProjects(JSON.parse(savedProjects));
        const migratedTextures: Record<string, TextureSlot[]> = {};
        for (const p of normalized) {
          if (p.textures && p.textures.length > 0) {
            migratedTextures[p.id] = p.textures;
          }
        }
        const sorted = [...normalized].sort((a, b) => b.updatedAt - a.updatedAt);
        setProjects(sorted);
        if (sorted.length > 0) {
          const latest = sorted[0];
          setCurrentProjectId(latest.id);
          setVertexShader(latest.vertexShader);
          setFragmentShader(latest.fragmentShader);
          setSlangSource(
            latest.language === "slang"
              ? (latest.slangSource ?? defaultSlangShader)
              : "",
          );
          setWgslCode("");
          lastCompiledSlangRef.current = "";
          lastCompiledSlang3dRef.current = "";
          setRenderMode(ENABLE_3D_PREVIEW ? (latest.renderMode || "2d") : "2d");
          const sourceLang: SourceLanguage =
            latest.language === "slang"
              ? "slang"
              : latest.language === "hlsl"
                ? "hlsl"
                : "glsl";
          const previewTarget = getDefaultCompileTarget(sourceLang, latest.renderMode || "2d");
          setCompiledArtifact(createEmptyArtifact(sourceLang, previewTarget, latest.renderMode || "2d"));
          const latestMeshSource = latest.meshSource ?? { kind: "preset", presetId: "cube" as const };
          setMeshSource(latestMeshSource);
          if (latestMeshSource.kind === "preset") {
            const preset = meshPresetOptions.find((o) => o.id === latestMeshSource.presetId) ?? meshPresetOptions[0];
            setMeshData(preset.mesh);
            setMeshError(null);
          } else {
            const parsedMesh = parseObjToMeshData(latestMeshSource.objText);
            if (parsedMesh.ok) {
              setMeshData(parsedMesh.mesh);
              setMeshError(null);
            } else {
              setMeshData(meshPresetOptions[0].mesh);
              setMeshError(parsedMesh.error);
            }
          }
          const savedTextures = savedProjectTextures
            ? (JSON.parse(savedProjectTextures) as Record<string, TextureSlot[]>)[latest.id]
            : undefined;
          const textureSource = savedTextures || migratedTextures[latest.id] || latest.textures;
          if (textureSource) setTextures(textureSource);
        }
        if (savedProjectTextures) {
          setProjectTextures(JSON.parse(savedProjectTextures) as Record<string, TextureSlot[]>);
        } else {
          setProjectTextures(migratedTextures);
        }
      } else {
        setSlangSource(defaultSlangShader);
      }

      if (savedSettings) {
        const parsedSettings = JSON.parse(savedSettings) as AISettings;
        // Groq decommissions models over time; remap stored ids that no longer
        // exist so generation doesn't fail with "model not found".
        if (DEPRECATED_AI_MODEL_IDS.includes(parsedSettings.model)) {
          parsedSettings.model = DEFAULT_AI_MODEL_ID;
        }
        setSettings(parsedSettings);
      }
    } catch (e) {
      console.error("Failed to restore state from localStorage:", e);
    }

    const savedAiHistory = localStorage.getItem("slang-ai-lab-ai-shader-history");
    if (savedAiHistory) {
      try {
        const parsed = JSON.parse(savedAiHistory) as Record<string, AIShaderHistoryEntry[]>;
        if (parsed && typeof parsed === "object") setAiShaderHistoryByProject(parsed);
      } catch { /* ignore */ }
    }
  }, []);

  useEffect(() => {
    if (projects.length > 0) {
      const compactProjects = projects.map((p) => ({ ...p, textures: undefined }));
      localStorage.setItem("slang-ai-lab-projects", JSON.stringify(compactProjects));
    }
  }, [projects]);

  useEffect(() => {
    try {
      localStorage.setItem("slang-ai-lab-project-textures", JSON.stringify(projectTextures));
    } catch {
      toast.warning("Storage is running low. Textures may be lost after reloading the page.", { duration: 6000 });
    }
  }, [projectTextures]);

  useEffect(() => {
    localStorage.setItem("slang-ai-lab-settings", JSON.stringify(settings));
  }, [settings]);

  useEffect(() => {
    try {
      localStorage.setItem("slang-ai-lab-ai-shader-history", JSON.stringify(aiShaderHistoryByProject));
    } catch { /* quota */ }
  }, [aiShaderHistoryByProject]);

  useEffect(() => {
    const proj = projects.find((p) => p.id === currentProjectId);
    const isSlang = proj ? proj.language === "slang" : slangSource.trim() !== "";
    // The .vert tab only exists for legacy GLSL 3D projects; drop out of it for
    // 2D and for Slang (whose vertex stage lives in the .slang source).
    if ((!ENABLE_3D_PREVIEW || renderMode === "2d" || isSlang) && editorTab === "vertex") {
      setEditorTab("fragment");
    }
  }, [renderMode, editorTab, currentProjectId, projects, slangSource]);

  useEffect(() => {
    const update = () => {
      setViewportSize({ width: window.innerWidth, height: window.innerHeight });
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const update = () => setIsDesktop(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if ((!ENABLE_3D_PREVIEW || renderMode !== "3d") && mobileTabIndex === "model3d") {
      setMobileTabIndex("editor");
    }
  }, [mobileTabIndex, renderMode]);

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;

      if (exportDialogOpen) {
        setExportDialogOpen(false);
        return;
      }
      if (!isDesktop && showMobilePanel) {
        setShowMobilePanel(false);
        return;
      }
      if (panels.projects) {
        setPanels((prev) => ({ ...prev, projects: false }));
        return;
      }
      if (panels.textures) {
        setPanels((prev) => ({ ...prev, textures: false }));
        return;
      }
      if (promptOpen) {
        setPromptOpen(false);
        return;
      }
      if (panels.code) {
        setPanels((prev) => ({ ...prev, code: false }));
        return;
      }
      if (panels.compiled) {
        setPanels((prev) => ({ ...prev, compiled: false }));
      }
    };

    window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, [exportDialogOpen, isDesktop, showMobilePanel, panels, promptOpen]);

  // ── Project actions ───────────────────────────────────────────────────────

  const saveCurrentProject = useCallback(() => {
    if (!currentProjectId) return;
    const project = projects.find((p) => p.id === currentProjectId);
    const isSlang =
      project?.language === "slang"
        ? true
        : project?.language === "glsl"
          ? false
          : slangSource.trim() !== "";
    setProjects((prev) =>
      prev.map((p) =>
        p.id === currentProjectId
          ? {
              ...p,
              vertexShader,
              fragmentShader: isSlang ? p.fragmentShader : fragmentShader,
              slangSource: isSlang ? slangSource : p.slangSource,
              language: isSlang ? "slang" : (p.language ?? "glsl"),
              renderMode: ENABLE_3D_PREVIEW ? renderMode : (p.renderMode === "3d" ? p.renderMode : "2d"),
              meshSource: ENABLE_3D_PREVIEW ? meshSource : p.meshSource,
              parameters,
              updatedAt: Date.now(),
            }
          : p,
      ),
    );
    setProjectTextures((prev) => ({ ...prev, [currentProjectId]: textures }));
  }, [currentProjectId, vertexShader, fragmentShader, slangSource, renderMode, meshSource, textures, parameters, projects]);

  useEffect(() => {
    // Don't persist half-written source while the AI is streaming code in —
    // wait for the final payload to land.
    if (streamingCode) return;
    const timer = setTimeout(saveCurrentProject, 1000);
    return () => clearTimeout(timer);
  }, [saveCurrentProject, streamingCode]);

  // Auto-parse parameters when shader source changes (manual editing)
  // (effect placed after isSlangProject is derived — see below)

  const handleNewProject = (mode: RenderMode) => {
    saveCurrentProject();
    const is3DProject = mode === "3d";
    const nextSlang = is3DProject ? defaultSlangShader3D : defaultSlangShader;
    const newProject: ShaderProject = {
      id: generateId(),
      name: `${is3DProject ? "3D" : "2D"} Shader ${projects.length + 1}`,
      vertexShader: is3DProject ? DEFAULT_VERTEX_SHADER_3D_GLSL : DEFAULT_VERTEX_SHADER_GLSL,
      fragmentShader: "",
      slangSource: nextSlang,
      language: "slang",
      renderMode: mode,
      meshSource: DEFAULT_MESH_SOURCE,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      parameters: [],
    };
    setProjects((prev) => [newProject, ...prev]);
    setCurrentProjectId(newProject.id);
    setVertexShader(newProject.vertexShader);
    setFragmentShader("");
    setSlangSource(nextSlang);
    const previewTarget = getDefaultCompileTarget("slang", mode);
    setCompiledArtifact(createEmptyArtifact("slang", previewTarget, mode));
    setRenderMode(mode);
    setEditorTab("fragment");
    setParameters([]);
    setMeshSource(DEFAULT_MESH_SOURCE);
    setMeshData(meshPresetOptions[0].mesh);
    setMeshError(null);
  };

  const handleSelectProject = (project: ShaderProject) => {
    if (project.id !== currentProjectId) {
      saveCurrentProject();
    }
    setCurrentProjectId(project.id);
    setVertexShader(project.vertexShader);
    setFragmentShader(project.fragmentShader);
    setSlangSource(
      project.language === "slang"
        ? (project.slangSource ?? defaultSlangShader)
        : "",
    );
    setRenderMode(ENABLE_3D_PREVIEW ? (project.renderMode || "2d") : "2d");
    const sourceLang: SourceLanguage =
      project.language === "slang"
        ? "slang"
        : project.language === "hlsl"
          ? "hlsl"
          : "glsl";
    const previewTarget =
      getDefaultCompileTarget(sourceLang, project.renderMode || "2d");
    setCompiledArtifact(createEmptyArtifact(sourceLang, previewTarget, project.renderMode || "2d"));
    if (project.textures) {
      setTextures(projectTextures[project.id] || project.textures);
    } else {
      setTextures(projectTextures[project.id] || []);
    }
    setParameters(project.parameters || []);
    const nextMeshSource = project.meshSource ?? { kind: "preset", presetId: "cube" as const };
    setMeshSource(nextMeshSource);
    if (nextMeshSource.kind === "preset") {
      const preset = meshPresetOptions.find((o) => o.id === nextMeshSource.presetId) ?? meshPresetOptions[0];
      setMeshData(preset.mesh);
      setMeshError(null);
    } else {
      const parsed = parseObjToMeshData(nextMeshSource.objText);
      if (parsed.ok) {
        setMeshData(parsed.mesh);
        setMeshError(null);
      } else {
        setMeshData(meshPresetOptions[0].mesh);
        setMeshError(parsed.error);
      }
    }
  };

  const restoreDeletedProject = useCallback((snapshot: DeletedProjectSnapshot) => {
    setProjects((prev) => {
      if (prev.some((p) => p.id === snapshot.project.id)) return prev;
      const next = [...prev];
      next.splice(Math.min(Math.max(snapshot.index, 0), next.length), 0, snapshot.project);
      return next;
    });
    if (snapshot.textures.length > 0) {
      setProjectTextures((prev) => ({ ...prev, [snapshot.project.id]: snapshot.textures }));
    }
    if (snapshot.aiHistory.length > 0) {
      setAiShaderHistoryByProject((prev) => ({ ...prev, [snapshot.project.id]: snapshot.aiHistory }));
    }
    setCurrentProjectId(snapshot.project.id);
    setVertexShader(snapshot.project.vertexShader);
    setFragmentShader(snapshot.project.fragmentShader);
    setSlangSource(snapshot.project.slangSource ?? "");
    setRenderMode(ENABLE_3D_PREVIEW ? snapshot.renderMode : "2d");
    setMeshSource(snapshot.meshSource);
    setMeshData(snapshot.meshData);
    setMeshError(null);
    setTextures(snapshot.textures);
    setParameters(snapshot.parameters ?? []);
  }, []);

  const performDeleteProject = useCallback((id: string, recordHistory: boolean) => {
    const target = projects.find((p) => p.id === id);
    if (!target) return null;

    const snapshot: DeletedProjectSnapshot = {
      project: target,
      index: projects.findIndex((p) => p.id === id),
      textures: projectTextures[id] ?? target.textures ?? [],
      aiHistory: aiShaderHistoryByProject[id] ?? [],
      renderMode: currentProjectId === id ? renderMode : (target.renderMode ?? "2d"),
      meshSource: currentProjectId === id ? meshSource : (target.meshSource ?? { kind: "preset", presetId: "cube" }),
      meshData: currentProjectId === id ? meshData : meshPresetOptions[0].mesh,
      parameters: currentProjectId === id ? parameters : (target.parameters ?? []),
    };

    if (recordHistory) {
      deletedUndoStackRef.current.push(snapshot);
      if (deletedUndoStackRef.current.length > 50) deletedUndoStackRef.current.shift();
      deletedRedoStackRef.current = [];
    }

    setProjects((prev) => prev.filter((p) => p.id !== id));
    setProjectTextures((prev) => { const next = { ...prev }; delete next[id]; return next; });
    setAiShaderHistoryByProject((prev) => {
      if (!(id in prev)) return prev;
      const next = { ...prev }; delete next[id]; return next;
    });
    if (currentProjectId === id) {
      const remaining = projects.filter((p) => p.id !== id);
      if (remaining.length > 0) {
        handleSelectProject(remaining[0]);
      } else {
        setCurrentProjectId(null);
        setVertexShader(DEFAULT_VERTEX_SHADER_GLSL);
        setFragmentShader("");
        setSlangSource(defaultSlangShader);
        setMeshSource(DEFAULT_MESH_SOURCE);
        setMeshData(meshPresetOptions[0].mesh);
        setMeshError(null);
      }
    }
    return snapshot;
  }, [aiShaderHistoryByProject, currentProjectId, projectTextures, projects, renderMode, meshSource, meshData, parameters, meshPresetOptions, handleSelectProject]);

  const handleDeleteProject = useCallback((id: string) => {
    performDeleteProject(id, true);
  }, [performDeleteProject]);

  useEffect(() => {
    const isEditable = (el: EventTarget | null) => {
      if (!(el instanceof HTMLElement)) return false;
      if (el.isContentEditable) return true;
      const tag = el.tagName.toLowerCase();
      return tag === "input" || tag === "textarea" || tag === "select";
    };
    const handler = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || isEditable(e.target)) return;
      const key = e.key.toLowerCase();
      const isUndo = key === "z" && !e.shiftKey;
      const isRedo = (key === "z" && e.shiftKey) || key === "y";
      if (!isUndo && !isRedo) return;
      if (isUndo) {
        const snap = deletedUndoStackRef.current.pop();
        if (!snap) return;
        e.preventDefault();
        restoreDeletedProject(snap);
        deletedRedoStackRef.current.push(snap);
        return;
      }
      const snap = deletedRedoStackRef.current.pop();
      if (!snap) return;
      e.preventDefault();
      const removed = performDeleteProject(snap.project.id, false);
      if (!removed) return;
      deletedUndoStackRef.current.push(snap);
      if (deletedUndoStackRef.current.length > 50) deletedUndoStackRef.current.shift();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [performDeleteProject, restoreDeletedProject]);

  const handleRenameProject = (id: string, name: string) => {
    setProjects((prev) => prev.map((p) => p.id === id ? { ...p, name, updatedAt: Date.now() } : p));
  };

  const handleCopyFragment = async () => {
    const project = projects.find((p) => p.id === currentProjectId);
    const isSlang =
      project?.language === "slang" || (slangSource.trim() !== "" && !currentProjectId);
    const code = isSlang ? slangSource : fragmentShader;
    await navigator.clipboard.writeText(code);
    setCopiedFragment(true);
    setTimeout(() => setCopiedFragment(false), 2000);
  };

  const handleCopyVertex = async () => {
    await navigator.clipboard.writeText(vertexShader);
    setCopiedVertex(true);
    setTimeout(() => setCopiedVertex(false), 2000);
  };

  const handleDownloadCompiled = useCallback(() => {
    const name = projects.find((p) => p.id === currentProjectId)?.name ?? "shader";
    downloadArtifactFromExport(compiledArtifact, name);
  }, [compiledArtifact, currentProjectId, projects]);

  const handleShaderGenerated = useCallback(
    (
      vertexIn: string,
      fragmentIn: string,
      meta?: {
        summary?: string;
        targetProjectId?: string | null;
        slangSource?: string;
      },
    ) => {
      // The authoritative final payload has arrived — streaming is done.
      setStreamingProjectId(null);
      const incomingSlang = meta?.slangSource?.trim() ?? "";
      const isSlang = incomingSlang !== "";
      if (!fragmentIn.trim() && !isSlang) return;
      const summary = meta?.summary?.trim() || "AI-generated shader";
      let targetProjectId = meta?.targetProjectId ?? currentProjectId;

      // Parse parameters from the canonical shader source.
      const parsedParameters = parseParametersFromShader(
        isSlang ? incomingSlang : fragmentIn,
      );
      const fragmentWithInjectedParams = isSlang
        ? ""
        : injectParameterDeclarations(fragmentIn, parsedParameters);

      if (!targetProjectId) {
        const nextVertex = vertexIn.trim()
          ? vertexIn
          : (renderMode === "3d" ? DEFAULT_VERTEX_SHADER_3D_GLSL : DEFAULT_VERTEX_SHADER_GLSL);
        const now = Date.now();
        const newProject: ShaderProject = {
          id: generateId(), name: `Shader ${projects.length + 1}`,
          vertexShader: nextVertex, fragmentShader: fragmentWithInjectedParams,
          language: isSlang ? "slang" : "glsl",
          slangSource: isSlang ? incomingSlang : undefined,
          renderMode, meshSource, createdAt: now, updatedAt: now,
          parameters: parsedParameters,
        };
        targetProjectId = newProject.id;
        setProjects((prev) => [newProject, ...prev]);
        if (!currentProjectId) {
          setCurrentProjectId(newProject.id);
          setVertexShader(newProject.vertexShader);
          setFragmentShader(newProject.fragmentShader);
          setSlangSource(isSlang ? incomingSlang : "");
          setParameters(parsedParameters);
        }
        const entry: AIShaderHistoryEntry = {
          id: generateId(), createdAt: Date.now(), summary,
          fragmentShader: fragmentWithInjectedParams, vertexShader: nextVertex,
          slangSource: isSlang ? incomingSlang : undefined,
        };
        setAiShaderHistoryByProject((prev) => {
          const list = prev[targetProjectId!] ?? [];
          return { ...prev, [targetProjectId!]: [entry, ...list] };
        });
        return;
      }

      const targetProject = projects.find((p) => p.id === targetProjectId);
      if (!targetProject) return;
      const nextVertex = vertexIn.trim() ? vertexIn : targetProject.vertexShader;
      const now = Date.now();
      setProjects((prev) =>
        prev.map((p) => p.id === targetProjectId
          ? {
              ...p,
              vertexShader: nextVertex,
              fragmentShader: isSlang ? p.fragmentShader : fragmentWithInjectedParams,
              slangSource: isSlang ? incomingSlang : p.slangSource,
              language: isSlang ? "slang" : p.language,
              parameters: parsedParameters,
              updatedAt: now,
            }
          : p),
      );
      if (targetProjectId === currentProjectId) {
        setVertexShader(nextVertex);
        if (isSlang) {
          setSlangSource(incomingSlang);
          setParameters(parsedParameters);
        } else {
          setFragmentShader(fragmentWithInjectedParams);
          setParameters(parsedParameters);
        }
      }
      const entry: AIShaderHistoryEntry = {
        id: generateId(), createdAt: now, summary,
        fragmentShader: isSlang ? "" : fragmentWithInjectedParams, vertexShader: nextVertex,
        slangSource: isSlang ? incomingSlang : undefined,
      };
      setAiShaderHistoryByProject((prev) => {
        const list = prev[targetProjectId!] ?? [];
        return { ...prev, [targetProjectId!]: [entry, ...list] };
      });
    },
    [currentProjectId, meshSource, projects, renderMode],
  );

  // Reveal Slang code in the editor as it streams in from the AI.
  const handleShaderStreaming = useCallback(
    (pid: string | null, partialSlang: string) => {
      setStreamingProjectId(pid);
      if (pid === currentProjectId) {
        setSlangSource(partialSlang);
      }
    },
    [currentProjectId],
  );

  // Track in-flight AI generation so the preview can show its "waiting" pulse.
  const handleGeneratingChange = useCallback((loading: boolean) => {
    setAiGenerating(loading);
    // Settling (success, error, or cancel) always ends any active stream.
    if (!loading) setStreamingProjectId(null);
  }, []);

  const handleApplyAiShaderHistory = useCallback((entry: AIShaderHistoryEntry) => {
    setVertexShader(entry.vertexShader);
    setFragmentShader(entry.fragmentShader);
    setSlangSource(entry.slangSource ?? "");
  }, []);

  const handleRemoveAiShaderHistoryEntry = useCallback((entryId: string) => {
    if (!currentProjectId) return;
    setAiShaderHistoryByProject((prev) => {
      const list = prev[currentProjectId] ?? [];
      return { ...prev, [currentProjectId]: list.filter((e) => e.id !== entryId) };
    });
  }, [currentProjectId]);

  const handleClearAiShaderHistory = useCallback(() => {
    if (!currentProjectId) return;
    setAiShaderHistoryByProject((prev) => { const next = { ...prev }; delete next[currentProjectId]; return next; });
  }, [currentProjectId]);

  const handleTemplateSelect = (template: SlangShaderTemplatePreset) => {
    const nextSlang = template.slangSource;
    const nextMode = template.renderMode ?? renderMode;
    const nextVertexShader =
      nextMode === "3d" ? DEFAULT_VERTEX_SHADER_3D_GLSL : DEFAULT_VERTEX_SHADER_GLSL;

    setSlangSource(nextSlang);
    setFragmentShader("");
    setVertexShader(nextVertexShader);
    if (template.renderMode) setRenderMode(template.renderMode);

    if (!currentProjectId) {
      const newProject: ShaderProject = {
        id: generateId(),
        name: `Shader ${projects.length + 1}`,
        vertexShader: nextVertexShader,
        fragmentShader: "",
        slangSource: nextSlang,
        language: "slang",
        renderMode: nextMode,
        meshSource,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      setProjects((prev) => [newProject, ...prev]);
      setCurrentProjectId(newProject.id);
    } else {
      setProjects((prev) =>
        prev.map((p) =>
          p.id === currentProjectId
            ? {
                ...p,
                slangSource: nextSlang,
                language: "slang",
                fragmentShader: "",
                vertexShader: nextVertexShader,
                renderMode: nextMode,
                updatedAt: Date.now(),
              }
            : p,
        ),
      );
    }
  };

  const handleObjUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!ENABLE_3D_PREVIEW) {
      toast.info("3D preview is temporarily disabled.");
      e.target.value = "";
      return;
    }
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const parsed = parseObjToMeshData(text);
    if (!parsed.ok) {
      setMeshError(parsed.error);
      toast.error(parsed.error);
      e.target.value = "";
      return;
    }
    setMeshSource({ kind: "obj", name: file.name, objText: text });
    setMeshData(parsed.mesh);
    setMeshError(null);
    e.target.value = "";
  }, []);

  const handleTextureAdd = (slot: TextureSlot) => {
    setTextures((prev) => { const updated = prev.filter((t) => t.id !== slot.id); return [...updated, slot]; });
  };
  const handleTextureRemove = (id: "iChannel0" | "iChannel1" | "iChannel2" | "iChannel3") => {
    setTextures((prev) => prev.filter((t) => t.id !== id));
  };
  const handleClearAllTextures = useCallback(() => { setTextures([]); }, []);
  const handleParameterChange = (name: string, value: number | number[] | string) => {
    setParameters((prev) =>
      prev.map((p) =>
        p.name === name ? { ...p, value } : p
      )
    );
  };
  const handleReset = () => { canvasRef.current?.reset(); };

  const currentProject = projects.find((p) => p.id === currentProjectId);
  const sourceLanguage: SourceLanguage =
    currentProject
      ? currentProject.language === "slang"
        ? "slang"
        : currentProject.language === "hlsl"
          ? "hlsl"
          : "glsl"
      : slangSource.trim() !== ""
        ? "slang"
        : "glsl";
  const editorLanguage: "glsl" | "hlsl" | "slang" =
    sourceLanguage === "slang" ? "slang" : sourceLanguage === "hlsl" ? "hlsl" : "glsl";
  const isSlangProject = sourceLanguage === "slang";
  const previewRenderMode: RenderMode = ENABLE_3D_PREVIEW ? renderMode : "2d";
  const previewTarget = getDefaultCompileTarget(sourceLanguage, previewRenderMode);
  const previewVertexShader =
    !ENABLE_3D_PREVIEW && is3DOnlyVertexShader(vertexShader) ? DEFAULT_VERTEX_SHADER_GLSL : vertexShader;
  const previewFragmentShader =
    !ENABLE_3D_PREVIEW && is3DOnlyFragmentShader(fragmentShader)
      ? DEFAULT_GLSL_FALLBACK
      : fragmentShader;

  // Auto-parse parameters when shader source changes (manual editing)
  useEffect(() => {
    const source = isSlangProject ? slangSource : fragmentShader;
    const parsedParams = parseParametersFromShader(source);
    setParameters((prev) => mergeParsedParameters(parsedParams, prev));
  }, [fragmentShader, slangSource, isSlangProject]);

  const openExportDialog = useCallback(() => {
    setExportLanguage(getDefaultExportLanguage(sourceLanguage, previewRenderMode));
    setExportIncludeMetadata(false);
    setExportDialogOpen(true);
  }, [previewRenderMode, sourceLanguage]);

  const downloadLegacyShader = useCallback(() => {
    const project = projects.find((p) => p.id === currentProjectId);
    const code = editorTab === "vertex" ? vertexShader : fragmentShader;
    const blob = new Blob([code], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const base = (project?.name ?? "shader").replace(/[^a-zA-Z0-9._-]+/g, "-");
    a.download = `${base}-source-${editorTab === "vertex" ? "vert" : "frag"}`;
    a.click();
    URL.revokeObjectURL(url);
  }, [currentProjectId, editorTab, fragmentShader, projects, vertexShader]);

  const handleExport = useCallback(async () => {
    const projectName = projects.find((p) => p.id === currentProjectId)?.name ?? "shader";

    if (!isSlangProject) {
      downloadLegacyShader();
      setExportDialogOpen(false);
      return;
    }

    if (exportLanguage === "slang") {
      downloadSlangSource(slangSource, projectName);
      if (exportIncludeMetadata) {
        downloadArtifactMetadata(compiledArtifact, projectName, {
          exportLanguage,
          renderMode: previewRenderMode,
          projectId: currentProjectId,
        });
      }
      setExportDialogOpen(false);
      return;
    }

    setExporting(true);
    try {
      let artifact = compiledArtifact;
      const needsCompile =
        artifact.targetLanguage !== exportLanguage ||
        artifact.status !== "success" ||
        artifact.renderMode !== previewRenderMode;

      if (needsCompile) {
        artifact = await compileSlangSourceToTarget(
          slangSource,
          exportLanguage,
          previewRenderMode,
        );
      }

      if (artifact.status === "error") {
        toast.error(artifact.errors[0] ?? "Compilation failed");
        return;
      }

      downloadArtifactFromExport(artifact, projectName);
      if (exportIncludeMetadata) {
        downloadArtifactMetadata(artifact, projectName, {
          exportLanguage,
          renderMode: previewRenderMode,
          projectId: currentProjectId,
        });
      }
      setExportDialogOpen(false);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setExporting(false);
    }
  }, [
    compiledArtifact,
    currentProjectId,
    downloadLegacyShader,
    exportIncludeMetadata,
    exportLanguage,
    isSlangProject,
    previewRenderMode,
    projects,
    slangSource,
  ]);

  const desktopPanelLayout = useMemo(
    () =>
      computeDesktopPanelLayout({
        openPanels: {
          code: panels.code,
          projects: panels.projects,
          compiled: panels.compiled,
          textures: panels.textures,
          model3d: panels.model3d,
        },
        renderMode,
        enable3d: ENABLE_3D_PREVIEW,
        viewportWidth: viewportSize.width,
        viewportHeight: viewportSize.height,
      }),
    [panels, renderMode, viewportSize.height, viewportSize.width],
  );

  const handleWebGLCompileResult = useCallback(
    (report: WebGLCompileReport) => {
      webglCompileReportRef.current = report;
      if (isSlangProject) return;
      setCompiledArtifact(
        buildArtifactFromWebGLReport(sourceLanguage, previewRenderMode, report),
      );
    },
    [isSlangProject, previewRenderMode, sourceLanguage],
  );

  // Load the in-browser Slang compiler once.
  useEffect(() => {
    void loadSlang();
  }, []);

  // Compile Slang -> WGSL (debounced) for the WebGPU preview. Runs entirely in
  // the browser via slang-wasm — no network calls. Only recompiles when the
  // Slang source actually changes.
  useEffect(() => {
    if (!isSlangProject || previewRenderMode !== "2d") return;
    // Skip compilation while the AI streams code in — partial source won't
    // compile. The final payload triggers exactly one compile when streaming ends.
    if (streamingCode) return;
    const src = slangSource.trim();
    if (!src) {
      setWgslCode("");
      setWgslVertexEntry(null);
      setWgslVertexCount(3);
      return;
    }
    if (src === lastCompiledSlangRef.current) return;
    const timer = setTimeout(async () => {
      try {
        // Safety net: repair any referenced-but-undeclared u_* uniforms so the
        // Slang compiler never aborts with "undefined identifier" (the common
        // failure mode of AI-generated shaders).
        const normalized = normalizeSlangSource(slangSource);
        if (slangHasVertexEntry(normalized)) {
          // Custom vertex stage: compile vertexMain + fragmentMain into one
          // WGSL module and drive the configured vertex count.
          const { code } = await compileSlangProgramToWgsl(normalized);
          lastCompiledSlangRef.current = src;
          setWgslCode(code);
          setWgslVertexEntry("vertexMain");
          setWgslVertexCount(parseVertexCountDirective(normalized));
        } else {
          const { code } = await compileSlangToWgsl(normalized);
          lastCompiledSlangRef.current = src;
          setWgslCode(code);
          setWgslVertexEntry(null);
          setWgslVertexCount(3);
        }
        setSlangError(null);
      } catch (e) {
        setSlangError((e as Error).message);
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [slangSource, isSlangProject, previewRenderMode, streamingCode]);

  // Compile Slang -> GLSL for 3D WebGL preview (hybrid until WebGPU 3D exists).
  useEffect(() => {
    if (!isSlangProject || previewRenderMode !== "3d") return;
    if (streamingCode) return;
    const src = slangSource.trim();
    if (!src) {
      setSlangGlslVertex("");
      setSlangGlslFragment("");
      return;
    }
    if (src === lastCompiledSlang3dRef.current) return;
    const timer = setTimeout(async () => {
      try {
        await Promise.all([
          compileSlangToGlsl(src, { entryPoint: "vertexMain", stage: STAGE_VERTEX }),
          compileSlangToGlsl(src, { entryPoint: "fragmentMain", stage: STAGE_FRAGMENT }),
        ]);
        lastCompiledSlang3dRef.current = src;
        // The real Slang -> GLSL output targets GLSL ES 3.x features WebGL1
        // rejects, so the WebGL preview renders each built-in template's own
        // hand-written GLSL ES 1.00 pair. A matched sample renders for real;
        // edited/unknown Slang falls back to the default lit cube.
        const matched = findSlangTemplateBySource(slangSource);
        setSlangGlslVertex(matched?.glslVertex ?? DEFAULT_VERTEX_SHADER_3D_GLSL);
        setSlangGlslFragment(matched?.glsl ?? DEFAULT_SLANG_FRAGMENT_3D.glsl);
        setSlangError(null);
      } catch (e) {
        setSlangError((e as Error).message);
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [slangSource, isSlangProject, previewRenderMode, streamingCode]);

  // Compile to the user-selected target for preview/export (Slang Playground-style).
  useEffect(() => {
    if (streamingCode) return;

    if (!isSlangProject) {
      if (previewTarget === "hlsl") {
        setCompiledArtifact(
          buildHlslPassthroughArtifact(
            sourceLanguage,
            previewRenderMode,
            vertexShader,
            fragmentShader,
          ),
        );
        return;
      }

      const report = webglCompileReportRef.current;
      if (report) {
        setCompiledArtifact(
          buildArtifactFromWebGLReport(sourceLanguage, previewRenderMode, report),
        );
        return;
      }

      setCompiledArtifact(
        buildGlslPassthroughArtifact(
          sourceLanguage,
          previewRenderMode,
          vertexShader,
          fragmentShader,
        ),
      );
      return;
    }

    const src = slangSource.trim();
    if (!src) {
      setCompiledArtifact(createEmptyArtifact(sourceLanguage, previewTarget, previewRenderMode));
      return;
    }

    let cancelled = false;
    setCompiledArtifact((prev) => ({
      ...prev,
      status: "compiling",
      targetLanguage: previewTarget,
      sourceLanguage,
      renderMode: previewRenderMode,
    }));

    const timer = setTimeout(async () => {
      const artifact = await compileSlangSourceToTarget(
        slangSource,
        previewTarget,
        previewRenderMode,
      );
      if (cancelled) return;
      setCompiledArtifact(artifact);
      if (artifact.status === "error" && artifact.errors.length > 0) {
        setSlangError(artifact.errors[0]);
      } else if (artifact.status === "success") {
        setSlangError(null);
      }
    }, 400);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [
    slangSource,
    isSlangProject,
    previewTarget,
    previewRenderMode,
    streamingCode,
    sourceLanguage,
    vertexShader,
    fragmentShader,
  ]);

  const slang2dPreview = isSlangProject && previewRenderMode === "2d";
  const slang3dPreview = isSlangProject && previewRenderMode === "3d";
  const canvasVertexShader = slang3dPreview
    ? slangGlslVertex
    : previewVertexShader;
  const canvasFragmentShader = slang3dPreview
    ? slangGlslFragment
    : previewFragmentShader;

  // While the AI is generating / streaming a shader, the preview stands by and
  // pulses (dims and restores) to signal it is waiting.
  const previewPending = aiGenerating || streamingCode;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="relative w-screen h-dvh overflow-hidden bg-[#0d0b08]">

      {/* Layer 1: Full-bleed canvas */}
      <div
        className={cn("absolute inset-0", previewPending && "preview-waiting")}
        data-preview-pending={previewPending ? "true" : undefined}
      >
        {slang2dPreview ? (
          <WebGPUCanvas
            wgslFragment={wgslCode}
            vertexEntryPoint={wgslVertexEntry}
            vertexCount={wgslVertexCount}
            isPlaying={isPlaying}
            timeScale={speed}
            textures={textures}
            parameters={parameters}
            className="w-full h-full"
            externalError={slangError}
            onFpsUpdate={handleFpsUpdate}
          />
        ) : (
          <ShaderCanvas
            ref={canvasRef}
            vertexShader={canvasVertexShader}
            fragmentShader={canvasFragmentShader}
            renderMode={previewRenderMode}
            meshData={ENABLE_3D_PREVIEW && previewRenderMode === "3d" ? meshData : undefined}
            textures={textures}
            parameters={parameters}
            isPlaying={isPlaying}
            timeScale={speed}
            className="w-full h-full"
            onFpsUpdate={handleFpsUpdate}
            onCompileResult={handleWebGLCompileResult}
          />
        )}
      </div>

      {/* Layer 2: Film grain overlay */}
      <div className="film-grain absolute inset-0" />

      {/* Layer 3: Top App Bar */}
      <header className="absolute top-3.5 left-3.5 right-3.5 flex items-center gap-2 z-10 flex-wrap">
        {/* Logo + Title */}
        <FloatChip className="gap-2">
          <LogoMark />
          <span className="font-serif italic text-[15px] text-[#e8dcc4]">
            Slang<span className="opacity-50">—</span>AI Lab
          </span>
        </FloatChip>

        {/* Project selector */}
        <FloatChip
          className="gap-2 cursor-pointer hover:bg-[rgba(255,245,220,0.1)] transition-colors"
          onClick={() => togglePanel("projects")}
        >
          <FolderOpen className="w-3.5 h-3.5 text-[#e8dcc4] opacity-60" />
          <span className="text-[11px] opacity-60 text-[#e8dcc4]">Project</span>
          <span className="text-xs text-[#e8dcc4]">{currentProject?.name ?? "—"}</span>
          <span className="text-[#e8dcc4] opacity-40 text-[10px]">▾</span>
        </FloatChip>

        <div className="flex-1" />

        <FloatChip className="gap-2">
          <span className="text-[11px] opacity-60 text-[#e8dcc4]">Source</span>
          <span className="text-xs font-mono uppercase text-[#e8dcc4]">
            {sourceLanguage}
          </span>
        </FloatChip>

        <FloatChip className="gap-2">
          <span className="text-[11px] opacity-60 text-[#e8dcc4]">Preview</span>
          <span className="text-xs font-mono uppercase text-[#e8dcc4]">
            {previewTarget}
          </span>
        </FloatChip>

        <FloatChip className="gap-2">
          <span className="text-[11px] opacity-60 text-[#e8dcc4]">Type</span>
          <span className="text-xs font-mono uppercase text-[#e8dcc4]">
            {renderMode}
          </span>
        </FloatChip>

        {/* Panel toggles */}
        <div className="hidden lg:flex items-center gap-1.5">
          <TogglePill active={panels.projects} onClick={() => togglePanel("projects")} testId="panel-projects">Projects</TogglePill>
          <TogglePill active={promptOpen} onClick={() => setPromptOpen((p) => !p)}>AI</TogglePill>
          <TogglePill active={panels.code} onClick={() => togglePanel("code")}>Code</TogglePill>
          <TogglePill active={panels.compiled} onClick={() => togglePanel("compiled")}>Output</TogglePill>
          <TogglePill active={panels.textures} onClick={() => togglePanel("textures")}>Params</TogglePill>
          {ENABLE_3D_PREVIEW && renderMode === "3d" && (
            <TogglePill active={panels.model3d} onClick={() => togglePanel("model3d")}>3D</TogglePill>
          )}
        </div>

        {/* Mobile: icon toggles */}
        <div className="flex lg:hidden items-center gap-1">
          <button
            onClick={() => { setMobileTabIndex("ai"); setShowMobilePanel(true); }}
            className="float-chip w-9 h-9 justify-center text-[#e8dcc4]"
          >
            <MessageSquare className="w-4 h-4" />
          </button>
          <button
            onClick={() => { setMobileTabIndex("editor"); setShowMobilePanel(true); }}
            className="float-chip w-9 h-9 justify-center text-[#e8dcc4]"
          >
            <Code className="w-4 h-4" />
          </button>
          <button
            onClick={() => { setMobileTabIndex("compiled"); setShowMobilePanel(true); }}
            className="float-chip w-9 h-9 justify-center text-[#e8dcc4]"
          >
            <FileOutput className="w-4 h-4" />
          </button>
          <button
            onClick={() => { setMobileTabIndex("textures"); setShowMobilePanel(true); }}
            className="float-chip w-9 h-9 justify-center text-[#e8dcc4]"
          >
            <ImageIcon className="w-4 h-4" />
          </button>
          {ENABLE_3D_PREVIEW && renderMode === "3d" && (
            <button
              onClick={() => { setMobileTabIndex("model3d"); setShowMobilePanel(true); }}
              className="float-chip w-9 h-9 justify-center text-[#e8dcc4]"
              style={{ background: mobileTabIndex === "model3d" && showMobilePanel ? "rgba(255,245,220,0.18)" : undefined }}
            >
              <Box className="w-4 h-4" />
            </button>
          )}
        </div>

        <FloatChip
          className="cursor-pointer hover:bg-[rgba(255,245,220,0.1)] transition-colors"
          onClick={openExportDialog}
        >
          <Download className="w-3.5 h-3.5 text-[#e8dcc4]" />
          <span className="text-xs text-[#e8dcc4]">Export</span>
        </FloatChip>
      </header>

      {/* Layer 4: Unified bottom bar (desktop) — Dock + collapsible AI prompt */}
      <div className="hidden lg:flex absolute bottom-[18px] left-1/2 -translate-x-1/2 z-10 flex-col items-center gap-2 pointer-events-none">

        {/* Prompt area (always mounted for ref stability, animated show/hide) */}
        <motion.div
          animate={promptOpen ? { opacity: 1, y: 0, scale: 1, pointerEvents: "auto" } : { opacity: 0, y: 8, scale: 0.97, pointerEvents: "none" }}
          transition={{ duration: 0.15, ease: "easeOut" }}
          className="w-[540px] rounded-xl overflow-hidden pointer-events-auto"
          style={{
            background: "rgba(20,16,12,0.88)",
            backdropFilter: "blur(20px)",
            WebkitBackdropFilter: "blur(20px)",
            border: "1px solid rgba(255,245,220,0.14)",
          }}
        >
          {/* Message history */}
          <div className="max-h-[260px] overflow-y-auto">
            {isDesktop && (
              <AIChatPanel
                ref={chatRef}
                onShaderGenerated={handleShaderGenerated}
                onShaderStreaming={handleShaderStreaming}
                onGeneratingChange={handleGeneratingChange}
                language={editorLanguage}
                settings={settings}
                onSettingsChange={setSettings}
                textures={textures}
                renderMode={renderMode}
                compact
                projectId={currentProjectId}
                hideInput
              />
            )}
          </div>
          {/* Prompt input */}
          <form
            onSubmit={handlePromptSubmit}
            className="flex items-center gap-2 px-3 py-2.5"
            style={{ borderTop: "1px solid rgba(255,245,220,0.1)" }}
          >
            <input
              type="text"
              data-testid="ai-prompt-input"
              value={promptInput}
              onChange={(e) => setPromptInput(e.target.value)}
              placeholder={
                (!settings.useCustomKey || settings.apiKey)
                  ? "Describe your shader..."
                  : "API key required..."
              }
              disabled={!(!settings.useCustomKey || settings.apiKey)}
              className="flex-1 bg-[rgba(255,245,220,0.08)] border border-[rgba(255,245,220,0.12)] rounded-lg px-3 py-2 text-xs text-[#e8dcc4] placeholder-[rgba(232,220,196,0.4)] focus:outline-none focus:border-[rgba(255,245,220,0.3)]"
            />
            <SettingsPanel
              settings={settings}
              onSettingsChange={setSettings}
              menuAlign="end"
              menuSide="top"
              trigger={
                <button
                  type="button"
                  aria-label="モデルとAPIキー設定を開く"
                  className="w-8 h-8 flex items-center justify-center rounded-lg text-[#e8dcc4] opacity-60 hover:opacity-100 transition-opacity"
                  title="Model and API key"
                >
                  <Settings className="w-4 h-4" />
                </button>
              }
            />
            <button
              type="submit"
              data-testid="ai-send-button"
              aria-label="プロンプトを送信"
              disabled={!promptInput.trim() || !(!settings.useCustomKey || settings.apiKey)}
              className="w-8 h-8 flex items-center justify-center rounded-lg transition-colors disabled:opacity-30"
              style={{ background: "#fbbf24", color: "#0d0b08" }}
              title="Send"
            >
              <Send className="w-3.5 h-3.5" />
            </button>
          </form>
        </motion.div>

        {/* Dock bar */}
        <div className="dock-bar flex items-center gap-0.5 p-1 pointer-events-auto">
          <DockBtn onClick={() => setIsPlaying(!isPlaying)} title={isPlaying ? "Pause" : "Play"}>
            {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
          </DockBtn>
          <DockBtn onClick={handleReset} title="Reset">
            <RotateCcw className="w-4 h-4" />
          </DockBtn>

          <div className="w-px bg-[rgba(255,245,220,0.15)] h-5 mx-1" />

          {/* Speed */}
          <div className="flex items-center gap-2 px-2 text-[11px] font-mono text-[#e8dcc4]">
            <span className="opacity-55">u_time</span>
            <input
              type="range" min="0" max="3" step="0.05" value={speed}
              onChange={(e) => setSpeed(parseFloat(e.target.value))}
              aria-label="Animation speed"
              className="w-24 accent-[#fbbf24]"
            />
            <span className="tabular-nums min-w-[40px]">{speed.toFixed(2)}×</span>
          </div>

          <div className="w-px bg-[rgba(255,245,220,0.15)] h-5 mx-1" />

          {/* AI prompt toggle */}
          <DockBtn onClick={() => setPromptOpen((p) => !p)} title="AI prompt" active={promptOpen}>
            <MessageSquare className="w-4 h-4" />
          </DockBtn>

          {/* Fullscreen */}
          <DockBtn onClick={toggleFullscreen} title={isFullscreen ? "Exit Fullscreen" : "Fullscreen"}>
            {isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
          </DockBtn>
        </div>
      </div>

      {/* Layer 5: FPS HUD (bottom-left, desktop) */}
      {canvasSize.w > 0 && (
        <div className="hidden lg:block absolute bottom-[18px] left-[18px] z-10 hud-box px-3 py-2 text-[10px] font-mono space-y-0.5">
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-[#4ade80] inline-block" />
            <span>{fps} fps</span>
          </div>
          <div className="opacity-55">{canvasSize.w} × {canvasSize.h}</div>
          <div className="opacity-55">
            {mousePos.x.toFixed(2)}, {mousePos.y.toFixed(2)}
          </div>
        </div>
      )}

      {/* Layer 6: Playback controls (mobile, bottom) */}
      <div className="lg:hidden absolute bottom-[80px] left-1/2 -translate-x-1/2 z-10 dock-bar flex items-center gap-0.5 p-1">
        <DockBtn onClick={() => setIsPlaying(!isPlaying)} title={isPlaying ? "Pause" : "Play"}>
          {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
        </DockBtn>
        <DockBtn onClick={handleReset} title="Reset">
          <RotateCcw className="w-4 h-4" />
        </DockBtn>
      </div>

      {/* ── Desktop floating panels ────────────────────────────────────────── */}
      <AnimatePresence>

        {/* Code panel — left */}
        {panels.code && (
          <FloatPanel
            key="code"
            title={isSlangProject ? "main.slang" : "main.frag"}
            subtitle={`${isSlangProject ? "Slang" : "GLSL"} · ${editorTab}`}
            onClose={() => togglePanel("code")}
            tone="code"
            style={panelLayoutStyle(desktopPanelLayout.code)}
            className="hidden lg:flex"
          >
            {/* Tab header */}
            <div
              className="flex items-center gap-1 px-2 py-1.5 shrink-0"
              style={{ borderBottom: "1px solid rgba(255,245,220,0.08)" }}
            >
              <button
                type="button"
                onClick={() => setEditorTab("fragment")}
                className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-mono rounded transition-colors"
                style={{
                  backgroundColor: editorTab === "fragment" ? "rgba(255,245,220,0.12)" : "transparent",
                  color: editorTab === "fragment" ? "#e8dcc4" : "rgba(232,220,196,0.45)",
                }}
              >
                <Code className="w-3.5 h-3.5" />
                {isSlangProject ? ".slang" : ".frag"}
              </button>
              {/* Slang authors the vertex stage inside the single .slang file
                  (vertexMain), so the separate .vert tab is only for legacy
                  GLSL 3D projects. */}
              {ENABLE_3D_PREVIEW && renderMode === "3d" && !isSlangProject && (
                <button
                  type="button"
                  onClick={() => setEditorTab("vertex")}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-mono rounded transition-colors"
                  style={{
                    backgroundColor: editorTab === "vertex" ? "rgba(255,245,220,0.12)" : "transparent",
                    color: editorTab === "vertex" ? "#e8dcc4" : "rgba(232,220,196,0.45)",
                  }}
                >
                  <Layers className="w-3.5 h-3.5" />
                  .vert
                </button>
              )}
              <div className="flex-1" />
              <button
                onClick={editorTab === "fragment" ? handleCopyFragment : handleCopyVertex}
                className="flex items-center gap-1 px-2 py-1 text-xs rounded transition-colors"
                style={{ background: "transparent", border: "none", color: "rgba(232,220,196,0.55)", cursor: "pointer" }}
                title={editorTab === "fragment" ? (copiedFragment ? "Copied!" : "Copy Fragment") : (copiedVertex ? "Copied!" : "Copy Vertex")}
              >
                {editorTab === "fragment"
                  ? (copiedFragment ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />)
                  : (copiedVertex ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />)
                }
              </button>
            </div>
            <div className="flex-1 min-h-0 overflow-hidden">
              <CodeEditor
                value={
                  editorTab === "vertex"
                    ? vertexShader
                    : isSlangProject
                      ? slangSource
                      : fragmentShader
                }
                onChange={
                  editorTab === "vertex"
                    ? setVertexShader
                    : isSlangProject
                      ? setSlangSource
                      : setFragmentShader
                }
                language={editorTab === "vertex" ? "glsl" : editorLanguage}
                className="min-h-0 h-full"
                isStreaming={streamingCode && editorTab !== "vertex"}
              />
            </div>
          </FloatPanel>
        )}

        {/* Compiled output panel — right */}
        {panels.compiled && (
          <FloatPanel
            key="compiled"
            title="Compiled output"
            subtitle={`${sourceLanguage} → ${previewTarget}`}
            onClose={() => togglePanel("compiled")}
            tone="code"
            style={panelLayoutStyle(desktopPanelLayout.compiled)}
            className="hidden lg:flex"
          >
            <CompiledOutputPanel
              artifact={compiledArtifact}
              onDownload={handleDownloadCompiled}
              className="flex-1 min-h-0"
            />
          </FloatPanel>
        )}

        {/* Projects panel */}
        {panels.projects && (
          <FloatPanel
            key="projects"
            title="Projects"
            onClose={() => togglePanel("projects")}
            style={panelLayoutStyle(desktopPanelLayout.projects)}
            className="hidden lg:flex"
          >
            <div className="flex-1 min-h-0 overflow-y-auto" style={DARK_PANEL_VARS}>
              <HistoryPanel
                projects={projects}
                currentProjectId={currentProjectId}
                currentRenderMode={renderMode}
                onSelectProject={handleSelectProject}
                onNewProject={handleNewProject}
                onDeleteProject={handleDeleteProject}
                onRenameProject={handleRenameProject}
                onSelectTemplate={handleTemplateSelect}
                aiShaderHistory={currentProjectId ? aiShaderHistoryByProject[currentProjectId] ?? [] : []}
                currentVertexShader={vertexShader}
                currentFragmentShader={fragmentShader}
                onApplyAiShaderHistory={handleApplyAiShaderHistory}
                onRemoveAiShaderHistoryEntry={handleRemoveAiShaderHistoryEntry}
                onClearAiShaderHistory={handleClearAiShaderHistory}
                floatingMode
              />
            </div>
          </FloatPanel>
        )}

        {/* Parameters + Textures panel — right bottom */}
        {panels.textures && (
          <FloatPanel
            key="textures"
            title="Parameters"
            subtitle="Uniforms + iChannel0 – iChannel3"
            onClose={() => togglePanel("textures")}
            style={panelLayoutStyle(desktopPanelLayout.textures)}
            className="hidden lg:flex"
          >
            <div className="flex-1 overflow-y-auto p-4 space-y-4" style={DARK_PANEL_VARS}>
              <ParameterPanel
                parameters={parameters}
                isOpen={isParametersPanelOpen}
                onOpenChange={setIsParametersPanelOpen}
                onParameterChange={handleParameterChange}
              />
              <div
                className={`overflow-hidden rounded-lg border transition-all ${isTexturesPanelOpen ? "max-h-[720px]" : "max-h-10"}`}
                style={{
                  background: "rgba(20,16,12,0.82)",
                  borderColor: "rgba(255,245,220,0.12)",
                }}
              >
                <button
                  type="button"
                  onClick={() => setIsTexturesPanelOpen((open) => !open)}
                  className="flex h-10 w-full items-center justify-between border-b px-4 transition-colors"
                  style={{
                    background: "rgba(255,245,220,0.06)",
                    borderBottomColor: "rgba(255,245,220,0.1)",
                    color: "#e8dcc4",
                  }}
                >
                  <span className="text-sm font-semibold">Textures ({textures.length})</span>
                  <ChevronDown
                    size={16}
                    className={`transition-transform ${isTexturesPanelOpen ? "rotate-180" : ""}`}
                  />
                </button>
                {isTexturesPanelOpen && (
                  <TexturePanel
                    textures={textures}
                    onTextureAdd={handleTextureAdd}
                    onTextureRemove={handleTextureRemove}
                    onTextureUpdate={handleTextureAdd}
                    onClearAllTextures={handleClearAllTextures}
                  />
                )}
              </div>
            </div>
          </FloatPanel>
        )}

        {ENABLE_3D_PREVIEW && renderMode === "3d" && panels.model3d && (
          <FloatPanel
            key="model3d"
            title="3D preview"
            subtitle="Mesh source"
            onClose={() => togglePanel("model3d")}
            style={panelLayoutStyle(desktopPanelLayout.model3d)}
            className="hidden lg:flex"
          >
            <div className="flex-1 overflow-y-auto p-3 space-y-2" style={DARK_PANEL_VARS}>
              <div className="space-y-1">
                <label className="text-[11px] text-[#e8dcc4] opacity-75">Sample mesh</label>
                <select
                  className="w-full h-8 bg-[rgba(255,245,220,0.08)] border border-[rgba(255,245,220,0.14)] rounded px-2 text-xs text-[#e8dcc4]"
                  value={meshSource.kind === "preset" ? meshSource.presetId : ""}
                  onChange={(e) => {
                    const presetId = e.target.value as MeshPresetId;
                    if (!presetId) return;
                    const preset = meshPresetOptions.find((m) => m.id === presetId) ?? meshPresetOptions[0];
                    setMeshSource({ kind: "preset", presetId });
                    setMeshData(preset.mesh);
                    setMeshError(null);
                  }}
                >
                  {meshPresetOptions.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-[11px] text-[#e8dcc4] opacity-75">Upload OBJ (UV auto-generated if missing)</label>
                <input
                  type="file"
                  accept=".obj,text/plain"
                  className="block w-full text-[11px] text-[#e8dcc4] file:mr-2 file:h-7 file:px-2 file:rounded file:border-0 file:bg-[rgba(255,245,220,0.12)] file:text-[#e8dcc4]"
                  onChange={handleObjUpload}
                />
              </div>
              {meshSource.kind === "obj" && (
                <div className="text-[10px] text-[#e8dcc4] opacity-70">Loaded: {meshSource.name}</div>
              )}
              {meshError && (
                <div className="text-[11px] text-[#fda4af]">{meshError}</div>
              )}
            </div>
          </FloatPanel>
        )}

      </AnimatePresence>

      {/* ── Mobile bottom panel ────────────────────────────────────────────── */}
      <div className="lg:hidden absolute bottom-0 left-0 right-0 z-20">
        <div
          className="mx-3 mb-3 rounded-xl overflow-hidden"
          style={{
            background: "rgba(20, 16, 12, 0.88)",
            backdropFilter: "blur(20px)",
            WebkitBackdropFilter: "blur(20px)",
            border: "1px solid rgba(255,245,220,0.14)",
          }}
        >
          {/* Tab bar */}
          <div
            className="flex items-center gap-1 p-1.5"
            style={{ borderBottom: showMobilePanel ? "1px solid rgba(255,245,220,0.1)" : "none" }}
          >
            <div className="flex gap-0.5 flex-1 p-0.5 rounded-lg" style={{ background: "rgba(255,245,220,0.05)" }}>
              {([
                "ai",
                "editor",
                "compiled",
                "textures",
                "projects",
                ...(ENABLE_3D_PREVIEW && renderMode === "3d" ? (["model3d"] as const) : []),
              ] as const).map((tab) => {
                const icons = {
                  ai: <MessageSquare className="w-4 h-4" />,
                  editor: <Code className="w-4 h-4" />,
                  compiled: <FileOutput className="w-4 h-4" />,
                  textures: <ImageIcon className="w-4 h-4" />,
                  projects: <FolderOpen className="w-4 h-4" />,
                  model3d: <Box className="w-4 h-4" />,
                };
                const labels = {
                  ai: "AI",
                  editor: "Editor",
                  compiled: "Output",
                  textures: "Params",
                  projects: "Projects",
                  model3d: "3D",
                };
                return (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => { setMobileTabIndex(tab); setShowMobilePanel(true); }}
                    className="flex items-center justify-center gap-1.5 px-2 py-1.5 text-xs font-medium rounded-md flex-1 transition-colors"
                    style={{
                      background: mobileTabIndex === tab ? "rgba(255,245,220,0.14)" : "transparent",
                      color: mobileTabIndex === tab ? "#e8dcc4" : "rgba(232,220,196,0.5)",
                    }}
                  >
                    {icons[tab]}
                    <span className="hidden xs:inline">{labels[tab]}</span>
                  </button>
                );
              })}
            </div>
            <button
              className="w-8 h-8 flex items-center justify-center rounded-lg transition-colors"
              style={{ background: "transparent", border: "none", color: "rgba(232,220,196,0.6)", cursor: "pointer" }}
              onClick={() => setShowMobilePanel((p) => !p)}
            >
              <motion.div animate={{ rotate: showMobilePanel ? 0 : 180 }} transition={{ duration: 0.2 }}>
                <ChevronDown className="w-4 h-4" />
              </motion.div>
            </button>
          </div>

          {/* Content */}
          <AnimatePresence>
            {showMobilePanel && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "min(45vh, 360px)", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2, ease: "easeInOut" }}
                className="flex flex-col overflow-hidden"
              >
                {/* AI — always mounted */}
                <div className={cn("flex-1 min-h-0 flex flex-col overflow-hidden", mobileTabIndex !== "ai" && "hidden")} aria-hidden={mobileTabIndex !== "ai"}>
                  {!isDesktop && (
                    <AIChatPanel
                      onShaderGenerated={handleShaderGenerated}
                      onShaderStreaming={handleShaderStreaming}
                      onGeneratingChange={handleGeneratingChange}
                      language={editorLanguage}
                      settings={settings}
                      onSettingsChange={setSettings}
                      textures={textures}
                      renderMode={renderMode}
                      compact
                      projectId={currentProjectId}
                    />
                  )}
                </div>

                {/* Projects */}
                <div className={cn("flex-1 overflow-y-auto", mobileTabIndex !== "projects" && "hidden")} aria-hidden={mobileTabIndex !== "projects"} style={DARK_PANEL_VARS}>
                  <HistoryPanel
                    projects={projects}
                    currentProjectId={currentProjectId}
                    currentRenderMode={renderMode}
                    onSelectProject={handleSelectProject}
                    onNewProject={handleNewProject}
                    onDeleteProject={handleDeleteProject}
                    onRenameProject={handleRenameProject}
                    onSelectTemplate={handleTemplateSelect}
                    aiShaderHistory={currentProjectId ? aiShaderHistoryByProject[currentProjectId] ?? [] : []}
                    currentVertexShader={vertexShader}
                    currentFragmentShader={fragmentShader}
                    onApplyAiShaderHistory={handleApplyAiShaderHistory}
                    onRemoveAiShaderHistoryEntry={handleRemoveAiShaderHistoryEntry}
                    onClearAiShaderHistory={handleClearAiShaderHistory}
                    floatingMode
                  />
                </div>

                {/* Parameters + Textures */}
                <div className={cn("flex-1 overflow-y-auto", mobileTabIndex !== "textures" && "hidden")} aria-hidden={mobileTabIndex !== "textures"} style={DARK_PANEL_VARS}>
                  <div className="p-3 space-y-3">
                    <ParameterPanel
                      parameters={parameters}
                      isOpen={isParametersPanelOpen}
                      onOpenChange={setIsParametersPanelOpen}
                      onParameterChange={handleParameterChange}
                    />
                    <div
                      className={`overflow-hidden rounded-lg border transition-all ${isTexturesPanelOpen ? "max-h-[720px]" : "max-h-10"}`}
                      style={{
                        background: "rgba(20,16,12,0.82)",
                        borderColor: "rgba(255,245,220,0.12)",
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => setIsTexturesPanelOpen((open) => !open)}
                        className="flex h-10 w-full items-center justify-between border-b px-4 transition-colors"
                        style={{
                          background: "rgba(255,245,220,0.06)",
                          borderBottomColor: "rgba(255,245,220,0.1)",
                          color: "#e8dcc4",
                        }}
                      >
                        <span className="text-sm font-semibold">Textures ({textures.length})</span>
                        <ChevronDown
                          size={16}
                          className={`transition-transform ${isTexturesPanelOpen ? "rotate-180" : ""}`}
                        />
                      </button>
                      {isTexturesPanelOpen && (
                        <TexturePanel
                          textures={textures}
                          onTextureAdd={handleTextureAdd}
                          onTextureRemove={handleTextureRemove}
                          onTextureUpdate={handleTextureAdd}
                          onClearAllTextures={handleClearAllTextures}
                        />
                      )}
                    </div>
                  </div>
                </div>

                {/* Editor */}
                <div className={cn("flex flex-col flex-1 min-h-0 overflow-hidden", mobileTabIndex !== "editor" && "hidden")} aria-hidden={mobileTabIndex !== "editor"}>
                  <div
                    className="flex items-center gap-1 px-2 py-1 shrink-0"
                    style={{ borderBottom: "1px solid rgba(255,245,220,0.08)" }}
                  >
                    <button
                      type="button"
                      onClick={() => setEditorTab("fragment")}
                      className="px-2 py-1 text-xs font-mono rounded transition-colors"
                      style={{
                        background: editorTab === "fragment" ? "rgba(255,245,220,0.12)" : "transparent",
                        color: editorTab === "fragment" ? "#e8dcc4" : "rgba(232,220,196,0.45)",
                        border: "none", cursor: "pointer",
                      }}
                    >
                      {isSlangProject ? ".slang" : ".frag"}
                    </button>
                    {ENABLE_3D_PREVIEW && renderMode === "3d" && (
                      <button
                        type="button"
                        onClick={() => setEditorTab("vertex")}
                        className="px-2 py-1 text-xs font-mono rounded transition-colors"
                        style={{
                          background: editorTab === "vertex" ? "rgba(255,245,220,0.12)" : "transparent",
                          color: editorTab === "vertex" ? "#e8dcc4" : "rgba(232,220,196,0.45)",
                          border: "none", cursor: "pointer",
                        }}
                      >
                        .vert
                      </button>
                    )}
                    <div className="flex-1" />
                    <button
                      onClick={editorTab === "fragment" ? handleCopyFragment : handleCopyVertex}
                      className="flex items-center gap-1 px-2 py-1 text-xs rounded transition-colors"
                      style={{ background: "transparent", border: "none", color: "rgba(232,220,196,0.55)", cursor: "pointer" }}
                    >
                      {copiedFragment ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                  <CodeEditor
                    value={
                      editorTab === "vertex"
                        ? vertexShader
                        : isSlangProject
                          ? slangSource
                          : fragmentShader
                    }
                    onChange={
                      editorTab === "vertex"
                        ? setVertexShader
                        : isSlangProject
                          ? setSlangSource
                          : setFragmentShader
                    }
                    language={editorTab === "vertex" ? "glsl" : editorLanguage}
                    className="flex-1 min-h-0"
                    isStreaming={streamingCode && editorTab !== "vertex"}
                  />
                </div>

                {/* Compiled output */}
                <div className={cn("flex flex-col flex-1 min-h-0 overflow-hidden", mobileTabIndex !== "compiled" && "hidden")} aria-hidden={mobileTabIndex !== "compiled"}>
                  <CompiledOutputPanel
                    artifact={compiledArtifact}
                    onDownload={handleDownloadCompiled}
                    className="flex-1 min-h-0"
                  />
                </div>

                {/* 3D Model */}
                {ENABLE_3D_PREVIEW && renderMode === "3d" && (
                  <div className={cn("flex-1 overflow-y-auto", mobileTabIndex !== "model3d" && "hidden")} aria-hidden={mobileTabIndex !== "model3d"}>
                    <div className="p-3 space-y-2">
                      <div className="flex items-center gap-2 text-[#e8dcc4]">
                        <Box className="w-4 h-4" />
                        <span className="text-xs font-semibold">3D preview</span>
                      </div>
                      <div className="space-y-1">
                        <label className="text-[11px] text-[#e8dcc4] opacity-75">Sample mesh</label>
                        <select
                          className="w-full h-8 bg-[rgba(255,245,220,0.08)] border border-[rgba(255,245,220,0.14)] rounded px-2 text-xs text-[#e8dcc4]"
                          value={meshSource.kind === "preset" ? meshSource.presetId : ""}
                          onChange={(e) => {
                            const presetId = e.target.value as MeshPresetId;
                            if (!presetId) return;
                            const preset = meshPresetOptions.find((m) => m.id === presetId) ?? meshPresetOptions[0];
                            setMeshSource({ kind: "preset", presetId });
                            setMeshData(preset.mesh);
                            setMeshError(null);
                          }}
                        >
                          {meshPresetOptions.map((option) => (
                            <option key={option.id} value={option.id}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="space-y-1">
                        <label className="text-[11px] text-[#e8dcc4] opacity-75">Upload OBJ (UV auto-generated if missing)</label>
                        <input
                          type="file"
                          accept=".obj,text/plain"
                          className="block w-full text-[11px] text-[#e8dcc4] file:mr-2 file:h-7 file:px-2 file:rounded file:border-0 file:bg-[rgba(255,245,220,0.12)] file:text-[#e8dcc4]"
                          onChange={handleObjUpload}
                        />
                      </div>
                      {meshSource.kind === "obj" && (
                        <div className="text-[10px] text-[#e8dcc4] opacity-70">Loaded: {meshSource.name}</div>
                      )}
                      {meshError && (
                        <div className="text-[11px] text-[#fda4af]">{meshError}</div>
                      )}
                    </div>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Export Dialog */}
      <Dialog open={exportDialogOpen} onOpenChange={setExportDialogOpen}>
        <DialogContent style={{
          background: "rgba(20,16,12,0.96)",
          backdropFilter: "blur(20px)",
          border: "1px solid rgba(255,245,220,0.14)",
          borderRadius: "14px",
          boxShadow: "0 24px 64px rgba(0,0,0,0.5)",
          "--background": "rgba(20,16,12,0.96)",
          "--foreground": "#e8dcc4",
          "--muted": "rgba(255,245,220,0.08)",
          "--muted-foreground": "rgba(232,220,196,0.55)",
          "--border": "rgba(255,245,220,0.12)",
          "--input": "rgba(255,245,220,0.08)",
          "--primary": "#fbbf24",
          "--primary-foreground": "#0d0b08",
          "--accent": "rgba(255,245,220,0.1)",
          "--card": "rgba(20,16,12,0.96)",
          "--card-foreground": "#e8dcc4",
          "--popover": "rgba(20,16,12,0.96)",
          "--popover-foreground": "#e8dcc4",
        } as React.CSSProperties}>
          <DialogHeader>
            <DialogTitle>Export shader</DialogTitle>
            <DialogDescription>
              {isSlangProject
                ? "Choose which language to export your Slang source as."
                : "Export the current GLSL source."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {isSlangProject ? (
              <div>
                <Label className="text-[10px] uppercase tracking-widest" style={{ color: "var(--muted-foreground)" }}>
                  Export language
                </Label>
                <RadioGroup
                  value={exportLanguage}
                  onValueChange={(v) => setExportLanguage(v as ExportLanguage)}
                  className="mt-3 flex flex-col gap-2"
                >
                  {SLANG_EXPORT_OPTIONS.map((opt) => (
                    <div key={opt.value} className="flex items-center gap-3">
                      <RadioGroupItem value={opt.value} id={`export-${opt.value}`} />
                      <Label htmlFor={`export-${opt.value}`} className="flex flex-col gap-0.5">
                        <span>{opt.label}</span>
                        <span className="text-[10px] font-normal normal-case tracking-normal" style={{ color: "var(--muted-foreground)" }}>
                          {opt.description}
                        </span>
                      </Label>
                    </div>
                  ))}
                </RadioGroup>
              </div>
            ) : (
              <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
                Legacy GLSL project — the editor source will be exported as-is.
              </p>
            )}
            {isSlangProject && (
              <div className="flex items-center gap-3">
                <Checkbox
                  id="export-metadata"
                  checked={exportIncludeMetadata}
                  onCheckedChange={(checked) => setExportIncludeMetadata(checked === true)}
                />
                <Label htmlFor="export-metadata">Also download metadata JSON (logs + settings)</Label>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" className="ghost-border" onClick={() => setExportDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleExport} disabled={exporting}>
              {exporting ? "Compiling…" : "Export"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
