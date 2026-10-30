"""Persistent request cap. Reserve before network calls; failed attempts count too."""

import json
import os
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

# Budget days follow the market's timezone so one trading day never spans two budgets.
BUDGET_TZ = ZoneInfo("America/New_York")


class BudgetExhaustedError(RuntimeError):
    """The daily request cap is used up; no further attempt can succeed today."""


def reserve_request() -> None:
    limit = int(os.getenv("AI_DAILY_REQUEST_LIMIT", "0"))
    if limit <= 0:
        return
    path = Path(os.getenv("AI_BUDGET_FILE", "/app/state/ai-budget.json"))
    path.parent.mkdir(parents=True, exist_ok=True)
    day = datetime.now(BUDGET_TZ).date().isoformat()
    state = json.loads(path.read_text()) if path.exists() else {}
    count = state.get("count", 0) if state.get("day") == day else 0
    if count >= limit:
        raise BudgetExhaustedError("Daily AI request budget exhausted")
    temporary = path.with_suffix(".tmp")
    temporary.write_text(json.dumps({"day": day, "count": count + 1}))
    temporary.replace(path)
