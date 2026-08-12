# Local receipt OCR service

`POST /v1/receipts:parse` accepts a raw JPEG, PNG, or WebP body (maximum 8 MB) and returns `description`, `originalAmount`, `currency`, and `occurredAt`.
It accepts requests only from the two expense domains and requires a valid Firebase ID token in `Authorization: Bearer <currentUser.getIdToken()>`.

## Install and run on the Mac mini

```bash
python3 -m venv ~/.venvs/receipt-ocr
~/.venvs/receipt-ocr/bin/pip install -r services/receipt_ocr/requirements.txt
export GOOGLE_APPLICATION_CREDENTIALS=/secure/path/firebase-service-account.json
~/.venvs/receipt-ocr/bin/python services/receipt_ocr/server.py
curl http://127.0.0.1:8788/healthz
```

The service deliberately binds to `127.0.0.1`; expose it only through an authenticated private tunnel or reverse proxy. Do not add the service-account JSON to this repository. Copy `com.example.receipt-ocr.plist.example` to `~/Library/LaunchAgents/com.example.receipt-ocr.plist`, replace `REPLACE_ME`, then run `launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.example.receipt-ocr.plist`.

RapidOCR is local. The image is written to a temporary file only while OCR runs and is deleted before the HTTP response.
