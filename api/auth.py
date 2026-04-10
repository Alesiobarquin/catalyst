"""Verify Clerk session JWTs (Bearer tokens from @clerk/nextjs getToken())."""

from __future__ import annotations

import logging
from typing import Any

import jwt
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jwt import PyJWKClient

from api.config import settings

logger = logging.getLogger(__name__)

_bearer = HTTPBearer(auto_error=False)
_jwks_client: PyJWKClient | None = None


def _get_jwks_client() -> PyJWKClient:
    global _jwks_client
    if _jwks_client is None:
        if not settings.clerk_jwks_url:
            raise HTTPException(status_code=503, detail="Clerk JWKS URL not configured")
        _jwks_client = PyJWKClient(settings.clerk_jwks_url)
    return _jwks_client


def verify_clerk_token(token: str) -> dict[str, Any]:
    """Decode and validate a Clerk session JWT. Returns claims including `sub` (user id)."""
    if not settings.clerk_enabled:
        raise HTTPException(status_code=503, detail="Clerk is not configured on the API")
    try:
        jwks = _get_jwks_client()
        key = jwks.get_signing_key_from_jwt(token)
        payload = jwt.decode(
            token,
            key.key,
            algorithms=["RS256"],
            issuer=settings.clerk_issuer,
            options={"verify_aud": False},
        )
        return payload
    except jwt.exceptions.InvalidTokenError as e:
        logger.warning("Invalid Clerk token: %s", e)
        raise HTTPException(status_code=401, detail="Invalid or expired session") from e


async def require_clerk_user(
    creds: HTTPAuthorizationCredentials | None = Depends(_bearer),
) -> dict[str, Any]:
    if creds is None or creds.scheme.lower() != "bearer":
        raise HTTPException(status_code=401, detail="Authorization Bearer token required")
    return verify_clerk_token(creds.credentials)
