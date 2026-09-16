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
TIME = re.compile(r"(?<!\d)([01]?\d|2[0-3])(?::|時|月(?=\d{2}分))([0-5]\d|[6][0-9])(?:分)?(?!\d)")

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
    ("Lawson 阿寒湖溫泉店", ("阿寒湖温泉店", "0154-67-4163")),
    ("Lawson", ("lawson", "ローソン")),
    ("AEON 超市 根室店", ("イオン根室店", "aeon根室")),
    ("AEON 超市", ("aeon", "イオン", "永旺")),
    ("THE NORTH FACE / HELLY HANSEN 知床店", ("the north face", "helly hansen", "0152-24-2410")),
    ("THE NORTH FACE", ("the north face", "north face")),
    ("HELLY HANSEN", ("helly hansen",)),
    ("SUPER ARCS 超市 中標津店", ("スーパーアークス 中標津店", "スーパーアークス中標津店", "0153-79-2980")),
    ("SUPER ARCS 超市", ("super arcs", "superarcs", "スーパーアークス")),
    ("Big House 超市", ("bighouse", "ビッグハウス", "株式会社福原", "株式会社 福原")),
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
    ("鶴羽藥妝 中標津東店", ("中標津東店", "0153-78-7576")),
    ("鶴羽藥妝 (ツルハドラッグ)", ("ツルハドラッグ", "ツルハ", "tsuruha", "鶴羽", "ツルス")),
    ("尚都樂客", ("サンドラッグ", "sundrug")),
    ("大國藥妝", ("ダイコクドラッグ", "daikoku")),
    ("札幌藥妝", ("サツドラ", "サッポロドラッグ", "satsudora")),
    ("Welcia", ("ウエルシア", "welcia")),
    ("Cocokara Fine", ("ココカラファイン", "cocokara")),
    ("Sugi 藥局", ("スギ薬局", "スギドラッグ")),
)

# Retail, clothing, electronics and general goods stores whose purchases are 'other'
RETAIL_MERCHANTS = (
    ("UNIQLO", ("uniqlo", "ユニクロ")),
    ("GU", (r"\bgu\b", "ジーユー")),
    ("無印良品", ("無印良品", "muji")),
    ("WORKMAN Plus", ("workman", "ワークマン")),
    ("THE NORTH FACE / HELLY HANSEN 知床店", ("the north face", "helly hansen", "0152-24-2410")),
    ("THE NORTH FACE", ("the north face", "north face")),
    ("HELLY HANSEN", ("helly hansen",)),
    ("大創", ("daiso", "ダイソー")),
    ("Bic Camera", ("bic camera", "biccamera", "ビックカメラ")),
    ("Yodobashi Camera", ("yodobashi", "ヨドバシ")),
    ("松本清", ("matsumoto kiyoshi", "matsukiyo", "マツモトキヨシ", "マツキヨ")),
    ("鶴羽藥妝", ("ツルハドラッグ", "ツルハ", "tsuruha", "鶴羽", "ツルス", "0153-78-7576")),
    ("尚都樂客", ("サンドラッグ", "sundrug")),
    ("大國藥妝", ("ダイコクドラッグ", "daikoku")),
    ("札幌藥妝", ("サツドラ", "サッポロドラッグ", "satsudora")),
    ("Welcia", ("ウエルシア", "welcia")),
    ("Cocokara Fine", ("ココカラファイン", "cocokara")),
    ("Sugi 藥局", ("スギ薬局", "スギドラッグ")),
    ("唐吉訶德", ("don quijote", "donki", "ドン・キホーテ", "ドンキ", "唐吉訶德")),
    ("ニトリ", ("ニトリ", "nitori", "宜得利")),
    ("ABC-MART", ("abc-mart", "abcmart", "abcマート")),
)

