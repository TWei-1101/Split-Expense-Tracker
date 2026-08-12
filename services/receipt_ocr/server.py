"""Local-only receipt OCR API protected by Firebase ID tokens."""
from __future__ import annotations

import json
import os
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from tempfile import NamedTemporaryFile

from parser import parse_receipt_text

MAX_IMAGE_BYTES = 8 * 1024 * 1024
DEFAULT_ORIGINS = frozenset({"https://expense.771101.xyz", "https://expense-test.771101.xyz"})
SUPPORTED_IMAGES = frozenset({"image/jpeg", "image/png", "image/webp"})
SUFFIXES = {"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp"}


def configured_origins() -> frozenset[str]:
    value = os.environ.get("RECEIPT_OCR_ALLOWED_ORIGINS", "")
    return frozenset(item.strip() for item in value.split(",") if item.strip()) or DEFAULT_ORIGINS


def allowed_origin(origin: str | None) -> bool:
    return origin in configured_origins()


def validate_upload(content_type: str | None, content_length: int) -> str | None:
    mime_type = (content_type or "").split(";", 1)[0].lower().strip()
    if mime_type not in SUPPORTED_IMAGES:
        return "unsupported_media_type"
    if content_length < 1 or content_length > MAX_IMAGE_BYTES:
        return "payload_too_large"
    return None


def verify_firebase_id_token(authorization: str | None) -> dict:
    if not authorization or not authorization.startswith("Bearer "):
        raise PermissionError("missing_bearer_token")
    token = authorization.removeprefix("Bearer ").strip()
    if not token:
        raise PermissionError("missing_bearer_token")
    try:
        import firebase_admin
        from firebase_admin import auth
    except ImportError as error:
        raise RuntimeError("firebase_admin_not_installed") from error
    if not firebase_admin._apps:
        firebase_admin.initialize_app()
    return auth.verify_id_token(token, check_revoked=True)


def extract_text(image_path: str) -> str:
    try:
        from rapidocr_onnxruntime import RapidOCR
    except ImportError as error:
        raise RuntimeError("rapidocr_not_installed") from error
    result, _elapsed = RapidOCR()(image_path)
    return "\n".join(str(row[1]) for row in (result or []) if len(row) > 1 and row[1])


def make_handler(token_verifier=verify_firebase_id_token, ocr=extract_text):
    class ReceiptHandler(BaseHTTPRequestHandler):
        server_version = "ReceiptOCR/1.0"

        def log_message(self, _format, *_args):
            return  # Never log image data, OCR text, or Firebase tokens.

        def _cors(self):
            origin = self.headers.get("Origin")
            if allowed_origin(origin):
                self.send_header("Access-Control-Allow-Origin", origin)
                self.send_header("Vary", "Origin")

        def _json(self, status, payload):
            self.send_response(status)
            self._cors()
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(json.dumps(payload).encode("utf-8"))

        def do_OPTIONS(self):
            if not allowed_origin(self.headers.get("Origin")):
                self._json(HTTPStatus.FORBIDDEN, {"error": "origin_not_allowed"})
                return
            self.send_response(HTTPStatus.NO_CONTENT)
            self._cors()
            self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
            self.send_header("Access-Control-Allow-Headers", "Authorization, Content-Type")
            self.send_header("Access-Control-Max-Age", "600")
            self.end_headers()

        def do_GET(self):
            self._json(HTTPStatus.OK, {"status": "ok"}) if self.path == "/healthz" else self._json(HTTPStatus.NOT_FOUND, {"error": "not_found"})

        def do_POST(self):
            if self.path != "/v1/receipts:parse":
                self._json(HTTPStatus.NOT_FOUND, {"error": "not_found"})
                return
            if not allowed_origin(self.headers.get("Origin")):
                self._json(HTTPStatus.FORBIDDEN, {"error": "origin_not_allowed"})
                return
            try:
                token_verifier(self.headers.get("Authorization"))
            except PermissionError:
                self._json(HTTPStatus.UNAUTHORIZED, {"error": "unauthorized"})
                return
            except Exception:
                self._json(HTTPStatus.SERVICE_UNAVAILABLE, {"error": "auth_unavailable"})
                return
            try:
                length = int(self.headers.get("Content-Length", "-1"))
            except ValueError:
                length = -1
            content_type = self.headers.get("Content-Type")
            error = validate_upload(content_type, length)
            if error:
                status = HTTPStatus.REQUEST_ENTITY_TOO_LARGE if error == "payload_too_large" else HTTPStatus.UNSUPPORTED_MEDIA_TYPE
                self._json(status, {"error": error})
                return
            image = self.rfile.read(length)
            mime_type = content_type.split(";", 1)[0].lower().strip()
            try:
                with NamedTemporaryFile(suffix=SUFFIXES[mime_type]) as image_file:
                    image_file.write(image)
                    image_file.flush()
                    fields = parse_receipt_text(ocr(image_file.name))
            except RuntimeError as error:
                self._json(HTTPStatus.SERVICE_UNAVAILABLE, {"error": str(error)})
                return
            except Exception:
                self._json(HTTPStatus.UNPROCESSABLE_ENTITY, {"error": "ocr_failed"})
                return
            self._json(HTTPStatus.OK, fields)
    return ReceiptHandler


def main():
    server = ThreadingHTTPServer((os.environ.get("RECEIPT_OCR_HOST", "127.0.0.1"), int(os.environ.get("RECEIPT_OCR_PORT", "8788"))), make_handler())
    server.serve_forever()


if __name__ == "__main__":
    main()
