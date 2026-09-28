"""asyncpg connection pool — managed via FastAPI lifespan.

Why asyncpg?
  FastAPI is async-native. asyncpg is purpose-built for asyncio with direct
  C-extension performance. No thread pool overhead compared to psycopg2 + ThreadPool.
"""

import logging
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager

import asyncpg
from fastapi import FastAPI

from api.config import settings

logger = logging.getLogger("api.db")

_pool: asyncpg.Pool | None = None


async def init_pool() -> None:
    """Create the connection pool on startup and warm up initial connection."""
    global _pool
    _pool = await asyncpg.create_pool(
        dsn=settings.database_url,
        min_size=2,
        max_size=10,
        command_timeout=30,
    )
    try:
        async with _pool.acquire() as conn:
            await conn.fetchval("SELECT 1")
        logger.info("Database connection pool initialized and warmed up.")
    except Exception as exc:
        logger.warning("Database connection pool created; warmup ping deferred: %s", exc)


async def close_pool() -> None:
    """Gracefully close all connections on shutdown."""
    global _pool
    if _pool:
        await _pool.close()
        _pool = None


async def get_conn() -> AsyncGenerator[asyncpg.Connection, None]:
    """FastAPI dependency — yields a connection from the pool per request."""
    if _pool is None:
        raise RuntimeError("Connection pool not initialised")
    async with _pool.acquire() as conn:
        yield conn


async def ping_database() -> str:
    """Return ok | error | unavailable for /health/pipeline."""
    if _pool is None:
        return "unavailable"
    try:
        async with _pool.acquire() as conn:
            await conn.fetchval("SELECT 1")
        return "ok"
    except Exception:
        return "error"


async def ping_redis() -> str:
    """Return ok | error for /health/pipeline and telemetry."""
    try:
        import redis.asyncio as aioredis

        client = aioredis.Redis(
            host=settings.redis_host,
            port=settings.redis_port,
            password=settings.redis_password or None,
            db=settings.redis_db,
            socket_timeout=1.5,
            socket_connect_timeout=1.5,
        )
        try:
            pong = await client.ping()
            return "ok" if pong else "error"
        finally:
            await client.aclose()
    except Exception:
        return "error"


def get_pool_stats() -> dict[str, int]:
    """Return live connection pool metrics for health monitoring."""
    if _pool is None:
        return {"size": 0, "idle": 0, "max_size": 10, "min_size": 2}
    return {
        "size": _pool.get_size(),
        "idle": _pool.get_idle_size(),
        "max_size": _pool.get_max_size(),
        "min_size": _pool.get_min_size(),
    }


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifespan context manager wired into FastAPI app factory."""
    await init_pool()
    yield
    await close_pool()
