# openai-decisions CLI / API リファレンス

`llm-openai-decisions` 0.1（llm 0.36 / openai 3.3.0 環境）の完全仕様。
出典は **上流実装 `llm_openai_decisions.py`（364 行）**・**上流 README**・**このマシンでの実測**。各項に出典を付す。

- model id: `openai-decisions/gpt-6-luna` / API へは `"model": "gpt-6-luna"` として送信
- endpoint: `POST https://api.openai.com/v1/decisions`（`follow_redirects=False`）
- HTTP タイムアウト: **60 秒固定**（`httpx2.Client(timeout=60)` にハードコード・変更手段なし）
- 認証: `needs_key = "openai"` / `key_env_var = "OPENAI_API_KEY"` / `--key` も使用可
- キー保存先: `~/Library/Application Support/io.datasette.llm/keys.json`（`llm keys set openai`）

## モデルの対応状況

| 属性 | 値 | 意味 |
| --- | --- | --- |
| `can_stream` | `False` | ストリーミング不可 |
| `supports_conversation` | `False` | `-c` / `llm chat` 不可 |
| `supports_schema` | `False` | `--schema` 不可 |
| `supports_tools` | `False` | tool calling 不可 |
| `attachment_types` | `image/png`, `image/jpeg`, `image/webp`, `image/gif` | 画像 4 形式のみ |
| Features | `async` のみ | 非同期実行は可（`llm.get_async_model`） |

## option 一覧

`llm models --options` の出力（実測）と実装の `DecisionsOptions` が一致。

| option | 型 | 既定値 | 制約 |
| --- | --- | --- | --- |
| `answer_type` | `predicate` \| `choice` \| `score` | `predicate` | それ以外は option 検証でエラー |
| `name` | str | `evaluation` | 空文字・空白のみは不可（`min_length=1` + blank チェック） |
| `choices` | JSON 配列 / オブジェクト | `None` | `answer_type=choice` のときのみ。**2 件以上**・value は型込みで一意 |
| `levels` | JSON 配列 | `None` | `answer_type=score` のときのみ。**2 件以上**・低→高の順 |
| `questions` | JSON 配列 | `None` | 他 4 option および `-s` と**併用不可** |

### `choices` の書き方（2 形式）

```jsonc
// 形式 A: value → description のオブジェクト（description に null を置くと「名前だけで十分」の意）
{"billing": "請求・返金", "technical": "製品の不具合", "other": null}

// 形式 B: オブジェクト配列（boolean value を使いたい場合はこちら）
[{"value": true, "description": "請求の問題"}, {"value": false, "description": "それ以外"}]
```

- `value` は **文字列または boolean**（`StrictStr | StrictBool`）。数値は不可。
- 一意性判定は **`(型, 値)` のペア**。したがって `true` と `"true"` は別物として両立する（逆に言えば型を揃えないと意図せず 2 件になる）。
- `description` は省略可（`None`）。
- **未知のキーは拒否される**（`Choice` が `extra="forbid"`）。`description` を `desc` と綴り間違えるとエラー。

### `levels` の書き方（2 形式）

```jsonc
// 形式 A: ラベルの文字列配列
["Cosmetic", "Workaround available", "Fully blocked"]

// 形式 B: {label, description} のオブジェクト配列
[{"label": "Cosmetic", "description": "見た目だけ"}, {"label": "Blocked", "description": "回避不能"}]
```

**低→高の順**で並べる。インデックスが 0 始まりのレベル番号になる。

### `questions` の書き方

```jsonc
[
  {"name": "refund", "type": "predicate", "instructions": "返金を要求しているか？"},
  {"name": "dept", "type": "choice", "instructions": "担当部署は？",
   "choices": [{"value": "billing"}, {"value": "other"}]},
  {"name": "sev", "type": "score", "instructions": "深刻度は？",
   "levels": [{"label": "Low"}, {"label": "High"}]}
]
```

