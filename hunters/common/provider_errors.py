"""Fixed provider failure messages that are safe to include in public reports."""

_PROVIDERS = {
    "finviz": "Finviz",
    "barchart": "Barchart",
    "biopharm": "BioPharmCatalyst",
    "fmp": "FMP",
    "yahoo": "Yahoo Finance",
    "pdufa": "PDUFA.bio",
    "sec": "SEC EDGAR",
}
_ERRORS = {
    "http_error": "HTTP error",
    "access_challenge": "access verification required",
    "navigation_failed": "navigation returned no response",
    "navigation_timeout": "navigation did not finish before the deadline",
    "table_timeout": "data table did not load before the deadline",
    "table_schema": "expected data table columns are unavailable",
    "response_schema": "unexpected response format",
    "missing_configuration": "required API credentials are unavailable",
    "subscription_required": "catalyst details require provider account access",
    "deadline": "source lookup exceeded the scan deadline",
    "source_unavailable": "source data is unavailable",
    "invalid_session": "provided account session is unavailable or invalid",
    "stale_data": "calendar data is stale",
}
_CHALLENGE_MARKERS = (
    "in order to continue, we need to verify that you're not a robot",
    "verify you are human",
    "verify that you are human",
    "performing security verification",
)


class ProviderError(RuntimeError):
    """An allowlisted source/stage error, without request URLs or response bodies."""

    def __init__(self, provider: str, code: str, status: int | None = None):
        name = _PROVIDERS[provider]
        description = _ERRORS[code]
        self.provider = provider
        self.code = code
        self.status = status if isinstance(status, int) and 100 <= status <= 599 else None
        message = f"{name}: {description}"
        if self.status is not None:
            message += f" (HTTP {self.status})"
        super().__init__(message)


def check_browser_response(provider: str, response, visible_text: str | None = None) -> None:
    """Reject HTTP errors and rendered challenge messages, excluding dormant scripts."""
    if response is None:
        raise ProviderError(provider, "navigation_failed")
    status = getattr(response, "status", None)
    if isinstance(status, int) and status >= 400:
        raise ProviderError(provider, "http_error", status)
    if isinstance(visible_text, str) and any(
        marker in visible_text.lower() for marker in _CHALLENGE_MARKERS
    ):
        raise ProviderError(provider, "access_challenge")
