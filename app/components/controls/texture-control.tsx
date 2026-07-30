'use client'

import { useRef } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'

interface TextureControlProps {
  label: string
  value: string
  description?: string
  onChange: (value: string) => void
}

export function TextureControl({
  label,
  value,
  description,
  onChange,
}: TextureControlProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string
      onChange(dataUrl)
    }
    reader.readAsDataURL(file)
  }

  const handleClear = () => {
    onChange('')
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const getFileName = () => {
    if (!value) return 'No texture selected'
    if (value.startsWith('data:')) return 'Texture uploaded'
    const url = new URL(value)
    return url.pathname.split('/').pop() || 'Texture'
  }

  return (
    <div className="space-y-2">
      <Label className="text-sm font-medium">{label}</Label>
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Input
            type="file"
            ref={fileInputRef}
            onChange={handleFileSelect}
            accept="image/*"
            className="hidden"
          />
          <Button
            onClick={() => fileInputRef.current?.click()}
            variant="outline"
            size="sm"
            className="flex-1"
          >
            Choose Image
          </Button>
          {value && (
            <Button
              onClick={handleClear}
              variant="ghost"
              size="sm"
            >
              Clear
            </Button>
          )}
        </div>
        <p className="text-xs text-gray-400">{getFileName()}</p>
      </div>
      {description && <p className="text-xs text-gray-400">{description}</p>}
    </div>
  )
}
