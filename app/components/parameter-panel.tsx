'use client'

import type { UniformParameter } from '@/lib/types'
import { FloatControl } from '@/components/controls/float-control'
import { VectorControl } from '@/components/controls/vector-control'
import { ColorControl } from '@/components/controls/color-control'
import { TextureControl } from '@/components/controls/texture-control'
import { ScrollArea } from '@/components/ui/scroll-area'
import { ChevronDown } from 'lucide-react'

interface ParameterPanelProps {
  parameters: UniformParameter[]
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  onParameterChange: (name: string, value: number | number[] | string) => void
}

export function ParameterPanel({
  parameters,
  isOpen,
  onOpenChange,
  onParameterChange,
}: ParameterPanelProps) {
  return (
    <div
      className={`overflow-hidden rounded-lg border transition-all ${
        isOpen ? 'h-96' : 'h-10'
      }`}
      style={{
        background: 'rgba(20,16,12,0.82)',
        borderColor: 'rgba(255,245,220,0.12)',
      }}
    >
      <button
        onClick={() => onOpenChange(!isOpen)}
        className="flex h-10 w-full items-center justify-between border-b px-4 transition-colors"
        style={{
          background: 'rgba(255,245,220,0.06)',
          borderBottomColor: 'rgba(255,245,220,0.1)',
          color: '#e8dcc4',
        }}
      >
        <span className="text-sm font-semibold">
          Parameters ({parameters.length})
        </span>
        <ChevronDown
          size={16}
          className={`transition-transform ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      {isOpen && (
        <ScrollArea className="h-[calc(100%-2.5rem)] w-full">
          <div className="p-4 space-y-4">
            {parameters.length === 0 ? (
              <p className="text-xs text-[rgba(232,220,196,0.55)]">
                No exposed parameters yet. Choose a template or add uniforms with `@param` comments.
              </p>
            ) : (
              parameters.map((param) => (
                <ParameterControl
                  key={param.name}
                  parameter={param}
                  onChange={(value) => onParameterChange(param.name, value)}
                />
              ))
            )}
          </div>
        </ScrollArea>
      )}
    </div>
  )
}

interface ParameterControlProps {
  parameter: UniformParameter
  onChange: (value: number | number[] | string) => void
}

function ParameterControl({ parameter, onChange }: ParameterControlProps) {
  switch (parameter.type) {
    case 'float':
    case 'int':
      return (
        <FloatControl
          label={parameter.label || parameter.name}
          value={parameter.value as number}
          min={parameter.min}
          max={parameter.max}
          step={parameter.step}
          description={parameter.description}
          onChange={onChange}
        />
      )

    case 'vec2':
      return (
        <VectorControl
          label={parameter.label || parameter.name}
          value={parameter.value as number[]}
          min={parameter.min}
          max={parameter.max}
          step={parameter.step}
          dimensions={2}
          description={parameter.description}
          onChange={onChange}
        />
      )

    case 'vec3':
      return (
        <VectorControl
          label={parameter.label || parameter.name}
          value={parameter.value as number[]}
          min={parameter.min}
          max={parameter.max}
          step={parameter.step}
          dimensions={3}
          description={parameter.description}
          onChange={onChange}
        />
      )

    case 'vec4':
      return (
        <VectorControl
          label={parameter.label || parameter.name}
          value={parameter.value as number[]}
          min={parameter.min}
          max={parameter.max}
          step={parameter.step}
          dimensions={4}
          description={parameter.description}
          onChange={onChange}
        />
      )

    case 'color':
      return (
        <ColorControl
          label={parameter.label || parameter.name}
          value={parameter.value as number[]}
          description={parameter.description}
          onChange={onChange}
        />
      )

    case 'texture':
      return (
        <TextureControl
          label={parameter.label || parameter.name}
          value={parameter.value as string}
          description={parameter.description}
          onChange={onChange}
        />
      )

    default:
      return null
  }
}
