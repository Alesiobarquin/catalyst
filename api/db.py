"""asyncpg connection pool — managed via FastAPI lifespan.

Why asyncpg?
  FastAPI is async-native. asyncpg is purpose-built for asyncio with direct
  C-extension performance. No thread pool overhead compared to psycopg2 + ThreadPool.
"""

import logging
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager, suppress
from typing import Any

import asyncpg
from fastapi import FastAPI

from api.config import settings

logger = logging.getLogger("api.db")

_pool: asyncpg.Pool | None = None
_redis_client: Any | None = None


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
    except (asyncpg.PostgresError, OSError, TimeoutError) as exc:
        logger.warning("Database connection pool created; warmup ping deferred: %s", exc)


async def close_pool() -> None:
    """Gracefully close all connections on shutdown."""
    global _pool
    if _pool:
        await _pool.close()
        _pool = None


async def init_redis() -> None:
    """Initialize persistent Redis client on startup."""
    global _redis_client
    if _redis_client is None:
        try:
            import redis.asyncio as aioredis

            _redis_client = aioredis.Redis(
                host=settings.redis_host,
                port=settings.redis_port,
                password=settings.redis_password or None,
                db=settings.redis_db,
                socket_timeout=1.5,
                socket_connect_timeout=1.5,
            )
        except (ConnectionError, TimeoutError, OSError) as exc:
            logger.warning("Redis persistent client creation deferred: %s", exc)


async def close_redis() -> None:
    """Close persistent Redis client on shutdown."""
    global _redis_client
    if _redis_client is not None:
        with suppress(ConnectionError, TimeoutError, OSError):
            await _redis_client.aclose()
        _redis_client = None


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
    except (asyncpg.PostgresError, OSError, TimeoutError):
        return "error"
    except Exception:
        return "error"


async def ping_redis() -> str:
    """Return ok | error for /health/pipeline and telemetry."""
    global _redis_client
    if _redis_client is not None:
        try:
            pong = await _redis_client.ping()
            return "ok" if pong else "error"
        except (ConnectionError, TimeoutError, OSError) as exc:
            logger.debug("Redis ping failed via persistent client: %s", exc)
            return "error"
        except Exception:
            return "error"

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
    except (ConnectionError, TimeoutError, OSError) as exc:
        logger.debug("Redis ping failed via transient client: %s", exc)
        return "error"
    except Exception:
        return "error"


def get_pool_stats() -> dict[str, int]:
    """Return live connection pool metrics for health monitoring."""
    if _pool is None:
        return {"size": 0, "idle": 0, "active": 0, "max_size": 10, "min_size": 2}
    size = _pool.get_size()
    idle = _pool.get_idle_size()
    return {
        "size": size,
        "idle": idle,
        "active": size - idle,
        "max_size": _pool.get_max_size(),
        "min_size": _pool.get_min_size(),
    }


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifespan context manager wired into FastAPI app factory."""
    await init_pool()
    await init_redis()
    try:
        yield
    finally:
        await close_redis()
        await close_pool()
