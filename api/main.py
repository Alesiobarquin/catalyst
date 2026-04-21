"""FastAPI application factory."""

import httpx
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api.config import settings
from api.db import lifespan, ping_database
from api.routers import execution, market, orders, performance, settings as settings_router, signals


def create_app() -> FastAPI:
    app = FastAPI(
        title="Catalyst API",
        description=(
            "Read layer for the Catalyst market signal pipeline. "
            "Exposes trade orders (Java engine) and validated signals (Gemini) "
            "from TimescaleDB, plus price history via yfinance."
        ),
        version="1.0.0",
        lifespan=lifespan,
        docs_url="/docs",
        redoc_url="/redoc",
    )

    # CORS — allows Next.js dev server (3000) and any configured origin
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["*"],
    )

    # Routers
    app.include_router(orders.router)
    app.include_router(signals.router)
    app.include_router(market.router)
    app.include_router(performance.router)
    app.include_router(settings_router.router)
    app.include_router(execution.router)

    @app.get("/health", tags=["health"])
    async def health():
        return {"status": "ok", "service": "catalyst-api"}

    @app.get("/health/pipeline", tags=["health"])
    async def health_pipeline():
        """Aggregate status for the Next.js navbar: API + DB + Java engine."""
        out: dict = {"api": "ok", "database": await ping_database(), "engine": "unknown"}

        try:
            async with httpx.AsyncClient(timeout=3.0) as client:
                r = await client.get(settings.engine_health_url)
                if r.status_code == 200:
                    body = r.json()
                    st = body.get("status") if isinstance(body, dict) else None
                    out["engine"] = str(st).upper() if st else "ok"
                else:
                    out["engine"] = "DOWN"
        except Exception:
            out["engine"] = "DOWN"

        ok = out["database"] == "ok" and out["engine"] in ("UP", "OK", "ok")
        out["ready"] = ok
        return out

    return app


app = create_app()
