# 確率付き判定の設計パターン

decisions API が返す `probability` / `confidence` を**実際の自動処理に組み込む**ときの設計。
コマンドの書き方は [cli-reference.md](cli-reference.md)、選択の判断基準は SKILL.md 本文を参照。

> ⚠️ このファイルには**外部由来の計測**と**このマシンで未検証の事実**が含まれる。各項に出典と検証状況を明記する。

## 1. 単一閾値ではなく「帯」で設計する

`probability > 0.5` の単一閾値は、**判定が難しい入力ほど誤る**設計になる。0.51 と 0.99 を同じ「真」として扱うため、グレーゾーンの誤りがそのまま自動処理に流れる。

**3 帯に分ける**のを既定とする:

| 帯 | 扱い |
| --- | --- |
| 高（例 `>= 0.9`） | 自動で肯定処理 |
| 中（例 `0.1 〜 0.9`） | **人間レビューへ回す**（判定不能として扱う） |
| 低（例 `< 0.1`） | 自動で否定処理 |

```bash
#!/usr/bin/env bash
set -euo pipefail

out=$(llm -m openai-decisions/gpt-6-luna "$input" -s "$question" </dev/null)

# refusal を先に弾く（§3 参照）
type=$(printf '%s' "$out" | jq -r '.type')
[ "$type" = "predicate" ] || { echo "REVIEW: type=$type" >&2; exit 2; }

p=$(printf '%s' "$out" | jq -r '.probability')
if   awk "BEGIN{exit !($p >= 0.9)}"; then echo "AUTO_YES"
elif awk "BEGIN{exit !($p <  0.1)}"; then echo "AUTO_NO"
else                                      echo "REVIEW"; exit 2
fi
```

閾値の具体値は**ラベル付きサンプルで決める**（§5）。文献値をそのまま持ち込まない。

## 2. 低 confidence は「誤判定の予告」として扱う

`choice` / `score` が返す `confidence` は、単なる付加情報ではなく**自分の誤判定と相関する信号**として使える。

> **外部の公開計測（こちらで未再現）**: `nullp2ike/visual-reasoning` の計測では、chat judge 4 つが一致した判定に decisions が逆らったケース **20 / 3158 件**のうち、**19 件が `confidence < 0.8`** だった。
>
> つまり「他の判定器と食い違う＝怪しい」ケースのほぼ全てが、低 confidence として**自己申告されていた**。

設計上の含意: **`choice` / `score` を使うなら `confidence` を必ず読み、低ければ `choice` の値を信用せずレビューへ回す**。`choice` だけを取り出して `confidence` を捨てる実装は、この無料で得られる警告を捨てている。

```bash
# choice: confidence を門番にする
read -r choice conf < <(printf '%s' "$out" | jq -r '[.choice, .confidence] | @tsv')
awk "BEGIN{exit !($conf >= 0.8)}" || { echo "REVIEW: low confidence ($conf)" >&2; exit 2; }
echo "$choice"
```

⚠️ `predicate` には `confidence` が無い。predicate では `probability` が 0.5 付近であること自体が同じ役割を果たす（§1 の中間帯）。

## 3. refusal は fail closed にする

API が回答を拒否すると、**エラーではなく 200 応答**として `{"name":"…","type":"refusal"}` が返る（実装で確認）。`probability` / `choice` / `score` の**フィールド自体が存在しない**。

したがって素朴な実装は静かに壊れる:

```bash
# ❌ refusal のとき p="null" になり、数値比較が静かに偽 → 「否定判定」として自動処理されてしまう
p=$(printf '%s' "$out" | jq -r '.probability')
[ "$(echo "$p > 0.9" | bc -l)" = 1 ] && allow || deny
```

**`type` を先に判定し、想定外はすべて拒否側に倒す**（fail closed）:

```bash
case "$(printf '%s' "$out" | jq -r '.type')" in
  predicate) : ;;                                        # 期待通り
  refusal)   echo "判定不能（refusal）" >&2; exit 2 ;;    # 人間へ
  *)         echo "想定外の type" >&2; exit 2 ;;          # 人間へ
esac
```

> **外部の実装例（こちらで未検証）**: `yologdev/yoagent` は decisions を tool gate / input guard に使う際、refusal を例外に変換して **fail closed**（ツール実行を許可しない側に倒す）にしている。

⚠️ **ガードに使うなら fail closed は必須**。「判定できなかったから通す」は、ガードを置いた目的を無効化する。

## 4. 同一入力の複数質問は 1 リクエストにまとめる

payload は `input` 1 つ + `questions` 配列という構造（実装で確認）なので、**入力トークンは質問間で共有される**。N 個の質問を N 回に分けて呼ぶと、入力を N 回課金することになる。

