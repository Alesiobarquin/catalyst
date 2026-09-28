"""FastAPI application factory."""

import time

import httpx
from fastapi import FastAPI, Response
from fastapi.middleware.cors import CORSMiddleware

from api.config import settings
from api.db import get_pool_stats, lifespan, ping_database
from api.routers import execution, market, orders, performance, signals, testing
from api.routers import settings as settings_router

START_TIME = time.time()


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

    @app.middleware("http")
    async def add_security_headers(request, call_next):
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        return response

    # Routers
    app.include_router(orders.router)
    app.include_router(signals.router)
    app.include_router(market.router)
    app.include_router(performance.router)
    app.include_router(settings_router.router)
    app.include_router(execution.router)
    app.include_router(testing.router)

    @app.get("/metrics", tags=["telemetry"])
    async def metrics():
        """Prometheus-compatible plain text metrics endpoint."""
        uptime = round(time.time() - START_TIME, 2)
        pool = get_pool_stats()
        lines = [
            "# HELP catalyst_api_uptime_seconds Process uptime in seconds.",
            "# TYPE catalyst_api_uptime_seconds gauge",
            f"catalyst_api_uptime_seconds {uptime}",
            "# HELP catalyst_api_db_connections_total Total database pool connections.",
            "# TYPE catalyst_api_db_connections_total gauge",
            f"catalyst_api_db_connections_total {pool.get('size', 0)}",
            "# HELP catalyst_api_db_connections_idle Idle database pool connections.",
            "# TYPE catalyst_api_db_connections_idle gauge",
            f"catalyst_api_db_connections_idle {pool.get('idle', 0)}",
            "# HELP catalyst_api_db_connections_active Active database pool connections.",
            "# TYPE catalyst_api_db_connections_active gauge",
            f"catalyst_api_db_connections_active {pool.get('active', 0)}",
        ]
        return Response(content="\n".join(lines) + "\n", media_type="text/plain; version=0.0.4")

    @app.get("/health", tags=["health"])
    async def health():
        uptime = round(time.time() - START_TIME, 2)
        return {
            "status": "ok",
            "service": "catalyst-api",
            "version": "1.0.0",
            "uptime_seconds": uptime,
            "environment": settings.environment,
            "pool": get_pool_stats(),
        }

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
