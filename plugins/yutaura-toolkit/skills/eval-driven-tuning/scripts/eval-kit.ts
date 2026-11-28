#!/usr/bin/env bun
// 使い方:
//   bun eval-kit.ts blind   <runs-dir> <blind-dir>
//   bun eval-kit.ts unblind <grades.jsonl> <blind-key.json>   > results.jsonl
//   bun eval-kit.ts compare <results.jsonl> [--baseline NAME] [--candidate NAME] [--json]
// exit code: 0 改善・回帰なし / 2 決着つかず / 3 入力エラー / 4 回帰
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { planBlind, unblind, type GradeRow, type KeyEntry, type TrialRef } from "./lib/blind";
import { compare, InputError, parseResults, wilson, type Report } from "./lib/stats";

const KEY_FILE = "blind-key.json";
const META_FILE = "meta.json";

function fail(message: string): never {
  console.error(`error: ${message}`);
  process.exit(3);
}

function listDirs(dir: string): string[] {
  return readdirSync(dir).filter((n) => statSync(join(dir, n)).isDirectory()).sort();
}

function cmdBlind(runsDir: string, blindDir: string) {
  if (!existsSync(runsDir)) fail(`${runsDir} が無い`);
  const rel = relative(resolve(runsDir), resolve(blindDir));
  if (!rel.startsWith("..")) fail("blind-dir を runs-dir の中に置くと、採点役が key や config 名を辿れてしまう。外に置く");
  if (existsSync(blindDir) && readdirSync(blindDir).length > 0) fail(`${blindDir} が空でない`);

  const trials: TrialRef[] = [];
  for (const config of listDirs(runsDir)) {
    for (const caseId of listDirs(join(runsDir, config))) {
      for (const t of listDirs(join(runsDir, config, caseId))) {
        const m = /^trial-(\d+)$/.exec(t);
        if (!m) fail(`${join(runsDir, config, caseId, t)}: 試行ディレクトリは trial-<番号> にする`);
        const dir = join(runsDir, config, caseId, t);
        const metaPath = join(dir, META_FILE);
        const meta = existsSync(metaPath) ? JSON.parse(readFileSync(metaPath, "utf8")) : undefined;
        trials.push({ config, case: caseId, trial: Number(m[1]), dir, meta });
      }
    }
  }
  if (trials.length === 0) fail(`${runsDir} に <config>/<case>/trial-<n>/ が見つからない`);

  const key = planBlind(trials, Math.random);
  mkdirSync(blindDir, { recursive: true });
  for (const e of key) {
    cpSync(e.dir, join(blindDir, e.id), { recursive: true, filter: (src) => !src.endsWith(`/${META_FILE}`) });
  }
  const keyPath = join(runsDir, KEY_FILE);
  writeFileSync(keyPath, JSON.stringify(key, null, 2));
  console.log(`${key.length} 試行を ${blindDir} に伏せて配置した。key: ${keyPath}（採点役には見せない）`);
  console.log(`採点結果は 1 行 1 assertion の JSONL: {"id":"${key[0].id}","assertion":"a1","passed":true,"evidence":"..."}`);
}

function cmdUnblind(gradesPath: string, keyPath: string) {
  const key: KeyEntry[] = JSON.parse(readFileSync(keyPath, "utf8"));
  const grades: GradeRow[] = readFileSync(gradesPath, "utf8")
    .split("\n")
    .filter((l) => l.trim())
    .map((l, i) => {
      try {
        return JSON.parse(l);
      } catch {
        throw new InputError(`${gradesPath} の ${i + 1} 行目が JSON として読めない`);
      }
    });
  for (const row of unblind(grades, key)) console.log(JSON.stringify(row));
}

const pct = (x: number) => `${(x * 100).toFixed(0)}%`;
const signed = (x: number) => (x >= 0 ? "+" : "") + x.toFixed(3);

