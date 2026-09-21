import sys
import unittest
import threading
import json
import urllib.request
import urllib.error
from http.server import ThreadingHTTPServer
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from admission import Admission
from server import make_handler


class AdmissionTests(unittest.TestCase):
    def test_http_busy_response_and_health_remain_available(self):
        gate = Admission(capacity=1)
        gate.acquire('other')
        calls = []
        httpd = ThreadingHTTPServer(('127.0.0.1', 0), make_handler(
            token_verifier=lambda _: {'uid': 'user'}, ocr=lambda _: calls.append('ocr'), admission=gate))
        worker = threading.Thread(target=httpd.serve_forever, daemon=True)
        worker.start()
        try:
            base = f'http://127.0.0.1:{httpd.server_port}'
            req = urllib.request.Request(base + '/v1/receipts:parse', data=b'image',
                headers={'Content-Type': 'image/jpeg', 'Origin': 'https://expense.771101.xyz'})
            with self.assertRaises(urllib.error.HTTPError) as error:
                urllib.request.urlopen(req, timeout=3)
            self.assertEqual(error.exception.code, 429)
            self.assertEqual(error.exception.headers['Retry-After'], '10')
            self.assertEqual(json.load(error.exception)['error'], 'ocr_busy')
            error.exception.close()
            self.assertEqual(calls, [])
            with urllib.request.urlopen(base + '/healthz', timeout=3) as reply:
                health = json.load(reply)
                self.assertEqual(health['status'], 'ok')
                self.assertIn('revision', health)
        finally:
            httpd.shutdown()
            httpd.server_close()
            worker.join(timeout=3)

    def test_ocr_failure_releases_admission_slot(self):
        gate = Admission(capacity=1)
        released = threading.Event()
        original_release = gate.release
        def release(uid):
            original_release(uid)
            released.set()
        gate.release = release
        def fail(_):
            raise RuntimeError('ocr_unavailable')
        httpd = ThreadingHTTPServer(('127.0.0.1', 0), make_handler(
            token_verifier=lambda _: {'uid': 'user'}, ocr=fail, admission=gate))
        worker = threading.Thread(target=httpd.serve_forever, daemon=True)
        worker.start()
        try:
            req = urllib.request.Request(f'http://127.0.0.1:{httpd.server_port}/v1/receipts:parse', data=b'image',
                headers={'Content-Type': 'image/jpeg', 'Origin': 'https://expense.771101.xyz'})
            for _ in range(2):
                released.clear()
                with self.assertRaises(urllib.error.HTTPError) as error:
                    urllib.request.urlopen(req, timeout=3)
                self.assertEqual(error.exception.code, 503)
                error.exception.close()
                self.assertTrue(released.wait(timeout=3))
            self.assertFalse(gate.active)
        finally:
            httpd.shutdown()
            httpd.server_close()
            worker.join(timeout=3)

    def test_capacity_and_duplicate_user_are_bounded(self):
        gate = Admission(capacity=2)
        self.assertIsNone(gate.acquire('a'))
        self.assertEqual(gate.acquire('a'), 'ocr_busy')
        self.assertIsNone(gate.acquire('b'))
        self.assertEqual(gate.acquire('c'), 'ocr_busy')
        gate.release('a')
        self.assertIsNone(gate.acquire('c'))

    def test_per_user_rate_limit_expires_and_idle_history_is_pruned(self):
        now = [0]
        gate = Admission(per_minute=2, clock=lambda: now[0])
        for _ in range(2):
            self.assertIsNone(gate.acquire('a'))
            gate.release('a')
        self.assertEqual(gate.acquire('a'), 'rate_limited')
        self.assertIsNone(gate.acquire('b'))
        gate.release('b')
        now[0] = 61
        self.assertIsNone(gate.acquire('a'))
        self.assertNotIn('b', gate.history)
