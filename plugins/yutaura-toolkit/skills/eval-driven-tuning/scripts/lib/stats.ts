export type TrialStatus = "ok" | "system_fail" | "harness_fail";
export type Split = "dev" | "heldout";

export type ResultRow = {
  config: string;
  case: string;
  trial: number;
  assertion?: string;
  passed?: boolean;
  status?: TrialStatus;
  split?: Split;
  tokens?: number;
  duration_ms?: number;
  evidence?: string;
};

export class InputError extends Error {}

const STATUSES: TrialStatus[] = ["ok", "system_fail", "harness_fail"];
const SPLITS: Split[] = ["dev", "heldout"];
const MIN_TRIALS = 3;
const EPS = 1e-9;

export function parseResults(text: string): ResultRow[] {
  const rows: ResultRow[] = [];
  text.split("\n").forEach((line, i) => {
    if (!line.trim()) return;
    const where = `${i + 1} 行目`;
    let row: ResultRow;
    try {
      row = JSON.parse(line);
    } catch {
      throw new InputError(`${where}: JSON として読めない`);
    }
    if (typeof row.config !== "string" || typeof row.case !== "string" || typeof row.trial !== "number") {
      throw new InputError(`${where}: config（文字列）/ case（文字列）/ trial（数値）が必要`);
    }
    const status = row.status ?? "ok";
    if (!STATUSES.includes(status)) throw new InputError(`${where}: status は ${STATUSES.join(" / ")} のいずれか`);
    if (row.split !== undefined && !SPLITS.includes(row.split)) {
      throw new InputError(`${where}: split は ${SPLITS.join(" / ")} のいずれか`);
    }
    if (status === "ok" && typeof row.passed !== "boolean") {
      throw new InputError(`${where}: status が ok の行には passed（真偽値）が必要`);
    }
    rows.push(row);
  });
  return rows;
}

function probAtLeastUnderFairCoin(n: number, from: number): number {
  let sum = 0;
  let c = 1;
  for (let i = 0; i <= n; i++) {
    if (i >= from) sum += c;
    c = (c * (n - i)) / (i + 1);
  }
  return sum / 2 ** n;
}

export function signTest(wins: number, losses: number): { twoSided: number; oneSidedWorse: number } {
  const n = wins + losses;
  if (n === 0) return { twoSided: 1, oneSidedWorse: 1 };
  const k = Math.min(wins, losses);
  const lowerTail = 1 - probAtLeastUnderFairCoin(n, k + 1);
  return { twoSided: Math.min(1, 2 * lowerTail), oneSidedWorse: probAtLeastUnderFairCoin(n, losses) };
}

export function wilson(successes: number, n: number, z = 1.96): [number, number] {
  if (n === 0) return [0, 1];
  const p = successes / n;
  const z2 = z * z;
  const center = p + z2 / (2 * n);
  const margin = z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n));
  const denom = 1 + z2 / n;
  return [Math.max(0, (center - margin) / denom), Math.min(1, (center + margin) / denom)];
}

type Trial = {
  config: string;
  case: string;
  split: Split;
  ok: boolean;
  results: Map<string, boolean>;
  tokens?: number;
  durationMs?: number;
};

function collectTrials(rows: ResultRow[]): Trial[] {
  const trials = new Map<string, Trial>();
  for (const row of rows) {
    const key = JSON.stringify([row.config, row.case, row.trial]);
    let t = trials.get(key);
    if (!t) {
      t = { config: row.config, case: row.case, split: row.split ?? "dev", ok: true, results: new Map() };
      trials.set(key, t);
    }
    if ((row.status ?? "ok") !== "ok") t.ok = false;
    if (typeof row.passed === "boolean") t.results.set(row.assertion ?? "_", row.passed);
    if (row.split) t.split = row.split;
    t.tokens ??= row.tokens;
    t.durationMs ??= row.duration_ms;
  }
  return [...trials.values()];
}

function trialScore(t: Trial): number {
  const values = [...t.results.values()];
  return values.length === 0 ? 0 : values.filter(Boolean).length / values.length;
}

