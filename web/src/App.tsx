import { useEffect, useState } from 'react'
import './App.css'
import { cancelRun, createSession, listSessions, sendMessage, submitInterrupt } from './api'
import { Chat } from './Chat'
import { Sidebar } from './Sidebar'
import type { SessionInfo } from './types'
import { useSession } from './use-session'

export default function App() {
  const [sessions, setSessions] = useState<SessionInfo[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const { messages, streamingText, agentStatus, pendingInterrupt } = useSession(selectedId)

  useEffect(() => {
    listSessions()
      .then(setSessions)
      .catch(console.error)
  }, [])

  async function handleNew() {
    setSelectedId(null)
  }

  async function handleSend(content: string) {
    try {
      if (!selectedId) {
        const { sessionId } = await createSession(content)
        const updated = await listSessions()
        setSessions(updated)
        setSelectedId(sessionId)
      } else {
        await sendMessage(selectedId, content)
        const updated = await listSessions()
        setSessions(updated)
      }
    } catch (err) {
      console.error(err)
    }
  }

  async function handleCancel() {
    if (!selectedId) return
    try {
      await cancelRun(selectedId)
    } catch (err) {
      console.error(err)
    }
  }

  async function handleSubmitInterrupt(requestId: string, value: string) {
    if (!selectedId) return
    try {
      await submitInterrupt(selectedId, requestId, value)
    } catch (err) {
      console.error(err)
    }
  }

  return (
    <div className="app">
      <Sidebar
        sessions={sessions}
        selectedId={selectedId}
        onSelect={setSelectedId}
        onNew={handleNew}
      />
      <Chat
        sessionId={selectedId}
        messages={messages}
        streamingText={streamingText}
        agentStatus={agentStatus}
        pendingInterrupt={pendingInterrupt}
        onSend={handleSend}
        onCancel={handleCancel}
        onSubmitInterrupt={handleSubmitInterrupt}
      />
    </div>
  )
}
