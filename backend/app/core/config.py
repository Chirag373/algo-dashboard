from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    PROJECT_NAME: str = "Algo Dashboard API"
    API_V1_STR: str = "/api/v1"
    CORS_ORIGINS: list[str] = [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:3100",
        "http://127.0.0.1:3100",
    ]

    DB_PATH: str = str(BACKEND_DIR / "data" / "terminal.db")

    # Safety: live trading is OFF unless explicitly enabled. No live broker
    # adapter exists yet, so enabling it only unlocks the UI/API switch.
    LIVE_ENABLED: bool = False

    # Feed: "simulated" runs a compressed trading day so strategies can be
    # tested at any hour. Real broker feeds plug in behind the Feed interface.
    FEED: str = "simulated"
    SIM_MINUTES_PER_TICK: int = 1  # virtual minutes advanced per real second
    SIM_DAY_PAUSE_SECONDS: int = 8  # pause between simulated days
    SIM_SEED: int | None = None

    # Paper broker costs
    PAPER_FEE_PER_ORDER: float = 20.0  # flat brokerage per executed order (INR)


settings = Settings()
