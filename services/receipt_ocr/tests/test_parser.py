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
            "occurredAt": "2026-08-12",
            "items": [],
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
        self.assertEqual(result["occurredAt"], "2026-07-01")

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
            "items": [],
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

        self.assertEqual(result["description"], "Richmond Hotel")
        self.assertEqual(result["category"], "lodging")
        self.assertEqual(result["originalAmount"], 1700)
        self.assertEqual(result["currency"], "JPY")
        self.assertEqual(result["occurredAt"], "2026-09-11")

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

    def test_recognizes_food_merchants_and_confectionery_category(self):
        result = parse_receipt_text("""六花亨
带店本店
2026年09月11日（金）17:02No.4888
1名
サクサクパイ
￥300
マルセイアイスサンド
￥300
小計
￥920
合計
￥920
减税率对象商品。
""")

        self.assertEqual(result["description"], "六花亭")
        self.assertEqual(result["category"], "food")
        self.assertEqual(result["originalAmount"], 920)
        self.assertEqual(result["currency"], "JPY")
        self.assertEqual(result["occurredAt"], "2026-09-11T17:02")

    def test_parses_simplified_characters_total_and_excludes_paid_cash(self):
        result = parse_receipt_text("""A
登绿番号
T5460101000476
本店
2026年9月11日（金）16:14#000002
小
￥3,102
合计
￥3,102
书预少
￥5,002
书钓少
￥1,900
""")

        self.assertEqual(result["description"], "Cranberry")
        self.assertEqual(result["category"], "food")
        self.assertEqual(result["originalAmount"], 3102)
        self.assertEqual(result["currency"], "JPY")
        self.assertEqual(result["occurredAt"], "2026-09-11T16:14")

    def test_parses_cash_7eleven_receipt_with_c_ca_logo_without_nanaco(self):
        result = parse_receipt_text("""C.cA-c.ca
带店西1条店
北海道带市西1条南9丁目17一
2026年09月11日（金）14:24青139
小計（税拔8%）
￥901
合計
￥973
预
￥1.572
￥599
[*]一軽减税率对象。
""")

        self.assertEqual(result["description"], "7-Eleven")
        self.assertEqual(result["category"], "food")
        self.assertEqual(result["originalAmount"], 973)
        self.assertEqual(result["currency"], "JPY")
        self.assertEqual(result["occurredAt"], "2026-09-11T14:24")

    def test_parses_workman_plus_receipt_without_yen_symbol(self):
        result = parse_receipt_text("""WORKMAN Plus
===<领收证>===
千店
北海道千市
新富3丁目10番6号
0123-22-0233
小計（6点）
5.648
合計
5.648
现金
10.000
预
10.000
4,352
合同会社EWORKS
登錄番号T4430003017135
""")

        self.assertEqual(result["description"], "WORKMAN Plus")
        self.assertEqual(result["category"], "other")
        self.assertEqual(result["originalAmount"], 5648)
        self.assertEqual(result["currency"], "JPY")
        self.assertIsNone(result["occurredAt"])

    def test_parses_two_column_hotel_receipt_with_amount_preceding_label(self):
        result = parse_receipt_text("""RECEIPT
registration number: T1010901015937
RoomNo. 507
Term of stay 2026/09/11~2026/09/12
Date 2026/09/11
1,700yen
Total amount
2.000yen(cash)
Payment
300yen(cash)
Change
800yen
Parking fee
900yen**
Accommodation Tax
1.700yen
Total
800yen
10%Tax Rate Items
""")

        self.assertEqual(result["description"], "Richmond Hotel")
        self.assertEqual(result["category"], "lodging")
        self.assertEqual(result["originalAmount"], 1700)
        self.assertEqual(result["currency"], "JPY")
        self.assertEqual(result["occurredAt"], "2026-09-11")

    def test_parses_japanese_restaurant_receipt_with_kanji_time_and_cash_tendered(self):
        result = parse_receipt_text("""KORONAGIRAT
0155-67-5604
2026年9月11日（金）21時18分000101
やきとり
梅酒
￥10.483
合計
￥11,000
現计
￥517
钓
""")

        self.assertEqual(result["description"], "炉端 KORONAGIRAI")
        self.assertEqual(result["category"], "food")
        self.assertEqual(result["originalAmount"], 10483)
        self.assertEqual(result["currency"], "JPY")
        self.assertEqual(result["occurredAt"], "2026-09-11T21:18")

    def test_parses_japanese_toll_road_receipt(self):
        text = """ご利用ありがとうございます。
NEXCO
東日本
料金所では一旦停車してください。
領 収 書
料金所 池田
26年 9月12日11時56分
車種 普通
通行料金 ¥630-
※通行料金の消費税率は10％です
（現金）
東日本高速道路株式会社
"""
        result = parse_receipt_text(text)
        self.assertEqual(result["description"], "交通通行費")
        self.assertEqual(result["category"], "transport")
        self.assertEqual(result["originalAmount"], 630)
        self.assertEqual(result["currency"], "JPY")
        self.assertEqual(result["occurredAt"], "2026-09-12T11:56")

    def test_prefers_cjk_brand_over_english_subtitle_for_parks(self):
        text = """釧路市丹頂鶴自然公園
Japanese Crane Reserve
釧路市鶴丘112
TEL:0154-56-2219
2026-09-12 13:10
3 点 @480
個人 大人 ¥1,440
対象計 10.0% ¥1,440
消費税 ¥130
合計 ¥1,440
お預り ¥1,500
お釣 ¥60
"""
        result = parse_receipt_text(text)
        self.assertEqual(result["description"], "釧路市丹頂鶴自然公園")
        self.assertEqual(result["category"], "other")
        self.assertEqual(result["originalAmount"], 1440)
        self.assertEqual(result["currency"], "JPY")
        self.assertEqual(result["occurredAt"], "2026-09-12T13:10")

    def test_parses_notsuke_restaurant_receipt(self):
        text = """別海町
登録番号 T3462501000231
レストランNOTSUKE
株式会社 別海町観光開発公社
北海道野付郡別海町野付63
TEL：0153-82-1270
2026年9月14日（月）12:15 #000001
0000011レジ 2116
内10セット500 ¥1,300
内10 単品バーガー ¥980
内10 カツカレー ¥1,500
小計 ¥3,780
（内税10%対象額 ¥3,780）
買上点数 3点
合計 ¥3,780
（税率10%対象額 ¥3,780）
（内消費税等10% ¥343）
お預り ¥5,000
（内消費税等 ¥343）
お釣り ¥1,220
外8、内8は軽減税率対象商品です。
"""
        result = parse_receipt_text(text)
        self.assertEqual(result["description"], "別海町 レストランNOTSUKE")
        self.assertEqual(result["category"], "food")
        self.assertEqual(result["originalAmount"], 3780)
        self.assertEqual(result["currency"], "JPY")
        self.assertEqual(result["occurredAt"], "2026-09-14T12:15")

    def test_uniqlo_clothing_receipt_categorized_as_other(self):
        text = """UNI
QLO
WWW.UNIQLO.COM
ユニクロフレスポ中標津店
TEL 050-3096-6127
登録番号 T9250001001451
** 領収証 **
2026年09月14日
<0878> [14:41]
ストレッチイージーアンクルパンツ
2000221249750 1 ¥1,990
50ショクソックス 4点 ¥990
Wウォッシャブルニットワンピース ¥1,990
買上点数 13点
小計 ¥18,440
免税額 -¥1,676
合計 ¥16,764
"""
        result = parse_receipt_text(text)
        self.assertEqual(result["description"], "UNIQLO")
        self.assertEqual(result["category"], "other")
        self.assertEqual(result["originalAmount"], 16764)
        self.assertEqual(result["currency"], "JPY")
        self.assertEqual(result["occurredAt"], "2026-09-14T14:41")

    def test_parses_tsuruha_drugstore_receipt(self):
        text = """しんせつ第一
ツルス ドラック ツルハドラッグ
www.tsuruha.co.jp
中標津東店
TEL 0153-78-7576
2026年09月14日（月）15:34
*BPバイオマス袋白L ¥7内
強力わかもと1000錠 ¥2,728内
アベンヌシカルFPR CR ¥1,980内
リュウバンヘラツキ 10ml ¥1,644内
イトコラコラーゲン低分子ヒアル306 ¥2,678※
パイタルプロテインズ 120g ¥1,555※
小計 7点 ¥10,592
合計 ¥10,592
お預り合計 ¥11,000
お釣り ¥408
※印は軽減税率適用商品です。
"""
        result = parse_receipt_text(text)
        self.assertEqual(result["description"], "鶴羽藥妝 中標津東店")
        self.assertEqual(result["category"], "other")
        self.assertEqual(result["originalAmount"], 10592)
        self.assertEqual(result["currency"], "JPY")
        self.assertEqual(result["occurredAt"], "2026-09-14T15:34")

    def test_parses_super_arcs_supermarket_receipt_with_item_count_in_total(self):
        text = """SUPER
ARCS
株式会社福原
スーパーアークス 中標津店
0153-79-2980
領収証
2026年09月14日（月）16:19
小計 ¥3,912
税率8%課税対象額 ¥4,220
税率8％税額 ¥312
税率10%課税対象額 ¥4
（税合計 ¥312）
合計／ 18点 ¥4,224
お預り ¥10,789
お釣り ¥6.565
"""
        result = parse_receipt_text(text)
        self.assertEqual(result["description"], "SUPER ARCS 超市 中標津店")
        self.assertEqual(result["category"], "food")
        self.assertEqual(result["originalAmount"], 4224)
        self.assertEqual(result["currency"], "JPY")
        self.assertEqual(result["occurredAt"], "2026-09-14T16:19")

    def test_parses_shiretoko_sarai_lodging_tax_receipt(self):
        text = """知床サライ
ROOM & DINING
<領収書>
知床サライ
登録番号:T7010001017572
TEL:0153-85-8800
北海道目梨郡羅臼町礼文町41-5
2026/09/14 17:38
北海道宿泊税
@100x 3 ¥300非
小計 3点 ¥300
合計 ¥300
(内消費税等 ¥0)
お預かり ¥500
お釣 ¥200
"""
        result = parse_receipt_text(text)
        self.assertEqual(result["description"], "知床サライ")
        self.assertEqual(result["category"], "lodging")
        self.assertEqual(result["originalAmount"], 300)
        self.assertEqual(result["currency"], "JPY")
        self.assertEqual(result["occurredAt"], "2026-09-14T17:38")

    def test_parses_the_north_face_shiretoko_tax_free_receipt(self):
        text = """NgるシエH®
THE NORTH FACE HELLY HANSEN
知床店
TEL：0152-24-2410
領収証
***TAXFREE***
2026年09月15日（火）13時44分 #8897
4582738749247
NT32660ST SP XXL
SS SHIRETOKOTOKO T
96,000 1 ¥6,000
4550219837165
NT32443R W L
SHARI SOUVENIR T
84,800 1 ¥4,800
4550207451915
#740752
ショウヒンブクロギフトダイ
@46 1 ¥46
3点 小計 ¥10,846
免税額戻り ¥1,084
合計 ¥10,846
（含む消費税等 ¥0）
（10%対象 ¥11,930 消費税 ¥0）
現金 ¥11,001
"""
        result = parse_receipt_text(text)
        self.assertEqual(result["description"], "THE NORTH FACE / HELLY HANSEN 知床店")
        self.assertEqual(result["category"], "other")
        self.assertEqual(result["originalAmount"], 10846)
        self.assertEqual(result["currency"], "JPY")
        self.assertEqual(result["occurredAt"], "2026-09-15T13:44")

    def test_parses_lawson_akan_lake_receipt(self):
        text = """LAWSON
阿寒湖温泉店
登録番号；T6460002003049
北海道釧路市阿寒町阿寒湖温泉2
－ 2-35
電話：0154-67-4163店コード：144911
2026年9月16日（水）19:45
レジ；#2 98150
貴；山際
【領収証】
UC ドラモッチ アンコ＆ホイップ
合 計 214軽
¥214
（内消費税等 ¥15）
（8%対象 ¥214）
（内消費税額 ¥15）
点 数 1個
上記正に領収いたしました
交通系マネー ¥214
軽印は軽減税率対象商品です。
交通系マネー残高は以下の通りです。
支払後残高 ¥13,750
カードNo JE* **-4917
"""
        result = parse_receipt_text(text)
        self.assertEqual(result["description"], "Lawson 阿寒湖溫泉店")
        self.assertEqual(result["category"], "food")
        self.assertEqual(result["originalAmount"], 214)
        self.assertEqual(result["currency"], "JPY")
        self.assertEqual(result["occurredAt"], "2026-09-16T19:45")

    def test_parses_lawson_akan_lake_dessert_and_yogurt_receipt(self):
        text = """LAWSON
阿寒湖温泉店
登録番号；T6460002003049
北海道釧路市阿寒町阿寒湖温泉 2
- 2-35
電話；0154-67-4163 店コード；144911
2026年9月16日（水）19:44
レジ；#2 98240 貴；山際
【領収証】
UC モチプヨ北海道産生クリーム 127軽
ヨツバノムヨーグルトヤサシイアマサ 205軽
合計 ¥332
（内消費税等 ¥24）
（8%対象 ¥332）
（内消費税額 ¥24）
点 数 2個
上正に領収いたしました
交通系マネー
¥332
"""
        result = parse_receipt_text(text)
        self.assertEqual(result["description"], "Lawson 阿寒湖溫泉店")
        self.assertEqual(result["category"], "food")
        self.assertEqual(result["originalAmount"], 332)
        self.assertEqual(result["currency"], "JPY")
        self.assertEqual(result["occurredAt"], "2026-09-16T19:44")

    def test_parses_workman_dot_matrix_receipt_date(self):
        text = """WORKMAN Plus +
ワークマンプラス 札幌八軒店
北海道札幌市西区八軒7条東5丁目3番13号
TEL 011-727-1122
毎度ご来店ありがとうございます。
返品・交換の際は、ご購入頂いた店舗へ
お買い上げ日より14日以内に必ずレシート
＜領 収 証＞
2026年9月19日14時22分 通番：8144 0001
登録番号：1-6430003016102
00100106シン・呼吸する靴下アイスピー
内 990 1個 990
小計 4個 3,475
（10.0% 内税対象額 3,475）
合計 3,475
クレジット支払額 3,475
"""
        result = parse_receipt_text(text)
        self.assertEqual(result["originalAmount"], 3475)
        self.assertEqual(result["currency"], "JPY")
        self.assertEqual(result["occurredAt"], "2026-09-19T14:22")

    def test_parses_chitose_duty_free_receipt(self):
        text = """NEW CHITOSE AIRPORT
DUTY FREE SHOP
新千歳空港免税店
2026/09/20 13:22:35
木」マルセイバターケーキ 5個入 833
＊」白い恋人 24枚ホワイトブラック 2,120
Jとうきびチョコ 10本入り 600
Jとうきびチョコ キャラメル 10本 600
Jじゃがいもコロコロ 醤油 436
」じゃがいもコロコロ 山わさ 436
合計 5,025
"""
        result = parse_receipt_text(text)
        self.assertEqual(result["originalAmount"], 5025)
        self.assertEqual(result["currency"], "JPY")
        self.assertEqual(result["occurredAt"], "2026-09-20T13:22")

    def test_parses_nenrinya_baumkuchen_duty_free_receipt(self):
        text = """NEW CHITOSE AIRPORT
DUTY FREE SHOP
新千歳空港免税店
2026/09/20 13:37:34
FD 243 WANG/TINGWEI
＊Jストレートバームやわらか芽1個
01,500x 1コ 1,500
小計 1,500
合計 1:590
クレジット ，500
"""
        result = parse_receipt_text(text, extract_items=True)
        self.assertEqual(result["originalAmount"], 1500)
        self.assertEqual(result["currency"], "JPY")
        self.assertEqual(result["occurredAt"], "2026-09-20T13:37")
        self.assertEqual(result["category"], "food")
        self.assertEqual(result["items"][0]["name"], "年輪家 經典柔軟年輪蛋糕 (1個入)")

    def test_parses_cosmo_gas_station_receipt(self):
        text = """cosmo
納品書（領収書）
北日本エネルギー（株）苫小牧販売支店
千歳空港SS
2026年09月20日 08:59 伝票No.0219
軽油 P09 ¥6507
数量 43.67（L）
単価 @149
合計 ¥6,507
"""
        result = parse_receipt_text(text)
        self.assertEqual(result["originalAmount"], 6507)
        self.assertEqual(result["currency"], "JPY")
        self.assertEqual(result["occurredAt"], "2026-09-20T08:59")
        self.assertEqual(result["category"], "transport")

    def test_parses_matsuya_beef_bowl_receipt(self):
        text = """2026年09月19日（土） 22時57分 01号機
（税込）
＊牛めし大 1枚 ¥730-
合計 1枚 ¥730-
軽減税率対象（ 8%） ¥730-
＜決済内訳＞
交通系電子マネー ¥730-
（株）松屋フーズ すすきの店
TEL :080-5928-0973
0711
登録番号：T8012401033917
"""
        result = parse_receipt_text(text)
        self.assertEqual(result["originalAmount"], 730)
        self.assertEqual(result["currency"], "JPY")
        self.assertEqual(result["occurredAt"], "2026-09-19T22:57")
        self.assertEqual(result["category"], "food")

    def test_parses_7eleven_ilohas_water_receipt(self):
        text = """セブン-イレブン
札幌狸小路4丁目店
北海道札幌市中央区南3条西4丁目
16-3
電話：011-207-5011 レジ＃1
事業者登録番号5430003008777
2026年09月19日（土）22:34 責197
領収書
い・ろ・は・す天然水540ml ＊118
小計（税抜8%） ¥118
消費税等（8%） ¥9
合計 ¥127
（税率 8%対象 ¥127）
"""
        result = parse_receipt_text(text)
        self.assertEqual(result["originalAmount"], 127)
        self.assertEqual(result["currency"], "JPY")
        self.assertEqual(result["occurredAt"], "2026-09-19T22:34")
        self.assertEqual(result["category"], "food")

    def test_parses_mega_don_quijote_gummy_food_receipt(self):
        text = """9
MEGA
ドンキホーテ
本社：東京都目黒区青葉台2-19－10
様
MEGA新川店 TEL0570-057-311
営業時間 9:00～翌2:00
2026年09月19日（土）13:35 レジ0008
責No＊＊＊＊＊589
4903333213337JAN
ポケぷにイーブイフレン ¥198
4902777256702JAN
＊果汁グミSpecial ¥198
4902777257525JAN
＊ カジュウグミヨウナシ ¥128
小計 ¥524
8%対象額 ¥524
8%税額 ¥41
合計 ¥565
交通系IC ¥565
お買上点数 3点
"""
        result = parse_receipt_text(text)
        self.assertEqual(result["originalAmount"], 565)
        self.assertEqual(result["currency"], "JPY")
        self.assertEqual(result["occurredAt"], "2026-09-19T13:35")

    def test_parses_lawson_susukino_dessert_receipt(self):
        text = """LAWSON
すすきの南8条店
登録番号；T9430001011003
北海道札幌市中央区南8条西3-
電話：011-513-6037店コード：011110
2026年9月18日（金）22:24
レジ；#2 66787 責；03
【領収証】
UC モチプヨ北海道産生クリーム 127軽
UC ドラモッチモンブラン 268軽
合計 ¥395
（内消費税等 ¥29）
（8%対象 ¥395）
（内消費税額 ¥29）
点 数 2個
上記正に領収いたしました
交通系マネー ¥395
"""
        result = parse_receipt_text(text)
        self.assertEqual(result["description"], "Lawson")
        self.assertEqual(result["category"], "food")
        self.assertEqual(result["originalAmount"], 395)
        self.assertEqual(result["currency"], "JPY")
        self.assertEqual(result["occurredAt"], "2026-09-18T22:24")

    def test_parses_sapporo_drug_store_pocari_sweat_food_receipt(self):
        text = """サリドラ 札幌
SAPPORO DRUG STORE 薬粧
狸小路大王ビル店
TEL 011-252-0711
本社：札幌市東区北8条東4丁目1-20
登録番号：T9430001020202
＜領収証＞
2026年09月18日（金）19:52 No.5676
担当：033493 ［00232-0001］
◆ポカリスエット 500ml ¥127内
小計 1点 ¥127
8内税対象額 ¥127）
内税額 ¥9）
合計 ¥127
お釣り ¥0
•は軽減税率対象商品です。
交通系支払 ¥127
"""
        result = parse_receipt_text(text)
        self.assertEqual(result["originalAmount"], 127)
        self.assertEqual(result["currency"], "JPY")
        self.assertEqual(result["occurredAt"], "2026-09-18T19:52")

    def test_parses_hokudai_museum_cafe_receipt(self):
        text = """［領収書］
北海道大学総合博物館内
ミュージアムカフェ ぼらす
TEL:08018918073
登録番号：T9430005003764
2026/09/18 14:07:25
レジ：0003 担当：0001
取引INo:000320260918140242655
恐竜足跡カレー
¥1,300 1点 ¥1,300
北大牛乳 COLD
¥500 1点 ¥500
コーン西興部のソフトクリー等
¥500 1点 ¥500
小計 3点 ¥2,300
¥2,300
（内消費税等 ¥209）
（10％標準対象 ¥2,300）
（内消費税等 ¥209）
交通系電子マネー（Airペイ） ¥2,300
お預り ¥2,300
お釣り ¥0
上記正に領収いたしました
"""
        result = parse_receipt_text(text)
        self.assertEqual(result["description"], "北海道大學博物館 咖啡廳 (ぽらす)")
        self.assertEqual(result["category"], "food")
        self.assertEqual(result["originalAmount"], 2300)
        self.assertEqual(result["currency"], "JPY")
        self.assertEqual(result["occurredAt"], "2026-09-18T14:07")

    def test_parses_menya_yukikaze_ramen_receipt(self):
        text = """麺屋 雪風 本店
札幌市中央区南7条西4丁目2-6
TEL：011-512-3022
登録番号： 2430001045131
領収証
領収証＃ 003757
店舗#0001 端末＃41
2026/09/17（木） 20:26
濃厚味噌らーめん ¥1,200
＠普通盛
雪風BLACK醤油らーめん ¥1,200
＠普通盛
手作り焼き餃子5個 ¥500
濃厚味噌らーめん ¥1,400
@大盛
合計 ¥4,300
お預り ¥5,000
¥700
お釣
（税率10% 対象額 ¥4,300）
¥390）
（内消費税等 10%
ご利用ありがとうございました。
"""
        result = parse_receipt_text(text)
        self.assertEqual(result["description"], "麺屋 雪風")
        self.assertEqual(result["category"], "food")
        self.assertEqual(result["originalAmount"], 4300)
        self.assertEqual(result["currency"], "JPY")
        self.assertEqual(result["occurredAt"], "2026-09-17T20:26")

    def test_parses_kurodake_ropeway_receipt(self):
        text = """発行日：2026年09月17日 13時30分16秒
下記、正に領収いたしました。
8001セット大人往復
03， 900 3 ¥11,700
合計 ¥11,700
10%対象 ¥11,700
お預り金額
お釣り ¥15,000
¥3,300
大雪山層雲峡・黒缶ロープウェイ
〒 078-1701
北海道上川郡上川町層雲峡
TEL：01658-5-3031
株） りんゆう観光層雲峡事業所
登録番号：4430001018515
伝票：20260917-51-00149
"""
        result = parse_receipt_text(text)
        self.assertEqual(result["description"], "大雪山層雲峽・黑岳空中纜車")
        self.assertEqual(result["category"], "transport")
        self.assertEqual(result["originalAmount"], 11700)
        self.assertEqual(result["currency"], "JPY")
        self.assertEqual(result["occurredAt"], "2026-09-17T13:30")

    def test_returns_nulls_when_text_has_no_reliable_fields(self):
        self.assertEqual(parse_receipt_text("模糊收據\n看不清楚"), {
            "description": "模糊收據",
            "category": "other",
            "originalAmount": None,
            "currency": "TWD",
            "occurredAt": None,
            "items": [],
        })


if __name__ == "__main__":
    unittest.main()
