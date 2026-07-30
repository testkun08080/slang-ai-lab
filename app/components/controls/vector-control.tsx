'use client'

import { Input } from '@/components/ui/input'
import { Slider } from '@/components/ui/slider'
import { Label } from '@/components/ui/label'

interface VectorControlProps {
  label: string
  value: number[]
  min?: number
  max?: number
  step?: number
  dimensions: 2 | 3 | 4
  labels?: string[]
  description?: string
  onChange: (value: number[]) => void
}

const DEFAULT_LABELS = {
  2: ['X', 'Y'],
  3: ['X', 'Y', 'Z'],
  4: ['X', 'Y', 'Z', 'W'],
}

export function VectorControl({
  label,
  value,
  min = 0,
  max = 1,
  step = 0.01,
  dimensions,
  labels: customLabels,
  description,
  onChange,
}: VectorControlProps) {
  const labels = customLabels || DEFAULT_LABELS[dimensions]

  const handleValueChange = (index: number, newValue: number) => {
    const updated = [...value]
    const clamped = Math.max(min, Math.min(max, newValue))
    updated[index] = clamped
    onChange(updated)
  }

  const handleInputChange = (index: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = parseFloat(e.target.value)
    if (!isNaN(newValue)) {
      handleValueChange(index, newValue)
    }
  }

  const handleSliderChange = (index: number, values: number[]) => {
    handleValueChange(index, values[0])
  }

  return (
    <div className="space-y-2">
      <Label className="text-sm font-medium">{label}</Label>
      <div className="space-y-3">
        {Array.from({ length: dimensions }).map((_, index) => (
          <div key={index}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-gray-400">{labels[index]}</span>
              <Input
                type="number"
                value={value[index].toFixed(2)}
                onChange={(e) => handleInputChange(index, e)}
                min={min}
                max={max}
                step={step}
                className="w-16 h-7 px-2 text-xs"
              />
            </div>
            <Slider
              value={[value[index]]}
              onValueChange={(vals) => handleSliderChange(index, vals)}
              min={min}
              max={max}
              step={step}
              className="w-full"
            />
          </div>
        ))}
      </div>
      {description && <p className="text-xs text-gray-400">{description}</p>}
    </div>
  )
}
