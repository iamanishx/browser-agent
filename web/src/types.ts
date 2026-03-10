export type SessionStatus = 'active' | 'archived'

export type UserMessageData = {
  role: 'user'
  content: string
  time: { created: number }
}

export type AssistantMessageData = {
  role: 'assistant'
  time: { created: number; completed?: number }
  model: string
  tokens?: { input: number; output: number }
  cost?: number
  finish?: string
  error?: string
}

export type MessageData = UserMessageData | AssistantMessageData

export type TextPartData = {
  type: 'text'
  text: string
  time: { start: number; end?: number }
}

export type ReasoningPartData = {
  type: 'reasoning'
  text: string
  time: { start: number; end?: number }
}

export type ToolPartState =
  | { status: 'pending'; input: Record<string, unknown> }
  | { status: 'running'; input: Record<string, unknown>; time: { start: number } }
  | {
      status: 'completed'
      input: Record<string, unknown>
      output: string
      time: { start: number; end: number }
    }
  | {
      status: 'error'
      input: Record<string, unknown>
      error: string
      time: { start: number; end: number }
    }

export type ToolPartData = {
  type: 'tool'
  tool: string
  callID: string
  state: ToolPartState
}

export type ErrorPartData = {
  type: 'error'
  error: string
  fatal?: boolean
  time: { created: number }
}

export type StepStartPartData = {
  type: 'step-start'
  time: { start: number }
}

export type StepFinishPartData = {
  type: 'step-finish'
  reason: string
  time: { start: number; end: number }
  tokens?: { input: number; output: number }
}

export type PartData =
  | TextPartData
  | ReasoningPartData
  | ToolPartData
  | ErrorPartData
  | StepStartPartData
  | StepFinishPartData

export type PartEnvelope = {
  id: string
  data: PartData
  createdAt: number
}

export type MessageEnvelope = {
  id: string
  sessionId: string
  data: MessageData
  parts: PartEnvelope[]
  createdAt: number
}

export type SessionInfo = {
  id: string
  title: string | null
  status: SessionStatus
  createdAt: number
  updatedAt: number
}

export type AgentStatus = 'idle' | 'running' | 'completed' | 'failed' | 'cancelled'
