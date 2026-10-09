"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Settings, Key, Check, ExternalLink, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { DEFAULT_AI_MODELS } from "@/lib/types";
import type { AIModelOption, AISettings } from "@/lib/types";

interface SettingsPanelProps {
  settings: AISettings;
  onSettingsChange: (settings: AISettings) => void;
  /** Replace the default header trigger (must be a single element that accepts a ref) */
  trigger?: ReactNode;
  /** Dropdown alignment relative to the trigger */
  menuAlign?: "start" | "center" | "end";
  /** Dropdown side relative to the trigger */
  menuSide?: "top" | "bottom" | "left" | "right";
}

export function SettingsPanel({
  settings,
  onSettingsChange,
  trigger,
  menuAlign = "end",
  menuSide = "bottom",
}: SettingsPanelProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [saved, setSaved] = useState(false);
  const [showModelList, setShowModelList] = useState(false);
  const [models, setModels] = useState<AIModelOption[]>(DEFAULT_AI_MODELS);
  const [isLoadingModels, setIsLoadingModels] = useState(false);
  const [modelLoadWarning, setModelLoadWarning] = useState<string | null>(null);

  const handleSaveApiKey = () => {
    onSettingsChange({ ...settings, apiKey: apiKeyInput, useCustomKey: true });
    setSaved(true);
    setApiKeyInput("");
    setTimeout(() => setSaved(false), 2000);
  };

  const handleClearApiKey = () => {
    onSettingsChange({ ...settings, apiKey: "", useCustomKey: false });
  };

  const handleSelectModel = (modelId: string) => {
    onSettingsChange({ ...settings, model: modelId });
    setShowModelList(false);
  };

  const hasKey = settings.useCustomKey && settings.apiKey;

  useEffect(() => {
    if (!isOpen) return;

    const controller = new AbortController();

    const loadModels = async () => {
      setIsLoadingModels(true);
      setModelLoadWarning(null);
      try {
        const apiKey = settings.useCustomKey ? settings.apiKey : "";
        const res = await fetch("/api/models", {
          signal: controller.signal,
          cache: "no-store",
          headers: apiKey ? { "x-api-key": apiKey } : {},
        });
        const data = (await res.json()) as {
          models?: AIModelOption[];
          warning?: string;
        };
        if (Array.isArray(data.models) && data.models.length > 0) {
          setModels(data.models);
        } else {
          setModels(DEFAULT_AI_MODELS);
        }
        if (data.warning) setModelLoadWarning(data.warning);
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        setModels(DEFAULT_AI_MODELS);
        setModelLoadWarning("Failed to load model list. Showing default options.");
      } finally {
        setIsLoadingModels(false);
      }
    };

    void loadModels();
    return () => controller.abort();
  }, [isOpen, settings.apiKey, settings.useCustomKey]);

  const currentModel = useMemo(() => {
    return (
      models.find((m) => m.id === settings.model) ??
      DEFAULT_AI_MODELS.find((m) => m.id === settings.model) ?? {
        id: settings.model,
        name: settings.model,
        provider: "Groq",
        tier: "balanced" as const,
      }
    );
  }, [models, settings.model]);

  return (
    <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
      <DropdownMenuTrigger asChild>
        {trigger ?? (
          <Button variant="ghost" size="sm" className="ghost-border">
            <Settings className="w-4 h-4" />
            <span className="ml-2 hidden sm:inline text-xs">Settings</span>
          </Button>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align={menuAlign}
        side={menuSide}
        className="w-72"
        style={{
          borderRadius: "10px",
          background: "rgba(20,16,12,0.92)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          border: "1px solid rgba(255,245,220,0.14)",
          boxShadow: "0 12px 48px rgba(0,0,0,0.4)",
          "--background": "rgba(20,16,12,0.92)",
          "--foreground": "#e8dcc4",
          "--muted": "rgba(255,245,220,0.08)",
          "--muted-foreground": "rgba(232,220,196,0.55)",
          "--border": "rgba(255,245,220,0.12)",
          "--input": "rgba(255,245,220,0.08)",
          "--primary": "#fbbf24",
          "--primary-foreground": "#0d0b08",
          "--accent": "rgba(255,245,220,0.1)",
        } as React.CSSProperties}
      >
        <DropdownMenuLabel
          className="text-[10px] uppercase tracking-widest"
          style={{ color: "var(--muted-foreground)" }}
        >
          AI Model
        </DropdownMenuLabel>
        <div className="px-2 py-1.5">
          <button
            onClick={() => setShowModelList(!showModelList)}
            className="w-full flex items-center justify-between rounded-sm px-2 py-2 transition-colors hover:bg-accent"
            style={{ backgroundColor: "var(--muted)" }}
          >
            <div className="text-left">
              <p className="text-sm font-medium" style={{ color: "var(--foreground)" }}>{currentModel.name}</p>
              <p
                className="text-[10px]"
                style={{ color: "var(--muted-foreground)" }}
              >
                {currentModel.provider}
              </p>
            </div>
            <ChevronDown className="w-4 h-4" style={{ color: "var(--primary)" }} />
          </button>
          {showModelList && (
            <div className="mt-2 space-y-1 pt-2 border-t border-border">
              {models.map((model) => (
                <button
                  key={model.id}
                  onClick={() => handleSelectModel(model.id)}
                  className="w-full flex items-center justify-between rounded-sm px-2 py-2 transition-colors hover:bg-accent text-left"
                  style={{
                    backgroundColor: settings.model === model.id ? "var(--primary)" : "transparent",
                    color: settings.model === model.id ? "var(--primary-foreground)" : "var(--foreground)"
                  }}
                >
                  <div>
                    <p className="text-xs font-medium">{model.name}</p>
                    <p className="text-[10px]" style={{ opacity: 0.7 }}>
                      {model.tier === "fast" ? "Low cost · Fast" : model.tier === "pro" ? "High quality" : "Balanced"}
                    </p>
                  </div>
                  {settings.model === model.id && (
                    <Check className="w-3.5 h-3.5 shrink-0" />
                  )}
                </button>
              ))}
              {isLoadingModels && (
                <p className="px-2 py-1 text-[10px]" style={{ color: "var(--muted-foreground)" }}>
                  Loading models from Groq...
                </p>
              )}
              {modelLoadWarning && (
                <p className="px-2 py-1 text-[10px]" style={{ color: "var(--muted-foreground)" }}>
                  {modelLoadWarning}
                </p>
              )}
            </div>
          )}
        </div>

        <DropdownMenuSeparator />
        <DropdownMenuLabel
          className="text-[10px] uppercase tracking-widest"
          style={{ color: "var(--muted-foreground)" }}
        >
          Groq API Key
        </DropdownMenuLabel>

        <div className="px-2 py-2 space-y-2">
          {hasKey ? (
            <>
              <div
                className="flex items-center gap-2 px-3 py-2 rounded-sm"
                style={{ backgroundColor: "var(--muted)" }}
              >
                <Check
                  className="w-3.5 h-3.5 shrink-0"
                  style={{ color: "var(--primary)" }}
                />
                <span className="text-xs">API key configured</span>
              </div>
              <Button
                size="sm"
                variant="ghost"
                className="w-full rounded-sm text-xs ghost-border"
                onClick={handleClearApiKey}
              >
                Remove API Key
              </Button>
            </>
          ) : (
            <>
              <div className="relative">
                <Key
                  className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5"
                  style={{ color: "var(--muted-foreground)" }}
                />
                <input
                  type="password"
                  value={apiKeyInput}
                  onChange={(e) => setApiKeyInput(e.target.value)}
                  onKeyDown={(e) =>
                    e.key === "Enter" &&
                    apiKeyInput.trim() &&
                    handleSaveApiKey()
                  }
                  placeholder="gsk_..."
                  className="w-full min-h-11 pl-9 pr-3 py-2 rounded-sm text-base md:text-xs focus:outline-none focus:ring-1"
                  style={{
                    backgroundColor: "var(--input)",
                    border: "0.5px solid var(--border)",
                    color: "var(--foreground)",
                  }}
                />
              </div>
              <Button
                size="sm"
                className="w-full rounded-sm text-xs"
                onClick={handleSaveApiKey}
                disabled={!apiKeyInput.trim()}
              >
                {saved ? <Check className="w-3.5 h-3.5 mr-1.5" /> : null}
                {saved ? "Saved" : "Save API Key"}
              </Button>
              <a
                href="https://console.groq.com/keys"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-[10px] hover:underline"
                style={{ color: "var(--muted-foreground)" }}
              >
                <ExternalLink className="w-3 h-3" />
                Get a free API key from console.groq.com
              </a>
            </>
          )}
          <p
            className="text-[10px]"
            style={{ color: "var(--muted-foreground)" }}
          >
            API keys are stored in this browser only and are sent only to this app&apos;s API, which forwards them to Groq.
          </p>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
