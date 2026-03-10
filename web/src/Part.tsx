import type { PartData } from './types'

type Props = {
  data: PartData
  streamingText?: string
}

export function Part({ data, streamingText }: Props) {
  if (data.type === 'text') {
    const text = streamingText !== undefined ? streamingText : data.text
    if (!text) return null
    return <p className="part-text">{text}</p>
  }

  if (data.type === 'tool') {
    const { tool, state } = data

    if (state.status === 'pending' || state.status === 'running') {
      return (
        <div className="part-tool part-tool--running">
          <span className="part-tool-name">{tool}</span>
          <span className="part-tool-status">running</span>
        </div>
      )
    }

    if (state.status === 'error') {
      return (
        <div className="part-tool part-tool--error">
          <span className="part-tool-name">{tool}</span>
          <span className="part-tool-error">{state.error}</span>
        </div>
      )
    }

    return (
      <details className="part-tool part-tool--done">
        <summary>
          <span className="part-tool-name">{tool}</span>
          <span className="part-tool-duration">
            {((state.time.end - state.time.start) / 1000).toFixed(1)}s
          </span>
        </summary>
        <pre className="part-tool-output">{state.output}</pre>
      </details>
    )
  }

  if (data.type === 'error') {
    return (
      <p className={`part-error${data.fatal ? ' part-error--fatal' : ''}`}>
        {data.error}
      </p>
    )
  }

  if (data.type === 'input-required') {
    const { prompt, status } = data

    if (status === 'pending') {
      return (
        <div className="part-input-required part-input-required--pending">
          <span className="part-input-pending-dot" />
          <span>{prompt}</span>
          <span className="part-input-status">waiting for input</span>
        </div>
      )
    }

    if (status === 'completed') {
      return (
        <div className="part-input-required part-input-required--completed">
          <span>{prompt}</span>
          <span className="part-input-status">input provided</span>
        </div>
      )
    }

    if (status === 'cancelled') {
      return (
        <div className="part-input-required part-input-required--cancelled">
          <span>{prompt}</span>
          <span className="part-input-status">cancelled</span>
        </div>
      )
    }

    if (status === 'timed-out') {
      return (
        <div className="part-input-required part-input-required--timed-out">
          <span>{prompt}</span>
          <span className="part-input-status">timed out</span>
        </div>
      )
    }
  }

  return null
}
