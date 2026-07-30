'use client'

import { useState, useCallback, useRef, useEffect, forwardRef, useImperativeHandle, type FormEvent, type KeyboardEvent } from 'react'
import { Send, Sparkles, Square, Settings } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { SettingsPanel } from '@/components/settings-panel'
import { extractJsonStringField } from '@/lib/stream-json'
import type { AISettings, RenderMode, TextureSlot } from '@/lib/types'

const CHAT_STORAGE_PREFIX = 'slang-ai-lab-ai-chat'
const PROJECTLESS_CHAT_KEY = '__global__'

const UI_MESSAGES = {
  generating: 'Generating shader...',
  cancelled: 'Generation cancelled.',
  interrupted: 'Generation was interrupted (tab closed or page reloaded). Please retry.',
  errorPrefix: (msg: string) => `Error: ${msg}`,
  networkError: (msg: string) => `Network error: ${msg}`,
  shaderGenerated: (content: string) => `Shader generated for: "${content}"`,
  failedToGenerate: 'Failed to generate shader',
  inputPlaceholder: 'Describe your shader...',
  apiKeyRequired: 'API key required...',
} as const

function useCoarsePointer(): boolean {
  const [coarse, setCoarse] = useState(false)
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    const mq = window.matchMedia('(pointer: coarse)')
    const apply = () => setCoarse(mq.matches)
    apply()
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [])
  return coarse
}

export interface AIChatPanelHandle {
  submitPrompt: (text: string) => void
  cancelGeneration: () => void
  isLoading: () => boolean
}

interface AIChatPanelProps {
  onShaderGenerated: (
    vertex: string,
    fragment: string,
    meta?: {
      summary?: string
      targetProjectId?: string | null
      slangSource?: string
    },
  ) => void
  language: 'glsl' | 'hlsl' | 'slang'
  settings: AISettings
  onSettingsChange: (next: AISettings) => void
  textures?: TextureSlot[]
  compact?: boolean
  /** When set, chat history is persisted in localStorage for this project. */
  projectId?: string | null
  /** Hide the bottom input form (input is controlled externally via ref.submitPrompt) */
  hideInput?: boolean
  renderMode?: RenderMode
  /** Fired as Slang tokens stream in, with the partial source written so far. */
  onShaderStreaming?: (projectId: string | null, partialSlang: string) => void
  /** Fired when a generation request starts (true) and settles (false). */
  onGeneratingChange?: (loading: boolean) => void
}

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  fragmentCode?: string
  warnings?: string[]
  /** True while awaiting an in-flight response. Persisted so that we can
   *  detect orphan placeholders on remount (tab close / reload mid-request). */
  pending?: boolean
}

function messageToApiContent(message: Message): string {
  if (message.role === 'assistant' && message.fragmentCode) {
    return `${message.content}

--- Previous fragment shader (GLSL) ---
Keep this shader as the baseline for future tweak requests.
When the user asks for modifications, preserve unchanged behavior and update only requested parts.
If a request is ambiguous, keep prior style and make the smallest coherent change.
${message.fragmentCode}`
  }
  return message.content
}

