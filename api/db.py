"""asyncpg connection pool — managed via FastAPI lifespan.

Why asyncpg?
  FastAPI is async-native. asyncpg is purpose-built for asyncio with direct
  C-extension performance. No thread pool overhead compared to psycopg2 + ThreadPool.
"""

from contextlib import asynccontextmanager
from typing import AsyncGenerator

import asyncpg
from fastapi import FastAPI

from api.config import settings

_pool: asyncpg.Pool | None = None


async def init_pool() -> None:
    """Create the connection pool on startup."""
    global _pool
    _pool = await asyncpg.create_pool(
        dsn=settings.database_url,
        min_size=2,
        max_size=10,
        command_timeout=30,
    )


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


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifespan context manager wired into FastAPI app factory."""
    await init_pool()
    yield
    await close_pool()
