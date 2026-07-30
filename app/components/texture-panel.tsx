'use client'

import { useState, useCallback } from 'react'
import { X, Upload, Camera, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import type { TextureSlot } from '@/lib/types'
import { loadImageToBase64 } from '@/lib/texture-utils'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

interface TexturePanelProps {
  textures: TextureSlot[]
  onTextureAdd: (slot: TextureSlot) => void
  onTextureRemove: (id: "iChannel0" | "iChannel1" | "iChannel2" | "iChannel3") => void
  onTextureUpdate: (slot: TextureSlot) => void
  /** Remove every texture slot for the current project at once */
  onClearAllTextures?: () => void
}

const CHANNEL_IDS = ['iChannel0', 'iChannel1', 'iChannel2', 'iChannel3'] as const
const CHANNEL_LABELS = {
  iChannel0: 'Channel 0',
  iChannel1: 'Channel 1',
  iChannel2: 'Channel 2',
  iChannel3: 'Channel 3',
}

export function TexturePanel({
  textures,
  onTextureAdd,
  onTextureRemove,
  onClearAllTextures,
}: TexturePanelProps) {
  const [uploading, setUploading] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [previewSlot, setPreviewSlot] = useState<TextureSlot | null>(null)

  const getTextureSlot = useCallback(
    (id: typeof CHANNEL_IDS[number]): TextureSlot | undefined => {
      return textures.find((t) => t.id === id)
    },
    [textures]
  )

  const handleFileSelect = useCallback(
    async (channelId: typeof CHANNEL_IDS[number], file: File) => {
      setError(null)
      setUploading(channelId)

      try {
        const { base64, width, height, mimeType, wasResized } =
          await loadImageToBase64(file)

        if (wasResized) {
          toast.info(`Image resized to ${width}×${height} for WebGL compatibility`)
        }

        const newSlot: TextureSlot = {
          id: channelId,
          name: file.name.split('.')[0] || `Texture ${channelId}`,
          base64Data: base64,
          width,
          height,
          mimeType: mimeType as TextureSlot['mimeType'],
          uploadedAt: Date.now(),
        }

        onTextureAdd(newSlot)
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to load image'
        setError(message)
        console.error('Texture load error:', err)
      } finally {
        setUploading(null)
      }
    },
    [onTextureAdd]
  )

  const hasAnyTexture = textures.length > 0

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">Textures</h3>
        <div className="flex items-center gap-2 shrink-0">
          {error && (
            <span className="text-xs text-destructive max-w-[50%] truncate">{error}</span>
          )}
          {onClearAllTextures && hasAnyTexture && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 text-xs shrink-0"
              onClick={() => {
                onClearAllTextures()
                toast.success('Removed all textures from this project')
              }}
            >
              <Trash2 className="h-3.5 w-3.5" />
              Clear all
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {CHANNEL_IDS.map((channelId) => {
          const slot = getTextureSlot(channelId)
          const isLoading = uploading === channelId

          return (
            <div
              key={channelId}
              className="flex flex-col gap-2 rounded-md border border-border p-3"
              style={{ backgroundColor: 'var(--muted)' }}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono text-muted-foreground">
                  {CHANNEL_LABELS[channelId]}
                </span>
                {slot && (
                  <button
                    onClick={() => onTextureRemove(channelId)}
                    className="flex h-5 w-5 items-center justify-center rounded transition-colors hover:bg-destructive/20"
                    title="Remove texture"
                  >
                    <X className="h-3.5 w-3.5 text-destructive" />
                  </button>
                )}
              </div>

              {slot ? (
                <div className="flex flex-col gap-2">
                  <button
                    type="button"
                    onClick={() => setPreviewSlot(slot)}
                    className="relative block w-full overflow-hidden rounded border border-border/60 bg-muted/50 p-0 text-left outline-none ring-offset-background transition hover:border-primary/50 focus-visible:ring-2 focus-visible:ring-ring"
                    title="View full preview"
                  >
                    <img
                      src={slot.base64Data}
                      alt={slot.name}
                      className="h-20 w-full object-contain"
                    />
                  </button>
                  <div className="text-xs text-muted-foreground">
                    <div className="truncate">{slot.name}</div>
                    <div>
                      {slot.width} × {slot.height}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex gap-2">
                  <label className="flex flex-1 cursor-pointer flex-col items-center justify-center gap-2 rounded border-2 border-dashed border-muted-foreground/30 py-6 transition-colors hover:border-muted-foreground/50">
                    <Upload className="h-4 w-4 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">
                      {isLoading ? 'Loading...' : 'Upload'}
                    </span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => {
                        const file = e.target.files?.[0]
                        if (file) {
                          handleFileSelect(channelId, file)
                        }
                      }}
                      disabled={isLoading}
                      className="hidden"
                    />
                  </label>
                  <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded border-2 border-dashed border-muted-foreground/30 px-3 py-6 transition-colors hover:border-muted-foreground/50 sm:hidden">
                    <Camera className="h-4 w-4 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">
                      {isLoading ? '...' : 'Camera'}
                    </span>
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      onChange={(e) => {
                        const file = e.target.files?.[0]
                        if (file) {
                          handleFileSelect(channelId, file)
                        }
                      }}
                      disabled={isLoading}
                      className="hidden"
                    />
                  </label>
                </div>
              )}
            </div>
          )
        })}
      </div>

      <p className="text-xs text-muted-foreground">
        Large images are scaled to fit inside 2048×2048 while keeping aspect ratio. Supported: PNG, JPEG, WEBP, HEIC/HEIF
      </p>

      <Dialog open={previewSlot !== null} onOpenChange={(open) => !open && setPreviewSlot(null)}>
        <DialogContent className="max-w-3xl sm:max-w-3xl" showCloseButton>
          {previewSlot && (
            <>
              <DialogHeader>
                <DialogTitle className="truncate pr-8">{previewSlot.name}</DialogTitle>
                <p className="text-muted-foreground text-sm">
                  {CHANNEL_LABELS[previewSlot.id]} · {previewSlot.width} × {previewSlot.height}
                </p>
              </DialogHeader>
              <div className="max-h-[70vh] overflow-auto rounded-md border bg-muted/30 p-2">
                <img
                  src={previewSlot.base64Data}
                  alt={previewSlot.name}
                  className="mx-auto max-h-[min(65vh,1024px)] w-auto max-w-full object-contain"
                />
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
