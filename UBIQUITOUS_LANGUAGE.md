# Ubiquitous Language — Clear Dispatch

A local emergency-dispatch simulation for wildfire surge events. Most model output supports the dispatcher, while the optional Surge Voice Session uses a browser-based conversational agent with a simulated caller. This glossary formalizes domain terminology used across backend, frontend, and integration layers.

---

## Operating Modes

| Term | Definition | Aliases to avoid |
| --- | --- | --- |
| **ASSISTED** | Operating mode that exposes transcript-scenario intake controlled by the dispatcher. Once a call enters the shared pipeline, TRIAGE, RESOURCE, and RELAY still run automatically; standard units do not require per-call approval. | Standard mode, manual mode |
| **SURGE** | Operating mode that enables scripted bulk intake, the phone QR flow, and the browser conversational voice agent. It uses the same automatic TRIAGE, RESOURCE, and RELAY pipeline as ASSISTED. | Auto mode, autonomous mode |
| **Surge threshold** | The call rate (calls/minute) that triggers automatic transition from ASSISTED to SURGE mode. | Threshold, trigger point |
| **Surge started_at** | Timestamp marking when the system transitioned to SURGE mode. | Surge timestamp |

## Actors

| Term | Definition | Aliases to avoid |
| --- | --- | --- |
| **Dispatcher** | The human 911 operator; always the human interface between callers and the emergency response system. All final dispatch and override decisions are the dispatcher's responsibility. | Operator, responder, user |
| **Caller** | The person in crisis who initiates an emergency call. The AI agents never communicate directly with callers. | Person, victim, resident |
| **EOC Supervisor** | Emergency Operations Center supervisor; oversees incident command and resource allocation strategy. | Supervisor, commander, incident commander |

## AI Agents

| Term | Definition | Aliases to avoid |
| --- | --- | --- |
| **MONITOR** | Agent responsible for tracking call volume, computing surge rate via a 60-second sliding window, and controlling mode transitions. | Monitor service, rate monitor |
| **TRIAGE** | Agent that classifies incoming calls by severity (CRITICAL/URGENT/STANDARD/PENDING) and incident type (fire/evacuation/medical/structure/other). | Classifier, intake agent |
| **RESOURCE** | Agent that selects and dispatches appropriate units based on incident severity, type, and zone vulnerability; enforces HOLD protocol for heavy assets. | Dispatcher agent, allocation agent |
| **RELAY** | Agent that generates dispatcher briefings and optionally produces voice audio via text-to-speech. | Briefing agent, voice agent |

## Agent Lifecycle

| Term | Definition | Aliases to avoid |
| --- | --- | --- |
| **IDLE** | Agent state indicating the agent is not currently processing a call or request. | Waiting, inactive, standby |
| **RUNNING** | Agent state indicating active processing of a call or request. | Processing, active, in-progress |
| **COMPLETE** | Agent state indicating successful completion of a task (call triaged, resource selected, briefing generated). | Finished, done, success |
| **ERROR** | Agent state indicating a failure during processing. | Failed, exception |

## Calls and Incidents

