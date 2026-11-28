import { describe, it, expect } from "bun:test";
import { parseResults, signTest, wilson, compare, type ResultRow } from "./stats";

function trial(
  config: string,
  caseId: string,
  trialNo: number,
  results: Record<string, boolean>,
  extra: Partial<ResultRow> = {},
): ResultRow[] {
  return Object.entries(results).map(([assertion, passed]) => ({
    config,
    case: caseId,
    trial: trialNo,
    assertion,
    passed,
    ...extra,
  }));
}

function repeat(
  config: string,
  caseId: string,
  trials: Record<string, boolean>[],
  extra: Partial<ResultRow> = {},
): ResultRow[] {
  return trials.flatMap((r, i) => trial(config, caseId, i + 1, r, extra));
}

describe("parseResults", () => {
  it("1 行 1 レコードの JSONL を読み、空行は無視する", () => {
    const text = '{"config":"baseline","case":"c1","trial":1,"assertion":"a1","passed":true}\n\n';
    expect(parseResults(text)).toHaveLength(1);
  });

  it("壊れた JSON は行番号つきのエラーになる", () => {
    const text = '{"config":"baseline","case":"c1","trial":1,"passed":true}\n{oops';
    expect(() => parseResults(text)).toThrow(/2 行目/);
  });

  it("config / case / trial が欠けた行はエラーになる", () => {
    expect(() => parseResults('{"case":"c1","trial":1,"passed":true}')).toThrow(/config/);
  });

  it("status が ok の行で passed が真偽値でなければエラーになる", () => {
    expect(() => parseResults('{"config":"b","case":"c1","trial":1}')).toThrow(/passed/);
  });

  it("status が ok 以外の行は passed が無くてもよい", () => {
    const rows = parseResults('{"config":"b","case":"c1","trial":1,"status":"harness_fail"}');
    expect(rows[0].status).toBe("harness_fail");
  });
});

describe("signTest", () => {
  it("5 勝 0 敗は両側 p=0.0625 で、片側（悪化方向）は 1", () => {
    const r = signTest(5, 0);
    expect(r.twoSided).toBeCloseTo(0.0625, 6);
    expect(r.oneSidedWorse).toBeCloseTo(1, 6);
  });

  it("9 勝 1 敗は両側 p≈0.0215", () => {
    expect(signTest(9, 1).twoSided).toBeCloseTo(22 / 1024, 6);
  });

  it("0 勝 5 敗は悪化方向の片側 p=0.03125", () => {
    expect(signTest(0, 5).oneSidedWorse).toBeCloseTo(1 / 32, 6);
  });

  it("勝ち負けが無ければ p=1", () => {
    expect(signTest(0, 0).twoSided).toBe(1);
  });
});

describe("wilson", () => {
  it("3/3 でも下限は約 0.44 にとどまる", () => {
    const [lo, hi] = wilson(3, 3);
    expect(lo).toBeCloseTo(0.4385, 3);
    expect(hi).toBeCloseTo(1, 6);
  });

  it("n=0 は [0, 1] を返す", () => {
    expect(wilson(0, 0)).toEqual([0, 1]);
  });
});

