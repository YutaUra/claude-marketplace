---
name: herdr-agent-message
description: herdr で別 workspace / pane で動く独立した Claude Code エージェントに作業を依頼し、返信を受け取るための定型手順。宛先特定 → 自己完結メッセージ送信 → 進捗確認 → 返信受領を、herdr CLI（Bash 経由）で安全に実行する。特に「テキスト投入だけでは submit されない」2段階送信の落とし穴を構造的に回避する。Use when: (1) 「別のエージェントに依頼」「他の workspace / pane の agent にメッセージ」「herdr でエージェント間連携」と言われたとき、(2) 独立して動いている別セッションの Claude Code に作業を渡して結果を受け取りたいとき、(3) 複数 workspace のエージェントを協調させたいとき。同一セッション内の subagent 起動（Agent tool / SendMessage）には使わない。
---

# herdr Agent Messaging

別の workspace / pane で動いている **独立した Claude Code セッション** に作業を依頼し、返信を受け取るための skill。herdr には Claude Code 専用ツールが無いため、すべて **Bash から `herdr` CLI を叩く** 運用になる。

## ⚠️ 最重要: SendMessage とは別物

Claude Code 組み込みの **SendMessage / Agent tool は「同一セッション内の subagent」専用** で、別 pane で独立に動く Claude Code には **届かない**。別 pane の相手に渡すには、この skill の通り `herdr` CLI を使うこと。取り違えると「送ったつもりで届いていない」事故になる。

## ⚠️ 最重要の落とし穴: 送信は「投入」と「確定」が別

`herdr agent send <target> <text>` は相手の **入力欄にテキストを入れるだけ** で、**Enter（submit）されない**。これだけで済ませると相手は着手せず、1 往復まるごと無駄になる。

これを構造的に回避するため、**送信は原子的な `pane run` を主推奨** とする:

```bash
# ✅ 主推奨: テキスト投入 + Enter を 1 コマンドで原子的に実行（enter 忘れが起きえない）
herdr pane run <pane_id> "<自己完結メッセージ>"
```

`pane run` は herdr 公式が案内する送信の正道（`agent send` の help に *"use pane run when you want command text plus Enter"* と明記）。**enter を忘れる余地が構造的に無い** ため、この skill の最重要目的（落とし穴の再発防止）をそのまま満たす。

### 代替: 2 段送信（agent send → send-keys enter）

以下のケースでは 2 段方式を使う:

- 宛先を **pane_id ではなく agent 名 / label** で指定したい（`agent send` は agent-aware）
- **送信せず入力欄に溜めておきたい**（下書き・段階投入してから最後に Enter）

```bash
# 代替: 投入と確定を分ける（この順序で必ず 2 コマンド）
herdr agent send <target> "<自己完結メッセージ>"
herdr pane send-keys <pane_id> enter        # ← これを忘れると submit されない
```

> `pane run` が Claude Code の入力欄へ正しく submit されることは **検証済み（herdr 0.7.1 / macOS）**。
>
> なぜ原子的な `pane run` が優れるかの実地知見: 2 段方式で `agent send` の**直後に** `send-keys enter` を即実行すると、テキストが入力欄に反映される前に enter が届いて **空振り**することがある（タイミング依存）。`pane run` はテキスト投入と Enter が原子的なので、この競合自体が発生しない。

## ワークフロー

### Step 1: 意図の確認（安全ゲート）

他エージェントへの依頼は **別セッションで自律作業を起動する行為** に等しい。実行前に必ず:

- ユーザーに「どの相手に・何を依頼するか」を提示し合意を取る
- **秘密情報（認証情報・トークン・個人情報など）を送らない**。相手は別セッションで、ログにも残る
- 相手が今 `working` の場合、割り込みが妥当か確認する（後述）

### Step 2: 宛先の特定

```bash
herdr agent list        # JSON。各 agent の pane_id / workspace_id / cwd / agent_status / focused
herdr workspace list    # workspace の label / worktree.checkout_path も取れる
```

- **相手の pane_id**（`wN:pN` 形式）を特定する。cwd / label / repo 名でマッチさせる。
- **自分の pane** は `focused:true` か、自分の cwd に一致するエントリで判別する。
- `agent_status` は `idle` / `working` / `blocked` / `unknown`。依頼先が `working` なら着手中なので、割り込む前に Step 1 の確認を。

