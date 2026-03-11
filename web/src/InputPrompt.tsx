import { useRef, useState, type ChangeEvent, type KeyboardEvent } from 'react'
import type { Attachment, PendingInterrupt } from './types'

type Props = {
  interrupt: PendingInterrupt
  onSubmit: (requestId: string, value: string, attachments?: Attachment[]) => void
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

export function InputPrompt({ interrupt, onSubmit }: Props) {
  const [value, setValue] = useState('')
  const [pendingFiles, setPendingFiles] = useState<File[]>([])
  const [submitting, setSubmitting] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault()
      submit()
    }
  }

  async function submit() {
    const trimmed = value.trim()
    if ((!trimmed && pendingFiles.length === 0) || submitting) return
    setSubmitting(true)
    const attachments = pendingFiles.length > 0
      ? await Promise.all(pendingFiles.map(fileToAttachment))
      : undefined
    onSubmit(interrupt.requestId, trimmed || ' ', attachments)
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

  const inputType = interrupt.inputType === 'password' ? 'password' : 'text'
  const canSubmit = !submitting && (value.trim().length > 0 || pendingFiles.length > 0)

  return (
    <div className="input-prompt">
      <p className="input-prompt-label">Agent needs your input</p>
      <p className="input-prompt-text">{interrupt.prompt}</p>

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
                disabled={submitting}
                aria-label="Remove attachment"
              >
                &#10005;
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="input-prompt-row">
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
          disabled={submitting}
          aria-label="Attach file"
          title="Attach file"
        >
          &#128206;
        </button>
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
          disabled={!canSubmit}
        >
          Submit
        </button>
      </div>
    </div>
  )
}
