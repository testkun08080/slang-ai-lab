"use client";

import { useState } from "react";
import { Copy, Check, Download, AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import { CodeEditor } from "@/components/code-editor";
import {
  compileTargetToEditorLanguage,
  type CompileTarget,
} from "@/lib/compiled-artifact";
import type { CompiledArtifact } from "@/lib/types";
import { cn } from "@/lib/utils";

type OutputTab = "fragment" | "vertex" | "module" | "logs";

function statusLabel(artifact: CompiledArtifact): string {
  switch (artifact.status) {
    case "compiling":
      return "Compiling…";
    case "success":
      return "Success";
    case "error":
      return "Error";
    default:
      return "Idle";
  }
}

function StatusIcon({ status }: { status: CompiledArtifact["status"] }) {
  if (status === "compiling") {
    return <Loader2 className="w-3.5 h-3.5 animate-spin text-[#fbbf24]" />;
  }
  if (status === "success") {
    return <CheckCircle2 className="w-3.5 h-3.5 text-[#4ade80]" />;
  }
  if (status === "error") {
    return <AlertTriangle className="w-3.5 h-3.5 text-[#f87171]" />;
  }
  return null;
}

export interface CompiledOutputPanelProps {
  artifact: CompiledArtifact;
  onDownload?: () => void;
  className?: string;
}

export function CompiledOutputPanel({
  artifact,
  onDownload,
  className,
}: CompiledOutputPanelProps) {
  const hasModule = Boolean(artifact.singleOutput?.trim());
  const hasVertex = Boolean(artifact.vertexOutput?.trim());
  const hasFragment = Boolean(artifact.fragmentOutput?.trim());
  const hasLogs = Boolean(
    artifact.compileLog?.trim() ||
      artifact.linkLog?.trim() ||
      artifact.warnings.length > 0 ||
      artifact.errors.length > 0,
  );

  const defaultTab: OutputTab = hasModule
    ? "module"
    : hasFragment
      ? "fragment"
      : hasVertex
        ? "vertex"
        : "logs";

  const [tab, setTab] = useState<OutputTab>(defaultTab);
  const [copied, setCopied] = useState(false);

  const activeTab = (() => {
    if (tab === "module" && hasModule) return "module";
    if (tab === "vertex" && hasVertex) return "vertex";
    if (tab === "fragment" && hasFragment) return "fragment";
    if (tab === "logs" && hasLogs) return "logs";
    return defaultTab;
  })();

  const editorLanguage = compileTargetToEditorLanguage(artifact.targetLanguage);

  const displayCode = (() => {
    switch (activeTab) {
      case "module":
        return artifact.singleOutput ?? "";
      case "vertex":
        return artifact.vertexOutput ?? "";
      case "fragment":
        return artifact.fragmentOutput ?? "";
      case "logs": {
        const parts: string[] = [];
        if (artifact.errors.length > 0) {
          parts.push("=== Errors ===", ...artifact.errors);
        }
        if (artifact.warnings.length > 0) {
          parts.push("=== Warnings ===", ...artifact.warnings);
        }
        if (artifact.compileLog?.trim()) {
          parts.push("=== Compile log ===", artifact.compileLog);
        }
        if (artifact.linkLog?.trim()) {
          parts.push("=== Link log ===", artifact.linkLog);
        }
        return parts.join("\n\n") || "No logs available.";
      }
      default:
        return "";
    }
  })();

  const handleCopy = async () => {
    if (!displayCode) return;
    await navigator.clipboard.writeText(displayCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const tabBtn = (id: OutputTab, label: string, visible: boolean) => {
    if (!visible) return null;
    return (
      <button
        key={id}
        type="button"
        onClick={() => setTab(id)}
        className={cn(
          "px-2.5 py-1.5 text-xs font-mono rounded transition-colors",
          activeTab === id
            ? "bg-[rgba(255,245,220,0.12)] text-[#e8dcc4]"
            : "text-[rgba(232,220,196,0.45)] hover:text-[#e8dcc4]",
        )}
      >
        {label}
      </button>
    );
  };

  return (
    <div className={cn("flex flex-col min-h-0 h-full", className)}>
      <div
        className="flex items-center gap-2 px-2 py-1.5 shrink-0 flex-wrap"
        style={{ borderBottom: "1px solid rgba(255,245,220,0.08)" }}
      >
        <div className="flex items-center gap-1.5 text-[10px] text-[#e8dcc4] opacity-70">
          <StatusIcon status={artifact.status} />
          <span className="uppercase tracking-wider">{statusLabel(artifact)}</span>
        </div>
        <span className="text-[10px] font-mono text-[#e8dcc4] opacity-50">
          {artifact.sourceLanguage} → {artifact.targetLanguage as CompileTarget}
        </span>
        <div className="flex-1" />
        {onDownload && (
          <button
            type="button"
            onClick={onDownload}
            className="flex items-center gap-1 px-2 py-1 text-xs rounded transition-colors text-[rgba(232,220,196,0.55)] hover:text-[#e8dcc4]"
            title="Download compiled output"
          >
            <Download className="w-3.5 h-3.5" />
          </button>
        )}
        <button
          type="button"
          onClick={handleCopy}
          disabled={!displayCode}
          className="flex items-center gap-1 px-2 py-1 text-xs rounded transition-colors text-[rgba(232,220,196,0.55)] hover:text-[#e8dcc4] disabled:opacity-30"
          title="Copy output"
        >
          {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
        </button>
      </div>

      <div
        className="flex items-center gap-1 px-2 py-1 shrink-0"
        style={{ borderBottom: "1px solid rgba(255,245,220,0.06)" }}
      >
        {tabBtn("module", ".module", hasModule)}
        {tabBtn("vertex", ".vert", hasVertex)}
        {tabBtn("fragment", ".frag", hasFragment)}
        {tabBtn("logs", "logs", hasLogs)}
      </div>

      {artifact.errors.length > 0 && activeTab !== "logs" && (
        <div className="px-3 py-2 text-[11px] text-[#fda4af] shrink-0 border-b border-[rgba(248,113,113,0.2)]">
          {artifact.errors[0]}
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-hidden">
        {activeTab === "logs" ? (
          <pre className="h-full overflow-auto p-3 text-[11px] font-mono text-[#e8dcc4] whitespace-pre-wrap">
            {displayCode}
          </pre>
        ) : (
          <CodeEditor
            value={displayCode || "// No compiled output yet"}
            onChange={() => {}}
            language={editorLanguage}
            className="min-h-0 h-full pointer-events-none opacity-95"
          />
        )}
      </div>
    </div>
  );
}
