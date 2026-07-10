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

> ⚠️ ただし **長い複数行メッセージ** は例外。相手の入力欄に bracketed-paste（`[Pasted text #N]`）として貼られ、`pane run` 末尾の Enter が改行として吸われて submit されないことがある。`pane run` でも「送ったら submit を確認する」を省略しない（Step 4 参照）。

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
- **自分の pane** は **自分の cwd に一致するエントリを第一優先** で判別する。
  - ⚠️ `focused:true` は「ユーザーが今 UI で見ているペイン」を指すだけで、**セッションの同一性を保証しない**。複数ペイン / worktree 環境では、自分が動いているペインとは**別セッション**を指しうる（実地の事故: focused を採用した結果、返信先を別セッションの pane に誤指定し、返信が自分に届かなかった）。自己特定に focused を第一根拠にしてはいけない。
  - 補助判定: **`agent list` を自分が呼ぶと、自分のエントリは `agent_status=working` になる**（呼び出し中は bash が実行中のため）。**cwd 一致 × `working`** の掛け合わせで、同じ cwd の別ペインがあっても自分を確実に特定できる。
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

#### 送信前ガード: 相手の入力欄が「空 × プロンプト受付中」か確認する（破壊防止）

`pane run` / `agent send` は相手の**入力欄に追記する**挙動。相手の pane に**人間が入力途中の下書き**が残っていると、こちらの本文がその下書きに連結され、**下書きごと submit されてしまう**（相手の書きかけを壊し、こちらの依頼も別文と混ざって届く）。特に `focused:true` の pane は人間が今まさに打っている可能性が高く危険。

送信の**直前に**相手の入力欄を読み、次の 2 条件を満たすときだけ送る。**ガードの read は `--ansi` 必須**（理由は直後の警告）:

```bash
herdr pane read <相手の pane_id> --source visible --lines 8 --ansi
```

1. **入力欄が空 or placeholder のみ**: `────` 罫線に挟まれたプロンプト行が `❯`（マーカー）だけ、または `❯` の後ろが **placeholder（ヒント文字）のみ** なら空扱いで送ってよい。**実入力の下書き**が可視文字として残っていれば送らない。
2. **プロンプト受付中**: その行が通常の入力プロンプトである（`Enter to select` などの**選択メニュー / 権限ダイアログ / 確認プロンプト状態ではない**）。メニュー状態へ送ると Enter が選択決定として吸われ、意図しない操作を誘発する。

> ⚠️ **プレーン read では placeholder と実下書きを区別できない（`--ansi` 必須の理由）**: `❯` の後ろに出る placeholder（ghost/ヒント文字）は **faint（dim）属性で描画**されるが、`pane read`（プレーンな `--format text`）は **色・文字属性を捨てて文字列だけを返す**。そのため dim の placeholder と人間が打った実入力が**同じ文字列に見え、placeholder を「打ちかけ下書き」と誤検出**して送信を不当に保留する（実地の事故: プレーン read で placeholder を下書きと誤認）。
>
> **判別法（実測 2 件で確定）**: `--ansi` 付きで読むと SGR（色 / 属性）が残る。**`❯` の後ろのテキストに faint（`ESC[2m` = SGR 2、バイト列 `1b 5b 32 6d`）が掛かっていれば placeholder** で、実入力は明示 truecolor（例: `38;2;255;255;255` の白）で **faint が付かない**。判定は「RGB が白か」の閾値より **faint 属性の有無**を見る方が正確。ルール:
>
> | `❯` の後ろの状態 | 意味 | 送信 |
> | --- | --- | --- |
> | テキスト無し | 空 | **送ってよい** |
> | faint（`ESC[2m`）が掛かった可視テキスト | placeholder | **送ってよい** |
> | faint 無しの可視テキスト | 実下書き | **HOLD（送らない）** |
>
> ⚠️ **実装の落とし穴（stdin 二重取り）**: `--ansi` 出力を parse するとき、`herdr pane read … --ansi | python3 - <<'EOF' … EOF` のように **パイプ入力とヒアドキュメントを同時に使うと、両方が stdin を奪って壊れる**。`--ansi` 出力を**いったんファイルへ書き出し**、python 側は `sys.argv` のファイルパスから読むこと。
>
> ```bash
> # ✅ stdin を二重取りしない: ファイル経由で渡す
> herdr pane read <相手の pane_id> --source visible --lines 8 --ansi > /tmp/pane.ansi
> python3 detect_placeholder.py /tmp/pane.ansi   # ファイルパスは sys.argv[1] から読む
> ```

