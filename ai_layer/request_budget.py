"""Persistent request cap. Reserve before network calls; failed attempts count too."""

import json
import os
from datetime import datetime, timezone
from pathlib import Path


def reserve_request() -> None:
    limit = int(os.getenv("AI_DAILY_REQUEST_LIMIT", "0"))
    if limit <= 0:
        return
    path = Path(os.getenv("AI_BUDGET_FILE", "/app/state/ai-budget.json"))
    path.parent.mkdir(parents=True, exist_ok=True)
    day = datetime.now(timezone.utc).date().isoformat()
    state = json.loads(path.read_text()) if path.exists() else {}
    count = state.get("count", 0) if state.get("day") == day else 0
    if count >= limit:
        raise RuntimeError("Daily AI request budget exhausted")
    temporary = path.with_suffix(".tmp")
    temporary.write_text(json.dumps({"day": day, "count": count + 1}))
    temporary.replace(path)