- 各要素の必須フィールド: `name`（一意・空白不可）、`instructions`（空白不可）、`type`。
- `type: "choice"` なら `choices` 必須（2 件以上）、`type: "score"` なら `levels` 必須（2 件以上）。
- ⚠️ **ネイティブ形式のみ**。単一質問用の省略記法（オブジェクト形式の `choices`、文字列配列の `levels`）は `questions` 内では使えない。
- ⚠️ **`questions` を使うと出力は必ず JSON 配列**。質問が 1 つでも配列（`answers if multiple else answers[0]` で分岐）。質問の順序で返る。

### JSON の共通制約

`-o` に渡す JSON は `parse_json()` を通る:

- **キーの重複を拒否**（`Duplicate JSON key`）
- **NaN / Infinity を拒否**（`allow_nan=False`）

いずれも `Expected valid JSON with unique keys and finite numbers` にまとめられて報告される。

## 返り値のスキーマ

すべて `name` と `type` を持つ。`extra="allow"` なので、将来 provider が追加するメタデータは捨てられず残る。

### predicate

```json
{"name": "evaluation", "type": "predicate", "probability": 0.99}
```

| フィールド | 型 | 範囲 |
| --- | --- | --- |
| `probability` | float | 0〜1（条件が真である推定確率） |

⚠️ **`confidence` は無い。** `probability` が答えそのもの。

### choice

```json
{"name": "evaluation", "type": "choice", "choice": "billing",
 "confidence": 1.0,
 "probabilities": [{"value": "billing", "probability": 1.0},
                   {"value": "technical", "probability": 0.0}]}
```

| フィールド | 型 | 備考 |
| --- | --- | --- |
| `choice` | str \| bool | 選ばれた value |
| `confidence` | float | 0〜1 |
| `probabilities` | 配列（**2 件以上**） | 全選択肢の分布。`{value, probability}` |

### score

```json
{"name": "evaluation", "type": "score", "score": 0.96,
 "confidence": 0.94,
 "probabilities": [{"value": 0, "label": "Cosmetic", "probability": 0.04},
                   {"value": 1, "label": "Workaround", "probability": 0.96},
                   {"value": 2, "label": "Blocked", "probability": 0.0}]}
```

| フィールド | 型 | 備考 |
| --- | --- | --- |
| `score` | **float** | 0 始まりレベル番号の確率加重平均（上流 README）。3 段階なら 0〜2 の連続値 |
| `confidence` | float | 0〜1 |
| `probabilities` | 配列（**2 件以上**） | `{value: int, label: str, probability: float}` |

### refusal

```json
{"name": "evaluation", "type": "refusal"}
```

⚠️ **エラーではない。** HTTP 200 の正常応答として返り、`llm` も例外を投げない（`RefusalAnswer` が判別共用体に含まれ、応答検証でも `"refusal"` が許容型に入っている）。

⚠️ **`probability` / `choice` / `score` / `confidence` のフィールドが存在しない**。`jq -r '.probability'` は `null` を返す。必ず `type` を先に判定すること（fail closed の実装は [judge-patterns.md](judge-patterns.md) 参照）。

### usage

`response.usage()` で取得。`input_tokens` / `output_tokens` は非負整数であることが検証される。それ以外の usage キーは `details` に回される。

## エラーカタログ

### option 検証段階（**HTTP 送信前・無課金**）

pydantic の validator で止まる。設定ミスの洗い出しに使える。

| 状況 | メッセージ | 出典 |
| --- | --- | --- |
| `answer_type` が不正値 | `Input should be 'predicate', 'choice' or 'score'` | 実測 |
| `choices` を非 choice で指定 | `Value error, choices are only supported for choice questions` | 実測 |
| `levels` を非 score で指定 | `levels are only supported for score questions` | 実装 |
| `choice` で `choices` が 2 件未満 | `Value error, choice questions need at least two choices` | 実測 |
| `score` で `levels` が無い / 2 件未満 | `Value error, score questions need at least two ordered levels` | 実測 |
| `choices` に未知キー | `choices, <キー名> / Extra inputs are not permitted` | 実測 |
| `choices` の value が重複 | `choice values must be unique` | 実装 |
| `questions` が空配列 | `questions must not be empty` | 実装 |
| `questions` の `name` が重複 | `Question names must be unique` | 実装 |
| `questions` を他 option と併用 | `questions cannot be combined with answer_type, name, choices, or levels` | 実装 |
| `name` / `instructions` が空白のみ | `Must not be blank` | 実装 |
| JSON が不正 / キー重複 / NaN | `Expected valid JSON with unique keys and finite numbers` | 実装 |

