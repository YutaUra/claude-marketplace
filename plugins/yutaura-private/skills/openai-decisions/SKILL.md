---
name: openai-decisions
description: >
  OpenAI Decisions API（`openai-decisions/gpt-6-luna`）を llm CLI 経由で使い、テキスト / 画像に対する
  真偽（predicate）・分類（choice）・段階評価（score）の判定を確率付きで取得する。
  skill の中心は「chat モデルではなく decisions を選ぶ判断基準」と、返ってきた確率を閾値運用するときの
  設計（refusal の fail closed / 低 confidence の扱い / 入力と質問の取り違え防止）。
  Use when: (1) 「この文章が〇〇かどうか判定して」「大量のテキストを分類したい」
  「spam / 違反 / 問い合わせ意図を LLM で判定するバッチを作りたい」と言われたとき、
  (2) 「判定の確信度が欲しい」「閾値で自動処理と人間送りを分けたい」「LLM judge を作りたい」のように
  確率付き判定が必要なとき、(3) decisions API / gpt-6-luna / llm-openai-decisions の使い方や
  option を聞かれたとき、(4) 既存の chat モデル判定が不安定・JSON パースが壊れる・確信度が信用できないと
  相談されたとき、(5) 画像に対する yes/no 判定やカテゴリ分けを自動化したいとき。
  判定理由や説明文が欲しい用途、自由文生成・要約・書き換え、複数ターンの対話、tool calling、
  構造化スキーマ出力、PDF / 音声 / 動画の入力には使わない
  （decisions は理由を返さず、単発・テキストと画像のみ）。
---

# OpenAI Decisions API via llm CLI

