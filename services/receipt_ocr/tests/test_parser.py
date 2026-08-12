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
            "description": "全家便利商店",
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

    def test_returns_nulls_when_text_has_no_reliable_fields(self):
        self.assertEqual(parse_receipt_text("模糊收據\n看不清楚"), {
            "description": "模糊收據",
            "originalAmount": None,
            "currency": "TWD",
            "occurredAt": None,
        })


if __name__ == "__main__":
    unittest.main()
