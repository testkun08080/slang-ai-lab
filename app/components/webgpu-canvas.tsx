'use client'

import { useRef, useEffect, useState, useCallback, forwardRef, useImperativeHandle } from 'react'
import type { TextureSlot, UniformParameter } from '@/lib/types'
import {
  createWebGPUPlaceholderTexture,
  textureSlotToWebGPUTexture,
  type WebGPUTextureBinding,
} from '@/lib/texture-utils'
import {
  channelIdFromWgslName,
  parseWgslGroup0Bindings,
  parseWgslUniformLayout,
  type WgslBinding,
  type WgslUniformLayout,
} from '@/lib/wgsl-bindings'
import { acquireWebGPUDevice } from '@/lib/webgpu-device'

/**
 * WebGPU renderer for Slang-compiled WGSL fragment shaders.
 *
 * The canonical Slang source is compiled to WGSL by the in-browser Slang
 * compiler (see lib/slang-compiler.ts) and passed here as `wgslFragment`.
 * Uniform buffer size and field layout are parsed from the WGSL struct.
 */

interface WebGPUCanvasProps {
  /**
   * Compiled WGSL module containing `@fragment fn fragmentMain`. When a custom
   * vertex stage is used (`vertexEntryPoint` set) this same module must also
   * contain that `@vertex` function so both stages share one uniform layout.
   */
  wgslFragment: string
  /**
   * Name of a custom `@vertex` entry point inside `wgslFragment` (e.g.
   * "vertexMain"). When omitted/null the renderer draws a fullscreen triangle
   * with a built-in vertex shader.
   */
  vertexEntryPoint?: string | null
  /** Vertex count to draw. Defaults to 3 (the fullscreen triangle). */
  vertexCount?: number
  isPlaying: boolean
  timeScale?: number
  className?: string
  textures?: TextureSlot[]
  parameters?: UniformParameter[]
  /** External error (e.g. a Slang -> WGSL compile failure) to display over the canvas. */
  externalError?: string | null
  onError?: (message: string | null) => void
  onFpsUpdate?: (fps: number, width: number, height: number, mouseX: number, mouseY: number) => void
}

export interface WebGPUCanvasHandle {
  reset: () => void
}

const FULLSCREEN_VERTEX_WGSL = `
@vertex
fn vs_main(@builtin(vertex_index) vid : u32) -> @builtin(position) vec4<f32> {
  var pos = array<vec2<f32>, 3>(
    vec2<f32>(-1.0, -1.0),
    vec2<f32>( 3.0, -1.0),
    vec2<f32>(-1.0,  3.0)
  );
  return vec4<f32>(pos[vid], 0.0, 1.0);
}
`

const DEFAULT_BINDINGS: WgslBinding[] = [{ binding: 0, kind: 'uniform', name: 'GlobalParams' }]

const DEFAULT_UNIFORM_LAYOUT: WgslUniformLayout = {
  structName: 'GlobalParams',
  size: 32,
  fields: [
    { name: 'u_time', type: 'f32', offset: 0, wordCount: 1 },
    { name: 'u_resolution', type: 'vec2<f32>', offset: 8, wordCount: 2 },
    { name: 'u_mouse', type: 'vec2<f32>', offset: 16, wordCount: 2 },
  ],
}

function writeUniformBuffer(
  layout: WgslUniformLayout,
  buffer: ArrayBuffer,
  ctx: {
    time: number
    width: number
    height: number
    mouseX: number
    mouseY: number
    parameters: UniformParameter[]
  },
) {
  const view = new DataView(buffer)
  const paramByName = new Map(ctx.parameters.map((p) => [p.name, p]))

  const resolve = (name: string): number | number[] | undefined => {
    if (name === 'u_time') return ctx.time
    if (name === 'u_resolution') return [ctx.width, ctx.height]
    if (name === 'u_mouse') return [ctx.mouseX, ctx.mouseY]
    const param = paramByName.get(name)
    if (!param) return undefined
    return param.value as number | number[]
  }

  for (const field of layout.fields) {
    const raw = resolve(field.name)
    if (raw === undefined) continue
    const type = field.type.replace(/\s/g, '')

    if (type === 'f32' || type === 'i32' || type === 'u32') {
      const n = typeof raw === 'number' ? raw : raw[0] ?? 0
      if (type === 'i32') view.setInt32(field.offset, n, true)
      else if (type === 'u32') view.setUint32(field.offset, n, true)
      else view.setFloat32(field.offset, n, true)
      continue
    }

    const nums = Array.isArray(raw) ? raw : [raw]
    const count = type.startsWith('vec4') ? 4 : type.startsWith('vec3') ? 3 : 2
    for (let i = 0; i < count; i++) {
      view.setFloat32(field.offset + i * 4, nums[i] ?? 0, true)
    }
  }
}

