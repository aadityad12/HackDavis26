---
name: Clear Dispatch domain glossary
description: Canonical ubiquitous language for Clear Dispatch emergency dispatch system — covers modes, actors, agents, calls/incidents, resources, HOLD protocol, and briefings
type: reference
---

## Domain Overview

**Clear Dispatch** is a human-in-the-loop emergency dispatch support system for wildfire surge events. The system operates in two modes (ASSISTED vs SURGE) and uses four AI agents (MONITOR, TRIAGE, RESOURCE, RELAY) to support dispatcher decision-making.

## Key Canonical Terms

### Modes
- **ASSISTED**: Dispatcher makes all decisions; AI provides support only
- **SURGE**: AI agents operate autonomously (triggered when call rate crosses surge_threshold)

### Actors
- **Dispatcher**: Human 911 operator; final authority on all dispatch and override decisions
- **Caller**: Person in crisis; AI never communicates directly with callers
- **EOC Supervisor**: Emergency Operations Center supervisor

### AI Agents
- **MONITOR**: Tracks call volume via 60-second sliding window; controls mode transitions
- **TRIAGE**: Classifies calls by severity (CRITICAL/URGENT/STANDARD/PENDING) and type (fire/evacuation/medical/structure/other)
- **RESOURCE**: Selects units and enforces HOLD protocol for heavy assets (air_tanker, heavy_rescue, hazmat)
- **RELAY**: Generates dispatcher briefings; optionally produces TTS audio

### Call Lifecycle
- **Call** → initial entry (awaiting triage); has internal `status` field (`"LIVE"`, `"SURGE_VOICE"`, `"PROCESSING"`) for lifecycle guards — never broadcast over WebSocket
- **PROCESSING status** → idempotency guard set when pipeline starts; prevents double execution on re-submit
- **Incident** → call after TRIAGE, RESOURCE, and RELAY complete; logged to incident_log

### Resources
- **Unit**: Response resource type (engine, personnel, air_tanker, heavy_rescue, hazmat)
- **Heavy asset**: Unit requiring dispatcher confirmation (HOLD protocol)
- **Standard asset**: Unit dispatched immediately (engine, personnel)

### HOLD Protocol
- **HOLD**: Mandatory pause for heavy asset dispatch; requires dispatcher CONFIRMED or CANCELLED
- **hold_id**: Unique identifier for a hold record
- **HOLD_REQUIRED**: WebSocket event signaling hold is pending
- **HOLD_RESOLVED**: WebSocket event when hold is resolved

### Dispatcher Actions
- **Override**: Dispatcher action forcing return to ASSISTED mode; logged as `dispatcher_override: true`
- **Briefing**: Concise summary: "Incident [ID]. [Severity]. [Zone]. [Type]. Unit [unit_id] dispatched. ETA [N] minutes."
- **Audio briefing**: TTS-rendered briefing via ElevenLabs (falls back to text-only)
- **Approved services**: List of service categories dispatcher approved before handing off a live call (`approved_services` on call record + audit trail); from `EndLiveRequest`
- **Dispatcher notes**: Free-text annotation entered at live-call end; `dispatcher_notes` on call record + audit trail; from `EndLiveRequest`

### Geographic & Risk
- **Zone**: Geographic area identifier (YL-01 through YL-08)
- **Vulnerability score**: 0.0–1.0 per zone; > 0.6 flagged as vulnerable
- **Vulnerable**: Boolean flag on call; true if zone score > 0.6 or description mentions at-risk populations

## Flagged Ambiguities & Resolutions

1. **"Resource" vs "Unit"**: Use **Unit** as canonical term in domain language; `state.resources` is implementation detail
2. **"Incident" lifecycle**: **Call** → awaiting triage; **Incident** → after RELAY briefing generation
3. **"Override" — action vs field**: Override (action) → `dispatcher_override: true` (field in incident record)
4. **"Report" — event vs object**: INCIDENT_REPORT (WebSocket event) → incident report payload (data object)
5. **`status` vs `severity` on call record**: `severity` is domain classification broadcast over WS; `status` is internal pipeline guard only (never in WS payloads)

## Internal Utilities
- **`extract_json()`** (`agents/utils.py`): shared helper that deserializes Claude LLM responses; tries `json.loads`, fenced-block regex, then bare `{…}` regex; raises `ValueError` on failure. Used by TRIAGE, RELAY, live_calls, surge_calls — previously duplicated per-file.

## System Events (WebSocket)
MODE_CHANGE, CALL_ADDED, AGENT_STATUS (IDLE/RUNNING/COMPLETE/ERROR), UNIT_DISPATCHED, HOLD_REQUIRED, HOLD_RESOLVED, BRIEFING_READY, INCIDENT_REPORT

## Key Relationships
- Call → TRIAGE → Incident (severity, type assigned)
- Incident → RESOURCE → Unit selection (heavy asset triggers HOLD)
- HOLD → Dispatcher confirms/cancels (CONFIRMED/CANCELLED)
- Incident → RELAY → Briefing → incident_log entry
- Zone vulnerability_score determines call priority and resource allocation
- SURGE mode triggered when call rate (60-second sliding window) exceeds surge_threshold
