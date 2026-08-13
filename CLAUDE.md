# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project: Clear Dispatch

Local emergency-dispatch simulation for wildfire surge events. Four backend stages (MONITOR, TRIAGE, RESOURCE, RELAY) classify synthetic calls, select units, enforce heavy-asset approval, and prepare dispatcher briefings. The optional Surge Mode browser voice agent does communicate with a simulated caller. HackDavis 2026.

**Demo narrative**: Assisted Mode = Tesla (human driver, AI co-pilot). Surge Mode = Waymo (fully autonomous AI handles callers, dispatcher approves).

## Commands

```bash
# Backend
cd signal/backend && uv sync
uv run python -m uvicorn main:app --reload --port 8000
curl http://localhost:8000/health   # → {"status":"ok","mode":"ASSISTED"}
curl http://localhost:8000/logs     # → in-memory log buffer (call + briefing events)

# Frontend (alongside backend)
cd signal/frontend && npm install && npm run dev   # https://localhost:5173

# Smoke test (backend must be running; the current CALL_ADDED WS assertion has a race)
bash scripts/smoke_test.sh
```

## Architecture

```
signal/
├── backend/              FastAPI + Python 3.11 (uv managed)
│   ├── main.py           Entry point — lifespan, CORS, /ws WebSocket, /audio static mount
│   ├── state.py          Single in-memory source of truth — never define state elsewhere
│   ├── logger.py         In-memory log ring buffer (500 entries); sanitizes API keys before storing
│   ├── simulator.py      Poisson call generator; rate controlled by state.simulator_lambda["value"]
│   ├── agents/           MONITOR, TRIAGE (Claude Haiku), RESOURCE, RELAY (Claude Haiku + ElevenLabs)
│   ├── routers/          calls, live_calls, surge_calls, state_router, override, hold, demo, logs_router
│   ├── ws/hub.py         ConnectionManager — all WS events go through manager.broadcast(type, payload)
│   └── data/             park_fire.geojson, resources.json, vulnerability.json, transcripts/
└── frontend/             React 18 + Vite + CSS custom-property design system
    └── src/
        ├── types.ts              All shared TypeScript types (Mode, Severity, WsMessage, AppState, …)
        ├── store/reducer.ts      Pure reducer — every WS message type handled here, auditLog prepended
        ├── hooks/useWebSocket.ts Auto-reconnecting WS hook (3s retry); StrictMode-safe via isCancelled guard
        └── components/           ModeIndicator, CallQueue, AgentCards, MapView, OverrideButton,
                                  HoldModal, BriefingPanel, AuditTrail, DemoControls, VoiceAgentModal
```

### Agent pipeline (per call)

```
POST /call
  → CALL_ADDED (PENDING broadcast)
  → TRIAGE  (Claude Haiku) → severity, incident_type, vulnerable flag
  → CALL_ADDED (real severity broadcast)
  → RESOURCE               → nearest available unit (_haversine distance, ETA = km/80*60)
      heavy asset?  → HOLD_REQUIRED  (polls hold_queue every 2s, max 60s for dispatcher confirm)
      standard?     → UNIT_DISPATCHED immediately
  → RELAY   (Claude Haiku) → briefing text → ElevenLabs TTS if key present → audio/{id}.mp3
  → BRIEFING_READY + INCIDENT_REPORT broadcast
```

### Background tasks (lifespan-managed)

- `monitor_loop()` — every 5s; sliding 60s window on `state.call_timestamps`; ASSISTED→SURGE when rate > threshold, SURGE→ASSISTED after 120s below threshold
- `simulator_loop()` — exponential inter-arrival from `state.simulator_lambda["value"]` calls/min (default 2.0; demo surge sets 15.0); skips if `state.system_state["paused"]`

### State shape (`state.py`)

