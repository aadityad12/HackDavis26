import asyncio
import logging
import math
import uuid

import state
from ws.hub import manager

_log = logging.getLogger("clear_dispatch.resource")

HEAVY_ASSET_TYPES = {"air_tanker", "heavy_rescue", "hazmat"}


def _haversine(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    R = 6371
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (math.sin(dlat / 2) ** 2
         + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2) ** 2)
    return R * 2 * math.asin(math.sqrt(a))


def _find_nearest(lat: float, lon: float, prefer_heavy: bool = False) -> dict | None:
    available = [r for r in state.resources if r.get("available")]
    if not available:
        return None

    if prefer_heavy:
        heavy = [r for r in available if r.get("type") in HEAVY_ASSET_TYPES]
        pool = heavy if heavy else available
    else:
        standard = [r for r in available if r.get("type") not in HEAVY_ASSET_TYPES]
        pool = standard if standard else available

    return min(pool, key=lambda r: _haversine(lat, lon, r["lat"], r["lon"]))


async def resource_agent(call: dict) -> dict:
    lat = call.get("lat", 38.5449)
    lon = call.get("lon", -121.7405)
    prefer_heavy = call.get("force_heavy_asset", False)

    await manager.broadcast("AGENT_STATUS", {
        "agent": "RESOURCE",
        "status": "RUNNING",
        "last_action": f"Finding unit for call {call['id']}",
    })

    unit = _find_nearest(lat, lon, prefer_heavy=prefer_heavy)

    if unit is None:
        _log.warning("No available units for call %s", call["id"])
        await manager.broadcast("AGENT_STATUS", {
            "agent": "RESOURCE",
            "status": "ERROR",
            "last_action": f"No available units for call {call['id']}",
        })
        return {"unit_id": None, "eta_minutes": None, "requires_hold": False, "hold_confirmed": None}

    unit["available"] = False
    distance_km = _haversine(lat, lon, unit["lat"], unit["lon"])
    eta_minutes = round(distance_km / 80 * 60)
    is_heavy = unit.get("type") in HEAVY_ASSET_TYPES

    result = {
        "unit_id": unit["id"],
        "eta_minutes": eta_minutes,
        "requires_hold": is_heavy,
        "hold_confirmed": None,
    }

    if is_heavy:
        hold_id = str(uuid.uuid4())
        hold_record = {
            "call_id": call["id"],
            "unit_id": unit["id"],
            "asset_type": unit["type"],
            "hold_id": hold_id,
            "resolved": None,
        }
        state.hold_queue[hold_id] = hold_record

        await manager.broadcast("HOLD_REQUIRED", {
            "call_id": call["id"],
            "unit_id": unit["id"],
            "asset_type": unit["type"],
            "hold_id": hold_id,
            "eta_minutes": eta_minutes,
            "zone": call.get("zone", ""),
            "severity": call.get("severity", "PENDING"),
            "incident_type": call.get("incident_type", call.get("reported_type", "")),
            "description": call.get("description", ""),
        })

        # Poll for dispatcher confirmation (max 60s)
        resolved = None
        for _ in range(30):
            await asyncio.sleep(2)
            resolved = state.hold_queue.get(hold_id, {}).get("resolved")
            if resolved:
                break

        if resolved == "CONFIRMED":
            result["hold_confirmed"] = True
            await manager.broadcast("UNIT_DISPATCHED", {
                "call_id": call["id"],
                "unit_id": unit["id"],
                "eta_minutes": eta_minutes,
            })
        else:
            result["hold_confirmed"] = False
            unit["available"] = True
            action = "cancelled" if resolved == "CANCELLED" else "timed out"
            await manager.broadcast("AGENT_STATUS", {
                "agent": "RESOURCE",
                "status": "COMPLETE",
                "last_action": f"HOLD {action} for call {call['id']}",
            })
            return result
    else:
        await manager.broadcast("UNIT_DISPATCHED", {
            "call_id": call["id"],
            "unit_id": unit["id"],
            "eta_minutes": eta_minutes,
        })

    await manager.broadcast("AGENT_STATUS", {
        "agent": "RESOURCE",
        "status": "COMPLETE",
        "last_action": f"Unit {unit['id']} → call {call['id']}, ETA {eta_minutes}min",
    })

    return result