OpenAI Decisions API を Simon Willison の [`llm`](https://llm.datasette.io/) CLI と `llm-openai-decisions` プラグイン経由で使うための skill。**単発（single-turn）の型付き判定**に特化した API で、chat モデルの代わりではなく **用途が重ならない別物** として扱う。

- model id: `openai-decisions/gpt-6-luna`（API へは `gpt-6-luna` として送られる）
- endpoint: `https://api.openai.com/v1/decisions`
- 認証: `llm keys set openai` または `OPENAI_API_KEY`

> 本文の事実は **上流実装（`llm_openai_decisions.py` 364 行）・上流 README・このマシンでの実測** のいずれかで裏付けたもののみ。外部由来 / 未検証のものは明示する。

## ⚠️ この環境固有の最重要制約: `llm install` は使えない

このマシンの llm は nix-darwin の private プロファイルで構築されており、**Python の site-packages が read-only**（実測: `test -w` が false）。したがって上流 README が案内する

```bash
llm install llm-openai-decisions   # ❌ このマシンでは失敗する
```

は**使えない**。プラグインの追加・バージョン変更は nix-darwin 側の `pkgs/llm-with-decisions.nix`（llm 0.36 + openai 3.3.0 + plugin 0.1 を自前パッケージ化）を編集し、`darwin-rebuild switch` で反映する。

**「プラグインを入れておきます」と言って `llm install` を実行してはいけない。** 失敗するだけでなく、ユーザーに「入った」と誤報告する事故になる。

## ⚠️ 最重要の判断: decisions か chat モデルか

この skill の価値の本体。**コマンドを覚えることより、選ぶ基準を間違えないことの方が重要**。

| 要求 | decisions | chat モデル |
| --- | --- | --- |
| 答えが 真偽 / 排他カテゴリ / 順序段階 に閉じる | ✅ 本来用途 | 可（出力の防御が必要） |
| **判定の確率が欲しい（閾値で分岐したい）** | ✅ **固有の強み** | ❌ 自己申告の数字で、校正されていない |
| 選択肢**全体**の確率分布が欲しい | ✅ `probabilities` が返る | ❌ |
| 判定の**理由・根拠・引用**が欲しい | ❌ 一切返らない | ✅ |
| 自由文生成（要約・書き換え・作文） | ❌ | ✅ |
| 複数ターンの対話・文脈の積み上げ | ❌ `supports_conversation = False` | ✅ |
| tool calling / JSON schema 出力 | ❌ どちらも `False` | ✅ |
| 同一入力に対する複数の独立した質問 | ✅ `-o questions` で 1 リクエスト | 可（プロンプト設計次第） |
| 画像入力 | ✅ PNG / JPEG / WebP / GIF・最大 128 枚 | モデル次第 |
| PDF / 音声 / 動画 入力 | ❌ 画像のみ | モデル次第 |
| 出力パースの堅牢性 | ✅ 型が固定。前置き文や言い訳が混ざらない | ❌ 要防御 |
| 大量件数のコスト | 入力のみ課金（下記・未検証） | 入出力とも課金 |
| 60 秒を超える処理 | ❌ タイムアウトが固定 | 調整可 |

**一行の判断基準**:

> 答えが**有限の選択肢に閉じていて、かつ確率が欲しい**なら decisions。**理由が欲しい / 文章を作ってほしい**なら chat モデル。確率も理由も要らない単純分類なら、どちらでも成立するが decisions の方が安く・パースが壊れない。

### ⚠️ 「chat モデルに確信度を出させる」で代替しようとしない

最も多い誤りがこれ。chat モデルに `confidence を 0〜1 で出して` と指示して返る数字は、**生成されたトークンであって確率推定ではない**。0.9 と 0.7 の差が実際の正解率の差に対応している保証がなく、閾値運用の土台にならない。確率で分岐したいという要求こそが decisions を選ぶ決定的な理由。

逆に、**理由が欲しい場面で decisions を選んではいけない**。decisions は `probability` / `choice` / `score` だけを返し、**なぜそう判定したかを一切返さない**。人間がレビューする前提のワークフローでは、理由が無い判定は再確認コストを押し上げる。

## 3 つの answer_type

| `answer_type` | 必須 option | 返るフィールド | 使う場面 |
| --- | --- | --- | --- |
| `predicate`（既定） | なし（`-s` が質問本体） | `probability`（0〜1） | はい / いいえ。閾値分岐の基本形 |
| `choice` | `-o choices`（**2 件以上**） | `choice`, `confidence`, `probabilities[{value, probability}]` | 排他カテゴリへの振り分け |
| `score` | `-o levels`（**2 件以上**・低→高） | `score`（float）, `confidence`, `probabilities[{value, label, probability}]` | 重大度・品質などの順序尺度 |

⚠️ **`predicate` には `confidence` が無い**（実装の `PredicateAnswer` は `probability` のみ）。`probability` が答えそのもの。`choice` / `score` だけが `confidence` を持つ。`.confidence` を一律に読むコードは predicate で静かに `null` になる。

⚠️ **`score` は float**。上流 README によれば **0 始まりレベル番号の確率加重平均**で、3 段階なら 0〜2 の連続値を取る。整数のレベル番号と `==` で比較してはいけない。

## ワークフロー

### Step 1: 「それは decisions の仕事か」を先に決める

上の判定表で確認する。**理由が必要**・**自由文が必要**・**対話が必要** のどれかに該当したら、この skill を使わず chat モデルに切り替える。ここを飛ばして実装に入ると、後から「理由も出して」と言われて全部書き直しになる。

### Step 2: 「何が入力で、何が質問か」を固定する

⚠️ **この API 最大の罠**。`llm` の慣習では `-s/--system` は役割指示だが、**decisions では `-s` が質問文そのもの**で、**prompt（位置引数 / stdin）が評価対象データ**になる。

```bash
# ✅ 正: prompt = 評価対象データ、-s = 質問
llm -m openai-decisions/gpt-6-luna '返金してほしいのですが' \
  -s 'このメッセージは明示的に返金を要求しているか？' </dev/null

# ❌ 誤: 逆にすると「質問文」を評価対象として判定してしまう
llm -m openai-decisions/gpt-6-luna 'このメッセージは明示的に返金を要求しているか？' \
  -s '返金してほしいのですが' </dev/null
```

⚠️ **逆にしてもエラーにならない。** API は 200 を返し、もっともらしい `probability` が付いて戻ってくる。バッチ全体が静かに無意味な結果で埋まるため、**最初の 1 件を目で確認する**こと。

⚠️ `-s` を**忘れると**エラーになる（実測）。これは救われる側の挙動:

```
Error: Supply a question using -s/--system or system= in Python.
```

### Step 3: option を組む（この段階は無課金）

⚠️ **option の検証は API 呼び出しより前に走る**（pydantic の validator → `build_payload` → その後に HTTP POST）。つまり **option の組み方の誤りは課金されずに検出できる**。本番バッチの前に、1 件を実行して設定ミスを洗い出すのは安全（ただし option が正しい場合は実際に課金される点に注意）。

```bash
# choice: value → description のオブジェクト（description は null 可 = 名前だけで十分の意）
llm -m openai-decisions/gpt-6-luna '二重に請求されました' \
  -s 'どの部署が対応すべきか？' \
  -o answer_type choice \
  -o choices '{"billing":"請求・返金","technical":"製品の不具合","other":null}' </dev/null

# score: 低→高の順でレベルを並べる
llm -m openai-decisions/gpt-6-luna 'Safari で export が失敗する' \
  -s 'この問題の深刻度は？' \
  -o answer_type score \
  -o levels '["Cosmetic","Workaround available","Fully blocked"]' </dev/null
```

### Step 4: 実行する（⚠️ 課金される）

**実 API 呼び出しは課金される。ユーザーの許可なく叩かない。** 特にバッチ処理は件数 × 入力トークンで効いてくるため、件数と概算コストを提示してから実行する。

⚠️ **非対話環境では必ず `</dev/null` を付ける**（本セッションで実測）。stdin が開いたパイプのまま `llm` を呼ぶと、`llm` が stdin からの入力を待って**無限にブロック**する。検証用コマンドが 120 秒経っても返らず、同じコマンドに `</dev/null` を付けたら即座にエラーを返した。HTTP の 60 秒タイムアウトはこのハングを救わない（まだ HTTP に到達していない）。エージェント / CI / スクリプトから呼ぶときは、入力を明示的にパイプするか `</dev/null` を付ける。

⚠️ **HTTP タイムアウトは 60 秒固定**（実装に `timeout=60` がハードコード。`-o` で変更不可）。画像を多数添付するリクエストは 60 秒に収まらない可能性があり、超えると `llm.ModelError` になる。長くしたい場合は CLI では不可能で、Python から直接 API を叩く必要がある。

### Step 5: 応答を安全に読む

⚠️ **`refusal` が静かに返ることがある。** API が質問への回答を拒否した場合、エラーではなく **200 応答として** `{"name":"evaluation","type":"refusal"}` が返る（実装の判別共用体に `RefusalAnswer` が含まれ、検証でも `"refusal"` が許容型に入っている）。

このとき `probability` / `choice` / `score` の**フィールド自体が存在しない**ため、`jq -r '.probability'` は `null` を返し、シェルでは空文字や文字列 `"null"` として流れていく。**閾値比較が静かに偽になり、refusal が「否定判定」として扱われる**。

必ず `type` を先に見て **fail closed**（判定不能として人間に回す / 処理を止める）にする:

```bash
out=$(llm -m openai-decisions/gpt-6-luna "$input" -s "$question" </dev/null) || exit 1
case "$(printf '%s' "$out" | jq -r '.type')" in
  refusal) echo "判定不能（refusal）: 人間レビューへ" >&2; exit 2 ;;
  predicate) p=$(printf '%s' "$out" | jq -r '.probability') ;;
  *) echo "想定外の type" >&2; exit 1 ;;
esac
```

⚠️ **`-o questions` を使うと出力は必ず JSON 配列**。質問が 1 つでも配列（実装が `answers if multiple else answers[0]` で分岐）。単一質問のときだけオブジェクト。`jq` を使い回すと壊れる。

閾値の設計・低 confidence の扱いは [references/judge-patterns.md](references/judge-patterns.md) を参照。

## 複数質問（`-o questions`）

同一入力に対し複数の名前付き質問を 1 リクエストで投げる。payload は `input` 1 つに `questions` 配列という構造なので、**入力トークンを質問間で共有できる**（1 質問ずつ N 回呼ぶより入力課金が小さい）。

```bash
llm -m openai-decisions/gpt-6-luna '二重請求されたので返金してほしい' \
  -o questions '[
    {"name":"refund","type":"predicate","instructions":"返金を要求しているか？"},
    {"name":"department","type":"choice","instructions":"どの部署が対応すべきか？",
     "choices":[{"value":"billing"},{"value":"other"}]}
  ]' </dev/null
```

⚠️ **`-o questions` は `-s` と併用できない**（実測）。質問文は各要素の `instructions` に入れる:

```
Error: Do not combine questions with a system prompt; put instructions in each question.
```

⚠️ **`answer_type` / `name` / `choices` / `levels` とも併用できない**。これらは単一質問用。併用すると option 検証段階（無課金）で止まる。

⚠️ **`questions` 内の `choices` / `levels` はネイティブ形式のみ**。単一質問用の省略記法（`{"billing":"..."}` のオブジェクト形式、`["Low","High"]` の文字列配列）は使えず、`[{"value":...}]` / `[{"label":...}]` のオブジェクト配列で書く。

## 画像

```bash
llm -m openai-decisions/gpt-6-luna -a ./product.png \
  -s 'この画像に人物が写っているか？' </dev/null
```

- 対応形式は **PNG / JPEG / WebP / GIF の 4 つのみ**（実装の `attachment_types`、`llm models --options` の出力でも確認）。
- `-a` には**ローカルパスでも URL でも**渡せる。
- **1 リクエスト最大 128 枚**（超えると `Decisions accepts at most 128 images.`）。
- テキストとの併用は任意（画像のみでも、テキストのみでも成立する）。ただし**どちらも無い**とエラー（実測: `Supply input text or an image as the prompt or on stdin.`）。

## できないこと（実装で確認済み）

| やりたいこと | 結果 |
| --- | --- |
| 会話継続（`-c`） | ❌ `supports_conversation = False`。`llm chat` は実測で `does not support conversations`。API 呼び出し前に止まるので**課金されない** |
| ストリーミング | ❌ `can_stream = False` |
| 構造化スキーマ出力（`--schema`） | ❌ 実測で `does not support schemas` |
| tool calling | ❌ `supports_tools = False` |
| HTTP タイムアウトの変更 | ❌ 60 秒固定 |
| `llm install` でプラグイン追加 | ❌ このマシンでは site-packages が read-only |

## よく使うコマンド早見

| 目的 | コマンド |
| --- | --- |
| モデルが入っているか確認 | `llm models \| grep -i decision` |
| option 一覧を確認 | `llm models --options` |
| API キーの登録状況（名前のみ） | `llm keys list` |
| API キーを登録 | `llm keys set openai` |
| 真偽判定 | `llm -m openai-decisions/gpt-6-luna '<データ>' -s '<質問>' </dev/null` |
| 分類 | `… -o answer_type choice -o choices '<JSON>'` |
| 段階評価 | `… -o answer_type score -o levels '<JSON>'` |
| 質問名を変える | `-o name refund` |
| 複数質問 | `-o questions '<JSON 配列>'` |
| 質問をテンプレ化 | `llm -m … -s '<質問>' --save <名前>` → `cat in.txt \| llm -t <名前>` |

option の完全な仕様・返り値の全フィールド・エラーメッセージ一覧は [references/cli-reference.md](references/cli-reference.md) を参照。

## アンチパターン

- **`llm install llm-openai-decisions` を実行する**: このマシンでは site-packages が read-only で失敗する。プラグイン追加は nix-darwin の `pkgs/llm-with-decisions.nix` 経由。
- **入力と質問を逆に渡す**: `-s` が質問、prompt が評価対象データ。**逆でもエラーにならず**もっともらしい確率が返るため、バッチ全体が静かに無意味な結果になる。最初の 1 件を必ず目視確認する。
- **理由が欲しい用途に decisions を使う**: 判定根拠を一切返さない。人間レビュー前提のワークフローでは、理由の無い判定が再確認コストを押し上げる。chat モデルに切り替える。
- **chat モデルの「自己申告 confidence」で閾値運用する**: 生成トークンであって校正された確率ではない。確率で分岐したいなら decisions を選ぶのが本筋。
- **`refusal` を否定判定として扱う（fail open）**: refusal は 200 応答で、`probability` などのフィールドが存在しない。`jq -r .probability` が `null` を返し、閾値比較が静かに偽になる。`type` を先に見て fail closed にする。
- **`predicate` で `.confidence` を読む**: 存在しないフィールド。predicate は `probability` が答えそのもの。
- **`score` を整数レベルとして比較する**: 確率加重平均の float でレベル間の値を取る。
- **非対話環境で `</dev/null` を省く**: `llm` が stdin を待って無限ブロックする（実測）。HTTP タイムアウトでは救われない。
- **`-o questions` の出力をオブジェクトとしてパースする**: 質問 1 つでも必ず配列。
- **質問を 1 件ずつ N 回呼ぶ**: 同一入力なら `-o questions` でまとめた方が入力トークンを共有できて安い。
- **ユーザーの許可なく実 API を叩く / バッチを回す**: 課金される。件数と概算コストを提示してから実行する。
- **本番アプリから `llm` CLI を subprocess 起動する**: 上流 README が「本番アプリには公式 SDK を直接使う方が向く」と注記している。CLI は探索・バッチ・スクリプト向け。

## 連携するスキル

- **decision-council**: 「この判定を decisions に任せるか、人間 / chat モデルに回すか」自体が重い設計判断になる場合に併用する。
