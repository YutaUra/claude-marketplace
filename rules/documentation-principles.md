---
description: コード/テスト/コミット/コメントの書き分け原則を強制する。Use when writing code, tests, commits, or code comments.
---

# コードドキュメンテーションの原則

## 概要

コード、テスト、コミット、コメントにはそれぞれ異なる役割がある。適切な情報を適切な場所に書くことで、コードベースの可読性と保守性が大幅に向上する。

---

## 1. コードには **How**（どう実装するか）を書く

### なぜ重要か

コード自体が「何をしているか」を示す最も正確なドキュメントである。変数名、関数名、構造によって実装の意図を明確に伝える。コメントで「何をしているか」を説明するのは冗長であり、コードと乖離するリスクがある。

### 指示

- 変数名・関数名は処理内容を正確に表現する
- 複雑なロジックは小さな関数に分割して名前で意図を伝える
- マジックナンバーは定数として名前を付ける

### 例

**Bad**: コメントでコードの動作を説明している
```typescript
// ユーザーが18歳以上かチェック
if (u.a >= 18) {
  // ...
}
```

**Good**: コード自体が意図を表現している
```typescript
const MINIMUM_ADULT_AGE = 18;

function isAdult(user: User): boolean {
  return user.age >= MINIMUM_ADULT_AGE;
}

if (isAdult(user)) {
  // ...
}
```

---

## 2. テストコードには **What**（何をテストするか）を書く

### なぜ重要か

テストは仕様書としての役割を持つ。テスト名と構造から「このコードは何をすべきか」が読み取れるべきである。実装の詳細ではなく、期待される振る舞いを記述する。

### 指示

- テスト名は期待される振る舞いを日本語または明確な英語で記述する
- テストは Arrange-Act-Assert パターンで構造化する
- 1つのテストは1つの振る舞いのみを検証する

### 例

**Bad**: テスト名が実装詳細を示している
```typescript
test("validate function", () => {
  const result = validateEmail("test@example.com");
  expect(result).toBe(true);
});
```

**Good**: テスト名が期待される振る舞いを示している
```typescript
test("有効なメールアドレスの場合はtrueを返す", () => {
  // Arrange
  const validEmail = "test@example.com";

  // Act
  const result = validateEmail(validEmail);

  // Assert
  expect(result).toBe(true);
});

test("アットマークがない場合はfalseを返す", () => {
  const invalidEmail = "testexample.com";
  const result = validateEmail(invalidEmail);
  expect(result).toBe(false);
});
```

---

## 3. コミットログには **Why**（なぜこの変更をするか）を書く

### なぜ重要か

`git diff` で「何が変わったか」は分かる。しかし「なぜ変えたか」はコミットログにしか残らない。将来のメンテナが変更の背景を理解するために不可欠である。

### 指示

- 1行目: 変更の要約（50文字以内を目安）
- 空行
- 本文: 変更の理由、背景、影響を記述
- Issue/PR 番号があれば参照する

### 例

**Bad**: 何を変えたかだけを書いている
```
タイムアウトを30秒に変更
```

**Good**: なぜ変えたかを説明している
```
APIタイムアウトを10秒から30秒に延長

外部決済サービスのレスポンスが遅延するケースが増加し、
タイムアウトエラーが頻発していた。
決済サービス側の SLA（最大25秒）を考慮し、
バッファを含めて30秒に設定。

Fixes #1234
```

---

## 4. コードコメントには **Why not**（なぜ別の方法を選ばなかったか）を書く

### なぜ重要か

コードを読んだ人が「なぜこう書いたのか」「もっと良い方法があるのでは」と疑問を持つことがある。事前に代替案を検討した結果を残すことで、同じ議論の繰り返しを防ぎ、将来の変更判断に役立つ。

### 指示

- 一見非効率・冗長に見える実装には理由をコメントで残す
- 「こうしない理由」を明記する
- ライブラリや標準機能を使わない理由があれば説明する
- パフォーマンス上の考慮、互換性の問題、既知のバグ回避などを記録する

### 例

**Bad**: コメントがないため、なぜ標準ライブラリを使わないか不明
```typescript
function parseDate(dateStr: string): Date {
  const parts = dateStr.split("-");
  return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
}
```

**Good**: 標準ライブラリを使わない理由を説明
```typescript
function parseDate(dateStr: string): Date {
  // new Date(dateStr) を使わない理由:
  // 入力データに "2023-1-5" のようなゼロパディングなしの日付が混在しており、
  // Date コンストラクタはブラウザによって解釈が異なる。
  // date-fns は依存を増やしたくないため見送り。
  const parts = dateStr.split("-");
  return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
}
```

**Bad**: 一見冗長なコードに説明がない
```typescript
const result: Item[] = [];
for (const item of items) {
  result.push(transform(item));
}
```

**Good**: なぜ map を使わないか説明
```typescript
// Array.map() ではなくループを使用している理由:
// transform() が例外を投げる可能性があり、
// その場合に処理済みの結果を部分的に返す必要があるため。
const result: Item[] = [];
for (const item of items) {
  result.push(transform(item));
}
```

---

## まとめ

| 場所 | 書くこと | 目的 |
|------|----------|------|
| コード | How（どう実装するか） | 実装を正確に伝える |
| テスト | What（何をテストするか） | 仕様を明確にする |
| コミット | Why（なぜ変更するか） | 変更の背景を残す |
| コメント | Why not（なぜ別の方法を選ばなかったか） | 設計判断を記録する |

---

## 実行時の注意

1. **コードレビュー時**: 上記の原則に従っているかを確認する
2. **コミット作成時**: diff から「何が変わったか」は分かるので、「なぜ」を書く
3. **コメント追加時**: 「このコードは何をしている」ではなく「なぜこの方法を選んだか」を書く
4. **テスト作成時**: テスト名だけで仕様が理解できるようにする
