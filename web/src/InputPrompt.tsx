import { useState, type KeyboardEvent } from 'react'
import type { PendingInterrupt } from './types'

type Props = {
  interrupt: PendingInterrupt
  onSubmit: (requestId: string, value: string) => void
}

export function InputPrompt({ interrupt, onSubmit }: Props) {
  const [value, setValue] = useState('')
  const [submitting, setSubmitting] = useState(false)

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault()
      submit()
    }
  }

  function submit() {
    const trimmed = value.trim()
    if (!trimmed || submitting) return
    setSubmitting(true)
    onSubmit(interrupt.requestId, trimmed)
  }

  const inputType =
    interrupt.inputType === 'password' ? 'password' : 'text'

  return (
    <div className="input-prompt">
      <p className="input-prompt-label">Agent needs your input</p>
      <p className="input-prompt-text">{interrupt.prompt}</p>
      <div className="input-prompt-row">
        <input
          className="input-prompt-input"
          type={inputType}
          value={value}
          autoFocus
          disabled={submitting}
          placeholder={interrupt.inputType === 'otp' ? 'Enter code…' : 'Enter value…'}
          maxLength={interrupt.inputType === 'otp' ? 8 : undefined}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        <button
          className="btn btn--send"
          onClick={submit}
          disabled={!value.trim() || submitting}
        >
          Submit
        </button>
      </div>
    </div>
  )
}
