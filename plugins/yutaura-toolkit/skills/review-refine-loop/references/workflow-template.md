# Workflow tool 用スクリプトテンプレート

ユーザーが Workflow tool の使用を明示的に依頼したときのみ使う。そうでなければ Agent tool を手で起動して同じ手順を踏む。

## 設計上の判断

### barrier を使う理由

このスクリプトは Workflow tool の既定方針（`pipeline()` を優先し barrier を避ける）に**意図的に反して**、ラウンド内で `parallel()` の barrier を使っている。

- **レビュー → 集約に barrier が必要**: 重複統合と severity 昇格、各カテゴリからの 1 件選抜は、全 lens の指摘が揃わないと決まらない。これは Workflow tool が barrier を正当とする「cross-item 判断」そのもの
- **ラウンドは本質的に直列**: 次ラウンドのレビュー対象は、前ラウンドの修正後の成果物。先読みできない
- **修正は直列**: 同じファイルを触るため並列化すると競合する

### 失敗を収束と区別する

`agent()` は失敗時に `null` を返す。`.filter(Boolean)` で落とすだけだと、**全エージェントが失敗したラウンドが「指摘 0 件＝収束」として正常終了する**。

これは実際に起きた事故である。この skill の初回 self review で、検証エージェント 3 件がレート制限で全滅し、ワークフローは `stopReason: "検証を通過した指摘が 0 件（収束）"` を返した。一度も検証していないのに成功報告だった。

そのため、このテンプレートは **起動数と返却数を毎フェーズ突き合わせ**、失敗があったラウンドを収束判定から除外する。`.filter(Boolean)` の直後に差分を見ていない実装は、同じ事故を起こす。

### 文字列一致 dedup の限界

スクリプトが機械的にできるのは `location` の完全一致による統合までで、**「同じ趣旨だが表現が違う指摘」は検出できない**。LLM レビュアーは言い換えるのが普通なので、これだけでは棄却済み指摘の再提出を防げない。

そのため抑止は二段構えにしている:

1. スクリプト側: `label`（severity + title）の完全一致で落とす（取りこぼす前提の粗いフィルタ）
2. プロンプト側: 棄却済みリストを **location と棄却理由つき**でレビュー役に渡し、「同趣旨の指摘も再提出しない」と明示する

本質的な抑止は 2 のほう。1 はコストゼロの補助と割り切る。

`deferred`（保留）はレビュー役に通知しない設計のため、上記 2 の抑止が効かない。label 一致だけでは、言い換えによる再提出だけでなく `merge()` の severity 昇格（同一箇所の統合で severity が 1 段上がる）でも label が変わり、すり抜けてしまう。defer は内容ではなく箇所に対する判断なので、`deferred` に限り `locKey`（正規化した location）の一致でも集約時に落とす。ただし locKey 一致は「同一箇所の別の新規 MUST」まで黙って落とす副作用があり、severity-rubric.md の「MUST を永久に失わない」方針と衝突するため、MUST は locKey 一致での抑止対象から除外する（素通りさせ、label 一致でのみ抑止する）。

## スクリプト

