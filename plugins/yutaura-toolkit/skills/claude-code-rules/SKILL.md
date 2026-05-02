---
name: claude-code-rules
description: Claude Code の rules ファイル（.claude/rules/*.md）を作成・改善するためのスキル。新規プロジェクトへの rules 導入、既存 rules の分析・リファクタリング、条件付きルールの設計に使用。「rules を作成したい」「CLAUDE.md を整理したい」「ルールを追加したい」といった要求時にトリガー。
---

# Claude Code Rules Creator

`.claude/rules/` に配置する rules ファイルの作成・改善ワークフロー。

## Workflow Decision Tree

```
ユーザー要求
    │
    ├─ "rules を新規作成したい"
    │   └─→ [新規作成フロー] へ
    │
    ├─ "既存の rules を改善したい"
    │   └─→ [改善フロー] へ
    │
    └─ "rules の書き方を教えて"
        └─→ references/rule-format.md を参照
```

## 新規作成フロー

### Step 1: 要件ヒアリング

以下を確認:

1. **対象スコープ**: 全ファイル対象か、特定ファイルパターンか
2. **ルールの目的**: コードスタイル、レビューガイドライン、アーキテクチャ制約など
3. **配置場所**: `.claude/rules/` または `~/.claude/rules/`（ユーザー共通）

### Step 2: ファイル作成

**フォーマット詳細は references/rule-format.md を参照。**

基本テンプレート:

```yaml
---
description: [何を強制するか]. Use when [トリガー条件].
paths: "**/*.{ts,tsx}"  # 省略時は全ファイル
---

# [Rule Title]

## Purpose

[このルールが何を強制するか]

## Rules

### Required

1. [必須ルール1]
2. [必須ルール2]

### Recommended

- [推奨事項]

## Examples

### Bad

\```typescript
// 悪い例
\```

### Good

\```typescript
// 良い例
\```

**Why**: [説明]
```

### Step 3: 検証

作成後の確認事項:

- [ ] frontmatter の `description` が第三人称 + トリガー条件を含む
- [ ] `paths` が正しい glob パターンである
- [ ] Good/Bad の具体例が含まれている
- [ ] 500行以下である

## 改善フロー

### Step 1: 現状分析

```bash
# 既存 rules の確認
ls -la .claude/rules/

# 各ファイルの行数確認
wc -l .claude/rules/*.md
```

### Step 2: 問題の特定

よくある問題:

| 問題 | 解決策 |
|------|--------|
| 1ファイルが長すぎる（500行超） | トピック別に分割 |
| description が曖昧 | 第三人称 + トリガー条件に修正 |
| 具体例がない | Good/Bad パターンを追加 |
| paths が広すぎる | より限定的なパターンに |

### Step 3: リファクタリング

**分割の基準**:
- 1ファイル = 1トピック
- ファイル名は内容を明確に表す（`testing.md`, `api-design.md`）
- サブディレクトリで分類可能（`frontend/`, `backend/`）

## paths パターン早見表

| パターン | 意味 |
|---------|------|
| `**/*.ts` | 全ディレクトリの TS ファイル |
| `src/**/*` | src/ 配下の全ファイル |
| `**/*.{ts,tsx}` | TS と TSX 両方 |
| `**/test/**/*.ts` | test ディレクトリ配下の TS |
| 省略 | 全ファイルに適用 |

## ディレクトリ構成パターン

### シンプルな構成

```
.claude/rules/
├── code-style.md
├── testing.md
└── security.md
```

### 大規模プロジェクト向け

```
.claude/rules/
├── general/
│   ├── code-style.md
│   └── git-workflow.md
├── frontend/
│   ├── react.md
│   └── css.md
└── backend/
    ├── api-design.md
    └── database.md
```

## References

詳細なフォーマット仕様は [references/rule-format.md](references/rule-format.md) を参照。
