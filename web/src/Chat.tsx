import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { Message } from './Message'
import type { AgentStatus, MessageEnvelope } from './types'

type Props = {
  sessionId: string | null
  messages: MessageEnvelope[]
  streamingText: Record<string, string>
  agentStatus: AgentStatus
  onSend: (content: string) => void
  onCancel: () => void
}

export function Chat({ sessionId, messages, streamingText, agentStatus, onSend, onCancel }: Props) {
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
      <div className="chat chat--empty">
        <p className="chat-empty-text">Select a session or start a new one</p>
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