export type CaseDelta = { case: string; baseline: number; candidate: number; delta: number };

export type SplitReport = {
  cases: CaseDelta[];
  wins: number;
  losses: number;
  ties: number;
  meanDelta: number;
  signTest: { twoSided: number; oneSidedWorse: number };
  missingInCandidate: string[];
};

export type AssertionFlip = { case: string; assertion: string; baseline: string; candidate: string };

export type Report = {
  configs: Record<"baseline" | "candidate", { name: string; okTrials: number; failedTrials: number; cases: number }>;
  splits: Partial<Record<Split, SplitReport>>;
  regressions: AssertionFlip[];
  improvements: AssertionFlip[];
  nonDiscriminating: { case: string; assertion: string; outcome: "both-pass" | "both-fail" }[];
  flaky: { config: string; case: string; assertion: string; passed: number; total: number }[];
  cost: { tokensRatio?: number; durationRatio?: number };
  warnings: string[];
  verdict: "improved" | "inconclusive" | "regressed";
  exitCode: 0 | 2 | 4;
};

type Tally = { passed: number; total: number };

function tallyAssertions(trials: Trial[]): Map<string, Tally> {
  const tally = new Map<string, Tally>();
  for (const t of trials) {
    for (const [assertion, passed] of t.results) {
      const key = JSON.stringify([t.case, assertion]);
      const cur = tally.get(key) ?? { passed: 0, total: 0 };
      cur.total += 1;
      if (passed) cur.passed += 1;
      tally.set(key, cur);
    }
  }
  return tally;
}

function meanOf(values: (number | undefined)[]): number | undefined {
  const xs = values.filter((v): v is number => typeof v === "number");
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : undefined;
}

function ratio(cand: number | undefined, base: number | undefined): number | undefined {
  return cand !== undefined && base !== undefined && base > 0 ? cand / base : undefined;
}

