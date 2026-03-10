import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { Message } from './Message'
import { InputPrompt } from './InputPrompt'
import type { AgentStatus, MessageEnvelope, PendingInterrupt } from './types'

type Props = {
  sessionId: string | null
  messages: MessageEnvelope[]
  streamingText: Record<string, string>
  agentStatus: AgentStatus
  pendingInterrupt: PendingInterrupt | null
  onSend: (content: string) => void
  onCancel: () => void
  onSubmitInterrupt: (requestId: string, value: string) => void
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
  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const isRunning = agentStatus === 'running'

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length, Object.keys(streamingText).length])

  useEffect(() => {
    setDraft('')
    textareaRef.current?.focus()
  }, [sessionId])

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      submit()
    }
  }

  function submit() {
    const content = draft.trim()
    if (!content) return
    setDraft('')
    onSend(content)
  }

  function autoResize(el: HTMLTextAreaElement) {
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`
  }

  if (!sessionId) {
    return (
      <div className="chat">
        <div className="chat-messages chat--empty">
          <p className="chat-empty-text">Start a new session by sending a message</p>
        </div>
        <div className="chat-input-bar">
          <textarea
            className="chat-textarea"
            value={draft}
            placeholder="Message…"
            rows={1}
            onChange={(e) => {
              setDraft(e.target.value)
              autoResize(e.target)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                const content = draft.trim()
                if (!content) return
                setDraft('')
                onSend(content)
              }
            }}
          />
          <div className="chat-input-actions">
            <button
              className="btn btn--send"
              onClick={() => {
                const content = draft.trim()
                if (!content) return
                setDraft('')
                onSend(content)
              }}
              disabled={!draft.trim()}
            >
              Send
            </button>
          </div>
        </div>
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

      <div className="chat-input-bar">
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
              disabled={!draft.trim()}
            >
              Send
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