```js
export const meta = {
  name: 'review-refine-loop',
  description: '成果物を多角レビュー→妥当性検証→修正のループで収束させる',
  phases: [
    { title: 'Review', detail: '各観点で並列レビュー（発散モデル）' },
    { title: 'Verify', detail: 'MUST/WANT/NIT から各 1 件を検証（検証モデル）' },
    { title: 'Fix', detail: '採用された指摘を直列で修正（修正モデル）' },
  ],
}

// args: { target, purpose, lenses: [{key, focus, excludes}], maxRounds, models }
const TARGET = args.target
const PURPOSE = args.purpose
const LENSES = args.lenses
const MAX_ROUNDS = args.maxRounds ?? 5
// 特定の severity だけを集中的に潰したいとき（例: ['MUST']）。
// 残件が多い成果物で「重いものから先に」と進めるための絞り込み。
// 指定すると収束判定もそのカテゴリだけで行う（対象外のカテゴリは持ち越しに溜まるが、
// それを収束条件に含めると永久に終わらないため）。
const FOCUS = args.severityFocus ?? null
const PICKS = args.picksPerCategory ?? 1   // 1 ラウンドでカテゴリごとに何件処理するか
const MODEL = args.models ?? { review: 'fable', verify: 'opus', fix: 'sonnet' }

const FINDINGS = {
  type: 'object',
  required: ['findings'],
  properties: {
    findings: {
      type: 'array',
      items: {
        type: 'object',
        required: ['severity', 'title', 'location', 'problem', 'suggestion'],
        properties: {
          severity: { type: 'string', enum: ['MUST', 'WANT', 'NIT'] },
          title: { type: 'string', description: '60 字以内の要約' },
          location: { type: 'string', description: '安定識別子（ファイル＋節名/見出し/関数名）で書く。行番号は修正のたびにずれて locKey 照合（dedup・deferred 抑止・振動検出）が壊れるため使わない。必ず特定して書く' },
          problem: { type: 'string', description: '何が問題か。放置するとどうなるか' },
          suggestion: { type: 'string', description: 'どう直すか' },
        },
      },
    },
  },
}

const VERDICT = {
  type: 'object',
  required: ['decision', 'reason'],
  properties: {
    decision: { type: 'string', enum: ['fix', 'defer', 'reject'] },
    valid: { type: 'boolean' },
    essential: { type: 'boolean' },
    effort: { type: 'string', enum: ['easy', 'hard'] },
    reason: { type: 'string', description: '対象のどこを見てそう判断したか' },
  },
}

// 修正役は「指摘された問題は既に対処済みだった」と判断して何も変更しないことがある。
// 自由文で返させると「適用した修正」と区別できず、直っていないものを直ったと報告してしまう。
const FIX_RESULT = {
  type: 'object',
  required: ['changed', 'summary'],
  properties: {
    changed: {
      type: 'boolean',
      description: '実際にファイルを変更したら true。既に対処済み等で変更しなかったら false',
    },
    summary: { type: 'string', description: '何をどう変えたか。変更しなかったならその理由' },
  },
}

const ORDER = ['MUST', 'WANT', 'NIT']   // index が小さいほど重い
const rejected = []       // 誤りと判定された指摘。レビュー役に通知して再提出を防ぐ
const deferred = []       // 妥当だが直さないもの。レビュー役には渡さず集約でのみ落とす
const applied = []        // 実際にファイルを変更した修正
const noChange = []       // 修正役が「変更不要」と判断したもの（applied と混ぜない）
const fixedLocations = new Map()   // 振動検出用: location ごとの修正回数
let carryover = []        // 選抜されなかった指摘。次ラウンドへ持ち越す

const label = (f) => `${f.severity}: ${f.title}`
// location が「ファイル＋節名」などの安定識別子である前提の正規化。行番号は Fix で成果物が
// 書き換わるたびにずれるため、ここでは吸収できない（schema/reviewPrompt 側で行番号を使わせないことが前提）。
const locKey = (f) => (f.location ?? '').replace(/\s+/g, '').toLowerCase()

// 同一 location の指摘を 1 件に統合する。異なる lens が独立に同じ箇所を指摘したものは
// 実在の確度が高いので severity を 1 段階上げる。
// 統合しないと、2 件目の修正役が「1 件目で既に直った箇所」を別の形に書き直して壊す。
//
// 昇格は「このラウンドで新たに異なる lens の指摘と統合され、sources のユニーク数が増えたとき」
// だけ、かつ同一指摘につき 1 回だけ適用する（upgraded フラグで管理）。各指摘は発生源 lens を
// sources（レビュー時に lens.key を積んだ配列）として持ち運ぶ。持ち越し指摘は sources を保持した
// まま毎ラウンド merge に再投入されるが、同一 lens の再提出では sources の和集合が増えないため、
// 件数（prev.lenses += 1 のような単純カウント）で判定すると区別できない「同一 lens の再提出」と
// 「別 lens による新たな裏付け」を sources のユニーク数で正しく分ける。
function merge(findings) {
  const byLoc = new Map()
  for (const f of findings) {
    const k = locKey(f)
    const prev = byLoc.get(k)
    if (!prev) {
      byLoc.set(k, { ...f, sources: [...new Set(f.sources ?? [])], upgraded: f.upgraded ?? false })
      continue
    }
    const sourceCountBefore = prev.sources.length
    prev.sources = [...new Set([...prev.sources, ...(f.sources ?? [])])]
    if (prev.sources.length > sourceCountBefore) prev.combinedThisRound = true   // 異なる lens による新規裏付けが増えたときだけ立てる
    if (ORDER.indexOf(f.severity) < ORDER.indexOf(prev.severity)) prev.severity = f.severity
    prev.problem = `${prev.problem}\n\n（別観点からの同一箇所の指摘）${f.problem}`
  }
  for (const f of byLoc.values()) {
    if (f.combinedThisRound && !f.upgraded) {
      f.severity = ORDER[Math.max(0, ORDER.indexOf(f.severity) - 1)]
      f.upgraded = true
    }
    delete f.combinedThisRound
  }
  return [...byLoc.values()]
}

// 各カテゴリから 1 件。複数 lens が指摘したものを優先し、同点なら先着。
// ラウンド 2 以降は NIT を選抜しない（NIT は直すたびに新しい NIT を生み、収束を妨げる）。
function pick(findings, round) {
  // ラウンド 2 以降は NIT を外すのが既定。ただし severityFocus で NIT を明示指定したときは
  // 全ラウンド選抜対象にする。そうしないと NIT が永久に選ばれないまま
  // FOCUS 対象外の MUST/WANT だけが保留送りになり、重大な指摘を捨てて「収束」と報告してしまう
  const base = round === 1 || FOCUS?.includes('NIT') ? ORDER : ['MUST', 'WANT']
  const categories = FOCUS ? base.filter((s) => FOCUS.includes(s)) : base
  return categories.flatMap((sev) =>
    findings
      .filter((f) => f.severity === sev)
      .sort((a, b) => (b.sources?.length ?? 1) - (a.sources?.length ?? 1))
      .slice(0, PICKS)
  )
}

function reviewPrompt(lens, round) {
  const blocked = rejected.length
    ? `\n\n## 既に検証で棄却された指摘\n以下は検証済みで誤りと判定されている。**同趣旨の指摘は、表現を変えても再提出しないこと。**\n${rejected
        .map((r) => `- [${r.finding.location}] ${r.finding.title}\n  棄却理由: ${r.reason}`)
        .join('\n')}`
    : ''
  return `あなたは「${lens.key}」の観点だけを担当するレビュアーです（ラウンド ${round}）。