| Term | Definition | Aliases to avoid |
| --- | --- | --- |
| **Call** | An incoming emergency call injected into the system; has caller_id, lat/lon, zone, reported_type, description, and an internal `status` field used for lifecycle guards (values: `"LIVE"`, `"SURGE_VOICE"`, `"PROCESSING"`). A call is the initial entry point; not yet classified or resourced. | Request, intake, emergency call |
| **PROCESSING status** | Internal guard value (`status: "PROCESSING"`) set on a call record the moment `POST /call/end-live` or `POST /surge/call/complete` hands it to `_run_pipeline()`. A second request for the same call_id that finds this status returns `{"status": "already_processing"}` immediately, preventing double pipeline execution. Not broadcast over WebSocket; internal only. | Pipeline lock, double-submit guard |
| **Incident** | A call that has been triaged and routed; a record in the incident_log after RELAY has generated a briefing and RESOURCE has dispatched units. Represents the complete lifecycle of a single emergency event from arrival to dispatch. | Case, event, alert |
| **Call queue** | The list of active and pending calls awaiting triage and dispatch. | Queue, intake queue, active calls |
| **Incident log** | The audit trail of completed incidents; created by RELAY after briefing generation; includes all dispatch decisions and overrides. | History, audit log, record log |
| **Severity** | Classification of call urgency: **CRITICAL** (immediate life threat), **URGENT** (significant risk), **STANDARD** (routine), or **PENDING** (awaiting triage). | Priority level, urgency |
| **Incident type** | The category of emergency: **fire**, **evacuation**, **medical**, **structure**, or **other**. | Call type, emergency type |
| **Zone** | A geographic area identifier used for resource allocation and vulnerability tracking (YL-01 through YL-08). | District, sector, geographic zone |
| **Vulnerability score** | A 0.0–1.0 quantitative score per zone indicating the proportion of at-risk population (elderly, disabled, non-English speakers). Zones with scores > 0.6 are flagged as **vulnerable**. | Risk score, at-risk ratio |
| **Vulnerable** | Boolean flag on a call (true/false) indicating whether the zone has a high vulnerability score (> 0.6) or the description mentions at-risk populations. When true, resource dispatch prioritizes rapid response. | At-risk, high-vulnerability |

## Resources and Dispatch

| Term | Definition | Aliases to avoid |
| --- | --- | --- |
| **Unit** | A response resource type available for dispatch: **engine**, **personnel**, **air_tanker**, **heavy_rescue**, or **hazmat**. Canonical term for all response resources. | Resource, asset, vehicle |
| **Dispatch** | The act of assigning a unit to a call; results in a UNIT_DISPATCHED WebSocket broadcast and a unit record in the incident log. | Assignment, allocation, send |
| **ETA** | Estimated time of arrival in minutes; calculated as `distance_km / 80 * 60`. Communicated to dispatcher in briefing. | Arrival time, time to arrival |
| **Heavy asset** | A unit type (air_tanker, heavy_rescue, hazmat) that requires mandatory dispatcher confirmation before dispatch; subject to HOLD protocol. | Specialized unit, equipment requiring approval |
| **Standard asset** | A unit type (engine, personnel) dispatched immediately without confirmation; never subject to HOLD. | Regular unit, standard equipment |

## HOLD Protocol

| Term | Definition | Aliases to avoid |
| --- | --- | --- |
| **HOLD** | A mandatory pause in dispatch when a heavy asset is needed; the dispatcher must confirm or cancel the dispatch before the unit is actually sent. Ensures human oversight of rare/expensive resources. | Hold state, dispatch pause, confirmation pause |
| **hold_id** | Unique identifier for a hold record; used to track and resolve a specific hold. | Hold token, confirmation ID |
| **HOLD_REQUIRED** | WebSocket event signaling that a heavy asset dispatch is pending and awaiting dispatcher confirmation or cancellation. | Hold notification, confirmation needed |
| **HOLD_RESOLVED** | WebSocket event broadcast when a hold is confirmed or cancelled by the dispatcher. | Hold completed, confirmation resolved |
| **CONFIRMED** | Resolution state indicating the dispatcher approved the heavy asset dispatch; the unit is now sent. | Approved, accepted |
| **CANCELLED** | Resolution state indicating the dispatcher rejected the heavy asset dispatch; the unit is not sent and incident routing continues with other units. | Rejected, denied, declined |

## Dispatcher Actions and Briefings

