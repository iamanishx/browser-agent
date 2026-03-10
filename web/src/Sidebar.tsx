import type { SessionInfo } from './types'

type Props = {
  sessions: SessionInfo[]
  selectedId: string | null
  onSelect: (id: string) => void
  onNew: () => void
}

function sessionLabel(s: SessionInfo): string {
  return s.title ?? `Session ${s.id.slice(0, 6)}`
}

function formatDate(ts: number): string {
  const d = new Date(ts)
  const now = new Date()
  const isToday =
    d.getDate() === now.getDate() &&
    d.getMonth() === now.getMonth() &&
    d.getFullYear() === now.getFullYear()
  if (isToday) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' })
}

export function Sidebar({ sessions, selectedId, onSelect, onNew }: Props) {
  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <span className="sidebar-title">browser agent</span>
        <button className="sidebar-new" onClick={onNew} title="New session">
          +
        </button>
      </div>

      <nav className="sidebar-list">
        {sessions.length === 0 && (
          <p className="sidebar-empty">No sessions yet</p>
        )}
        {sessions.map((s) => (
          <button
            key={s.id}
            className={`sidebar-item${s.id === selectedId ? ' sidebar-item--active' : ''}`}
            onClick={() => onSelect(s.id)}
          >
            <span className="sidebar-item-label">{sessionLabel(s)}</span>
            <span className="sidebar-item-date">{formatDate(s.updatedAt)}</span>
          </button>
        ))}
      </nav>
    </aside>
  )
}
