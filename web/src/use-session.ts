import { useEffect, useReducer, useRef } from 'react'
import { API_BASE } from './config'
import type {
  AgentStatus,
  MessageEnvelope,
  PartData,
  PartEnvelope,
  PendingInterrupt,
  SessionInfo,
} from './types'

type State = {
  session: SessionInfo | null
  messages: MessageEnvelope[]
  streamingText: Record<string, string>
  agentStatus: AgentStatus
  pendingInterrupt: PendingInterrupt | null
}

type Action =
  | { type: 'SESSION'; payload: SessionInfo }
  | { type: 'MESSAGE_SNAPSHOT'; payload: MessageEnvelope }
  | { type: 'MESSAGE_CREATED'; payload: { messageId: string; role: string } }
  | { type: 'MESSAGE_UPDATED'; payload: { messageId: string; finish: string } }
  | { type: 'PART_CREATED'; payload: { messageId: string; partId: string; data: PartData } }
  | { type: 'PART_UPDATED'; payload: { messageId: string; partId: string; data: PartData } }
  | { type: 'PART_DELTA'; payload: { messageId: string; partId: string; text: string } }
  | { type: 'STATUS_CHANGE'; payload: { status: AgentStatus } }
  | { type: 'CANCELLED' }
  | { type: 'INPUT_REQUIRED'; payload: PendingInterrupt }
  | { type: 'INPUT_RESOLVED'; payload: { requestId: string } }
  | { type: 'RESET' }

function upsertPart(parts: PartEnvelope[], partId: string, data: PartData): PartEnvelope[] {
  const idx = parts.findIndex((p) => p.id === partId)
  const entry: PartEnvelope = { id: partId, data, createdAt: Date.now() }
  if (idx === -1) return [...parts, entry]
  const next = [...parts]
  next[idx] = { ...next[idx], data }
  return next
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'SESSION':
      return { ...state, session: action.payload }

    case 'MESSAGE_SNAPSHOT': {
      const exists = state.messages.find((m) => m.id === action.payload.id)
      if (exists) return state
      return { ...state, messages: [...state.messages, action.payload] }
    }

    case 'MESSAGE_CREATED': {
      const { messageId, role } = action.payload
      if (state.messages.find((m) => m.id === messageId)) return state
      const newMsg: MessageEnvelope = {
        id: messageId,
        sessionId: state.session?.id ?? '',
        data:
          role === 'user'
            ? { role: 'user', content: '', time: { created: Date.now() } }
            : { role: 'assistant', time: { created: Date.now() }, model: '' },
        parts: [],
        createdAt: Date.now(),
      }
      return { ...state, messages: [...state.messages, newMsg] }
    }

    case 'MESSAGE_UPDATED': {
      const { messageId, finish } = action.payload
      return {
        ...state,
        messages: state.messages.map((m) => {
          if (m.id !== messageId) return m
          if (m.data.role !== 'assistant') return m
          return { ...m, data: { ...m.data, finish, time: { ...m.data.time, completed: Date.now() } } }
        }),
      }
    }

    case 'PART_CREATED':
    case 'PART_UPDATED': {
      const { messageId, partId, data } = action.payload
      return {
        ...state,
        messages: state.messages.map((m) => {
          if (m.id !== messageId) return m
          return { ...m, parts: upsertPart(m.parts, partId, data) }
        }),
      }
    }

    case 'PART_DELTA': {
      const { partId, text } = action.payload
      return {
        ...state,
        streamingText: {
          ...state.streamingText,
          [partId]: (state.streamingText[partId] ?? '') + text,
        },
      }
    }

    case 'STATUS_CHANGE': {
      const { status } = action.payload
      const terminal = status === 'completed' || status === 'failed' || status === 'cancelled'
      return {
        ...state,
        agentStatus: status,
        streamingText: terminal ? {} : state.streamingText,
        pendingInterrupt: terminal ? null : state.pendingInterrupt,
      }
    }

    case 'CANCELLED':
      return { ...state, agentStatus: 'cancelled', streamingText: {}, pendingInterrupt: null }

    case 'INPUT_REQUIRED':
      return { ...state, pendingInterrupt: action.payload }

    case 'INPUT_RESOLVED': {
      if (state.pendingInterrupt?.requestId === action.payload.requestId) {
        return { ...state, pendingInterrupt: null }
      }
      return state
    }

    case 'RESET':
      return { session: null, messages: [], streamingText: {}, agentStatus: 'idle', pendingInterrupt: null }

    default:
      return state
  }
}