| Term | Definition | Aliases to avoid |
| --- | --- | --- |
| **Override** | Dispatcher action to force return to ASSISTED mode from SURGE; logged as `dispatcher_override: true` in the incident record. Used when dispatcher judges that the incident requires manual control. | Manual override, mode override, force manual |
| **Briefing** | A single summary record generated by RELAY for a call, containing call_id, text content, audio_url (ElevenLabs MP3 or null), and ISO8601 timestamp of receipt. | Summary, dispatch brief |
| **Audio briefing** | A TTS-rendered briefing via ElevenLabs; `audio_url` field contains MP3 URL, or null if TTS was unavailable. | Voice briefing, spoken briefing |
| **Briefing history** | The ordered array of all past **Briefings** for the current session (newest first), stored in frontend React state. Reset on page reload. | Briefing list, briefing array, past briefings |
| **Approved services** | The list of emergency service categories the dispatcher explicitly approved before handing a live call off to the pipeline (e.g. `["fire", "medical"]`). Stored on the call record as `approved_services` and carried into the incident audit trail. Supplied via the `EndLiveRequest` body on `POST /call/end-live`. | Services approved, dispatcher services |
| **Dispatcher notes** | Free-text annotations the dispatcher enters when ending a live call; stored on the call record as `dispatcher_notes` and included in the audit trail. Supplied alongside **approved services** in the `EndLiveRequest` body. | Notes, dispatcher comments, operator notes |

## Live Caller Transcription (ASSISTED Mode Feature)

| Term | Definition | Aliases to avoid |
| --- | --- | --- |
| **Live Caller Transcription** | An ASSISTED mode feature where the dispatcher clicks "Answer Call", selects a pre-recorded scenario, and the backend streams a pre-computed transcript sentence-by-sentence to the dispatcher via CALL_UPDATED WS events. Claude Haiku extracts structured fields (location, type, people affected, hazards) every 2 sentences, updating the call card in real time with a LIVE badge. | Live transcription, scenario playback, simulated transcription |
| **CALL_UPDATED** | WebSocket event broadcast during live transcription, containing incremental transcript updates and extracted call fields (severity, incident_type, location, people_affected, hazards, structure_type). | Transcript update, extraction update |
| **Pre-transcribed scenario** | A JSON file in `backend/data/transcripts/` containing a complete call scenario as pre-computed sentences, enabling offline transcript streaming without live STT API calls. Examples: tesla_accident, wildfire_evacuation, structure_fire, medical_elderly, hazmat_spill. | Scenario file, transcript scenario, canned scenario |

## Surge Mode Voice Features

| Term | Definition | Aliases to avoid |
| --- | --- | --- |
| **Surge Voice Session** | When in SURGE mode, the dispatcher clicks "Simulate Incoming Call", opening a VoiceAgentModal where a human (teammate/judge) speaks to an autonomous ElevenLabs conversational AI agent as if they were a caller. The agent gathers location, emergency type, people affected, and immediate dangers in natural conversation, then the full transcript is sent to `POST /surge/call/complete` where Claude Haiku re-extracts structured fields and feeds into the standard **_run_pipeline()**. The session is represented on the backend by a call record with `status: "SURGE_VOICE"`. | Voice session, autonomous voice call, simulated voice call |
| **ElevenLabs Conversational AI** | An autonomous voice agent (Agent ID: agent_1701kr8n4kw9fr9aapm59ca3edg8) that answers 911 calls in Surge Mode. Uses the @elevenlabs/react `useConversation` hook. Never used in ASSISTED mode; only active when system is in SURGE. | Conversational agent, autonomous voice agent, ElevenLabs voice |
| **ElevenLabs Scribe STT** | ElevenLabs speech-to-text product used offline to pre-transcribe recorded call audio into text scripts for scenario playback. Not used in live demo paths. | Scribe, transcription service, offline STT |

## System Demonstration and Pedagogy

| Term | Definition | Aliases to avoid |
| --- | --- | --- |
| **Tesla / Waymo metaphor** | Educational framing for judges: **ASSISTED mode = Tesla** (human driver + AI co-pilot providing real-time decision support), **SURGE mode = Waymo** (fully autonomous AI with human approval checkpoints). Illustrates the human-in-the-loop spectrum and escalation strategy. | Analogy, metaphor, instructional framing |
| **Demo pause** | Dispatcher action (POST /demo/pause) that pauses call generation by setting **simulator lambda** to 0, setting `paused: true` in system_state, and blocking **_run_pipeline()** execution. Conserves API credits during demo. Broadcast as DEMO_PAUSED WS event. | Pause simulator, pause generation, hold demo |
| **Demo resume** | Dispatcher action (POST /demo/resume) that restarts call generation by restoring prior **simulator lambda**, setting `paused: false`, and re-enabling **_run_pipeline()**. Broadcast as DEMO_RESUMED WS event. | Resume simulator, resume generation, restart demo |

