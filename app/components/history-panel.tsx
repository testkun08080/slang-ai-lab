"use client";

import { useState, useRef, useEffect } from "react";
import {
  Plus,
  Trash2,
  Edit2,
  Check,
  X,
  Clock,
  FileCode2,
  Sparkles,
  History,
  RotateCcw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from "@/components/ui/collapsible";
import type { AIShaderHistoryEntry, ShaderProject } from "@/lib/types";
import { TemplateGallery } from "@/components/template-gallery";
import type { RenderMode } from "@/lib/types";
import type { SlangShaderTemplatePreset } from "@/lib/slang-templates";

interface HistoryPanelProps {
  projects: ShaderProject[];
  currentProjectId: string | null;
  currentRenderMode: RenderMode;
  onSelectProject: (project: ShaderProject) => void;
  onNewProject: (mode: RenderMode) => void;
  onDeleteProject: (id: string) => void;
  onRenameProject: (id: string, name: string) => void;
  onSelectTemplate: (template: SlangShaderTemplatePreset) => void;
  /** AIチャットで生成したシェーダー（プロジェクトごと、新しい順） */
  aiShaderHistory: AIShaderHistoryEntry[];
  currentVertexShader: string;
  currentFragmentShader: string;
  onApplyAiShaderHistory: (entry: AIShaderHistoryEntry) => void;
  onRemoveAiShaderHistoryEntry: (entryId: string) => void;
  onClearAiShaderHistory: () => void;
  /** フローティングパネル内での表示。ロゴヘッダーを非表示にしダークスタイルを適用 */
  floatingMode?: boolean;
}

export function HistoryPanel({
  projects,
  currentProjectId,
  currentRenderMode,
  onSelectProject,
  onNewProject,
  onDeleteProject,
  onRenameProject,
  onSelectTemplate,
  aiShaderHistory,
  currentVertexShader,
  currentFragmentShader,
  onApplyAiShaderHistory,
  onRemoveAiShaderHistoryEntry,
  onClearAiShaderHistory,
  floatingMode = false,
}: HistoryPanelProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const renameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!editingId) return;
    const el = renameInputRef.current;
    if (!el) return;
    el.focus();
    el.select();
    requestAnimationFrame(() => {
      el.scrollIntoView({ block: "nearest", behavior: "smooth" });
    });
  }, [editingId]);

  const handleStartRename = (project: ShaderProject) => {
    setEditingId(project.id);
    setEditName(project.name);
  };

  const handleConfirmRename = () => {
    if (editingId && editName.trim()) {
      onRenameProject(editingId, editName.trim());
    }
    setEditingId(null);
    setEditName("");
  };

  const handleCancelRename = () => {
    setEditingId(null);
    setEditName("");
  };

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString("en-US");
  };

  return (
    <div className="flex flex-col h-full" style={floatingMode ? { color: "#e8dcc4" } : undefined}>
      {!floatingMode && (
        <div
          className="p-4 space-y-3 shrink-0"
          style={{ borderBottom: "0.5px solid var(--border)" }}
        >
          <div className="flex items-center gap-2">
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              className="text-primary"
            >
              <path
                d="M12 2L2 7V17L12 22L22 17V7L12 2Z"
                stroke="currentColor"
                strokeWidth="1.5"
                fill="none"
              />
              <path
                d="M12 6L6 9V15L12 18L18 15V9L12 6Z"
                fill="currentColor"
                opacity="0.3"
              />
              <path
                d="M12 10L9 11.5V14.5L12 16L15 14.5V11.5L12 10Z"
                fill="currentColor"
              />
            </svg>
            <span className="font-serif text-base italic tracking-tight">
              Slang AI Lab
            </span>
          </div>
        </div>
      )}

      <div
        className="flex items-center justify-between p-4 shrink-0"
        style={{ borderBottom: "0.5px solid var(--border)" }}
      >
        <h2
          className="font-serif italic text-sm"
          style={{ color: "var(--foreground)" }}
        >
          Projects
        </h2>
        <div className="flex items-center gap-1.5">
          <Button
            variant="ghost"
            size="sm"
            data-testid="new-project-2d"
            onClick={() => onNewProject("2d")}
            className="ghost-border text-xs px-2"
            title="Create a 2D shader project"
          >
            <Plus className="w-3.5 h-3.5" />
            <span className="ml-1">2D</span>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            data-testid="new-project-3d"
            onClick={() => onNewProject("3d")}
            className="ghost-border text-xs px-2"
            title="Create a 3D shader project"
          >
            <Plus className="w-3.5 h-3.5" />
            <span className="ml-1">3D</span>
          </Button>
        </div>
      </div>

      <ScrollArea className="flex-1 min-h-0">
        <div className="p-2 space-y-1">
          {projects.length === 0 ? (
            <div
              className="text-center py-8"
              style={{ color: "var(--muted-foreground)" }}
            >
              <FileCode2 className="w-10 h-10 mx-auto mb-3 opacity-40" />
              <p className="text-xs uppercase tracking-wide">No projects yet</p>
              <p className="text-[10px] mt-1 opacity-70">
                Create a 2D or 3D shader
              </p>
            </div>
          ) : (
            projects.map((project) => (
              <div
                key={project.id}
                className="group relative rounded-sm transition-colors"
                style={{
                  backgroundColor:
                    currentProjectId === project.id
                      ? "var(--accent)"
                      : "transparent",
                  border:
                    currentProjectId === project.id
                      ? "0.5px solid var(--primary)"
                      : "0.5px solid transparent",
                }}
              >
                {editingId === project.id ? (
                  <div
                    className="p-3 space-y-2"
                    style={{
                      border: "0.5px solid var(--primary)",
                      borderRadius: "2px",
                      backgroundColor: "var(--muted)",
                    }}
                  >
                    <p
                      className="text-[10px] leading-snug"
                      style={{ color: "var(--muted-foreground)" }}
                    >
                      Editing project name. Press Save or Enter to confirm,
                      and Esc or Cancel to discard.
                    </p>
                    <input
                      ref={renameInputRef}
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      enterKeyHint="done"
                      className="w-full min-h-11 px-2 py-2 rounded-sm text-base md:text-sm focus:outline-none focus:ring-1"
                      style={{
                        backgroundColor: "var(--input)",
                        border: "0.5px solid var(--border)",
                        color: "var(--foreground)",
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleConfirmRename();
                        if (e.key === "Escape") handleCancelRename();
                      }}
                    />
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        type="button"
                        size="sm"
                        className="h-9 px-3 text-xs shrink-0"
                        onClick={handleConfirmRename}
                        disabled={!editName.trim()}
                      >
                        <Check className="w-3.5 h-3.5 mr-1.5" />
                        Save
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-9 px-3 text-xs ghost-border shrink-0"
                        onClick={handleCancelRename}
                      >
                        <X className="w-3.5 h-3.5 mr-1.5" />
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div
                    onClick={() => onSelectProject(project)}
                    className="w-full text-left p-3 hover:bg-accent/50 transition-colors rounded-sm cursor-pointer"
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onSelectProject(project);
                      }
                    }}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">
                          {project.name}
                        </p>
                        <div className="flex items-center gap-2 mt-1.5">
                          <Clock
                            className="w-3 h-3"
                            style={{ color: "var(--muted-foreground)" }}
                          />
                          <span
                            className="text-[10px]"
                            style={{ color: "var(--muted-foreground)" }}
                          >
                            {formatDate(project.updatedAt)}
                          </span>
                          <span
                            className="uppercase text-[9px] px-1.5 py-0.5 rounded-sm font-mono"
                            style={{
                              backgroundColor: "var(--muted)",
                              color: "var(--muted-foreground)",
                            }}
                          >
                            {project.language}
                          </span>
                          <span
                            className="uppercase text-[9px] px-1.5 py-0.5 rounded-sm font-mono"
                            style={{
                              backgroundColor: project.renderMode === "3d" ? "var(--primary)" : "var(--muted)",
                              color: project.renderMode === "3d" ? "var(--primary-foreground)" : "var(--muted-foreground)",
                            }}
                          >
                            {project.renderMode}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity shrink-0">
                        <button
                          type="button"
                          className="h-8 w-8 md:h-6 md:w-6 inline-flex items-center justify-center rounded-sm hover:bg-accent"
                          title="Rename project"
                          aria-label="Rename project"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleStartRename(project);
                          }}
                        >
                          <Edit2 className="w-3.5 h-3.5 md:w-3 md:h-3" />
                        </button>
                        <button
                          type="button"
                          className="h-8 w-8 md:h-6 md:w-6 inline-flex items-center justify-center rounded-sm hover:bg-accent"
                          title="Delete project"
                          aria-label="Delete project"
                          onClick={(e) => {
                            e.stopPropagation();
                            onDeleteProject(project.id);
                          }}
                          style={{ color: "var(--destructive)" }}
                        >
                          <Trash2 className="w-3.5 h-3.5 md:w-3 md:h-3" />
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        {/* AI シェーダー履歴（チャット欄にはコードを出さず、ここで遡って適用） */}
        <div
          className="px-3 pt-3 pb-2 shrink-0"
          style={{ borderTop: "0.5px solid var(--border)" }}
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <History
                className="w-3.5 h-3.5 shrink-0"
                style={{ color: "var(--primary)" }}
              />
              <h2
                className="font-serif italic text-xs truncate"
                style={{ color: "var(--foreground)" }}
              >
                AI Shader History
              </h2>
            </div>
            {aiShaderHistory.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onClearAiShaderHistory}
                className="text-[10px] ghost-border h-6 px-2 shrink-0"
              >
                Clear
              </Button>
            )}
          </div>
        </div>
        <div className="px-2 pb-3 space-y-1">
          {aiShaderHistory.length === 0 ? (
            <p
              className="text-[10px] px-2 py-2 rounded-sm"
              style={{
                color: "var(--muted-foreground)",
                backgroundColor: "var(--muted)",
              }}
            >
              Generated shaders will appear here. Click Apply to restore a previous version.
            </p>
          ) : (
            aiShaderHistory.map((entry) => {
              const isActive =
                entry.fragmentShader === currentFragmentShader &&
                entry.vertexShader === currentVertexShader;
              return (
                <div
                  key={entry.id}
                  className="group rounded-sm p-2.5 transition-colors"
                  style={{
                    backgroundColor: isActive
                      ? "var(--accent)"
                      : "var(--muted)",
                    border: isActive
                      ? "0.5px solid var(--primary)"
                      : "0.5px solid transparent",
                  }}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] leading-snug line-clamp-3">
                        {entry.summary}
                      </p>
                      <div className="flex items-center gap-1.5 mt-1.5">
                        <Clock
                          className="w-3 h-3"
                          style={{ color: "var(--muted-foreground)" }}
                        />
                        <span
                          className="text-[9px]"
                          style={{ color: "var(--muted-foreground)" }}
                        >
                          {formatDate(entry.createdAt)}
                        </span>
                        {isActive && (
                          <span
                            className="text-[9px] px-1 py-0 rounded-sm font-mono uppercase"
                            style={{
                              backgroundColor: "var(--primary)",
                              color: "var(--primary-foreground)",
                            }}
                          >
                            Active
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-col gap-1 shrink-0">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-[10px] ghost-border"
                        onClick={() => onApplyAiShaderHistory(entry)}
                        title="Apply this version to editor and preview"
                      >
                        <RotateCcw className="w-3 h-3 mr-1" />
                        Apply
                      </Button>
                      <button
                        type="button"
                        className="h-6 w-full inline-flex items-center justify-center rounded-sm text-[10px] opacity-60 md:opacity-0 md:group-hover:opacity-100 hover:bg-destructive/10 hover:opacity-100 transition-opacity"
                        style={{ color: "var(--destructive)" }}
                        onClick={() => onRemoveAiShaderHistoryEntry(entry.id)}
                        title="Delete this history entry"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </ScrollArea>

      {/* Templates */}
      <div
        className="p-4 shrink-0"
        style={{ borderTop: "0.5px solid var(--border)" }}
      >
        <Collapsible defaultOpen={false}>
          <CollapsibleTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-between ghost-border text-xs"
              style={{ paddingLeft: 10, paddingRight: 10 }}
            >
              <span className="flex items-center gap-2">
                <Sparkles
                  className="w-4 h-4"
                  style={{ color: "var(--primary)" }}
                />
                Templates ({currentRenderMode.toUpperCase()})
              </span>
              <span className="text-[10px] uppercase tracking-wide opacity-70">
                Toggle
              </span>
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="pt-3 max-h-[50vh] overflow-y-auto">
              <TemplateGallery onSelect={onSelectTemplate} renderMode={currentRenderMode} showHeader={false} />
            </div>
          </CollapsibleContent>
        </Collapsible>
      </div>
    </div>
  );
}
