"""Bounded, read-only HTTP capacity check inside the disposable E2E backend."""
from __future__ import annotations

import argparse
import collections
import concurrent.futures
import http.client
import json
import os
import time


def descriptors() -> int:
    return len(os.listdir("/proc/1/fd"))


def request(connection: http.client.HTTPConnection, path: str = "/posts?limit=1") -> int:
    connection.request("GET", path)
    response = connection.getresponse()
    response.read()
    return response.status


def worker(_: int) -> list[int]:
    connection = http.client.HTTPConnection("127.0.0.1", 8000, timeout=15)
    try:
        return [request(connection) for _ in range(20)]
    finally:
        connection.close()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--soak-seconds", type=int, default=0, choices=range(0, 301), metavar="0..300")
    args = parser.parse_args()
    if os.environ.get("APP_ENV") != "test" or not os.path.exists("/.dockerenv"):
        raise SystemExit("Only run inside the disposable APP_ENV=test Docker backend.")
    baseline = descriptors()
    with concurrent.futures.ThreadPoolExecutor(max_workers=32) as pool:
        statuses = collections.Counter(status for group in pool.map(worker, range(64)) for status in group)
    time.sleep(6)
    after_reads = descriptors()
    overload: collections.Counter[int] = collections.Counter()
    connections = []
    try:
        for _ in range(160):
            connection = http.client.HTTPConnection("127.0.0.1", 8000, timeout=15)
            connections.append(connection)
            overload[request(connection, "/healthz")] += 1
    finally:
        for connection in connections:
            connection.close()
    time.sleep(6)
    samples = []
    deadline = time.monotonic() + args.soak_seconds
    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
        while time.monotonic() < deadline:
            results = [status for group in pool.map(worker, range(8)) for status in group]
            if set(results) != {200}:
                raise RuntimeError(f"Sustained read failures: {collections.Counter(results)}")
            samples.append(descriptors())
            time.sleep(1)
    connection = http.client.HTTPConnection("127.0.0.1", 8000, timeout=15)
    try:
        recovery = request(connection, "/healthz")
    finally:
        connection.close()
    time.sleep(6)
    final = descriptors()
    print(json.dumps(dict(read_requests=dict(statuses), overload=dict(overload), recovery=recovery,
                          fd_baseline=baseline, fd_after_reads=after_reads, fd_final=final,
                          soak_seconds=args.soak_seconds, soak_rounds=len(samples),
                          soak_fd_range=[min(samples), max(samples)] if samples else [])))
    if statuses != {200: 1280} or not overload[503] or set(overload) - {200, 503}:
        raise SystemExit("Unexpected response or missing overload protection")
    if recovery != 200 or final > baseline + 12:
        raise SystemExit("Service did not recover or descriptors did not return to baseline")


if __name__ == "__main__":
    main()
