import io
import json
import sys
from pathlib import Path
import unittest
import threading
import urllib.request
from http.server import ThreadingHTTPServer
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from receipt_quality import build_document, receipt_warnings
from parser import extract_structured_receipt, parse_receipt_text, translate_japanese_items
from server import make_handler


def response(payload):
    return io.BytesIO(json.dumps({'choices': [{'message': {'content': json.dumps(payload)}}]}).encode())


class QualityTests(unittest.TestCase):
    def test_http_preserves_ocr_evidence_and_low_confidence_warning(self):
        document = build_document([dict(text='Milk 100', x=0, y=0, h=10, w=100, confidence=.6)], 'test')
        for raw in (document, 'Milk 100'):
            with self.subTest(document=isinstance(raw, dict)), patch('server.parse_receipt_text', return_value={
                'originalAmount': 100, 'items': [], 'warnings': [],
            }):
                httpd = ThreadingHTTPServer(('127.0.0.1', 0), make_handler(token_verifier=lambda _: {}, ocr=lambda _: raw))
                thread = threading.Thread(target=httpd.serve_forever, daemon=True)
                thread.start()
                try:
                    request = urllib.request.Request(f'http://127.0.0.1:{httpd.server_port}/v1/receipts:parse',
                        data=b'test image', headers={'Content-Type': 'image/jpeg', 'Origin': 'https://expense.771101.xyz'})
                    with urllib.request.urlopen(request, timeout=5) as reply:
                        result = json.load(reply)
                    self.assertEqual(result['originalAmount'], 100)
                    if isinstance(raw, dict):
                        self.assertEqual(result['ocr'], document)
                        self.assertTrue(result['needsReview'])
                        self.assertIn('信心偏低', result['warnings'][0])
                    else:
                        self.assertNotIn('ocr', result)
                finally:
                    httpd.shutdown()
                    httpd.server_close()
                    thread.join(timeout=5)

    def test_tall_receipt_rows_stay_separate_and_amounts_follow_names(self):
        def box(text, x, y, confidence=0.95):
            return dict(text=text, x=x, y=y, h=0.008, w=0.1, confidence=confidence)
        document = build_document([box('200', .8, .111), box('100', .8, .101),
                                   box('Apple', .1, .1), box('Milk', .1, .11, .6)], 'test')
        self.assertEqual(document['text'], 'Apple 100\nMilk 200')
        self.assertEqual(document['lines'][1]['boxes'][0]['confidence'], .6)

    def test_pixel_coordinates_use_same_row_logic(self):
        boxes = [dict(text='100', x=200, y=11, h=10, w=30, confidence=.9),
                 dict(text='Milk', x=10, y=10, h=10, w=100, confidence=.8)]
        self.assertEqual(build_document(boxes, 'rapidocr')['text'], 'Milk 100')

    def test_warnings_do_not_modify_financial_data(self):
        fields = {'originalAmount': 1100, 'items': [{'amount': 1000}]}
        self.assertTrue(receipt_warnings(fields, 1000))
        self.assertEqual(fields, {'originalAmount': 1100, 'items': [{'amount': 1000}]})
        self.assertFalse(receipt_warnings({'originalAmount': .3, 'items': [{'amount': .1}, {'amount': .2}]}))

    def test_translation_is_separate_and_cannot_multiply_line_totals(self):
        # 1000 appears elsewhere: it must not make a 500 line subtotal x2.
        extracted = {'items': [{'name': 'テスト商品', 'originalName': 'テスト商品', 'amount': 500, 'quantity': 2}]}
        with patch('parser._get_minimax_key', return_value=None), patch('urllib.request.urlopen', side_effect=[
            response(extracted), response(['測試商品']),
        ]) as request:
            result = extract_structured_receipt('テスト商品 2個 500\n合計 1000')
        self.assertEqual(result['items'][0], {'name': '測試商品', 'originalName': 'テスト商品', 'amount': 500, 'quantity': 2})
        extraction_prompt = json.loads(request.call_args_list[0].args[0].data)['messages'][0]['content']
        self.assertIn('不翻譯商品名稱', extraction_prompt)
        translation_prompt = json.loads(request.call_args_list[1].args[0].data)['messages'][0]['content']
        self.assertNotIn('"amount"', translation_prompt)

    def test_bad_translation_keeps_original_names(self):
        for bad in ([{'amount': 999}], [''], ['one', 'two']):
            with self.subTest(bad=bad), patch('parser._get_minimax_key', return_value=None), patch('urllib.request.urlopen', return_value=response(bad)):
                self.assertEqual(translate_japanese_items(['商品']), ['商品'])

    def test_conflicting_model_total_never_overwrites_printed_total(self):
        with patch('parser.extract_structured_receipt', return_value={
            'originalAmount': 1000, 'items': [{'name': '商品', 'originalName': 'Product', 'amount': 1000}],
        }):
            result = parse_receipt_text('SHOP\n合計 JPY 1100', extract_items=True)
        self.assertEqual(result['originalAmount'], 1100)
        self.assertTrue(result['needsReview'])

    def test_inferred_total_requires_review(self):
        with patch('parser.extract_structured_receipt', return_value={
            'items': [{'name': '商品', 'originalName': 'Product', 'amount': 1000}],
        }):
            result = parse_receipt_text('SHOP', extract_items=True)
        self.assertEqual(result['originalAmount'], 1000)
        self.assertTrue(result['needsReview'])
