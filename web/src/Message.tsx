import { Part } from './Part'
import type { MessageEnvelope } from './types'

type Props = {
  message: MessageEnvelope
  streamingText: Record<string, string>
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

export function Message({ message, streamingText }: Props) {
  const { data, parts, createdAt } = message
  const isUser = data.role === 'user'

  if (isUser) {
    return (
      <div className="message message--user">
        <div className="message-bubble">{data.content}</div>
        <span className="message-time">{formatTime(createdAt)}</span>
      </div>
    )
  }

  const visibleParts = parts.filter(
    (p) =>
      p.data.type === 'text' ||
      p.data.type === 'tool' ||
      p.data.type === 'error' ||
      p.data.type === 'input-required',
  )

  const isStreaming = Object.keys(streamingText).length > 0
  const hasContent = visibleParts.length > 0 || isStreaming

  if (!hasContent) {
    return (
      <div className="message message--assistant">
        <div className="message-thinking">
          <span className="dot" /><span className="dot" /><span className="dot" />
        </div>
      </div>
    )
  }

  return (
    <div className="message message--assistant">
      <div className="message-parts">
        {visibleParts.map((part) => (
          <Part
            key={part.id}
            data={part.data}
            streamingText={part.data.type === 'text' ? streamingText[part.id] : undefined}
          />
        ))}
        {isStreaming && visibleParts.every((p) => p.data.type !== 'text') && (
          <p className="part-text">
            {Object.values(streamingText).join('')}
          </p>
        )}
      </div>
      <span className="message-time">{formatTime(createdAt)}</span>
    </div>
  )
}
