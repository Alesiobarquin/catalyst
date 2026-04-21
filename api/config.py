from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    database_url: str = "postgresql://catalyst:catalyst@localhost:5432/catalyst"
    cors_origins: list[str] = ["http://localhost:3000", "http://localhost:3001"]
    api_host: str = "0.0.0.0"
    api_port: int = 8000
    # Java engine actuator (Docker service name). Override on host: http://127.0.0.1:8081/actuator/health
    engine_health_url: str = "http://engine:8081/actuator/health"

    # Clerk (JWT verification for /settings and /executions). JWKS URL is typically
    # {issuer}/.well-known/jwks.json — see Clerk dashboard → API keys.
    clerk_issuer: str = ""
    clerk_jwks_url: str = ""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    @property
    def clerk_enabled(self) -> bool:
        return bool(self.clerk_issuer and self.clerk_jwks_url)


settings = Settings()
