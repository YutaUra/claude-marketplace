import type { ResultRow, TrialStatus } from "./stats";
import { InputError } from "./stats";

export type TrialMeta = { tokens?: number; duration_ms?: number; status?: TrialStatus };
export type TrialRef = { config: string; case: string; trial: number; dir: string; meta?: TrialMeta };
export type KeyEntry = TrialRef & { id: string };
export type GradeRow = { id: string; assertion: string; passed: boolean; evidence?: string };

const ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";
const ID_LENGTH = 6;

function randomId(rng: () => number): string {
  let id = "";
  for (let i = 0; i < ID_LENGTH; i++) id += ALPHABET[Math.floor(rng() * ALPHABET.length) % ALPHABET.length];
  return id;
}

export function planBlind(trials: TrialRef[], rng: () => number): KeyEntry[] {
  const shuffled = [...trials];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1)) % (i + 1);
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  const used = new Set<string>();
  return shuffled.map((t) => {
    let id = randomId(rng);
    // 固定列の rng（テスト用）でも衝突で止まらないよう、衝突時は末尾に連番を足して一意にする
    for (let n = 0; used.has(id); n++) id = randomId(rng).slice(0, ID_LENGTH - 1) + ALPHABET[n % ALPHABET.length];
    used.add(id);
    return { id, ...t };
  });
}

function metaFields(meta: TrialMeta | undefined): Pick<ResultRow, "tokens" | "duration_ms"> {
  const out: Pick<ResultRow, "tokens" | "duration_ms"> = {};
  if (meta?.tokens !== undefined) out.tokens = meta.tokens;
  if (meta?.duration_ms !== undefined) out.duration_ms = meta.duration_ms;
  return out;
}

export function unblind(grades: GradeRow[], key: KeyEntry[]): ResultRow[] {
  const byId = new Map(key.map((e) => [e.id, e]));
  const gradesById = new Map<string, GradeRow[]>();
  for (const g of grades) {
    if (!byId.has(g.id)) throw new InputError(`key に無い id の採点結果がある: ${g.id}`);
    gradesById.set(g.id, [...(gradesById.get(g.id) ?? []), g]);
  }
  const rows: ResultRow[] = [];
  for (const e of key) {
    const base = { config: e.config, case: e.case, trial: e.trial };
    const status = e.meta?.status ?? "ok";
    const gs = gradesById.get(e.id) ?? [];
    if (status !== "ok") {
      rows.push({ ...base, status, ...metaFields(e.meta) });
    } else if (gs.length === 0) {
      rows.push({ ...base, status: "harness_fail", ...metaFields(e.meta) });
    } else {
      for (const g of gs) {
        const row: ResultRow = { ...base, assertion: g.assertion, passed: g.passed };
        if (g.evidence !== undefined) row.evidence = g.evidence;
        rows.push({ ...row, ...metaFields(e.meta) });
      }
    }
  }
  return rows;
}
