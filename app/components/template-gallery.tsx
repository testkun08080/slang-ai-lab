'use client'

import {
  Palette,
  Sparkles,
  Image as ImageIcon,
  Box,
  Waves,
  Activity,
  Sun,
  Grid3x3,
  Flame,
  Hexagon,
  Layers,
  Rainbow,
  Scan,
  LayoutGrid,
} from 'lucide-react'
import {
  slangTemplates2D,
  slangTemplates3D,
  toSlangPreset,
  type SlangShaderTemplatePreset,
  type SlangTemplate2DId,
  type SlangTemplate3DId,
} from '@/lib/slang-templates'
import type { RenderMode } from '@/lib/types'

interface TemplateGalleryProps {
  onSelect: (template: SlangShaderTemplatePreset) => void
  renderMode: RenderMode
  showHeader?: boolean
}

const template2DInfo: Record<
  SlangTemplate2DId,
  { name: string; icon: React.ReactNode; description: string }
> = {
  default2d: {
    name: 'Default 2D',
    icon: <Sparkles className="w-3.5 h-3.5" />,
    description: 'Animated gradient using Slang',
  },
  paletteFlow: {
    name: 'Palette Flow',
    icon: <Palette className="w-3.5 h-3.5" />,
    description: 'Psychedelic cosine palette rings',
  },
  vertexWave: {
    name: 'Vertex Wave',
    icon: <Waves className="w-3.5 h-3.5" />,
    description: 'Animated grid deformed in the vertex shader',
  },
  textureSample: {
    name: 'Texture Sample',
    icon: <ImageIcon className="w-3.5 h-3.5" />,
    description: 'Sample iChannel0 with UV distortion',
  },
  plasmaGlow: {
    name: 'Plasma Glow',
    icon: <Layers className="w-3.5 h-3.5" />,
    description: 'Layered sine-wave plasma reacting to the mouse',
  },
  hexGrid: {
    name: 'Hex Grid',
    icon: <Hexagon className="w-3.5 h-3.5" />,
    description: 'Pulsing hexagonal tiling with glowing edges',
  },
  fireFlame: {
    name: 'Fire Flame',
    icon: <Flame className="w-3.5 h-3.5" />,
    description: 'Noise-driven flame rising from the bottom edge',
  },
}

const template3DInfo: Record<
  SlangTemplate3DId,
  { name: string; icon: React.ReactNode; description: string }
> = {
  default3d: {
    name: 'Default 3D',
    icon: <Box className="w-3.5 h-3.5" />,
    description: 'Lit surface with rim lighting',
  },
  vertexDisplace3d: {
    name: 'Vertex Displace',
    icon: <Activity className="w-3.5 h-3.5" />,
    description: 'Cube deformed in the vertex shader',
  },
  fresnel3d: {
    name: 'Fresnel Glow',
    icon: <Sun className="w-3.5 h-3.5" />,
    description: 'View-dependent rim glow',
  },
  uvChecker3d: {
    name: 'UV Checker',
    icon: <Grid3x3 className="w-3.5 h-3.5" />,
    description: 'Scrolling checker with lighting',
  },
  toonShade3d: {
    name: 'Toon Shade',
    icon: <Scan className="w-3.5 h-3.5" />,
    description: 'Cel-shaded lighting with quantized bands',
  },
  iridescent3d: {
    name: 'Iridescent',
    icon: <Rainbow className="w-3.5 h-3.5" />,
    description: 'View-dependent color-shifting coating',
  },
  wireGrid3d: {
    name: 'Wire Grid',
    icon: <LayoutGrid className="w-3.5 h-3.5" />,
    description: 'Procedural wireframe overlay with base lighting',
  },
}

export function TemplateGallery({ onSelect, renderMode, showHeader = true }: TemplateGalleryProps) {
  const templates = renderMode === '3d' ? slangTemplates3D : slangTemplates2D

  return (
    <div className="space-y-3">
      {showHeader && (
        <h3
          className="text-[10px] uppercase tracking-widest"
          style={{ color: 'var(--muted-foreground)' }}
        >
          Templates
        </h3>
      )}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {templates.map((entry) => {
          const meta =
            renderMode === '3d'
              ? template3DInfo[entry.id as SlangTemplate3DId]
              : template2DInfo[entry.id as SlangTemplate2DId]
          return (
            <button
              key={entry.id}
              type="button"
              data-testid={`template-${entry.id}`}
              className="group p-2.5 rounded-sm text-left transition-colors ghost-border hover:bg-accent"
              onClick={() => onSelect(toSlangPreset(entry))}
            >
              <div className="flex items-center gap-1.5" style={{ color: 'var(--primary)' }}>
                {meta.icon}
                <span className="text-xs font-medium">{meta.name}</span>
              </div>
              <p
                className="text-[10px] mt-1 leading-tight"
                style={{ color: 'var(--muted-foreground)' }}
              >
                {meta.description}
              </p>
            </button>
          )
        })}
      </div>
    </div>
  )
}