```bash
# ✅ 入力 1 回分の課金で 3 判定
llm -m openai-decisions/gpt-6-luna "$ticket" -o questions '[
  {"name":"refund","type":"predicate","instructions":"返金を要求しているか？"},
  {"name":"angry","type":"predicate","instructions":"強い不満を表明しているか？"},
  {"name":"dept","type":"choice","instructions":"担当部署は？",
   "choices":[{"value":"billing"},{"value":"tech"},{"value":"other"}]}
]' </dev/null
```

⚠️ 出力は **JSON 配列**（質問 1 つでも配列）。質問の順序で返る。`name` で引くのが安全:

```bash
printf '%s' "$out" | jq -r '.[] | select(.name=="refund") | .probability'
```

⚠️ まとめる判断の境界: **質問どうしが独立なときだけ**まとめる。「A が真なら B を聞く」のような条件分岐は表現できない（単発評価のため）。段階的な判定が必要なら、1 段目の結果で 2 段目を出し分ける 2 リクエスト構成にする。

## 5. 閾値はラベル付きサンプルで決める（事前に無課金で準備できる）

手順:

1. **代表サンプルを 50〜200 件集める**。本番の分布を反映させる（特に「判定が難しい」例を意図的に入れる）。
2. **人間が正解ラベルを付ける**。
3. option の組み方を**無課金で検証する**。option 検証・`build_payload` の検証はすべて HTTP 送信前に走るため、設定ミスはコスト 0 で洗い出せる（[cli-reference.md](cli-reference.md) のエラーカタログ参照）。
4. ⚠️ **ここから課金される。ユーザーに件数と概算コストを提示して許可を取る**。
5. サンプル全件を実行し、`probability` / `confidence` と正解ラベルを突き合わせる。
6. **自動化率と誤り率のトレードオフ表**を作り、許容できる誤り率から閾値を逆算する。

| 閾値（高帯） | 自動処理される割合 | その中の誤り率 |
| --- | --- | --- |
| `>= 0.95` | ？ | ？ |
| `>= 0.90` | ？ | ？ |
| `>= 0.80` | ？ | ？ |

⚠️ **「精度 N%」を単独で報告しない。** 中間帯を人間に回す設計では、*自動化率* と *自動処理分の誤り率* の 2 つが揃って初めて判断材料になる。

### コストの概算

> ⚠️ **価格は外部由来・未検証**: 複数の third-party 実装の pricing 定義では **入力 $0.10 / 1M トークン・出力無料** で一致しているが、公式ドキュメントでの確認はこのセッションでは行っていない。実運用の判断には公式の価格表を確認すること。

この前提での概算（1 件 500 入力トークンと仮定）:

| 件数 | 入力トークン | 概算 |
| --- | --- | --- |
| 100 | 0.05M | $0.005 |
| 10,000 | 5M | $0.50 |
| 1,000,000 | 500M | $50 |

画像を含む場合はトークン数が大きく変わるため、この表は**テキストのみ**の目安。

## 6. バッチ実行時の運用

- ⚠️ **HTTP タイムアウトは 60 秒固定**（変更不可）。長時間化しやすいのは**画像を多数添付するリクエスト**。1 リクエストの画像数を抑える。
- ⚠️ **`</dev/null` を必ず付ける**。付けないと `llm` が stdin を待って無限ブロックする（本セッションで実測）。60 秒タイムアウトはこのハングを救わない（HTTP に到達していない）。
- **失敗した件を再実行可能にする**。`llm.ModelError` は通信失敗・非 200・応答不正で発生する。入力 ID と結果を対応付けて記録し、失敗分だけ再実行できる形にする。
- **`refusal` と `ModelError` を別のバケツに分ける**。前者は「API が答えを拒否した」、後者は「通信・応答が壊れた」で、対処が違う（前者は質問設計の見直し、後者はリトライ）。
- **監査可能にする**。`llm` の通常のログ機構が使える（上流 README。本マシンでの `llm logs` 動作は未検証）。判定を後から説明する必要がある用途では、入力・option・返り値の全フィールド（`probabilities` を含む）を保存する。**decisions は理由を返さないため、分布を捨てると再説明の手がかりが消える。**

## 7. 本番アプリに組み込むとき

⚠️ 上流 README は **本番アプリには OpenAI 公式 SDK を直接使う方が向く**と注記している。`llm` CLI 経由は探索・バッチ・スクリプト向け。

CLI を本番で subprocess 起動する構成の具体的な難点:

- タイムアウトが 60 秒固定で、呼び出し側から制御できない
- プロセス起動のオーバーヘッドが 1 件ごとに乗る
- エラーが文字列として返るため、構造化されたハンドリングがしにくい
- このマシンでは `llm install` が使えない（nix 管理）ので、デプロイ先での再現に別の仕組みが必要

Python から使う場合でも、`llm` ライブラリ経由（[cli-reference.md](cli-reference.md) の Python API）なら option を dict で渡せて例外も構造化されるため、CLI 起動よりは扱いやすい。
