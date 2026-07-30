'use client'

import { Input } from '@/components/ui/input'
import { Slider } from '@/components/ui/slider'
import { Label } from '@/components/ui/label'

interface FloatControlProps {
  label: string
  value: number
  min?: number
  max?: number
  step?: number
  description?: string
  onChange: (value: number) => void
}

export function FloatControl({
  label,
  value,
  min = 0,
  max = 1,
  step = 0.01,
  description,
  onChange,
}: FloatControlProps) {
  const handleSliderChange = (values: number[]) => {
    onChange(values[0])
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = parseFloat(e.target.value)
    if (!isNaN(newValue)) {
      const clamped = Math.max(min, Math.min(max, newValue))
      onChange(clamped)
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-medium">{label}</Label>
        <Input
          type="number"
          value={value.toFixed(2)}
          onChange={handleInputChange}
          min={min}
          max={max}
          step={step}
          className="w-20 h-8 px-2"
        />
      </div>
      <Slider
        value={[value]}
        onValueChange={handleSliderChange}
        min={min}
        max={max}
        step={step}
        className="w-full"
      />
      {description && <p className="text-xs text-gray-400">{description}</p>}
    </div>
  )
}