## New WebSocket Events

| Term | Definition | Aliases to avoid |
| --- | --- | --- |
| **CALL_UPDATED** | WebSocket event broadcast during live transcription in ASSISTED mode, containing incremental transcript chunk and extracted structured fields. Triggers call card LIVE badge and transcript panel expansion. | Update event, transcript event |
| **DEMO_PAUSED** | WebSocket event broadcast when `/demo/pause` is called; signals to all clients that simulator has paused. | Pause event, pause notification |
| **DEMO_RESUMED** | WebSocket event broadcast when `/demo/resume` is called; signals to all clients that simulator has resumed. | Resume event, resume notification |

## System Events

| Term | Definition | Aliases to avoid |
| --- | --- | --- |
| **MODE_CHANGE** | WebSocket event broadcast when the system transitions between ASSISTED and SURGE modes. | Mode transition, mode update |
| **CALL_ADDED** | WebSocket event broadcast when a new call is added to the call queue. | Call intake, new call notification |
| **AGENT_STATUS** | WebSocket event broadcast when an agent's state changes (IDLE, RUNNING, COMPLETE, ERROR). | Agent update, status update |
| **UNIT_DISPATCHED** | WebSocket event broadcast when a unit is assigned to and dispatched for an incident. | Dispatch event, unit assignment |
| **HOLD_REQUIRED** | WebSocket event signaling a hold is pending for dispatcher confirmation. | See HOLD Protocol section. |
| **HOLD_RESOLVED** | WebSocket event when a hold is confirmed or cancelled. | See HOLD Protocol section. |
| **BRIEFING_READY** | WebSocket event broadcast when RELAY has generated a briefing and it is ready for dispatcher delivery. | Briefing generated, briefing available |
| **INCIDENT_REPORT** | WebSocket event containing the final incident record after all dispatch and logging is complete. | Report event, final report |

## System State and Background Tasks

| Term | Definition | Aliases to avoid |
| --- | --- | --- |
| **System state** | In-memory singleton containing: current mode (ASSISTED/SURGE), surge_threshold, surge_started_at timestamp, and call_timestamps for rate computation. | Global state, system configuration |
| **Simulator** | Background task that generates synthetic calls at a configurable Poisson rate (λ calls/minute) for testing and load simulation. When **simulator lambda** is ≤ 0, the loop short-circuits with a 5-second sleep instead of attempting `expovariate(0)`, preventing a ZeroDivisionError. | Call generator, synthetic call task, test simulator |
| **Simulator lambda** | The Poisson arrival rate (calls/minute): λ=0.1 (demo-quiet mode), λ=2.0 (normal background), λ=15.0 (surge demonstration), λ=0.0 (fully stopped during **Demo pause**). After **Demo reset**, lambda is set to 0.1 so background simulator noise does not interfere with the scripted demo calls. Normal background operation uses λ=2.0. | Arrival rate, lambda parameter, call rate |
| **Sliding window** | A 60-second rolling window of call timestamps used by MONITOR to compute the current call rate (calls/minute) for surge detection. | Rate window, 60-second window, moving window |
| **Demo lifecycle** | The scripted judge demo sequence: **Reset** → **Start Demo** → **Trigger Surge** → confirm HOLD → Override → Audit Trail. Each step must be run in order; Reset re-marks all resources available and sets simulator to demo-quiet mode. | Demo flow, demo steps |
| **`extract_json()`** | Shared utility function in `agents/utils.py` that parses a Claude LLM response into a Python dict. Tries `json.loads` first; falls back to extracting a fenced code block, then to bare `{…}` regex. Raises `ValueError` if no JSON is found. Used by TRIAGE, RELAY, live_calls, and surge_calls — previously duplicated in each; now consolidated. | JSON parser, response parser |

