 'use client'

import { useRef, useEffect, useState, useCallback, forwardRef, useImperativeHandle } from 'react'
import type { MeshData, RenderMode, TextureSlot, UniformParameter, WebGLCompileReport } from '@/lib/types'
import { textureSlotToWebGLTexture } from '@/lib/texture-utils'
import { getMeshPresetMesh } from '@/lib/mesh-presets'

export type { WebGLCompileReport }

interface ShaderCanvasProps {
  vertexShader: string
  fragmentShader: string
  renderMode: RenderMode
  isPlaying: boolean
  meshData?: MeshData
  textures?: TextureSlot[]
  parameters?: UniformParameter[]
  className?: string
  onFpsUpdate?: (fps: number, width: number, height: number, mouseX: number, mouseY: number) => void
  onCompileResult?: (report: WebGLCompileReport) => void
  timeScale?: number
}

export interface ShaderCanvasHandle {
  reset: () => void
}

const CHANNEL_NAMES = ['iChannel0', 'iChannel1', 'iChannel2', 'iChannel3'] as const

const ENABLE_3D_PREVIEW = true

function channelIndexFromId(id: TextureSlot['id']): number {
  return CHANNEL_NAMES.indexOf(id)
}

/**
 * Strip characters that GLSL ES 1.00 cannot tokenize (BOM, zero-width chars,
 * NBSP, etc.). Without this, AI-generated or pasted shaders sometimes fail with
 * `ERROR: 0:NN: '' : syntax error` because the lexer reports the unknown
 * character as an empty token.
 */
function sanitizeShaderSource(src: string): string {
  return src
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    // BOM + zero-width characters (U+FEFF, U+200B, U+200C, U+200D, U+2060) -> drop entirely
    .replace(/[\uFEFF\u200B\u200C\u2060]/g, '')
    .replace(/\u200D/g, '')
    // Unicode whitespace variants (NBSP, Ogham space, en/em quads, NNBSP, ideographic space) -> regular space
    .replace(/[\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000]/g, ' ')
}

// Helper function to inject texture uniforms into fragment shader
function injectTextureUniforms(fragmentShader: string, textures?: TextureSlot[]): string {
  if (!textures || textures.length === 0) {
    return fragmentShader
  }

  // Declare each uploaded channel that the shader references but has not declared yet.
  // Order of entries in `textures` is not guaranteed to match channel index.
  const missingUniforms = CHANNEL_NAMES.filter(
    (ch) =>
      textures.some((t) => t.id === ch) &&
      !fragmentShader.includes(`uniform sampler2D ${ch}`),
  ).map((ch) => `uniform sampler2D ${ch};`)

  if (missingUniforms.length === 0) {
    return fragmentShader
  }

  const declarations = missingUniforms.join('\n')

  // Find precision declaration or start of code
  const precisionMatch = fragmentShader.match(/precision\s+\w+\s+float\s*;/)
  let insertPos = 0
  let source = fragmentShader

  if (precisionMatch) {
    insertPos = source.indexOf(precisionMatch[0]) + precisionMatch[0].length
  } else {
    // Add precision if not present
    source = `precision mediump float;\n${source}`
    insertPos = source.indexOf('\n') + 1
  }

  return source.slice(0, insertPos) + '\n' + declarations + '\n' + source.slice(insertPos)
}

const default2DVertexShader = `
attribute vec4 a_position;
void main() {
  gl_Position = a_position;
}
`

const default3DVertexShader = `
attribute vec4 a_position;
attribute vec3 a_normal;
attribute vec2 a_texCoord;

uniform mat4 u_modelViewMatrix;
uniform mat4 u_projectionMatrix;
uniform mat3 u_normalMatrix;

varying vec3 v_normal;
varying vec2 v_texCoord;
varying vec3 v_position;

void main() {
  v_position = (u_modelViewMatrix * a_position).xyz;
  v_normal = u_normalMatrix * a_normal;
  v_texCoord = a_texCoord;
  gl_Position = u_projectionMatrix * u_modelViewMatrix * a_position;
}
`

interface GeometryBuffers {
  positionBuffer: WebGLBuffer
  normalBuffer?: WebGLBuffer
  texCoordBuffer?: WebGLBuffer
  indexBuffer?: WebGLBuffer
  indexCount?: number
}

