import asyncio
import random
import uuid

import httpx

import state

LAT_MIN, LAT_MAX = 38.30, 38.90
LON_MIN, LON_MAX = -122.30, -121.50

ZONES = ["YL-01", "YL-02", "YL-03", "YL-04", "YL-05", "YL-06", "YL-07", "YL-08"]
INCIDENT_TYPES = ["fire", "evacuation", "medical", "structure"]
DESCRIPTIONS = [
    "Smoke visible from Highway 113",
    "Residents unable to evacuate due to road closure",
    "Elderly resident trapped, mobility impaired",
    "Structure fire spreading to adjacent units",
    "Caller reports fire approaching from hillside",
    "Multiple callers reporting same fire near Cache Creek",
]


async def simulator_loop():
    while True:
        lam = state.simulator_lambda["value"]
        if lam <= 0:
            await asyncio.sleep(5)
            continue
        interval_seconds = random.expovariate(lam / 60)
        await asyncio.sleep(interval_seconds)

        if state.system_state.get("paused"):
            continue

        call_data = {
            "caller_id": f"CALLER-{uuid.uuid4().hex[:6].upper()}",
            "lat": round(random.uniform(LAT_MIN, LAT_MAX), 6),
            "lon": round(random.uniform(LON_MIN, LON_MAX), 6),
            "zone": random.choice(ZONES),
            "reported_type": random.choice(INCIDENT_TYPES),
            "description": random.choice(DESCRIPTIONS),
        }

        async with httpx.AsyncClient() as client:
            try:
                await client.post("http://localhost:8000/call", json=call_data, timeout=5)
            except Exception:
                pass