## State Lifecycle

| Term | Definition | Aliases to avoid |
| --- | --- | --- |
| **Session state** | Frontend-only in-memory state stored in React component state: **Call queue**, **Briefing history**, UI state, mode indicator. Volatile; reset to empty on page reload. | Frontend state, UI state, transient state |
| **Backend process state** | In-memory backend data including **incident_log**, calls, holds, resources, and system configuration. It survives a browser reconnect but is lost on backend restart; `/demo/reset` also clears session data. | Backend state, process-local state |
| **Re-hydration** | A potential state-sync step using `GET /state`. It is not implemented for the current dashboard reducer, which starts with empty call, hold, incident, and agent state after a refresh and waits for new WebSocket events. `MapView` separately fetches state for map fixtures. | State sync, reconnect sync, state fetch |
| **Incident log** | Process-local list of completed pipeline records. Each entry includes triage, selected unit, hold state, briefing, and audit metadata. It is not stored in a database. | Incident record, history log, audit log |

## Demo Mode

| Term | Definition | Aliases to avoid |
| --- | --- | --- |
| **Demo reset** | Action that clears all system state (call queue, incident log, briefing history) and sets **simulator lambda** to 0.1 to enter demo-quiet mode. Logged: "Demo reset — all state cleared". | Reset demo, demo clear |
| **Demo start** | Action that injects 2 synthetic normal calls into the call queue to demonstrate triage and dispatch. Logged: "Demo started — 2 normal calls injected". | Start demo, demo begin |
| **Demo surge trigger** | Action that injects 4 synthetic calls (including a **heavy asset** request) to demonstrate SURGE mode and the HOLD protocol. Logged: "Demo surge triggered — 4 calls injected, heavy asset included". | Trigger surge, surge demo |
| **Demo-quiet mode** | State of the simulator after **Demo reset**, with **simulator lambda** = 0.1, producing negligible background calls (~1 per 10 minutes) so judge focus is on injected demo calls. | Quiet simulator, demo pause, background-quiet |

## New Endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/call/start-live` | Dispatcher initiates live transcription in ASSISTED mode; selects a scenario. Backend begins streaming pre-transcribed sentences via CALL_UPDATED. |
| POST | `/call/end-live` | Dispatcher ends live transcription session; triggers TRIAGE, RESOURCE, RELAY pipeline on accumulated transcript. |
| POST | `/surge/call/initiate` | Initiates a **Surge Voice Session** in SURGE mode; opens VoiceAgentModal for human caller to speak to ElevenLabs Conversational AI. |
| POST | `/surge/call/complete` | Dispatcher submits completed ElevenLabs voice conversation transcript; Claude Haiku re-extracts fields and feeds into **_run_pipeline()**. |
| POST | `/demo/pause` | Pauses call generation by setting simulator_lambda to 0; blocks _run_pipeline; broadcasts DEMO_PAUSED. |
| POST | `/demo/resume` | Restarts call generation by restoring simulator_lambda; re-enables _run_pipeline; broadcasts DEMO_RESUMED. |

---

## Flagged Ambiguities

### 1. "Briefing history" vs. "Incident log"
- **Problem**: Both record past briefing and incident data, but they exist in different layers and have different lifecycles.
- **Canonical distinction**:
  - **Briefing history** → frontend session state (React component state); array of all briefings received in the current session; volatile; reset on page reload
  - **Incident log** → backend process state; list of completed pipeline records that survives browser reconnects but not a backend restart
- **Recommendation**: When discussing dispatcher-facing briefings in the current browser session, say "the **Briefing history** shows received briefings." When discussing backend records for the running process, say "the **incident log** records completed incidents." Neither store is durable.

### 2. "Resource" vs. "Unit"
- **Problem**: "Resource" is used both as a module name (`state.resources`) and as a synonym for "Unit" in agent code.
- **Canonical term**: **Unit**
- **Recommendation**: Standardize on "Unit" in domain language. If the `state.resources` module name must persist in code, treat it as a technical implementation detail; the domain concept is always "Unit."

