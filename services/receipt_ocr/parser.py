"""Deterministic extraction of expense fields from OCR text.

OCR only reads text.  This module deliberately makes conservative guesses so
the caller can prefill a form without silently creating an incorrect expense.
"""

from __future__ import annotations

import re

TOTAL_LABEL = re.compile(r"(?:總(?:計|額)|合計|應付(?:金額)?|TOTAL|AMOUNT\s+DUE)", re.I)
AMOUNT = re.compile(r"(?<!\d)(\d{1,3}(?:,\d{3})+|\d+(?:\.\d{1,2})?)(?!\d)")
DATE = re.compile(r"(?<!\d)(\d{4})[/-](\d{1,2})[/-](\d{1,2})(?!\d)")


def _currency(text: str) -> str:
    upper = text.upper()
    if "JPY" in upper or "￥" in text or "¥" in text:
        return "JPY"
    if "USD" in upper or "US$" in upper:
        return "USD"
    if "EUR" in upper or "€" in text:
        return "EUR"
    return "TWD"


def _amount(line: str) -> int | float | None:
    matches = AMOUNT.findall(line)
    if not matches:
        return None
    value = float(matches[-1].replace(",", ""))
    return int(value) if value.is_integer() else value


def _description(lines: list[str]) -> str | None:
    for line in lines:
        # A merchant is generally at the top, contains letters, and is not a
        # date, a total, or an address/receipt serial number.
        if (not DATE.search(line) and not TOTAL_LABEL.search(line)
                and re.search(r"[A-Za-z\u4e00-\u9fff]", line)
                and len(line) <= 48):
            return line
    return None


def parse_receipt_text(text: str) -> dict:
    """Return form-ready receipt data, using null for fields not found."""
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    total_candidates = [_amount(line) for line in lines if TOTAL_LABEL.search(line)]
    total = next((value for value in reversed(total_candidates) if value is not None), None)

    occurred_at = None
    date_match = DATE.search(text)
    if date_match:
        year, month, day = map(int, date_match.groups())
        if 1 <= month <= 12 and 1 <= day <= 31:
            occurred_at = f"{year:04d}-{month:02d}-{day:02d}T12:00"

    return {
        "description": _description(lines),
        "originalAmount": total,
        "currency": _currency(text),
        "occurredAt": occurred_at,
    }
