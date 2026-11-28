# 実行: baseline と候補を同じ条件で走らせ、伏せて採点する

## 1. 作業場所

評価の作業は**リポジトリの外**（scratchpad など）で行い、成果物のディレクトリを汚さない。

```
<work>/
├── configs/
│   ├── baseline/        # 現行版のスナップショット（git の HEAD から取り出す）
│   └── candidate/       # 変更後の版
├── fixtures/<case>/     # ケースごとの題材（試行ごとにコピーして使う）
├── runs/<config>/<case>/trial-<n>/
│   ├── response.md      # 実行役の最終返答
│   ├── ...              # 実行役が作った・変えたファイル、必要ならログ
│   └── meta.json        # {"tokens": 12345, "duration_ms": 67000, "status": "ok"}
├── blind/               # eval-kit.ts blind の出力（採点役にはここだけ見せる）
├── grades.jsonl         # 採点役の出力
└── results.jsonl        # eval-kit.ts unblind の出力
```

baseline のスナップショット: `git archive HEAD <skill のディレクトリ> | tar -x -C <work>/configs/baseline`。既存版が無い新規の skill は「skill なし」が baseline になる。

## 2. 何を比べるか

| 状況 | baseline | 候補 |
| --- | --- | --- |
| 既存の成果物を直す | 変更前の版（HEAD） | 変更後の版 |
| 新しい skill / agent を作る | skill / agent なし | 新しい版 |
| 複数案から選ぶ | 現行版 | 各案（ただし `analysis.md` の「勝者の呪い」に注意） |

新規の skill でも、最初の改善以降は「前の版」を baseline にする。「なし」との比較だけを続けると、版を重ねて悪化したことに気づけない。

## 3. 成果物の種類ごとの走らせ方

| 成果物 | 走らせ方 |
| --- | --- |
| skill | サブエージェントに「まず `<work>/configs/<config>/SKILL.md` を読み、必要な reference もそこから読んで従う」と指示してから依頼文を渡す |
| subagent 定義 | 定義の本文を指示として渡した general-purpose のサブエージェントで走らせる。本物の system prompt の位置とは違うので、その差を制約として書く |
| CLAUDE.md / rules | fixture のリポジトリに置いて、そのディレクトリでサブエージェント（または `claude -p`）を走らせる |
| hook / settings / plugin | サブエージェントでは再現できない（hook は Claude Code 本体が発火させる）。スクラッチのディレクトリで `claude -p` を起動し、設定と plugin をそこに読み込ませる。読み込ませ方は `claude --help` で現行の option を確かめる |
| 多段のパイプラインの一部（統合だけ・分類だけ） | **変えた段だけを再実行する**。前段の出力は固定して使い回す（webapp-review の統合だけを直したときは、同じ個別レビュー結果から統合だけをやり直した）。ばらつきとコストが減り、差を変えた段に帰属できる |

### 汚染に注意する（skill なし / 旧版の実行に新版が混ざる）

このリポジトリの plugin はインストール済みなので、**baseline のサブエージェントが、インストール済みの同名の skill を Skill ツールで読み込む**ことがある。

- baseline の指示に「Skill ツールで `<name>` を読み込まない」と書く。
- 実行後に transcript で、その skill を読み込んでいないか確かめる。読み込んでいたら、その試行は `status: "harness_fail"`（欠測）。
- 逆に候補の試行で、指定したファイルを本当に読んだかも確かめる（読まずに答えていれば、それも欠測）。
- **作業ツリーにある新版も汚染源になる**。この skill 自体を評価したとき、リポジトリで走らせた baseline 9 本のうち 7 本が、作業ツリーにある作成中の `eval-driven-tuning/` を自分で探して読んでいた（`SKILL.md` のパスだけを見る検査では、references を読んだ試行を見逃した）。baseline も候補も、**新版が存在しない場所**で走らせる: `git worktree add --detach <work>/wt-head HEAD` で HEAD の worktree を作り、全条件をそこで実行する（終わったら `git worktree remove`）。候補には `<work>/configs/candidate/` のパスだけを渡す。
- 汚染の検査は、ツール呼び出しの入力に成果物の名前（ディレクトリ名）が含まれるかで広く見る。特定のファイル名だけで見ない。

