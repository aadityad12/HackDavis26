import { AgentName, AgentState } from '../types'

interface Props {
  agents: Record<AgentName, AgentState>
  flashing?: Record<string, boolean>
}

const SUBTITLES: Record<AgentName, string> = {
  MONITOR:  'Watching call volume',
  TRIAGE:   'Classifying incidents',
  RESOURCE: 'Allocating units',
  RELAY:    'Generating briefings',
}

const AGENT_ORDER: AgentName[] = ['MONITOR', 'TRIAGE', 'RESOURCE', 'RELAY']

export default function AgentCards({ agents, flashing = {} }: Props) {
  return (
    <div className="panel">
      <div className="panel-title">
        <span>AI Agents</span>
        <span className="count mono">4 active</span>
      </div>
      <div className="agents-grid">
        {AGENT_ORDER.map((name) => {
          const agent = agents[name]
          const status = agent.status.toLowerCase()
          return (
            <div key={name} className={`agent-card ${flashing[name] ? 'flash' : ''}`}>
              <div className="agent-head">
                <span className={`agent-dot ${status}`} />
                <span className="agent-name">{name}</span>
              </div>
              <div className="agent-sub">{SUBTITLES[name]}</div>
              <div className="agent-action">{agent.last_action}</div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
