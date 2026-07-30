'use client'

import { useRef, useEffect, useCallback, useState } from 'react'

interface CodeEditorProps {
  value: string
  onChange: (value: string) => void
  language: 'glsl' | 'hlsl' | 'slang'
  className?: string
  /** While true the AI is streaming code in: block edits + show a "writing" cue. */
  isStreaming?: boolean
}

interface HistoryEntry {
  value: string
  cursor: number
}

// GLSL keywords and builtins
const GLSL_KEYWORDS = [
  'void', 'bool', 'int', 'uint', 'float', 'double',
  'vec2', 'vec3', 'vec4', 'dvec2', 'dvec3', 'dvec4',
  'bvec2', 'bvec3', 'bvec4', 'ivec2', 'ivec3', 'ivec4', 'uvec2', 'uvec3', 'uvec4',
  'mat2', 'mat3', 'mat4', 'mat2x2', 'mat2x3', 'mat2x4', 'mat3x2', 'mat3x3', 'mat3x4', 'mat4x2', 'mat4x3', 'mat4x4',
  'sampler1D', 'sampler2D', 'sampler3D', 'samplerCube', 'sampler2DArray',
  'uniform', 'varying', 'attribute', 'const', 'in', 'out', 'inout',
  'precision', 'highp', 'mediump', 'lowp',
  'return', 'if', 'else', 'for', 'while', 'do', 'break', 'continue', 'discard',
  'struct', 'layout', 'flat', 'smooth', 'noperspective'
]

const GLSL_BUILTINS = [
  'gl_Position', 'gl_FragColor', 'gl_FragCoord', 'gl_PointSize', 'gl_PointCoord', 'gl_FrontFacing', 'gl_VertexID',
  'texture', 'texture2D', 'textureCube', 'texelFetch',
  'sin', 'cos', 'tan', 'asin', 'acos', 'atan',
  'pow', 'exp', 'exp2', 'log', 'log2', 'sqrt', 'inversesqrt',
  'abs', 'sign', 'floor', 'ceil', 'fract', 'mod', 'modf',
  'min', 'max', 'clamp', 'mix', 'step', 'smoothstep',
  'length', 'distance', 'dot', 'cross', 'normalize', 'faceforward', 'reflect', 'refract',
  'matrixCompMult', 'transpose', 'inverse', 'determinant',
  'dFdx', 'dFdy', 'fwidth', 'radians', 'degrees'
]

// HLSL keywords and builtins
const HLSL_KEYWORDS = [
  'void', 'bool', 'int', 'uint', 'float', 'double', 'half',
  'float2', 'float3', 'float4', 'half2', 'half3', 'half4',
  'int2', 'int3', 'int4', 'uint2', 'uint3', 'uint4',
  'bool2', 'bool3', 'bool4',
  'float2x2', 'float3x3', 'float4x4', 'matrix',
  'Texture2D', 'Texture3D', 'TextureCube', 'SamplerState', 'SamplerComparisonState',
  'cbuffer', 'struct', 'typedef',
  'return', 'if', 'else', 'for', 'while', 'do', 'break', 'continue', 'discard', 'switch', 'case', 'default',
  'static', 'const', 'inline', 'register', 'extern', 'uniform',
  'in', 'out', 'inout', 'nointerpolation', 'linear', 'centroid', 'sample',
  // Slang-specific keywords (Slang syntax is a superset of HLSL)
  'interface', 'import', 'implementing', 'extension', 'associatedtype',
  'property', 'get', 'set', 'this', 'This', 'enum', 'namespace',
  'Differentiable', 'NoDiff', 'DifferentialPair', 'no_diff'
]

