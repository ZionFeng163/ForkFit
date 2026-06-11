from __future__ import annotations

import json
import logging
import signal
import sys

from confluent_kafka import KafkaError

from forkfit.config import get_settings
from forkfit.kafka_utils import create_consumer, ensure_topic
from forkfit.workers.runner import run_forkfit_job

logger = logging.getLogger(__name__)

TOPIC = "forkfit-jobs"
GROUP_ID = "forkfit-workers"


def main() -> None:
    settings = get_settings()
    ensure_topic(settings.kafka_bootstrap_servers, TOPIC)
    consumer = create_consumer(
        bootstrap_servers=settings.kafka_bootstrap_servers,
        group_id=GROUP_ID,
        auto_offset_reset="earliest",
    )
    consumer.subscribe([TOPIC])
    logger.info("Kafka worker started, consuming from '%s'", TOPIC)

    running = True

    def shutdown(sig, frame):
        nonlocal running
        logger.info("Shutting down...")
        running = False

    signal.signal(signal.SIGINT, shutdown)
    signal.signal(signal.SIGTERM, shutdown)

    while running:
        msg = consumer.poll(timeout=1.0)
        if msg is None:
            continue
        if msg.error():
            if msg.error().code() == KafkaError._PARTITION_EOF:
                continue
            logger.error("Kafka error: %s", msg.error())
            continue

        data = {}
        try:
            data = json.loads(msg.value().decode("utf-8"))
            run_id = data["run_id"]
            logger.info("Processing job: %s", run_id)
            run_forkfit_job(
                run_id,
                data["user_profile"],
                data["meal_pack"],
                data.get("locale", "en"),
            )
            consumer.commit(msg)
            logger.info("Job completed: %s", run_id)
        except Exception:
            logger.exception("Job failed: %s", data.get("run_id", "unknown"))
            consumer.commit(msg)

    consumer.close()
    logger.info("Worker stopped.")


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(message)s")
    main()