### llm 本体の機能チェック（**HTTP 送信前・無課金**）

| 状況 | メッセージ | 出典 |
| --- | --- | --- |
| `llm chat` / 会話継続 | `Decisions: openai-decisions/gpt-6-luna does not support conversations` | 実測 |
| `--schema` 指定 | `Decisions: openai-decisions/gpt-6-luna does not support schemas` | 実測 |
| tool 指定 | `… does not support tools` | 実装（llm 本体） |

### `build_payload` 段階（**HTTP 送信前・無課金**）

実装上 `build_payload()` は `client.post()` より前に実行され、ここで投げられた `ValueError` は HTTP に到達しない。

| 状況 | メッセージ | 出典 |
| --- | --- | --- |
| `-s` が無く `questions` も無い | `Supply a question using -s/--system or system= in Python.` | 実測 |
| 入力テキストも画像も無い | `Supply input text or an image as the prompt or on stdin.` | 実測 |
| `-s` と `questions` を併用 | `Do not combine questions with a system prompt; put instructions in each question.` | 実測 |
| 非対応形式の添付 | `Decisions accepts image attachments only.` | 実装 |
| 画像が 128 枚超 | `Decisions accepts at most 128 images.` | 実装 |
| assistant / tool ロールが混入 | `Decisions supports single-turn evaluation only.` | 実装 |
| system に画像、など不正な組み合わせ | `Decisions accepts user text and images, and system text only.` | 実装 |

### 実行時（**課金されうる**）

すべて `llm.ModelError`。

| 状況 | メッセージ |
| --- | --- |
| HTTP が 200 以外 | `OpenAI Decisions HTTP <status>: <body>` |
| 通信失敗・**60 秒タイムアウト** | `OpenAI Decisions request failed: <例外>` |
| 応答が想定形でない（answers / model / usage の欠落、質問数と答えの数の不一致、name / type の不一致） | `Invalid OpenAI Decisions response: expected answers, model, and token usage.` |

## テンプレート

質問を保存して使い回せる（上流 README）。

```bash
llm -m openai-decisions/gpt-6-luna \
  -s 'このメッセージは明示的に返金を要求しているか？' --save refund-request

cat message.txt | llm -t refund-request
```

テンプレート / フラグメント / stdin / キー管理 / `llm logs` は通常のモデルと同様に機能する（上流 README。本マシンでの `llm logs` 動作は未検証）。

## Python API

```python
import json, llm

model = llm.get_model("openai-decisions/gpt-6-luna")
response = model.prompt(
    "Please refund my last payment.",
    system="Does this message explicitly request a refund?",
)
print(json.loads(response.text())["probability"])
print(response.json())    # provider の完全な応答
print(response.usage())   # トークン数と details
```

- option は Python の list / dict でも JSON 文字列でも渡せる。
- 非同期は `llm.get_async_model(...)` + `await response.text()`。
- 画像は `attachments=[llm.Attachment(path="product.png")]`、バイト列なら `llm.Attachment(content=image_bytes, type="image/png")`。

⚠️ 上流 README は **本番アプリには OpenAI 公式 SDK を直接使う方が向く**と注記している。`llm` 経由は探索・バッチ・スクリプト向け。

## この環境での制約

- **`llm install` が使えない**。Python の site-packages が nix store 上にあり read-only（実測: `test -w` が false）。プラグインの追加・更新は nix-darwin の `pkgs/llm-with-decisions.nix` を編集して `darwin-rebuild switch`。
- `llm` の実体は `/etc/profiles/per-user/yutaura/bin/llm`（llm 0.36）。
- ⚠️ **非対話環境では `</dev/null` を付ける**。stdin が開いたパイプのままだと `llm` が入力を待って無限ブロックする（本セッションで実測: 120 秒経っても返らず、`</dev/null` 付きの同一コマンドは即座に返った）。
