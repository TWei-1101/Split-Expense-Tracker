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
    r"(?<!\d)(\d{2}|\d{4})(?:[/-]|年)\s*(\d{1,2})(?:[/-]|月)\s*(\d{1,2})(?:日|月(?!\d))?(?!\d)"
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
    ("麺屋 雪風", ("麺屋 雪風", "麺屋雪風", "雪風", "011-512-3022")),
    ("松屋", ("松屋フーズ", "松屋", "お屋フーズ", "matsuya", "牛めし")),
    ("吉野家", ("吉野家", "yoshinoya")),
    ("すき家", ("すき家", "sukiya")),
    ("彌生軒", ("やよい軒", "彌生軒", "yayoiken")),
    ("大戶屋", ("大戸屋", "大戶屋", "ootoya")),
    ("CoCo壹番屋", ("coco壱番屋", "coco一番屋", "ココイチ", "coco ichibanya")),
    ("北海道大學博物館 咖啡廳 (ぽらす)", ("ミュージアムカフェ ぽらす", "ミュージアムカフェ ぼらす", "ミュージアムカフェぽらす", "ミュージアムカフェぼらす", "ミュージアムカフェ", "ぽらす", "ぼらす", "北海道大学総合博物館", "08018918073", "t9430005003764")),
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
    ("大雪山層雲峽・黑岳空中纜車", ("黒岳ロープウェイ", "黑岳ロープウェイ", "黒岳", "黒缶ロープウェイ", "層雲峡", "りんゆう観光", "01658-5-3031")),
    ("交通通行費", ("nexco", "高速道路", "通行料金", "料金所", "首都高", "阪神高速")),
    ("オカモトセルフ 根室 (加油站)", ("オカモト", "セルフ根室", "0153-29-2125")),
    ("オカモトセルフ 加油站", ("オカモトセルフ", "株式会社オカモト", "オカモト")),
    ("ENEOS 加油站", ("eneos", "エネオス")),
    ("出光 apollostation 加油站", ("apollostation", "アポロステーション", "出光")),
    ("Cosmo 加油站", ("cosmo石油", "コスモ石油", "コスモ", "cosmo")),
    ("ホクレンSS 加油站", ("ホクレンss", "ホクレン")),
)

