"""Notification dispatcher for real-time market catalyst alerts."""

from __future__ import annotations

import logging
import time
from typing import Any

import httpx

from notifier.config import (
    DASHBOARD_URL,
    DISCORD_WEBHOOK_URL,
    MIN_CONVICTION_THRESHOLD,
    SLACK_WEBHOOK_URL,
    TELEGRAM_BOT_TOKEN,
    TELEGRAM_CHAT_ID,
)

logger = logging.getLogger("notifier.dispatcher")


def build_discord_payload(
    signal: dict[str, Any], dashboard_url: str = DASHBOARD_URL
) -> dict[str, Any]:
    """Build a rich Discord embed matching Catalyst aesthetic."""
    ticker = (signal.get("ticker") or "UNKNOWN").upper()
    cat_type = (signal.get("catalyst_type") or "CATALYST").upper()
    conviction = int(signal.get("conviction_score") or 0)
    entry = float(signal.get("entry_price") or signal.get("price") or 0.0)
    stop = float(signal.get("stop_loss") or 0.0)
    target = float(signal.get("target_price") or 0.0)
    thesis = (
        signal.get("catalyst_summary")
        or signal.get("thesis")
        or "Multi-factor market confluence detected."
    )
    confluence_sources = signal.get("confluence_sources") or []
    if isinstance(confluence_sources, list):
        sources_str = ", ".join(confluence_sources) if confluence_sources else "Automated Scrapers"
    else:
        sources_str = str(confluence_sources)

    # Color coding
    if conviction >= 85:
        color = 0x10B981  # Emerald green
    elif conviction >= 70:
        color = 0x38BDF8  # Cyan/Sky blue
    else:
        color = 0xF59E0B  # Amber

    action = str(signal.get("action") or "BUY").upper()

    fields = [
        {"name": "Conviction", "value": f"**{conviction}/100**", "inline": True},
        {"name": "Action", "value": action, "inline": True},
        {
            "name": "Entry Price",
            "value": f"${entry:.2f}" if entry > 0 else "Market",
            "inline": True,
        },
    ]

    if target > 0 and stop > 0:
        if action == "SELL":
            risk = stop - entry
            reward = entry - target
        else:
            risk = entry - stop
            reward = target - entry

        rr_str = f"{reward / risk:.1f}:1" if risk > 0 else "—"
        fields.extend(
            [
                {"name": "Target Price", "value": f"${target:.2f}", "inline": True},
                {"name": "Stop Loss", "value": f"${stop:.2f}", "inline": True},
                {"name": "Risk / Reward", "value": rr_str, "inline": True},
            ]
        )

    fields.append({"name": "Confluence Sources", "value": sources_str, "inline": False})
    fields.append({"name": "Analysis & Thesis", "value": thesis[:1000], "inline": False})

    return {
        "username": "Catalyst Market Intelligence",
        "avatar_url": "https://raw.githubusercontent.com/Alesiobarquin/catalyst/main/frontend/public/favicon.ico",
        "embeds": [
            {
                "title": f"🎯 High-Conviction Catalyst: {ticker} ({cat_type})",
                "url": f"{dashboard_url.rstrip('/')}/signals",
                "description": f"New validated investment thesis generated for **{ticker}**.",
                "color": color,
                "fields": fields,
                "footer": {
                    "text": "Catalyst Autonomous Quantitative Pipeline • Half-Kelly Risk Managed",
                },
                "timestamp": signal.get("timestamp_utc"),
            }
        ],
    }


