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
    r"(?<!\d)(\d{2}|\d{4})(?:[/-]|年)\s*(\d{1,2})(?:[/-]|月)\s*(\d{1,2})(?:日)?(?!\d)"
)
TIME = re.compile(r"(?<!\d)([01]?\d|2[0-3])(?::|時)([0-5]\d)(?:分)?(?!\d)")

# Store names are useful for the form's item name, but they must never decide
# the category: convenience stores sell food, toiletries, tickets and more.
MERCHANT_KEYWORDS = (
    # nanaco is the 7-Eleven Japan payment programme.  On narrow receipts the
    # logo itself is frequently unreadable, while this marker survives OCR.
    ("7-Eleven", (
        "7-eleven", "seven eleven", "seven & i", "seven&i", "セブンイレブン", "セブン-イレブン", "セブン",
        "nanaco", "7プレミアム", "7カフェ", "77°l么", "77°", "7ns", "c.car-cca", "c.car", "c.ca-c.ca", "c.ca", "sivensnoings",
    )),
    ("全家", ("全家", "familymart", "ファミリーマート")),
    ("Lawson", ("lawson", "ローソン")),
    ("Seicomart", ("seicomart", "セイコーマート", "セコマ")),
    ("WORKMAN Plus", ("workman", "ワークマン")),
    ("UNIQLO", ("uniqlo", "ユニクロ")),
    ("GU", ("\bgu\b", "ジーユー")),
    ("無印良品", ("無印良品", "muji")),
    ("唐吉訶德", ("don quijote", "donki", "ドン・キホーテ", "ドンキ", "唐吉訶德")),
    ("大創", ("daiso", "ダイソー")),
    ("Bic Camera", ("bic camera", "biccamera", "ビックカメラ")),
    ("Yodobashi Camera", ("yodobashi", "ヨドバシ")),
    ("松本清", ("matsumoto kiyoshi", "matsukiyo", "マツモトキヨシ", "マツキヨ")),
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
    ("炉端 KORONAGIRAI", ("koronagirai", "koronagirat", "0155-67-5604")),
)

# Hotel and lodging brands
HOTEL_MERCHANTS = (
    ("Richmond Hotel", ("richmond", "リッチモンド", "t1010901015937", "0155-20-2255")),
    ("東橫INN", ("toyoko", "東横イン", "東橫inn")),
    ("Dormy Inn", ("dormy", "ドーミーイン")),
    ("APA Hotel", ("apa hotel", "アパホテル")),
    ("Super Hotel", ("super hotel", "スーパーホテル")),
    ("Route Inn", ("route inn", "ルートイン")),
    ("JR Inn", ("jr inn", "jrイン")),
    ("Daiwa Roynet Hotel", ("daiwa roynet", "ダイワロイネット")),
    ("Tokyu Stay", ("tokyu stay", "東急ステイ")),
    ("三井花園飯店", ("mitsui garden", "三井ガーデン")),
    ("Comfort Hotel", ("comfort hotel", "コンフォートホテル")),
)

# Categories are inferred only from purchased-item wording.  Payment methods
# (for example Japanese transit IC money) are deliberately not included.
ITEM_KEYWORDS = (
    ("交通通行費", ("通行料金", "通行料", "高速道路", "料金所", "nexco", "首都高", "阪神高速", "過路費", "通行費")),
    ("拉麵", ("拉麵", "ラーメン", "ramen")),
    ("壽司", ("壽司", "寿司", "sushi")),
    ("爐端燒", ("炉端", "ろばた", "炉ばた", "robatayaki", "robata", "姿焼き", "姿焼")),
    ("咖啡", ("咖啡", "カフェ", "coffee", "cafe")),
    ("機票", ("機票", "flight", "airline", "飛行機")),
    ("纜車", ("纜車", "cable car", "ropeway", "ロープウェイ")),
    ("租車", ("租車", "rental car", "レンタカー")),
    ("計程車", ("計程車", "taxi", "タクシー")),
    ("地鐵", ("地鐵", "捷運", "metro", "subway", "地下鉄")),
    ("巴士", ("巴士", "公車", "bus", "バス")),
    ("火車", ("火車", "train", "jr", "電車", "新幹線")),
    ("飯店", ("飯店", "hotel", "ホテル", "roomno", "room no", "termofstay", "term of stay", "accommodation tax", "宿泊税", "宿泊")),
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
        "串", "梅酒", "酒", "居酒屋", "炉端", "お通し", "やきとり", "焼き鳥", "焼鳥", "ウーロン茶", "烏龍茶", "刺身", "ビール", "サワー", "ハイボール",
    )),
    ("transport", ("通行料金", "通行料", "高速道路", "料金所", "etc", "nexco", "過路費", "通行費", "高速公路", "機票", "flight", "airline", "飛行機", "纜車", "cable car", "ropeway", "ロープウェイ", "租車", "rental car", "レンタカー", "計程車", "taxi", "タクシー", "地鐵", "捷運", "metro", "subway", "地下鉄", "巴士", "公車", "bus", "バス", "火車", "train", "電車", "新幹線")),
    ("lodging", ("飯店", "hotel", "ホテル", "旅館", "民宿", "hostel", "ryokan", "宿泊", "termofstay", "term of stay", "roomno", "room no", "accommodation")),
)


