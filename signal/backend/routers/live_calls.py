import asyncio
import json
import logging
import os
import uuid
from datetime import datetime, timezone

import anthropic
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

import state
from agents.utils import extract_json
from ws.hub import manager

_log = logging.getLogger("clear_dispatch.live_calls")

_client = anthropic.AsyncAnthropic()

router = APIRouter()

_TRANSCRIPTS_DIR = os.path.join(os.path.dirname(__file__), "..", "data", "transcripts")


class StartLiveRequest(BaseModel):
    transcript_id: str


class EndLiveRequest(BaseModel):
    call_id: str
    approved_services: list[str] = []
    notes: str = ""


async def _extract_fields_from_transcript(call_id: str, transcript: str) -> dict:
    """Run Claude Haiku to extract structured fields from accumulated transcript."""
    prompt = f"""You are a 911 dispatch AI. Extract structured information from this partial caller transcript.

Transcript so far:
{transcript}

Respond with ONLY a JSON object containing any fields you can confidently extract:
{{
  "severity": "CRITICAL|URGENT|STANDARD",
  "incident_type": "fire|evacuation|medical|structure|hazmat|other",
  "location": "street address or landmark",
  "caller_status": "brief status of caller",
  "people_affected": 5,
  "hazards": ["propane tanks", "power lines"],
  "one_liner": "one-sentence summary of the incident"
}}

Rules:
- people_affected must be an integer, or omit it
- hazards must be a JSON array of strings, or omit it
- Only include fields you can confidently extract. Omit any field that is unclear or not mentioned."""

    try:
        response = await _client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=256,
            messages=[{"role": "user", "content": prompt}],
        )
        data = extract_json(response.content[0].text)
        return {k: v for k, v in data.items() if v is not None and v != ""}
    except Exception as e:
        _log.error("Live extraction failed for call %s: %s", call_id, e)
        return {}


async def _stream_transcript(call_id: str, transcript_data: dict) -> None:
    """Stream transcript sentences word-by-word with periodic Claude extraction."""
    sentences = transcript_data.get("sentences", [])
    state.live_transcripts[call_id] = ""
    state.live_extractions[call_id] = {}

    for i, sentence in enumerate(sentences):
        # Accumulate transcript
        if state.live_transcripts.get(call_id) is None:
            # Call was cleaned up (end-live was called early), stop streaming
            break
        state.live_transcripts[call_id] = (
            state.live_transcripts[call_id] + " " + sentence
        ).strip()

        # Broadcast each new sentence as a snippet
        await manager.broadcast("CALL_UPDATED", {
            "id": call_id,
            "final": False,
            "transcript_snippet": sentence,
        })

        # Every 2 sentences, run Claude extraction
        if (i + 1) % 2 == 0:
            accumulated = state.live_transcripts.get(call_id, "")
            if accumulated:
                extracted = await _extract_fields_from_transcript(call_id, accumulated)
                if extracted:
                    state.live_extractions[call_id] = {
                        **state.live_extractions.get(call_id, {}),
                        **extracted,
                    }
                    # Broadcast CALL_UPDATED with extracted fields merged in
                    update_payload: dict = {"id": call_id, "final": False}
                    update_payload.update(extracted)
                    await manager.broadcast("CALL_UPDATED", update_payload)

        await asyncio.sleep(1.5)

    # Final extraction after all sentences
    accumulated = state.live_transcripts.get(call_id, "")
    if accumulated:
        extracted = await _extract_fields_from_transcript(call_id, accumulated)
        if extracted:
            state.live_extractions[call_id] = {
                **state.live_extractions.get(call_id, {}),
                **extracted,
            }
            update_payload = {"id": call_id, "final": True}
            update_payload.update(extracted)
            await manager.broadcast("CALL_UPDATED", update_payload)

    _log.info("LIVE_STREAM [%s] transcript streaming complete", call_id)


@router.post("/call/start-live")
async def start_live_call(body: StartLiveRequest):
    transcript_path = os.path.join(
        _TRANSCRIPTS_DIR, f"{body.transcript_id}.json"
    )
    if not os.path.isfile(transcript_path):
        raise HTTPException(
            status_code=404,
            detail=f"Transcript '{body.transcript_id}' not found",
        )

    with open(transcript_path) as f:
        transcript_data = json.load(f)

    call_id = uuid.uuid4().hex[:8]
    now = datetime.now(timezone.utc).isoformat()

    state.system_state["call_timestamps"].append(now)

    call = {
        "id": call_id,
        "caller_id": f"LIVE-{call_id}",
        "lat": transcript_data.get("lat", 38.5449),
        "lon": transcript_data.get("lon", -121.7405),
        "zone": transcript_data.get("zone", "YL-01"),
        "reported_type": transcript_data.get("incident_type", "unknown"),
        "description": "",
        "severity": "PENDING",
        "incident_type": transcript_data.get("incident_type", "unknown"),
        "vulnerable": False,
        "timestamp": now,
        "unit_id": None,
        "eta_minutes": None,
        "briefing_text": None,
        "force_heavy_asset": False,
        "status": "LIVE",
    }
    state.call_queue.append(call)

    await manager.broadcast("CALL_ADDED", {
        "id": call_id,
        "severity": "PENDING",
        "zone": call["zone"],
        "vulnerable": False,
        "incident_type": call["incident_type"],
        "lat": call["lat"],
        "lon": call["lon"],
    })

    asyncio.create_task(_stream_transcript(call_id, transcript_data))

    _log.info("LIVE_CALL [%s] started — transcript_id=%s", call_id, body.transcript_id)
    return {"call_id": call_id}


@router.post("/call/end-live")
async def end_live_call(body: EndLiveRequest):
    from routers.calls import _run_pipeline

    # Find call in queue
    call = None
    for c in state.call_queue:
        if c["id"] == body.call_id:
            call = c
            break

    if call is None:
        raise HTTPException(status_code=404, detail=f"Call '{body.call_id}' not found")

    if call.get("status") == "PROCESSING":
        return {"status": "already_processing"}

    # Merge latest extracted fields into the call record
    extractions = state.live_extractions.get(body.call_id, {})
    if extractions:
        if "severity" in extractions:
            call["severity"] = extractions["severity"]
        if "incident_type" in extractions:
            call["incident_type"] = extractions["incident_type"]
            call["reported_type"] = extractions["incident_type"]
        if "location" in extractions:
            call["description"] = extractions.get("one_liner", extractions["location"])
        elif "one_liner" in extractions:
            call["description"] = extractions["one_liner"]

    # Build a description from accumulated transcript if no extraction
    accumulated = state.live_transcripts.get(body.call_id, "")
    if not call.get("description") and accumulated:
        call["description"] = accumulated[:500]

    call["status"] = "PROCESSING"
    call["approved_services"] = body.approved_services
    call["dispatcher_notes"] = body.notes

    # Run the main pipeline
    asyncio.create_task(_run_pipeline(call))

    # Clean up live state
    state.live_transcripts.pop(body.call_id, None)
    state.live_extractions.pop(body.call_id, None)

    _log.info("LIVE_CALL [%s] handed off to pipeline", body.call_id)
    return {"status": "pipeline_started"}
