# Local receipt OCR service

`POST /v1/receipts:parse` accepts a raw JPEG, PNG, or WebP body (maximum 25 MB) and returns `description`, `originalAmount`, `currency`, `occurredAt`, and `items`.
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

## Recognition and review

- Apple Vision is preferred; RapidOCR is the fallback. Both keep word boxes and confidence in the response's `ocr` object. Apple coordinates are normalized; RapidOCR coordinates are pixels. Rows are grouped relative to text height to avoid merging adjacent lines on tall receipts.
- The extraction model receives ordered original text, not the image, and extracts original item names, quantities and line subtotals. Translation is a separate name-only request; it cannot change the numeric fields. Existing known-product translations remain available. Translation failure retains the original name.
- `warnings` and `needsReview` report missing items, low OCR confidence (threshold 0.8), conflicting totals and unfinished kana translation. The frontend shows these messages before saving. Confidence scores are engine-specific heuristics, not calibrated accuracy percentages.
- Printed totals are not overwritten to match item sums or AI totals. Tax/discount/service-charge differences require manual confirmation. A missing total may be provisionally inferred, with a review warning. OCR evidence is not persisted as an expense by the frontend.
- Text is still sent to the configured MiniMax service, or local oMLX fallback. No new image-model service is used. Separate translation can add latency and token usage.

Run offline regression tests with `python -m unittest discover -s services/receipt_ocr/tests`. Tests use synthetic geometry, receipt text and mocked model responses; they do not establish an accuracy improvement on actual photographs. Validate deployment on a labeled set of real receipts before claiming an accuracy percentage. Restart the Mac mini OCR service after updating its checkout.

## Availability and deployment

- The browser stops waiting after 120 seconds (including compression/auth), allows cancellation, and ignores late responses. Cancelling does not forcibly terminate an already-running OCR/native/model call or refund provider usage; the server retains its slot until work actually finishes.
- Each service process admits at most two requests concurrently, at most one per authenticated UID, and six accepted requests per UID per minute. Excess requests receive HTTP 429 and `Retry-After` instead of entering an unbounded queue. Limits reset on process restart; multiple instances require a shared limiter. Reverse-proxy limits are still recommended for pre-authentication traffic.
- Upload reads have a 20-second socket inactivity timeout. Model calls retain their existing individual timeouts. RapidOCR weights are reused under a lock. Native OCR has no hard execution deadline; restart the service if a native call hangs indefinitely.
- `/healthz` reports the Git revision captured when the handler starts and the concurrency cap. It is a liveness check, not an AI-model or Firebase readiness guarantee. After updating/restarting Mac mini, compare its revision with the intended commit.
- GitHub Actions runs frontend and offline backend tests. Missing deployment credentials or Pages deployment errors fail the job. A post-deploy check requires the custom domain's `deployment.json` to match the commit; a stale CDN or incorrect domain configuration is reported as failure.
- Pages deployment only updates the website. It does not deploy Firebase rules or update/restart the separate Mac mini OCR service. No SSH access has been configured by this change.
