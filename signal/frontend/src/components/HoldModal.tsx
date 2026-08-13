import { useState, useEffect, useRef } from 'react'
import { HoldEvent } from '../types'

interface Props {
  hold: HoldEvent | null
  onConfirm: (holdId: string) => void
  onCancel: (holdId: string) => void
}

const ASSET_LABELS: Record<string, string> = {
  air_tanker:   'Air Tanker deployment requested',
  heavy_rescue: 'Heavy Rescue deployment requested',
  hazmat:       'Hazmat deployment requested',
}

export default function HoldModal({ hold, onConfirm, onCancel }: Props) {
  const [busy, setBusy] = useState<'confirm' | 'cancel' | null>(null)
  const cardRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!hold) return
    const prev = document.activeElement as HTMLElement
    cardRef.current?.querySelector('button')?.focus()
    return () => { try { prev?.focus() } catch {} }
  }, [hold])

  useEffect(() => {
    if (!hold) return
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Tab' || !cardRef.current) return
      const focusable = cardRef.current.querySelectorAll<HTMLElement>('button')
      if (focusable.length === 0) return
      const first = focusable[0], last = focusable[focusable.length - 1]
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [hold])

  if (!hold) return null

  const handleConfirm = async () => {
    if (busy) return
    setBusy('confirm')
    try {
      await fetch('/api/confirm-hold', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hold_id: hold.hold_id }),
      })
    } catch { /* proceed regardless */ }
    onConfirm(hold.hold_id)
    setBusy(null)
  }

  const handleCancel = async () => {
    if (busy) return
    setBusy('cancel')
    try {
      await fetch('/api/cancel-hold', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hold_id: hold.hold_id }),
      })
    } catch { /* proceed regardless */ }
    onCancel(hold.hold_id)
    setBusy(null)
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="hold-title">
      <div className="modal-card" ref={cardRef}>
        <div className="modal-header" id="hold-title">
          <span className="modal-warn">⚠</span>
          <span>Protocol Hold — Dispatcher Confirmation Required</span>
        </div>
        <div className="modal-body">
          <div className="modal-asset">
            {ASSET_LABELS[hold.asset_type] ?? `${hold.asset_type} deployment requested`}
          </div>

          {/* Incident details row */}
          <div style={{ display: 'flex', gap: 24, marginBottom: 12, flexWrap: 'wrap' }}>
            {hold.severity && (
              <div>
                <div style={{ fontSize: 9, color: '#6b7280', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 3 }}>Severity</div>
                <span className={`badge ${hold.severity.toLowerCase()}`}>{hold.severity}</span>
              </div>
            )}
            {hold.zone && (
              <div>
                <div style={{ fontSize: 9, color: '#6b7280', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 3 }}>Zone</div>
                <span style={{ fontSize: 13, fontWeight: 600, color: '#e5e7eb', fontFamily: 'var(--ui-mono)' }}>{hold.zone}</span>
              </div>
            )}
            {hold.incident_type && (
              <div>
                <div style={{ fontSize: 9, color: '#6b7280', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 3 }}>Type</div>
                <span style={{ fontSize: 13, fontWeight: 600, color: '#e5e7eb', textTransform: 'capitalize' }}>{hold.incident_type}</span>
              </div>
            )}
          </div>

          {/* Description */}
          {hold.description && (
            <div style={{ fontSize: 12, color: '#9ca3af', marginBottom: 12, lineHeight: 1.5, borderLeft: '2px solid #374151', paddingLeft: 10 }}>
              {hold.description}
            </div>
          )}

          {/* Dispatch details row */}
          <div className="modal-meta">
            <div>UNIT <span className="v">{hold.unit_id}</span></div>
            {hold.eta_minutes != null && <div>ETA <span className="v">{hold.eta_minutes} min</span></div>}
            <div>CALL <span className="v">{hold.call_id}</span></div>
          </div>

          {/* Protocol note */}
          <div className="modal-text">
            Heavy asset deployment requires dispatcher approval per CAL FIRE protocol §4.2.
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-primary" disabled={busy !== null} onClick={handleConfirm}>
            {busy === 'confirm' ? <span className="spinner" /> : '✓'} Confirm
          </button>
          <button className="btn btn-outline" disabled={busy !== null} onClick={handleCancel}>
            {busy === 'cancel' ? <span className="spinner" /> : '✕'} Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
