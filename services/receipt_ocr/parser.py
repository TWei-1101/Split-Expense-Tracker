"""Deterministic extraction of expense fields from OCR text.

OCR only reads text.  This module deliberately makes conservative guesses so
the caller can prefill a form without silently creating an incorrect expense.
"""

from __future__ import annotations

import re

TOTAL_LABEL = re.compile(r"(?:總(?:計|額)|总[计额]|合計|合计|應付(?:金額)?|应付(?:金额)?|TOTAL(?:\s*AMOUNT)?|AMOUNT\s+DUE)", re.I)
AMOUNT = re.compile(r"(?<!\d)(\d{1,3}(?:,\d{3})+|\d+(?:\.\d{1,2})?)(?!\d)")
YEN_AMOUNT = re.compile(
    r"(?:(?:￥|¥|JPY\s*)(\d{1,3}(?:[，,.]\d{3})+|\d+(?:\.\d{1,2})?)|(?<!\d)(\d{1,3}(?:[，,.]\d{3})+|\d+(?:\.\d{1,2})?)\s*(?:yen|円))",
    re.I,
)
DATE = re.compile(
    r"(?<!\d)(\d{4})(?:[/-]|年)(\d{1,2})(?:[/-]|月)(\d{1,2})(?:日)?(?!\d)"
)
TIME = re.compile(r"(?<!\d)([01]?\d|2[0-3]):([0-5]\d)(?!\d)")

# Store names are useful for the form's item name, but they must never decide
# the category: convenience stores sell food, toiletries, tickets and more.
MERCHANT_KEYWORDS = (
    # nanaco is the 7-Eleven Japan payment programme.  On narrow receipts the
    # logo itself is frequently unreadable, while this marker survives OCR.
    ("7-Eleven", ("7-eleven", "seven eleven", "セブンイレブン", "nanaco")),
    ("全家", ("全家", "familymart", "ファミリーマート")),
)

# Food-specific brands and stores whose purchases are unambiguously food/dining.
FOOD_MERCHANTS = (
    ("六花亭", ("六花亭", "六花亨", "rokkatei")),
    ("北菓樓", ("北菓樓", "北菓楼", "kitakaro")),
    ("柳月", ("柳月", "ryugetsu")),
    ("星巴克", ("星巴克", "starbucks", "スターバックス")),
    ("麥當勞", ("麥當勞", "mcdonald", "マクドナルド", "マック")),
    ("肯德基", ("肯德基", "kfc", "ケンタッキー")),
    ("摩斯漢堡", ("摩斯", "mos burger", "モスバーガー")),
    ("一蘭", ("一蘭", "ichiran")),
    ("鳥貴族", ("鳥貴族", "torikizoku")),
    ("敘敘苑", ("敘敘苑", "叙々苑", "jojoen")),
    ("Cranberry", ("cranberry", "クランベリー", "t5460101000476")),
)

