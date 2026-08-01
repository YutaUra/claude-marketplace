# Keepa 内部データ形式

## 時刻（Keepa 分）

Keepa の時刻は「Keepa 分」という分単位オフセット値:

```
unix_ms = (keepaMinutes + 21564000) * 60000
```

オフセット値 `21_564_000` は公開 API ドキュメントと同一で、keepa.com サイト側でも同じ形式であることを実測確認済み。

## product.csv

- 系列ごとの `[time, value, time, value, ...]` フラット配列で、**変化点のみ**記録される
- `value = -1` はデータなし（在庫切れ等）。整形出力では `null` に正規化する

## csv インデックス（公開 API と共通）

| index | 系列 |
| --- | --- |
| 0 | AMAZON（Amazon 本体価格） |
| 1 | NEW（新品最安） |
| 2 | USED（中古最安） |
| 3 | SALES_RANK（売れ筋ランキング） |
| 4 | LIST_PRICE |
| 9 | WAREHOUSE |
| 10 | NEW_FBA |
| 11 | COUNT_NEW |
| 12 | COUNT_USED |
| 16 | RATING |
| 17 | COUNT_REVIEWS |
| 18 | BUY_BOX — **`[time, price, shipping]` の3つ組**。ペア前提の `parsePairSeries` は使えない |

## 価格の単位

価格は最小通貨単位（co.jp なら円、com ならセント）。

## メッセージ形式

- `basicProducts` メッセージの配列要素が product オブジェクト（`asin`, `title`, `domainId`, `trackingSince`, `csv`, `stats`, `variations` 等）
- フル履歴版は zstd 圧縮（先頭バイト `28 B5 2F FD`）、短期トラッキング商品は非圧縮のみ