const initial: State = {
  session: null,
  messages: [],
  streamingText: {},
  agentStatus: 'idle',
  pendingInterrupt: null,
}

export type UseSessionResult = State & { lastEventId: number }

export function useSession(sessionId: string | null): UseSessionResult {
  const [state, dispatch] = useReducer(reducer, initial)
  const lastEventId = useRef(0)

  useEffect(() => {
    if (!sessionId) {
      dispatch({ type: 'RESET' })
      lastEventId.current = 0
      return
    }

    dispatch({ type: 'RESET' })
    lastEventId.current = 0

    const url = `${API_BASE}/sessions/${sessionId}/stream`
    const es = new EventSource(url)

    function handleEvent(eventType: string, raw: string) {
      let payload: Record<string, unknown>
      try {
        payload = JSON.parse(raw) as Record<string, unknown>
      } catch {
        return
      }

      switch (eventType) {
        case 'session':
          dispatch({ type: 'SESSION', payload: payload as unknown as SessionInfo })
          break

        case 'message':
          dispatch({ type: 'MESSAGE_SNAPSHOT', payload: payload as unknown as MessageEnvelope })
          break

        case 'message-created':
          dispatch({
            type: 'MESSAGE_CREATED',
            payload: {
              messageId: payload.messageId as string,
              role: (payload.role as string) ?? 'assistant',
            },
          })
          break

        case 'message-updated':
          dispatch({
            type: 'MESSAGE_UPDATED',
            payload: {
              messageId: payload.messageId as string,
              finish: (payload.finish as string) ?? 'completed',
            },
          })
          break

        case 'part-created':
          dispatch({
            type: 'PART_CREATED',
            payload: {
              messageId: payload.messageId as string,
              partId: payload.partId as string,
              data: payload as unknown as PartData,
            },
          })
          break

        case 'part-updated':
          dispatch({
            type: 'PART_UPDATED',
            payload: {
              messageId: payload.messageId as string,
              partId: payload.partId as string,
              data: payload as unknown as PartData,
            },
          })
          break

        case 'part-delta':
          dispatch({
            type: 'PART_DELTA',
            payload: {
              messageId: payload.messageId as string,
              partId: payload.partId as string,
              text: payload.text as string,
            },
          })
          break

        case 'status-change':
          dispatch({
            type: 'STATUS_CHANGE',
            payload: { status: payload.status as AgentStatus },
          })
          break

        case 'cancelled':
          dispatch({ type: 'CANCELLED' })
          break

        case 'input-required':
          dispatch({
            type: 'INPUT_REQUIRED',
            payload: {
              requestId: payload.requestId as string,
              messageId: payload.messageId as string,
              partId: payload.partId as string,
              prompt: payload.prompt as string,
              inputType: (payload.inputType as 'otp' | 'text' | 'password') ?? 'otp',
            },
          })
          break

        case 'input-resolved':
          dispatch({
            type: 'INPUT_RESOLVED',
            payload: { requestId: payload.requestId as string },
          })
          break

        case 'heartbeat':
        case 'error':
          break
      }
    }

    const eventTypes = [
      'session',
      'message',
      'message-created',
      'message-updated',
      'part-created',
      'part-updated',
      'part-delta',
      'status-change',
      'cancelled',
      'input-required',
      'input-resolved',
      'heartbeat',
      'error',
    ]

    const listeners = eventTypes.map((eventType) => {
      const handler = (e: MessageEvent) => {
        if (e.lastEventId) lastEventId.current = Number(e.lastEventId)
        handleEvent(eventType, e.data as string)
      }
      es.addEventListener(eventType, handler)
      return { eventType, handler }
    })

    return () => {
      listeners.forEach(({ eventType, handler }) => {
        es.removeEventListener(eventType, handler)
      })
      es.close()
    }
  }, [sessionId])

  return { ...state, lastEventId: lastEventId.current }
}
