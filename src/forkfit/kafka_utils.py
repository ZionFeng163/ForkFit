from __future__ import annotations

import json
import logging
from confluent_kafka import Producer, Consumer, KafkaError
from confluent_kafka.admin import AdminClient, NewTopic

logger = logging.getLogger(__name__)

_producers: dict[str, Producer] = {}


def get_producer(bootstrap_servers: str = "localhost:9092") -> Producer:
    if bootstrap_servers not in _producers:
        _producers[bootstrap_servers] = Producer({
            "bootstrap.servers": bootstrap_servers,
            "acks": "all",
            "enable.idempotence": True,
        })
    return _producers[bootstrap_servers]


def produce(topic: str, value: dict, key: str | None = None, bootstrap_servers: str = "localhost:9092") -> None:
    """Produce a JSON message to a Kafka topic."""
    producer = get_producer(bootstrap_servers)
    data = json.dumps(value, ensure_ascii=False).encode("utf-8")
    key_bytes = key.encode("utf-8") if key else None
    producer.produce(topic, value=data, key=key_bytes)
    producer.flush(timeout=5)


def create_consumer(
    bootstrap_servers: str,
    group_id: str,
    auto_offset_reset: str = "earliest",
) -> Consumer:
    """Create a Kafka consumer."""
    return Consumer({
        "bootstrap.servers": bootstrap_servers,
        "group.id": group_id,
        "auto.offset.reset": auto_offset_reset,
        "enable.auto.commit": False,
    })


def ensure_topic(
    bootstrap_servers: str,
    topic: str,
    *,
    partitions: int = 1,
) -> None:
    admin = AdminClient({"bootstrap.servers": bootstrap_servers})
    futures = admin.create_topics(
        [NewTopic(topic, num_partitions=partitions, replication_factor=1)]
    )
    try:
        futures[topic].result(timeout=10)
    except Exception as exc:
        error = getattr(exc, "args", [None])[0]
        if getattr(error, "code", lambda: None)() != KafkaError.TOPIC_ALREADY_EXISTS:
            raise