def build_slack_payload(
    signal: dict[str, Any], dashboard_url: str = DASHBOARD_URL
) -> dict[str, Any]:
    """Build a Slack Block Kit message."""
    ticker = (signal.get("ticker") or "UNKNOWN").upper()
    cat_type = (signal.get("catalyst_type") or "CATALYST").upper()
    conviction = int(signal.get("conviction_score") or 0)
    action = str(signal.get("action") or "BUY").upper()
    entry = float(signal.get("entry_price") or signal.get("price") or 0.0)
    stop = float(signal.get("stop_loss") or 0.0)
    target = float(signal.get("target_price") or 0.0)
    thesis = signal.get("catalyst_summary") or signal.get("thesis") or "Confluence detected."

    fields = [
        {"type": "mrkdwn", "text": f"*Conviction:*\n{conviction}/100"},
        {"type": "mrkdwn", "text": f"*Action:*\n{action}"},
        {
            "type": "mrkdwn",
            "text": f"*Entry Price:*\n${entry:.2f}" if entry > 0 else "*Entry Price:*\nMarket",
        },
    ]
    if target > 0 and stop > 0:
        if action == "SELL":
            risk = stop - entry
            reward = entry - target
        else:
            risk = entry - stop
            reward = target - entry
        rr_str = f"{reward / risk:.1f}:1" if risk > 0 else "—"
        fields.append({"type": "mrkdwn", "text": f"*R:R Ratio:*\n{rr_str}"})

    return {
        "text": f"🎯 Catalyst Alert: {ticker} ({cat_type}) - Conviction {conviction}/100",
        "blocks": [
            {
                "type": "header",
                "text": {
                    "type": "plain_text",
                    "text": f"🎯 Catalyst Alert: {ticker} ({cat_type})",
                    "emoji": True,
                },
            },
            {
                "type": "section",
                "fields": fields,
            },
            {
                "type": "section",
                "text": {
                    "type": "mrkdwn",
                    "text": f"*Thesis:*\n{thesis[:500]}",
                },
            },
            {
                "type": "actions",
                "elements": [
                    {
                        "type": "button",
                        "text": {"type": "plain_text", "text": "View in Dashboard"},
                        "url": f"{dashboard_url.rstrip('/')}/signals",
                    }
                ],
            },
        ],
    }


def build_telegram_message(signal: dict[str, Any], dashboard_url: str = DASHBOARD_URL) -> str:
    """Build an HTML formatted Telegram message."""
    ticker = (signal.get("ticker") or "UNKNOWN").upper()
    cat_type = (signal.get("catalyst_type") or "CATALYST").upper()
    conviction = int(signal.get("conviction_score") or 0)
    action = str(signal.get("action") or "BUY").upper()
    entry = float(signal.get("entry_price") or signal.get("price") or 0.0)
    target = float(signal.get("target_price") or 0.0)
    stop = float(signal.get("stop_loss") or 0.0)
    thesis = signal.get("catalyst_summary") or signal.get("thesis") or "Confluence detected."

    lines = [
        f"🎯 <b>Catalyst Alert: {ticker}</b> ({cat_type})",
        f"<b>Conviction:</b> {conviction}/100 | <b>Action:</b> {action}",
        f"<b>Entry Price:</b> ${entry:.2f}" if entry > 0 else "<b>Entry Price:</b> Market",
    ]
    if target > 0 and stop > 0:
        if action == "SELL":
            risk = stop - entry
            reward = entry - target
        else:
            risk = entry - stop
            reward = target - entry
        rr_str = f"{reward / risk:.1f}:1" if risk > 0 else "—"
        lines.append(
            f"<b>Target:</b> ${target:.2f} | <b>Stop:</b> ${stop:.2f} | <b>R:R:</b> {rr_str}"
        )

    lines.append(f"\n<b>Thesis:</b>\n{thesis[:400]}")
    lines.append(f"\n<a href='{dashboard_url.rstrip('/')}/signals'>Open Catalyst Dashboard</a>")
    return "\n".join(lines)


