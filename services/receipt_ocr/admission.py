"""Bounded in-process admission: no unbounded OCR queue or per-user overlap."""
import threading
import time


class Admission:
    def __init__(self, capacity=2, per_minute=6, clock=time.monotonic):
        self.capacity = capacity
        self.per_minute = per_minute
        self.clock = clock
        self.active = set()
        self.history = {}
        self.lock = threading.Lock()

    def acquire(self, uid):
        with self.lock:
            now = self.clock()
            self.history = {key: [t for t in values if now - t < 60]
                            for key, values in self.history.items() if values and now - values[-1] < 60}
            if uid in self.active or len(self.active) >= self.capacity:
                return 'ocr_busy'
            if len(self.history.get(uid, [])) >= self.per_minute:
                return 'rate_limited'
            self.history.setdefault(uid, []).append(now)
            self.active.add(uid)
            return None

    def release(self, uid):
        with self.lock:
            self.active.discard(uid)