```python
system_state = { "mode": "ASSISTED", "surge_threshold": 10, "surge_started_at": None, "call_timestamps": [], "paused": False }
call_queue: list[dict]          # active calls (all fields including briefing_text, unit_id, eta_minutes)
incident_log: list[dict]        # completed audit records (appended by RELAY)
hold_queue: dict[str, dict]     # hold_id → { call_id, unit_id, asset_type, resolved: None|"CONFIRMED"|"CANCELLED" }
simulator_lambda: dict          # {"value": float} — mutated directly by demo endpoints
resources: list[dict]           # loaded from data/resources.json; resource["available"] toggled by RESOURCE agent
vulnerability_data: dict[str, float]   # zone → score; vulnerable flag set when score > 0.6
fire_perimeter: dict            # GeoJSON for MapView
live_transcripts: dict[str, str]       # call_id → accumulated transcript (live call feature)
live_extractions: dict[str, dict]      # call_id → latest Claude-extracted fields (live call feature)
```

### REST endpoints

| Method | Path | Purpose |
|---|---|---|
| GET | `/health` | `{status, mode}` |
| POST | `/call` | Ingest a call, run pipeline async |
| GET | `/calls` | Current call queue |
| GET | `/state` | Full system state snapshot |
| POST | `/override` | Force mode → ASSISTED, append override to incident_log |
| POST | `/confirm-hold` | Resolve a HOLD_REQUIRED as CONFIRMED |
| POST | `/cancel-hold` | Resolve a HOLD_REQUIRED as CANCELLED |
| POST | `/call/start-live` | Start Assisted Mode live call; streams pre-transcribed scenario via WS |
| POST | `/call/end-live` | End live call; hands off to pipeline |
| POST | `/surge/call/initiate` | Create a SURGE_VOICE call record; frontend opens voice agent modal |
| POST | `/surge/call/complete` | Receive conversation transcript; Claude extracts fields; runs pipeline |
| POST | `/demo/reset` | Clear all state; reset lambda to 0.1; broadcast MODE_CHANGE + 4× AGENT_STATUS IDLE |
| POST | `/demo/start` | Inject 2 normal calls (2s apart) |
| POST | `/demo/trigger-surge` | Set SURGE + lambda=15; inject 4 calls (4th has `force_heavy_asset=True`) |
| POST | `/demo/pause` | Pause simulator + block pipeline; lambda→0, paused→True |
| POST | `/demo/resume` | Resume simulator + unblock pipeline; lambda→2.0, paused→False |
| GET | `/logs` | In-memory log buffer; `?level=INFO\|WARNING\|ERROR&limit=200` |

### Logging

`logger.py` attaches an in-memory handler to the root logger. Only two log lines are emitted per call:
- `CALL [id] zone=… SEVERITY type [VULNERABLE] — triage reasoning` (INFO, from `calls.py` after triage)
- `BRIEFING [id] <briefing sentence>` (INFO, from `relay.py`)

Mode transitions and pause/resume log as WARNING. All `ANTHROPIC_API_KEY` / `ELEVENLABS_API_KEY` values are redacted before storage.

## Shared Contract — Do Not Deviate

| Concern | Value |
|---|---|
| Backend port | `8000` |
| Frontend port | `5173` |
| WebSocket path | `/ws` |
| API proxy | Vite proxies `/api/*` → `http://127.0.0.1:8000` (strips `/api`) |
| Frontend WebSocket | `useWebSocket.ts` derives `/ws` from the page origin; Vite proxies it to the backend |
| Phone QR host | Optional `VITE_SOS_HOST`; otherwise the current page hostname is used |

**Exact enum strings** (must match across backend and frontend):
- Mode: `ASSISTED` | `SURGE`
- Severity: `CRITICAL` | `URGENT` | `STANDARD` | `PENDING`
- Agent names: `MONITOR` | `TRIAGE` | `RESOURCE` | `RELAY`
- Agent status: `IDLE` | `RUNNING` | `COMPLETE` | `ERROR`
- Heavy asset types: `air_tanker` | `heavy_rescue` | `hazmat`

