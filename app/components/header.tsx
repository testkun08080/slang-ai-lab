"use client";

import { Github, BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SettingsPanel } from "@/components/settings-panel";
import { LogoMark } from "@/lib/logo-mark";
import type { AISettings } from "@/lib/types";

interface HeaderProps {
  settings: AISettings;
  onSettingsChange: (settings: AISettings) => void;
}

export function Header({ settings, onSettingsChange }: HeaderProps) {
  return (
    <header
      className="sticky top-0 z-50 vellum-blur"
      style={{ borderBottom: "0.5px solid var(--border)" }}
    >
      <div className="container mx-auto px-4 h-14 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <LogoMark className="text-primary" size={24} />
            <span
              className="font-serif text-lg italic tracking-tight"
              style={{ color: "var(--foreground)" }}
            >
              Slang AI Lab
            </span>
          </div>
          <span
            className="text-[10px] uppercase tracking-widest hidden sm:inline-block"
            style={{ color: "var(--muted-foreground)" }}
          >
            Shader Studio
          </span>
        </div>

        <nav className="flex items-center gap-1">
          <SettingsPanel
            settings={settings}
            onSettingsChange={onSettingsChange}
          />
          {/* <Button variant="ghost" size="sm" asChild className="ghost-border">
            <a href="https://thebookofshaders.com/" target="_blank" rel="noopener noreferrer">
              <BookOpen className="w-4 h-4" />
              <span className="hidden sm:inline ml-2 text-xs">Learn</span>
            </a>
          </Button>
          <Button variant="ghost" size="sm" asChild className="ghost-border">
            <a href="https://github.com" target="_blank" rel="noopener noreferrer">
              <Github className="w-4 h-4" />
              <span className="sr-only">GitHub</span>
            </a>
          </Button> */}
        </nav>
      </div>
    </header>
  );
}
