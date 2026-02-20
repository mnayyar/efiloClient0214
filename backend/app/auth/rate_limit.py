"""In-memory rate limiter (disabled in development)."""

import time

from app.config import get_settings


class RateLimiter:
    """Simple sliding-window rate limiter backed by a dict."""

    def __init__(self, max_requests: int, window_seconds: int) -> None:
        self.max_requests = max_requests
        self.window_seconds = window_seconds
        self._store: dict[str, tuple[int, float]] = {}

    def check(self, key: str) -> bool:
        """Return True if the request is allowed, False if rate-limited."""
        settings = get_settings()
        if settings.is_development:
            return True

        now = time.time()
        if key in self._store:
            count, reset_at = self._store[key]
            if now > reset_at:
                # Window expired — reset
                self._store[key] = (1, now + self.window_seconds)
                return True
            if count >= self.max_requests:
                return False
            self._store[key] = (count + 1, reset_at)
            return True

        self._store[key] = (1, now + self.window_seconds)
        return True


# Shared instances matching the Next.js rate limits
rate_limit_general = RateLimiter(max_requests=1000, window_seconds=3600)  # 1000/hr
rate_limit_search = RateLimiter(max_requests=30, window_seconds=60)  # 30/min