**WebSocket messages** (backend → frontend, all via `manager.broadcast`):
```
MODE_CHANGE     { mode, timestamp }
CALL_ADDED      { id, severity, zone, vulnerable, incident_type }
AGENT_STATUS    { agent, status, last_action }
UNIT_DISPATCHED { call_id, unit_id, eta_minutes }
HOLD_REQUIRED   { call_id, unit_id, asset_type, hold_id }
HOLD_RESOLVED   { hold_id, action: "CONFIRMED"|"CANCELLED" }
BRIEFING_READY  { call_id, text, audio_url }
INCIDENT_REPORT { call_id, report }
CALL_UPDATED    { id, final, transcript_snippet?, severity?, incident_type?, location?,
                  one_liner?, caller_status?, people_affected?, hazards? }
DEMO_PAUSED     { timestamp }
DEMO_RESUMED    { timestamp }
```

**IMPORTANT**: `reducer.ts` must always have a `default: return state` in `handleMessage`. Any unhandled WS message type without a default wipes all React state.

## Environment Variables

**`signal/backend/.env`**

| Variable | Required | Default | Notes |
|---|---|---|---|
| `ANTHROPIC_API_KEY` | No | Unset | Enables model-generated extraction, triage, and briefings; request failures use fallbacks |
| `ELEVENLABS_API_KEY` | No | Unset | Enables backend TTS briefings; it does not configure the browser conversational agent |
| `ELEVENLABS_VOICE_ID` | No | `21m00Tcm4TlvDq8ikWAM` | Briefing TTS voice |
| `SURGE_THRESHOLD` | No | `10` | calls/min to trigger Surge Mode |

**`signal/frontend/.env`** (optional)
```
VITE_SOS_HOST=192.168.1.42
```

Set `VITE_SOS_HOST` to the development computer's LAN host only when another device must open the QR URL. WebSocket configuration is derived from the current page origin.

## Frontend data flow

1. `useWebSocket` receives raw WS text → parses as `WsMessage` → calls `onMessage`
2. `App.tsx` dispatches `{ type: 'WS_MESSAGE', message }` to `useReducer`
3. `reducer.ts` handles every message type — updates `calls`, `agents`, `activeHold`, `briefings`, `auditLog`
4. `BRIEFING_READY` stores the optional `audio_url`; the current UI marks audio as available but does not start playback
5. Agent card flash animation: `App.tsx` tracks previous agent statuses with `useRef`, sets a 600ms flash flag when any agent transitions into `RUNNING`
6. `CALL_UPDATED` appends transcript snippet to `call.transcript`, merges extracted fields into `call.live_fields`, shows LIVE badge on card

## Demo flow (for judges)

Reset → Start Demo (2 normal calls, ASSISTED) → Answer Call (pick scenario, watch live transcript stream in) → End Call (pipeline runs) → Trigger Surge (SURGE banner, 4 auto-triaged calls) → Simulate Incoming Call (ElevenLabs voice agent, judge/teammate speaks as caller) → voice briefing → Protocol HOLD modal on heavy asset → dispatcher confirms → Override → Audit Trail.

**Pause** button stops all API spend instantly (simulator off, pipeline blocked). **Resume** restores it.

## Pre-Transcribed Scenarios (`data/transcripts/`)

Five JSON files used by Assisted Mode live call feature. Each has `id`, `title`, `zone`, `lat`, `lon`, `incident_type`, `sentences[]`. Backend streams sentences 1.5s apart and runs Claude Haiku extraction every 2 sentences.

| File | Scenario |
|---|---|
| `tesla_accident.json` | Multi-vehicle accident, Highway 99, airbag deployed |
| `wildfire_evacuation.json` | Family of 4 trapped, fire approaching |
| `structure_fire.json` | Apartment fire, multiple floors, people on balconies |
| `medical_elderly.json` | 78-year-old collapsed, possible stroke |
| `hazmat_spill.json` | Chemical tanker near elementary school |

## ElevenLabs Conversational AI Agent

Agent name: **Signal** | Agent ID: `agent_1701kr8n4kw9fr9aapm59ca3edg8`

Frontend uses `@elevenlabs/react` `useConversation` hook with `connectionType: 'webrtc'`. Full conversation transcript is sent to `POST /surge/call/complete`; Claude Haiku re-extracts structured fields server-side.

## Agents & Skills Available

- **`Ubiquitous` agent**: run whenever new technology or domain terms are introduced — extracts DDD-style glossary to `UBIQUITOUS_LANGUAGE.md`
- **`/grill-me` skill**: stress-test a plan or design before implementing
