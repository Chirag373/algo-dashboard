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

    # Retained for configuration compatibility; the engine always refuses
    # live mode and accepts only a local paper broker.
    LIVE_ENABLED: bool = False

    # Feed: "simulated" runs a compressed trading day so strategies can be
    # tested at any hour. Real broker feeds plug in behind the Feed interface.
    FEED: str = "real_market"
    SIM_MINUTES_PER_TICK: int = 1  # virtual minutes advanced per real second
    SIM_DAY_PAUSE_SECONDS: int = 8  # pause between simulated days
    SIM_SEED: int | None = None

    # Paper broker costs
    PAPER_FEE_PER_ORDER: float = 20.0  # flat brokerage per executed order (INR)

    # Alpaca API credentials
    ALPACA_KEY_ID: str = "PKGDOTH7MW6S2O7SJK4AH5IJZN"
    ALPACA_SECRET_KEY: str = "DvTrBYH44GXic814aoLAewmYQQbMTyMxiPQYmnpujED3"
    ALPACA_BASE_URL: str = "https://paper-api.markets/v2"
    ALPACA_PAPER_URL: str = "https://paper-api.alpaca.markets/v2"
    ALPACA_DATA_URL: str = "https://data.alpaca.markets/v2"

    # Zerodha Kite Connect credentials
    KITE_API_KEY: str = "ovioop7ol8h3p4tr"
    KITE_API_SECRET: str = "7vblcmahili70qjkvy3v9xjsxlb7pgfi"
    KITE_ACCESS_TOKEN: str = ""  # Set after login via /api/v1/kite/login


settings = Settings()