# Categories are inferred only from purchased-item wording.  Payment methods
# (for example Japanese transit IC money) are deliberately not included.
ITEM_KEYWORDS = (
    ("交通通行費", ("通行料金", "通行料", "高速道路", "料金所", "nexco", "首都高", "阪神高速", "過路費", "通行費")),
    ("拉麵", ("拉麵", "ラーメン", "らーめん", "ramen", "つけ麺", "つけめん", "中華そば", "油そば", "まぜそば")),
    ("餃子", ("餃子", "ギョーザ", "ぎょうざ", "gyoza", "焼き餃子", "焼餃子", "水餃子")),
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
        "拉麵", "ラーメン", "らーめん", "ramen", "つけ麺", "つけめん", "油そば", "まぜそば", "担々麺", "坦々麺", "中華そば", "餃子", "ぎょうざ", "ギョーザ", "焼き餃子", "焼餃子", "水餃子", "麺屋", "麵屋", "製麺", "製麵", "チャーハン", "炒飯", "チャーシュー", "叉燒", "味玉", "壽司", "寿司", "sushi", "咖啡", "カフェ", "coffee", "cafe", "とうきび", "とうきび茶", "お茶", "緑茶", "麦茶",
        "ポカリスエット", "ポカリ", "アクエリアス", "ソフトクリーム", "ソフト", "牛乳", "ミルク", "curry", "カレー",
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
    # Also normalize period or colon used as thousands separator (e.g. 1.700yen, 1:500)
    normalized = re.sub(r"(?<=\d)[:;](?=\d{3}(?:\D|$))", ",", line.replace("，", ","))
    normalized = re.sub(r"(?<=\d)\.(?=\d{3}(?:\D|$))", ",", normalized)
    matches = AMOUNT.findall(normalized)
    if not matches:
        return None
    value = float(matches[-1].replace(",", ""))
    return int(value) if value.is_integer() else value


GENERIC_DOCUMENT_TITLES = frozenset({
    "RECEIPT", "INVOICE", "BILL", "領収", "領収書", "領収証", "レシート", "DETAILS", "TOTAL", "SUBTOTAL", "TAX", "納品書", "納品書（領収書）", "納品書(領収書)",
    "しんせつ第一", "親切第一", "いらっしゃいませ", "毎度ありがとうございます", "ご利用ありがとうございます", "ご利用ありがとうございます。", "ありがとうございます",
    "下記、正に領収いたしました。", "下記、正に領収いたしました", "下記正に領収いたしました", "正に領収いたしました", "正に領収いたしました。",
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
        norm_title = re.sub(r"^[\[\]［］【】()（）]+|[\[\]［］【】()（）]+$", "", cleaned)
        if (cleaned in GENERIC_DOCUMENT_TITLES
                or norm_title in GENERIC_DOCUMENT_TITLES
                or len(stripped) < 2
                or DATE.search(line)
                or TOTAL_LABEL.search(line)
                or re.search(r"^[\d\s\-()]+$", stripped)
                or re.search(r"^[\[\]［］【】()（）\s]*(?:receipt|no\.|tel|fax|date|領収|领收|登録番号|登錄番号|登绿番号)", stripped, re.I)
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
        norm_title = re.sub(r"^[\[\]［］【】()（）]+|[\[\]［］【】()（）]+$", "", cleaned)
        if (cleaned not in GENERIC_DOCUMENT_TITLES
                and norm_title not in GENERIC_DOCUMENT_TITLES
                and not re.search(r"^[\[\]［］【】()（）\s]*(?:receipt|no\.|tel|fax|date|領収|领收|登録番号|登錄番号|登绿番号)", line, re.I)
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


def translate_japanese_items(items_to_translate: list[str], key: str | None = None) -> list[str]:
    """Second-pass translation for any items that still contain Japanese kana."""
    import json
    import urllib.request
    import re

    if not items_to_translate:
        return items_to_translate
    key = key or _get_minimax_key()
    if not key:
        return items_to_translate

    prompt = (
        "請將下列日本發票上的日文商品名，全部翻譯成台灣旅客最熟悉、道地的繁體中文名稱。\n"
        "【強制規定】：嚴格禁止在翻譯後的品名中保留任何日文平假名或片假名（如 ぁ-ん、ァ-ン）！每一個日文字都必須徹底翻譯為繁體中文或品牌英文。\n"
        "常見北海道伴手禮：\n"
        "- ストレートバーム やわらか芽 ➔ 年輪家 經典柔軟年輪蛋糕 (1個入)\n"
        "- マウントバーム しっかり芽 ➔ 年輪家 脆皮結實年輪蛋糕\n"
        "- バームクーヘン ➔ 年輪蛋糕；バーム 單獨出現須依商品上下文判斷，クレンジングバーム 是卸妝膏、ヘアバーム 是髮蠟，不是蛋糕。\n"
        "- マルセイバターケーキ ➔ 六花亭 丸成奶油蛋糕\n"
        "- マルセイバターサンド ➔ 六花亭 蘭姆葡萄奶油夾心餅\n"
        "- 白い恋人 ➔ 白色戀人 (ホワイトブラック為黑白雙色拼裝)\n"
        "- とうきびチョコ ➔ HORI 玉米巧克力棒\n"
        "- じゃがいもコロコロ ➔ HORI 酥脆薯塊米果 (醤油為醬油味，山わさ為山葵味)\n"
        "- じゃがポックル ➔ 薯條三兄弟\n"
        "輸入 JSON 清單：\n" + json.dumps(items_to_translate, ensure_ascii=False) + "\n\n"
        "請輸出純 JSON 陣列（只包含翻譯後的繁體中文字串，順序數量完全一致，不要任何 markdown 或說明文字）："
    )
    payload = {
        "model": "MiniMax-Text-01",
        "max_tokens": 800,
        "temperature": 0.1,
        "messages": [{"role": "user", "content": prompt}],
    }
    req = urllib.request.Request(
        "https://api.minimax.io/anthropic/v1/messages",
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01"},
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            raw = data["content"][0]["text"].strip()
            m = re.search(r"\[\s*.*?\s*\]", raw, re.DOTALL)
            if m:
                res = json.loads(m.group(0))
                if isinstance(res, list) and len(res) == len(items_to_translate):
                    return [str(x).strip() for x in res]
    except Exception as e:
        print("Second pass translation error:", e)
    return items_to_translate


def extract_structured_receipt(ocr_text: str) -> dict:
    """Extract full structured receipt data (merchant, category, total, time, items) via LLM."""
    import json
    import urllib.request
    import re

    prompt = (
        "你是一個精通日本與台灣消費發票與收據的專業記帳分析系統。請從下列收據 OCR 文字中，提取完整的結構化記帳資訊：\n\n"
        "【重要提取規則】：\n"
        "1. description (店家/設施/商戶名稱)：\n"
        "   - 提取實際商戶、餐廳或景點/設施名（例如「北海道大學博物館 咖啡廳 (ぽらす)」、「麵屋 雪風」、「六花亭」）。\n"
        "   - 嚴格排除通用發票抬頭（例如 ［領収書］、［レシート］、領収証、御計算書、納品書 等）。\n"
        "   - 輸出台灣慣用、乾淨的繁體中文或知名商標名稱。\n"
        "2. category (消費分類)：\n"
        "   - 必須嚴格為以下四者之一：\n"
        "     * \"food\": 餐飲、餐廳、拉麵、壽司、海鮮丼、咖啡廳、甜點店、居酒屋、外帶便當、飲料水酒。\n"
        "       【重要判斷準則】：即便是在藥妝店（如サツドラ、ツルハ）、便利商店或超市購買，若購買品項為飲料（如寶礦力水得 ポカリスエット、綠茶、水、果汁、咖啡）、點心甜點、便當熟食等食物飲品（日本 8% 軽減税率商品），消費分類必須判定為 \"food\"（餐飲/飲料），絕不可判定為 other！\n"
        "     * \"transport\": 交通、火車JR、地鐵、公車、計程車、機票、租車、加油站油錢、高速公路過路費、景觀纜車\n"
        "     * \"lodging\": 飯店、商務旅館、民宿、溫泉旅館、住宿稅\n"
        "     * \"other\": 藥妝藥品、美妝保養品、服飾、家電、紀念品、門票、生活雜貨或其他非純食物飲品的一般購物\n"
        "3. originalAmount (總金額)：\n"
        "   - 顧客實際應付的「合計/總計」數字整數 (不可填お預り實收或找零)。\n"
        "4. currency (幣別)：\n"
        "   - 日本通常為 \"JPY\"，台灣為 \"TWD\"，美國為 \"USD\"。\n"
        "5. occurredAt (消費時間)：\n"
        "   - ISO 格式 YYYY-MM-DDTHH:MM，若無時間則填 YYYY-MM-DD。\n"
        "   - 【日期精確校驗】：請務必仔細核對收據上的實際日期與時間（例如 2026年9月19日 14時22分 ➔ 2026-09-19T14:22）。\n"
        "     * 日本熱感點陣收據若有「19月」請識別為「19日」（一年僅12個月，第二個「月」常為「日」之誤識）。\n"
        "     * 勿將「9月」誤判為「2月」或「1月」。\n"
        "6. items (購買商品明細與繁體中文翻譯)：\n"
        "   - 每個品項為物件：\n"
        "     * \"originalName\": 收據上的原始日文字樣 (去掉前面的※、*、軽、内10等稅率標記)。\n"
        "     * \"name\": 【核心任務：將所有日文商品名稱徹底翻譯為台灣慣用的道地繁體中文】！\n"
        "       - 嚴格禁止在 name 欄位殘留任何日文平假名或片假名（如 ぁ-ん、ァ-ン）！\n"
        "       - 即便商品原名包含漢字（例如「牛めし大」、「い・ろ・は・す天然水」、「おにぎり」），也必須將假名徹底翻譯為台灣旅客看得懂的中文或通用品牌英文（例如「牛めし大」➔「松屋牛肉飯 (大碗)」；「い・ろ・は・す天然水」➔「I LOHAS 天然水」；「おにぎり」➔「飯糰」；「豚汁」➔「豬肉蔬菜味噌湯」）。\n"
        "       - 遇知名日本品牌請使用台灣熟悉譯名（例如：ポカリスエット ➔ 寶礦力水得；カルピス ➔ 可爾必思；い・ろ・は・す ➔ I LOHAS 天然水；綾鷹 ➔ 綾鷹綠茶；午後の紅茶 ➔ Kirin 午後紅茶；からあげクン ➔ 炸雞塊；ファミチキ ➔ 全家原味炸雞排）。\n"
        "       - 【消費稅率標記去除規則】：日文收據中各品項名稱前面的「内10」、「内8」、「外10」、「外8」、「※10」、「※8」、「※」、「*」、「軽」是日本消費稅率標記，請將其去除。\n"
        "       - 【日本超商/特有造詞解碼指引】：\n"
        "         * UC ➔ LAWSON Uchi Café 甜點系列品牌\n"
        "         * モチプヨ (もちぷよ) ➔ LAWSON 招牌軟Q麻糬泡芙 (以麻糬口感外皮包覆鮮奶油卡士達)\n"
        "         * ドラモッチ (どらもっち) ➔ LAWSON 爆餡生銅鑼燒 (務必保留真實口味，如蒙布朗為栗子蒙布朗、抹茶、巧克力，絕不可隨意腦補紅豆)\n"
        "         * からあげクン ➔ LAWSON 炸雞塊 (Karage-kun)\n"
        "         * Lチキ ➔ LAWSON 脆皮炸雞排\n"
        "         * ファミチキ ➔ 全家原味無骨炸雞排\n"
        "         * ななチキ / ナナチキ ➔ 7-11 經典炸雞排\n"
        "         * セブンプレミアム ➔ 7-Eleven 頂級自有品牌 (7-Premium)\n"
        "         * ポケぷに (4903333213337) ➔ LOTTE 寶可夢QQ造型水果軟糖 (伊布家族，這是知名軟糖零食，絕非毛絨玩偶！)\n"
        "         * 果汁グミ / カジュウグミ ➔ 明治果汁軟糖 (カジュウグミヨウナシ為洋梨口味)\n"
        "         * 牛めし (牛めし大、牛めし並、牛めし特) ➔ 松屋牛肉飯 (大碗 / 中碗 / 特大碗) 或 牛肉丼\n"
        "         * 豚めし ➔ 松屋豚肉飯 (豬肉丼)\n"
        "         * い・ろ・は・す / いろはす ➔ I LOHAS 日本可口可樂天然水 (例如：い・ろ・は・す天然水540ml ➔ I LOHAS 天然水 540ml)\n"
        "         * サントリー天然水 ➔ Suntory 三得利天然水\n"
        "         * 綾鷹 ➔ 綾鷹綠茶\n"
        "         * 午後の紅茶 ➔ Kirin 午後紅茶\n"
        "         * ストレートバーム / マウントバーム ➔ 年輪家年輪蛋糕；バーム 單獨出現須依上下文判斷，クレンジングバーム 是卸妝膏、ヘアバーム 是髮蠟，不得翻成蛋糕。\n"
        "       - 範例翻譯：\n"
        "         紅ずわい ➔ 紅楚蟹 / 紅松葉蟹\n"
        "         真ほっけ / ほっけ ➔ 烤真花魚一夜干\n"
        "         明太子 ➔ 明太子\n"
        "         じゃがバター ➔ 奶油馬鈴薯\n"
        "         かに汁 ➔ 螃蟹味噌湯\n"
        "         十カン盛 / ＋カン盛 ➔ 綜合握壽司十貫盛合\n"
        "         蒸し牡蠣2個 / 蒸し牡蠣 ➔ 清蒸牡蠣 (2顆)\n"
        "         生牡蠣2個 / 生牡蠣 ➔ 鮮生牡蠣 (2顆)\n"
        "         カキコロバーガー ➔ 酥炸牡蠣可樂餅漢堡\n"
        "         牡蠣の空（から）あげ ➔ 酥炸牡蠣唐揚 (厚岸炸牡蠣)\n"
        "         ぷちまるDX牡蠣 ➔ 厚岸小圓米果仙貝 (牡蠣風味)\n"
        "         燻じゃが ➔ 煙燻馬鈴薯脆塊 (盒裝)\n"
        "         厚岸昆布 ➔ 厚岸天然昆布 (120g)\n"
        "         ほたてわかめとろ ➔ 干貝海帶芽昆布絲湯包\n"
        "         かき最中 ➔ 厚岸牡蠣造型最中餅\n"
        "         根布入とろろ昆 / 根昆布 ➔ 根昆布極細昆布絲\n"
        "         金のオイスターソース ➔ 黃金特級蠔油 (厚岸特製)\n"
        "         金のかき醤油 ➔ 黃金厚岸牡蠣醬油\n"
        "         羊羹本練り ➔ 經典本格紅豆羊羹\n"
        "         羊葉小 / 羊羹小豆 ➔ 北海道小豆紅豆羊羹\n"
        "         金のかき醤油入クイー / 金のかき醤油入クッキー ➔ 黃金牡蠣醬油風味餅乾\n"
        "         強力わかもと1000錠 / わかもと ➔ 強力若元錠 (WAKAMOTO 1000錠)\n"
        "         アベンヌシカルFPR / アベンヌ ➔ 雅漾 (Avène) Cicalfate+ 舒緩修護霜\n"
        "         リュウバンヘラツキ / リュウバン ➔ 大木製藥 液體OK繃 附刷棒 (10ml)\n"
        "         イトコラコラーゲン低分子ヒアル / イトコラ ➔ 井藤漢方 (ITOH) 低分子玻尿酸膠原蛋白粉 (306g)\n"
        "         バイタルプロテインズ / パイタルプロテインズ ➔ Vital Proteins 膠原蛋白胜肽粉 (120g)\n"
        "         BPバイオマス袋白L / バイオマス袋 ➔ 生物質環保購物袋 (白/L)\n"
        "         軽油 ➔ 柴油 (若有公升數標註，如 柴油 (35.26L) )\n"
        "         レギュラー ➔ 無鉛汽油\n"
        "         ハイオク ➔ 高級無鉛汽油\n"
        "         青皿 ➔ 藍盤壽司 (青皿)\n"
        "         ピンク皿 ➔ 粉紅盤壽司 (粉紅皿)\n"
        "         緑皿 ➔ 綠盤壽司 (綠皿)\n"
        "         花火皿 ➔ 花火盤壽司 (花火皿)\n"
        "         かき（生） ➔ 生牡蠣 (生蠔)\n"
        "         かき（蒸し焼き） ➔ 蒸烤牡蠣\n"
        "         お通し ➔ 開胃小菜\n"
        "         恐竜足跡カレー ➔ originalName: \"恐竜足跡カレー\", name: \"恐龍足跡咖哩飯\"\n"
        "         ポカリスエット 500ml / ポカリスエット ➔ originalName: \"ポカリスエット 500ml\", name: \"寶礦力水得 500ml\" (注意：寶礦力水得是電解質運動飲料)\n"
        "         北大牛乳 COLD ➔ originalName: \"北大牛乳 COLD\", name: \"北大冰鮮奶\" (注意：北大是北海道大學牧場鮮奶)\n"
        "         コーン西興部のソフトクリーム / コーン西興部のソフトクリー等 ➔ originalName: \"コーン西興部のソフトクリーム\", name: \"西興部甜筒牛奶霜淇淋\" (注意：コーン在冰品為甜筒Cone而非玉米Corn)\n"
        "     * \"originalName\": 收據日文原名 (去掉稅率標記如内10)\n"
        "     * \"amount\": 該品項小計總額數值 (必須大於 0，【嚴禁填寫單價】)\n"
        "     * \"quantity\": 數量整數 (預設 1)\n\n"
        "請輸出純 JSON 物件（不要任何 markdown 或說明文字）：\n"
        "{\n"
        "  \"description\": \"...\",\n"
        "  \"category\": \"food|transport|lodging|other\",\n"
        "  \"originalAmount\": 0,\n"
        "  \"currency\": \"JPY\",\n"
        "  \"occurredAt\": \"YYYY-MM-DDTHH:MM\",\n"
        "  \"items\": [\n"
        "    {\"name\": \"...\", \"originalName\": \"...\", \"amount\": 0, \"quantity\": 1}\n"
        "  ]\n"
        "}\n\n"
        "收據內容：\n" + ocr_text
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
        "恐竜足跡カレー": "恐龍足跡咖哩飯",
        "恐竜足跡": "恐龍足跡咖哩飯",
        "ポケぷに": "LOTTE 寶可夢QQ造型水果軟糖 (伊布家族)",
        "果汁グミspecial": "明治果汁軟糖 (Special)",
        "果汁グミ": "明治果汁軟糖",
        "カジュウグミヨウナシ": "明治果汁軟糖 (洋梨口味)",
        "カジュウグミ": "明治果汁軟糖",
        "牛めし大": "松屋牛肉飯 (大碗)",
        "牛めし並": "松屋牛肉飯 (中碗)",
        "牛めし特": "松屋牛肉飯 (特大碗)",
        "牛めし小": "松屋牛肉飯 (小碗)",
        "牛めし": "松屋牛肉飯 (牛丼)",
        "豚めし大": "松屋豚肉飯 (大碗)",
        "豚めし並": "松屋豚肉飯 (中碗)",
        "豚めし": "松屋豚肉飯 (豬肉丼)",
        "い・ろ・は・す": "I LOHAS 天然水",
        "いろはす": "I LOHAS 天然水",
        "サントリー天然水": "Suntory 天然水",
        "南アルプス": "Suntory 南阿爾卑斯天然水",
        "綾鷹": "綾鷹 綠茶",
        "お〜いお茶": "伊藤園 綠茶",
        "おーいお茶": "伊藤園 綠茶",
        "生茶": "Kirin 生茶",
        "午後の紅茶": "Kirin 午後紅茶",
        "カルピス": "可爾必思",
        "ポカリスエット": "寶礦力水得 500ml",
        "ポカリ": "寶礦力水得",
        "アクエリアス": "水份補給飲料 (Aquarius)",
        "北大牛乳": "北大冰鮮奶",
        "西興部": "西興部甜筒牛奶霜淇淋",
        "ソフトクリー": "西興部甜筒牛奶霜淇淋",
        "かき（炭火焼きがき）": "炭烤牡蠣",
        "大ホタテ串": "烤大扇貝串",
        "ホタテバター": "奶油扇貝",
        "マグロのしっぽ焼き": "烤鮪魚尾",
        "カニレタスチャーハン": "蟹肉生菜炒飯",
        "烏賊姿焼き": "烤整隻烏賊",
        "あおさの出汁巻き": "海苔高湯玉子燒",
        "やきとり": "綜合烤雞肉串",
        "とうきび茶": "玉米茶",
        "マルセイアイスサンド": "丸成冰淇淋夾心三明治",
        "マルセイバターケーキ": "六花亭 丸成奶油蛋糕",
        "マルセイバターサンド": "六花亭 蘭姆葡萄奶油夾心餅",
        "ストレートバームやわらか芽": "年輪家 經典柔軟年輪蛋糕 (1個入)",
        "ストレートバーム": "年輪家 經典柔軟年輪蛋糕",
        "マウントバームしっかり芽": "年輪家 脆皮結實年輪蛋糕",
        "マウントバーム": "年輪家 脆皮結實年輪蛋糕",
        "やわらか芽": "年輪家 經典柔軟年輪蛋糕",
        "しっかり芽": "年輪家 脆皮結實年輪蛋糕",
        "バームクーヘン": "年輪蛋糕",
        "白い恋人": "白色戀人",
        "とうきびチョコ キャラメル": "HORI 焦糖玉米巧克力棒",
        "とうきびチョコ": "HORI 玉米巧克力棒",
        "じゃがいもコロコロ 醤油": "HORI 酥脆薯塊米果 (醬油味)",
        "じゃがいもコロコロ 山わさ": "HORI 酥脆薯塊米果 (山葵味)",
        "じゃがいもコロコロ": "HORI 酥脆薯塊米果",
        "じゃがポックル": "Calbee 薯條三兄弟",
        "美冬": "美冬 夾心千層酥",
        "白いブラックサンダー": "白雷神巧克力",
        "サクサクパイ": "現烤酥脆派",
        "醍醐": "醍醐生藍莓夾心蛋糕",
        "個人 大人": "成人門票/全票",
        "MEDIHEAL": "MEDIHEAL 疲勞修復機能服",
        "ふわふわフェイスタ": "蓬鬆洗臉毛巾",
        "GIベルト": "黑色GI帆布腰帶",
        "ドライメッシュ": "乾爽網眼短襪",
        "シン・呼吸するインナー": "呼吸透氣內衣",
        "SS SHIRETOKOTOKO T / SHIRETOKOTOKO": "The North Face 知床限定 Toko 熊短袖 T 恤",
        "SHARI SOUVENIR": "The North Face 斜里限定紀念短袖 T 恤",
        "SOUVENIR T": "The North Face 斜里限定紀念短袖 T 恤",
        "ショウヒンブクロギフトダイ": "商品禮品紙袋 (大)",
        "ショウヒンブクロ": "商品禮品紙袋 (大)",
        "ギフトダイ": "商品禮品紙袋 (大)",
        "購物袋禮品大": "商品禮品紙袋 (大)",
        "ドラモッチ モンブラン": "LAWSON Uchi Café 爆餡生銅鑼燒 (栗子蒙布朗)",
        "ドラモッチモンブラン": "LAWSON Uchi Café 爆餡生銅鑼燒 (栗子蒙布朗)",
        "どらもっち モンブラン": "LAWSON Uchi Café 爆餡生銅鑼燒 (栗子蒙布朗)",
        "どらもっちモンブラン": "LAWSON Uchi Café 爆餡生銅鑼燒 (栗子蒙布朗)",
        "ドラモッチ アンコ＆ホイップ": "LAWSON Uchi Café 爆餡生銅鑼燒 (紅豆鮮奶油)",
        "どらもっち アンコ＆ホイップ": "LAWSON Uchi Café 爆餡生銅鑼燒 (紅豆鮮奶油)",
        "ドラモッチ": "LAWSON Uchi Café 爆餡生銅鑼燒",
        "どらもっち": "LAWSON Uchi Café 爆餡生銅鑼燒",
        "モチプヨ": "LAWSON Uchi Café 軟Q麻糬泡芙 (北海道產鮮奶油)",
        "もちぷよ": "LAWSON Uchi Café 軟Q麻糬泡芙 (北海道產鮮奶油)",
        "ヨツバノムヨーグルト": "四葉 (よつ葉) 喝的優酪乳 (溫和微甜)",
        "ノムヨーグルト": "喝的優酪乳 (優格飲)",
        "飲むヨーグルト": "喝的優酪乳 (優格飲)",
        "セット大人往復": "黑岳纜車＋雙人吊椅 成人往返套票",
        "大人往復": "黑岳纜車 成人往返套票",
        "からあげクン": "LAWSON 炸雞塊 (Karage-kun)",
        "プレミアムロールケーキ": "LAWSON Uchi Café 頂級鮮奶油生乳捲",
        "バスチー": "LAWSON 巴斯克乳酪蛋糕 (Baschee)",
    }

    def process_items(raw_items: list) -> list[dict]:
        if not isinstance(raw_items, list):
            return []
        result = []
        for item in raw_items:
            if not isinstance(item, dict):
                continue
            name = str(item.get("name", "")).strip()
            orig = str(item.get("originalName", "")).strip()

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
                if qty > 1 and amt > 0:
                    line_total = round(amt * qty)
                    if f"{line_total:,}" in ocr_text or str(line_total) in ocr_text:
                        amt = line_total
                clean_amt = int(amt) if amt.is_integer() else amt
                final_name = name or orig
                if (final_name == orig or not re.search(r"[\u4e00-\u9fff]", final_name)
                        or re.search(r"[\u3040-\u309f\u30a0-\u30ff]", final_name)
                        or any(k in orig for k in ("ドラモッチ", "どらもっち", "モチプヨ", "もちぷよ", "ヨツバ", "よつ葉", "ヨーグルト", "大人往復", "セット大人", "恐竜足跡", "北大牛乳", "西興部"))
                        or any(k in final_name for k in ("蒸烤", "購物袋禮品", "軟糖", "溫和鮮奶", "玉米冰淇淋"))):
                    for k, v in DISH_MAP.items():
                        if k.lower() in orig.lower() or k.lower() in final_name.lower():
                            final_name = v
                            break
                if any(k in orig for k in ("ドラモッチ", "どらもっち")):
                    if any(k in orig for k in ("モンブラン", "モンフ")) or any(k in final_name for k in ("蒙布朗", "栗子")):
                        final_name = "LAWSON Uchi Café 爆餡生銅鑼燒 (栗子蒙布朗)"
                    elif any(k in orig for k in ("アンコ", "あんこ")) or "紅豆" in final_name:
                        final_name = "LAWSON Uchi Café 爆餡生銅鑼燒 (紅豆鮮奶油)"
                    elif "爆餡生銅鑼燒" not in final_name:
                        final_name = "LAWSON Uchi Café 爆餡生銅鑼燒"
                if "モチプヨ" in orig or "もちぷよ" in orig:
                    final_name = "LAWSON Uchi Café 軟Q麻糬泡芙 (北海道產鮮奶油)"
                if re.search(r"牛めし", orig) or re.search(r"牛めし", final_name):
                    size = "大碗" if ("大" in orig or "大" in final_name) else ("特大碗" if ("特" in orig or "特" in final_name) else ("中碗" if ("並" in orig or "並" in final_name) else ""))
                    final_name = f"松屋牛肉飯 ({size})" if size else "松屋牛肉飯 (牛丼)"
                elif re.search(r"豚めし", orig) or re.search(r"豚めし", final_name):
                    size = "大碗" if ("大" in orig or "大" in final_name) else ("特大碗" if ("特" in orig or "特" in final_name) else ("中碗" if ("並" in orig or "並" in final_name) else ""))
                    final_name = f"松屋豚肉飯 ({size})" if size else "松屋豚肉飯 (豬肉丼)"
                if re.search(r"い・ろ・は・す|いろはす|ｲﾛﾊｽ", orig) or re.search(r"い・ろ・は・す|いろはす|ｲﾛﾊｽ", final_name):
                    vol_m = re.search(r"(\d+(?:\.\d+)?\s*(?:ml|l|ML|L))", orig + " " + final_name)
                    vol = f" {vol_m.group(1)}" if vol_m else ""
                    final_name = f"I LOHAS 天然水{vol}".strip()
                if "牛乳" in orig and "北大" in ocr_text and "北大" not in final_name:
                    final_name = "北大冰鮮奶"
                if "西興部" in orig or "西興部" in final_name or "玉米冰淇淋" in final_name:
                    final_name = "西興部甜筒牛奶霜淇淋"
                if any(k in orig for k in ("ストレートバーム", "マウントバーム", "やわらか芽", "しっかり芽")):
                    if any(k in orig for k in ("やわらか", "ストレート")):
                        final_name = "年輪家 經典柔軟年輪蛋糕 (1個入)"
                    elif any(k in orig for k in ("しっかり", "マウント")):
                        final_name = "年輪家 脆皮結實年輪蛋糕"
                    else:
                        final_name = "年輪家 年輪蛋糕"
                elif "バームクーヘン" in orig:
                    final_name = "年輪蛋糕"
                result.append({
                    "name": final_name,
                    "originalName": orig,
                    "amount": clean_amt,
                    "quantity": max(1, qty),
                })

        # Second-Pass: Translate any remaining items that still contain Japanese kana
        untranslated = [
            (idx, it["name"])
            for idx, it in enumerate(result)
            if re.search(r"[\u3040-\u309f\u30a0-\u30ff]", it["name"])
        ]
        if untranslated and minimax_key:
            names_to_translate = [name for _, name in untranslated]
            translated_names = translate_japanese_items(names_to_translate, minimax_key)
            for (idx, _), trans in zip(untranslated, translated_names):
                result[idx]["name"] = trans

        return result

    def parse_payload(raw_text: str) -> dict:
        m_obj = re.search(r"\{.*\}", raw_text, re.DOTALL)
        if m_obj:
            try:
                data = json.loads(m_obj.group(0))
                if isinstance(data, dict):
                    data["items"] = process_items(data.get("items", []))
                    return data
            except Exception:
                pass
        m_arr = re.search(r"\[.*\]", raw_text, re.DOTALL)
        if m_arr:
            try:
                arr = json.loads(m_arr.group(0))
                if isinstance(arr, list):
                    return {"items": process_items(arr)}
            except Exception:
                pass
        return {}

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
                res = parse_payload(raw)
                if res.get("items") or res.get("description"):
                    print(f"Extracted structured receipt via MiniMax (primary): {res.get('description', '')}, items={len(res.get('items', []))}", flush=True)
                    return res
        except Exception as mm_err:
            print(f"MiniMax failed ({mm_err}), falling back to local omlx...", flush=True)

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
            res = parse_payload(raw)
            if res.get("items") or res.get("description"):
                print(f"Extracted structured receipt via local omlx fallback: {res.get('description', '')}, items={len(res.get('items', []))}", flush=True)
                return res
    except Exception as omlx_err:
        print(f"Local omlx fallback failed: {omlx_err}", flush=True)

    return {}


def extract_and_translate_items(ocr_text: str) -> list[dict]:
    """Extract individual purchased items and translate names to Traditional Chinese via local or cloud AI."""
    res = extract_structured_receipt(ocr_text)
    return res.get("items", [])


def parse_receipt_text(text: str, extract_items: bool = False) -> dict:
    """Return form-ready receipt data, using null for fields not found."""
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    base_total = _total(lines)

    def _format_time(tm_match) -> str:
        hr = tm_match.group(1).zfill(2)
        mn = int(tm_match.group(2))
        if mn >= 60:
            mn -= 10
        return f"{hr}:{mn:02d}"

    occurred_at = None
    for i, line in enumerate(lines):
        clean_line = re.sub(r"(?<=\s)[1|lI](0[0-9]:[0-5][0-9])", r"\1", line)
        clean_line = re.sub(r"(\d{2,4}年\s*\d{1,2}月\s*\d{1,2})月", r"\1日", clean_line)
        m = DATE.search(clean_line)
        if m:
            year, month, day = map(int, m.groups())
            if year < 100:
                year += 2000
            if not (1 <= month <= 12 and 1 <= day <= 31):
                continue
            tm = TIME.search(clean_line[m.end():]) or TIME.search(clean_line[:m.start()])
            if tm:
                occurred_at = f"{year:04d}-{month:02d}-{day:02d}T{_format_time(tm)}"
                break
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
            occurred_at = f"{year:04d}-{month:02d}-{day:02d}"
            break

    base_desc = _description(lines)
    base_cat = _category(lines)
    base_curr = _currency(text)
    total = base_total

    if not extract_items:
        return {
            "description": base_desc,
            "category": base_cat,
            "originalAmount": total,
            "currency": base_curr,
            "occurredAt": occurred_at,
            "items": [],
        }

    structured = extract_structured_receipt(text)
    items = structured.get("items", [])

    known_merchant = None
    receipt_text_lower = text.casefold()
    for label, keywords in MERCHANT_KEYWORDS + FOOD_MERCHANTS + HOTEL_MERCHANTS + TRANSPORT_MERCHANTS:
        if any(keyword.casefold() in receipt_text_lower for keyword in keywords):
            known_merchant = label
            break

    valid_llm_desc = None
    if structured.get("description"):
        llm_desc = str(structured["description"]).strip()
        cleaned_llm = re.sub(r"[\s\u3000=<-]+", "", llm_desc).upper()
        norm_llm = re.sub(r"^[\[\]［］【】()（）]+|[\[\]［］【】()（）]+$", "", cleaned_llm)
        if (cleaned_llm not in GENERIC_DOCUMENT_TITLES and norm_llm not in GENERIC_DOCUMENT_TITLES
                and not re.search(r"^[\[\]［］【】()（）\s]*(?:receipt|no\.|tel|fax|date|領収|领收|登録番号|登錄番号|登绿番号)", llm_desc, re.I)
                and len(llm_desc) >= 2):
            valid_llm_desc = llm_desc

    if valid_llm_desc:
        desc_clean = valid_llm_desc
        if any(k in desc_clean.lower() for k in ("don quijote", "donki", "ドンキ", "ドン・キホーテ", "ドンキホーテ")):
            desc_clean = re.sub(r"(?i)don\s*quijote|donki|ドン・キホーテ|ドンキホーテ|ドンキ", "唐吉訶德", desc_clean)
        if any(k in desc_clean.lower() for k in ("サツドラ", "サッポロドラッグ", "satsudora")):
            desc_clean = re.sub(r"(?i)サツドラ|サッポロドラッグ|satsudora", "札幌藥妝", desc_clean)
        if any(k in desc_clean.lower() for k in ("ツルハドラッグ", "ツルハ", "tsuruha")):
            desc_clean = re.sub(r"(?i)ツルハドラッグ|ツルハ|tsuruha", "鶴羽藥妝", desc_clean)
        if any(k in desc_clean.lower() for k in ("マツモトキヨシ", "マツキヨ", "matsukiyo", "matsumoto kiyoshi")):
            desc_clean = re.sub(r"(?i)マツモトキヨシ|マツキヨ|matsukiyo|matsumoto\s*kiyoshi", "松本清", desc_clean)
        if any(k in desc_clean.lower() for k in ("お屋フーズ", "松屋フーズ", "松屋")):
            desc_clean = re.sub(r"(?i)（株）\s*|株式会社\s*|お屋フーズ|松屋フーズ", "松屋", desc_clean).strip()
            desc_clean = re.sub(r"\s+", " ", desc_clean)
        if any(k in desc_clean.lower() for k in ("cosmo", "コスモ", "北日本エネルギー")):
            branch = re.search(r"(千歳空港\s*SS|[\u4e00-\u9fffA-Za-z0-9]+SS)", desc_clean)
            branch_str = f" {branch.group(1)}" if branch else ""
            desc_clean = f"Cosmo 加油站{branch_str}".strip()
        description = desc_clean
    elif known_merchant:
        description = known_merchant
    else:
        description = base_desc

    # Reconcile Category
    is_pure_8_percent = bool(
        re.search(r"(?:8%|８％|軽減)", receipt_text_lower)
        and not re.search(r"(?:10%|１０％|標準税率)", receipt_text_lower)
    )

    has_non_food = any(
        any(k in (it.get("originalName", "") + it.get("name", "")).lower()
            for k in ("錠", "カプセル", "化粧", "マスク", "インナー", "tシャツ", "パンツ", "ソックス", "洗剤", "洗劑", "シャンプー", "薬品", "医薬", "湿布", "膏藥", "包帯", "リップ", "サプリ", "ビタミン"))
        for it in items
    )

    has_food_item = any(
        any(k in (it.get("originalName", "") + it.get("name", "")).lower()
            for k in ("バームクーヘン", "年輪", "ケーキ", "蛋糕", "クッキー", "餅乾", "チョコ", "巧克力", "コロコロ", "米果", "プリン", "布丁", "パン", "麵包", "茶", "水", "珈琲", "咖啡", "肉", "丼", "飯", "麺", "拉麵"))
        for it in items
    )

    if (structured.get("category") == "food" or is_pure_8_percent or has_food_item) and not has_non_food:
        category = "food"
    elif any(keyword.casefold() in receipt_text_lower for _, keywords in RETAIL_MERCHANTS for keyword in keywords):
        category = "other"
    elif any(keyword.casefold() in receipt_text_lower for _, keywords in FOOD_MERCHANTS for keyword in keywords):
        category = "food"
    elif any(keyword.casefold() in receipt_text_lower for _, keywords in HOTEL_MERCHANTS for keyword in keywords):
        category = "lodging"
    elif any(keyword.casefold() in receipt_text_lower for _, keywords in TRANSPORT_MERCHANTS for keyword in keywords):
        category = "transport"
    elif structured.get("category") in ("food", "transport", "lodging", "other"):
        category = structured["category"]
    else:
        category = base_cat

    if items:
        if len(items) == 1 and total and total > items[0]["amount"]:
            orig_lower = items[0].get("originalName", "").lower()
            if any(k in orig_lower for k in ("軽油", "ガソリン", "レギュラー", "ハイオク", "燃料")):
                items[0]["amount"] = total
        liters_match = re.search(r"(\d+(?:\.\d+)?)\s*L", text)
        if liters_match:
            l_str = f"{liters_match.group(1)}L"
            for it in items:
                if any(k in it.get("originalName", "") for k in ("軽油", "ガソリン", "レギュラー", "ハイオク")) and l_str not in it["name"]:
                    it["name"] = f"{it['name']} ({l_str})"

        items_sum = sum(it["amount"] for it in items if isinstance(it.get("amount"), (int, float)))
        if items_sum > 0:
            if total is None or (total in (5000, 10000, 20000, 50000) and items_sum < total and any(re.search(r"(?:お預|お釣|おつり)", l) for l in lines)):
                total = int(items_sum) if isinstance(items_sum, float) and items_sum.is_integer() else items_sum
            elif total != items_sum and structured.get("originalAmount") == items_sum:
                total = int(items_sum) if isinstance(items_sum, float) and items_sum.is_integer() else items_sum
    elif total is None and structured.get("originalAmount"):
        try:
            val = float(structured["originalAmount"])
            total = int(val) if val.is_integer() else val
        except (ValueError, TypeError):
            pass

    if occurred_at and "T" not in occurred_at and structured.get("occurredAt") and "T" in str(structured["occurredAt"]):
        occurred_at = str(structured["occurredAt"]).strip()
    elif not occurred_at and structured.get("occurredAt"):
        occurred_at = str(structured["occurredAt"]).strip()

    currency = base_curr or structured.get("currency") or "JPY"

    return {
        "description": description,
        "category": category,
        "originalAmount": total,
        "currency": currency,
        "occurredAt": occurred_at,
        "items": items,
    }
