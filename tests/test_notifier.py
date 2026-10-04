"""Unit tests for the Notification Service (Discord, Slack, Telegram dispatch)."""

from unittest.mock import MagicMock, patch

import httpx
import pytest

from notifier.dispatcher import (
    SignalNotificationDispatcher,
    build_discord_payload,
    build_slack_payload,
    build_telegram_message,
)
from notifier.main import NotifierService


@pytest.fixture
def sample_signal():
    return {
        "ticker": "NVDA",
        "catalyst_type": "SUPERNOVA",
        "conviction_score": 88,
        "entry_price": 125.0,
        "stop_loss": 115.0,
        "target_price": 150.0,
        "catalyst_summary": "Major institutional options sweep and short squeeze confluence.",
        "confluence_sources": ["squeeze", "whale"],
        "timestamp_utc": "2026-09-28T14:30:00Z",
    }


def test_build_discord_payload_high_conviction(sample_signal):
    payload = build_discord_payload(sample_signal, "http://localhost:3000")
    assert "embeds" in payload
    assert len(payload["embeds"]) == 1
    embed = payload["embeds"][0]

    assert "NVDA" in embed["title"]
    assert "SUPERNOVA" in embed["title"]
    # High conviction (88 >= 85) -> 0x10B981 (emerald)
    assert embed["color"] == 0x10B981

    fields = {f["name"]: f["value"] for f in embed["fields"]}
    assert "88/100" in fields["Conviction"]
    assert "$125.00" in fields["Entry Price"]
    assert "$150.00" in fields["Target Price"]
    assert "$115.00" in fields["Stop Loss"]
    assert "2.5:1" in fields["Risk / Reward"]
    assert "squeeze, whale" in fields["Confluence Sources"]


def test_build_discord_payload_color_tiers(sample_signal):
    # Tier 2: 70 <= score < 85 -> 0x38BDF8
    sample_signal["conviction_score"] = 75
    payload = build_discord_payload(sample_signal)
    assert payload["embeds"][0]["color"] == 0x38BDF8

    # Tier 3: score < 70 -> 0xF59E0B
    sample_signal["conviction_score"] = 65
    payload = build_discord_payload(sample_signal)
    assert payload["embeds"][0]["color"] == 0xF59E0B


def test_build_slack_payload(sample_signal):
    payload = build_slack_payload(sample_signal, "http://localhost:3000")
    assert "blocks" in payload
    assert len(payload["blocks"]) == 4

    header_block = payload["blocks"][0]
    assert "NVDA" in header_block["text"]["text"]

    actions_block = payload["blocks"][3]
    button = actions_block["elements"][0]
    assert button["url"] == "http://localhost:3000/signals"


def test_build_telegram_message(sample_signal):
    msg = build_telegram_message(sample_signal, "http://localhost:3000")
    assert "<b>Catalyst Alert: NVDA</b>" in msg
    assert "<b>Conviction:</b> 88/100" in msg
    assert "$125.00" in msg
    assert "$150.00" in msg
    assert "Open Catalyst Dashboard" in msg


def test_build_payloads_sell_action(sample_signal):
    sample_signal["action"] = "SELL"
    sample_signal["entry_price"] = 100.0
    sample_signal["stop_loss"] = 110.0  # risk = 110 - 100 = 10
    sample_signal["target_price"] = 80.0  # reward = 100 - 80 = 20 -> 2.0:1

    discord = build_discord_payload(sample_signal)
    fields = {f["name"]: f["value"] for f in discord["embeds"][0]["fields"]}
    assert fields["Action"] == "SELL"
    assert fields["Risk / Reward"] == "2.0:1"

    slack = build_slack_payload(sample_signal)
    slack_fields = {
        f["text"].split("\n")[0]: f["text"].split("\n")[1] for f in slack["blocks"][1]["fields"]
    }
    assert slack_fields["*Action:*"] == "SELL"
    assert slack_fields["*R:R Ratio:*"] == "2.0:1"

    telegram = build_telegram_message(sample_signal)
    assert "<b>Action:</b> SELL" in telegram
    assert "<b>R:R:</b> 2.0:1" in telegram