## レビュー対象
${TARGET}
対象は自分で読んでください。内容は渡されていません。

## この成果物の目的
${PURPOSE}

## あなたの観点
見るもの: ${lens.focus}
見ないもの: ${lens.excludes ?? '担当観点以外のすべて'}

## 指示
- 担当観点に該当する問題だけを挙げる。他観点への言及は不要
- 目的に照らして問題かどうかを判断する。一般論として望ましいだけの指摘はしない
- severity は「放置したときに何が起きるか」で決める（MUST=目的を達成できない / WANT=直せば明確に良くなる / NIT=些末）
- location は必ず特定して書く。曖昧だと修正役が別の箇所を直す
- 指摘が無いなら findings を空配列で返す。無理に絞り出さない${blocked}`
}

function verifyPrompt(f) {
  return `レビューで出た以下の指摘が妥当か検証してください。指摘者の主張を信用せず、対象を自分で読んで裏を取ること。

## 対象
${TARGET}

## この成果物の目的
${PURPOSE}

## 検証する指摘
severity: ${f.severity}${(f.sources?.length ?? 1) > 1 ? `（${f.sources.length} 観点が独立に同じ箇所を指摘）` : ''}
title: ${f.title}
location: ${f.location}
problem: ${f.problem}
suggestion: ${f.suggestion}

## 判断手順
1. valid: 指摘された問題は実際に存在するか。読み違い / 既に対処済み / 前提の誤り / 文脈を見ない一般論の投影ではないか
2. essential: 直すと目的達成に効くか。表面的な整形にすぎないなら false
3. effort: 局所的な書き換えで済むなら easy。構造変更や新たな判断が要るなら hard

## decision の決め方
- valid かつ (essential または effort=easy) → fix
- valid かつ !essential かつ effort=hard → defer
- !valid → reject

## 判断が割れたときの倒し方
- WANT / NIT: reject に倒す。誤った指摘で成果物を変更するコストのほうが高い
- **MUST: reject ではなく defer に倒す**。reject は以後の全ラウンドで再提出を遮断するため、
  一度の誤判定で正しい MUST 指摘が永久に失われ、欠陥を残したまま「収束」と報告されてしまう。
  defer なら選抜から外れるだけで最終報告に残り、ユーザーが覆せる

reason には対象の具体的な箇所への参照を必ず含めること。`
}

function fixPrompt(f, verdict) {
  return `以下の指摘に従って対象を修正してください。

## 対象
${TARGET}

## 修正する箇所
${f.location}

## 指摘（${f.severity}）: ${f.title}
${f.problem}

## 修正方針
${f.suggestion}

## 検証者の判断
${verdict.reason}

