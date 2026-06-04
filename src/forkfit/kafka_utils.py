from __future__ import annotations

import json
import logging
from confluent_kafka import Producer, Consumer, KafkaError

logger = logging.getLogger(__name__)

# Singleton producer
_producer: Producer | None = None


def get_producer(bootstrap_servers: str = "localhost:9092") -> Producer:
    global _producer
    if _producer is None:
        _producer = Producer({
            "bootstrap.servers": bootstrap_servers,
            "acks": "all",
            "enable.idempotence": True,
        })
    return _producer


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