# Food-specific brands and stores whose purchases are unambiguously food/dining.
FOOD_MERCHANTS = (
    ("厚岸味覚ターミナル コンキリエ", ("厚岸味覚ターミナル", "コンキリエ", "conchiglie", "オイスターカフェ", "oyster cafe", "oystercafe", "0153-52-4139", "味覚ターミナル", "フンキリエ")),
    ("根室花まる 根室店", ("花まる根室店", "0153-24-1444")),
    ("根室花まる", ("根室花まる", "根室れまる", "花まる", "hanamaru")),
    ("六花亭", ("六花亭", "六花亨", "rokkatei", "マルセイ", "サクサクパイ", "醍醐", "t9460101001966", "0120-12-6666")),
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
    ("別海町 レストランNOTSUKE", ("レストランnotsuke", "notsuke", "野付", "別海町観光開発公社", "0153-82-1270")),
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
    ("知床サライ", ("知床サライ", "shiretoko sarai", "0153-85-8800")),
)

# Transport and gas station brands
TRANSPORT_MERCHANTS = (
    ("交通通行費", ("nexco", "高速道路", "通行料金", "料金所", "首都高", "阪神高速")),
    ("オカモトセルフ 根室 (加油站)", ("オカモト", "セルフ根室", "0153-29-2125")),
    ("オカモトセルフ 加油站", ("オカモトセルフ", "株式会社オカモト", "オカモト")),
    ("ENEOS 加油站", ("eneos", "エネオス")),
    ("出光 apollostation 加油站", ("apollostation", "アポロステーション", "出光")),
    ("Cosmo 加油站", ("コスモ石油", "cosmo石油", "コスモ")),
    ("ホクレンSS 加油站", ("ホクレンss", "ホクレン")),
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
        "拉麵", "ラーメン", "ramen", "壽司", "寿司", "sushi", "咖啡", "カフェ", "coffee", "cafe", "とうきび", "とうきび茶", "お茶", "緑茶", "麦茶",
        "飯", "便當", "おにぎり", "手卷", "手巻", "明太子", "弁当", "飲料", "飲み物", "麵包", "食パン", "菓子パン", "惣菜パン", "総菜パン", "あんパン", "アンパン", "メロンパン", "クロワッサン", "ベーカリー", "bakery", "bread",
        "菓子", "サクサクパイ", "アップルパイ", "アイス", "サンド", "ケーキ", "デザート", "スイーツ", "プリン", "クッキー",
        "チョコ", "パフェ", "和菓子", "洋菓子", "シュークリーム", "甜點", "點心", "冰淇淋", "蛋糕",
        "燒肉", "定食", "丼", "うどん", "そば", "カレー", "バーガー", "ピザ", "パスタ", "飲食",
        "テーブル", "減税率", "减税率", "軽減税率", "外食", "喫茶", "8%対象", "内税8%", "税率8%", "消費税等8%", "税拔8%", "税抜8%", "ポテト",
        "串", "梅酒", "日本酒", "地酒", "清酒", "お酒", "焼酎", "ワイン", "ウイスキー", "居酒屋", "炉端", "お通し", "やきとり", "焼き鳥", "焼鳥", "ウーロン茶", "烏龍茶", "刺身", "ビール", "サワー", "ハイボール",
    )),
    ("transport", ("通行料金", "通行料", "高速道路", "料金所", "etc", "nexco", "過路費", "通行費", "高速公路", "機票", "flight", "airline", "飛行機", "纜車", "cable car", "ropeway", "ロープウェイ", "租車", "rental car", "レンタカー", "計程車", "taxi", "タクシー", "地鐵", "捷運", "metro", "subway", "地下鉄", "巴士", "公車", "bus", "バス", "火車", "train", "電車", "新幹線", "加油", "燃料", "ガソリン", "軽油", "給油", "スタンド", "gasoline", "petrol", "eneos", "idemitsu", "出光", "コスモ", "cosmo", "オカモト", "apollostation", "キグナス", "kygnus", "シェル", "shell", "ホクレン", "レギュラー", "ハイオク")),
    ("lodging", ("飯店", "hotel", "ホテル", "旅館", "民宿", "hostel", "ryokan", "宿泊", "宿泊税", "termofstay", "term of stay", "roomno", "room no", "accommodation")),
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
    "RECEIPT", "INVOICE", "BILL", "領収", "領収書", "領収証", "レシート", "DETAILS", "TOTAL", "SUBTOTAL", "TAX", "納品書", "納品書（領収書）", "納品書(領収書)",
    "しんせつ第一", "親切第一", "いらっしゃいませ", "毎度ありがとうございます", "ご利用ありがとうございます", "ご利用ありがとうございます。", "ありがとうございます",
})


