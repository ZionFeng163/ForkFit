"""Redis utilities for caching and rate limiting."""
from __future__ import annotations

import hashlib
import json
import time
from functools import wraps
from typing import Any, Callable

from redis import Redis


class RedisCache:
    """Simple Redis cache with TTL."""

    def __init__(self, redis: Redis, prefix: str = "cache", default_ttl: int = 3600) -> None:
        self._redis = redis
        self._prefix = prefix
        self._default_ttl = default_ttl

    def _key(self, namespace: str, key: str) -> str:
        return f"{self._prefix}:{namespace}:{key}"

    def get(self, namespace: str, key: str) -> Any | None:
        raw = self._redis.get(self._key(namespace, key))
        if raw is None:
            return None
        return json.loads(raw)

    def set(self, namespace: str, key: str, value: Any, ttl: int | None = None) -> None:
        self._redis.set(
            self._key(namespace, key),
            json.dumps(value, ensure_ascii=False),
            ex=ttl or self._default_ttl,
        )

    def invalidate(self, namespace: str, key: str) -> None:
        self._redis.delete(self._key(namespace, key))

    def invalidate_namespace(self, namespace: str) -> None:
        pattern = f"{self._prefix}:{namespace}:*"
        keys = self._redis.keys(pattern)
        if keys:
            self._redis.delete(*keys)

    def cached(self, namespace: str, ttl: int | None = None):
        """Decorator that caches function results."""
        def decorator(fn: Callable) -> Callable:
            @wraps(fn)
            def wrapper(*args, **kwargs):
                # Build cache key from function name + args
                key_parts = [fn.__qualname__] + [str(a) for a in args] + [f"{k}={v}" for k, v in sorted(kwargs.items())]
                cache_key = hashlib.md5("|".join(key_parts).encode()).hexdigest()

                result = self.get(namespace, cache_key)
                if result is not None:
                    return result

                result = fn(*args, **kwargs)
                if result is not None:
                    self.set(namespace, cache_key, result, ttl)
                return result
            return wrapper
        return decorator


class RateLimiter:
    """Sliding window rate limiter using Redis."""

    def __init__(self, redis: Redis, prefix: str = "ratelimit") -> None:
        self._redis = redis
        self._prefix = prefix

    def is_allowed(self, key: str, max_requests: int, window_seconds: int) -> tuple[bool, int]:
        """Check if request is allowed. Returns (allowed, remaining)."""
        now = time.time()
        redis_key = f"{self._prefix}:{key}"

        pipe = self._redis.pipeline()
        # Remove expired entries
        pipe.zremrangebyscore(redis_key, 0, now - window_seconds)
        # Count current entries
        pipe.zcard(redis_key)
        # Add current request
        pipe.zadd(redis_key, {str(now): now})
        # Set expiry
        pipe.expire(redis_key, window_seconds)
        results = pipe.execute()

        current_count = results[1]
        remaining = max(0, max_requests - current_count - 1)

        if current_count >= max_requests:
            # Remove the request we just added since it's over limit
            self._redis.zrem(redis_key, str(now))
            return False, 0

        return True, remaining


# Singleton instances (lazily initialized)
_cache: RedisCache | None = None
_rate_limiter: RateLimiter | None = None


def get_cache(redis_url: str | None = None) -> RedisCache | None:
    global _cache
    if _cache is not None:
        return _cache
    if not redis_url:
        return None
    try:
        redis = Redis.from_url(redis_url, decode_responses=True)
        redis.ping()
        _cache = RedisCache(redis)
        return _cache
    except Exception:
        return None


def get_rate_limiter(redis_url: str | None = None) -> RateLimiter | None:
    global _rate_limiter
    if _rate_limiter is not None:
        return _rate_limiter
    if not redis_url:
        return None
    try:
        redis = Redis.from_url(redis_url, decode_responses=True)
        redis.ping()
        _rate_limiter = RateLimiter(redis)
        return _rate_limiter
    except Exception:
        return None
