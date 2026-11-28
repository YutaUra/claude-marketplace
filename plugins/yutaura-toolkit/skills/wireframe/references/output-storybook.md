# 出力形式: Storybook

対象リポジトリの Storybook の中にワイヤーフレームを置く。チームが普段見ている場所で、本番 UI の story と並べて検討できるのが利点。

## 最初に確かめること

1. Storybook のバージョンとフレームワーク（`package.json` の `storybook` / `@storybook/*`）。**viewport の指定方法がバージョンで違う**（後述）
2. `.storybook/main.*` の `stories` の glob。置いたファイルが拾われる場所か
3. 既存 story の書き方（CSF3 か、TypeScript か、`satisfies Meta<...>` を使っているか、title を明示しているか）。**既存の書き方に合わせる**
4. `.storybook/preview.*` のグローバルデコレーター（テーマ・プロバイダ）。ワイヤーフレームに本番のテーマが当たってしまわないか

## 置き場所と命名

- story の title は `Wireframes/<機能>/<画面>` にし、本番コンポーネントの story と混ざらないようにする
- ファイルは機能のディレクトリに `*.wireframe.stories.tsx` として置くか、`src/wireframes/<機能>/` のような専用ディレクトリにまとめる。どちらにするかは既存の構成に合わせ、返答で場所を明示する
- 各案は 1 つの story にする（`DirectionA_TabFilter` / `DirectionB_SidePanel` のように、案名が構造の違いを表す名前にする）
- 状態（空・エラー・読み込み中）も別の story にする

## 部品

- **既定ではワイヤーフレーム専用の部品で組む**。本番のデザインシステムの部品を使うと、色・角丸・影が乗ってハイファイに寄り、「もう決まったもの」に見えてしまう
- ワイヤーフレーム用の部品（`WfBox` `WfButton` `WfMedia` `WfNote` など）は、ワイヤーフレーム用ディレクトリの中に小さく作る。本番コードから import させない
- スタイルは共通の見た目のルール（SKILL.md）の値を使い、スコープを閉じる（CSS Modules / 既存のスタイル手段 / インラインスタイル）。グローバル CSS を足さない
- ユーザーが「既存のコンポーネントで組んで」と言った場合だけ本番部品を使う。その場合は、ハイファイ寄りになることを返答で一言伝える

## viewport の指定

PC とモバイルは story ごとに viewport を固定する。

**Storybook 9 以降**（viewport はコアに統合、globals API）:

```ts
// .storybook/preview.ts — ワイヤーフレーム用の viewport を定義（既存の options があればマージする）
export default {
  parameters: {
    viewport: {
      options: {
        wfMobile: { name: "WF Mobile 375", styles: { width: "375px", height: "812px" }, type: "mobile" },
        wfDesktop: { name: "WF Desktop 1440", styles: { width: "1440px", height: "900px" }, type: "desktop" },
      },
    },
  },
};

// story 側
export const Mobile: Story = {
  globals: { viewport: { value: "wfMobile", isRotated: false } },
};
```

**Storybook 8 以前**（parameters API）:

```ts
export const Mobile: Story = {
  parameters: { viewport: { defaultViewport: "wfMobile" } },
};
```

- 8 系でも globals API を有効にしている場合があるので、既存 story や preview の書き方を見て判断する。分からなければ公式ドキュメントの該当バージョンを確認する
- `.storybook/preview.*` を変更するのは影響範囲が広いので、追記する前にユーザーに一言断る。変更したくない場合は、story 側で枠の幅を固定したデコレーター（`<div style={{ width: 375 }}>`）で代用できる

## 注釈

- 番号マーカーはワイヤーフレームの中に `WfNote` として置く
- 番号と説明の対応、案のトレードオフ、未解決の問いは、meta / story の `parameters.docs.description`（`component` / `story`）に Markdown で書く。autodocs を使っていれば Docs ページにまとまる
- 本番 UI の story と同じ Docs に混ぜたくない場合は、ワイヤーフレーム用の MDX ページを 1 枚作って説明をまとめてもよい

## 確認

- [ ] `storybook dev`（または既存の起動スクリプト）で起動し、`Wireframes/` 配下に全 story が出る
- [ ] 各 story が意図した viewport で表示され、はみ出し・横スクロールが無い
- [ ] グローバルデコレーターのテーマがワイヤーフレームに乗っていない（色が付いていない）
- [ ] 本番コードからワイヤーフレーム用部品を import していない
- [ ] 型チェック・lint が既存の設定で通る（プロジェクトに `typecheck` / `lint` スクリプトがあれば実行する）
- [ ] interaction test や visual regression（Chromatic など）の対象に勝手に入らないか。入るなら除外方法（`tags` など、既存の運用）を確認する
