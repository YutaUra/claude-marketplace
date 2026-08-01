# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## リポジトリの性質

yutaura 個人用の Claude Code plugin marketplace。ビルド・テスト・lint は存在しない。すべて Markdown / JSON の宣言的ファイルで構成される。

## アーキテクチャ（2つの配信レーン）

このリポジトリには**配信経路の異なる2種類のコンテンツ**が同居している:

1. **plugin レーン**: `plugins/yutaura-toolkit/` — Claude Code の marketplace 機能（`.claude-plugin/marketplace.json` → `plugin.json` → `skills/`）で配信される。auto-update または `/plugin marketplace update yutaura-marketplace` で利用側に反映。
2. **rules レーン**: `rules/*.md` — plugin の公式配信対象外のため、nix-darwin（`pkgs/yutaura-rules.nix` の `fetchFromGitHub`）が別途取得して `~/.claude/rules/` に配置する。反映は `nix flake update` → `darwin-rebuild switch` で、plugin とは更新タイミングが独立。

## skill の構造

各 skill は `plugins/yutaura-toolkit/skills/<name>/SKILL.md`（frontmatter: `name`, `description`）を本体とし、詳細情報は `references/*.md` に分離する。`description` はトリガー条件（Use when: ...）を含める慣習。

## 変更時の必須手順

`plugins/` 配下を変更したら、**必ず `plugins/yutaura-toolkit/.claude-plugin/plugin.json` の `version` を bump** してから commit する。version bump がないと利用側の auto-update が発火しない。

新しい skill を追加したら README.md の skill 一覧テーブルも更新する。将来 agents / commands / hooks を追加する場合は `plugins/yutaura-toolkit/` 直下に `agents/` `commands/` 等を配置する。
