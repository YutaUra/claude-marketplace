import { describe, it, expect } from "bun:test";
import { planBlind, unblind, type TrialRef } from "./blind";

function seq(values: number[]): () => number {
  let i = 0;
  return () => values[i++ % values.length];
}

const trials: TrialRef[] = [
  { config: "baseline", case: "c1", trial: 1, dir: "runs/baseline/c1/trial-1" },
  { config: "candidate", case: "c1", trial: 1, dir: "runs/candidate/c1/trial-1", meta: { tokens: 1200 } },
  { config: "baseline", case: "c2", trial: 1, dir: "runs/baseline/c2/trial-1" },
];

describe("planBlind", () => {
  it("試行ごとに重複しない id を振り、config 名を id に含めない", () => {
    const key = planBlind(trials, Math.random);
    const ids = key.map((e) => e.id);
    expect(new Set(ids).size).toBe(trials.length);
    for (const id of ids) {
      expect(id).toMatch(/^[a-z0-9]{6}$/);
      expect(id.includes("base") || id.includes("cand")).toBe(false);
    }
  });

  it("並び順を入れ替え、元の試行情報を key に残す", () => {
    const key = planBlind(trials, seq([0.9, 0.1, 0.5, 0.3, 0.7, 0.2, 0.4, 0.8, 0.6]));
    expect(key.map((e) => e.dir).sort()).toEqual(trials.map((t) => t.dir).sort());
    expect(key.find((e) => e.config === "candidate")!.meta).toEqual({ tokens: 1200 });
  });
});

describe("unblind", () => {
  const key = [
    { id: "aaaaaa", config: "baseline", case: "c1", trial: 1, dir: "x" },
    { id: "bbbbbb", config: "candidate", case: "c1", trial: 1, dir: "y", meta: { tokens: 1200, duration_ms: 9000 } },
  ];

  it("採点結果を config / case / trial に戻し、meta を引き継ぐ", () => {
    const rows = unblind(
      [
        { id: "aaaaaa", assertion: "a1", passed: true },
        { id: "bbbbbb", assertion: "a1", passed: false, evidence: "見出しが無い" },
      ],
      key,
    );
    expect(rows).toContainEqual({ config: "baseline", case: "c1", trial: 1, assertion: "a1", passed: true });
    expect(rows).toContainEqual({
      config: "candidate",
      case: "c1",
      trial: 1,
      assertion: "a1",
      passed: false,
      evidence: "見出しが無い",
      tokens: 1200,
      duration_ms: 9000,
    });
  });

  it("key に無い id の採点結果はエラーになる", () => {
    expect(() => unblind([{ id: "zzzzzz", assertion: "a1", passed: true }], key)).toThrow(/zzzzzz/);
  });

  it("採点されなかった試行は harness_fail として残し、黙って消さない", () => {
    const rows = unblind([{ id: "aaaaaa", assertion: "a1", passed: true }], key);
    expect(rows).toContainEqual({ config: "candidate", case: "c1", trial: 1, status: "harness_fail", tokens: 1200, duration_ms: 9000 });
  });

  it("meta.status が ok 以外の試行は採点結果より status を優先する", () => {
    const k = [{ id: "cccccc", config: "candidate", case: "c1", trial: 2, dir: "z", meta: { status: "system_fail" as const } }];
    const rows = unblind([{ id: "cccccc", assertion: "a1", passed: false }], k);
    expect(rows).toEqual([{ config: "candidate", case: "c1", trial: 2, status: "system_fail" }]);
  });
});