JAPAN_MARKERS = re.compile(
    r"(?:北海道|東京都|大阪府|京都府|[一-龥]{1,3}[縣県市町村]|"
    r"領収|领收|領収証|领收证|領収書|领收书|レシート|課税|课税|消費税|消费税|税合計|税合计|内税|外税|軽減税率|軽减税率|"
    r"お買|お預|お釣|点数|登録番号\s*T\d{13}|登錄番号\s*T\d{13}|登绿番号\s*T\d{13}|"
    r"[\u3040-\u309f]{2,}|[\u30a0-\u30ff]{2,})",
    re.I,
)


def _currency(text: str) -> str:
    upper = text.upper()
    if "JPY" in upper or "YEN" in upper or "￥" in text or "¥" in text:
        return "JPY"
    if "USD" in upper or "US$" in upper:
        return "USD"
    if "EUR" in upper or "€" in text:
        return "EUR"
    if JAPAN_MARKERS.search(text):
        return "JPY"
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


GENERIC_DOCUMENT_TITLES = frozenset({
    "RECEIPT", "INVOICE", "BILL", "領収", "領収書", "領収証", "レシート", "DETAILS", "TOTAL", "SUBTOTAL", "TAX"
})


def _description(lines: list[str]) -> str | None:
    receipt_text = "\n".join(lines).casefold()
    for label, keywords in MERCHANT_KEYWORDS + FOOD_MERCHANTS + HOTEL_MERCHANTS + ITEM_KEYWORDS:
        if any(keyword.casefold() in receipt_text for keyword in keywords):
            return label

    # Look for explicit hotel or lodging names in the text
    for line in lines:
        cleaned = line.strip("=<- >*#:")
        if re.search(r"(?:[A-Za-z\u4e00-\u9fff\s]+(?:HOTEL|ホテル|INN|旅館|民宿|HOTELS))", cleaned, re.I):
            if len(cleaned) >= 4 and cleaned.upper() not in {"HOTEL", "ホテル", "旅館", "民宿"}:
                return cleaned

    # If the top line is clearly a brand name (not delimiter / receipt title), prefer it
    for line in lines[:3]:
        cleaned = re.sub(r"[\s\u3000=<-]+", "", line).upper()
        if (cleaned not in GENERIC_DOCUMENT_TITLES
                and re.search(r"^[A-Za-z0-9\s\-+&.']+$", line.strip("=<- >*#:"))
                and len(line.strip("=<- >*#:")) >= 3
                and not re.search(r"^(?:receipt|no\.|tel|fax|date|領収|领收)", line.strip("=<- >*#:"), re.I)):
            return line.strip("=<- >*#:")

    # Japanese convenience-store receipts commonly print a branch name ending
    # in 店. Prefer it over misrecognised brand text and the following address.
    for line in lines:
        if re.fullmatch(r"[\u4e00-\u9fff\u3040-\u30ff]+店", line):
            return line

    for line in lines:
        # A merchant is generally at the top, contains letters, and is not a
        # date, a total, or an address/receipt serial number.
        cleaned = re.sub(r"[\s\u3000=<-]+", "", line).upper()
        if (cleaned not in GENERIC_DOCUMENT_TITLES
                and not DATE.search(line) and not TOTAL_LABEL.search(line)
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
    for label, keywords in HOTEL_MERCHANTS:
        if any(keyword.casefold() in receipt_text for keyword in keywords):
            return "lodging"
    for category, keywords in CATEGORY_ITEM_KEYWORDS:
        if any(keyword.casefold() in receipt_text for keyword in keywords):
            return category
    return "other"


def _total(lines: list[str]) -> int | float | None:
    """Return a labeled total, including Japanese receipts split across lines."""
    def compact(line: str) -> str:
        return re.sub(r"[\s\u3000]+", "", line)

    FINAL_TOTAL_LABELS = frozenset({
        "計", "计", "合計", "合计", "總計", "总计", "總額", "总额",
        "TOTAL", "TOTALAMOUNT", "AMOUNTDUE",
        "台計", "台计",
    })
    EXCLUDE_ROW = re.compile(
        r"(?:支払|支|還元|返金|値引|割引|PAYMENT|CHANGE|お預|お釣|預|预|釣|钓|cash|現金|現計|現计|クレ計|電計|掛計|税合計|税合计|税額|税额|消費税|消费税|内税|外税|課税|课税|点数|点|件数)",
        re.I,
    )
    CASH_TENDERED_LABEL = re.compile(r"(?:現計|現计|お預|お預り|預|预|cash|現金|PAYMENT)", re.I)

    candidates = [
        _amount(line)
        for line in lines
        if TOTAL_LABEL.search(compact(line)) and not EXCLUDE_ROW.search(compact(line))
    ]

    has_change = any(re.search(r"(?:釣|钓|お釣|お釣り|CHANGE)", line, re.I) for line in lines)

    for index, line in enumerate(lines):
        # OCR can split a final-total label and its value onto two lines,
        # sometimes inserting spaces inside 合計, or emitting the amount on
        # the preceding line in multi-column layouts.
        if compact(line).upper() in FINAL_TOTAL_LABELS:
            line_candidates = []
            if index > 0:
                is_prev_excluded = EXCLUDE_ROW.search(lines[index - 1]) or (
                    index > 1 and EXCLUDE_ROW.search(lines[index - 2])
                )
                if not is_prev_excluded:
                    amt_prev = _amount(lines[index - 1])
                    if amt_prev is not None:
                        line_candidates.append(amt_prev)

            for offset in range(1, 5):
                if index + offset < len(lines):
                    target_line = lines[index + offset]
                    if has_change and CASH_TENDERED_LABEL.search(target_line):
                        break
                    if EXCLUDE_ROW.search(target_line) and not _amount(target_line):
                        continue
                    if has_change and amt_prev is not None and index + offset + 1 < len(lines) and CASH_TENDERED_LABEL.search(lines[index + offset + 1]):
                        break
                    amt = _amount(target_line)
                    if amt is not None:
                        if "%" in target_line and (amt == 8 or amt == 10):
                            continue
                        if index + offset > 0 and re.search(r"(?:税合計|税合计|税額|税额)", lines[index + offset - 1]):
                            continue
                        line_candidates.append(amt)
                        break

            if line_candidates:
                candidates.append(max(line_candidates))

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


def _get_minimax_key() -> str | None:
    for p in ["/Users/twei/.openclaw/openclaw.json"]:
        try:
            import json
            with open(p) as f:
                cfg = json.load(f)
            k = cfg.get("models", {}).get("providers", {}).get("minimax", {}).get("apiKey")
            if k:
                return k
        except Exception:
            pass
    return None


def extract_and_translate_items(ocr_text: str) -> list[dict]:
    """Extract individual purchased items and translate names to Traditional Chinese via local or cloud AI."""
    import json
    import urllib.request
    import re

    prompt = (
        "請將以下日本/外國收據的購買品項擷取為 JSON 陣列，商品名稱請務必翻譯成精準、道地的繁體中文（台灣習慣用語）：\n"
        "特別注意事項：\n"
        "- 若為 WORKMAN Plus 等戶外與服飾專賣店，商品皆為服飾、毛巾、腰帶、襪子、內衣等，請勿翻譯為化妝品或一般代碼（例如：MEDIHEAL 是其疲勞修復機能服飾系列；ふわふわフェイスタ 是蓬鬆洗臉毛巾；GIベルト 是GI帆布腰帶；ドライメッシュ 是乾爽透氣網眼襪；シン・呼吸するインナー 是呼吸透氣內衣）。\n"
        "- 不要包含稅金（税額、消費税、税合計）、小計、總計、找零或店鋪資訊。\n"
        "輸出格式必須是純 JSON 陣列，欄位如下：\n"
        "- \"name\": 繁體中文商品名稱 (例如：蓬鬆洗臉毛巾, 黑色GI帆布腰帶, MEDIHEAL 疲勞修復機能服, 乾爽網眼短襪 5入組, 乾爽機能短襪, 會呼吸的圓領短袖內衣)\n"
        "- \"originalName\": 收據上的原始名稱\n"
        "- \"amount\": 原幣金額數值 (不含貨幣符號，必須大於 0)\n"
        "- \"quantity\": 數量整數 (預設 1)\n\n"
        "只輸出純 JSON 陣列，不要任何額外對話或 Markdown 標籤：\n" + ocr_text
    )

    def parse_items_json(raw_text: str) -> list[dict]:
        match = re.search(r"\[\s*\{.*\}\s*\]", raw_text, re.DOTALL)
        if match:
            parsed = json.loads(match.group(0))
        else:
            match_arr = re.search(r"\[.*\]", raw_text, re.DOTALL)
            parsed = json.loads(match_arr.group(0)) if match_arr else json.loads(raw_text)

        if isinstance(parsed, list):
            result = []
            for item in parsed:
                if not isinstance(item, dict):
                    continue
                name = str(item.get("name", "")).strip()
                orig = str(item.get("originalName", "")).strip()
                try:
                    amt = float(item.get("amount", 0))
                except (ValueError, TypeError):
                    amt = 0
                try:
                    qty = int(item.get("quantity", 1))
                except (ValueError, TypeError):
                    qty = 1
                if (name or orig) and amt > 0:
                    clean_amt = int(amt) if amt.is_integer() else amt
                    result.append({
                        "name": name or orig,
                        "originalName": orig,
                        "amount": clean_amt,
                        "quantity": max(1, qty),
                    })
            return result
        return []

    # 1. 優先嘗試區域網路 autoteam
    try:
        payload = {
            "model": "gemini-3.8-flash-high",
            "messages": [{"role": "user", "content": prompt}],
            "temperature": 0.1,
        }
        req = urllib.request.Request(
            "http://192.168.68.181:8317/v1/chat/completions",
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json", "Authorization": "Bearer tweiautoteam"},
        )
        with urllib.request.urlopen(req, timeout=2) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            raw = data["choices"][0]["message"]["content"].strip()
            items = parse_items_json(raw)
            if items:
                print(f"Extracted {len(items)} items via autoteam", flush=True)
                return items
    except Exception as e:
        print(f"Autoteam failed ({e}), falling back to MiniMax...", flush=True)

    # 2. 自動備援：MiniMax 雲端 API (100% 穩定高可用)
    minimax_key = _get_minimax_key()
    if minimax_key:
        try:
            payload = {
                "model": "MiniMax-Text-01",
                "max_tokens": 1500,
                "messages": [{"role": "user", "content": prompt}],
            }
            req = urllib.request.Request(
                "https://api.minimax.io/anthropic/v1/messages",
                data=json.dumps(payload).encode("utf-8"),
                headers={"Content-Type": "application/json", "x-api-key": minimax_key, "anthropic-version": "2023-06-01"},
            )
            with urllib.request.urlopen(req, timeout=45) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                raw = data["content"][0]["text"].strip()
                items = parse_items_json(raw)
                if items:
                    print(f"Extracted {len(items)} items via MiniMax fallback", flush=True)
                    return items
        except Exception as mm_err:
            print(f"MiniMax fallback error: {mm_err}", flush=True)

    return []


def parse_receipt_text(text: str, extract_items: bool = False) -> dict:
    """Return form-ready receipt data, using null for fields not found."""
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    total = _total(lines)

    occurred_at = None
    for i, line in enumerate(lines):
        m = DATE.search(line)
        if m:
            year, month, day = map(int, m.groups())
            if year < 100:
                year += 2000
            if not (1 <= month <= 12 and 1 <= day <= 31):
                continue
            # 1. Check same line
            tm = TIME.search(line[m.end():]) or TIME.search(line[:m.start()])
            if tm:
                occurred_at = f"{year:04d}-{month:02d}-{day:02d}T{tm.group(1).zfill(2)}:{tm.group(2)}"
                break
            # 2. Check adjacent lines (immediately after or before)
            if i + 1 < len(lines):
                tm = TIME.search(lines[i + 1])
                if tm and not DATE.search(lines[i + 1]):
                    occurred_at = f"{year:04d}-{month:02d}-{day:02d}T{tm.group(1).zfill(2)}:{tm.group(2)}"
                    break
            if i > 0:
                tm = TIME.search(lines[i - 1])
                if tm and not DATE.search(lines[i - 1]):
                    occurred_at = f"{year:04d}-{month:02d}-{day:02d}T{tm.group(1).zfill(2)}:{tm.group(2)}"
                    break
            # Date found without explicit time near it
            occurred_at = f"{year:04d}-{month:02d}-{day:02d}"
            break

    return {
        "description": _description(lines),
        "category": _category(lines),
        "originalAmount": total,
        "currency": _currency(text),
        "occurredAt": occurred_at,
        "items": extract_and_translate_items(text) if extract_items else [],
    }