def _description(lines: list[str]) -> str | None:
    receipt_text = "\n".join(lines).casefold()
    for label, keywords in MERCHANT_KEYWORDS + FOOD_MERCHANTS + HOTEL_MERCHANTS + TRANSPORT_MERCHANTS:
        if any(keyword.casefold() in receipt_text for keyword in keywords):
            return label

    # Look for explicit hotel or lodging names in the text
    for line in lines:
        cleaned = line.strip("=<- >*#:")
        if re.search(r"(?:[A-Za-z\u4e00-\u9fff\s]+(?:HOTEL|ホテル|INN|旅館|民宿|HOTELS))", cleaned, re.I):
            if len(cleaned) >= 4 and cleaned.upper() not in {"HOTEL", "ホテル", "旅館", "民宿"}:
                return cleaned

    # If the top lines contain a brand or facility name, prefer Chinese/Japanese over English subtitle
    cand_cjk = None
    cand_en = None
    for line in lines[:4]:
        stripped = line.strip("=<- >*#:")
        cleaned = re.sub(r"[\s\u3000=<-]+", "", line).upper()
        if (cleaned in GENERIC_DOCUMENT_TITLES
                or len(stripped) < 2
                or DATE.search(line)
                or TOTAL_LABEL.search(line)
                or re.search(r"^[\d\s\-()]+$", stripped)
                or re.search(r"^(?:receipt|no\.|tel|fax|date|領収|领收|登録番号|登錄番号|登绿番号)", stripped, re.I)
                or re.search(r"(?:[0-9０-９]+(?:丁目|番|号|線)|[0-9０-９\-]{3,}$)", stripped)):
            continue

        if re.search(r"[\u4e00-\u9fff\u3040-\u30ff]", stripped):
            if cand_cjk is None and len(stripped) <= 48:
                cand_cjk = stripped
        elif re.search(r"^[A-Za-z0-9\s\-+&.']+$", stripped):
            if cand_en is None and len(stripped) >= 3:
                cand_en = stripped

    if cand_cjk:
        return cand_cjk
    if cand_en:
        return cand_en

    # Japanese convenience-store receipts commonly print a branch name ending
    # in 店. Prefer it over misrecognised brand text and the following address.
    for line in lines:
        if re.fullmatch(r"[\u4e00-\u9fff\u3040-\u30ff]+店", line):
            return line

    for label, keywords in ITEM_KEYWORDS:
        if any(keyword.casefold() in receipt_text for keyword in keywords):
            return label

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
    """Classify product detail text and merchants; unknown receipts are safely other."""
    receipt_text = "\n".join(lines).casefold()
    for label, keywords in RETAIL_MERCHANTS:
        if any(keyword.casefold() in receipt_text for keyword in keywords):
            return "other"
    for label, keywords in FOOD_MERCHANTS:
        if any(keyword.casefold() in receipt_text for keyword in keywords):
            return "food"
    for label, keywords in HOTEL_MERCHANTS:
        if any(keyword.casefold() in receipt_text for keyword in keywords):
            return "lodging"
    for label, keywords in TRANSPORT_MERCHANTS:
        if any(keyword.casefold() in receipt_text for keyword in keywords):
            return "transport"
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
        r"(?:支払|支|還元|返金|値引|割引|PAYMENT|CHANGE|お預|お釣|預|预|釣|钓|cash|現金|現計|現计|クレ計|電計|掛計|税合計|税合计|税額|税额|消費税|消费税|内税|外税|課税|课税)",
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
    for index, line in enumerate(lines):
        compact_line = compact(line)
        if re.search(r"(?:支払|支|還元|返金|値引|割引|PAYMENT|CHANGE|お預|お釣|預|预|釣|钓)", compact_line, re.I):
            skip_next = True
            continue
        if skip_next:
            skip_next = False
            continue
        if re.search(r"(?:cash|現金|お預|お釣|預|预|釣|钓)", compact_line, re.I):
            continue
        if index + 1 < len(lines) and re.match(r"^(?:お預|お釣|おつり)", compact(lines[index + 1])):
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
        "請將以下收據中「實際購買的商品明細」擷取為 JSON 陣列，並將商品名稱【務必翻譯成精準、道地的繁體中文（台灣習慣用語）】：\n"
        "重要翻譯與格式規則：\n"
        "1. 【\"name\" 欄位必須是繁體中文，嚴格禁止直接複製日文原名或保留平假名/片假名】！\n"
        "   - 【消費稅率標記去除規則】：日文收據中各品項名稱前面的「内10」、「内8」、「外10」、「外8」、「※10」、「※8」、「※」、「*」、「軽」是日本消費稅率標記（例如「内10 カツカレー」代表含10%內稅），【嚴格禁止將「内10 / 內10 / 内8」當成商品名稱的一部分】！請將「内10」去除：\n"
        "     内10 カツカレー ➔ originalName: \"カツカレー\", name: \"炸豬排咖哩飯\"\n"
        "     内10 単品バーガー ➔ originalName: \"単品バーガー\", name: \"單點漢堡\"\n"
        "     内10セット500 ➔ originalName: \"セット500\", name: \"500號特選套餐\"\n"
        "   - 【嚴格忠於收據文字，禁止幻覺】：品項名稱必須直接對應收據中的商品文字！收據有幾項就輸出幾項，嚴禁腦補收據上不存在的海鮮或菜名！\n"
        "   - 所有日語菜色、海鮮水產、食物、飲品與各類商品必須翻譯成繁體中文（例如：\n"
        "     紅ずわい ➔ 紅楚蟹 / 紅松葉蟹\n"
        "     真ほっけ / ほっけ ➔ 烤真花魚一夜干\n"
        "     明太子 ➔ 明太子\n"
        "     じゃがバター ➔ 奶油馬鈴薯\n"
        "     かに汁 ➔ 螃蟹味噌湯\n"
        "     十カン盛 / ＋カン盛 ➔ 綜合握壽司十貫盛合\n"
        "     蒸し牡蠣2個 / 蒸し牡蠣 ➔ 清蒸牡蠣 (2顆) (注意：蒸し 是清蒸，非蒸烤)\n"
        "     生牡蠣2個 / 生牡蠣 ➔ 鮮生牡蠣 (2顆)\n"
        "     カキコロバーガー ➔ 酥炸牡蠣可樂餅漢堡\n"
        "     牡蠣の空（から）あげ ➔ 酥炸牡蠣唐揚 (厚岸炸牡蠣)\n"
        "     ぷちまるDX牡蠣 ➔ 厚岸小圓米果仙貝 (牡蠣風味)\n"
        "     燻じゃが ➔ 煙燻馬鈴薯脆塊 (盒裝)\n"
        "     厚岸昆布 ➔ 厚岸天然昆布 (120g)\n"
        "     ほたてわかめとろ ➔ 干貝海帶芽昆布絲湯包\n"
        "     かき最中 ➔ 厚岸牡蠣造型最中餅\n"
        "     根布入とろろ昆 / 根昆布 ➔ 根昆布極細昆布絲\n"
        "     金のオイスターソース ➔ 黃金特級蠔油 (厚岸特製)\n"
        "     金のかき醤油 ➔ 黃金厚岸牡蠣醬油\n"
        "     羊羹本練り ➔ 經典本格紅豆羊羹\n"
        "     羊葉小 / 羊羹小豆 ➔ 北海道小豆紅豆羊羹\n"
        "     金のかき醤油入クイー / 金のかき醤油入クッキー ➔ 黃金牡蠣醬油風味餅乾\n"
        "     強力わかもと1000錠 / わかもと ➔ 強力若元錠 (WAKAMOTO 1000錠)\n"
        "     アベンヌシカルFPR / アベンヌ ➔ 雅漾 (Avène) Cicalfate+ 舒緩修護霜\n"
        "     リュウバンヘラツキ / リュウバン ➔ 大木製藥 液體OK繃 附刷棒 (10ml) (注意：リュウバン是液體OK繃，絕非龍膽根)\n"
        "     イトコラコラーゲン低分子ヒアル / イトコラ ➔ 井藤漢方 (ITOH) 低分子玻尿酸膠原蛋白粉 (306g) (注意：イトコラ是井藤漢方製藥，非伊藤園)\n"
        "     バイタルプロテインズ / パイタルプロテインズ ➔ Vital Proteins 膠原蛋白胜肽粉 (120g)\n"
        "     BPバイオマス袋白L / バイオマス袋 ➔ 生物質環保購物袋 (白/L)\n"
        "     軽油 ➔ 柴油 (若有公升數標註，如 柴油 (35.26L) )\n"
        "     レギュラー ➔ 無鉛汽油\n"
        "     ハイオク ➔ 高級無鉛汽油\n"
        "     青皿 ➔ 藍盤壽司 (青皿)\n"
        "     ピンク皿 ➔ 粉紅盤壽司 (粉紅皿)\n"
        "     緑皿 ➔ 綠盤壽司 (綠皿)\n"
        "     花火皿 ➔ 花火盤壽司 (花火皿)\n"
        "     かき（生） ➔ 生牡蠣 (生蠔)\n"
        "     かき（蒸し焼き） ➔ 蒸烤牡蠣\n"
        "     お通し ➔ 開胃小菜\n"
        "     かき（炭火焼きがき） ➔ 炭烤牡蠣 (烤生蠔)\n"
        "     大ホタテ串 ➔ 烤大扇貝串\n"
        "     ホタテバター ➔ 奶油扇貝\n"
        "     マグロのしっぽ焼き ➔ 烤鮪魚尾\n"
        "     カニレタスチャーハン ➔ 蟹肉生菜炒飯\n"
        "     烏賊姿焼き ➔ 烤整隻烏賊\n"
        "     あおさの出汁巻き ➔ 海苔高湯玉子燒\n"
        "     やきとり ➔ 綜合烤雞肉串\n"
        "     とうきび茶 ➔ 玉米茶\n"
        "     マルセイアイスサンド ➔ 丸成冰淇淋夾心三明治\n"
        "     サクサクパイ ➔ 現烤酥脆派\n"
        "     醍醐 ➔ 醍醐生藍莓夾心蛋糕\n"
        "     個人 大人 ➔ 成人門票/全票\n"
        "     MEDIHEAL ➔ MEDIHEAL 疲勞修復機能服\n"
        "     ふわふわフェイスタ ➔ 蓬鬆洗臉毛巾\n"
        "     GIベルト ➔ 黑色GI帆布腰帶\n"
        "     ドライメッシュ ➔ 乾爽網眼短襪\n"
        "     シン・呼吸するインナー ➔ 呼吸透氣內衣\n"
        "     SS SHIRETOKOTOKO T / SHIRETOKOTOKO ➔ The North Face 知床限定 Toko 熊短袖 T 恤 (注意：SS 是短袖 Short Sleeve，SHIRETOKOTOKO 是知床 Toko 熊)\n"
        "     SHARI SOUVENIR T / SOUVENIR T ➔ The North Face 斜里限定紀念短袖 T 恤 (注意：SHARI 是斜里町，SOUVENIR 是紀念品)\n"
        "     ショウヒンブクロギフトダイ / ギフトダイ ➔ 商品禮品紙袋 (大) (注意：ショウヒンブクロ是商品袋，ギフトダイ是禮品大)\n"
        "     UC ドラモッチ アンコ＆ホイップ / どらもっち ➔ LAWSON Uchi Café 爆餡生銅鑼燒 (紅豆鮮奶油) (注意：UC是Uchi Café甜點系列，ドラモッチ是爆餡生銅鑼燒，非單純麻糬)\n"
        "     からあげクン ➔ LAWSON 炸雞塊 (Karage-kun)\n"
        "     プレミアムロールケーキ ➔ LAWSON Uchi Café 頂級鮮奶油生乳捲\n"
        "     バスチー ➔ LAWSON 巴斯克乳酪蛋糕 (Baschee)）。\n"
        "2. 【金額 \"amount\" 必須是該品項的「小計總金額」（Line Total），嚴禁填寫單價】！\n"
        "   - 例如「@165x 5 ¥825」：quantity 為 5，amount 必須填寫 825（絕對不能填單價 165）！\n"
        "   - 例如「@286x 16 ¥4,576」：quantity 為 16，amount 必須填寫 4576！\n"
        "   - 所有品項的 amount 加總必須等於收據總額！\n"
        "3. \"originalName\" 欄位保留收據上的原始日文名稱（去掉分類代碼或符號）。\n"
        "4. 收據開頭的店名/設施名（如 まるとも水産、六花亭 等）是店名，不是購買商品！\n"
        "5. 嚴格禁止將稅額（外消費税、内消費税、税率、小計、合計、点数、お預り、找零おつり）、店鋪資訊、電話、地址、法人登錄番號（登録番号）提取為商品！\n\n"
        "輸出格式必須是純 JSON 陣列，欄位如下：\n"
        "- \"name\": 繁體中文商品名稱 (嚴禁出現日文假名)\n"
        "- \"originalName\": 收據上的原始名稱\n"
        "- \"amount\": 該項小計總額數值 (必須是總額而非單價，不含貨幣符號，必須大於 0)\n"
        "- \"quantity\": 數量整數 (預設 1)\n\n"
        "只輸出純 JSON 陣列，不要任何額外說明或 Markdown 標籤：\n" + ocr_text
    )

    DISH_MAP = {
        "紅ずわい": "紅楚蟹",
        "真ほっけ": "烤真花魚一夜干",
        "ほっけ": "花魚一夜干",
        "じゃがバター": "奶油馬鈴薯",
        "かに汁": "螃蟹味噌湯",
        "十カン盛": "綜合握壽司十貫盛合",
        "＋カン盛": "綜合握壽司十貫盛合",
        "カン盛": "綜合握壽司十貫盛合",
        "蒸し牡蠣": "清蒸牡蠣 (2顆)",
        "生牡蠣": "鮮生牡蠣 (2顆)",
        "カキコロバーガー": "酥炸牡蠣可樂餅漢堡",
        "牡蠣の空": "酥炸牡蠣唐揚 (厚岸炸牡蠣)",
        "空（から）あげ": "酥炸牡蠣唐揚 (厚岸炸牡蠣)",
        "ぷちまるDX牡蠣": "厚岸小圓米果仙貝 (牡蠣風味)",
        "ぷちまる": "厚岸小圓米果仙貝 (牡蠣風味)",
        "燻じゃが": "Calbee 煙燻馬鈴薯脆塊 (盒裝)",
        "厚岸昆布": "厚岸天然昆布 (120g)",
        "ほたてわかめとろ": "干貝海帶芽昆布絲湯包",
        "かき最中": "厚岸牡蠣造型最中餅",
        "根布入とろろ昆": "根昆布極細昆布絲",
        "根昆布": "根昆布極細昆布絲",
        "金のオイスターソース": "黃金特級蠔油 (厚岸特製)",
        "金のかき醤油": "黃金厚岸牡蠣醬油",
        "羊羹本練り": "經典本格紅豆羊羹",
        "羊羹 本練り": "經典本格紅豆羊羹",
        "羊羹小豆": "北海道小豆紅豆羊羹",
        "羊葉小": "北海道小豆紅豆羊羹",
        "金のかき醤油入クイー": "黃金牡蠣醬油風味餅乾 (厚岸限定)",
        "金のかき醤油入クッキー": "黃金牡蠣醬油風味餅乾 (厚岸限定)",
        "青皿": "藍盤壽司 (青皿)",
        "ピンク皿": "粉紅盤壽司 (粉紅皿)",
        "緑皿": "綠盤壽司 (綠皿)",
        "花火皿": "花火盤壽司 (花火皿)",
        "軽油": "柴油",
        "レギュラー": "無鉛汽油",
        "ハイオク": "高級無鉛汽油",
        "かき（生）": "生牡蠣",
        "かき（蒸し焼き）": "蒸烤牡蠣",
        "お通し": "開胃小菜",
        "かき（炭火焼きがき）": "炭烤牡蠣",
        "大ホタテ串": "烤大扇貝串",
        "ホタテバター": "奶油扇貝",
        "マグロのしっぽ焼き": "烤鮪魚尾",
        "カニレタスチャーハン": "蟹肉生菜炒飯",
        "烏賊姿焼き": "烤整隻烏賊",
        "あおさの出汁巻き": "海苔高湯玉子燒",
        "とうきび茶": "玉米茶",
        "サクサクパイ": "現烤酥脆派",
        "マルセイアイスサンド": "丸成冰淇淋夾心三明治",
        "醍醐": "醍醐生藍莓夾心蛋糕",
        "カツカレー": "炸豬排咖哩飯",
        "単品バーガー": "單點漢堡",
        "セット500": "500號特選套餐",
        "バーガー": "漢堡",
        "強力わかもと": "強力若元錠 (WAKAMOTO 1000錠)",
        "わかもと": "強力若元錠 (WAKAMOTO) 1000錠",
        "アベンヌシカル": "雅漾 (Avène) Cicalfate+ 舒緩修護霜",
        "アベンヌ": "雅漾 (Avène) 舒緩修護霜",
        "リュウバン": "大木製藥 液體OK繃 附刷棒 (10ml)",
        "イトコラ": "井藤漢方 (ITOH) 低分子玻尿酸膠原蛋白粉 (306g)",
        "コラーゲン低分子ヒアル": "井藤漢方 (ITOH) 低分子玻尿酸膠原蛋白粉 (306g)",
        "パイタルプロテインズ": "Vital Proteins 膠原蛋白胜肽粉 (120g)",
        "バイタルプロテインズ": "Vital Proteins 膠原蛋白胜肽粉 (120g)",
        "バイオマス袋": "生物質環保購物袋 (白/L)",
        "SHIRETOKOTOKO": "The North Face 知床限定 Toko 熊短袖 T 恤",
        "SHARI SOUVENIR": "The North Face 斜里限定紀念短袖 T 恤",
        "SOUVENIR T": "The North Face 斜里限定紀念短袖 T 恤",
        "ショウヒンブクロギフトダイ": "商品禮品紙袋 (大)",
        "ショウヒンブクロ": "商品禮品紙袋 (大)",
        "ギフトダイ": "商品禮品紙袋 (大)",
        "購物袋禮品大": "商品禮品紙袋 (大)",
        "ドラモッチ": "LAWSON Uchi Café 爆餡生銅鑼燒 (紅豆鮮奶油)",
        "どらもっち": "LAWSON Uchi Café 爆餡生銅鑼燒 (紅豆鮮奶油)",
        "からあげクン": "LAWSON 炸雞塊 (Karage-kun)",
        "プレミアムロールケーキ": "LAWSON Uchi Café 頂級鮮奶油生乳捲",
        "バスチー": "LAWSON 巴斯克乳酪蛋糕 (Baschee)",
    }

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

                # 自動去除日本發票常見的稅率前綴標記 (如: 内10, 内8, 外10, 外8, ※, 軽)
                orig = re.sub(r"^(?:内10|内8|外10|外8|※10|※8|※|＊|\*|軽)\s*", "", orig).strip()
                name = re.sub(r"^(?:內10|内10|內8|内8|外10|外8|※10|※8|※|＊|\*|輕|軽)\s*", "", name).strip()
                try:
                    amt = float(item.get("amount", 0))
                except (ValueError, TypeError):
                    amt = 0
                try:
                    qty = int(item.get("quantity", 1))
                except (ValueError, TypeError):
                    qty = 1
                if (name or orig) and amt > 0:
                    # 若 amount 是單價（例如 amount * qty 的數值存在於收據文本中），自動修正為小計總額
                    if qty > 1 and amt > 0:
                        line_total = round(amt * qty)
                        if f"{line_total:,}" in ocr_text or str(line_total) in ocr_text:
                            amt = line_total
                    clean_amt = int(amt) if amt.is_integer() else amt
                    # 雙重防護：若 LLM 輸出遺漏翻譯仍保留日文平假/片假名，或翻譯不精確
                    final_name = name or orig
                    if final_name == orig or not re.search(r"[\u4e00-\u9fff]", final_name) or re.search(r"[\u3040-\u309f\u30a0-\u30ff]", final_name) or "蒸烤" in final_name or "購物袋禮品" in final_name or "ドラモッチ" in orig or "どらもっち" in orig:
                        for k, v in DISH_MAP.items():
                            if k.lower() in orig.lower() or k.lower() in final_name.lower():
                                final_name = v
                                break
                    result.append({
                        "name": final_name,
                        "originalName": orig,
                        "amount": clean_amt,
                        "quantity": max(1, qty),
                    })
            return result
        return []

    # 1. 主要引擎：MiniMax 雲端 API（極速、精確、繁中翻譯道地）
    minimax_key = _get_minimax_key()
    if minimax_key:
        try:
            payload = {
                "model": "MiniMax-Text-01",
                "max_tokens": 2500,
                "temperature": 0.1,
                "messages": [{"role": "user", "content": prompt}],
            }
            req = urllib.request.Request(
                "https://api.minimax.io/anthropic/v1/messages",
                data=json.dumps(payload).encode("utf-8"),
                headers={"Content-Type": "application/json", "x-api-key": minimax_key, "anthropic-version": "2023-06-01"},
            )
            with urllib.request.urlopen(req, timeout=55) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                raw = data["content"][0]["text"].strip()
                items = parse_items_json(raw)
                if items:
                    print(f"Extracted {len(items)} items via MiniMax (primary)", flush=True)
                    return items
        except Exception as mm_err:
            print(f"MiniMax failed ({mm_err}), falling back to local omlx...", flush=True)

    # 2. 本地備援：本機 omlx (Qwen3.6-35B，斷網/API 異常時 100% 本地離線接手)
    try:
        payload = {
            "model": "Qwen3.6-35B-A3B-Uncensored-Heretic-MLX-4bit",
            "messages": [{"role": "user", "content": prompt}],
            "temperature": 0.1,
        }
        req = urllib.request.Request(
            "http://127.0.0.1:8000/v1/chat/completions",
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json"},
        )
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            raw = data["choices"][0]["message"]["content"].strip()
            items = parse_items_json(raw)
            if items:
                print(f"Extracted {len(items)} items via local omlx fallback", flush=True)
                return items
    except Exception as omlx_err:
        print(f"Local omlx fallback failed: {omlx_err}", flush=True)

    return []


