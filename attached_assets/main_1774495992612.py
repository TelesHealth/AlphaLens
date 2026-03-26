from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from apscheduler.schedulers.asyncio import AsyncIOScheduler
import asyncio
import json
import os

from backend.api import markets, signals, portfolio, coach
from backend.api.recommendations import router as rec_router
from backend.tasks.jobs import fetch_all_markets, run_research_agent, run_recommendations_scan
from backend.db.database import init_db

app = FastAPI(
    title="Alpha Lens API",
    description="AI-Powered Global Investment Intelligence Platform",
    version="3.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(markets.router, prefix="/api/markets", tags=["markets"])
app.include_router(signals.router, prefix="/api/signals", tags=["signals"])
app.include_router(portfolio.router, prefix="/api/portfolio", tags=["portfolio"])
app.include_router(coach.router, prefix="/api/coach", tags=["coach"])
app.include_router(rec_router, prefix="/api/recommendations", tags=["recommendations"])


class ConnectionManager:
    def __init__(self):
        self.connections: dict[str, list[WebSocket]] = {}

    async def connect(self, ws: WebSocket, asset_id: str):
        await ws.accept()
        if asset_id not in self.connections:
            self.connections[asset_id] = []
        self.connections[asset_id].append(ws)

    def disconnect(self, ws: WebSocket, asset_id: str):
        if asset_id in self.connections:
            self.connections[asset_id].remove(ws)

    async def broadcast(self, asset_id: str, data: dict):
        if asset_id in self.connections:
            for ws in self.connections[asset_id]:
                try:
                    await ws.send_text(json.dumps(data))
                except Exception:
                    pass


manager = ConnectionManager()


@app.websocket("/ws/signals/{asset_id}")
async def signal_websocket(ws: WebSocket, asset_id: str):
    await manager.connect(ws, asset_id)
    try:
        while True:
            await asyncio.sleep(30)
            await ws.send_text(json.dumps({"type": "ping"}))
    except WebSocketDisconnect:
        manager.disconnect(ws, asset_id)


scheduler = AsyncIOScheduler()


@app.on_event("startup")
async def startup():
    await init_db()
    scheduler.add_job(fetch_all_markets, "interval", minutes=15,
                      id="fetch_markets", replace_existing=True)
    scheduler.add_job(run_research_agent, "interval", hours=1,
                      id="research_agent", replace_existing=True)
    scheduler.add_job(run_recommendations_scan, "interval", minutes=30,
                      id="recommendations_scan", replace_existing=True)
    scheduler.start()
    print("✓ Alpha Lens started — all 3 background jobs running")
    print("  → Markets: every 15min")
    print("  → Research: every 60min")
    print("  → Recommendations: every 30min")


@app.on_event("shutdown")
async def shutdown():
    scheduler.shutdown()


@app.get("/api/health")
async def health():
    return {
        "status": "ok",
        "version": "3.0.0",
        "jobs": ["fetch_markets", "research_agent", "recommendations_scan"]
    }


frontend_path = "frontend/out"
if os.path.exists(frontend_path):
    app.mount("/", StaticFiles(directory=frontend_path, html=True))
else:
    @app.get("/")
    async def root():
        return {"message": "Alpha Lens API running. Frontend not built yet — run: cd frontend && npm install && npm run build"}