// Matrix utilities
function mat4Perspective(out: Float32Array, fovy: number, aspect: number, near: number, far: number) {
  const f = 1.0 / Math.tan(fovy / 2)
  out[0] = f / aspect; out[1] = 0; out[2] = 0; out[3] = 0
  out[4] = 0; out[5] = f; out[6] = 0; out[7] = 0
  out[8] = 0; out[9] = 0; out[10] = (far + near) / (near - far); out[11] = -1
  out[12] = 0; out[13] = 0; out[14] = (2 * far * near) / (near - far); out[15] = 0
  return out
}

function mat4LookAt(out: Float32Array, eye: number[], center: number[], up: number[]) {
  const zx = eye[0] - center[0], zy = eye[1] - center[1], zz = eye[2] - center[2]
  let len = 1 / Math.sqrt(zx * zx + zy * zy + zz * zz)
  const z = [zx * len, zy * len, zz * len]
  const xx = up[1] * z[2] - up[2] * z[1], xy = up[2] * z[0] - up[0] * z[2], xz = up[0] * z[1] - up[1] * z[0]
  len = Math.sqrt(xx * xx + xy * xy + xz * xz)
  const x = len ? [xx / len, xy / len, xz / len] : [0, 0, 0]
  const y = [z[1] * x[2] - z[2] * x[1], z[2] * x[0] - z[0] * x[2], z[0] * x[1] - z[1] * x[0]]
  
  out[0] = x[0]; out[1] = y[0]; out[2] = z[0]; out[3] = 0
  out[4] = x[1]; out[5] = y[1]; out[6] = z[1]; out[7] = 0
  out[8] = x[2]; out[9] = y[2]; out[10] = z[2]; out[11] = 0
  out[12] = -(x[0] * eye[0] + x[1] * eye[1] + x[2] * eye[2])
  out[13] = -(y[0] * eye[0] + y[1] * eye[1] + y[2] * eye[2])
  out[14] = -(z[0] * eye[0] + z[1] * eye[1] + z[2] * eye[2])
  out[15] = 1
  return out
}

function mat3FromMat4(out: Float32Array, a: Float32Array) {
  out[0] = a[0]; out[1] = a[1]; out[2] = a[2]
  out[3] = a[4]; out[4] = a[5]; out[5] = a[6]
  out[6] = a[8]; out[7] = a[9]; out[8] = a[10]
  return out
}

