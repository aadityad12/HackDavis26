import { useState, useEffect, useRef } from 'react'
import { Mode } from '../types'
import VoiceAgentModal from './VoiceAgentModal'

type ButtonId = 'start' | 'surge' | 'reset' | 'pause' | 'resume'
type DemoPhase = 'standby' | 'demo' | 'surge'

interface Props {
  mode?: Mode
  onCallAnswered?: (callId: string) => void
}

interface ButtonState {
  loading: boolean
  error: string | null
}

const ENDPOINTS: Record<ButtonId, string> = {
  start: '/api/demo/start',
  surge: '/api/demo/trigger-surge',
  reset: '/api/demo/reset',
  pause: '/api/demo/pause',
  resume: '/api/demo/resume',
}

const TRANSCRIPT_OPTIONS = [
  { value: 'tesla_accident', label: 'Tesla Accident' },
  { value: 'wildfire_evacuation', label: 'Wildfire Evacuation' },
  { value: 'structure_fire', label: 'Structure Fire' },
  { value: 'medical_elderly', label: 'Medical — Elderly' },
  { value: 'hazmat_spill', label: 'Hazmat Spill' },
]

export default function DemoControls({ mode, onCallAnswered }: Props) {
  const [paused, setPaused] = useState(false)
  const [demoPhase, setDemoPhase] = useState<DemoPhase>('standby')
  const prevMode = useRef<Mode | undefined>(mode)
  const [states, setStates] = useState<Record<ButtonId, ButtonState>>({
    start: { loading: false, error: null },
    surge: { loading: false, error: null },
    reset: { loading: false, error: null },
    pause: { loading: false, error: null },
    resume: { loading: false, error: null },
  })
  const [now, setNow] = useState(new Date())

  // Assisted — Answer Call state
  const [selectedTranscript, setSelectedTranscript] = useState<string>(TRANSCRIPT_OPTIONS[0].value)
  const [liveCallId, setLiveCallId] = useState<string | null>(null)
  const [answerLoading, setAnswerLoading] = useState(false)
  const [answerError, setAnswerError] = useState<string | null>(null)

  // Surge — Voice agent modal state
  const [voiceCallId, setVoiceCallId] = useState<string | null>(null)
  const [surgeLoading, setSurgeLoading] = useState(false)
  const [surgeError, setSurgeError] = useState<string | null>(null)

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  // Sync phase with mode prop (SURGE mode transition driven by WS)
  useEffect(() => {
    if (mode === 'SURGE' && prevMode.current !== 'SURGE') {
      setDemoPhase('surge')
    } else if (mode === 'ASSISTED' && prevMode.current === 'SURGE') {
      setDemoPhase('demo')
    }
    prevMode.current = mode
  }, [mode])

  const handleClick = async (id: ButtonId) => {
    setStates((s) => ({ ...s, [id]: { loading: true, error: null } }))
    try {
      const res = await fetch(ENDPOINTS[id], { method: 'POST' })
      if (!res.ok) throw new Error(`${res.status}`)
      if (id === 'pause') setPaused(true)
      if (id === 'resume') setPaused(false)
      if (id === 'start') setDemoPhase((p) => p === 'standby' ? 'demo' : p)
      if (id === 'reset') { setPaused(false); setDemoPhase('standby') }
      setStates((s) => ({ ...s, [id]: { loading: false, error: null } }))
    } catch {
      setStates((s) => ({ ...s, [id]: { loading: false, error: 'Request failed' } }))
      setTimeout(() => {
        setStates((s) => ({ ...s, [id]: { loading: false, error: null } }))
      }, 3000)
    }
  }

  const handleAnswerCall = async () => {
    setAnswerLoading(true)
    setAnswerError(null)
    try {
      const res = await fetch('/api/call/start-live', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcript_id: selectedTranscript }),
      })
      if (!res.ok) throw new Error(`${res.status}`)
      const data = await res.json()
      setLiveCallId(data.call_id)
      onCallAnswered?.(data.call_id)
    } catch {
      setAnswerError('Failed to start call')
      setTimeout(() => setAnswerError(null), 3000)
    } finally {
      setAnswerLoading(false)
    }
  }

  const handleEndCall = async () => {
    if (!liveCallId) return
    setAnswerLoading(true)
    try {
      await fetch('/api/call/end-live', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ call_id: liveCallId }),
      })
    } catch {
      // best-effort
    } finally {
      setLiveCallId(null)
      setAnswerLoading(false)
    }
  }

  const handleSimulateIncoming = async () => {
    setSurgeLoading(true)
    setSurgeError(null)
    try {
      const res = await fetch('/api/surge/call/initiate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ zone: 'YL-03' }),
      })
      if (!res.ok) throw new Error(`${res.status}`)
      const data = await res.json()
      setVoiceCallId(data.call_id)
    } catch {
      setSurgeError('Failed to initiate')
      setTimeout(() => setSurgeError(null), 3000)
    } finally {
      setSurgeLoading(false)
    }
  }

  const handleVoiceComplete = async (transcript: string) => {
    if (!voiceCallId) return
    try {
      await fetch('/api/surge/call/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ call_id: voiceCallId, transcript }),
      })
    } catch {
      // best-effort
    } finally {
      setVoiceCallId(null)
    }
  }

  const handleVoiceDismiss = () => {
    setVoiceCallId(null)
  }

  const anyError = (['start', 'surge', 'reset'] as ButtonId[]).find((id) => states[id].error)

  const phaseLabel = demoPhase === 'surge' ? '⚡ SURGE' : demoPhase === 'demo' ? '▶ DEMO' : '— STANDBY'
  const phaseClass = demoPhase === 'surge' ? 'surge' : demoPhase === 'demo' ? 'started' : 'idle'

  return (
    <>
      <div className="demo-bar">
        <span className="demo-label">Demo Controls</span>
        <span className={`demo-phase-chip ${phaseClass}`}>{phaseLabel}</span>
        <div className="demo-actions">
          <button
            className={`demo-btn ${demoPhase !== 'standby' ? 'demo-btn-started' : ''}`}
            disabled={states.start.loading}
            onClick={() => handleClick('start')}
          >
            {states.start.loading ? '…' : demoPhase !== 'standby' ? '✓ Demo Active' : '▶ Start Demo'}
          </button>
          <button
            className={`demo-btn ${mode === 'SURGE' ? 'demo-btn-surge-on' : 'danger'}`}
            disabled={states.surge.loading || mode === 'SURGE'}
            onClick={() => handleClick('surge')}
          >
            {states.surge.loading ? '…' : mode === 'SURGE' ? '⚡ Surge Active' : '⚡ Trigger Surge'}
          </button>
          {paused ? (
            <button
              className="demo-btn"
              disabled={states.resume.loading}
              onClick={() => handleClick('resume')}
              style={{ background: '#065f46', borderColor: '#10b981', fontWeight: 700 }}
            >
              {states.resume.loading ? '…' : '▶'} Resume
            </button>
          ) : (
            <button
              className="demo-btn"
              disabled={states.pause.loading}
              onClick={() => handleClick('pause')}
              style={{ background: '#7c2d12', borderColor: '#f97316', fontWeight: 700 }}
            >
              {states.pause.loading ? '…' : '⏸'} Pause
            </button>
          )}
          <button
            className="demo-btn"
            disabled={states.reset.loading}
            onClick={() => handleClick('reset')}
          >
            {states.reset.loading ? '…' : '↺'} Reset
          </button>

          {mode === 'ASSISTED' && (
            <>
              <div className="demo-divider" style={{ width: 1, height: 20, background: 'var(--border)', margin: '0 4px' }} />
              {liveCallId ? (
                <button
                  className="demo-btn danger"
                  disabled={answerLoading}
                  onClick={handleEndCall}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}
                >
                  <span
                    style={{
                      width: 7,
                      height: 7,
                      borderRadius: '50%',
                      background: '#ef4444',
                      display: 'inline-block',
                      animation: 'pulse-dot 1.2s ease-in-out infinite',
                    }}
                  />
                  {answerLoading ? '…' : 'End Call'}
                </button>
              ) : (
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <select
                    value={selectedTranscript}
                    onChange={(e) => setSelectedTranscript(e.target.value)}
                    style={{
                      background: 'var(--surface)',
                      color: 'var(--text)',
                      border: '1px solid var(--border)',
                      borderRadius: 5,
                      fontSize: 12,
                      padding: '3px 6px',
                      cursor: 'pointer',
                    }}
                  >
                    {TRANSCRIPT_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                  <button
                    className="demo-btn"
                    disabled={answerLoading}
                    onClick={handleAnswerCall}
                    style={{ background: '#065f46', borderColor: '#10b981' }}
                  >
                    {answerLoading ? '…' : '📞'} Answer Call
                  </button>
                </div>
              )}
              {answerError && <span className="demo-error">{answerError}</span>}
            </>
          )}

          {mode === 'SURGE' && (
            <>
              <div className="demo-divider" style={{ width: 1, height: 20, background: 'var(--border)', margin: '0 4px' }} />
              <button
                className="demo-btn danger"
                disabled={surgeLoading || voiceCallId !== null}
                onClick={handleSimulateIncoming}
              >
                {surgeLoading ? '…' : '📞'} Simulate Incoming Call
              </button>
              {surgeError && <span className="demo-error">{surgeError}</span>}
            </>
          )}

          {anyError && (
            <span className="demo-error">Request failed</span>
          )}
        </div>
        <div className="demo-clock">
          <span>v0.9-demo</span>
          <span>·</span>
          <span>OPERATOR D-114</span>
          <span>·</span>
          <span>{now.toLocaleTimeString()}</span>
        </div>
      </div>

      {voiceCallId && (
        <VoiceAgentModal
          callId={voiceCallId}
          onComplete={handleVoiceComplete}
          onDismiss={handleVoiceDismiss}
        />
      )}

      <style>{`
        @keyframes pulse-dot {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.4; transform: scale(0.75); }
        }
      `}</style>
    </>
  )
}
