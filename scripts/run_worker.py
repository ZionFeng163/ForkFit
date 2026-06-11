from __future__ import annotations

import logging

from forkfit.workers.kafka_consumer import main


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    main()
