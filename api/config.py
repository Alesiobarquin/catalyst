from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    database_url: str = "postgresql://catalyst:catalyst@localhost:5432/catalyst"
    cors_origins: list[str] = ["http://localhost:3000", "http://localhost:3001"]
    api_host: str = "0.0.0.0"
    api_port: int = 8000

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


settings = Settings()