下書きが残っている / メニュー状態のときは、**クリア（`ctrl+u` 等）で下書きを消してはいけない**（相手の書きかけを破壊する）。空くまで待つ、`agent wait --status idle` で待つ、または「今は送れない」とユーザーに報告して指示を仰ぐ。

> ⚠️ これは人間との**レース**であり完全には防げない（チェック直後に相手が打ち始めうる）。だからこそ **送信後の確認（下記）で「自分の本文だけが submit されたか」まで見て**、混入があれば気づけるようにする。

#### 丁寧版フロー: 下書きの「生死」を差分で見極めて安全に送る

単に「空でないから送らない」で止めず、下書きが**まだ書かれているのか（生）／放置されたのか（死）**を差分で判定すると、より安全かつ確実に送れる。手順:

1. 入力欄を読む（`pane read --source visible --ansi`）。**空（テキスト無し or faint な placeholder のみ）× プロンプト受付中**なら → **送信 & submit**（`pane run`）して終了。faint の有無で placeholder / 実下書きを判別する（上の送信前ガード参照）。
2. 空でなければ **約 10 秒待つ**（人間が打っている最中かもしれない）。
3. 再度読む。**空になっていれば** → 送信 & submit して終了。
4. まだ空でなく、**内容が前回から変化していれば**（＝人間が能動的に入力中）→ 2 に戻ってさらに待つ。
5. まだ空でなく、**内容が前回と変化していなければ**（＝放置された下書き）→ 下記の「放置下書きの扱い」へ。
6. **ループ上限を設ける**（例: 6 回 / 約 60 秒）。上限を超えても空にならないなら、**送らずにユーザーへ報告**して指示を仰ぐ（無限待ち防止）。

**放置下書きの扱い（step 5）** — 2 択。安全側を既定とする:

- **A. 既定（安全）**: 送らず「相手 pane に放置下書きがある。壊さないため送信を保留した」とユーザーに報告。相手が別セッションの人間の書きかけである以上、待つ／人手で片す方が安全。
- **B. 最終手段（退避、条件付き）**: どうしても今送りたい場合のみ。下書きを退避 → クリア → 自分の本文を送信 & submit → 退避した下書きを**submit せず**入力欄へ戻す。

  ```bash
  # B: 退避 → 送信 → 復元（※下の適用条件を満たすときだけ）
  draft="$(herdr pane read <pane> --source visible --lines 8 | …)"   # ❯ 行の本文を取得
  herdr pane send-keys <pane> ctrl+u                                 # 下書きをクリア
  herdr pane run <pane> "<自分の本文>"                                # 送信 & submit
  herdr pane send-text <pane> "$draft"                               # 下書きを復元（Enter しない）
  ```

  ⚠️ **B の適用条件（外れたら A にフォールバック）**:
  - 下書きに **`[Pasted text #N]`（bracketed-paste）が含まれない**こと。画面には placeholder しか出ず**中身を復元できない**ため、含む場合 B は不可。
  - 下書きが **単一行**であること。複数行は `ctrl+u`（現在行クリア）で消し切れず残渣が出る。
  - それでも cursor 位置 / undo 履歴は失われる。B は「単一行・プレーンな放置下書き」限定の妥協策。

#### 送信

```bash
# 主推奨（送信前ガードを通してから）
herdr pane run <相手の pane_id> "<Step 3 で作った自己完結メッセージ>"
```

長文・複数行メッセージは、1 つのクオート引数として渡す。シェルのクオート崩れに注意（`"` を含む本文は `'...'` で囲む等）。

⚠️ **送信後は submit されたかを必ず確認する**（長文・複数行では特に）。長い複数行を `pane run` で送ると、相手の入力欄に **bracketed-paste（`[Pasted text #N]`）** として貼られ、**末尾の Enter が改行として吸われて submit されない**ことがある。原子的な `pane run` でも起きうるので、投入だけで安心しない:

