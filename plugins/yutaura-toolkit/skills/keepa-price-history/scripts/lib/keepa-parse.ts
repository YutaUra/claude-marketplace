// Keepa の内部データ形式のパース補助。
// Keepa 時刻は「(unixミリ秒 / 60000) - 21564000」の分単位オフセット。
// オフセット値は公開 API ドキュメントと同一で、keepa.com サイト側でも同じ形式を実測確認済み。
const KEEPA_MINUTES_OFFSET = 21_564_000;

export function keepaMinutesToDate(keepaMinutes: number): Date {
  return new Date((keepaMinutes + KEEPA_MINUTES_OFFSET) * 60_000);
}

export interface SeriesPoint {
  date: string; // ISO 8601
  value: number | null; // -1 (データなし) は null に正規化
}

// csv は [time, value, time, value, ...] のフラット配列（変化点のみ記録）
export function parsePairSeries(
  csv: readonly number[] | null | undefined,
): SeriesPoint[] {
  if (!csv) return [];
  const points: SeriesPoint[] = [];
  for (let i = 0; i + 1 < csv.length; i += 2) {
    points.push({
      date: keepaMinutesToDate(csv[i]).toISOString(),
      value: csv[i + 1] === -1 ? null : csv[i + 1],
    });
  }
  return points;
}

// Keepa product.csv のインデックス（公開 API と共通）
export const CSV_INDEX = {
  AMAZON: 0,
  NEW: 1,
  USED: 2,
  SALES_RANK: 3,
  LIST_PRICE: 4,
  WAREHOUSE: 9,
  NEW_FBA: 10,
  COUNT_NEW: 11,
  COUNT_USED: 12,
  RATING: 16,
  COUNT_REVIEWS: 17,
  // 18 (BUY_BOX) は [time, price, shipping] の3つ組なので parsePairSeries 非対応
} as const;