export const AIChatPanel = forwardRef<AIChatPanelHandle, AIChatPanelProps>(function AIChatPanel({
  onShaderGenerated,
  settings,
  onSettingsChange,
  textures = [],
  renderMode = '2d',
  compact = false,
  projectId = null,
  hideInput = false,
  onShaderStreaming,
  onGeneratingChange,
}, ref) {
  const mobileSubmitViaButtonOnly = useCoarsePointer()
  const [input, setInput] = useState('')
  const [messagesByProject, setMessagesByProject] = useState<Record<string, Message[]>>({})
  const [loadedProjectKeys, setLoadedProjectKeys] = useState<Record<string, true>>({})
  const [isLoadingByProject, setIsLoadingByProject] = useState<Record<string, boolean>>({})
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const abortControllerByProjectRef = useRef<Record<string, AbortController | null>>({})

  const generateId = () => Math.random().toString(36).slice(2, 11)
  const currentProjectKey = projectId ?? PROJECTLESS_CHAT_KEY
  const messages = messagesByProject[currentProjectKey] ?? []
  const isLoading = isLoadingByProject[currentProjectKey] ?? false

  const loadMessagesForProject = useCallback((targetProjectId: string | null): Message[] => {
    if (!targetProjectId) return []
    try {
      const raw = localStorage.getItem(`${CHAT_STORAGE_PREFIX}:${targetProjectId}`)
      if (!raw) return []
      const parsed = JSON.parse(raw) as unknown
      if (
        Array.isArray(parsed) &&
        parsed.every(
          (m) =>
            m &&
            typeof m === 'object' &&
            (m as Message).role &&
            typeof (m as Message).content === 'string',
        )
      ) {
        // Any message still flagged pending was orphaned by a tab close /
        // reload before its response landed. Convert it to an interrupted
        // notice so the user sees what happened instead of a stuck spinner.
        return (parsed as Message[]).map((m) =>
          m.pending
            ? { ...m, pending: false, content: UI_MESSAGES.interrupted }
            : m,
        )
      }
    } catch {
      // ignore and fallback to empty
    }
    return []
  }, [])

  useEffect(() => {
    if (!projectId || loadedProjectKeys[projectId]) {
      return
    }
    const loadedMessages = loadMessagesForProject(projectId)
    setMessagesByProject((prev) => ({ ...prev, [projectId]: loadedMessages }))
    setLoadedProjectKeys((prev) => ({ ...prev, [projectId]: true }))
  }, [projectId, loadedProjectKeys, loadMessagesForProject])

  useEffect(() => {
    const projectIds = Object.keys(messagesByProject).filter((id) => id !== PROJECTLESS_CHAT_KEY)
    for (const id of projectIds) {
      try {
        localStorage.setItem(`${CHAT_STORAGE_PREFIX}:${id}`, JSON.stringify(messagesByProject[id] ?? []))
      } catch {
        /* quota or private mode */
      }
    }
  }, [messagesByProject])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const appendMessageForProject = useCallback(
    (targetProjectId: string | null, nextMessage: Message) => {
      const targetKey = targetProjectId ?? PROJECTLESS_CHAT_KEY
      setMessagesByProject((prev) => {
        const base =
          prev[targetKey] ??
          (targetProjectId ? loadMessagesForProject(targetProjectId) : [])
        return {
          ...prev,
          [targetKey]: [...base, nextMessage],
        }
      })
      if (targetProjectId) {
        setLoadedProjectKeys((prev) => ({ ...prev, [targetProjectId]: true }))
      }
    },
    [loadMessagesForProject],
  )

  const updateMessageForProject = useCallback(
    (
      targetProjectId: string | null,
      messageId: string,
      patch: Partial<Message> | ((m: Message) => Partial<Message>),
    ) => {
      const targetKey = targetProjectId ?? PROJECTLESS_CHAT_KEY
      setMessagesByProject((prev) => {
        const base = prev[targetKey] ?? []
        return {
          ...prev,
          [targetKey]: base.map((m) =>
            m.id === messageId
              ? { ...m, ...(typeof patch === 'function' ? patch(m) : patch) }
              : m,
          ),
        }
      })
    },
    [],
  )

  const sendPrompt = useCallback(async (promptText: string): Promise<boolean> => {
    if (!promptText.trim() || isLoading) return false

    const msgs = UI_MESSAGES

    const requestProjectId = projectId
    const requestProjectKey = requestProjectId ?? PROJECTLESS_CHAT_KEY
    const userMessage: Message = { id: generateId(), role: 'user', content: promptText }
    const pendingId = generateId()
    const pendingPlaceholder: Message = {
      id: pendingId,
      role: 'assistant',
      content: msgs.generating,
      pending: true,
    }
    const historySource = [...messages, userMessage]
    // Append both at once so localStorage records the pending placeholder
    // alongside the user prompt — this is how we recover when the tab is
    // closed mid-request.
    const targetKey = requestProjectKey
    setMessagesByProject((prev) => {
      const base =
        prev[targetKey] ??
        (requestProjectId ? loadMessagesForProject(requestProjectId) : [])
      return { ...prev, [targetKey]: [...base, userMessage, pendingPlaceholder] }
    })
    if (requestProjectId) {
      setLoadedProjectKeys((prev) => ({ ...prev, [requestProjectId]: true }))
    }
    setIsLoadingByProject((prev) => ({ ...prev, [requestProjectKey]: true }))
    onGeneratingChange?.(true)

    const controller = new AbortController()
    abortControllerByProjectRef.current[requestProjectKey] = controller

    type FinalPayload = {
      slang?: string
      description?: string
      warnings?: string[]
    }

    // AI produces canonical Slang only; the playground compiles it to WGSL.
    const applyFinal = (data: FinalPayload) => {
      const slang = data.slang ?? ''
      updateMessageForProject(requestProjectId, pendingId, {
        content: data.description || msgs.shaderGenerated(userMessage.content),
        fragmentCode: slang,
        warnings: data.warnings,
        pending: false,
      })
      onShaderGenerated('', '', {
        summary: data.description || msgs.shaderGenerated(userMessage.content),
        targetProjectId: requestProjectId,
        slangSource: slang,
      })
    }

    try {
      const apiKey = settings.useCustomKey ? settings.apiKey : undefined

      const historyForApi = historySource.map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: messageToApiContent(m),
      }))

      const res = await fetch('/api/generate-shader', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          messages: historyForApi,
          renderMode,
          apiKey,
          model: settings.model,
          textures: textures.map(t => ({ id: t.id, name: t.name, width: t.width, height: t.height })),
        }),
      })

      const contentType = res.headers.get('content-type') ?? ''

      // Non-streaming path: a JSON error (rate limit / validation) or a legacy
      // JSON success body. Handled exactly as before the streaming change.
      if (!res.ok || !res.body || !contentType.includes('text/event-stream')) {
        const data = (await res.json().catch(() => ({}))) as FinalPayload & { error?: string }
        if (!res.ok || data.error || !data.slang) {
          updateMessageForProject(requestProjectId, pendingId, {
            content: msgs.errorPrefix(data.error || msgs.failedToGenerate),
            pending: false,
          })
          return false
        }
        applyFinal(data)
        return true
      }

      // Streaming path: consume Server-Sent Events, revealing the Slang source
      // in the editor as `delta` frames arrive and applying the authoritative
      // `final` payload once the stream completes.
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let accumulatedRaw = ''
      let finalPayload: FinalPayload | null = null
      let streamError: string | null = null

      readLoop: while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        let sep: number
        while ((sep = buffer.indexOf('\n\n')) !== -1) {
          const frame = buffer.slice(0, sep)
          buffer = buffer.slice(sep + 2)
          const dataLine = frame.split('\n').find((l) => l.startsWith('data:'))
          if (!dataLine) continue
          const json = dataLine.slice(5).trim()
          if (!json) continue
          let evt: { type?: string; text?: string; payload?: FinalPayload; error?: string }
          try {
            evt = JSON.parse(json)
          } catch {
            continue
          }
          if (evt.type === 'delta' && typeof evt.text === 'string') {
            accumulatedRaw += evt.text
            const partial = extractJsonStringField(accumulatedRaw, 'slang')
            if (partial !== null) onShaderStreaming?.(requestProjectId, partial)
          } else if (evt.type === 'final' && evt.payload) {
            finalPayload = evt.payload
          } else if (evt.type === 'error') {
            streamError = evt.error || msgs.failedToGenerate
            break readLoop
          }
        }
      }

      if (streamError || !finalPayload?.slang) {
        updateMessageForProject(requestProjectId, pendingId, {
          content: msgs.errorPrefix(streamError || msgs.failedToGenerate),
          pending: false,
        })
        return false
      }
      applyFinal(finalPayload)

    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        updateMessageForProject(requestProjectId, pendingId, {
          content: msgs.cancelled,
          pending: false,
        })
      } else {
        updateMessageForProject(requestProjectId, pendingId, {
          content: msgs.networkError(String(err)),
          pending: false,
        })
      }
      return false
    } finally {
      if (abortControllerByProjectRef.current[requestProjectKey] === controller) {
        abortControllerByProjectRef.current[requestProjectKey] = null
      }
      onGeneratingChange?.(false)
      setIsLoadingByProject((prev) => ({ ...prev, [requestProjectKey]: false }))
    }
    return true
  }, [isLoading, messages, settings, renderMode, onShaderGenerated, onShaderStreaming, onGeneratingChange, textures, projectId, loadMessagesForProject, updateMessageForProject])

  const handleSubmit = useCallback(async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!input.trim()) return
    const text = input
    const submitted = await sendPrompt(text)
    if (submitted) setInput('')
  }, [input, sendPrompt])

  useImperativeHandle(ref, () => ({
    submitPrompt: (text: string) => { sendPrompt(text) },
    cancelGeneration: () => {
      const currentController = abortControllerByProjectRef.current[projectId ?? PROJECTLESS_CHAT_KEY]
      currentController?.abort()
    },
    isLoading: () => isLoadingByProject[projectId ?? PROJECTLESS_CHAT_KEY] ?? false,
  }), [sendPrompt, projectId, isLoadingByProject])

  const blockMobileEnterSubmit = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (!mobileSubmitViaButtonOnly) return
      if (e.key !== 'Enter') return
      e.preventDefault()
    },
    [mobileSubmitViaButtonOnly],
  )

  const clearChat = () => {
    setMessagesByProject((prev) => ({ ...prev, [currentProjectKey]: [] }))
    if (projectId) {
      try {
        localStorage.removeItem(`${CHAT_STORAGE_PREFIX}:${projectId}`)
      } catch {
        /* ignore */
      }
    }
  }

  const cancelCurrentGeneration = () => {
    const currentController = abortControllerByProjectRef.current[currentProjectKey]
    currentController?.abort()
  }

  const quickPrompts = [
    'Colorful plasma with smooth swirling flow, medium speed, high contrast, no harsh flicker',
    'Calm water ripples with blue-cyan palette, soft highlights, subtle wave interference',
    'Stylized fire: orange-red flames rising upward, turbulent motion, bright core and dark edges',
    'Deep-space nebula with drifting starfield, purple-magenta tones, slow cinematic movement',
  ]

  const hasApiKey = !settings.useCustomKey || (settings.useCustomKey && settings.apiKey)

  return (
    <div className="flex flex-col h-full" style={{
      '--background': 'transparent',
      '--foreground': '#e8dcc4',
      '--muted': 'rgba(255,245,220,0.1)',
      '--muted-foreground': 'rgba(232,220,196,0.55)',
      '--border': 'rgba(255,245,220,0.12)',
      '--input': 'rgba(255,245,220,0.08)',
      '--primary': '#fbbf24',
      '--primary-foreground': '#0d0b08',
    } as React.CSSProperties}>
      {!compact && (
        <div
          className="flex items-center justify-between p-4"
          style={{ borderBottom: '0.5px solid var(--border)' }}
        >
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4" style={{ color: 'var(--primary)' }} />
            <h2 className="font-serif italic text-sm">AI Generator</h2>
          </div>
          {messages.length > 0 && (
            <Button variant="ghost" size="sm" onClick={clearChat} className="text-xs ghost-border">
              Clear
            </Button>
          )}
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-auto p-3 space-y-3">
        {compact && messages.length > 0 && (
          <div className="flex justify-end">
            <Button variant="ghost" size="sm" onClick={clearChat} className="text-[10px] ghost-border h-6 px-2">
              Clear
            </Button>
          </div>
        )}

        {messages.length === 0 && (
          <div className={`text-center ${compact ? 'py-4' : 'py-8'}`} style={{ color: 'var(--muted-foreground)' }}>
            <Sparkles className={`mx-auto mb-3 opacity-40 ${compact ? 'w-8 h-8' : 'w-10 h-10'}`} />
            {!hasApiKey ? (
              <>
                <p className="text-xs uppercase tracking-wide">API key required</p>
                <p className="text-[10px] mt-1.5 opacity-70">Set your Groq API key from the Settings button below.</p>
              </>
            ) : (
              <>
                <p className="text-xs uppercase tracking-wide">Describe the shader effect you want</p>
                <p className="text-[10px] mt-1.5 opacity-70">Try: &quot;colorful plasma&quot; or &quot;water ripples&quot;</p>
                <div className="flex flex-wrap gap-1.5 justify-center mt-3">
                  {quickPrompts.map((prompt) => (
                    <button
                      key={prompt}
                      onClick={() => hideInput ? sendPrompt(prompt) : setInput(prompt)}
                      className="text-[10px] px-2.5 py-1 rounded-sm transition-colors ghost-border"
                      style={{ backgroundColor: 'var(--muted)' }}
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {messages.filter((m) => !m.pending).map((message) => (
          <div
            key={message.id}
            className={`flex flex-col gap-2 ${message.role === 'user' ? 'items-end' : 'items-start'}`}
          >
            <div
              className="max-w-[90%] rounded-sm p-3"
              style={{
                backgroundColor: message.role === 'user' ? 'var(--primary)' : 'var(--muted)',
                color: message.role === 'user' ? 'var(--primary-foreground)' : 'var(--foreground)',
              }}
            >
              <p className="text-xs whitespace-pre-wrap">{message.content}</p>
              {message.warnings && message.warnings.length > 0 && (
                <div className="mt-2 space-y-1">
                  {message.warnings.map((w, i) => (
                    <p key={i} className="text-[10px] opacity-70">⚠ {w}</p>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}

        {isLoading && (
          <div className="flex items-center gap-2" style={{ color: 'var(--muted-foreground)' }}>
            <Spinner className="w-4 h-4" />
            <span className="text-xs">{UI_MESSAGES.generating}</span>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      {!hideInput && (
      <form
        onSubmit={handleSubmit}
        className={compact ? 'p-2.5' : 'p-4'}
        style={{ borderTop: '0.5px solid var(--border)' }}
      >
        <div className="flex gap-2 items-stretch">
          <input
            type="text"
            data-testid="ai-prompt-input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={blockMobileEnterSubmit}
            enterKeyHint={mobileSubmitViaButtonOnly ? 'done' : 'send'}
            placeholder={hasApiKey ? UI_MESSAGES.inputPlaceholder : UI_MESSAGES.apiKeyRequired}
            className="flex-1 min-h-11 px-3 py-2 rounded-sm text-base md:text-xs focus:outline-none focus:ring-1"
            style={{
              backgroundColor: 'var(--input)',
              border: '0.5px solid var(--border)',
              color: 'var(--foreground)',
            }}
            disabled={isLoading || !hasApiKey}
          />
          <SettingsPanel
            settings={settings}
            onSettingsChange={onSettingsChange}
            menuAlign="start"
            trigger={
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="rounded-sm shrink-0 h-11 w-11 md:h-10 md:w-10"
                title="Model and API key"
              >
                <Settings className="w-4 h-4" />
                <span className="sr-only">Model and API key</span>
              </Button>
            }
          />
          {isLoading ? (
            <Button
              type="button"
              variant="outline"
              onClick={cancelCurrentGeneration}
              className="rounded-sm shrink-0 h-11 w-11 md:h-10 md:w-10 p-0"
              title="Cancel generation"
            >
              <Square className="w-4 h-4" />
              <span className="sr-only">Cancel generation</span>
            </Button>
          ) : (
            <Button
              type="submit"
              size="icon"
              data-testid="ai-send-button"
              disabled={!input.trim() || !hasApiKey}
              className="rounded-sm shrink-0 h-11 w-11 md:h-10 md:w-10"
            >
              <Send className="w-4 h-4" />
              <span className="sr-only">Send</span>
            </Button>
          )}
        </div>
      </form>
      )}
    </div>
  )
})