```bash
# 送信 → submit されたか / 自分の本文だけが送られたかを確認
herdr pane run <相手の pane_id> "<自己完結メッセージ>"
herdr agent get <相手の pane_id>                                  # working に変わっていれば submit 済み
herdr pane read <相手の pane_id> --source recent-unwrapped --lines 40   # [Pasted text] 残存 / 下書き混入がないか目視

# 未 submit（working に変わらない / [Pasted text] が残っている）なら enter を追い送り
herdr pane send-keys <相手の pane_id> enter
```

送信直前が空でも、レースで相手の下書きと混ざって submit されることがある。上の `pane read` で **submit された行が自分の本文だけか** を確認し、混入していたら相手にお詫び + 本文を再送する。

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

相手が指示通り `herdr pane run <自分の pane_id> "<報告>"`（または `agent send` + `send-keys enter`）を実行すると、**その内容は自分のセッションに user 発言として届く**。届かない場合は 2 つの原因を切り分ける:

1. **enter 忘れ（送信の未確定）**: Step 5 の `pane read` で相手の出力を直接確認し、相手が enter を忘れていないか（＝入力欄に溜まったまま）を疑う。
2. **返信先 pane_id の誤指定**: 自分が渡した `<自分の pane_id>` が実は別セッションを指していないか疑う（Step 2 の自己特定ミス）。cwd 一致 × `working` で自分の pane を再確認する。

> **疎通テストは「実際に自分へ返信が届くまで」確認して初めて完了。** 相手が着手した（`working` になった）だけでは、返信先の取り違えを見逃す。往復が閉じる（返信が自分のセッションに現れる）ことをゴールにする。

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
- **返信先ペイン（自分の pane_id）を取り違える**: `enter 忘れ` と並ぶ**第二の落とし穴**。`focused:true` を自己特定に使うと、UI で見えている**別セッションの pane** を自分と誤認し、返信がそこへ飛んで自分に届かない。自己特定は **cwd 一致 × `working`**（Step 2）で行う。そして**疎通テストは「実際に自分へ返信が届くまで」確認して初めて、enter 忘れと返信先誤指定の両方を潰せる**。相手が `working` になっただけで安心しない。
- **長い複数行メッセージの `pane run` で submit されたと思い込む**: `enter 忘れ`・`返信先誤指定` に続く**第三の落とし穴**。長文・複数行を `pane run` で送ると、相手の入力欄に **bracketed-paste（`[Pasted text #N]`）** として貼られ、末尾の Enter が**改行として吸われて submit されない**ことがある。送信後に `agent_status` が `working` に変わったか / プロンプトに `[Pasted text]` が残っていないかで submit を確認し、残っていたら `send-keys enter` を追い送りする（Step 4 参照）。
- **入力途中の pane に送って下書きごと submit させる**: **第四の落とし穴**。相手の入力欄に人間が打ちかけの下書きがあると、こちらの本文がそこに連結されて**下書きごと submit**され、相手の書きかけを壊しつつ依頼も別文と混ざって届く。`focused:true` の pane は特に危険。送信の直前に `pane read --source visible --ansi` で **入力欄が空 × プロンプト受付中（メニュー/ダイアログでない）** を確認してから送る（Step 4 の送信前ガード）。ガードは **`--ansi` 必須**: プレーン read は色 / 属性を捨てるため、faint 描画の placeholder を実下書きと**誤検出**する。faint（`ESC[2m`）が掛かっていれば placeholder（送ってよい）、faint 無しの可視テキストは実下書き（HOLD）。下書きを `ctrl+u` 等で消して送るのは厳禁（相手の入力を破壊する）—空くまで待つか、送れない旨をユーザーに報告する。
- **SendMessage / Agent tool で別 pane に送ろうとする**: 同一セッション subagent 専用で届かない。
- **会話文脈前提のメッセージを送る**: 相手は文脈ゼロ。自己完結にしないと質問が返ってきて往復が増える。
- **返信先を書き忘れる**: 相手は自分の pane_id を知らない。Step 3 のテンプレを必ず入れる。
- **秘密情報を送る**: 別セッション・ログに残る。認証情報・トークンは渡さない。
- **意図確認なしに working 中の相手へ割り込む**: 進行中作業を壊しうる。Step 1 のゲートを省略しない。
- **手動 sleep + pane read でポーリングし続ける**: `agent wait` の同期待ちの方が確実で無駄がない。

## 連携するスキル

- **claude-code-rules**: 「別 pane への依頼はこの skill を使う」というルールを `.claude/rules/` に書くと、適切なタイミングで発火しやすくなる。