### 3. "Incident" lifecycle ambiguity
- **Problem**: "Incident" is used both for a call-in-progress (after triage) and for the completed log entry (after briefing and dispatch).
- **Canonical distinction**:
  - **Call** → initial entry; awaiting triage
  - **Incident** → call after triage, resource selection, and briefing generation; logged to incident_log
- **Recommendation**: In conversation, say "a Call has become an Incident once RELAY generates a briefing."

### 4. "Override" — action vs. field
- **Problem**: "Override" refers both to the dispatcher action (POST /override endpoint) and to a boolean field in the audit record (`dispatcher_override: bool`).
- **Canonical terms**:
  - **Override** (noun/verb) → the dispatcher action or the event
  - **dispatcher_override** → the boolean field in the incident record
- **Recommendation**: When discussing the action, say "the dispatcher issued an override." When discussing the record, say "the incident has `dispatcher_override: true`."

### 5. Internal call `status` vs. `severity`
- **Problem**: The call record has both a `status` field (internal lifecycle guard: `"LIVE"`, `"SURGE_VOICE"`, `"PROCESSING"`) and a `severity` field (domain classification: `"PENDING"`, `"CRITICAL"`, `"URGENT"`, `"STANDARD"`). Both are set on the same dict and can be confused.
- **Canonical distinction**:
  - **severity** → domain classification broadcast over WebSocket; drives dispatch priority
  - **status** → internal guard only; never appears in WebSocket payloads; used solely to prevent double pipeline execution
- **Recommendation**: When discussing call urgency, always use **severity**. When discussing lifecycle state (idempotency, pipeline lock), use **status** and be explicit that it is backend-internal.

### 6. "Report" — event vs. object
- **Problem**: "Report" refers both to the INCIDENT_REPORT WebSocket event and to the report object contained within the event payload.
- **Canonical terms**:
  - **INCIDENT_REPORT** → the WebSocket event
  - **Report** or **incident report object** → the payload data structure
- **Recommendation**: Prefer "INCIDENT_REPORT event" and "incident report payload" to avoid confusion.

---

## Example Dialogue

> **Frontend Dev**: "Let me walk through the demo flow. We start with **Demo reset**, right?"
>
> **Domain Expert**: "Right. **Demo reset** clears the call queue, incident log, and briefing history. It sets **simulator lambda** to 0.1, entering **demo-quiet mode** so background noise doesn't interfere. We're now ready for a clean, scripted demo."
>
> **Frontend Dev**: "Then the dispatcher clicks 'Start Demo', which injects 2 normal calls?"
>
> **Domain Expert**: "Exactly. The 2 calls flow through TRIAGE, RESOURCE, and RELAY in ASSISTED mode. The dispatcher sees them in the call queue, briefings arrive, and the dispatch happens without any HOLD because they're standard assets."
>
> **Frontend Dev**: "Got it. Now, when we trigger **Demo surge**, what happens?"
>
> **Domain Expert**: "**Demo surge trigger** injects 4 calls, including one with `force_heavy_asset=True`. This forces the call rate up, MONITOR detects the surge, mode transitions to SURGE, and agents run autonomously. The heavy asset triggers a HOLD, demonstrating the **HOLD protocol** and dispatcher confirmation."
>
> **Frontend Dev**: "In the actual system, can we pause the demo without resetting it? We might want to conserve API credits between runs."
>
> **Domain Expert**: "Yes! **Demo pause** stops call generation by zeroing out **simulator lambda** and setting `paused: true` in system state. DEMO_PAUSED is broadcast, blocking **_run_pipeline()** execution. To resume, call **Demo resume**, which restores the prior lambda and enables **_run_pipeline()** again. Broadcasts DEMO_RESUMED."
>
> **Frontend Dev**: "What about the **Live Caller Transcription** feature in ASSISTED mode? How does that differ?"
>
> **Domain Expert**: "In ASSISTED mode, if the dispatcher clicks 'Answer Call', they select a **pre-transcribed scenario** from our data folder — like tesla_accident or wildfire_evacuation. The backend streams the transcript sentence-by-sentence via CALL_UPDATED WS events. Claude Haiku extracts fields every 2 sentences. The call card shows a LIVE badge and expanding transcript panel. It simulates a live caller without needing real STT."
>
> **Frontend Dev**: "And in SURGE mode, the dispatcher can initiate a **Surge Voice Session**?"
>
> **Domain Expert**: "Exactly. When in SURGE mode, the dispatcher clicks 'Simulate Incoming Call', which opens a VoiceAgentModal. A human — a teammate or judge — speaks to the **ElevenLabs Conversational AI** agent as if they were the caller. The agent uses natural conversation to gather location, type, people affected, and hazards. When the conversation ends, the full transcript goes to `/surge/call/complete`, we re-extract structured fields with Claude Haiku, and feed it into **_run_pipeline()** as if it were a real call."
>
> **Frontend Dev**: "So **ElevenLabs Conversational AI** is only for SURGE mode, and **Live Caller Transcription** is only for ASSISTED?"
>
> **Domain Expert**: "Correct. The **Tesla / Waymo metaphor** explains it: ASSISTED is like Tesla (human driver + AI copilot co-pilot, using **Live Caller Transcription** to assist), and SURGE is like Waymo (autonomous, using **ElevenLabs Conversational AI** to fully handle calls). Both paths feed into the same **_run_pipeline()** for triage, resource selection, and briefing."

