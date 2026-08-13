import { Mode } from '../types'

interface Props {
  mode: Mode
  connected: boolean
}

export default function ModeIndicator({ mode, connected }: Props) {
  const isSurge = mode === 'SURGE'
  return (
    <div className={`mode-header ${isSurge ? 'surge' : 'assisted'}`} role="banner">
      <div className="left">
        <div className="brand">CLEAR DISPATCH</div>
        {isSurge ? (
          <>
            <span className="surge-pulse" />
            <span>⚡ SURGE MODE ACTIVE — AI agents are triaging and routing</span>
          </>
        ) : (
          <span>ASSISTED MODE — AI is supporting. Dispatcher in control.</span>
        )}
      </div>
      <div className="right">
        <span className={`conn-dot ${connected ? 'on' : 'off'}`} />
        <span>{connected ? 'Connected' : 'Disconnected'}</span>
      </div>
    </div>
  )
}