export function compare(
  rows: ResultRow[],
  names: { baseline?: string; candidate?: string } = {},
): Report {
  const baseName = names.baseline ?? "baseline";
  const candName = names.candidate ?? "candidate";
  const trials = collectTrials(rows);
  const byRole = {
    baseline: trials.filter((t) => t.config === baseName),
    candidate: trials.filter((t) => t.config === candName),
  };
  for (const [role, name] of [["baseline", baseName], ["candidate", candName]] as const) {
    if (byRole[role].length === 0) throw new InputError(`${role} として指定した config "${name}" の行が無い`);
  }
  const ok = { baseline: byRole.baseline.filter((t) => t.ok), candidate: byRole.candidate.filter((t) => t.ok) };
  const warnings: string[] = [];

  const configs = {} as Report["configs"];
  for (const role of ["baseline", "candidate"] as const) {
    const failed = byRole[role].length - ok[role].length;
    configs[role] = {
      name: role === "baseline" ? baseName : candName,
      okTrials: ok[role].length,
      failedTrials: failed,
      cases: new Set(ok[role].map((t) => t.case)).size,
    };
    if (failed > 0) {
      warnings.push(
        `欠測: ${configs[role].name} の試行 ${failed} 件が status≠ok で採点から外れた。条件間で欠測が偏ると比較が歪むので、再実行を検討する`,
      );
    }
  }

  const groupByCase = (ts: Trial[]) => {
    const m = new Map<string, Trial[]>();
    for (const t of ts) m.set(t.case, [...(m.get(t.case) ?? []), t]);
    return m;
  };
  const baseCases = groupByCase(ok.baseline);
  const candCases = groupByCase(ok.candidate);

  const fewTrialCases = [...new Set([...baseCases, ...candCases].filter(([, ts]) => ts.length < MIN_TRIALS).map(([c]) => c))];
  if (fewTrialCases.length > 0) {
    warnings.push(`ok な試行が ${MIN_TRIALS} 回未満のケースがある（${fewTrialCases.join(", ")}）。1 回の結果は分布からの 1 標本にすぎない`);
  }
  const onlyCandidate = [...candCases.keys()].filter((c) => !baseCases.has(c));
  if (onlyCandidate.length > 0) warnings.push(`baseline に無いケースは比較していない: ${onlyCandidate.join(", ")}`);
  const uneven = [...baseCases.keys()].filter((c) => candCases.has(c) && candCases.get(c)!.length !== baseCases.get(c)!.length);
  if (uneven.length > 0) warnings.push(`条件間で ok な試行数が違うケース: ${uneven.join(", ")}`);

  const splits: Report["splits"] = {};
  for (const split of SPLITS) {
    const caseIds = [...baseCases.keys()].filter((c) => baseCases.get(c)!.some((t) => t.split === split));
    if (caseIds.length === 0) continue;
    const missing = caseIds.filter((c) => !candCases.has(c));
    const cases: CaseDelta[] = caseIds
      .filter((c) => candCases.has(c))
      .map((c) => {
        const b = meanOf(baseCases.get(c)!.map(trialScore))!;
        const k = meanOf(candCases.get(c)!.map(trialScore))!;
        return { case: c, baseline: b, candidate: k, delta: k - b };
      })
      .sort((x, y) => x.delta - y.delta);
    const wins = cases.filter((c) => c.delta > EPS).length;
    const losses = cases.filter((c) => c.delta < -EPS).length;
    splits[split] = {
      cases,
      wins,
      losses,
      ties: cases.length - wins - losses,
      meanDelta: meanOf(cases.map((c) => c.delta)) ?? 0,
      signTest: signTest(wins, losses),
      missingInCandidate: missing,
    };
  }

  const baseTally = tallyAssertions(ok.baseline);
  const candTally = tallyAssertions(ok.candidate);
  const regressions: AssertionFlip[] = [];
  const improvements: AssertionFlip[] = [];
  const nonDiscriminating: Report["nonDiscriminating"] = [];
  for (const [key, b] of baseTally) {
    const c = candTally.get(key);
    if (!c) continue;
    const [caseId, assertion] = JSON.parse(key) as [string, string];
    const flip = { case: caseId, assertion, baseline: `${b.passed}/${b.total}`, candidate: `${c.passed}/${c.total}` };
    const br = b.passed / b.total;
    const cr = c.passed / c.total;
    if (br > 0.5 && cr < 0.5) regressions.push(flip);
    if (br < 0.5 && cr > 0.5) improvements.push(flip);
    if (br === 1 && cr === 1) nonDiscriminating.push({ case: caseId, assertion, outcome: "both-pass" });
    if (br === 0 && cr === 0) nonDiscriminating.push({ case: caseId, assertion, outcome: "both-fail" });
  }
  const flaky: Report["flaky"] = [];
  for (const [name, tally] of [[baseName, baseTally], [candName, candTally]] as const) {
    for (const [key, t] of tally) {
      if (t.passed > 0 && t.passed < t.total) {
        const [caseId, assertion] = JSON.parse(key) as [string, string];
        flaky.push({ config: name, case: caseId, assertion, passed: t.passed, total: t.total });
      }
    }
  }

  const cost = {
    tokensRatio: ratio(meanOf(ok.candidate.map((t) => t.tokens)), meanOf(ok.baseline.map((t) => t.tokens))),
    durationRatio: ratio(meanOf(ok.candidate.map((t) => t.durationMs)), meanOf(ok.baseline.map((t) => t.durationMs))),
  };

  const splitReports = Object.values(splits);
  const regressed =
    regressions.length > 0 ||
    splitReports.some((s) => s.meanDelta < -EPS || s.missingInCandidate.length > 0);
  const verdict: Report["verdict"] = regressed
    ? "regressed"
    : fewTrialCases.length > 0
      ? "inconclusive"
      : splitReports.some((s) => s.meanDelta > EPS)
        ? "improved"
        : "inconclusive";
  const exitCode = verdict === "regressed" ? 4 : verdict === "improved" ? 0 : 2;

  return { configs, splits, regressions, improvements, nonDiscriminating, flaky, cost, warnings, verdict, exitCode };
}
