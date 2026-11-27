# herdr CLI リファレンス（エージェント間通信で使う範囲）

herdr 0.7.1 時点。すべて Bash から `herdr` を叩く。出力は JSON（`agent list` / `agent get` / `workspace list` など）。

## targets の指定

`agent` 系サブコマンドの `<target>` は以下を受け付ける（`herdr agent` help より）:

- terminal id（例: `term_655fc03386e251`）
- ユニークな agent 名
- 検出 / 報告された agent label
- pane id（`wN:pN` 形式。legacy 扱いだが有効）

`pane send-keys` / `pane read` / `pane run` などの `<pane_id>` は **pane id 必須**。したがって 2 段送信の 2 段目や `pane read` を使う以上、結局 pane_id は特定しておく必要がある。

## agent サブコマンド

```
herdr agent list
herdr agent get <target>
herdr agent read <target> [--source visible|recent|recent-unwrapped] [--lines N] [--format text|ansi] [--ansi]
herdr agent send <target> <text>
herdr agent rename <target> <name>|--clear
herdr agent focus <target>
herdr agent wait <target> --status <idle|working|blocked|unknown> [--timeout MS]
herdr agent attach <target> [--takeover]
herdr agent start <name> [--cwd PATH] [--workspace ID] [--tab ID] [--split right|down] [--env KEY=VALUE] [--focus|--no-focus] -- <argv...>
herdr agent explain <target> [--json]
```

### `agent list`

各 agent の代表的フィールド:

| フィールド | 意味 |
| --- | --- |
| `pane_id` | `wN:pN`。宛先指定・pane 系コマンドで使う |
| `workspace_id` | `wN` |
| `tab_id` | `wN:tN` |
| `terminal_id` | `term_...`。target として使える |
| `cwd` / `foreground_cwd` | 作業ディレクトリ。宛先マッチに使う |
| `agent_status` | `idle` / `working` / `blocked` / `unknown` |
| `focused` | `true` なら現在フォーカス中の pane。自分の pane 判別に使える |

### `agent send`（テキスト投入のみ）

`agent send writes literal text`（help 原文）。**リテラルなテキストを入力欄に書くだけで Enter しない。** submit するには続けて `pane send-keys <pane_id> enter`。送信 + Enter を一度に済ませたいなら `pane run` を使う（help 推奨）。

> **タイミング依存の落とし穴（実地知見）**: `agent send` の**直後に** `send-keys enter` を即実行すると、テキストが入力欄に反映される前に enter が届いて **空振り**することがある。2 段方式を使う場合はこの競合に注意（反映を待つ / 空振りしたら再送）。`pane run` はテキスト + Enter が原子的なのでこの問題自体が起きない ＝ 主推奨の理由。

### `agent wait`（同期ブロッキング待ち）

指定 status になるまでブロックする。`--timeout` は **ミリ秒**。作業完了の目安として `--status idle` を待つのが定番。タイムアウトすると解決せず戻るので、必要なら再度 wait するか `pane read` で確認する。

### `agent read` / `agent get`

- `agent read <target>` は `pane read` と同じ内容を target 指定で読める。
- `agent get <target>` は単一 agent の現在状態（`agent_status` 等）を単発取得。

## pane サブコマンド（送受信で使う範囲）

```
herdr pane read <pane_id> [--source visible|recent|recent-unwrapped] [--lines N] [--format text|ansi] [--ansi]
herdr pane send-text <pane_id> <text>
herdr pane send-keys <pane_id> <key> [key ...]
herdr pane run <pane_id> <command>
```

### `pane run`（主推奨の送信手段）

`<command>` として渡したテキストを入力し、**Enter まで原子的に実行** する。エージェント宛てなら「メッセージ投入 + submit」が 1 コマンドで完結し、enter 忘れが構造的に起きない。

> **入力欄への「追記」挙動に注意（実地知見）**: `pane run` / `agent send` は入力欄を空にしてから書くのではなく、**既存の入力に追記**する。相手の pane に人間の**打ちかけ下書き**が残っていると、こちらの本文が連結されて**下書きごと submit**される（相手の入力破壊 + 本文混入）。送信の直前に `pane read --source visible --ansi` で **入力欄が空 × 通常プロンプト受付中（`Enter to select` 等の選択メニュー / 権限ダイアログでない）** を確認する（`--ansi` 必須の理由は下記 `pane read` 参照）。下書きを `ctrl+u` 等で消すのは相手の入力破壊なので不可。空くまで待つ。

### `pane send-text` / `pane send-keys`

- `send-text`: テキストのみ投入（Enter しない）。`agent send` の pane 版に相当。
- `send-keys`: キー入力を送る。`enter` で submit、`ctrl+c` で中断など。複数キーを並べて送れる。

### `pane read`

`--source` の使い分け:

| source | 内容 |
| --- | --- |
| `visible` | 画面に見えている範囲 |
| `recent` | 直近の出力（折り返しあり） |
| `recent-unwrapped` | 直近の出力（折り返し解除）。ログとして読むならこれが読みやすい |

`--lines N` で行数指定、`--format ansi` / `--ansi` で色付き取得。

