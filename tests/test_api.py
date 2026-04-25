"""API smoke tests for health and auth-protected routes."""

from collections.abc import AsyncGenerator

from fastapi.testclient import TestClient

import api.db as db
from api.main import create_app


async def _noop() -> None:
    return None


async def _dummy_conn() -> AsyncGenerator[None, None]:
    yield None


def make_test_client() -> TestClient:
    """Create app with DB lifespan and DB dependency patched out."""
    db.init_pool = _noop  # type: ignore[assignment]
    db.close_pool = _noop  # type: ignore[assignment]
    app = create_app()
    app.dependency_overrides[db.get_conn] = _dummy_conn
    return TestClient(app)


def test_health_endpoint_ok():
    with make_test_client() as client:
        res = client.get("/health")
    assert res.status_code == 200
    assert res.json()["status"] == "ok"


def test_executions_me_requires_bearer_token():
    with make_test_client() as client:
        res = client.get("/executions/me")
    assert res.status_code == 401
    assert "Bearer token required" in res.json()["detail"]
