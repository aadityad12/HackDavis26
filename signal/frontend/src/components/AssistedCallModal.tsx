import { useState, useEffect, useRef, type CSSProperties } from 'react'
import { Call } from '../types'

interface Props {
  call: Call
  onEndCall: (callId: string, approvedServices: string[], notes: string) => void
  onDismiss: () => void
}

const SERVICE_OPTIONS = [
  { id: 'engine',        label: 'Engine' },
  { id: 'personnel',     label: 'Personnel' },
  { id: 'paramedics',    label: 'Paramedics' },
  { id: 'air_tanker',    label: 'Air Tanker' },
  { id: 'heavy_rescue',  label: 'Heavy Rescue' },
  { id: 'hazmat',        label: 'Hazmat' },
]

function normalizeServiceTypes(raw: string[] | string | undefined): string[] {
  if (!raw) return []
  return (Array.isArray(raw) ? raw : [raw]).map((s) => String(s).toLowerCase())
}

export default function AssistedCallModal({ call, onEndCall, onDismiss }: Props) {
  const transcriptRef = useRef<HTMLDivElement>(null)
  const appliedSuggestions = useRef(false)
  const [notes, setNotes] = useState('')
  const [ending, setEnding] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())

  // Apply AI service suggestions exactly once, the first time they arrive
  useEffect(() => {
    const suggested = normalizeServiceTypes(call.live_fields?.service_types)
    if (!appliedSuggestions.current && suggested.length > 0) {
      appliedSuggestions.current = true
      setSelected(new Set(suggested))
    }
  }, [call.live_fields?.service_types])

  // Auto-scroll transcript
  useEffect(() => {
    if (transcriptRef.current) {
      transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight
    }
  }, [call.transcript])

  const toggleService = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const handleEndCall = () => {
    setEnding(true)
    onEndCall(call.id, Array.from(selected), notes)
  }

  const sev = call.severity.toLowerCase()
  const aiSuggested = normalizeServiceTypes(call.live_fields?.service_types)

  return (
    <div className="modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget && !ending) onDismiss() }}>
      <div style={{
        width: 540,
        maxWidth: '95vw',
        maxHeight: '90vh',
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-strong)',
        borderRadius: 8,
        boxShadow: '0 24px 64px rgba(0,0,0,0.6)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        animation: 'modalIn 200ms ease',
      }}>

        {/* Header */}
        <div style={{
          padding: '14px 18px',
          borderBottom: '1px solid var(--border)',
          background: 'rgba(37,99,235,0.08)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 16 }}>📞</span>
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#93c5fd', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                Active Call — Assisted Mode
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--ui-mono)', marginTop: 2 }}>
                {call.id} · Zone {call.zone}
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className={`badge ${sev}`}>{call.severity}</span>
            {call.vulnerable && (
              <span style={{ color: '#d97706', fontSize: 14 }} title="Vulnerable caller">⚠</span>
            )}
          </div>
        </div>

        {/* Scrollable body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Incident type */}
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>
            {call.incident_type}
          </div>

          {/* Live transcript */}
          <div>
            <div style={labelStyle}>Live Transcript</div>
            <div
              ref={transcriptRef}
              style={{
                background: 'rgba(0,0,0,0.25)',
                border: '1px solid var(--border)',
                borderRadius: 6,
                padding: '8px 10px',
                minHeight: 72,
                maxHeight: 140,
                overflowY: 'auto',
                fontSize: 12,
                color: '#d1d5db',
                lineHeight: 1.6,
                whiteSpace: 'pre-wrap',
                fontFamily: 'var(--ui-mono)',
              }}
            >
              {call.transcript || (
                <span style={{ color: '#4b5563', fontStyle: 'italic' }}>
                  Transcript will stream in…
                </span>
              )}
            </div>
          </div>

          {/* Situation (only if there's data) */}
          {call.live_fields && (
            <div>
              <div style={labelStyle}>Situation</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {call.live_fields.location && (
                  <div style={{ fontSize: 12, color: '#d1d5db' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Location: </span>
                    {call.live_fields.location}
                  </div>
                )}
                {call.live_fields.one_liner && (
                  <div style={{ fontSize: 12, color: '#e5e7eb', fontStyle: 'italic' }}>
                    {call.live_fields.one_liner}
                  </div>
                )}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {call.live_fields.caller_status && (
                    <span style={pill('#3b1f1f', '#f87171')}>{call.live_fields.caller_status}</span>
                  )}
                  {call.live_fields.people_affected != null && (
                    <span style={pill('#1f2937', '#9ca3af')}>{call.live_fields.people_affected} affected</span>
                  )}
                  {call.live_fields.age != null && (
                    <span style={pill('#1f2937', '#9ca3af')}>Age: {call.live_fields.age}</span>
                  )}
                  {call.live_fields.sex && (
                    <span style={pill('#1f2937', '#9ca3af')}>{call.live_fields.sex}</span>
                  )}
                  {call.live_fields.hazards?.map((h) => (
                    <span key={h} style={pill('#2d1f0a', '#fb923c')}>⚠ {h}</span>
                  ))}
                  {call.live_fields.advice && (
                    <span style={pill('#0a1f2d', '#60a5fa')}>💡 {call.live_fields.advice}</span>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Service approval */}
          <div>
            <div style={labelStyle}>
              Approve Services
              {aiSuggested.length > 0 && (
                <span style={{ marginLeft: 6, fontSize: 9, color: '#f59e0b', fontWeight: 600 }}>AI SUGGESTED</span>
              )}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {SERVICE_OPTIONS.map(({ id, label }) => {
                const isSelected = selected.has(id)
                const isSuggested = aiSuggested.includes(id)
                return (
                  <button
                    key={id}
                    onClick={() => toggleService(id)}
                    style={{
                      padding: '5px 12px',
                      borderRadius: 4,
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: 'pointer',
                      border: `1px solid ${isSelected ? '#2563eb' : isSuggested ? 'rgba(245,158,11,0.4)' : 'var(--border-strong)'}`,
                      background: isSelected ? 'rgba(37,99,235,0.15)' : isSuggested ? 'rgba(245,158,11,0.06)' : 'transparent',
                      color: isSelected ? '#93c5fd' : isSuggested ? '#fbbf24' : 'var(--text-muted)',
                      fontFamily: 'var(--ui-sans)',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 5,
                      transition: 'all 120ms',
                    }}
                  >
                    {isSelected ? '✓' : '+'} {label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Notes */}
          <div>
            <div style={labelStyle}>Notes <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(optional)</span></div>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Additional context for the responding unit…"
              rows={2}
              style={{
                width: '100%',
                background: 'var(--bg-raised)',
                border: '1px solid var(--border)',
                borderRadius: 4,
                color: 'var(--text-primary)',
                fontSize: 12,
                padding: '8px 10px',
                resize: 'none',
                fontFamily: 'var(--ui-sans)',
                boxSizing: 'border-box',
                outline: 'none',
              }}
            />
          </div>
        </div>

        {/* Footer */}
        <div style={{
          padding: '12px 18px',
          borderTop: '1px solid var(--border)',
          background: 'var(--bg-base)',
          display: 'flex',
          gap: 10,
          justifyContent: 'flex-end',
          flexShrink: 0,
        }}>
          <button
            onClick={onDismiss}
            disabled={ending}
            className="btn btn-outline"
            style={{ flex: 'none', padding: '8px 16px' }}
          >
            Dismiss
          </button>
          <button
            onClick={handleEndCall}
            disabled={ending}
            className="btn btn-primary"
            style={{ flex: 'none', padding: '8px 20px' }}
          >
            {ending ? 'Ending…' : '☎ End Call'}
          </button>
        </div>
      </div>
    </div>
  )
}

const labelStyle: CSSProperties = {
  fontSize: 9,
  fontWeight: 700,
  color: '#4b5563',
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
  marginBottom: 6,
  display: 'flex',
  alignItems: 'center',
  gap: 4,
}

function pill(bg: string, color: string): CSSProperties {
  return {
    background: bg,
    color,
    fontSize: 10,
    fontWeight: 600,
    padding: '2px 7px',
    borderRadius: 10,
    whiteSpace: 'nowrap',
  }
}
