import asyncio
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.api.ws import router as ws_router
from app.services.market_data import broker_instance, connection_manager

def get_application() -> FastAPI:
    application = FastAPI(title=settings.PROJECT_NAME)

    application.add_middleware(
        CORSMiddleware,
        allow_origins=settings.CORS_ORIGINS,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    application.include_router(ws_router)

    return application

app = get_application()

@app.on_event("startup")
async def startup_event():
    async def handle_tick(tick_data):
        await connection_manager.broadcast(tick_data)
        
    broker_instance.register_callback(handle_tick)
    asyncio.create_task(broker_instance.start_stream())

@app.get("/")
def read_root():
    return {"message": f"{settings.PROJECT_NAME} is running"}
