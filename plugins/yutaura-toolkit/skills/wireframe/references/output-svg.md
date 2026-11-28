# 出力形式: SVG

画像として資料・ドキュメント・issue に貼れ、ファイル単位で差分管理できる。静止画なのでクリックでの遷移は表現できない（遷移は wireflow の矢印で表す）。

## ファイル構成

- **1 画面 1 ファイル**: `wireframes/<画面>.svg`（例: `login.svg` `dashboard.svg`）
- 複数画面のフローは、各画面の縮小版を左から右に並べて矢印でつないだ `flow.svg` を別に作る
- 案があるなら `<画面>-a-<案名>.svg` のように案ごとに分ける

## キャンバス

| 対象 | width × height |
| --- | --- |
| モバイル | 375 × 812 |
| PC | 1440 × 900 |

- `width` `height` と `viewBox` を必ず両方書く（`viewBox="0 0 375 812"`）
- ファイルの先頭にコメントでキャンバスと前提を書く（`<!-- mobile 375x812 / ログイン済み / カート 1 点 -->`）
- すべての x / y / width / height を 8 の倍数に揃える（細かい調整だけ 4 の倍数）

## 書き方の起点

```svg
<svg xmlns="http://www.w3.org/2000/svg" width="375" height="812" viewBox="0 0 375 812"
     font-family="system-ui, -apple-system, 'Hiragino Sans', 'Noto Sans JP', sans-serif">
  <!-- mobile 375x812 / 前提をここに書く -->
  <rect width="375" height="812" fill="#ffffff" stroke="#26262e" stroke-width="1.5"/>

  <g id="ui">
    <!-- ボタン -->
    <g transform="translate(16, 728)">
      <rect width="343" height="48" rx="4" fill="#4338ca"/>
      <text x="171.5" y="29" font-size="14" text-anchor="middle" fill="#ffffff" stroke="none">注文を確定する</text>
    </g>
    <!-- 画像プレースホルダー -->
    <g transform="translate(16, 120)">
      <rect width="96" height="96" fill="#f4f4f6" stroke="#c9c9d1"/>
      <text x="48" y="52" font-size="12" text-anchor="middle" fill="#62626b" stroke="none">商品写真</text>
    </g>
  </g>

  <g id="annotations">
    <!-- 注釈は UI と別の group に入れる。破線の囲み + 番号マーカー -->
    <rect x="8" y="720" width="359" height="64" fill="none" stroke="#d33" stroke-dasharray="4 4"/>
    <circle cx="359" cy="720" r="10" fill="#d33"/>
    <text x="359" y="724" font-size="12" text-anchor="middle" fill="#ffffff" stroke="none">1</text>
  </g>
</svg>
```

## 落とし穴

- **`<text>` には `stroke="none"` と `fill` を明示する**。親の `<g>` に stroke や fill を付けていると文字が継承し、縁取りが付いたり白文字になったりする
- SVG の `<text>` は自動で折り返さない。長い文言は `<tspan x=".." dy="20">` で手で改行するか、文言を短くして詳細を注釈に回す。日本語は 1 文字 ≒ font-size の幅で見積もる（14px なら 1 行 343px に約 24 文字）
- `<foreignObject>` で HTML を埋め込まない。画像ビューアや GitHub のプレビューで表示されないことがある
- 外部フォント・外部画像を参照しない（`<image href="https://...">` や `@import` を使わない）
- 注釈は `<g id="annotations">` にまとめ、UI 本体（`<g id="ui">`）と分ける。注釈を消した版が欲しいときに group ごと外せる

## 返答に含めるもの

SVG は画像なので、テキストで読める情報を必ず添える:

1. ファイルの絶対パスと、キャンバス（デバイス）
2. 番号付き注釈の一覧（「1 — 注文確定ボタン。親指の届く下側に固定」）
3. 置いた前提

## 確認

SVG は書いただけでは崩れに気付けない。**必ず画像にして目で見る**:

- [ ] ブラウザで開く（`playwright-cli` skill があればスクリーンショットを撮る）か、`rsvg-convert` などがあれば PNG に変換して確認する
- [ ] 文字が枠からはみ出していない。文字に縁取りが付いていない
- [ ] 座標が 8 の倍数に揃っている
- [ ] 色が付いているのは主要操作・選択状態・エラー・注釈だけ
- [ ] 外部参照（`http` で始まる `href`）が無い
