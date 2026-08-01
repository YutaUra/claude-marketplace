---
name: keepa-price-history
description: Keepa の有料 API を使わず、keepa.com サイト内部の WebSocket 通信を playwright-cli で傍受して Amazon 商品の価格履歴を無料取得する。Use when: (1) 「Amazon の価格履歴を調べて」「Keepa のデータが欲しい」「この ASIN の値動きを見たい」と言われたとき、(2) 商品の過去価格・売れ筋ランク推移を取得したいとき、(3) Keepa 取得が 401/403/checkHuman で壊れて復旧したいとき。個人利用・低頻度専用（非公式利用のため大量アクセス禁止）。
---

# Keepa 価格履歴の無料取得

Keepa の有料 API を使わず、keepa.com の Web サイトが内部で使う WebSocket 通信を傍受して、Amazon 商品の全価格履歴を headless で取得する。

## ⚠️ 利用上の制約（最初に確認）

- **keepa.com の非公式利用**。個人利用・低頻度に厳守すること。ログインユーザーにはトークンバケット制があり、大量・連続アクセスは制限や BAN のリスクがある。複数 ASIN を取得する場合も間隔を空け、一度に大量取得しない。
- ユーザーの依頼が大量取得・商用利用に見える場合は、リスクを説明して確認を取ること。

## 前提条件

1. `playwright-cli` と `bun` がインストール済み
2. **Keepa 無料アカウントのログイン状態**が永続プロファイル `~/.playwright-profiles/keepa` に保存されている（ゲストは 401 + Turnstile でフル履歴不可、最新値スナップショットのみ）
3. **Cloudflare の cf_clearance Cookie** も同プロファイルに保存されている

どちらかが失効している場合は「復旧手順」を参照。初回セットアップも同じ手順（headed で開いてログイン）。

## 使い方

```bash
bun ${CLAUDE_PLUGIN_ROOT}/skills/keepa-price-history/scripts/fetch-keepa.ts <ASIN> [--domain=5] [--raw]
```

- `domain`: 1=com 2=co.uk 3=de 4=fr 5=co.jp（デフォルト） 6=ca 8=it 9=es 10=in 11=com.mx
- デフォルト出力: Amazon 価格 / 新品 / 中古 / 売れ筋ランクの時系列 JSON（ISO 8601 日時 + 値）
- `--raw`: Keepa の生 product JSON（stats, variations 等含む）を出力

価格は最小通貨単位（co.jp なら円）、`-1`（データなし）は整形出力では `null` に正規化される。データ形式の詳細（Keepa 分の時刻変換、csv インデックス、BuyBox の3つ組など）は `references/data-format.md` を参照。

## 仕組み（トラブル対応時に読む）

- keepa.com は REST ではなく **WebSocket（`wss://push.keepa.com/apps/cloud/`）** で商品データをやり取りする
- フル履歴は **zstd 圧縮**（マジック `28 B5 2F FD`）の `basicProducts` メッセージで届く。ページ同梱の `fzstd.decompress` でそのまま展開できる
- 短期間しかトラッキングされていない商品は非圧縮の小さい `basicProducts` のみ届く（それが全履歴）。スクリプトは「圧縮版を5秒待ち、来なければ非圧縮版を採用」する
- 傍受は `page.addInitScript` で WebSocket コンストラクタをフックする。**ハッシュ遷移（`#!product/…`）ではフックが効かない**ため `page.goto` 後の `page.reload()` が必須（スクリプトに組み込み済み）
- headless で Cloudflare を通過できる理由: Chrome チャンネル起動で TLS フィンガープリントが本物の Chrome と同一 + `keepa.config.json` の `contextOptions.userAgent` で `HeadlessChrome` を含む UA を通常 Chrome UA に上書き（cf_clearance は UA に紐づくため）+ 永続プロファイルの cf_clearance 再利用

## よくある失敗と対処

| 症状 | 原因 | 対処 |
| --- | --- | --- |
| 401 / `checkHuman` | Keepa ログイン失効 | 復旧手順で headed ログインし直す |
| 403 が続く | cf_clearance 失効、または Chrome 更新で config の UA バージョンが実 Chrome と乖離 | 復旧手順 + `scripts/keepa.config.json` の UA の Chrome メジャーバージョンを実バージョンに合わせる |
| タイムアウト（30秒） | ページがデータを受信できていない | headed で開いて画面を目視確認（Turnstile 等が出ていないか） |
| 最新値しか取れない | 未ログイン（ゲスト扱い） | 復旧手順でログイン |

## 復旧手順（ログイン・Cloudflare 失効時）

headed で開き直して人間がログイン・検証を通す:

```bash
playwright-cli -s=keepa open --browser=chrome --headed --profile=$HOME/.playwright-profiles/keepa https://keepa.com
# ユーザーにログイン / Cloudflare 通過を依頼し、完了を待つ
playwright-cli -s=keepa close
```

この操作は人間の介入が必要なので、ユーザーに「ブラウザが開くのでログイン（または検証通過）してください」と伝え、完了報告を待ってから close → 再取得すること。
