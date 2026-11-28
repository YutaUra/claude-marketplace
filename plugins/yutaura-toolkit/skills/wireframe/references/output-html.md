# 出力形式: HTML（既定）

## 作るもの

- **単一の自己完結した `.html` ファイル**。CSS と JS はインラインで書く
- 外部リソースを読み込まない（CDN のフォント・スクリプト・リモート画像は使わない）。オフラインでも、ファイルを送っただけでも同じ表示になるようにする
- ビルドツールは使わない。ブラウザでファイルを直接開けば動くこと
- ファイル名は `wireframe-<対象>.html`（例: `wireframe-checkout.html`）。thumbnail ボードは `wireframe-<対象>-thumbnails.html` として別ファイルにする（検討の段階が違うものを 1 ページに混ぜない）

## ページ構成

```
ページ（土台: 薄い背景 #fafaf8。ワイヤーフレームとは見た目を分ける）
├─ ヘッダー: タイトル「〇〇 ワイヤーフレーム」と、案の切り替え（案があるとき）
├─ セクション（フロー名・案名ごと）
│   ├─ フレーム名（枠の外、上に小さく）
│   ├─ フレーム（端末枠 / ブラウザ枠の中にワイヤーフレーム）
│   └─ 注釈一覧（番号と説明）
└─ 未解決の問い
```

- 土台（ページの枠・見出し）とワイヤーフレームの中身と注釈は、見た目で区別する。土台の見出しが画面の中のヘッダーと混同されないようにする
- 複数の案は 1 ファイルにまとめ、キーボードでも操作できる小さな切り替え（`<button>` のタブ、または `<select>`）で比べられるようにする。全案で中身とタスクは揃える
- 複数画面なら、一覧（全フレームを縮小表示）とフレーム単体表示を切り替えられると便利だが、必須ではない。画面数が 4 つ以下なら縦か横に並べるだけでよい

## CSS の起点

共通の見た目のルール（SKILL.md）を CSS 変数にしたもの。これを起点にし、生の値を散らさない。

```css
:root {
  --w-canvas: #ffffff;   /* 画面の背景 */
  --w-surface: #f4f4f6;  /* 面・プレースホルダー */
  --w-border: #c9c9d1;   /* 線・入力欄 */
  --w-ink2: #62626b;     /* 補助文字 */
  --w-ink1: #26262e;     /* 本文・見出し */
  --w-accent: #4338ca;   /* 主要操作と選択状態だけ */
  --w-error: #b42318;    /* 入力エラー・破壊的操作だけ */
  --note: #d33;          /* 注釈だけ */
  --font: system-ui, -apple-system, "Hiragino Sans", "Noto Sans JP", sans-serif;
  --sp-1: 4px; --sp-2: 8px; --sp-3: 12px; --sp-4: 16px; --sp-6: 24px; --sp-8: 32px;
}
.wf { font-family: var(--font); color: var(--w-ink1); background: var(--w-canvas); }
.wf .t-caption { font-size: 12px; line-height: 16px; }
.wf .t-body    { font-size: 14px; line-height: 20px; }
.wf .t-heading { font-size: 18px; line-height: 24px; font-weight: 600; }
.wf .t-title   { font-size: 24px; line-height: 32px; font-weight: 700; }
.wf .media {   /* 画像プレースホルダー: 何の画像かをラベルで書く */
  background: var(--w-surface); border: 1px solid var(--w-border);
  display: grid; place-items: center; color: var(--w-ink2); font-size: 12px;
}
.note-marker { /* 注釈の番号マーカー */
  width: 20px; height: 20px; border-radius: 50%;
  background: var(--note); color: #fff; font-size: 12px;
  display: inline-grid; place-items: center;
}
```

- 影・グラデーション・Web フォントは足さない。角丸は 4px 程度まで
- 端末枠は CSS で描く: モバイルは `width: 375px; height: 812px; overflow: auto` の箱、PC は `width: 1440px` のブラウザ枠（大きすぎるときは土台側で `transform: scale()` して縮小表示し、中身自体は実寸で組む）

## 部品

- **本物の要素を使う**: ボタンは `<button>`、入力は `<input>` / `<textarea>` / `<select>`、スイッチは `<button role="switch">`。`<div>` をボタン風に塗らない
- 見出し・リスト・ランドマーク（`<header>` `<nav>` `<main>`）を正しく使う。読み上げ順と見た目の順番を揃える
- フォーカスリングを消さない（`outline: 2px solid var(--w-accent)`）
- アイコンは未確定なら灰色の丸・四角のプレースホルダーにする。▾ × ⚙ などの文字をアイコン代わりにしない。アイコンだけのボタンには `aria-label` を付ける

## 動き

- 問いの確認に役立つときだけ、クリックで画面が切り替わる程度の動きを入れる（タブ切り替え、開閉、次へ・戻る）
- 遷移は、実際に押すボタン・行に付ける。画面全体のどこを押しても進む、のようにはしない
- 配線していない操作は、押しても何も起きないことが分かるようにするか、「対象外」と書く
- アニメーション・保存・API の模擬・状態管理は作らない

## 確認

ブラウザで開いて確認してから返す（`playwright-cli` skill があればそれでスクリーンショットを撮る）:

- [ ] PC 向けは 1440px と 1280px、モバイル向けは 375px と 360px の幅で、意図しない横スクロール・はみ出し・文字の重なりが無い
- [ ] 実装したクリックの道筋をすべて辿れる。案の切り替えが動く
- [ ] キーボード（Tab）でフォーカスが見え、順番が自然
- [ ] 外部リソースを読んでいない（`http` で始まる `src` / `href` / `url()` / `@import` が無い）
- [ ] lorem ipsum・「テキスト」「ボタン」のような仮の文字列が残っていない
- [ ] 色が付いているのは主要操作・選択状態・エラー・注釈だけ