def parse_receipt_text(text: str, extract_items: bool = False) -> dict:
    """Return form-ready receipt data, using null for fields not found."""
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    total = _total(lines)

    def _format_time(tm_match) -> str:
        hr = tm_match.group(1).zfill(2)
        mn = int(tm_match.group(2))
        if mn >= 60:
            mn -= 10
        return f"{hr}:{mn:02d}"

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
                occurred_at = f"{year:04d}-{month:02d}-{day:02d}T{_format_time(tm)}"
                break
            # 2. Check adjacent lines (immediately after or before)
            if i + 1 < len(lines):
                tm = TIME.search(lines[i + 1])
                if tm and not DATE.search(lines[i + 1]):
                    occurred_at = f"{year:04d}-{month:02d}-{day:02d}T{_format_time(tm)}"
                    break
            if i > 0:
                tm = TIME.search(lines[i - 1])
                if tm and not DATE.search(lines[i - 1]):
                    occurred_at = f"{year:04d}-{month:02d}-{day:02d}T{_format_time(tm)}"
                    break
            # Date found without explicit time near it
            occurred_at = f"{year:04d}-{month:02d}-{day:02d}"
            break

    items = extract_and_translate_items(text) if extract_items else []
    if items:
        # If single fuel item with external consumption tax, ensure item amount matches total paid
        if len(items) == 1 and total and total > items[0]["amount"]:
            orig_lower = items[0].get("originalName", "").lower()
            if any(k in orig_lower for k in ("軽油", "ガソリン", "レギュラー", "ハイオク", "燃料")):
                items[0]["amount"] = total
        # Ensure liters are included in fuel name if detected in OCR text
        liters_match = re.search(r"(\d+(?:\.\d+)?)\s*L", text)
        if liters_match:
            l_str = f"{liters_match.group(1)}L"
            for it in items:
                if any(k in it.get("originalName", "") for k in ("軽油", "ガソリン", "レギュラー", "ハイオク")) and l_str not in it["name"]:
                    it["name"] = f"{it['name']} ({l_str})"

        items_sum = sum(it["amount"] for it in items if isinstance(it.get("amount"), (int, float)))
        if items_sum > 0 and (total is None or (total in (5000, 10000, 20000, 50000) and items_sum < total and any(re.search(r"(?:お預|お釣|おつり)", l) for l in lines))):
            total = int(items_sum) if isinstance(items_sum, float) and items_sum.is_integer() else items_sum

    return {
        "description": _description(lines),
        "category": _category(lines),
        "originalAmount": total,
        "currency": _currency(text),
        "occurredAt": occurred_at,
        "items": items,
    }
