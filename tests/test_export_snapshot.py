from unittest.mock import MagicMock

import pytest

from deploy import export_snapshot
from deploy.export_snapshot import GROUPS, pipeline_counts
from kafka import TopicPartition


@pytest.fixture
def broker(monkeypatch):
    monkeypatch.setenv("KAFKA_BOOTSTRAP_SERVERS", "unused:9092")
    factory = MagicMock()
    monkeypatch.setattr(export_snapshot, "KafkaConsumer", factory)
    monkeypatch.setattr(export_snapshot.time, "monotonic", MagicMock(side_effect=range(100)))
    monkeypatch.setattr(export_snapshot.time, "sleep", MagicMock())
    return factory


@pytest.mark.parametrize("partitions", [None, set()])
def test_pipeline_does_not_drain_without_topic_metadata(broker, partitions):
    consumer = broker.return_value
    consumer.partitions_for_topic.return_value = partitions
    consumer.end_offsets.return_value = {}

    with pytest.raises(RuntimeError, match="failed to drain"):
        pipeline_counts(timeout=4)

    consumer.end_offsets.assert_not_called()
    assert consumer.close.call_count == broker.call_count == 3 * len(GROUPS)


@pytest.mark.parametrize("missing_group", GROUPS)
def test_pipeline_retries_missing_metadata_until_three_stable_polls(broker, missing_group):
    consumers = []

    def connect(**kwargs):
        poll = len(consumers) // len(GROUPS)
        consumer = MagicMock()
        consumer.partitions_for_topic.return_value = (
            None if poll == 2 and kwargs["group_id"] == missing_group else {0}
        )
        consumer.end_offsets.side_effect = lambda partitions: dict.fromkeys(partitions, 3)
        consumer.committed.return_value = 3
        consumers.append(consumer)
        return consumer

    broker.side_effect = connect

    assert pipeline_counts(timeout=20) == dict.fromkeys(GROUPS.values(), 3)
    assert len(consumers) == 6 * len(GROUPS)
    for consumer in consumers:
        consumer.close.assert_called_once()


def test_pipeline_resets_stability_when_counts_change(broker):
    consumers = []
    offsets = [1, 1, 2, 2, 2]

    def connect(**_kwargs):
        end = offsets[len(consumers) // len(GROUPS)]
        consumer = MagicMock()
        consumer.partitions_for_topic.return_value = {0}
        consumer.end_offsets.side_effect = lambda partitions: dict.fromkeys(partitions, end)
        consumer.committed.return_value = end
        consumers.append(consumer)
        return consumer

    broker.side_effect = connect

    assert pipeline_counts(timeout=20) == dict.fromkeys(GROUPS.values(), 2)
    assert len(consumers) == 5 * len(GROUPS)
    for consumer in consumers:
        consumer.close.assert_called_once()


def test_pipeline_resets_stability_when_a_group_falls_behind(broker):
    consumer = broker.return_value
    consumer.partitions_for_topic.return_value = {0}
    consumer.end_offsets.side_effect = lambda partitions: dict.fromkeys(partitions, 3)
    # Two drained polls, one lagging engine, then three drained polls.
    consumer.committed.side_effect = [3] * 11 + [2] + [3] * 12

    assert pipeline_counts(timeout=20) == dict.fromkeys(GROUPS.values(), 3)
    assert consumer.close.call_count == broker.call_count == 6 * len(GROUPS)


def test_empty_topics_with_metadata_can_drain(broker):
    consumer = broker.return_value
    consumer.partitions_for_topic.return_value = {0, 1}
    consumer.end_offsets.side_effect = lambda partitions: dict.fromkeys(partitions, 0)
    consumer.committed.return_value = None

    assert pipeline_counts(timeout=20) == dict.fromkeys(GROUPS.values(), 0)
    assert consumer.close.call_count == broker.call_count == 3 * len(GROUPS)


@pytest.mark.parametrize("operation", ["partitions_for_topic", "end_offsets", "committed"])
def test_pipeline_closes_consumer_on_broker_error(broker, operation):
    consumer = broker.return_value
    consumer.partitions_for_topic.return_value = {0}
    consumer.end_offsets.return_value = {TopicPartition("raw-events", 0): 3}
    getattr(consumer, operation).side_effect = RuntimeError("broker unavailable")

    with pytest.raises(RuntimeError, match="broker unavailable"):
        pipeline_counts(timeout=20)

    consumer.close.assert_called_once()
