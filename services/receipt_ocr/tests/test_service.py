import sys
from pathlib import Path
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from server import MAX_IMAGE_BYTES, allowed_origin, validate_upload


class ReceiptServiceSafetyTests(unittest.TestCase):
    def test_only_configured_expense_sites_are_allowed_by_default(self):
        self.assertTrue(allowed_origin("https://expense.771101.xyz"))
        self.assertTrue(allowed_origin("https://expense-test.771101.xyz"))
        self.assertFalse(allowed_origin("https://evil.example"))

    def test_upload_requires_supported_image_and_stays_under_limit(self):
        self.assertIsNone(validate_upload("image/jpeg", MAX_IMAGE_BYTES))
        self.assertEqual(validate_upload("application/pdf", 100), "unsupported_media_type")
        self.assertEqual(validate_upload("image/png", MAX_IMAGE_BYTES + 1), "payload_too_large")


if __name__ == "__main__":
    unittest.main()
