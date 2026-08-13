import { useState } from 'react'
import { Briefing } from '../types'

const DEFAULT_VISIBLE = 3

interface Props {
  briefings: Briefing[]
}

export default function BriefingPanel({ briefings }: Props) {
  const [expanded, setExpanded] = useState(false)
  const visible = expanded ? briefings : briefings.slice(0, DEFAULT_VISIBLE)

  return (
    <div className="panel" style={{ flex: 1, minHeight: 0 }}>
      <div className="panel-title">
        <span>🔊 Briefings</span>
        {briefings.length > 0 && (
          <span className="briefing-callid">{briefings.length}</span>
        )}
      </div>
      <div className="panel-body">
        {briefings.length === 0 ? (
          <div className="empty-state" style={{ padding: 24 }}>
            <div style={{ fontSize: 28, opacity: 0.4 }}>🎙</div>
            <div style={{ fontSize: 12 }}>No briefings yet</div>
          </div>
        ) : (
          <div className="briefing-body">
            {visible.map((b, i) => (
              <div key={`${b.call_id}-${b.timestamp}`} style={i > 0 ? { borderTop: '1px solid var(--border)', paddingTop: 8, marginTop: 8 } : {}}>
                <div className="briefing-callid">{b.call_id}</div>
                <div className="briefing-text" style={i > 0 ? { opacity: 0.6, fontSize: 11 } : {}}>{b.text}</div>
                {i === 0 && b.audio_url !== null && (
                  <div className="briefing-meta">
                    <span className="audio-badge">🔊 Audio available</span>
                  </div>
                )}
              </div>
            ))}
            {briefings.length > DEFAULT_VISIBLE && (
              <button
                className="play-button"
                style={{ marginTop: 8 }}
                onClick={() => setExpanded(e => !e)}
              >
                {expanded ? 'Show less' : `Show all ${briefings.length} briefings`}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