## 制約
- 上記の location の範囲だけを直す。ついでの改善はしない（次ラウンドのレビューに任せる）
- 修正が他の記述と矛盾を生む場合、その整合は取ってよいが、**矛盾した箇所に限る**。全体の見直しはしない
- **リポジトリ規約に基づく付随作業はしない**（version の bump、README への登録、commit など）。
  これらはループ終了後に 1 回まとめて行うので、ラウンドごとに繰り返す必要はない
- 指摘された問題が既に対処済みで変更が不要だった場合は、**無理に変更せず changed=false で返す**。
  「何か直さなければ」と周辺をいじると、検証していない変更が混入する`
}

let stopReason = `${MAX_ROUNDS} ラウンドの上限に到達`

for (let round = 1; round <= MAX_ROUNDS; round++) {
  // --- Review -------------------------------------------------------------
  phase('Review')
  const reviews = (await parallel(
    LENSES.map((lens) => () =>
      agent(reviewPrompt(lens, round), {
        label: `r${round} review:${lens.key}`,
        phase: 'Review',
        model: MODEL.review,
        schema: FINDINGS,
      }).then((r) => r && { findings: (r.findings ?? []).map((f) => ({ ...f, sources: [lens.key] })) })
    )
  )).filter(Boolean)

  // 失敗を収束と取り違えないための突き合わせ。これが無いと全滅が「指摘なし」に化ける
  const lensFailed = LENSES.length - reviews.length
  if (lensFailed >= Math.ceil(LENSES.length / 2)) {
    stopReason = `ラウンド ${round}: ${LENSES.length} 観点中 ${lensFailed} 観点のレビューが失敗した（収束ではない）`
    log(stopReason)
    break
  }
  let degraded = lensFailed > 0
  if (degraded) log(`警告: ${lensFailed} 観点のレビューが失敗。このラウンドは収束判定に使わない`)

  // --- 集約 ---------------------------------------------------------------
  // 棄却（誤り）と保留（妥当だが直さない）の両方を選抜から落とす。
  // 保留を落とさないと、粘着的な保留指摘が毎ラウンド同じカテゴリ枠を占有し、
  // 他の妥当な指摘が一度も検証されないまま「収束」と判定される。
  const blocked = new Set([...rejected, ...deferred].map((x) => label(x.finding)))
  // deferred はレビュー役に渡さないため label 一致だけでは言い換え再提出や severity 昇格をすり抜ける。
  // defer は箇所に紐づく判断なので locKey でも落とす。ただし MUST は「永久に失わない」方針があるため、
  // 同一箇所の別の新規 MUST まで黙って落とさないよう locKey 抑止の対象から除外する
  const deferredLocKeys = new Set(deferred.map((x) => locKey(x.finding)))
  const suppressedThisRound = []
  const merged = merge([...carryover, ...reviews.flatMap((r) => r.findings ?? [])])
    .filter((f) => !blocked.has(label(f)))
    .filter((f) => {
      if (f.severity === 'MUST' || !deferredLocKeys.has(locKey(f))) return true
      // 同一箇所の別趣旨の新規指摘を巻き込んで落とすことがある。
      // 黙って消すとユーザーが存在に気づけないので、抑止したことを記録に残す
      suppressedThisRound.push(f)
      return false
    })

  for (const f of suppressedThisRound) {
    deferred.push({
      finding: f,
      reason: '保留済みの指摘と同じ箇所のため選抜から外した（別趣旨の可能性あり。最終報告で確認できるよう記録）',
    })
  }

  const picked = pick(merged, round)
  carryover = merged.filter((f) => !picked.includes(f))   // 選ばれなかったものは次ラウンドへ

  // 選抜対象にならない severity（NIT は全ラウンド、FOCUS 指定時はその対象外カテゴリも）は、
  // 持ち越しに置いても pick() に二度と選ばれず、収束判定が永久に成立しない（設計原則 3）。
  // 集約直後に保留へ移し、次ラウンド以降の merge 対象から外す
  const selectable = FOCUS ?? ['MUST', 'WANT']
  deferred.push(
    ...carryover
      .filter((f) => !selectable.includes(f.severity))
      .map((f) => ({
        finding: f,
        reason: `${f.severity} は選抜対象外のため、検証に進まないまま保留へ回す`,
      }))
  )
  carryover = carryover.filter((f) => selectable.includes(f.severity))

  if (picked.length === 0) {
    // degraded は「このラウンドを収束と判定しない」ためのフラグであって終了条件ではない。
    // ここで break すると、一時的なレビュー失敗 1 件だけでループ全体が目的を達成せず終わる
    if (degraded) {
      log(`ラウンド ${round}: 新規の指摘は出なかったが、${lensFailed} 観点が失敗している（収束とは言えない）。次ラウンドへ`)
      continue
    }
    stopReason = `ラウンド ${round} で新規の指摘が出なかった（収束）`
    log(stopReason)
    break
  }
  log(`ラウンド ${round}: ${merged.length} 件の指摘から ${picked.length} 件を検証（持ち越し ${carryover.length} 件）`)

  // --- Verify -------------------------------------------------------------
  phase('Verify')
  const judged = (await parallel(
    picked.map((f) => () =>
      agent(verifyPrompt(f), {
        label: `r${round} verify:${f.severity}`,
        phase: 'Verify',
        model: MODEL.verify,
        schema: VERDICT,
      }).then((v) => (v ? { finding: f, verdict: v } : null))
    )
  )).filter(Boolean)

  const verifyFailed = picked.length - judged.length
  if (verifyFailed > 0) {
    degraded = true
    // 検証できなかった指摘は捨てずに持ち越す。捨てると二度と検証されない
    carryover.push(...picked.filter((f) => !judged.some((j) => j.finding === f)))
    log(`警告: ${verifyFailed} 件の検証が失敗。持ち越して再検証する`)
  }
  if (judged.length === 0) {
    stopReason = `ラウンド ${round}: 検証が全件失敗した（収束ではない）`
    log(stopReason)
    break
  }

  for (const j of judged) {
    if (j.verdict.decision === 'reject') rejected.push({ finding: j.finding, reason: j.verdict.reason })
    else if (j.verdict.decision === 'defer') deferred.push({ finding: j.finding, reason: j.verdict.reason })
  }

  const toFix = judged.filter((j) => j.verdict.decision === 'fix')
  if (toFix.length === 0) {
    // 最後の防波堤: 検証失敗時の持ち越し（直前のブロック）は carryover 計算直後の flush より
    // 後に carryover へ戻すため、その非選抜 severity はまだ保留に移っていない。
    // ここで収束判定に入る前にもう一度同じ正規化をかけないと、本来 deferred に入るべき指摘が
    // ラウンド上限到達時に unverified として報告されてしまう
    const selectable = FOCUS ?? ['MUST', 'WANT']
    deferred.push(
      ...carryover
        .filter((f) => !selectable.includes(f.severity))
        .map((f) => ({
          finding: f,
          reason: `${f.severity} はこの実行の選抜対象外のため、検証に進まないまま保留へ回す`,
        }))
    )
    carryover = carryover.filter((f) => selectable.includes(f.severity))

    // 「修正すべきものが無かった」と「まだ検証していないものが残っている」は別。
    // carryover を見ずに収束と判定すると、各カテゴリ 1 件制約で後回しになった指摘が
    // 一度も検証されないまま終了する
    // degraded（部分的なエージェント失敗）は収束判定を止めるだけで、終了条件ではない。
    // 持ち越しが残っている限り、degraded かどうかに関わらず次ラウンドで再検証する
    if (carryover.length > 0) {
      log(`ラウンド ${round}: 検証を通過した指摘は 0 件。未検証が ${carryover.length} 件残っているので次ラウンドへ`)
      continue
    }
    if (degraded) {
      log(`ラウンド ${round}: 検証を通過した指摘は 0 件、持ち越しも無いが、失敗したエージェントがある（収束とは言えない）。次ラウンドへ`)
      continue
    }
    stopReason = `ラウンド ${round} で検証を通過した指摘が 0 件、未検証の持ち越しも無し（収束）`
    log(stopReason)
    break
  }

  // 振動検出: 同じ location を 2 回目の修正対象にしたら、観点同士が対立している。
  // ループでは解けないのでユーザーに返す
  const oscillating = toFix.find((j) => (fixedLocations.get(locKey(j.finding)) ?? 0) >= 1)
  if (oscillating) {
    // このラウンドの toFix（振動した 1 件＋巻き添えの他カテゴリ分）はまだ未適用。
    // break 前に carryover へ戻さないと、採用判定済みなのに applied/deferred/rejected/unverified の
    // どのリストにも載らず最終報告から消える
    carryover.push(...toFix.map((j) => j.finding))
    stopReason = `振動を検出: ${oscillating.finding.location} が 2 回目の修正対象になった。観点が対立している可能性があるためユーザーの判断を仰ぐ`
    log(stopReason)
    break
  }

  // --- Fix ----------------------------------------------------------------
  // 直列。同じファイルを触るため並列化すると競合する
  phase('Fix')
  for (const j of toFix) {
    const result = await agent(fixPrompt(j.finding, j.verdict), {
      label: `r${round} fix:${j.finding.severity}`,
      phase: 'Fix',
      model: MODEL.fix,
      schema: FIX_RESULT,
    })
    // 修正が失敗したら「適用済み」として記録しない。記録すると
    // (1) 直っていないものを直ったと報告し、(2) fixedLocations が加算されて
    // 次ラウンドの再指摘が振動と誤検出され、誤った理由でループが止まる
    if (result === null) {
      carryover.push(j.finding)
      log(`警告: ${j.finding.location} の修正が失敗。持ち越して再処理する`)
      continue
    }
    // 「実行したが何も変えなかった」を applied に積むと偽の成功報告になる。
    // 変更していないので振動カウントも進めない（進めると次の指摘が振動と誤検出される）
    if (!result.changed) {
      noChange.push({ finding: j.finding, reason: result.summary })
      log(`修正不要と判断: ${j.finding.location} — ${result.summary}`)
      continue
    }
    fixedLocations.set(locKey(j.finding), (fixedLocations.get(locKey(j.finding)) ?? 0) + 1)
    applied.push({
      round,
      severity: j.finding.severity,
      title: j.finding.title,
      location: j.finding.location,
      result: result.summary,
    })
  }
}

return { stopReason, applied, noChange, deferred, rejected, unverified: carryover }
```

