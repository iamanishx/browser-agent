import { useEffect, useRef, useState, type ChangeEvent, type KeyboardEvent } from 'react'
import { Message } from './Message'
import { InputPrompt } from './InputPrompt'
import type { AgentStatus, Attachment, MessageEnvelope, PendingInterrupt } from './types'

type Props = {
  sessionId: string | null
  messages: MessageEnvelope[]
  streamingText: Record<string, string>
  agentStatus: AgentStatus
  pendingInterrupt: PendingInterrupt | null
  onSend: (content: string, attachments?: Attachment[]) => void
  onCancel: () => void
  onSubmitInterrupt: (requestId: string, value: string, attachments?: Attachment[]) => void
}

async function fileToAttachment(file: File): Promise<Attachment> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = reader.result as string
      const base64 = dataUrl.split(',')[1]
      resolve({ data: base64, mimeType: file.type || 'application/octet-stream', name: file.name })
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

export function Chat({
  sessionId,
  messages,
  streamingText,
  agentStatus,
  pendingInterrupt,
  onSend,
  onCancel,
  onSubmitInterrupt,
}: Props) {
  const [draft, setDraft] = useState('')
  const [pendingFiles, setPendingFiles] = useState<File[]>([])
  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const isRunning = agentStatus === 'running'

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length, Object.keys(streamingText).length])

  useEffect(() => {
    setDraft('')
    setPendingFiles([])
    textareaRef.current?.focus()
  }, [sessionId])

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      submit()
    }
  }

  async function submit() {
    const content = draft.trim()
    if (!content && pendingFiles.length === 0) return
    const attachments = pendingFiles.length > 0
      ? await Promise.all(pendingFiles.map(fileToAttachment))
      : undefined
    setDraft('')
    setPendingFiles([])
    onSend(content || ' ', attachments)
  }

  function autoResize(el: HTMLTextAreaElement) {
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`
  }

  function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    if (files.length === 0) return
    setPendingFiles((prev) => [...prev, ...files])
    e.target.value = ''
  }

  function removeFile(index: number) {
    setPendingFiles((prev) => prev.filter((_, i) => i !== index))
  }

  const canSend = !isRunning && (draft.trim().length > 0 || pendingFiles.length > 0)

  function renderInputBar() {
    return (
      <>
        {pendingFiles.length > 0 && (
          <div className="attachment-strip">
            {pendingFiles.map((file, i) => (
              <div key={i} className="attachment-chip">
                {file.type.startsWith('image/') ? (
                  <img
                    className="attachment-thumb"
                    src={URL.createObjectURL(file)}
                    alt={file.name}
                  />
                ) : (
                  <span className="attachment-icon">&#128196;</span>
                )}
                <span className="attachment-name">{file.name}</span>
                <button
                  className="attachment-remove"
                  onClick={() => removeFile(i)}
                  aria-label="Remove attachment"
                >
                  &#10005;
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="chat-input-bar">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/*,.pdf,.txt,.csv,.json,.md"
            className="file-input-hidden"
            onChange={handleFileChange}
          />
          <button
            className="btn btn--attach"
            onClick={() => fileInputRef.current?.click()}
            disabled={isRunning}
            aria-label="Attach file"
            title="Attach file"
          >
            &#128206;
          </button>
          <textarea
            ref={textareaRef}
            className="chat-textarea"
            value={draft}
            placeholder="Message…"
            rows={1}
            disabled={isRunning}
            onChange={(e) => {
              setDraft(e.target.value)
              autoResize(e.target)
            }}
            onKeyDown={handleKeyDown}
          />
          <div className="chat-input-actions">
            {isRunning ? (
              <button className="btn btn--stop" onClick={onCancel}>
                Stop
              </button>
            ) : (
              <button
                className="btn btn--send"
                onClick={submit}
                disabled={!canSend}
              >
                Send
              </button>
            )}
          </div>
        </div>
      </>
    )
  }

  if (!sessionId) {
    return (
      <div className="chat">
        <div className="chat-messages chat--empty">
          <p className="chat-empty-text">Start a new session by sending a message</p>
        </div>
        {renderInputBar()}
      </div>
    )
  }

  return (
    <div className="chat">
      <div className="chat-messages">
        {messages.length === 0 && (
          <p className="chat-empty-text">Send a message to start</p>
        )}
        {messages.map((msg) => (
          <Message key={msg.id} message={msg} streamingText={streamingText} />
        ))}
        <div ref={bottomRef} />
      </div>

      {pendingInterrupt && (
        <InputPrompt interrupt={pendingInterrupt} onSubmit={onSubmitInterrupt} />
      )}

      {renderInputBar()}
    </div>
  )
}
