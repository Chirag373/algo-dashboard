import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import router as rest_router
from app.api.ws import router as ws_router
from app.core.config import settings
from app.db.database import Database
from app.services.broker import PaperBroker
from app.services.engine import TradingEngine
from app.services.feed import build_feed
from app.services.hub import Hub

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")
log = logging.getLogger("app")


async def run_loop(engine: TradingEngine, hub: Hub) -> None:
    """Pull one feed step per second, apply it to the engine, push the state."""
    while True:
        await asyncio.sleep(1)
        try:
            engine.on_tick(engine.feed.next())
            await hub.broadcast({"type": "snapshot", "data": engine.snapshot()})
        except asyncio.CancelledError:
            raise
        except Exception:
            log.exception("tick failed; continuing")


@asynccontextmanager
async def lifespan(app: FastAPI):
    db = Database(settings.DB_PATH)
    feed = build_feed(
        settings.FEED, settings.SIM_MINUTES_PER_TICK, settings.SIM_DAY_PAUSE_SECONDS, settings.SIM_SEED
    )
    engine = TradingEngine(db, feed, PaperBroker(settings.PAPER_FEE_PER_ORDER), settings.LIVE_ENABLED)
    hub = Hub()
    app.state.engine, app.state.hub = engine, hub
    task = asyncio.create_task(run_loop(engine, hub))
    log.info("Engine started (feed=%s, live_enabled=%s)", feed.kind, settings.LIVE_ENABLED)
    try:
        yield
    finally:
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass
        engine.save()


def get_application() -> FastAPI:
    application = FastAPI(title=settings.PROJECT_NAME, lifespan=lifespan)
    application.add_middleware(
        CORSMiddleware,
        allow_origins=settings.CORS_ORIGINS,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    application.include_router(rest_router, prefix=settings.API_V1_STR)
    application.include_router(ws_router)
    return application


app = get_application()


@app.get("/")
def read_root():
    return {"message": f"{settings.PROJECT_NAME} is running"}
