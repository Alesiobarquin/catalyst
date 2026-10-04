"""User settings (Alpaca API keys stored per Clerk user)."""

import logging
import os

import asyncpg
import httpx
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from api.auth import require_clerk_user
from api.db import get_conn

logger = logging.getLogger("api.settings")
router = APIRouter(prefix="/settings", tags=["settings"])

ALPACA_PAPER_BASE = os.getenv("ALPACA_PAPER_BASE", "https://paper-api.alpaca.markets")


class AlpacaKeysIn(BaseModel):
    api_key: str = Field(..., min_length=8)
    secret_key: str = Field(..., min_length=8)
    validate_credentials: bool = Field(
        default=True,
        description="Verify credentials against Alpaca Paper account API before saving",
    )


class AlpacaStatusOut(BaseModel):
    has_keys: bool


async def verify_alpaca_credentials(
    api_key: str,
    secret_key: str,
    base_url: str = ALPACA_PAPER_BASE,
) -> tuple[bool, str | None]:
    """Test credentials against Alpaca /v2/account endpoint.

    Returns (True, None) if authenticated, or (False, error_message).
    """
    headers = {
        "APCA-API-KEY-ID": api_key.strip(),
        "APCA-API-SECRET-KEY": secret_key.strip(),
    }
    url = f"{base_url.rstrip('/')}/v2/account"
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(url, headers=headers)
            if resp.status_code == 200:
                return True, None
            if resp.status_code in (401, 403):
                return False, "Invalid Alpaca API Key ID or Secret Key (authentication failed)"
            return False, f"Alpaca API verification returned HTTP {resp.status_code}"
    except httpx.RequestError as exc:
        logger.warning("Alpaca credentials verification network error: %s", exc)
        return False, f"Unable to reach Alpaca verification endpoint: {exc}"


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
    api_key = body.api_key.strip()
    secret_key = body.secret_key.strip()

    if body.validate_credentials:
        is_valid, err_msg = await verify_alpaca_credentials(api_key, secret_key)
        if not is_valid:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=err_msg or "Invalid Alpaca credentials",
            )

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
        api_key,
        secret_key,
    )
    return {"ok": True, "validated": body.validate_credentials}


@router.delete("/alpaca")
async def delete_alpaca_keys(
    _user: dict = Depends(require_clerk_user),
    conn: asyncpg.Connection = Depends(get_conn),
):
    """Disconnect and delete stored Alpaca API keys for the current user."""
    uid = _user["sub"]
    await conn.execute("DELETE FROM user_alpaca_keys WHERE clerk_user_id = $1", uid)
    return {"ok": True}