export const ShaderCanvas = forwardRef<ShaderCanvasHandle, ShaderCanvasProps>(
  function ShaderCanvas({ vertexShader, fragmentShader, renderMode, isPlaying, meshData, textures, parameters, className, onFpsUpdate, onCompileResult, timeScale = 1 }, ref) {
    const activeRenderMode: RenderMode = ENABLE_3D_PREVIEW ? renderMode : '2d'
    const canvasRef = useRef<HTMLCanvasElement>(null)
    const glRef = useRef<WebGLRenderingContext | null>(null)
    const programRef = useRef<WebGLProgram | null>(null)
    const animationRef = useRef<number>(0)
    const shaderTimeRef = useRef<number>(0)
    const lastFrameTimeRef = useRef<number>(Date.now())
    const [error, setError] = useState<string | null>(null)
    // Keep interactive values in refs to avoid restarting animation on every pointer move.
    const mousePosRef = useRef({ x: 0.5, y: 0.5 })
    // Texture management
    const textureMapRef = useRef<Map<string, WebGLTexture>>(new Map())
    const textureVersionRef = useRef<Map<string, number>>(new Map())
    const textureLoadingRef = useRef<Set<string>>(new Set()) // prevent duplicate loads
    const yawRef = useRef(0)
    const pitchRef = useRef(0.15)
    const zoomRadiusRef = useRef(6)
    const isDraggingRef = useRef(false)
    const lastPointerRef = useRef<{ x: number; y: number } | null>(null)
    const orbitDragCleanupRef = useRef<(() => void) | null>(null)
    const activePointersRef = useRef<Map<number, { x: number; y: number }>>(new Map())
    const lastPinchDistRef = useRef<number | null>(null)
    const geometry3DRef = useRef<GeometryBuffers | null>(null)
    const geometry2DRef = useRef<GeometryBuffers | null>(null)
    const renderModeRef = useRef(activeRenderMode)
    useEffect(() => {
      renderModeRef.current = activeRenderMode
    }, [activeRenderMode])
    const fpsFrameCountRef = useRef(0)
    const fpsLastTimeRef = useRef(Date.now())
    const onFpsUpdateRef = useRef(onFpsUpdate)
    const onCompileResultRef = useRef(onCompileResult)
    const timeScaleRef = useRef(timeScale)
    useEffect(() => { onFpsUpdateRef.current = onFpsUpdate }, [onFpsUpdate])
    useEffect(() => { onCompileResultRef.current = onCompileResult }, [onCompileResult])
    useEffect(() => { timeScaleRef.current = timeScale }, [timeScale])

    useImperativeHandle(ref, () => ({
      reset: () => {
        shaderTimeRef.current = 0
        lastFrameTimeRef.current = Date.now()
        yawRef.current = 0
        pitchRef.current = 0.15
        zoomRadiusRef.current = 6
      }
    }))

    const syncMouseFromPointer = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current
      if (!canvas) return
      const rect = canvas.getBoundingClientRect()
      if (rect.width <= 0 || rect.height <= 0) return
      mousePosRef.current = {
        x: (e.clientX - rect.left) / rect.width,
        y: 1 - (e.clientY - rect.top) / rect.height,
      }
    }, [])

    /** Updates `u_mouse` from pointer position. Also wired on pointerdown so touch works without a prior move. */
    const handlePointerMove = useCallback(
      (e: React.PointerEvent<HTMLCanvasElement>) => {
        syncMouseFromPointer(e)
        // 3D オービットはネイティブの pointermove で処理（合成イベントだとキャプチャ時に取りこぼすことがある）
      },
      [syncMouseFromPointer],
    )

    useEffect(() => {
      return () => {
        orbitDragCleanupRef.current?.()
        orbitDragCleanupRef.current = null
      }
    }, [])

    const handleShaderPointerDown = useCallback(
      (e: React.PointerEvent<HTMLCanvasElement>) => {
        const canvas = canvasRef.current
        if (!canvas) return
        try {
          canvas.setPointerCapture(e.pointerId)
        } catch {
          // Some browsers can reject capture if the pointer is already gone.
        }
        syncMouseFromPointer(e)

        if (renderModeRef.current !== '3d' || e.button !== 0) return
        e.preventDefault()

        const isFirstPointer = activePointersRef.current.size === 0
        activePointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY })

        if (activePointersRef.current.size >= 2) {
          // Second finger: switch to pinch-zoom mode
          isDraggingRef.current = false
          lastPointerRef.current = null
          const pts = Array.from(activePointersRef.current.values())
          const dx = pts[0].x - pts[1].x
          const dy = pts[0].y - pts[1].y
          lastPinchDistRef.current = Math.sqrt(dx * dx + dy * dy)
        } else {
          // Single pointer: orbit mode
          isDraggingRef.current = true
          lastPointerRef.current = { x: e.clientX, y: e.clientY }
          lastPinchDistRef.current = null
        }

        if (!isFirstPointer) return

        // Register global handlers once on the first pointer down
        const onPointerMove = (ev: PointerEvent) => {
          if (!activePointersRef.current.has(ev.pointerId)) return
          activePointersRef.current.set(ev.pointerId, { x: ev.clientX, y: ev.clientY })

          if (activePointersRef.current.size >= 2) {
            const pts = Array.from(activePointersRef.current.values())
            const dx = pts[0].x - pts[1].x
            const dy = pts[0].y - pts[1].y
            const dist = Math.sqrt(dx * dx + dy * dy)
            if (lastPinchDistRef.current !== null) {
              const delta = lastPinchDistRef.current - dist
              const nextRadius = zoomRadiusRef.current + delta * 0.025
              zoomRadiusRef.current = Math.min(12, Math.max(1.8, nextRadius))
            }
            lastPinchDistRef.current = dist
          } else if (isDraggingRef.current && lastPointerRef.current) {
            const dx = ev.clientX - lastPointerRef.current.x
            const dy = ev.clientY - lastPointerRef.current.y
            lastPointerRef.current = { x: ev.clientX, y: ev.clientY }
            yawRef.current -= dx * 0.006
            pitchRef.current += dy * 0.006
            pitchRef.current = Math.max(-1.35, Math.min(1.35, pitchRef.current))
          }
        }

        const onPointerEnd = (ev: PointerEvent) => {
          activePointersRef.current.delete(ev.pointerId)
          lastPinchDistRef.current = null
          try { canvas.releasePointerCapture(ev.pointerId) } catch { /* ignore */ }

          if (activePointersRef.current.size === 1) {
            // Back to single pointer: resume orbit from current position
            const [, pos] = Array.from(activePointersRef.current.entries())[0]
            isDraggingRef.current = true
            lastPointerRef.current = { x: pos.x, y: pos.y }
          } else if (activePointersRef.current.size === 0) {
            isDraggingRef.current = false
            lastPointerRef.current = null
            orbitDragCleanupRef.current?.()
            orbitDragCleanupRef.current = null
          }
        }

        window.addEventListener('pointermove', onPointerMove)
        window.addEventListener('pointerup', onPointerEnd)
        window.addEventListener('pointercancel', onPointerEnd)
        orbitDragCleanupRef.current = () => {
          activePointersRef.current.clear()
          window.removeEventListener('pointermove', onPointerMove)
          window.removeEventListener('pointerup', onPointerEnd)
          window.removeEventListener('pointercancel', onPointerEnd)
        }
      },
      [syncMouseFromPointer],
    )
    const handleWheel = useCallback((e: WheelEvent) => {
      if (renderModeRef.current !== '3d') return
      e.preventDefault()
      const zoomSpeed = 0.01
      const nextRadius = zoomRadiusRef.current + e.deltaY * zoomSpeed
      zoomRadiusRef.current = Math.min(12, Math.max(1.8, nextRadius))
    }, [])

    useEffect(() => {
      if (activeRenderMode !== '3d') return
      yawRef.current = 0
      pitchRef.current = 0.15
      zoomRadiusRef.current = 6
      lastFrameTimeRef.current = Date.now()
    }, [activeRenderMode])

    useEffect(() => {
      const canvas = canvasRef.current
      if (!canvas) return

      const gl =
        canvas.getContext('webgl', { preserveDrawingBuffer: true }) ||
        canvas.getContext('experimental-webgl', { preserveDrawingBuffer: true })
      if (!gl || !(gl instanceof WebGLRenderingContext)) {
        setError('WebGL not supported')
        return
      }

      glRef.current = gl
      gl.enable(gl.DEPTH_TEST)

      canvas.addEventListener('wheel', handleWheel, { passive: false })

      return () => {
        cancelAnimationFrame(animationRef.current)
        canvas.removeEventListener('wheel', handleWheel)
      }
    }, [handleWheel])

    const clear2DGeometry = useCallback((gl: WebGLRenderingContext | null) => {
      const buffers = geometry2DRef.current
      if (!gl || !buffers) {
        geometry2DRef.current = null
        return
      }
      gl.deleteBuffer(buffers.positionBuffer)
      if (buffers.texCoordBuffer) gl.deleteBuffer(buffers.texCoordBuffer)
      geometry2DRef.current = null
    }, [])

    const clear3DGeometry = useCallback((gl: WebGLRenderingContext | null) => {
      const buffers = geometry3DRef.current
      if (!gl || !buffers) {
        geometry3DRef.current = null
        return
      }
      gl.deleteBuffer(buffers.positionBuffer)
      if (buffers.normalBuffer) gl.deleteBuffer(buffers.normalBuffer)
      if (buffers.texCoordBuffer) gl.deleteBuffer(buffers.texCoordBuffer)
      if (buffers.indexBuffer) gl.deleteBuffer(buffers.indexBuffer)
      geometry3DRef.current = null
    }, [])

    useEffect(() => {
      const gl = glRef.current
      if (!gl) return

      setError(null)
      if (programRef.current) {
        gl.deleteProgram(programRef.current)
        programRef.current = null
      }
      clear2DGeometry(gl)
      clear3DGeometry(gl)
      resetVertexAttributes(gl)

      // Use appropriate vertex shader based on mode
      const vertSource = vertexShader.trim()
        ? vertexShader
        : (activeRenderMode === '3d' ? default3DVertexShader : default2DVertexShader)
      const sanitizedVertex = sanitizeShaderSource(vertSource)

      const vertResult = createShader(gl, gl.VERTEX_SHADER, sanitizedVertex)
      if (!vertResult.shader) {
        onCompileResultRef.current?.({
          success: false,
          vertexSource: sanitizedVertex,
          fragmentSource: '',
          vertexCompileLog: vertResult.infoLog,
          errorMessage: vertResult.errorMessage,
        })
        return
      }

      // Inject texture uniforms into fragment shader
      const fragmentShaderWithTextures = injectTextureUniforms(fragmentShader, textures)
      const sanitizedFragment = sanitizeShaderSource(fragmentShaderWithTextures)

      const fragResult = createShader(gl, gl.FRAGMENT_SHADER, sanitizedFragment)
      if (!fragResult.shader) {
        gl.deleteShader(vertResult.shader)
        onCompileResultRef.current?.({
          success: false,
          vertexSource: sanitizedVertex,
          fragmentSource: sanitizedFragment,
          vertexCompileLog: vertResult.infoLog,
          fragmentCompileLog: fragResult.infoLog,
          errorMessage: fragResult.errorMessage,
        })
        return
      }

      const program = gl.createProgram()
      if (!program) {
        setError('Failed to create shader program')
        gl.deleteShader(vertResult.shader)
        gl.deleteShader(fragResult.shader)
        onCompileResultRef.current?.({
          success: false,
          vertexSource: sanitizedVertex,
          fragmentSource: sanitizedFragment,
          vertexCompileLog: vertResult.infoLog,
          fragmentCompileLog: fragResult.infoLog,
          errorMessage: 'Failed to create shader program',
        })
        return
      }

      gl.attachShader(program, vertResult.shader)
      gl.attachShader(program, fragResult.shader)
      gl.linkProgram(program)

      const linkLog = gl.getProgramInfoLog(program) ?? ''
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        const errorMessage = 'Failed to link shader program: ' + linkLog
        setError(errorMessage)
        gl.deleteShader(vertResult.shader)
        gl.deleteShader(fragResult.shader)
        gl.deleteProgram(program)
        onCompileResultRef.current?.({
          success: false,
          vertexSource: sanitizedVertex,
          fragmentSource: sanitizedFragment,
          vertexCompileLog: vertResult.infoLog,
          fragmentCompileLog: fragResult.infoLog,
          linkLog,
          errorMessage,
        })
        return
      }

      gl.deleteShader(vertResult.shader)
      gl.deleteShader(fragResult.shader)
      programRef.current = program

      onCompileResultRef.current?.({
        success: true,
        vertexSource: sanitizedVertex,
        fragmentSource: sanitizedFragment,
        vertexCompileLog: vertResult.infoLog,
        fragmentCompileLog: fragResult.infoLog,
        linkLog,
      })

      if (activeRenderMode === '3d') {
        const sourceMesh = meshData ?? getMeshPresetMesh('cube')
        setup3DGeometry(gl, program, sourceMesh)
      } else {
        setup2DGeometry(gl, program)
      }
    }, [vertexShader, fragmentShader, activeRenderMode, textures, meshData, clear2DGeometry, clear3DGeometry])

    // Evict stale texture cache entries when textures prop changes
    useEffect(() => {
      const currentIds = new Set<string>((textures ?? []).map(t => t.id))
      const evicted: string[] = []
      for (const id of textureMapRef.current.keys()) {
        if (!currentIds.has(id)) {
          const gl = glRef.current
          const oldTexture = textureMapRef.current.get(id)
          if (gl && oldTexture) {
            gl.deleteTexture(oldTexture)
          }
          textureMapRef.current.delete(id)
          textureVersionRef.current.delete(id)
          textureLoadingRef.current.delete(id)
          evicted.push(id)
        }
      }
    }, [textures])

    useEffect(() => {
      const gl = glRef.current
      if (!gl || !programRef.current) return

      cancelAnimationFrame(animationRef.current)

      if (!isPlaying) return
      lastFrameTimeRef.current = Date.now()

      const render = () => {
        if (!gl || !isPlaying) return

        const canvas = gl.canvas as HTMLCanvasElement
        const displayWidth = canvas.clientWidth
        const displayHeight = canvas.clientHeight

        if (canvas.width !== displayWidth || canvas.height !== displayHeight) {
          canvas.width = displayWidth
          canvas.height = displayHeight
        }

        gl.viewport(0, 0, canvas.width, canvas.height)
        gl.clearColor(0.05, 0.05, 0.05, 1)
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)

        if (!programRef.current) {
          animationRef.current = requestAnimationFrame(render)
          return
        }

        gl.useProgram(programRef.current)

        const nowMs = Date.now()
        const deltaSec = (nowMs - lastFrameTimeRef.current) / 1000
        lastFrameTimeRef.current = nowMs
        shaderTimeRef.current += Math.max(0, deltaSec) * Math.max(0, timeScaleRef.current)
        const time = shaderTimeRef.current

        // Set common uniforms
        const timeLocation = gl.getUniformLocation(programRef.current, 'u_time')
        const resolutionLocation = gl.getUniformLocation(programRef.current, 'u_resolution')
        const mouseLocation = gl.getUniformLocation(programRef.current, 'u_mouse')

        if (timeLocation) gl.uniform1f(timeLocation, time)
        if (resolutionLocation) gl.uniform2f(resolutionLocation, canvas.width, canvas.height)
        if (mouseLocation) gl.uniform2f(mouseLocation, mousePosRef.current.x, mousePosRef.current.y)

        // Set custom parameter uniforms
        if (parameters && parameters.length > 0) {
          for (const param of parameters) {
            const loc = gl.getUniformLocation(programRef.current, param.name)
            if (!loc) continue

            if (param.type === 'float' || param.type === 'int') {
              gl.uniform1f(loc, param.value as number)
            } else if (param.type === 'vec2') {
              const [x, y] = param.value as number[]
              gl.uniform2f(loc, x, y)
            } else if (param.type === 'vec3' || param.type === 'color') {
              const [x, y, z] = param.value as number[]
              gl.uniform3f(loc, x, y, z)
            } else if (param.type === 'vec4') {
              const [x, y, z, w] = param.value as number[]
              gl.uniform4f(loc, x, y, z, w)
            }
            // texture type handled by texture binding logic below
          }
        }

        // Bind textures to iChannel0-3 uniforms (texture unit index matches channel name, not array order)
        if (textures && textures.length > 0) {
          textures.forEach((slot) => {
            const unitIndex = channelIndexFromId(slot.id)
            if (unitIndex < 0 || unitIndex > 3) return

            const uniformLoc = gl.getUniformLocation(programRef.current!, slot.id)
            if (uniformLoc === null) return

            const glTexture = textureMapRef.current.get(slot.id)
            const cachedVersion = textureVersionRef.current.get(slot.id)
            const isSameVersion = cachedVersion === slot.uploadedAt

            if (glTexture && isSameVersion) {
              // Texture already loaded: bind and set uniform
              gl.activeTexture(gl.TEXTURE0 + unitIndex)
              gl.bindTexture(gl.TEXTURE_2D, glTexture)
              gl.uniform1i(uniformLoc, unitIndex)
            } else if (!textureLoadingRef.current.has(slot.id)) {
              if (glTexture && !isSameVersion) {
                // Same channel replaced with a new upload; release old GPU resource first.
                gl.deleteTexture(glTexture)
                textureMapRef.current.delete(slot.id)
                textureVersionRef.current.delete(slot.id)
              }
              // Start async load (once per texture)
              textureLoadingRef.current.add(slot.id)
              textureSlotToWebGLTexture(gl, slot).then((loaded) => {
                if (loaded) {
                  textureMapRef.current.set(slot.id, loaded)
                  textureVersionRef.current.set(slot.id, slot.uploadedAt)
                }
                textureLoadingRef.current.delete(slot.id)
              }).catch(err => {
                console.error(`Failed to load texture ${slot.name}:`, err)
                textureLoadingRef.current.delete(slot.id) // allow retry
              })
            }
          })
        }

        if (activeRenderMode === '3d') {
          render3D(gl, programRef.current, canvas.width / canvas.height)
        } else {
          gl.drawArrays(gl.TRIANGLES, 0, 6)
        }

        // FPS measurement (update every second)
        fpsFrameCountRef.current++
        const now = Date.now()
        const elapsed = now - fpsLastTimeRef.current
        if (elapsed >= 1000) {
          const fps = Math.round(fpsFrameCountRef.current * 1000 / elapsed)
          fpsFrameCountRef.current = 0
          fpsLastTimeRef.current = now
          onFpsUpdateRef.current?.(fps, canvas.width, canvas.height, mousePosRef.current.x, mousePosRef.current.y)
        }

        animationRef.current = requestAnimationFrame(render)
      }

      render()

      return () => {
        cancelAnimationFrame(animationRef.current)
      }
    }, [isPlaying, activeRenderMode, textures, parameters])

    interface ShaderCompileOutcome {
      shader: WebGLShader | null
      infoLog: string
      errorMessage?: string
    }

    function createShader(gl: WebGLRenderingContext, type: number, source: string): ShaderCompileOutcome {
      const shader = gl.createShader(type)
      if (!shader) {
        return { shader: null, infoLog: '', errorMessage: 'Failed to create shader object' }
      }

      gl.shaderSource(shader, source)
      gl.compileShader(shader)

      const infoLog = gl.getShaderInfoLog(shader) ?? ''
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        const shaderType = type === gl.VERTEX_SHADER ? 'Vertex' : 'Fragment'
        const errorMessage = `${shaderType} shader error: ${infoLog}`
        setError(errorMessage)
        gl.deleteShader(shader)
        return { shader: null, infoLog, errorMessage }
      }

      return { shader, infoLog }
    }

    useEffect(() => {
      return () => {
        const gl = glRef.current
        if (gl) {
          for (const texture of textureMapRef.current.values()) {
            gl.deleteTexture(texture)
          }
        }
        textureMapRef.current.clear()
        textureVersionRef.current.clear()
        textureLoadingRef.current.clear()
        clear2DGeometry(glRef.current)
        clear3DGeometry(glRef.current)
      }
    }, [clear2DGeometry, clear3DGeometry])

    function resetVertexAttributes(gl: WebGLRenderingContext) {
      const maxAttributes = gl.getParameter(gl.MAX_VERTEX_ATTRIBS) as number
      for (let i = 0; i < maxAttributes; i += 1) {
        gl.disableVertexAttribArray(i)
      }
      gl.bindBuffer(gl.ARRAY_BUFFER, null)
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null)
    }

    function setup2DGeometry(gl: WebGLRenderingContext, program: WebGLProgram) {
      const positionBuffer = gl.createBuffer()
      const texCoordBuffer = gl.createBuffer()
      if (!positionBuffer || !texCoordBuffer) {
        setError('Failed to create fullscreen quad buffers')
        return
      }

      gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer)
      gl.bufferData(
        gl.ARRAY_BUFFER,
        new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
        gl.STATIC_DRAW
      )

      const positionLocation = gl.getAttribLocation(program, 'a_position')
      if (positionLocation >= 0) {
        gl.enableVertexAttribArray(positionLocation)
        gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0)
      }

      const texCoordLocation = gl.getAttribLocation(program, 'a_texCoord')
      if (texCoordLocation >= 0) {
        gl.bindBuffer(gl.ARRAY_BUFFER, texCoordBuffer)
        gl.bufferData(
          gl.ARRAY_BUFFER,
          new Float32Array([0, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1, 1]),
          gl.STATIC_DRAW
        )
        gl.enableVertexAttribArray(texCoordLocation)
        gl.vertexAttribPointer(texCoordLocation, 2, gl.FLOAT, false, 0, 0)
      }

      geometry2DRef.current = {
        positionBuffer,
        texCoordBuffer,
      }
    }

    function setup3DGeometry(gl: WebGLRenderingContext, program: WebGLProgram, geo: MeshData) {
      const positionBuffer = gl.createBuffer()
      const normalBuffer = gl.createBuffer()
      const texCoordBuffer = gl.createBuffer()
      const indexBuffer = gl.createBuffer()
      if (!positionBuffer || !normalBuffer || !texCoordBuffer || !indexBuffer) {
        setError('Failed to create mesh buffers')
        return
      }
      gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer)
      gl.bufferData(gl.ARRAY_BUFFER, geo.positions, gl.STATIC_DRAW)
      const positionLocation = gl.getAttribLocation(program, 'a_position')
      if (positionLocation >= 0) {
        gl.enableVertexAttribArray(positionLocation)
        gl.vertexAttribPointer(positionLocation, 3, gl.FLOAT, false, 0, 0)
      }

      gl.bindBuffer(gl.ARRAY_BUFFER, normalBuffer)
      gl.bufferData(gl.ARRAY_BUFFER, geo.normals, gl.STATIC_DRAW)
      const normalLocation = gl.getAttribLocation(program, 'a_normal')
      if (normalLocation >= 0) {
        gl.enableVertexAttribArray(normalLocation)
        gl.vertexAttribPointer(normalLocation, 3, gl.FLOAT, false, 0, 0)
      }

      const texCoordLocation = gl.getAttribLocation(program, 'a_texCoord')
      if (texCoordLocation >= 0) {
        gl.bindBuffer(gl.ARRAY_BUFFER, texCoordBuffer)
        gl.bufferData(gl.ARRAY_BUFFER, geo.texCoords, gl.STATIC_DRAW)
        gl.enableVertexAttribArray(texCoordLocation)
        gl.vertexAttribPointer(texCoordLocation, 2, gl.FLOAT, false, 0, 0)
      }

      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer)
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, geo.indices, gl.STATIC_DRAW)
      geometry3DRef.current = {
        positionBuffer,
        normalBuffer,
        texCoordBuffer,
        indexBuffer,
        indexCount: geo.indices.length,
      }
    }

    function render3D(gl: WebGLRenderingContext, program: WebGLProgram, aspect: number) {
      const geometry = geometry3DRef.current
      if (!geometry?.indexBuffer || geometry.indexCount === undefined) return
      const radius = zoomRadiusRef.current
      const yaw = yawRef.current
      const pitch = pitchRef.current
      const camX = Math.sin(yaw) * Math.cos(pitch) * radius
      const camZ = Math.cos(yaw) * Math.cos(pitch) * radius
      const camY = Math.sin(pitch) * radius

      const projectionMatrix = new Float32Array(16)
      const modelViewMatrix = new Float32Array(16)
      const normalMatrix = new Float32Array(9)

      mat4Perspective(projectionMatrix, Math.PI / 4, aspect, 0.1, 100)
      mat4LookAt(modelViewMatrix, [camX, camY, camZ], [0, 0, 0], [0, 1, 0])
      mat3FromMat4(normalMatrix, modelViewMatrix)

      const projectionLocation = gl.getUniformLocation(program, 'u_projectionMatrix')
      const modelViewLocation = gl.getUniformLocation(program, 'u_modelViewMatrix')
      const normalMatrixLocation = gl.getUniformLocation(program, 'u_normalMatrix')

      if (projectionLocation) gl.uniformMatrix4fv(projectionLocation, false, projectionMatrix)
      if (modelViewLocation) gl.uniformMatrix4fv(modelViewLocation, false, modelViewMatrix)
      if (normalMatrixLocation) gl.uniformMatrix3fv(normalMatrixLocation, false, normalMatrix)

      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, geometry.indexBuffer)
      gl.drawElements(gl.TRIANGLES, geometry.indexCount, gl.UNSIGNED_SHORT, 0)
    }

    return (
      <div className={`relative ${className || ''}`}>
        <canvas
          ref={canvasRef}
          data-testid="shader-canvas"
          width={800}
          height={600}
          className="w-full h-full"
          style={{
            borderRadius: '2px',
            touchAction: 'none',
          }}
          onPointerDown={handleShaderPointerDown}
          onPointerMove={handlePointerMove}
        />
        {error && (
          <div className="absolute inset-0 flex items-center justify-center" style={{ backgroundColor: 'rgba(181, 75, 75, 0.15)' }}>
            <div className="bg-card border rounded-sm p-4 max-w-md" style={{ borderColor: 'var(--destructive)' }}>
              <p className="font-mono text-xs" style={{ color: 'var(--destructive)' }}>{error}</p>
            </div>
          </div>
        )}
      </div>
    )
  }
)
