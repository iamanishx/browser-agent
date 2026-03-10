import { API_BASE } from './config'
import type { SessionInfo } from './types'

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...init?.headers },
    ...init,
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`${res.status} ${res.statusText}: ${body}`)
  }
  return res.json() as Promise<T>
}

export async function listSessions(): Promise<SessionInfo[]> {
  const data = await request<{ sessions: SessionInfo[] }>('/sessions')
  return data.sessions
}

export async function createSession(
  content: string,
): Promise<{ sessionId: string; streamUrl: string }> {
  return request('/sessions', {
    method: 'POST',
    body: JSON.stringify({ content }),
  })
}

export async function sendMessage(
  sessionId: string,
  content: string,
): Promise<{ sessionId: string; streamUrl: string }> {
  return request(`/sessions/${sessionId}/messages`, {
    method: 'POST',
    body: JSON.stringify({ content }),
  })
}

export async function cancelRun(sessionId: string): Promise<void> {
  await request(`/sessions/${sessionId}/cancel`, { method: 'POST' })
}

export async function submitInterrupt(
  sessionId: string,
  requestId: string,
  value: string,
): Promise<void> {
  await request(`/sessions/${sessionId}/interrupt/${requestId}`, {
    method: 'POST',
    body: JSON.stringify({ value }),
  })
}