## 4. 同じ条件にする

- 同じ依頼文・同じ fixture・同じモデル。baseline と候補は**同じタイミングでまとめて起動**する（時間帯で混み具合やレート制限が違うため）。
- **試行ごとに新しいコンテキストと新しい fixture のコピー**を使う。前の試行が残したファイル・git 履歴・キャッシュは次の試行に影響する。
- 試行は最低 3 回。1 回の結果は分布からの 1 標本にすぎない（同じ依頼・同じ版でも、片方は全部通り、もう片方は途中で止まって全部落ちることがある）。毎回効いてほしい成果物（rules・hook・skill の発火）は 5 回にする。
- **実行役に assertion・expected_output・改善の狙いを渡さない**。採点の中身が見える実行役は、採点に合わせた振る舞い（reward hacking）をしやすい。
- 実行役の返答を、プロンプトを組み立てたり要約したりせず**そのまま** `response.md` に保存する。

### 完了通知の数値はすぐ保存する

サブエージェントの完了通知には tokens と所要時間が含まれる。ほかには残らないので、受け取った時点で `meta.json` に書く。失敗した試行（接続断・権限で停止・タイムアウト）は `"status": "harness_fail"`、成果物側の失敗（拒否・途中で諦めた）は通常の試行として採点する。

## 5. 伏せて採点する

```bash
KIT=<skill のディレクトリ>/scripts/eval-kit.ts
bun "$KIT" blind <work>/runs <work>/blind          # 試行をランダムな id に付け替えて配置。key は runs/blind-key.json
# 採点役のサブエージェントに <work>/blind/<id>/ とケースの依頼文・assertion だけを渡し、grades.jsonl を書かせる
bun "$KIT" unblind <work>/grades.jsonl <work>/runs/blind-key.json > <work>/results.jsonl
bun "$KIT" compare <work>/results.jsonl            # analysis.md
```

- 採点役には `runs/`・`configs/`・`blind-key.json` の場所を教えない。blind の中身は `meta.json` を除いた試行ディレクトリのコピー。
- 採点役は試行ごと、またはケースごとに分ける。1 体に全部を採点させると、先に見た出力が基準になる。
- 出力の書きぶりで版が分かってしまう場合（新しい skill だけが特定の見出しを出す等）、伏せは不完全になる。そのことを報告に書く。
- 採点されなかった試行は `unblind` が `harness_fail` として残す。黙って消える試行を作らない。

## 6. 予算と途中変更

- **始める前に決める**: ケース数・試行回数・改善の最大ラウンド数（既定は 5 ラウンドまで）。後から決めた予算は「かかった回数の記述」になり、歯止めにならない。
- 同じ失敗に 2 回の修正が効かなければ、文言をいじり続けずに `changes.md` の「どの層で直すか」に戻る。
- **実行の途中で成果物や採点を直さない**。途中で欠陥に気づいたら、最後まで走らせて制約として記録するか、全部やり直すかのどちらか。途中で直すと結果表に痕跡が残らない。

## 7. コストの見積もり

1 ラウンド = ケース数 × 試行回数 × 2 条件 の実行 ＋ 採点。8 ケース × 3 試行なら実行 48 回。重いので、

- まず軽量（狙ったケース数件 × 3 試行）で方向を確かめ、効きそうなら標準に広げる。
- 多段の成果物は変えた段だけを再実行する（§3）。
- 実行前にユーザーに件数と回数を伝える。

出典: anthropics/skills（skill-creator の実行・timing.json・baseline の取り方）、alirezarezvani/claude-skills（agent-regression-evals の flake_detector, eval_statistics）、muratcankoylan/Agent-Skills-for-Context-Engineering（self-improvement-loops の Outside-the-Loop Invariant）、braintrustdata/eval-library（design-eval-experiment, attribute-multi-variable-change）、langwatch/skills（scenarios, agent-improve）、このリポジトリの webapp-review の評価記録
