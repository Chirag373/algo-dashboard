from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    PROJECT_NAME: str = "Algo Dashboard API"
    API_V1_STR: str = "/api/v1"
    CORS_ORIGINS: list[str] = ["*"]
    
    # Add broker credentials here if needed later
    # BROKER_API_KEY: str = ""
    # BROKER_API_SECRET: str = ""

    class Config:
        env_file = ".env"

settings = Settings()
