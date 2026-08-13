import { useReducer, useCallback, useState, useEffect, useRef } from 'react'
import { reducer, initialState } from './store/reducer'
import { useWebSocket } from './hooks/useWebSocket'
import { WsMessage, AgentName } from './types'
import ModeIndicator from './components/ModeIndicator'
import AgentCards from './components/AgentCards'
import CallQueue from './components/CallQueue'
import MapView, { MapHandle } from './components/MapView'
import OverrideButton from './components/OverrideButton'
import HoldModal from './components/HoldModal'
import BriefingPanel from './components/BriefingPanel'
import AuditTrail from './components/AuditTrail'
import DemoControls from './components/DemoControls'
import AssistedCallModal from './components/AssistedCallModal'
import SurgeCallModal from './components/SurgeCallModal'
import SosQrCode from './components/SosQrCode'

export default function App() {
  const [state, dispatch] = useReducer(reducer, initialState)
  const [agentFlash, setAgentFlash] = useState<Record<string, boolean>>({})
  const prevAgentsRef = useRef(state.agents)
  const mapRef = useRef<MapHandle>(null)
  const [activeCallId, setActiveCallId] = useState<string | null>(null)
  const [activeSurgeCallId, setActiveSurgeCallId] = useState<string | null>(null)

  // Flash agent cards when transitioning into RUNNING
  useEffect(() => {
    const flashes: Record<string, boolean> = {}
    ;(Object.keys(state.agents) as AgentName[]).forEach((name) => {
      const prev = prevAgentsRef.current[name]
      if (prev?.status !== 'RUNNING' && state.agents[name].status === 'RUNNING') {
        flashes[name] = true
      }
    })
    if (Object.keys(flashes).length > 0) {
      setAgentFlash((f) => ({ ...f, ...flashes }))
      setTimeout(() => {
        setAgentFlash((f) => {
          const next = { ...f }
          Object.keys(flashes).forEach((k) => delete next[k])
          return next
        })
      }, 600)
    }
    prevAgentsRef.current = state.agents
  }, [state.agents])

  const onMessage = useCallback((msg: WsMessage) => {
    dispatch({ type: 'WS_MESSAGE', message: msg })
  }, [])

  const onConnect = useCallback(() => dispatch({ type: 'WS_CONNECTED' }), [])
  const onDisconnect = useCallback(() => dispatch({ type: 'WS_DISCONNECTED' }), [])

  useWebSocket(onMessage, onConnect, onDisconnect)

  const handleConfirmHold = useCallback((holdId: string) => {
    dispatch({ type: 'WS_MESSAGE', message: { type: 'HOLD_RESOLVED', payload: { hold_id: holdId, action: 'CONFIRMED' } } })
  }, [])

  const handleCancelHold = useCallback((holdId: string) => {
    dispatch({ type: 'WS_MESSAGE', message: { type: 'HOLD_RESOLVED', payload: { hold_id: holdId, action: 'CANCELLED' } } })
  }, [])

  const handleSelectCall = useCallback((callId: string) => {
    const call = state.calls.find((c) => c.id === callId)
    if (!call) return
    if (state.mode === 'SURGE') {
      setActiveSurgeCallId(callId)
      return
    }
    setActiveCallId(callId)
  }, [state.calls, state.mode])

  const handleEndAssistedCall = useCallback(async (
    callId: string,
    approvedServices: string[],
    notes: string,
  ) => {
    setActiveCallId(null)
    try {
      await fetch('/api/call/end-live', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ call_id: callId, approved_services: approvedServices, notes }),
      })
    } catch {
      // best-effort
    }
  }, [])

  const activeCall = activeCallId ? state.calls.find((c) => c.id === activeCallId) : null

  return (
    <div className="app-shell">
      <ModeIndicator mode={state.mode} connected={state.connected} />

      <div className="main-grid">
        <CallQueue
          calls={state.calls}
          onShowOnMap={(lat, lon) => mapRef.current?.flyTo(lat, lon)}
          onSelectCall={handleSelectCall}
        />
        <MapView ref={mapRef} calls={state.calls} mode={state.mode} />
        <div className="right-col">
          <AgentCards agents={state.agents} flashing={agentFlash} />
          <BriefingPanel briefings={state.briefings} />
        </div>
      </div>

      <AuditTrail entries={state.auditLog} />
      <DemoControls mode={state.mode} onCallAnswered={(id) => setActiveCallId(id)} />

      <OverrideButton mode={state.mode} onOverride={() => {}} />
      {state.mode === 'SURGE' && <SosQrCode resetKey={state.resetKey} />}

      <HoldModal
        hold={state.activeHold}
        onConfirm={handleConfirmHold}
        onCancel={handleCancelHold}
      />

      {activeCall && state.mode === 'ASSISTED' && (
        <AssistedCallModal
          call={activeCall}
          onEndCall={handleEndAssistedCall}
          onDismiss={() => setActiveCallId(null)}
        />
      )}

      {activeSurgeCallId && (() => {
        const surgeCall = state.calls.find((c) => c.id === activeSurgeCallId)
        return surgeCall ? (
          <SurgeCallModal
            call={surgeCall}
            onDismiss={() => setActiveSurgeCallId(null)}
          />
        ) : null
      })()}
    </div>
  )
}
