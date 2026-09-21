"""Geometry-aware OCR ordering and non-destructive receipt checks."""
from decimal import Decimal


def build_document(boxes, engine):
    rows = []
    for box in sorted(boxes, key=lambda b: b['y'] + b['h'] / 2):
        center = box['y'] + box['h'] / 2
        for row in rows:
            anchor = row[0]
            # Relative to character height, not image height: long receipts
            # must not merge adjacent product rows into one.
            if abs(center - (anchor['y'] + anchor['h'] / 2)) <= min(box['h'], anchor['h']) * 0.45:
                row.append(box)
                break
        else:
            rows.append([box])
    lines = []
    for row in rows:
        row.sort(key=lambda b: b['x'])
        lines.append({'text': ' '.join(b['text'] for b in row), 'boxes': row})
    return {'text': '\n'.join(line['text'] for line in lines), 'engine': engine, 'lines': lines}


def receipt_warnings(fields, model_total=None):
    warnings = []
    total = fields.get('originalAmount')
    items = fields.get('items') or []
    if not items:
        warnings.append('未能辨識品項明細，請對照收據補上。')
    if total is None:
        warnings.append('未能確認收據總額，請手動輸入。')
    elif items:
        amount = sum((Decimal(str(it['amount'])) for it in items), Decimal(0))
        if abs(amount - Decimal(str(total))) > Decimal('0.01'):
            warnings.append(f'品項合計 {amount} 與收據總額 {total} 不同；請核對折扣、稅額、服務費或漏辨識品項，系統未自動改寫金額。')
    if total is not None and model_total is not None:
        try:
            if abs(Decimal(str(total)) - Decimal(str(model_total))) > Decimal('0.01'):
                warnings.append(f'AI 判讀總額 {model_total} 與收據文字總額 {total} 不同，請核對原圖。')
        except Exception:
            pass
    return warnings
