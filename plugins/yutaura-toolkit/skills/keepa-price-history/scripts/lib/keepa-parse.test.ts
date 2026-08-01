import { describe, it, expect } from "bun:test";
import { keepaMinutesToDate, parsePairSeries } from "./keepa-parse";

describe("keepaMinutesToDate", () => {
  it("Keepa分を正しいUTC日時に変換する", () => {
    // 実測値: keepa.com の B0H6PWKGSV で trackingSince が 2026-06-26 と表示されることを確認済み
    const d = keepaMinutesToDate(8_143_920);
    expect(d.toISOString().slice(0, 10)).toBe("2026-06-26");
  });
});

describe("parsePairSeries", () => {
  it("[time, value] ペアの配列を日時付きポイントに変換する", () => {
    const csv = [8_143_920, 47_980, 8_180_000, 47_500];
    const pts = parsePairSeries(csv);
    expect(pts).toHaveLength(2);
    expect(pts[0].value).toBe(47_980);
    expect(pts[0].date.slice(0, 10)).toBe("2026-06-26");
    expect(pts[1].value).toBe(47_500);
  });

  it("値が -1 のポイント（データなし）は null として保持する", () => {
    const pts = parsePairSeries([8_143_920, -1]);
    expect(pts[0].value).toBeNull();
  });

  it("null や空配列は空リストを返す", () => {
    expect(parsePairSeries(null)).toEqual([]);
    expect(parsePairSeries([])).toEqual([]);
  });
});
