"""Deterministic extraction of expense fields from OCR text.

OCR only reads text.  This module deliberately makes conservative guesses so
the caller can prefill a form without silently creating an incorrect expense.
"""

from __future__ import annotations

import re

TOTAL_LABEL = re.compile(r"(?:總(?:計|額)|合計|應付(?:金額)?|TOTAL|AMOUNT\s+DUE)", re.I)
AMOUNT = re.compile(r"(?<!\d)(\d{1,3}(?:,\d{3})+|\d+(?:\.\d{1,2})?)(?!\d)")
YEN_AMOUNT = re.compile(r"(?:￥|¥|JPY\s*)(\d{1,3}(?:[，,]\d{3})+|\d+(?:\.\d{1,2})?)", re.I)
DATE = re.compile(
    r"(?<!\d)(\d{4})(?:[/-]|年)(\d{1,2})(?:[/-]|月)(\d{1,2})(?:日)?(?!\d)"
)
TIME = re.compile(r"(?<!\d)([01]?\d|2[0-3]):([0-5]\d)(?!\d)")

# Keep receipt prefills intentionally simple: when OCR sees one of these
# travel-relevant terms, use that term as the expense name.  The web form then
# derives its existing four-way category from the same keyword.
ITEM_KEYWORDS = (
    # nanaco is the 7-Eleven Japan payment programme.  On narrow receipts the
    # logo itself is frequently unreadable, while this marker survives OCR.
    ("7-Eleven", ("7-eleven", "seven eleven", "セブンイレブン", "nanaco")),
    ("全家", ("全家", "familymart", "ファミリーマート")),
    ("拉麵", ("拉麵", "ラーメン", "ramen")),
    ("壽司", ("壽司", "寿司", "sushi")),
    ("咖啡", ("咖啡", "カフェ", "coffee", "cafe")),
    ("機票", ("機票", "flight", "airline", "飛行機")),
    ("纜車", ("纜車", "cable car", "ropeway", "ロープウェイ")),
    ("租車", ("租車", "rental car", "レンタカー")),
    ("計程車", ("計程車", "taxi", "タクシー")),
    ("地鐵", ("地鐵", "捷運", "metro", "subway", "地下鉄")),
    ("巴士", ("巴士", "公車", "bus", "バス")),
    ("火車", ("火車", "train", "jr", "電車", "新幹線")),
    ("飯店", ("飯店", "hotel", "ホテル")),
    ("旅館", ("旅館", "民宿", "hostel", "ryokan", "宿泊")),
)


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
    # RapidOCR can emit fullwidth punctuation on a Japanese receipt.  Normalize
    # only numeric separators here, so a total such as ￥1，161 remains one
    # amount rather than two unrelated numbers (1 and 161).
    matches = AMOUNT.findall(line.replace("，", ","))
    if not matches:
        return None
    value = float(matches[-1].replace(",", ""))
    return int(value) if value.is_integer() else value


def _description(lines: list[str]) -> str | None:
    receipt_text = "\n".join(lines).casefold()
    for label, keywords in ITEM_KEYWORDS:
        if any(keyword.casefold() in receipt_text for keyword in keywords):
            return label

    # Japanese convenience-store receipts commonly print a branch name ending
    # in 店. Prefer it over misrecognised brand text and the following address.
    for line in lines:
        if re.fullmatch(r"[\u4e00-\u9fff\u3040-\u30ff]+店", line):
            return line

    for line in lines:
        # A merchant is generally at the top, contains letters, and is not a
        # date, a total, or an address/receipt serial number.
        if (not DATE.search(line) and not TOTAL_LABEL.search(line)
                and re.search(r"[A-Za-z\u4e00-\u9fff]", line)
                and len(line) <= 48):
            return line
    return None


def _total(lines: list[str]) -> int | float | None:
    """Return a labeled total, including Japanese receipts split across lines."""
    def compact(line: str) -> str:
        return re.sub(r"[\s\u3000]+", "", line)

    candidates = [_amount(line) for line in lines if TOTAL_LABEL.search(compact(line))]

    for index, line in enumerate(lines):
        # RapidOCR can split a final-total label and its value onto two lines,
        # sometimes inserting spaces inside 合計.  Restrict this to explicit
        # final-total labels so 小計 is never mistaken for the final total.
        if compact(line).upper() in {"計", "合計", "總計", "總額", "TOTAL", "AMOUNTDUE"} and index + 1 < len(lines):
            candidates.append(_amount(lines[index + 1]))

    labeled_total = next((value for value in reversed(candidates) if value is not None), None)
    if labeled_total is not None:
        return labeled_total

    # The Japanese RapidOCR model occasionally loses the single-character
    # final-total label (計) on narrow, phone-uploaded receipts.  In that
    # specific situation, use the largest *yen-marked* charge instead of an
    # arbitrary number: line-item prices, taxes and the later nanaco payment
    # are all smaller on the 7-Eleven format.  Keep this as a last resort and
    # exclude payment/refund rows, so it cannot replace a normal labeled total.
    yen_candidates = []
    for line in lines:
        compact_line = compact(line)
        if re.search(r"(?:支払|支|還元|返金|値引|割引)", compact_line):
            continue
        for raw_value in YEN_AMOUNT.findall(line.replace("，", ",")):
            value = float(raw_value.replace(",", ""))
            yen_candidates.append(int(value) if value.is_integer() else value)
    return max(yen_candidates, default=None)


def parse_receipt_text(text: str) -> dict:
    """Return form-ready receipt data, using null for fields not found."""
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    total = _total(lines)

    occurred_at = None
    date_match = DATE.search(text)
    if date_match:
        year, month, day = map(int, date_match.groups())
        if 1 <= month <= 12 and 1 <= day <= 31:
            time_match = TIME.search(text[date_match.end():])
            time = f"{time_match.group(1).zfill(2)}:{time_match.group(2)}" if time_match else "12:00"
            occurred_at = f"{year:04d}-{month:02d}-{day:02d}T{time}"

    return {
        "description": _description(lines),
        "originalAmount": total,
        "currency": _currency(text),
        "occurredAt": occurred_at,
    }