class SignalNotificationDispatcher:
    """Dispatches validated signals to configured notification channels."""

    def __init__(
        self,
        min_conviction: int = MIN_CONVICTION_THRESHOLD,
        discord_webhook: str = DISCORD_WEBHOOK_URL,
        slack_webhook: str = SLACK_WEBHOOK_URL,
        telegram_token: str = TELEGRAM_BOT_TOKEN,
        telegram_chat_id: str = TELEGRAM_CHAT_ID,
        dashboard_url: str = DASHBOARD_URL,
        client: httpx.Client | None = None,
    ):
        self.min_conviction = min_conviction
        self.discord_webhook = discord_webhook
        self.slack_webhook = slack_webhook
        self.telegram_token = telegram_token
        self.telegram_chat_id = telegram_chat_id
        self.dashboard_url = dashboard_url
        self._client = client

    def _get_client(self) -> httpx.Client:
        return self._client if self._client is not None else httpx.Client(timeout=10.0)

    def dispatch(self, signal: dict[str, Any]) -> dict[str, bool]:
        """Dispatch signal to all configured channels if conviction threshold is met."""
        conviction = int(signal.get("conviction_score") or 0)
        ticker = signal.get("ticker", "UNKNOWN")

        if conviction < self.min_conviction:
            logger.debug(
                "Skipping alert for %s: conviction %d < threshold %d",
                ticker,
                conviction,
                self.min_conviction,
            )
            return {"discord": False, "slack": False, "telegram": False}

        results = {}
        client = self._get_client()
        try:
            # Discord dispatch
            if self.discord_webhook:
                results["discord"] = self.send_discord(signal, client=client)
            else:
                results["discord"] = False

            # Slack dispatch
            if self.slack_webhook:
                results["slack"] = self.send_slack(signal, client=client)
            else:
                results["slack"] = False

            # Telegram dispatch
            if self.telegram_token and self.telegram_chat_id:
                results["telegram"] = self.send_telegram(signal, client=client)
            else:
                results["telegram"] = False

        finally:
            if self._client is None:
                client.close()

        logger.info(
            "Dispatched alert for %s (conviction=%d): %s",
            ticker,
            conviction,
            results,
        )
        return results

    def send_discord(self, signal: dict[str, Any], client: httpx.Client | None = None) -> bool:
        """Send rich embed to Discord webhook with rate limit backoff."""
        if not self.discord_webhook:
            return False

        http = client or self._get_client()
        payload = build_discord_payload(signal, self.dashboard_url)

        for attempt in range(1, 4):
            try:
                res = http.post(self.discord_webhook, json=payload)
                if res.status_code in (200, 204):
                    return True
                if res.status_code == 429:
                    retry_after = float(res.headers.get("Retry-After", 1.0))
                    logger.warning("Discord 429 rate limit. Retrying after %.2fs", retry_after)
                    time.sleep(retry_after)
                    continue
                logger.warning("Discord webhook returned status %d: %s", res.status_code, res.text)
                return False
            except (httpx.HTTPError, OSError) as exc:
                logger.warning("Discord dispatch attempt %d failed: %s", attempt, exc)
                time.sleep(0.5 * attempt)
        return False

    def send_slack(self, signal: dict[str, Any], client: httpx.Client | None = None) -> bool:
        """Send message to Slack webhook."""
        if not self.slack_webhook:
            return False

        http = client or self._get_client()
        payload = build_slack_payload(signal, self.dashboard_url)

        try:
            res = http.post(self.slack_webhook, json=payload)
            return res.status_code == 200
        except (httpx.HTTPError, OSError) as exc:
            logger.warning("Slack dispatch failed: %s", exc)
            return False

    def send_telegram(self, signal: dict[str, Any], client: httpx.Client | None = None) -> bool:
        """Send HTML message via Telegram Bot API."""
        if not self.telegram_token or not self.telegram_chat_id:
            return False

        http = client or self._get_client()
        url = f"https://api.telegram.org/bot{self.telegram_token}/sendMessage"
        text = build_telegram_message(signal, self.dashboard_url)
        payload = {
            "chat_id": self.telegram_chat_id,
            "text": text,
            "parse_mode": "HTML",
            "disable_web_page_preview": False,
        }

        try:
            res = http.post(url, json=payload)
            return res.status_code == 200
        except (httpx.HTTPError, OSError) as exc:
            logger.warning("Telegram dispatch failed: %s", exc)
            return False
