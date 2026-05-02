# Rule File Format Specification

## 基本構造

```markdown
---
[YAML Frontmatter]
---

[Markdown Body]
```

## Frontmatter フィールド

### description（推奨）

**形式**: 第三人称で記述 + トリガー条件

```yaml
# Good
description: "Enforces TypeScript strict mode. Use when editing TS/TSX files."
description: "Ruby/Rails PRレビューガイドライン。PRレビュー時に使用。"

# Bad - トリガー条件がない
description: "TypeScript のルール"

# Bad - 曖昧
description: "コードスタイル"
```

### paths（オプション）

**形式**: glob パターン（文字列または配列）

```yaml
# 単一パターン
paths: "**/*.{ts,tsx}"

# 複数パターン
paths:
  - "src/**/*.ts"
  - "lib/**/*.ts"
  - "tests/**/*.test.ts"
```

**省略時**: 全ファイルに適用

### name（オプション）

ルールの識別子。省略時はファイル名が使用される。

```yaml
name: typescript-strict-mode
```

### allowed-tools（オプション）

このルールのコンテキストで許可するツール。

```yaml
allowed-tools: Read, Grep, Glob
```

## Glob パターン構文

| パターン | 意味 | 例 |
|---------|------|-----|
| `*` | 任意の文字（/ を除く） | `*.ts` → `file.ts` |
| `**` | 任意のディレクトリ階層 | `**/*.ts` → `a/b/c.ts` |
| `{a,b}` | ブレース展開 | `*.{ts,tsx}` → `*.ts` または `*.tsx` |
| `?` | 任意の1文字 | `file?.ts` → `file1.ts` |
| `[abc]` | 文字クラス | `[abc].ts` → `a.ts`, `b.ts` |

## Markdown Body 構成

### 推奨セクション

1. **Purpose** - ルールの目的
2. **Scope** - 適用範囲
3. **Rules** - Required / Recommended に分類
4. **Examples** - Good / Bad の比較

### Examples セクションのパターン

```markdown
## Examples

### Bad

\```typescript
// N+1 問題
users.forEach(user => {
  console.log(user.posts.length);
});
\```

### Good

\```typescript
// eager loading で解決
const usersWithPosts = await User.findAll({
  include: [Post]
});
usersWithPosts.forEach(user => {
  console.log(user.posts.length);
});
\```

**Why**: N+1 クエリはパフォーマンス劣化の主要因。eager loading で1回のクエリに集約。
```

## ファイル命名規則

- 小文字・数字・ハイフンのみ
- 64文字以内
- 内容を明確に表す名前

```
# Good
testing.md
code-style.md
security-review.md
api-design.md
react-components.md

# Bad
rules.md       # 曖昧
misc.md        # 曖昧
stuff.md       # 不明確
r1.md          # 意味不明
```

## サイズガイドライン

| サイズ | 推奨 |
|--------|------|
| 〜100行 | 理想的 |
| 100〜300行 | 適切 |
| 300〜500行 | 許容範囲、分割を検討 |
| 500行超 | 分割必須 |

## 完全な例

```yaml
---
description: "Enforces React component best practices. Use when creating or editing React components."
paths: "**/*.{tsx,jsx}"
---

# React Component Guidelines

## Purpose

React コンポーネントの一貫性と品質を確保する。

## Scope

- `.tsx`, `.jsx` ファイル
- 関数コンポーネント
- hooks の使用

## Rules

### Required

1. コンポーネントは関数コンポーネントで記述する
2. Props には TypeScript の型定義を付ける
3. useEffect には依存配列を必ず指定する

### Recommended

- カスタム hooks は `use` プレフィックスを付ける
- コンポーネントは1ファイル1コンポーネント

## Examples

### Bad

\```tsx
// クラスコンポーネント
class Button extends React.Component {
  render() {
    return <button>{this.props.label}</button>;
  }
}
\```

### Good

\```tsx
// 関数コンポーネント + 型定義
interface ButtonProps {
  label: string;
  onClick?: () => void;
}

const Button: React.FC<ButtonProps> = ({ label, onClick }) => {
  return <button onClick={onClick}>{label}</button>;
};
\```

**Why**: 関数コンポーネントは hooks が使え、テストしやすく、バンドルサイズも小さい。
```

## 階層構造とロード順序

### 優先度（高い順）

1. Managed policy (`/Library/Application Support/ClaudeCode/CLAUDE.md`)
2. User-level rules (`~/.claude/rules/`)
3. Project rules (`./.claude/rules/`)

### 自動検出

- `.claude/rules/` 配下の全 `.md` ファイルが自動検出される
- サブディレクトリも再帰的に探索される
- シンボリックリンクは自動解決される

## トラブルシューティング

### ルールが適用されない

1. `paths` パターンが正しいか確認
2. ファイルが `.claude/rules/` 直下またはサブディレクトリにあるか確認
3. 拡張子が `.md` か確認

### 複数ルールの競合

- 同じファイルに複数ルールがマッチする場合、すべて適用される
- 矛盾するルールは避け、1トピック1ファイルを維持する
