import asyncio
import json
import logging
import os
import socket
from contextlib import asynccontextmanager

from dotenv import load_dotenv
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

load_dotenv()

import logger  # must import before any other clear_dispatch modules to set up the handler

import state
from agents.monitor import monitor_loop
from simulator import simulator_loop
from ws.hub import manager
from routers import calls, state_router, override, hold, demo
from routers import logs_router
from routers import live_calls, surge_calls

_log = logging.getLogger("clear_dispatch.main")


@asynccontextmanager
async def lifespan(app: FastAPI):
    data_dir = os.path.join(os.path.dirname(__file__), "data")

    with open(os.path.join(data_dir, "resources.json")) as f:
        state.resources.extend(json.load(f))

    with open(os.path.join(data_dir, "vulnerability.json")) as f:
        state.vulnerability_data.update(json.load(f))

    with open(os.path.join(data_dir, "park_fire.geojson")) as f:
        state.fire_perimeter.update(json.load(f))

    threshold = os.getenv("SURGE_THRESHOLD", "10")
    state.system_state["surge_threshold"] = int(threshold)

    monitor_task = asyncio.create_task(monitor_loop())
    simulator_task = asyncio.create_task(simulator_loop())
    _log.info("Clear Dispatch backend started — mode=%s threshold=%d",
              state.system_state["mode"], state.system_state["surge_threshold"])

    yield

    monitor_task.cancel()
    simulator_task.cancel()
    _log.info("Clear Dispatch backend shutting down")


os.makedirs("audio", exist_ok=True)

app = FastAPI(title="Clear Dispatch Backend", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/audio", StaticFiles(directory="audio"), name="audio")

app.include_router(calls.router)
app.include_router(state_router.router)
app.include_router(override.router)
app.include_router(hold.router)
app.include_router(demo.router)
app.include_router(logs_router.router)
app.include_router(live_calls.router)
app.include_router(surge_calls.router)


@app.get("/health")
async def health():
    return {"status": "ok", "mode": state.system_state["mode"]}


@app.get("/ip")
async def get_server_ip():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
    except Exception:
        ip = "localhost"
    return {"ip": ip}


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)
    except Exception:
        manager.disconnect(websocket)