---

## Key Relationships

### Core Call Lifecycle
- A **Call** is created when a caller reports an emergency; it has an initial reported_type and description.
- TRIAGE converts a **Call** into a classified **Incident** by assigning severity and incident_type; results are merged back into the call record in state.
- RESOURCE selects units for the **Incident** by reading severity, zone, and lat/lon directly from the call record (the `triage` object is not passed separately); if a **heavy asset** is selected, a **HOLD** is created.
- RELAY generates a **Briefing** once all units are selected; the briefing is delivered to the **Dispatcher**.
- The **Dispatcher** confirms or cancels any **HOLD** and may issue an **Override** to return to ASSISTED mode.
- Upon **Briefing** delivery and **HOLD** resolution, the **Incident** is logged to the **incident_log**.
- When a live call or surge voice session ends, the call record gains **approved services** and **dispatcher notes** before the pipeline runs; both fields are preserved in the incident audit record.

### Assisted Mode vs. Surge Mode
- In **ASSISTED** mode, the **Dispatcher** makes all decisions; AI provides support only (decision support, transcript analysis, briefing generation).
- In **SURGE** mode, AI agents operate autonomously until a **Briefing** is ready; **HOLD** still requires dispatcher confirmation.
- **Live Caller Transcription** is an ASSISTED mode feature: dispatcher selects a **pre-transcribed scenario**, backend streams sentences via CALL_UPDATED, Claude extracts fields incrementally.
- **Surge Voice Session** is a SURGE mode feature: dispatcher initiates a voice conversation between a human caller and **ElevenLabs Conversational AI**; transcript feeds into **_run_pipeline()** on completion.

### Demo and State Management
- The **Demo lifecycle** consists of: **Demo reset** (clears state, sets **simulator lambda** to 0.1) → **Demo start** (injects 2 calls) → **Demo surge trigger** (injects 4 calls including heavy asset).
- **Demo pause** and **Demo resume** allow pausing/resuming call generation without resetting state, conserving API credits.
- **Demo-quiet mode** (lambda=0.1) keeps background noise negligible (~1 call per 10 minutes) so judge focus remains on scripted demo calls.

### Geography and Vulnerability
- A **Zone** has a **vulnerability score**; calls in vulnerable zones are flagged as **vulnerable** and prioritized.
- **CALL_UPDATED** events during **Live Caller Transcription** carry extracted location and hazard fields, enabling zone-based triage during ASSISTED mode call handling.
