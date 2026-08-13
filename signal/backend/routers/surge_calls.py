import asyncio
import logging
import uuid
from datetime import datetime, timezone

import anthropic
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

import state
from agents.utils import extract_json
from ws.hub import manager

_log = logging.getLogger("clear_dispatch.surge_calls")

_client = anthropic.AsyncAnthropic()

router = APIRouter()


class InitiateRequest(BaseModel):
    zone: str | None = "YL-03"
    lat: float | None = None
    lon: float | None = None


class CompleteRequest(BaseModel):
    call_id: str
    transcript: str
    zone: str | None = None


@router.post("/surge/call/initiate")
async def surge_initiate(body: InitiateRequest):
    call_id = uuid.uuid4().hex[:8]
    now = datetime.now(timezone.utc).isoformat()

    state.system_state["call_timestamps"].append(now)

    zone = body.zone or "YL-03"
    lat = body.lat if body.lat is not None else 38.5449
    lon = body.lon if body.lon is not None else -121.7405

    call = {
        "id": call_id,
        "caller_id": f"SURGE-VOICE-{call_id}",
        "lat": lat,
        "lon": lon,
        "zone": zone,
        "reported_type": "unknown",
        "description": "",
        "severity": "PENDING",
        "incident_type": "unknown",
        "vulnerable": False,
        "timestamp": now,
        "unit_id": None,
        "eta_minutes": None,
        "briefing_text": None,
        "force_heavy_asset": False,
        "status": "SURGE_VOICE",
    }
    state.call_queue.append(call)

    await manager.broadcast("CALL_ADDED", {
        "id": call_id,
        "severity": "PENDING",
        "zone": zone,
        "vulnerable": False,
        "incident_type": "unknown",
        "lat": lat,
        "lon": lon,
    })

    _log.info("SURGE_VOICE [%s] initiated — zone=%s", call_id, zone)
    return {"call_id": call_id}


@router.post("/surge/call/complete")
async def surge_complete(body: CompleteRequest):
    from routers.calls import _run_pipeline

    # Find the call
    call = None
    for c in state.call_queue:
        if c["id"] == body.call_id:
            call = c
            break

    if call is None:
        raise HTTPException(status_code=404, detail=f"Call '{body.call_id}' not found")

    if call.get("status") == "PROCESSING":
        return {"status": "already_processing", "call_id": body.call_id}

    # Use provided zone as fallback if extraction fails
    fallback_zone = body.zone or call.get("zone", "YL-03")

    # Extract structured fields from the full transcript via Claude Haiku
    prompt = f"""You are a 911 dispatch AI. A caller spoke with an automated agent. Extract structured information from this transcript.

Transcript:
{body.transcript}

Respond with ONLY a JSON object:
{{
  "severity": "CRITICAL|URGENT|STANDARD",
  "incident_type": "fire|evacuation|medical|structure|hazmat|other",
  "location": "street address or landmark if mentioned",
  "zone": "zone code like YL-01 if determinable, else null",
  "lat": null,
  "lon": null,
  "caller_status": "brief status of caller",
  "people_affected": 5,
  "hazards": ["propane tanks", "power lines"],
  "vulnerable": true,
  "one_liner": "one-sentence summary"
}}

Rules:
- people_affected must be an integer, or omit it
- hazards must be a JSON array of strings, or omit it
- vulnerable must be a boolean, not a string

Rules for severity:
- CRITICAL: imminent life threat, spreading fire, unresponsive patient
- URGENT: evacuations, mobility-impaired, smoke inhalation
- STANDARD: property threat, contained smoke, non-urgent
- vulnerable=true if elderly/disabled/children/assisted living mentioned

Omit or null out any fields you cannot confidently extract."""

    extracted: dict = {}
    try:
        response = await _client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=384,
            messages=[{"role": "user", "content": prompt}],
        )
        raw = extract_json(response.content[0].text)
        extracted = {k: v for k, v in raw.items() if v is not None and v != ""}
    except Exception as e:
        _log.error("Surge transcript extraction failed for call %s: %s", body.call_id, e)

    # Apply extracted fields to call record
    call["severity"] = extracted.get("severity", "URGENT")
    call["incident_type"] = extracted.get("incident_type", "unknown")
    call["reported_type"] = call["incident_type"]
    call["vulnerable"] = bool(extracted.get("vulnerable", False))
    call["zone"] = extracted.get("zone") or fallback_zone
    call["description"] = (
        extracted.get("one_liner")
        or extracted.get("location")
        or body.transcript[:300]
    )
    if extracted.get("lat"):
        call["lat"] = float(extracted["lat"])
    if extracted.get("lon"):
        call["lon"] = float(extracted["lon"])

    call["status"] = "PROCESSING"

    # Push extracted fields to the frontend so the call card can show details
    await manager.broadcast("CALL_UPDATED", {
        "id": body.call_id,
        "final": True,
        "severity": call["severity"],
        "incident_type": call["incident_type"],
        "location": extracted.get("location"),
        "one_liner": extracted.get("one_liner"),
        "caller_status": extracted.get("caller_status"),
        "people_affected": extracted.get("people_affected"),
        "hazards": extracted.get("hazards"),
        "transcript_snippet": body.transcript,
    })

    asyncio.create_task(_run_pipeline(call))

    _log.info(
        "SURGE_VOICE [%s] transcript processed — severity=%s type=%s",
        body.call_id,
        call["severity"],
        call["incident_type"],
    )
    return {"status": "pipeline_started", "call_id": body.call_id}
