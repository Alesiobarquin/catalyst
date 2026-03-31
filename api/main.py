"""FastAPI application factory."""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api.config import settings
from api.db import lifespan
from api.routers import orders, signals, market


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
        allow_methods=["GET"],
        allow_headers=["*"],
    )

    # Routers
    app.include_router(orders.router)
    app.include_router(signals.router)
    app.include_router(market.router)

    @app.get("/health", tags=["health"])
    async def health():
        return {"status": "ok", "service": "catalyst-api"}

    return app


app = create_app()