# Categories are inferred only from purchased-item wording.  Payment methods
# (for example Japanese transit IC money) are deliberately not included.
ITEM_KEYWORDS = (
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

CATEGORY_ITEM_KEYWORDS = (
    ("food", (
        "拉麵", "ラーメン", "ramen", "壽司", "寿司", "sushi", "咖啡", "カフェ", "coffee", "cafe",
        "飯", "便當", "おにぎり", "手卷", "手巻", "明太子", "弁当", "飲料", "飲み物", "麵包", "パン",
        "菓子", "パイ", "アイス", "サンド", "ケーキ", "デザート", "スイーツ", "プリン", "クッキー",
        "チョコ", "パフェ", "和菓子", "洋菓子", "シュークリーム", "甜點", "點心", "冰淇淋", "蛋糕",
        "燒肉", "定食", "丼", "うどん", "そば", "カレー", "バーガー", "ピザ", "パスタ", "飲食",
        "テーブル", "減税率", "减税率", "軽減税率", "外食", "喫茶", "8%対象", "内税8%", "税率8%", "消費税等8%", "ポテト",
    )),
    ("transport", ("機票", "flight", "airline", "飛行機", "纜車", "cable car", "ropeway", "ロープウェイ", "租車", "rental car", "レンタカー", "計程車", "taxi", "タクシー", "地鐵", "捷運", "metro", "subway", "地下鉄", "巴士", "公車", "bus", "バス", "火車", "train", "電車", "新幹線")),
    ("lodging", ("飯店", "hotel", "ホテル", "旅館", "民宿", "hostel", "ryokan", "宿泊")),
)


def _currency(text: str) -> str:
    upper = text.upper()
    if "JPY" in upper or "YEN" in upper or "￥" in text or "¥" in text:
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
    # Also normalize period used as thousands separator (e.g. 1.700yen)
    normalized = re.sub(r"(?<=\d)\.(?=\d{3}(?:\D|$))", ",", line.replace("，", ","))
    matches = AMOUNT.findall(normalized)
    if not matches:
        return None
    value = float(matches[-1].replace(",", ""))
    return int(value) if value.is_integer() else value


def _description(lines: list[str]) -> str | None:
    receipt_text = "\n".join(lines).casefold()
    for label, keywords in MERCHANT_KEYWORDS + FOOD_MERCHANTS + ITEM_KEYWORDS:
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


def _category(lines: list[str]) -> str:
    """Classify product detail text and food merchants; unknown receipts are safely other."""
    receipt_text = "\n".join(lines).casefold()
    for label, keywords in FOOD_MERCHANTS:
        if any(keyword.casefold() in receipt_text for keyword in keywords):
            return "food"
    for category, keywords in CATEGORY_ITEM_KEYWORDS:
        if any(keyword.casefold() in receipt_text for keyword in keywords):
            return category
    return "other"


def _total(lines: list[str]) -> int | float | None:
    """Return a labeled total, including Japanese receipts split across lines."""
    def compact(line: str) -> str:
        return re.sub(r"[\s\u3000]+", "", line)

    candidates = [_amount(line) for line in lines if TOTAL_LABEL.search(compact(line))]

    FINAL_TOTAL_LABELS = frozenset({"計", "计", "合計", "合计", "總計", "总计", "總額", "总额", "TOTAL", "TOTALAMOUNT", "AMOUNTDUE"})
    for index, line in enumerate(lines):
        # RapidOCR can split a final-total label and its value onto two lines,
        # sometimes inserting spaces inside 合計.  Restrict this to explicit
        # final-total labels so 小計 is never mistaken for the final total.
        if compact(line).upper() in FINAL_TOTAL_LABELS and index + 1 < len(lines):
            candidates.append(_amount(lines[index + 1]))

    labeled_total = next((value for value in reversed(candidates) if value is not None), None)

    # A frequent 7-Eleven Japan failure mode is that the OCR drops the leading
    # "1," from the final total, returning ￥161 for a ￥1,161 receipt.  That
    # receipt also prints the nanaco payment and the cashless rebate.  When
    # both are available, their sum is a stronger cross-check than the single
    # (possibly damaged) total glyph.  Keep this deliberately narrow: it only
    # applies to the nanaco receipt format, and only replaces a smaller total.
    compact_lines = [compact(line) for line in lines]
    nanaco_payment = None
    cashless_rebate = None
    for index, line in enumerate(compact_lines):
        if "nanaco" in line.casefold() and ("支" in line or "払" in line):
            nanaco_payment = _amount(lines[index]) or (
                _amount(lines[index + 1]) if index + 1 < len(lines) else None
            )
        if re.search(r"(?:還元|返金|値引|割引)", line):
            cashless_rebate = _amount(lines[index]) or (
                _amount(lines[index + 1]) if index + 1 < len(lines) else None
            )

    if nanaco_payment is not None and cashless_rebate is not None:
        verified_total = nanaco_payment + cashless_rebate
        if labeled_total is None or labeled_total < nanaco_payment:
            return verified_total

    if labeled_total is not None:
        return labeled_total

    # The Japanese RapidOCR model occasionally loses the single-character
    # final-total label (計) on narrow, phone-uploaded receipts.  In that
    # specific situation, use the largest *yen-marked* charge instead of an
    # arbitrary number: line-item prices, taxes and the later nanaco payment
    # are all smaller on the 7-Eleven format.  Keep this as a last resort and
    # exclude payment/refund rows, so it cannot replace a normal labeled total.
    yen_candidates = []
    skip_next = False
    for line in lines:
        compact_line = compact(line)
        if re.search(r"(?:支払|支|還元|返金|値引|割引|PAYMENT|CHANGE|お預|お釣|預|预|釣|钓)", compact_line, re.I):
            skip_next = True
            continue
        if skip_next:
            skip_next = False
            continue
        if re.search(r"(?:cash|現金|お預|お釣|預|预|釣|钓)", compact_line, re.I):
            continue
        for match in YEN_AMOUNT.findall(line):
            raw_value = match[0] or match[1]
            cleaned = re.sub(r"(?<=\d)\.(?=\d{3}(?:\D|$))", ",", raw_value.replace("，", ","))
            value = float(cleaned.replace(",", ""))
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
        "category": _category(lines),
        "originalAmount": total,
        "currency": _currency(text),
        "occurredAt": occurred_at,
    }
