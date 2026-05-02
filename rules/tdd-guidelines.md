---
description: TDD（テスト駆動開発）の実践を強制する。Use when implementing features, fixing bugs, or writing tests.
---

# TDD（テスト駆動開発）ガイドライン

## 1. なぜテストを書くのか

テストコードは単なる品質保証ツールではなく、**設計ツール**である。

- **仕様の明確化**: テストを書くことで「何を実現すべきか」が具体的になる
- **回帰防止**: 変更が既存機能を壊していないことを即座に確認できる
- **リファクタリングの安全網**: テストがあれば自信を持ってコードを改善できる
- **ドキュメント代わり**: テストは「動く仕様書」として機能する

## 2. 変更時のテスト追加原則

**すべてのコード変更にはテストが伴う。** これは絶対的な原則である。

### 新機能追加時

- 機能実装の**前に**テストを書く
- テストが失敗することを確認してから実装に入る

### バグ修正時

- まず**バグを再現するテスト**を書く
- テストが失敗することを確認してから修正する
- 修正後、テストが通ることを確認する

### リファクタリング時

- 既存テストが通ることを確認してから開始する
- リファクタリング中はテストを変更しない
- 完了後、すべてのテストが通ることを確認する

## 3. Red-Green-Refactor サイクル

TDD の核心は以下の3ステップを**小さく素早く**回すことにある。

```
┌─────────────────────────────────────────────────┐
│  Red → Green → Refactor → Red → Green → ...    │
└─────────────────────────────────────────────────┘
```

### Red: 失敗するテストを書く

最初に、まだ存在しない機能のテストを書く。

```typescript
// user.test.ts
import { describe, it, expect } from "vitest";
import { User } from "./user";

describe("User", () => {
  it("フルネームを返す", () => {
    const user = new User("田中", "太郎");
    expect(user.fullName()).toBe("田中 太郎");
  });
});
```

この時点でテストを実行すると**失敗する**（User クラスが存在しない）。これが Red 状態。

### Green: テストを通す最小限のコードを書く

テストを通すことだけに集中する。美しさや効率は後回し。

```typescript
// user.ts
export class User {
  constructor(
    private lastName: string,
    private firstName: string
  ) {}

  fullName(): string {
    return `${this.lastName} ${this.firstName}`;
  }
}
```

テストが**通る**。これが Green 状態。

### Refactor: コードを改善する

テストが通る状態を維持しながら、コードを改善する。

```typescript
// 例: 型を追加してより堅牢に
export class User {
  readonly lastName: string;
  readonly firstName: string;

  constructor(lastName: string, firstName: string) {
    this.lastName = lastName;
    this.firstName = firstName;
  }

  fullName(): string {
    return `${this.lastName} ${this.firstName}`;
  }
}
```

リファクタリング後もテストが通ることを確認する。

## 4. TDD の基本技法

### 4.1 Arrange-Act-Assert（AAA）パターン

テストは3つの部分で構成する。

```typescript
it("商品を追加するとカート内の合計金額が更新される", () => {
  // Arrange: 準備
  const cart = new ShoppingCart();
  const product = new Product("りんご", 150);

  // Act: 実行
  cart.add(product, 2);

  // Assert: 検証
  expect(cart.totalAmount()).toBe(300);
});
```

### 4.2 境界値とエッジケース

正常系だけでなく、境界値やエラーケースも必ずテストする。

```typescript
describe("divide", () => {
  it("正常に除算できる", () => {
    expect(divide(10, 2)).toBe(5);
  });

  it("0で割るとエラーになる", () => {
    expect(() => divide(10, 0)).toThrow("0で割ることはできません");
  });

  it("小数点以下も正確に計算する", () => {
    expect(divide(1, 3)).toBeCloseTo(0.333, 3);
  });
});
```

### 4.3 テストの独立性

各テストは他のテストに依存してはならない。

```typescript
describe("Counter", () => {
  // 各テストで新しいインスタンスを作る
  it("初期値は0", () => {
    const counter = new Counter();
    expect(counter.value).toBe(0);
  });

  it("incrementで1増える", () => {
    const counter = new Counter();
    counter.increment();
    expect(counter.value).toBe(1);
  });
});
```

### 4.4 テストダブル（モック・スタブ）

外部依存は適切にモック化する。

```typescript
import { vi } from "vitest";

it("ユーザー情報を取得して表示名を返す", async () => {
  // 外部APIをモック化
  const mockApi = {
    fetchUser: vi.fn().mockResolvedValue({ name: "山田花子" }),
  };

  const service = new UserService(mockApi);
  const displayName = await service.getDisplayName("user-123");

  expect(displayName).toBe("山田花子");
  expect(mockApi.fetchUser).toHaveBeenCalledWith("user-123");
});
```

## 5. 実践ルール

1. **コードを書く前にテストを書く** — 実装ファイルを作る前にテストファイルを作成する
2. **1つずつ進める** — 一度に複数の機能を実装しない。1テスト1機能
3. **テスト実行を確認する** — Red と Green の両方の状態を必ず確認する
4. **既存テストを壊さない** — 変更後は必ず全テストを実行する
5. **テストも保守する** — 不要になったテストは削除し、テストコードも整理する
