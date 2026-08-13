export type Mode = 'ASSISTED' | 'SURGE'
export type Severity = 'CRITICAL' | 'URGENT' | 'STANDARD' | 'PENDING'
export type AgentName = 'MONITOR' | 'TRIAGE' | 'RESOURCE' | 'RELAY'
export type AgentStatus = 'IDLE' | 'RUNNING' | 'COMPLETE' | 'ERROR'

export interface Call {
  id: string
  severity: Severity
  zone: string
  vulnerable: boolean
  incident_type: string
  lat?: number
  lon?: number
  unit_id?: string
  eta_minutes?: number
  briefing_text?: string
  _t?: number
  live?: boolean
  transcript?: string
  description?: string
  transcript_id?: string
  live_fields?: {
    location?: string
    one_liner?: string
    caller_status?: string
    people_affected?: number
    hazards?: string[]
    sex?: string
    age?: number | string
    advice?: string
    service_types?: string[]
  }
}

export interface CallUpdatedPayload {
  id: string
  final: boolean
  transcript_snippet?: string
  severity?: Severity
  incident_type?: string
  location?: string
  one_liner?: string
  caller_status?: string
  people_affected?: number
  hazards?: string[] | string
  sex?: string
  age?: number | string
  advice?: string
  service_types?: string[] | string
}

export interface AgentState {
  name: AgentName
  status: AgentStatus
  last_action: string
}

export interface HoldEvent {
  call_id: string
  unit_id: string
  asset_type: string
  hold_id: string
  eta_minutes?: number
  zone?: string
  severity?: string
  incident_type?: string
  description?: string
}

export interface AuditEntry {
  timestamp: string
  type: string
  summary: string
}

export interface Briefing {
  call_id: string
  text: string
  audio_url: string | null
  timestamp: string
}

export interface AppState {
  mode: Mode
  calls: Call[]
  agents: Record<AgentName, AgentState>
  activeHold: HoldEvent | null
  briefings: Briefing[]
  auditLog: AuditEntry[]
  connected: boolean
  resetKey: number
}

export type WsMessage =
  | { type: 'DEMO_RESET'; payload: { timestamp: string } }
  | { type: 'MODE_CHANGE'; payload: { mode: Mode; timestamp: string } }
  | { type: 'CALL_ADDED'; payload: { id: string; severity: Severity; zone: string; vulnerable: boolean; incident_type: string; lat?: number; lon?: number } }
  | { type: 'AGENT_STATUS'; payload: { agent: AgentName; status: AgentStatus; last_action: string } }
  | { type: 'UNIT_DISPATCHED'; payload: { call_id: string; unit_id: string; eta_minutes: number } }
  | { type: 'HOLD_REQUIRED'; payload: HoldEvent }
  | { type: 'HOLD_RESOLVED'; payload: { hold_id: string; action: 'CONFIRMED' | 'CANCELLED' } }
  | { type: 'BRIEFING_READY'; payload: { call_id: string; text: string; audio_url: string | null } }
  | { type: 'INCIDENT_REPORT'; payload: { call_id: string; report: object } }
  | { type: 'CALL_UPDATED'; payload: CallUpdatedPayload }
  | { type: 'DEMO_PAUSED'; payload: { timestamp: string } }
  | { type: 'DEMO_RESUMED'; payload: { timestamp: string } }