宛先候補が曖昧なときは、pane の中身を読んで確認する:

```bash
herdr pane read <pane_id> --source recent-unwrapped --lines 40
```

### Step 3: 自己完結メッセージの作成

**相手は当方の会話文脈を一切持たない。** メッセージは単体で成立させる。必ず含める:

1. **目的 / 背景**: 何のための作業か
2. **具体的な依頼内容 / 仕様**: 曖昧さを残さない。対象ファイル・期待する成果物を明記
3. **完了時の返信手順**: 自分の pane_id と、返信に使うコマンドを明記する（下記テンプレ）

返信手順の明記例（依頼メッセージの末尾に入れる）:

```
完了したら、以下のコマンドで <自分の pane_id> に返信してください:
  herdr pane run <自分の pane_id> "<報告内容>"
```

### Step 4: 送信

```bash
# 主推奨
herdr pane run <相手の pane_id> "<Step 3 で作った自己完結メッセージ>"
```

長文・複数行メッセージは、1 つのクオート引数として渡す。シェルのクオート崩れに注意（`"` を含む本文は `'...'` で囲む等）。

### Step 5: 進捗確認

**手動ポーリングより `agent wait` の同期ブロッキング待ちが確実:**

```bash
# 相手が idle に戻る（＝作業完了の目安）まで最大 N ミリ秒ブロックして待つ
herdr agent wait <相手の pane_id> --status idle --timeout 600000
```

補助的に状態やログを直接見る:

```bash
herdr agent get <相手の pane_id>                              # 現在の agent_status を単発取得
herdr pane read <相手の pane_id> --source recent-unwrapped --lines 120   # 出力を読む
```

- 送信直後に `idle → working` に変われば **着手を確認** できる。
- 長時間かかる依頼は `--timeout` を長めに。ブロッキングが切れたら再度 wait するか pane read で状況確認。

### Step 6: 返信の受領

相手が指示通り `herdr pane run <自分の pane_id> "<報告>"`（または `agent send` + `send-keys enter`）を実行すると、**その内容は自分のセッションに user 発言として届く**。届かない場合は Step 5 の `pane read` で相手の出力を直接確認し、相手が enter を忘れていないか（＝入力欄に溜まったまま）を疑う。

## よく使うコマンド早見

| 目的 | コマンド |
| --- | --- |
| エージェント一覧（宛先特定） | `herdr agent list` |
| workspace 一覧（label / worktree） | `herdr workspace list` |
| 送信（主推奨・原子的） | `herdr pane run <pane_id> "<text>"` |
| 送信（代替・投入のみ） | `herdr agent send <target> "<text>"` |
| 送信確定（代替の 2 段目） | `herdr pane send-keys <pane_id> enter` |
| 状態を待つ（同期） | `herdr agent wait <target> --status idle --timeout <ms>` |
| 状態を単発取得 | `herdr agent get <target>` |
| 出力を読む | `herdr pane read <pane_id> --source recent-unwrapped --lines N` |
| 中断（Ctrl+C 相当） | `herdr pane send-keys <pane_id> ctrl+c` |

全コマンドの詳細・オプションは [references/cli-reference.md](references/cli-reference.md) を参照。

## アンチパターン

- **`agent send` だけで送信完了と思い込む**: submit されない。`pane run` を使うか、`send-keys enter` を続ける。
- **SendMessage / Agent tool で別 pane に送ろうとする**: 同一セッション subagent 専用で届かない。
- **会話文脈前提のメッセージを送る**: 相手は文脈ゼロ。自己完結にしないと質問が返ってきて往復が増える。
- **返信先を書き忘れる**: 相手は自分の pane_id を知らない。Step 3 のテンプレを必ず入れる。
- **秘密情報を送る**: 別セッション・ログに残る。認証情報・トークンは渡さない。
- **意図確認なしに working 中の相手へ割り込む**: 進行中作業を壊しうる。Step 1 のゲートを省略しない。
- **手動 sleep + pane read でポーリングし続ける**: `agent wait` の同期待ちの方が確実で無駄がない。

## 連携するスキル

- **claude-code-rules**: 「別 pane への依頼はこの skill を使う」というルールを `.claude/rules/` に書くと、適切なタイミングで発火しやすくなる。