## 呼び出し例

```
Workflow({
  scriptPath: '<保存されたスクリプトのパス>',
  args: {
    target: 'plugins/yutaura-toolkit/skills/foo/SKILL.md と references/*.md',
    purpose: 'Claude が foo をするときに正しい手順を踏めるようにする',
    lenses: [
      { key: '発火条件', focus: 'description のトリガー精度', excludes: '本文の内容' },
      { key: '実行可能性', focus: '手順が曖昧さなく実行できるか', excludes: '文体' },
      { key: '悲観的検証', focus: 'この skill が失敗する経路', excludes: '改善提案' },
    ],
    maxRounds: 5,
    // 残件が多いときは重い指摘から潰す。対象外の severity は保留へ回り収束判定から外れる
    severityFocus: ['MUST'],
    picksPerCategory: 2,
  },
})
```

スクリプトはこのファイルの「スクリプト」節の JS をそのまま書き出して使う。保存先はリポジトリを汚さないようセッションの作業用ディレクトリ（scratchpad）にする。

## 戻り値

```
{
  stopReason: string,     // 収束 / 上限 / 振動 / 失敗のどれで終わったか
  applied:    [...],      // 実際にファイルを変更した修正（round / severity / title / location / result）
  noChange:   [...],      // 修正役が「既に対処済み」と判断し何も変えなかったもの
  deferred:   [...],      // 妥当だが直さなかったもの（理由つき）
  rejected:   [...],      // 誤りと判定したもの（理由つき）。検証役の誤判定を疑う材料になる
  unverified: [...],      // 検証まで到達しなかった指摘。上限到達・振動・失敗時にここに残る
}
```

最終報告ではこの 6 つを**すべて**ユーザーに提示する。`applied` だけを報告すると、落とした指摘の妥当性をユーザーが検証できない。

`noChange` を `applied` と混ぜないことが重要。混ぜると「直っていないものが直った」と報告される。`noChange` が多いときは、レビュー役が古い状態を見ている（＝対象の渡し方か持ち越しの扱いに問題がある）シグナルでもある。

## 注意

- **スクリプト内で `Date.now()` / `Math.random()` / 引数なしの `new Date()` は使えない**（Workflow の resume を壊すため）。タイムスタンプが要るなら `args` で渡す
- `agent()` の失敗を `.filter(Boolean)` で落としたら、**必ず起動数と突き合わせる**。差分を見ないと失敗が収束に化ける
- **Fix フェーズも同じ**。`agent()` が null を返したまま `applied` に積むと、直っていないものを「適用した修正」として報告し、`fixedLocations` の加算で振動検出まで誤発火する
- ラウンド数 × (lens 数 + 3 + 修正数) がエージェントの総起動数。lens を増やす前にコストを見積もる
- 実行前に復元点（commit / stash）を確保する。このスクリプトは最大 `maxRounds × 3` 回ファイルを書き換える