#### 送信前ガードでは `--ansi` 必須（placeholder 誤検出の回避）

プレーンな `pane read`（`--format text`）は **色・文字属性を捨てて文字列だけを返す**。そのため入力欄の `❯` の後ろに出る **placeholder（ghost / ヒント文字）** と、人間が打った **実入力の下書き** が**同じ文字列に見え、区別できない**。プレーン read だけで空判定すると、faint 描画の placeholder を「打ちかけ下書き」と**誤検出**して送信を不当に保留する（実地の事故あり）。

**判別法（`--ansi` で SGR を残して見る／実測 2 件で確定）**:

- **placeholder** は **faint（dim）= `ESC[2m`（SGR 2、バイト列 `1b 5b 32 6d`）** で描画される。
- **実入力** は明示 truecolor（例: `38;2;255;255;255` の白）で **faint が付かない**。
- 判定は「RGB が白か」の閾値より **faint 属性の有無** を見る方が正確。

| `❯` の後ろの状態 | 意味 | 送信 |
| --- | --- | --- |
| テキスト無し | 空 | 送ってよい |
| faint（`ESC[2m`）付きの可視テキスト | placeholder | 送ってよい |
| faint 無しの可視テキスト | 実下書き | HOLD（送らない） |

> ⚠️ **実装の落とし穴（stdin 二重取り）**: `--ansi` 出力を parse するとき、`herdr pane read … --ansi | python3 - <<'EOF' … EOF` のように **パイプ入力とヒアドキュメントを同時に使うと、両方が stdin を奪って壊れる**。`--ansi` 出力を**いったんファイルへ書き出し**、python 側は `sys.argv` のファイルパスから読むこと。
>
> ```bash
> herdr pane read <pane> --source visible --lines 8 --ansi > /tmp/pane.ansi
> python3 detect_placeholder.py /tmp/pane.ansi   # ファイルパスは sys.argv[1] から読む
> ```

##### 判定スニペット（`guard.py`）

`--ansi` 出力をファイル経由で受け取り、上の判定表をそのまま実装したもの（検証済み: 空 / placeholder / 実下書きの 3 ケースで期待通り）。**exit 0 = 送ってよい / exit 1 = HOLD**。

```bash
herdr pane read <pane> --source visible --lines 12 --ansi > /tmp/guard.txt
python3 guard.py /tmp/guard.txt   # exit 0=送ってよい / exit 1=HOLD
```

```python
import re, sys
raw = open(sys.argv[1], encoding="utf-8", errors="replace").read()
cand = [l for l in raw.split("\n") if "❯" in l]   # 入力プロンプト行
if not cand:
    print("NO_PROMPT -> HOLD"); sys.exit(1)
seg = cand[-1].split("❯", 1)[1]                    # ❯ の後ろ = 入力内容
text = re.sub(r"\x1b\[[0-9;]*m", "", seg).replace("\xa0", " ").strip()
if not text:
    print("EMPTY -> SAFE"); sys.exit(0)            # 空 -> 送ってよい
if "\x1b[2m" in seg:                                # SGR 2 = faint = placeholder
    print(f"PLACEHOLDER({text!r}) -> SAFE"); sys.exit(0)
print(f"REAL_DRAFT({text!r}) -> HOLD"); sys.exit(1) # faint 無しの可視テキスト = 実下書き
```

要点:

- `seg`（SGR 除去前）に対して `\x1b[2m` を検査する。属性を落とした `text` では faint 判定ができないため、**判定は必ず raw な `seg` で**行う。
- `.replace("\xa0", " ")` は入力欄の余白が **NBSP（`\xa0`）** で埋められるケースの空判定漏れを防ぐ。
- 複数プロンプト行があるときは **最後の `❯` 行**（`cand[-1]`）を採る＝現在の入力欄。

## workspace サブコマンド

```
herdr workspace list
```

各 workspace の `label` / `number` / `agent_status` / `focused` / `active_tab_id` / `pane_count` が取れる。git worktree 上の workspace は `worktree.checkout_path` / `repo_name` / `repo_root` も含むので、リポジトリ名から宛先を絞るのに便利。

## 送受信フローまとめ（コマンド列）

```bash
# 1. 宛先特定
herdr agent list
herdr workspace list

# 2. 送信前ガード（入力欄が空 × プロンプト受付中か）→ 送信（主推奨）
herdr pane read <相手pane> --source visible --lines 8 --ansi  # --ansi 必須。❯ の後ろが空 or faint な placeholder のみ、かつメニュー状態でないことを確認
herdr pane run <相手pane> "<自己完結メッセージ + 返信手順>"

#    代替（宛先を名前で / 段階投入したいとき）
herdr agent send <target> "<msg>"
herdr pane send-keys <相手pane> enter

# 3. 進捗
herdr agent wait <相手pane> --status idle --timeout 600000
herdr pane read <相手pane> --source recent-unwrapped --lines 120

# 4. 相手からの返信（相手側が実行 → 自分のセッションに user 発言として届く）
herdr pane run <自分pane> "<報告>"
```
