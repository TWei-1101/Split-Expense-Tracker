import sys
from pathlib import Path
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from parser import parse_receipt_text


class ReceiptParserTests(unittest.TestCase):
    def test_parses_taiwan_receipt_total_date_currency_and_merchant(self):
        result = parse_receipt_text("""全家便利商店
發票日期 2026/08/12
茶葉蛋 2 20
鮮奶 65
總計 NT$ 85
""")

        self.assertEqual(result, {
            "description": "全家",
            "category": "other",
            "originalAmount": 85,
            "currency": "TWD",
            "occurredAt": "2026-08-12T12:00",
        })

    def test_prefers_labeled_total_over_line_item_amounts(self):
        result = parse_receipt_text("""TOKYO CAFE
2026-07-01
Coffee 500
Cake 700
TOTAL JPY 1,200
""")

        self.assertEqual(result["originalAmount"], 1200)
        self.assertEqual(result["currency"], "JPY")
        self.assertEqual(result["occurredAt"], "2026-07-01T12:00")

    def test_parses_japanese_7eleven_receipt_from_rapidocr_output(self):
        result = parse_receipt_text("""C.CAr-C.ca
SIVENSNOINGS
千代田店
东京都千代田区二番町8一8
電話：03-1234-5678
2019年10月01日（火）08:45
手卷辛子明太子
*130
小計（税拔8%）
￥270
消費税等（8%）
￥21
小
計（税达10%）
￥490
小
計（非課税）
￥50
計
￥1,161
nanaco支
￥1，139
""")

        self.assertEqual(result, {
            "description": "7-Eleven",
            "category": "food",
            "originalAmount": 1161,
            "currency": "JPY",
            "occurredAt": "2019-10-01T08:45",
        })

    def test_parses_japanese_total_when_ocr_inserts_spaces_and_fullwidth_comma(self):
        # RapidOCR may split the label and use a fullwidth comma on a Japanese
        # receipt; this must not make the parser fall back to a line item.
        result = parse_receipt_text("""千代田店
2019年10月01日（火）08:45
小 計
￥100
合 計
￥1，161
""")

        self.assertEqual(result["originalAmount"], 1161)
        self.assertEqual(result["currency"], "JPY")

    def test_uses_matched_category_keyword_as_description(self):
        result = parse_receipt_text("""7-Eleven 千代田店
2019年10月01日 08:45
おにぎり ￥130
合計 ￥1,161
""")

        self.assertEqual(result["description"], "7-Eleven")

    def test_store_or_payment_method_does_not_decide_category(self):
        result = parse_receipt_text("""FamilyMart
交通系支
￥322
合計
￥328
""")

        self.assertEqual(result["description"], "全家")
        self.assertEqual(result["category"], "other")

    def test_falls_back_to_largest_yen_charge_when_final_total_label_is_lost(self):
        # A narrow mobile upload can make RapidOCR miss the isolated 計 label.
        # The fallback must not choose the later nanaco payment or cashless
        # rebate, both of which are also yen-marked amounts.
        result = parse_receipt_text("""千代田店
2019年10月01日（火）08:45
小計（税抜8%）
￥270
消費税等（8%）
￥21
文字化け
￥1，161
還元額
￥22
nanaco支
￥1，139
""")

        self.assertEqual(result["originalAmount"], 1161)

    def test_repairs_7eleven_total_when_ocr_drops_its_leading_digit(self):
        result = parse_receipt_text("""千代田店
nanaco支
￥1，139
還元額
-22
計
￥161
""")

        self.assertEqual(result["originalAmount"], 1161)

    def test_parses_total_amount_and_yen_suffix(self):
        result = parse_receipt_text("""RECEIPT
Date 2026/09/11
Richmond Hotel Obihiro Ekimae
Total amount
1,700yen
Payment
2.000yen(cash)
Change
300yen(cash)
""")

        self.assertEqual(result["description"], "飯店")
        self.assertEqual(result["category"], "lodging")
        self.assertEqual(result["originalAmount"], 1700)
        self.assertEqual(result["currency"], "JPY")
        self.assertEqual(result["occurredAt"], "2026-09-11T12:00")

    def test_parses_thousands_dot_separator_total(self):
        result = parse_receipt_text("""details
Total
1.700yen
""")

        self.assertEqual(result["originalAmount"], 1700)
        self.assertEqual(result["currency"], "JPY")

    def test_yen_fallback_ignores_cash_payment_and_change(self):
        result = parse_receipt_text("""Richmond Hotel
Parking fee
800yen
Accommodation Tax
900yen
Payment
2.000yen(cash)
Change
300yen(cash)
""")

        self.assertEqual(result["originalAmount"], 900)
        self.assertEqual(result["currency"], "JPY")

    def test_returns_nulls_when_text_has_no_reliable_fields(self):
        self.assertEqual(parse_receipt_text("模糊收據\n看不清楚"), {
            "description": "模糊收據",
            "category": "other",
            "originalAmount": None,
            "currency": "TWD",
            "occurredAt": None,
        })


if __name__ == "__main__":
    unittest.main()
