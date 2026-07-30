'use client'

import { useRef } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { vec3ToHexColor, normalizeColorToVec3 } from '@/lib/parameter-parser'

interface ColorControlProps {
  label: string
  value: number[]
  description?: string
  onChange: (value: number[]) => void
}

export function ColorControl({
  label,
  value,
  description,
  onChange,
}: ColorControlProps) {
  const inputRef = useRef<HTMLInputElement>(null)

  // Convert vec3 to hex for display
  const hexColor = vec3ToHexColor([value[0], value[1], value[2]])

  const handleColorChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const hexValue = e.target.value
    const rgb = normalizeColorToVec3(hexValue)
    onChange([rgb[0], rgb[1], rgb[2]])
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-medium">{label}</Label>
        <div className="flex items-center gap-2">
          <input
            type="color"
            ref={inputRef}
            value={hexColor}
            onChange={handleColorChange}
            className="w-8 h-8 rounded cursor-pointer border border-gray-600"
          />
          <Input
            type="text"
            value={hexColor}
            onChange={(e) => {
              if (inputRef.current) {
                inputRef.current.value = e.target.value
              }
              handleColorChange(e as any)
            }}
            className="w-20 h-8 px-2 font-mono text-sm"
            placeholder="#000000"
          />
        </div>
      </div>
      {description && <p className="text-xs text-gray-400">{description}</p>}
    </div>
  )
}