const HLSL_BUILTINS = [
  'SV_Position', 'SV_Target', 'SV_Target0', 'SV_Target1', 'SV_VertexID', 'SV_InstanceID', 'SV_Depth',
  'POSITION', 'NORMAL', 'TEXCOORD', 'TEXCOORD0', 'TEXCOORD1', 'COLOR',
  'sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'atan2',
  'pow', 'exp', 'exp2', 'log', 'log2', 'sqrt', 'rsqrt',
  'abs', 'sign', 'floor', 'ceil', 'round', 'frac', 'fmod', 'trunc',
  'min', 'max', 'clamp', 'saturate', 'lerp', 'step', 'smoothstep',
  'length', 'distance', 'dot', 'cross', 'normalize', 'reflect', 'refract',
  'mul', 'transpose', 'determinant',
  'tex2D', 'Sample', 'SampleLevel', 'Load',
  'ddx', 'ddy', 'ddx_coarse', 'ddy_coarse', 'ddx_fine', 'ddy_fine', 'fwidth',
  'clip', 'all', 'any', 'isnan', 'isinf', 'isfinite'
]

export function CodeEditor({ value, onChange, language, className, isStreaming = false }: CodeEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const highlightRef = useRef<HTMLPreElement>(null)
  const lineNumbersRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const historyRef = useRef<{ entries: HistoryEntry[]; index: number; applying: boolean }>({
    entries: [{ value, cursor: value.length }],
    index: 0,
    applying: false,
  })
  const pendingSelectionRef = useRef<number | null>(null)
  const [activeLine, setActiveLine] = useState(1)

  // Slang shares HLSL's keyword/builtin set (HLSL-like syntax).
  const keywords = language === 'glsl' ? GLSL_KEYWORDS : HLSL_KEYWORDS
  const builtins = language === 'glsl' ? GLSL_BUILTINS : HLSL_BUILTINS

  const handleScroll = useCallback(() => {
    if (textareaRef.current && highlightRef.current && lineNumbersRef.current) {
      highlightRef.current.scrollTop = textareaRef.current.scrollTop
      highlightRef.current.scrollLeft = textareaRef.current.scrollLeft
      lineNumbersRef.current.scrollTop = textareaRef.current.scrollTop
    }
  }, [])

  useEffect(() => {
    const textarea = textareaRef.current
    if (textarea) {
      textarea.addEventListener('scroll', handleScroll)
      return () => textarea.removeEventListener('scroll', handleScroll)
    }
  }, [handleScroll])

  const updateActiveLine = useCallback(() => {
    if (textareaRef.current) {
      const pos = textareaRef.current.selectionStart
      const lines = value.substring(0, pos).split('\n')
      setActiveLine(lines.length)
    }
  }, [value])

  const highlightCode = useCallback((code: string) => {
    const escapeHtml = (s: string) =>
      s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

    const keywordSet = new Set(keywords)
    const builtinSet = new Set(builtins)

    // Single-pass tokenizer: each region of the source is classified exactly
    // once, so injected markup is never re-scanned by later rules (the old
    // sequential-replace version mangled its own <span> attributes).
    const tokenRe =
      /(\/\*[\s\S]*?(?:\*\/|$))|(\/\/[^\n]*)|("(?:[^"\\\n]|\\.)*(?:"|$))|(#\w+)|(\b\d+\.?\d*[fFdDuUlL]*\b)|([a-zA-Z_][a-zA-Z0-9_]*)/g

    let result = ''
    let lastIndex = 0
    let match: RegExpExecArray | null
    while ((match = tokenRe.exec(code)) !== null) {
      result += escapeHtml(code.slice(lastIndex, match.index))
      lastIndex = tokenRe.lastIndex
      const text = escapeHtml(match[0])

      if (match[1] !== undefined || match[2] !== undefined) {
        result += `<span class="code-comment">${text}</span>`
      } else if (match[3] !== undefined) {
        result += `<span class="code-string">${text}</span>`
      } else if (match[4] !== undefined) {
        result += `<span class="code-preprocessor">${text}</span>`
      } else if (match[5] !== undefined) {
        result += `<span class="code-number">${text}</span>`
      } else {
        const word = match[6]
        if (keywordSet.has(word)) {
          result += `<span class="code-keyword">${text}</span>`
        } else if (builtinSet.has(word)) {
          result += `<span class="code-builtin">${text}</span>`
        } else if (/^\s*\(/.test(code.slice(lastIndex))) {
          result += `<span class="code-function">${text}</span>`
        } else {
          result += text
        }
      }
    }
    result += escapeHtml(code.slice(lastIndex))
    return result
  }, [keywords, builtins])

  /** Match textarea & highlight layer so caret aligns with syntax overlay */
  const editorTextStyle: React.CSSProperties = {
    fontFamily: 'var(--font-mono), "JetBrains Mono", monospace',
    fontSize: 'var(--code-editor-font-size, 13px)',
    lineHeight: 1.6,
    letterSpacing: 'normal',
    fontVariantLigatures: 'none',
    tabSize: 2,
    MozTabSize: 2,
    whiteSpace: 'pre',
    overflowWrap: 'normal',
    wordBreak: 'normal',
    boxSizing: 'border-box',
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const isModifier = e.metaKey || e.ctrlKey
    const isUndoKey = e.key.toLowerCase() === 'z'
    const isRedoKey = (e.key.toLowerCase() === 'z' && e.shiftKey) || e.key.toLowerCase() === 'y'

    if (isModifier && isUndoKey && !e.shiftKey) {
      e.preventDefault()
      const history = historyRef.current
      if (history.index <= 0) return
      history.index -= 1
      const entry = history.entries[history.index]
      history.applying = true
      pendingSelectionRef.current = entry.cursor
      onChange(entry.value)
      return
    }

    if (isModifier && isRedoKey) {
      e.preventDefault()
      const history = historyRef.current
      if (history.index >= history.entries.length - 1) return
      history.index += 1
      const entry = history.entries[history.index]
      history.applying = true
      pendingSelectionRef.current = entry.cursor
      onChange(entry.value)
      return
    }

    if (e.key === 'Tab') {
      e.preventDefault()
      const textarea = e.currentTarget
      const start = textarea.selectionStart
      const end = textarea.selectionEnd
      const newValue = value.substring(0, start) + '  ' + value.substring(end)
      const history = historyRef.current
      const nextEntries = history.entries.slice(0, history.index + 1)
      nextEntries.push({ value: newValue, cursor: start + 2 })
      if (nextEntries.length > 200) nextEntries.shift()
      history.entries = nextEntries
      history.index = nextEntries.length - 1
      onChange(newValue)
      requestAnimationFrame(() => {
        if (textareaRef.current) {
          textareaRef.current.selectionStart = textareaRef.current.selectionEnd = start + 2
        }
      })
    }
    // Enter / brackets: leave default behavior so arrow keys & cursor stay correct
  }

  const lines = value.split('\n')
  const lineCount = lines.length

  useEffect(() => {
    const history = historyRef.current
    if (history.applying) {
      history.applying = false
      return
    }

    const current = history.entries[history.index]
    if (current?.value === value) return

    history.entries = [{ value, cursor: value.length }]
    history.index = 0
  }, [value])

  useEffect(() => {
    if (pendingSelectionRef.current === null) return
    if (!textareaRef.current) return

    const cursor = pendingSelectionRef.current
    pendingSelectionRef.current = null
    textareaRef.current.selectionStart = cursor
    textareaRef.current.selectionEnd = cursor
    updateActiveLine()
  }, [value, updateActiveLine])

  // While the AI streams code in, keep the newest lines in view by pinning all
  // three synced layers (textarea, highlight, line numbers) to the bottom.
  useEffect(() => {
    if (!isStreaming) return
    const ta = textareaRef.current
    if (!ta) return
    ta.scrollTop = ta.scrollHeight
    if (highlightRef.current) highlightRef.current.scrollTop = ta.scrollTop
    if (lineNumbersRef.current) lineNumbersRef.current.scrollTop = ta.scrollTop
  }, [value, isStreaming])

  return (
    <div 
      ref={containerRef}
      className={`relative flex rounded-sm overflow-hidden ${className || ''}`}
      style={{ 
        backgroundColor: 'var(--code-bg)',
        fontFamily: editorTextStyle.fontFamily,
      }}
    >
      {/* Line numbers */}
      <div
        ref={lineNumbersRef}
        className="shrink-0 select-none overflow-hidden text-right pr-3 pl-4 py-4 border-r"
        style={{ 
          color: 'var(--code-line-number)',
          borderColor: 'rgba(255,255,255,0.06)',
          fontSize: editorTextStyle.fontSize,
          lineHeight: editorTextStyle.lineHeight,
          fontFamily: editorTextStyle.fontFamily,
        }}
      >
        {Array.from({ length: lineCount }, (_, i) => (
          <div 
            key={i + 1} 
            className="px-1"
            style={{ 
              backgroundColor: activeLine === i + 1 ? 'var(--code-line-active)' : 'transparent',
              minWidth: '2.5rem'
            }}
          >
            {i + 1}
          </div>
        ))}
      </div>

      {/* Code area */}
      <div className="relative flex-1 overflow-hidden">
        {/* Syntax highlighted code */}
        <pre
          ref={highlightRef}
          className="absolute inset-0 p-4 overflow-auto pointer-events-none m-0"
          style={{ 
            color: 'var(--code-fg)',
            ...editorTextStyle,
          }}
          aria-hidden="true"
        >
          <code 
            className="block whitespace-pre"
            style={editorTextStyle}
            dangerouslySetInnerHTML={{ __html: highlightCode(value) + '\n' }}
          />
        </pre>
        
        {/* Editable textarea */}
        <textarea
          ref={textareaRef}
          data-testid="shader-code-editor"
          aria-label={`${language === 'slang' ? 'Slang' : language.toUpperCase()} code editor`}
          value={value}
          onChange={(e) => {
            const nextValue = e.target.value
            const cursor = e.target.selectionStart
            const history = historyRef.current
            const current = history.entries[history.index]

            if (current?.value !== nextValue) {
              const nextEntries = history.entries.slice(0, history.index + 1)
              nextEntries.push({ value: nextValue, cursor })
              if (nextEntries.length > 200) nextEntries.shift()
              history.entries = nextEntries
              history.index = nextEntries.length - 1
            } else {
              current.cursor = cursor
            }

            onChange(nextValue)
          }}
          onKeyDown={handleKeyDown}
          onClick={updateActiveLine}
          onKeyUp={updateActiveLine}
          onSelect={updateActiveLine}
          onScroll={handleScroll}
          readOnly={isStreaming}
          aria-busy={isStreaming}
          className="relative w-full h-full p-4 bg-transparent resize-none outline-none"
          style={{
            color: 'transparent',
            caretColor: isStreaming ? 'transparent' : 'var(--code-fg)',
            ...editorTextStyle,
          }}
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
        />
      </div>

      {/* AI "writing" cue: left accent bar + pulsing badge while streaming. */}
      {isStreaming && (
        <div
          className="pointer-events-none absolute inset-0 z-10"
          data-testid="editor-streaming-overlay"
          aria-hidden="true"
        >
          <div
            className="absolute left-0 top-0 bottom-0 w-[2px]"
            style={{ backgroundColor: 'var(--primary)', opacity: 0.9 }}
          />
          <div
            className="absolute top-2 right-2 flex items-center gap-1.5 rounded-sm px-2 py-1 text-[10px] font-medium"
            style={{
              backgroundColor: 'color-mix(in srgb, var(--primary) 18%, transparent)',
              color: 'var(--primary)',
            }}
          >
            <span
              className="w-1.5 h-1.5 rounded-full animate-pulse"
              style={{ backgroundColor: 'var(--primary)' }}
            />
            AI writing…
          </div>
        </div>
      )}
    </div>
  )
}
