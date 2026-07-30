# Slang AI Lab DESIGN.md

Design system guide for AI coding agents.  
Use this file as the single visual source of truth when generating or updating UI.

---

## 1) Visual Theme & Atmosphere

Slang AI Lab is a **dark cinematic shader lab** with a warm analog mood:

- Full-bleed render canvas is the hero.
- UI appears as floating glass layers on top of the canvas.
- Contrast is controlled, not harsh; avoid pure white.
- Accent is warm amber/gold, used sparingly for action and focus.
- Panels should feel lightweight, atmospheric, and tool-like.

Keywords: `dark`, `cinematic`, `glass`, `warm`, `technical`, `quiet`, `focused`.

---

## 2) Color Palette & Roles

Use these values directly unless a component needs a derived alpha variant.

### Core Colors

- `bg.base`: `#0d0b08` (main app background)
- `text.primary`: `#e8dcc4` (primary UI text/icons)
- `accent.primary`: `#fbbf24` (CTA, active highlights)
- `danger.primary`: `#f87171` (destructive actions)
- `status.good`: `#4ade80` (live/fps indicator)

### Glass Surface System (RGBA-first)

- `surface.panel`: `rgba(20,16,12,0.82)`
- `surface.panel.strong`: `rgba(20,16,12,0.88)`
- `surface.panel.dialog`: `rgba(20,16,12,0.96)`
- `surface.soft`: `rgba(255,245,220,0.06)`
- `surface.soft.hover`: `rgba(255,245,220,0.10)`
- `surface.soft.active`: `rgba(255,245,220,0.14)`
- `surface.soft.selected`: `rgba(255,245,220,0.20)`

### Border & Text Secondary

- `border.default`: `rgba(255,245,220,0.12)`
- `border.subtle`: `rgba(255,245,220,0.10)`
- `border.weaker`: `rgba(255,245,220,0.08)`
- `text.muted`: `rgba(232,220,196,0.55)`
- `text.faint`: `rgba(232,220,196,0.45)`
- `text.placeholder`: `rgba(232,220,196,0.40)`

### Usage Rules

- Do not introduce bright neon accents except shader output content.
- Keep UI layers in warm-neutral brown/amber spectrum.
- Prefer alpha overlays over solid blocks for depth.
- Accent (`#fbbf24`) should typically occupy less than 10% of visible UI area.

---

## 3) Typography Rules

### Font Roles

- **Brand wordmark**: serif + italic treatment.
- **UI body and controls**: clean sans-serif, compact and readable.
- **Technical readouts** (`fps`, `u_time`, file tabs, values): monospace.

### Size Hierarchy (typical)

- 10px: metadata, HUD, helper labels.
- 11-12px: chips, compact controls, secondary labels.
- 13-14px: standard body text.
- 15px: branding emphasis.

### Text Tone

- Keep copy short and functional.
- Prefer sentence case in UI labels.
- Avoid heavy all-caps except tiny utility labels.

---

## 4) Component Stylings

### Floating Chip (`FloatChip` style)

- Rounded pill shape.
- Soft translucent background with subtle border.
- Small text + icon alignment.
- Hover increases surface opacity slightly.

### Toggle Pill (`TogglePill` style)

- Compact, chip-like toggle.
- Active: stronger translucent fill and brighter text.
- Inactive: faint text with hover reveal.

### Dock Button (`DockBtn` style)

- Circular icon-only button.
- Default transparent.
- Hover gets soft warm overlay.
- Active state uses stronger overlay (`surface.soft.selected`).

### Floating Panel (`FloatPanel` style)

- Glass card with blur + warm dark tint.
- Thin low-contrast border.
- Header with title, optional subtitle, close button.
- Entry/exit motion is subtle (fade + slight scale/translate).

### Input & Slider Tone

- Inputs: dark translucent fill + thin warm border.
- Placeholder text is muted and low contrast.
- Sliders and actionable controls use amber accents selectively.

---

## 5) Layout Principles

### Layer Order

1. Full-screen shader canvas
2. Film grain overlay
3. Top app bar (floating chips)
4. Bottom dock and prompt area
5. HUD and floating side panels
6. Modal/dialog overlays

### Spatial System

- Floating UI sits near viewport edges with consistent breathing room.
- Panels are absolutely positioned on desktop for tool-like workflow.
- Keep horizontal and vertical rhythm compact; this is a creation tool, not marketing UI.
- Preserve visibility of canvas whenever possible.

### Composition Priority

- Canvas first, controls second.
- Never let panel chrome visually overpower shader output.

---

## 6) Depth & Elevation

Depth is created through **blur + alpha + border**, not strong shadows:

- Use `backdrop-filter: blur(20px)` (and webkit variant where needed) for major glass containers.
- Borders stay faint and warm-neutral.
- Shadows are soft and broad when needed, never sharp or black-heavy.
- Elevation increases by adding opacity and blur, not by changing hue.

---

## 7) Do's and Don'ts

### Do

- Keep corners rounded and consistent across chips/panels/dialogs.
- Reuse the warm neutral RGBA system for every new surface.
- Use muted text for metadata and tertiary controls.
- Preserve compact, tool-centric spacing.
- Keep motion short and restrained.

### Don't

- Do not use pure white backgrounds or high-saturation UI palettes.
- Do not apply default library styles without theming to this system.
- Do not add thick borders or heavy drop shadows.
- Do not turn the layout into dense boxed grids that hide the canvas.
- Do not use multiple accent colors for core actions.

---

## 8) Responsive Behavior

### Desktop (`lg` and up)

- Multi-panel floating workspace.
- Separate zones for code, projects, parameters/textures, and AI prompt.
- Bottom dock remains compact and centered.

### Mobile (below `lg`)

- Consolidate controls into a bottom sheet style container.
- Use tabbed sections (`AI`, `Editor`, `Params`, `Projects`).
- Keep playback controls reachable with thumb-friendly spacing.
- Retain the same color/material language as desktop.

---

## 9) Agent Prompt Guide

When generating UI in this repo, follow this exact instruction:

> Use `DESIGN.md` as the source of truth. Build a dark cinematic interface with warm amber accents, translucent glass panels, low-contrast warm borders, and compact tool-focused spacing. Keep the shader canvas as the visual priority. Reuse the exact palette and component behavior defined in this file, especially floating chips, dock buttons, and blur-based panels.

Short prompt variants:

- "Apply Slang AI Lab glass-dark design system from `DESIGN.md`."
- "Keep UI in Slang AI Lab style: warm-neutral dark, amber accent, compact floating tools."
- "Match existing Slang AI Lab panel/chip/dock tone and spacing defined in `DESIGN.md`."

---

## Implementation Notes for Agents

- Prefer extending existing UI primitives over creating brand-new visual patterns.
- If using shadcn/ui components, theme them with this palette/material system before shipping.
- If a conflict occurs between component defaults and this file, this file wins.