def test_dispatcher_drops_below_conviction_threshold(sample_signal):
    mock_client = MagicMock(spec=httpx.Client)
    dispatcher = SignalNotificationDispatcher(
        min_conviction=70,
        discord_webhook="https://discord.com/api/webhooks/test",
        client=mock_client,
    )

    sample_signal["conviction_score"] = 65
    results = dispatcher.dispatch(sample_signal)

    assert results == {"discord": False, "slack": False, "telegram": False}
    assert mock_client.post.call_count == 0


def test_dispatcher_success_discord(sample_signal):
    mock_client = MagicMock(spec=httpx.Client)
    mock_response = MagicMock(spec=httpx.Response)
    mock_response.status_code = 204
    mock_client.post.return_value = mock_response

    dispatcher = SignalNotificationDispatcher(
        min_conviction=70,
        discord_webhook="https://discord.com/api/webhooks/test",
        client=mock_client,
    )

    results = dispatcher.dispatch(sample_signal)
    assert results["discord"] is True
    assert mock_client.post.call_count == 1


def test_dispatcher_discord_rate_limit_retry(sample_signal):
    mock_client = MagicMock(spec=httpx.Client)
    # First response: 429 rate limit with Retry-After: 0.01
    rate_limit_resp = MagicMock(spec=httpx.Response)
    rate_limit_resp.status_code = 429
    rate_limit_resp.headers = {"Retry-After": "0.01"}

    # Second response: 200 success
    success_resp = MagicMock(spec=httpx.Response)
    success_resp.status_code = 200

    mock_client.post.side_effect = [rate_limit_resp, success_resp]

    dispatcher = SignalNotificationDispatcher(
        min_conviction=70,
        discord_webhook="https://discord.com/api/webhooks/test",
        client=mock_client,
    )

    with patch("time.sleep") as mock_sleep:
        results = dispatcher.dispatch(sample_signal)
        assert results["discord"] is True
        assert mock_client.post.call_count == 2
        mock_sleep.assert_called_with(0.01)


def test_dispatcher_slack_and_telegram(sample_signal):
    mock_client = MagicMock(spec=httpx.Client)
    mock_response = MagicMock(spec=httpx.Response)
    mock_response.status_code = 200
    mock_client.post.return_value = mock_response

    dispatcher = SignalNotificationDispatcher(
        min_conviction=70,
        discord_webhook="",
        slack_webhook="https://hooks.slack.com/services/test",
        telegram_token="12345:ABCDE",
        telegram_chat_id="-100987654",
        client=mock_client,
    )

    results = dispatcher.dispatch(sample_signal)
    assert results["discord"] is False
    assert results["slack"] is True
    assert results["telegram"] is True
    assert mock_client.post.call_count == 2


def test_notifier_service_run_and_commit(sample_signal):
    mock_dispatcher = MagicMock(spec=SignalNotificationDispatcher)
    mock_dispatcher.min_conviction = 70

    msg = MagicMock()
    msg.value = sample_signal

    mock_consumer = MagicMock()
    mock_consumer.__iter__.return_value = [msg]

    with patch("notifier.main.KafkaConsumer", return_value=mock_consumer):
        service = NotifierService(dispatcher=mock_dispatcher)
        service.run()

    mock_dispatcher.dispatch.assert_called_once_with(sample_signal)
    mock_consumer.commit.assert_called_once()


def test_notifier_service_error_resilience(sample_signal):
    mock_dispatcher = MagicMock(spec=SignalNotificationDispatcher)
    mock_dispatcher.min_conviction = 70
    mock_dispatcher.dispatch.side_effect = RuntimeError("Webhook timeout")

    msg = MagicMock()
    msg.value = sample_signal

    mock_consumer = MagicMock()
    mock_consumer.__iter__.return_value = [msg]

    with patch("notifier.main.KafkaConsumer", return_value=mock_consumer):
        service = NotifierService(dispatcher=mock_dispatcher)
        # Should catch error, log it, and not crash
        service.run()

    mock_consumer.commit.assert_called_once()