export const WebGPUCanvas = forwardRef<WebGPUCanvasHandle, WebGPUCanvasProps>(
  function WebGPUCanvas(
    { wgslFragment, vertexEntryPoint, vertexCount = 3, isPlaying, timeScale = 1, textures, parameters, className, externalError, onError, onFpsUpdate },
    ref,
  ) {
    const canvasRef = useRef<HTMLCanvasElement>(null)
    const [error, setError] = useState<string | null>(null)
    const [unsupported, setUnsupported] = useState(false)
    const [deviceReady, setDeviceReady] = useState(false)
    const [pipelineGeneration, setPipelineGeneration] = useState(0)
    // 'canvas' presents through the WebGPU swapchain; 'readback' renders to an
    // offscreen texture and blits via CPU readback + 2D canvas. Some software
    // WebGPU stacks (e.g. SwiftShader in headless CI) lose the device as soon
    // as a canvas is presented while offscreen rendering keeps working, so we
    // fall back automatically on such a loss.
    const [presentMode, setPresentMode] = useState<'canvas' | 'readback'>('canvas')

    const deviceRef = useRef<GPUDevice | null>(null)
    const contextRef = useRef<GPUCanvasContext | null>(null)
    const ctx2dRef = useRef<CanvasRenderingContext2D | null>(null)
    const offscreenRef = useRef<GPUTexture | null>(null)
    const readbackBufferRef = useRef<GPUBuffer | null>(null)
    const readbackBusyRef = useRef(false)
    const fellBackRef = useRef(false)
    const formatRef = useRef<GPUTextureFormat>('bgra8unorm')
    const pipelineRef = useRef<GPURenderPipeline | null>(null)
    const uniformBufferRef = useRef<GPUBuffer | null>(null)
    const bindGroupRef = useRef<GPUBindGroup | null>(null)
    const bindingsRef = useRef<WgslBinding[]>(DEFAULT_BINDINGS)
    const uniformLayoutRef = useRef<WgslUniformLayout>(DEFAULT_UNIFORM_LAYOUT)
    const uniformDataRef = useRef<ArrayBuffer>(new ArrayBuffer(DEFAULT_UNIFORM_LAYOUT.size))
    const pipelineWgslRef = useRef<string>('')
    const parametersRef = useRef<UniformParameter[]>(parameters ?? [])
    const vertexDrawCountRef = useRef<number>(vertexCount)
    const placeholderRef = useRef<WebGPUTextureBinding | null>(null)
    const channelTexturesRef = useRef<Map<string, WebGPUTextureBinding>>(new Map())
    // Bumped whenever GPU resources are invalidated so in-flight async work and
    // the RAF loop can detect stale captures (avoids submit-after-destroy).
    const resourceEpochRef = useRef(0)

    const rafRef = useRef<number>(0)
    const startTimeRef = useRef<number>(0)
    const pausedTimeRef = useRef<number>(0)
    const isPlayingRef = useRef<boolean>(isPlaying)
    const timeScaleRef = useRef<number>(timeScale)
    // Normalized 0..1, top-left origin — the same space as
    // `uv = fragCoord.xy / u_resolution`, so `distance(uv, u_mouse)` works.
    const mouseRef = useRef<{ x: number; y: number }>({ x: 0.5, y: 0.5 })

    const frameCountRef = useRef(0)
    const lastFpsTimeRef = useRef(0)

    const reportError = useCallback(
      (msg: string | null) => {
        setError(msg)
        onError?.(msg)
      },
      [onError],
    )

    const destroyChannelTextures = useCallback(() => {
      for (const entry of channelTexturesRef.current.values()) {
        entry.texture.destroy()
      }
      channelTexturesRef.current.clear()
    }, [])

    useImperativeHandle(ref, () => ({
      reset: () => {
        startTimeRef.current = performance.now()
        pausedTimeRef.current = 0
      },
    }))

    useEffect(() => {
      isPlayingRef.current = isPlaying
    }, [isPlaying])
    useEffect(() => {
      timeScaleRef.current = timeScale
    }, [timeScale])
    useEffect(() => {
      parametersRef.current = parameters ?? []
    }, [parameters])
    useEffect(() => {
      vertexDrawCountRef.current = Math.max(1, Math.floor(vertexCount))
    }, [vertexCount])

    useEffect(() => {
      let disposed = false
      const canvas = canvasRef.current
      if (!canvas) return

      async function init() {
        const gpu = (navigator as Navigator & { gpu?: GPU }).gpu
        if (!gpu) {
          setUnsupported(true)
          reportError('WebGPU is not supported in this browser.')
          return
        }
        try {
          // Shared page-wide device: never destroyed on unmount (destroying it
          // can invalidate devices held by other/subsequent mounts).
          const device = await acquireWebGPUDevice()
          if (disposed) return

          if (presentMode === 'canvas') {
            const context = canvas!.getContext('webgpu') as GPUCanvasContext | null
            if (!context) {
              reportError('Failed to acquire WebGPU canvas context.')
              return
            }
            const format = gpu.getPreferredCanvasFormat()
            context.configure({ device, format, alphaMode: 'premultiplied' })
            contextRef.current = context
            formatRef.current = format
          } else {
            const ctx2d = canvas!.getContext('2d')
            if (!ctx2d) {
              reportError('Failed to acquire 2D fallback canvas context.')
              return
            }
            ctx2dRef.current = ctx2d
            // rgba8unorm matches ImageData layout for the CPU blit.
            formatRef.current = 'rgba8unorm'
          }

          placeholderRef.current = createWebGPUPlaceholderTexture(device)

          deviceRef.current = device
          startTimeRef.current = performance.now()
          setDeviceReady(true)

          device.lost.then((info) => {
            if (disposed || info.reason === 'destroyed') return
            if (presentMode === 'canvas' && !fellBackRef.current) {
              // Presenting killed the device (SwiftShader-style loss): retry
              // once with offscreen rendering + CPU readback.
              fellBackRef.current = true
              console.warn(
                `WebGPU canvas presentation lost the device (${info.message}); ` +
                  'falling back to CPU readback rendering.',
              )
              setPresentMode('readback')
            } else {
              reportError(`GPU device lost: ${info.message}`)
            }
          })
        } catch (e) {
          setUnsupported(true)
          reportError(`WebGPU initialization failed: ${(e as Error).message}`)
        }
      }

      init()

      return () => {
        disposed = true
        cancelAnimationFrame(rafRef.current)
        // Drop draw refs before destroy so a late RAF / async resume cannot
        // submit a command buffer that still references these resources.
        resourceEpochRef.current += 1
        pipelineRef.current = null
        bindGroupRef.current = null
        destroyChannelTextures()
        placeholderRef.current?.texture.destroy()
        placeholderRef.current = null
        uniformBufferRef.current?.destroy()
        uniformBufferRef.current = null
        contextRef.current?.unconfigure()
        offscreenRef.current?.destroy()
        offscreenRef.current = null
        readbackBufferRef.current?.destroy()
        readbackBufferRef.current = null
        readbackBusyRef.current = false
        deviceRef.current = null
        contextRef.current = null
        ctx2dRef.current = null
        setDeviceReady(false)
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [presentMode])

    useEffect(() => {
      const device = deviceRef.current
      if (!deviceReady || !device || !wgslFragment.trim()) return

      let cancelled = false

      async function build() {
        // Invalidate draw resources synchronously BEFORE destroying the uniform
        // buffer. The RAF loop keeps running across rebuilds; if we destroy the
        // buffer while the previous bind group still references it, the next
        // submit raises "Buffer used in submit while destroyed".
        const epoch = ++resourceEpochRef.current
        bindGroupRef.current = null
        pipelineRef.current = null

        try {
          device!.pushErrorScope('validation')

          const layout = parseWgslUniformLayout(wgslFragment) ?? DEFAULT_UNIFORM_LAYOUT
          uniformLayoutRef.current = layout
          uniformDataRef.current = new ArrayBuffer(layout.size)

          const previousUniform = uniformBufferRef.current
          const uniformBuffer = device!.createBuffer({
            label: 'slang-ai-lab-uniforms',
            size: layout.size,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
          })
          uniformBufferRef.current = uniformBuffer
          // Destroy only after the bind group that referenced it was cleared.
          previousUniform?.destroy()

          // When a custom vertex entry point is present it lives in the same
          // compiled module as the fragment stage (one Slang program -> one WGSL
          // module), so both stages share a uniform layout and binding set.
          const useCustomVertex = !!(vertexEntryPoint && vertexEntryPoint.trim())
          const fragmentModule = device!.createShaderModule({ code: wgslFragment })
          const vertexModule = useCustomVertex
            ? fragmentModule
            : device!.createShaderModule({ code: FULLSCREEN_VERTEX_WGSL })
          const vertexEntry = useCustomVertex ? vertexEntryPoint!.trim() : 'vs_main'

          const info = await fragmentModule.getCompilationInfo()
          if (cancelled || resourceEpochRef.current !== epoch) {
            device!.popErrorScope()
            return
          }
          const errors = info.messages.filter((m) => m.type === 'error')
          if (errors.length > 0) {
            const msg = errors
              .map((m) => `WGSL ${m.lineNum}:${m.linePos} ${m.message}`)
              .join('\n')
            device!.popErrorScope()
            if (!cancelled && resourceEpochRef.current === epoch) reportError(msg)
            return
          }

          const pipeline = device!.createRenderPipeline({
            layout: 'auto',
            vertex: { module: vertexModule, entryPoint: vertexEntry },
            fragment: {
              module: fragmentModule,
              entryPoint: 'fragmentMain',
              targets: [{ format: formatRef.current }],
            },
            primitive: { topology: 'triangle-list' },
          })

          const scopeError = await device!.popErrorScope()
          if (cancelled || resourceEpochRef.current !== epoch) return
          if (scopeError) {
            reportError(`WebGPU: ${scopeError.message}`)
            return
          }

          const parsed = parseWgslGroup0Bindings(wgslFragment)
          bindingsRef.current = parsed.length > 0 ? parsed : DEFAULT_BINDINGS
          pipelineRef.current = pipeline
          pipelineWgslRef.current = wgslFragment
          bindGroupRef.current = null
          setPipelineGeneration((n) => n + 1)
        } catch (e) {
          if (!cancelled && resourceEpochRef.current === epoch) reportError((e as Error).message)
        }
      }

      build()
      return () => {
        cancelled = true
        // Invalidate any in-flight bind-group work that captured the old buffer.
        resourceEpochRef.current += 1
        bindGroupRef.current = null
        pipelineRef.current = null
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [wgslFragment, vertexEntryPoint, deviceReady])

    useEffect(() => {
      const device = deviceRef.current
      const pipeline = pipelineRef.current
      const uniformBuffer = uniformBufferRef.current
      const placeholder = placeholderRef.current
      if (
        !deviceReady ||
        !device ||
        !pipeline ||
        !uniformBuffer ||
        !placeholder ||
        pipelineGeneration === 0 ||
        pipelineWgslRef.current !== wgslFragment
      ) {
        return
      }

      const parsedBindings = parseWgslGroup0Bindings(wgslFragment)
      const bindings = parsedBindings.length > 0 ? parsedBindings : bindingsRef.current
      const activePipeline = pipeline
      const epoch = resourceEpochRef.current

      let cancelled = false

      async function resolveChannelTexture(channelId: TextureSlot['id']): Promise<WebGPUTextureBinding> {
        const slot = textures?.find((t) => t.id === channelId)
        if (!slot) return placeholder!

        const cached = channelTexturesRef.current.get(channelId)
        if (cached && cached.uploadedAt === slot.uploadedAt) return cached

        if (cached) {
          cached.texture.destroy()
          channelTexturesRef.current.delete(channelId)
        }

        const uploaded = await textureSlotToWebGPUTexture(device!, slot)
        if (!cancelled && resourceEpochRef.current === epoch) {
          channelTexturesRef.current.set(channelId, uploaded)
        } else {
          uploaded.texture.destroy()
        }
        return uploaded
      }

      async function buildBindGroup() {
        try {
          device!.pushErrorScope('validation')

          const entries: GPUBindGroupEntry[] = []
          for (const binding of bindings) {
            if (binding.kind === 'uniform') {
              entries.push({ binding: binding.binding, resource: { buffer: uniformBuffer! } })
              continue
            }

            const channelId = channelIdFromWgslName(binding.name)
            const channelBinding = channelId
              ? await resolveChannelTexture(channelId)
              : placeholder!

            if (cancelled || resourceEpochRef.current !== epoch) {
              device!.popErrorScope()
              return
            }

            if (binding.kind === 'texture') {
              entries.push({ binding: binding.binding, resource: channelBinding.view })
            } else {
              entries.push({ binding: binding.binding, resource: channelBinding.sampler })
            }
          }

          if (cancelled || resourceEpochRef.current !== epoch) {
            device!.popErrorScope()
            return
          }
          // Uniform buffer may have been replaced by a newer pipeline rebuild.
          if (uniformBufferRef.current !== uniformBuffer) {
            device!.popErrorScope()
            return
          }

          const bindGroup = device!.createBindGroup({
            layout: activePipeline!.getBindGroupLayout(0),
            entries,
          })

          const scopeError = await device!.popErrorScope()
          if (cancelled || resourceEpochRef.current !== epoch) return
          if (scopeError) {
            reportError(`WebGPU: ${scopeError.message}`)
            return
          }

          bindGroupRef.current = bindGroup
          reportError(null)
        } catch (e) {
          if (!cancelled && resourceEpochRef.current === epoch) reportError((e as Error).message)
        }
      }

      buildBindGroup()

      return () => {
        cancelled = true
      }
    }, [textures, pipelineGeneration, deviceReady, wgslFragment, reportError])

    useEffect(() => {
      const activeIds = new Set((textures ?? []).map((t) => t.id))
      for (const [id, entry] of channelTexturesRef.current.entries()) {
        if (!activeIds.has(id as TextureSlot['id'])) {
          entry.texture.destroy()
          channelTexturesRef.current.delete(id)
        }
      }
    }, [textures])

    useEffect(() => {
      let disposed = false

      function resize() {
        const canvas = canvasRef.current
        if (!canvas) return
        const dpr = Math.min(window.devicePixelRatio || 1, 2)
        const w = Math.max(1, Math.floor(canvas.clientWidth * dpr))
        const h = Math.max(1, Math.floor(canvas.clientHeight * dpr))
        if (canvas.width !== w || canvas.height !== h) {
          canvas.width = w
          canvas.height = h
        }
      }

      async function blitReadback(
        buffer: GPUBuffer,
        ctx2d: CanvasRenderingContext2D,
        width: number,
        height: number,
        bytesPerRow: number,
      ) {
        try {
          await buffer.mapAsync(GPUMapMode.READ)
          const src = new Uint8Array(buffer.getMappedRange())
          const img = ctx2d.createImageData(width, height)
          for (let y = 0; y < height; y++) {
            img.data.set(src.subarray(y * bytesPerRow, y * bytesPerRow + width * 4), y * width * 4)
          }
          buffer.unmap()
          if (!disposed) ctx2d.putImageData(img, 0, 0)
        } catch {
          // Device loss / buffer destroyed mid-frame — drop the frame.
        } finally {
          readbackBusyRef.current = false
        }
      }

      function frame() {
        if (disposed) return
        rafRef.current = requestAnimationFrame(frame)

        const device = deviceRef.current
        const context = contextRef.current
        const ctx2d = ctx2dRef.current
        const pipeline = pipelineRef.current
        const bindGroup = bindGroupRef.current
        const uniformBuffer = uniformBufferRef.current
        if (!device || (!context && !ctx2d) || !pipeline || !bindGroup || !uniformBuffer) return
        // Readback mode is throttled by the previous frame's CPU blit.
        if (ctx2d && readbackBusyRef.current) return

        resize()
        const canvas = canvasRef.current!

        const now = performance.now()
        if (isPlayingRef.current) {
          const elapsed = ((now - startTimeRef.current) / 1000) * timeScaleRef.current
          pausedTimeRef.current = elapsed
        } else {
          startTimeRef.current = now - (pausedTimeRef.current / (timeScaleRef.current || 1)) * 1000
        }

        const layout = uniformLayoutRef.current
        const buffer = uniformDataRef.current
        writeUniformBuffer(layout, buffer, {
          time: pausedTimeRef.current,
          width: canvas.width,
          height: canvas.height,
          mouseX: mouseRef.current.x,
          mouseY: mouseRef.current.y,
          parameters: parametersRef.current,
        })
        device.queue.writeBuffer(uniformBuffer, 0, buffer)

        const encoder = device.createCommandEncoder()
        let view: GPUTextureView
        let bytesPerRow = 0
        if (context) {
          view = context.getCurrentTexture().createView()
        } else {
          const offscreen = offscreenRef.current
          if (!offscreen || offscreen.width !== canvas.width || offscreen.height !== canvas.height) {
            offscreen?.destroy()
            readbackBufferRef.current?.destroy()
            offscreenRef.current = device.createTexture({
              size: [canvas.width, canvas.height],
              format: 'rgba8unorm',
              usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
            })
            const rowBytes = Math.ceil((canvas.width * 4) / 256) * 256
            readbackBufferRef.current = device.createBuffer({
              size: rowBytes * canvas.height,
              usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
            })
          }
          bytesPerRow = Math.ceil((canvas.width * 4) / 256) * 256
          view = offscreenRef.current!.createView()
        }
        const pass = encoder.beginRenderPass({
          colorAttachments: [
            {
              view,
              clearValue: { r: 0, g: 0, b: 0, a: 1 },
              loadOp: 'clear',
              storeOp: 'store',
            },
          ],
        })
        pass.setPipeline(pipeline)
        pass.setBindGroup(0, bindGroup)
        pass.draw(vertexDrawCountRef.current)
        pass.end()
        if (!context) {
          encoder.copyTextureToBuffer(
            { texture: offscreenRef.current! },
            { buffer: readbackBufferRef.current!, bytesPerRow },
            [canvas.width, canvas.height],
          )
        }
        // Skip submit if a rebuild/teardown invalidated resources after we
        // captured locals (e.g. Strict Mode remount racing a late frame).
        if (
          bindGroupRef.current !== bindGroup ||
          uniformBufferRef.current !== uniformBuffer ||
          pipelineRef.current !== pipeline
        ) {
          return
        }
        device.queue.submit([encoder.finish()])
        if (!context && ctx2d) {
          readbackBusyRef.current = true
          void blitReadback(readbackBufferRef.current!, ctx2d, canvas.width, canvas.height, bytesPerRow)
        }

        frameCountRef.current++
        if (now - lastFpsTimeRef.current >= 500) {
          const fps = Math.round((frameCountRef.current * 1000) / (now - lastFpsTimeRef.current))
          frameCountRef.current = 0
          lastFpsTimeRef.current = now
          onFpsUpdate?.(fps, canvas.width, canvas.height, mouseRef.current.x, mouseRef.current.y)
        }
      }

      rafRef.current = requestAnimationFrame(frame)
      return () => {
        disposed = true
        cancelAnimationFrame(rafRef.current)
      }
      // Restart the loop when the canvas element is swapped for the fallback
      // present mode (the init cleanup cancels the previous loop's rAF).
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [presentMode])

    /** Updates `u_mouse` from pointer position. Also wired on pointerdown so touch works without a prior move. */
    const syncMouseFromPointer = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current
      if (!canvas) return
      const rect = canvas.getBoundingClientRect()
      if (rect.width <= 0 || rect.height <= 0) return
      mouseRef.current = {
        x: (e.clientX - rect.left) / rect.width,
        y: (e.clientY - rect.top) / rect.height,
      }
    }, [])

    return (
      <div className={className} style={{ position: 'relative' }}>
        <canvas
          // A canvas is permanently bound to its first context type, so the
          // element must be recreated when switching to the 2D fallback.
          key={presentMode}
          ref={canvasRef}
          data-testid="webgpu-canvas"
          onPointerMove={syncMouseFromPointer}
          onPointerDown={syncMouseFromPointer}
          className="w-full h-full block"
          aria-label="WebGPU shader preview"
        />
        {(externalError || error || unsupported) && (
          <div className="absolute inset-0 flex items-center justify-center p-4 pointer-events-none">
            <pre
              className="max-w-full max-h-full overflow-auto whitespace-pre-wrap font-mono text-xs rounded-md p-3"
              style={{ color: 'var(--destructive)', background: 'rgba(0,0,0,0.6)' }}
            >
              {externalError || error}
            </pre>
          </div>
        )}
      </div>
    )
  },
)