function render(r: Report): string {
  const out: string[] = [];
  const label = { improved: "改善・回帰なし", inconclusive: "決着つかず", regressed: "回帰あり" }[r.verdict];
  out.push(`判定: ${label}（exit ${r.exitCode}）`);
  for (const role of ["baseline", "candidate"] as const) {
    const c = r.configs[role];
    out.push(`  ${role}=${c.name}: ok 試行 ${c.okTrials} / 欠測 ${c.failedTrials} / ケース ${c.cases}`);
  }
  for (const [split, s] of Object.entries(r.splits)) {
    out.push(`\n[${split}] ケース単位: 勝ち ${s.wins} / 負け ${s.losses} / 引き分け ${s.ties}、平均差 ${signed(s.meanDelta)}`);
    out.push(`  符号検定: 両側 p=${s.signTest.twoSided.toFixed(3)}、悪化方向の片側 p=${s.signTest.oneSidedWorse.toFixed(3)}`);
    if (s.wins + s.losses < 6) out.push("  （勝ち負けが 6 件未満では、全勝でも両側 p<0.05 に届かない）");
    for (const c of s.cases) out.push(`  ${c.case}: ${pct(c.baseline)} → ${pct(c.candidate)} (${signed(c.delta)})`);
    if (s.missingInCandidate.length) out.push(`  候補に無いケース: ${s.missingInCandidate.join(", ")}`);
  }
  const flips = (title: string, xs: Report["regressions"]) => {
    if (!xs.length) return;
    out.push(`\n${title}:`);
    for (const f of xs) out.push(`  ${f.case} / ${f.assertion}: ${f.baseline} → ${f.candidate}`);
  };
  flips("回帰した assertion（baseline で過半数通過 → 候補で過半数失敗）", r.regressions);
  flips("改善した assertion", r.improvements);
  if (r.nonDiscriminating.length) {
    out.push("\n識別力のない assertion（両条件で同じ結果。差の判断材料にならない）:");
    for (const n of r.nonDiscriminating) out.push(`  ${n.case} / ${n.assertion}: ${n.outcome === "both-pass" ? "両方とも全試行で通過" : "両方とも全試行で失敗"}`);
  }
  if (r.flaky.length) {
    out.push("\n揺れている assertion（同じ条件で結果が割れる）:");
    for (const f of r.flaky) {
      const [lo, hi] = wilson(f.passed, f.total);
      out.push(`  ${f.config} ${f.case} / ${f.assertion}: ${f.passed}/${f.total}（95% 区間 ${pct(lo)}〜${pct(hi)}）`);
    }
  }
  const costs = [
    r.cost.tokensRatio !== undefined ? `tokens ×${r.cost.tokensRatio.toFixed(2)}` : undefined,
    r.cost.durationRatio !== undefined ? `時間 ×${r.cost.durationRatio.toFixed(2)}` : undefined,
  ].filter(Boolean);
  if (costs.length) out.push(`\n副作用（候補 / baseline の平均比）: ${costs.join("、")}`);
  if (r.warnings.length) {
    out.push("\n警告:");
    for (const w of r.warnings) out.push(`  ${w}`);
  }
  return out.join("\n");
}

function cmdCompare(args: string[]) {
  const [path, ...rest] = args;
  const opt = (name: string) => {
    const i = rest.indexOf(name);
    return i >= 0 ? rest[i + 1] : undefined;
  };
  const report = compare(parseResults(readFileSync(path, "utf8")), {
    baseline: opt("--baseline"),
    candidate: opt("--candidate"),
  });
  console.log(rest.includes("--json") ? JSON.stringify(report, null, 2) : render(report));
  process.exit(report.exitCode);
}

const [cmd, ...args] = process.argv.slice(2);
try {
  if (cmd === "blind" && args.length === 2) cmdBlind(args[0], args[1]);
  else if (cmd === "unblind" && args.length === 2) cmdUnblind(args[0], args[1]);
  else if (cmd === "compare" && args.length >= 1) cmdCompare(args);
  else fail("使い方: eval-kit.ts blind <runs-dir> <blind-dir> | unblind <grades.jsonl> <blind-key.json> | compare <results.jsonl> [--baseline NAME] [--candidate NAME] [--json]");
} catch (e) {
  if (e instanceof InputError || e instanceof SyntaxError) fail(e.message);
  throw e;
}