describe("compare", () => {
  const all = (v: boolean) => ({ a1: v, a2: v });

  it("ケース単位の平均で差を取り、勝ち・負け・引き分けを数える", () => {
    const rows = [
      ...repeat("baseline", "c1", [{ a1: true, a2: false }, { a1: true, a2: false }, { a1: true, a2: false }]),
      ...repeat("candidate", "c1", [all(true), all(true), all(true)]),
      ...repeat("baseline", "c2", [all(true), all(true), all(true)]),
      ...repeat("candidate", "c2", [all(true), all(true), all(true)]),
    ];
    const r = compare(rows);
    const dev = r.splits.dev!;
    expect(dev.wins).toBe(1);
    expect(dev.ties).toBe(1);
    expect(dev.losses).toBe(0);
    expect(dev.meanDelta).toBeCloseTo(0.25, 6);
    expect(r.verdict).toBe("improved");
    expect(r.exitCode).toBe(0);
  });

  it("baseline で過半数通っていた assertion が候補で過半数落ちたら回帰として exit 4", () => {
    const rows = [
      ...repeat("baseline", "c1", [{ a1: true, a2: false }, { a1: true, a2: false }, { a1: true, a2: false }]),
      ...repeat("candidate", "c1", [{ a1: false, a2: true }, { a1: false, a2: true }, { a1: false, a2: true }]),
    ];
    const r = compare(rows);
    expect(r.regressions).toEqual([{ case: "c1", assertion: "a1", baseline: "3/3", candidate: "0/3" }]);
    expect(r.verdict).toBe("regressed");
    expect(r.exitCode).toBe(4);
  });

  it("baseline にあるケースが候補に無ければ、平均が上がっていても回帰扱い", () => {
    const rows = [
      ...repeat("baseline", "c1", [all(false), all(false), all(false)]),
      ...repeat("candidate", "c1", [all(true), all(true), all(true)]),
      ...repeat("baseline", "c2", [all(true), all(true), all(true)]),
    ];
    const r = compare(rows);
    expect(r.splits.dev!.missingInCandidate).toEqual(["c2"]);
    expect(r.exitCode).toBe(4);
  });

  it("両方の条件で全試行通る（または全試行落ちる）assertion を識別力なしとして挙げる", () => {
    const rows = [
      ...repeat("baseline", "c1", [{ a1: true, a2: false }, { a1: true, a2: false }, { a1: true, a2: false }]),
      ...repeat("candidate", "c1", [{ a1: true, a2: true }, { a1: true, a2: true }, { a1: true, a2: true }]),
    ];
    const r = compare(rows);
    expect(r.nonDiscriminating).toEqual([{ case: "c1", assertion: "a1", outcome: "both-pass" }]);
  });

  it("同じ条件の中で結果が揺れる assertion を flaky として挙げる", () => {
    const rows = [
      ...repeat("baseline", "c1", [{ a1: true }, { a1: false }, { a1: true }]),
      ...repeat("candidate", "c1", [{ a1: true }, { a1: true }, { a1: true }]),
    ];
    const r = compare(rows);
    expect(r.flaky).toEqual([{ config: "baseline", case: "c1", assertion: "a1", passed: 2, total: 3 }]);
  });

  it("status が ok 以外の試行は採点から外し、欠測として警告する", () => {
    const rows = [
      ...repeat("baseline", "c1", [all(true), all(true), all(true)]),
      ...repeat("candidate", "c1", [all(true), all(true)]),
      { config: "candidate", case: "c1", trial: 3, status: "harness_fail" as const },
    ];
    const r = compare(rows);
    expect(r.configs.candidate.failedTrials).toBe(1);
    expect(r.warnings.some((w) => w.includes("欠測"))).toBe(true);
  });

  it("ok な試行が 3 回未満のケースがあれば、改善に見えても決着つかず（exit 2）", () => {
    const rows = [
      ...repeat("baseline", "c1", [all(false), all(false)]),
      ...repeat("candidate", "c1", [all(true), all(true)]),
    ];
    const r = compare(rows);
    expect(r.verdict).toBe("inconclusive");
    expect(r.exitCode).toBe(2);
    expect(r.warnings.some((w) => w.includes("3 回未満"))).toBe(true);
  });

  it("差が無ければ決着つかず（exit 2）", () => {
    const rows = [
      ...repeat("baseline", "c1", [all(true), all(true), all(true)]),
      ...repeat("candidate", "c1", [all(true), all(true), all(true)]),
    ];
    expect(compare(rows).exitCode).toBe(2);
  });

  it("dev で改善しても held-out で悪化したら回帰扱い", () => {
    const rows = [
      ...repeat("baseline", "c1", [all(false), all(false), all(false)]),
      ...repeat("candidate", "c1", [all(true), all(true), all(true)]),
      ...repeat("baseline", "h1", [{ a1: true, a2: true }, { a1: true, a2: true }, { a1: true, a2: false }], { split: "heldout" }),
      ...repeat("candidate", "h1", [{ a1: true, a2: false }, { a1: true, a2: false }, { a1: true, a2: false }], { split: "heldout" }),
    ];
    const r = compare(rows);
    expect(r.splits.heldout!.meanDelta).toBeLessThan(0);
    expect(r.exitCode).toBe(4);
  });

  it("試行ごとの tokens と duration_ms から候補 / baseline の比を出す", () => {
    const rows = [
      ...repeat("baseline", "c1", [all(true), all(true), all(true)], { tokens: 1000, duration_ms: 10_000 }),
      ...repeat("candidate", "c1", [all(true), all(true), all(true)], { tokens: 1500, duration_ms: 12_000 }),
    ];
    const r = compare(rows);
    expect(r.cost.tokensRatio).toBeCloseTo(1.5, 6);
    expect(r.cost.durationRatio).toBeCloseTo(1.2, 6);
  });

  it("config 名を指定して比較できる", () => {
    const rows = [
      ...repeat("v1", "c1", [all(false), all(false), all(false)]),
      ...repeat("v2", "c1", [all(true), all(true), all(true)]),
    ];
    expect(compare(rows, { baseline: "v1", candidate: "v2" }).verdict).toBe("improved");
  });

  it("指定した config の行が無ければエラーになる", () => {
    const rows = repeat("baseline", "c1", [all(true)]);
    expect(() => compare(rows)).toThrow(/candidate/);
  });
});
