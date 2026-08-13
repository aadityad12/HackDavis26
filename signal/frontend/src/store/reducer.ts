import { AppState, WsMessage, AgentName, Briefing } from '../types'

const INITIAL_AGENTS = {
  MONITOR:  { name: 'MONITOR'  as AgentName, status: 'IDLE' as const, last_action: 'Watching call volume' },
  TRIAGE:   { name: 'TRIAGE'   as AgentName, status: 'IDLE' as const, last_action: 'Waiting for calls' },
  RESOURCE: { name: 'RESOURCE' as AgentName, status: 'IDLE' as const, last_action: 'Ready to dispatch' },
  RELAY:    { name: 'RELAY'    as AgentName, status: 'IDLE' as const, last_action: 'Ready for briefings' },
}

export const initialState: AppState = {
  mode: 'ASSISTED',
  calls: [],
  agents: INITIAL_AGENTS,
  activeHold: null,
  briefings: [],
  auditLog: [],
  connected: false,
  resetKey: 0,
}

export type Action =
  | { type: 'WS_MESSAGE'; message: WsMessage }
  | { type: 'WS_CONNECTED' }
  | { type: 'WS_DISCONNECTED' }

export function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'WS_CONNECTED':
      return { ...state, connected: true }
    case 'WS_DISCONNECTED':
      return { ...state, connected: false }
    case 'WS_MESSAGE':
      return handleMessage(state, action.message)
    default:
      return state
  }
}

function handleMessage(state: AppState, msg: WsMessage): AppState {
  const now = new Date().toISOString()
  switch (msg.type) {
    case 'DEMO_RESET':
      return {
        ...initialState,
        connected: state.connected,
        resetKey: state.resetKey + 1,
        auditLog: [{ timestamp: msg.payload.timestamp || now, type: 'DEMO_RESET', summary: 'Demo reset — UI state cleared' }],
      }
    case 'MODE_CHANGE':
      return {
        ...state,
        mode: msg.payload.mode,
        auditLog: [{ timestamp: now, type: 'MODE_CHANGE', summary: `Mode changed to ${msg.payload.mode}` }, ...state.auditLog],
      }
    case 'CALL_ADDED': {
      const existing = state.calls.findIndex(c => c.id === msg.payload.id)
      const updatedCall = { ...msg.payload }
      const calls = existing >= 0
        ? state.calls.map((c, i) => i === existing ? { ...c, ...updatedCall } : c)
        : [{ ...updatedCall, _t: Date.now() }, ...state.calls]
      return {
        ...state,
        calls,
        auditLog: [{ timestamp: now, type: 'CALL_ADDED', summary: `Call ${msg.payload.id}: ${msg.payload.severity} — ${msg.payload.incident_type} in ${msg.payload.zone}` }, ...state.auditLog],
      }
    }
    case 'AGENT_STATUS':
      return {
        ...state,
        agents: {
          ...state.agents,
          [msg.payload.agent]: { name: msg.payload.agent, status: msg.payload.status, last_action: msg.payload.last_action },
        },
      }
    case 'UNIT_DISPATCHED': {
      const calls = state.calls.map(c =>
        c.id === msg.payload.call_id ? { ...c, unit_id: msg.payload.unit_id, eta_minutes: msg.payload.eta_minutes } : c
      )
      return {
        ...state,
        calls,
        auditLog: [{ timestamp: now, type: 'UNIT_DISPATCHED', summary: `${msg.payload.unit_id} dispatched to call ${msg.payload.call_id} — ETA ${msg.payload.eta_minutes} min` }, ...state.auditLog],
      }
    }
    case 'HOLD_REQUIRED':
      return {
        ...state,
        activeHold: msg.payload,
        auditLog: [{ timestamp: now, type: 'HOLD_REQUIRED', summary: `${msg.payload.asset_type.replace(/_/g, ' ')} requested for call ${msg.payload.call_id} — awaiting dispatcher approval` }, ...state.auditLog],
      }
    case 'HOLD_RESOLVED':
      return {
        ...state,
        activeHold: state.activeHold?.hold_id === msg.payload.hold_id ? null : state.activeHold,
        auditLog: [{ timestamp: now, type: 'HOLD_RESOLVED', summary: `Heavy asset hold ${msg.payload.action.toLowerCase()} by dispatcher` }, ...state.auditLog],
      }
    case 'BRIEFING_READY': {
      const briefing: Briefing = {
        call_id: msg.payload.call_id,
        text: msg.payload.text,
        audio_url: msg.payload.audio_url,
        timestamp: now,
      }
      const calls = state.calls.map(c =>
        c.id === msg.payload.call_id ? { ...c, briefing_text: msg.payload.text } : c
      )
      return {
        ...state,
        calls,
        briefings: [briefing, ...state.briefings],
        auditLog: [{ timestamp: now, type: 'BRIEFING_READY', summary: msg.payload.text }, ...state.auditLog],
      }
    }
    case 'INCIDENT_REPORT':
      return {
        ...state,
        auditLog: [{ timestamp: now, type: 'INCIDENT_REPORT', summary: `Call ${msg.payload.call_id} — incident report finalized and archived` }, ...state.auditLog],
      }
    case 'DEMO_PAUSED':
      return {
        ...state,
        auditLog: [{ timestamp: msg.payload.timestamp || now, type: 'DEMO_PAUSED', summary: 'Simulator paused — API spend halted' }, ...state.auditLog],
      }
    case 'DEMO_RESUMED':
      return {
        ...state,
        auditLog: [{ timestamp: msg.payload.timestamp || now, type: 'DEMO_RESUMED', summary: 'Simulator resumed' }, ...state.auditLog],
      }
    case 'CALL_UPDATED': {
      const p = msg.payload
      const normalizedHazards = p.hazards != null
        ? (Array.isArray(p.hazards) ? p.hazards : [String(p.hazards)].filter(Boolean))
        : undefined
      const normalizedServiceTypes = p.service_types != null
        ? (Array.isArray(p.service_types) ? p.service_types : [String(p.service_types)].filter(Boolean))
        : undefined
      const calls = state.calls.map((c) => {
        if (c.id !== p.id) return c
        const updatedTranscript = p.transcript_snippet
          ? (c.transcript ? c.transcript + ' ' + p.transcript_snippet : p.transcript_snippet)
          : c.transcript
        const updatedLiveFields = {
          ...c.live_fields,
          ...(p.location != null ? { location: p.location } : {}),
          ...(p.one_liner != null ? { one_liner: p.one_liner } : {}),
          ...(p.caller_status != null ? { caller_status: p.caller_status } : {}),
          ...(p.people_affected != null ? { people_affected: Number(p.people_affected) || undefined } : {}),
          ...(normalizedHazards != null ? { hazards: normalizedHazards } : {}),
          ...(p.sex != null ? { sex: p.sex } : {}),
          ...(p.age != null ? { age: p.age } : {}),
          ...(p.advice != null ? { advice: p.advice } : {}),
          ...(normalizedServiceTypes != null ? { service_types: normalizedServiceTypes } : {}),
        }
        const updatedSeverity = (p.severity && p.severity !== 'PENDING') ? p.severity : c.severity
        return {
          ...c,
          live: true,
          transcript: updatedTranscript,
          live_fields: updatedLiveFields,
          severity: updatedSeverity,
        }
      })
      return { ...state, calls }
    }
    default:
      return state
  }
}
