"""User settings (Alpaca API keys stored per Clerk user)."""

from fastapi import APIRouter, Depends
import asyncpg
from pydantic import BaseModel, Field

from api.auth import require_clerk_user
from api.db import get_conn

router = APIRouter(prefix="/settings", tags=["settings"])


class AlpacaKeysIn(BaseModel):
    api_key: str = Field(..., min_length=8)
    secret_key: str = Field(..., min_length=8)


class AlpacaStatusOut(BaseModel):
    has_keys: bool


@router.get("/alpaca", response_model=AlpacaStatusOut)
async def alpaca_status(
    _user: dict = Depends(require_clerk_user),
    conn: asyncpg.Connection = Depends(get_conn),
):
    uid = _user["sub"]
    row = await conn.fetchrow(
        "SELECT 1 FROM user_alpaca_keys WHERE clerk_user_id = $1",
        uid,
    )
    return AlpacaStatusOut(has_keys=row is not None)


@router.post("/alpaca")
async def save_alpaca_keys(
    body: AlpacaKeysIn,
    _user: dict = Depends(require_clerk_user),
    conn: asyncpg.Connection = Depends(get_conn),
):
    uid = _user["sub"]
    await conn.execute(
        """
        INSERT INTO user_alpaca_keys (clerk_user_id, api_key, secret_key, updated_at)
        VALUES ($1, $2, $3, NOW())
        ON CONFLICT (clerk_user_id) DO UPDATE SET
            api_key = EXCLUDED.api_key,
            secret_key = EXCLUDED.secret_key,
            updated_at = NOW()
        """,
        uid,
        body.api_key.strip(),
        body.secret_key.strip(),
    )
    return {"ok": True}
