---
name: pnpm-best-practices
description: >
  pnpm（v11 / v12）でプロジェクトを立ち上げる・設定するときのベストプラクティス。
  供給網攻撃対策（minimumReleaseAge / trustPolicy / strictDepBuilds + allowBuilds / blockExoticSubdeps）を
  最初の install より前に pnpm-workspace.yaml へ書くこと、autoDedupe / saveTypes（v12.6）、
  設定の置き場所（pnpm-workspace.yaml と .npmrc の役割分担）、lockfile と CI の運用、
  廃止済み設定名の回避をまとめる。Use when: (1) 新しく pnpm-lock.yaml が作られる操作
  （lockfile の無い場所での pnpm install / add / import / init）をするとき、(2) pnpm-workspace.yaml を
  作成・編集するとき、(3) pnpm プロジェクトの .npmrc を編集するとき、(4) npm / yarn から pnpm へ移行するとき、
  (5) ERR_PNPM_IGNORED_BUILDS / ERR_PNPM_UNRECOGNIZED_WORKSPACE_SETTINGS / minimumReleaseAge や
  trustPolicy による install 失敗に当たったとき、(6) pnpm の CI / Docker 設定を書くとき。
  既存の pnpm プロジェクトで普通に依存を追加・実行するだけのとき、npm / yarn / bun を使い続けるプロジェクトでは使わない。
---

# pnpm-best-practices

pnpm v11 以降（v12 は Rust 製の native binary で、設定と lockfile は v11 と互換）を前提にする。
対象プロジェクトの pnpm が v10 以前なら、設定名や置き場所が大きく違うので `references/settings.md` の「バージョン差分」を先に読む。
バージョンは `package.json` の `packageManager` / `devEngines.packageManager`、無ければ `pnpm --version` で確かめる。

この skill の中心は 1 つだけ: **供給網対策の設定は、lockfile が最初に作られる前に書く。**
lockfile ができた後で設定しても、既に解決された危険なバージョンや未承認のビルドスクリプトは lockfile に残る
（`trustLockfile: false` が既定なので再検査はされるが、最初から入れないほうが安い）。

## 設定の置き場所（v11 以降）

| 置き場所 | 書くもの |
| --- | --- |
| `pnpm-workspace.yaml` | **pnpm の設定はすべてここ**（camelCase）。単一パッケージのリポジトリでもこのファイルを置く |
| `.npmrc` | auth / registry / TLS / proxy だけ。それ以外の pnpm 設定を書いても**黙って無視される** |
| `package.json` の `"pnpm"` フィールド | **v11 で読まれなくなった**（警告付きで無視）。overrides 等も yaml に移す |
| `~/.config/pnpm/config.yaml`（macOS は `~/Library/Preferences/pnpm/config.yaml`） | マシン全体の既定。プロジェクトに効かせたい設定はここではなく yaml に書いてコミットする |

- token を `.npmrc` にコミットしない。CI では `pnpm_config_//registry.npmjs.org/:_authToken` のように環境変数で渡す。
  v10.34.2 / v11.5.3 以降、リポジトリ内 `.npmrc` の `${ENV}` 展開は（脆弱性対策で）無効になっている。
- 環境変数は `npm_config_*` ではなく `pnpm_config_*`（v11 で切り替わった）。
- v12 は `pnpm-workspace.yaml` の**未知キーをエラーにする**（`ERR_PNPM_UNRECOGNIZED_WORKSPACE_SETTINGS`）。古い記事からのコピペで廃止キーを書くと install が落ちる。

## 推奨テンプレート

pnpm 12.21 で動作確認済み。新規プロジェクトではこれを起点にする。

```yaml
# pnpm-workspace.yaml
# monorepo のときだけ packages を書く
# packages:
#   - "apps/*"
#   - "packages/*"

# --- 供給網対策 ---
minimumReleaseAge: 1440        # 公開から 24 時間経っていない版は入れない（分単位）
trustPolicy: no-downgrade      # 過去版より信頼性（trusted publisher / provenance）が下がった版を拒否
blockExoticSubdeps: true       # 推移的依存の git / tarball URL を拒否（v11 から既定 true。明示しておく）
strictDepBuilds: true          # 未承認のビルドスクリプトがあれば install を失敗させる（v11 から既定 true）
allowBuilds: {}                # ビルドを許可するパッケージ。pnpm approve-builds で追記される

# --- 依存の衛生 ---
autoDedupe: true               # 全範囲を満たす版が 1 つあれば workspace 全体でそれに揃える（v12.6）
saveTypes: true                # pnpm add 時に @types/* を devDependencies へ自動追加（v12.6）
lockfile:
  includeResolutionSettings: true  # autoDedupe 等を lockfile に記録し、他マシンでも再解決させない（v12.10）
```

### 各設定の判断理由

| 設定 | 理由と注意 |
| --- | --- |
| `minimumReleaseAge` | 乗っ取られたアカウントから公開された悪性版は、多くが数時間〜1 日で検知・削除される。既定値も 1440 だが、**明示すると `minimumReleaseAgeStrict` が true になり**、条件を満たす版が無いときに古い版へ黙って落とさず失敗する。リスクを更に下げたいなら 10080（1 週間） |
| `trustPolicy: no-downgrade` | 「これまで trusted publisher から出ていたのに、急に provenance 無しで出た版」は乗っ取りの典型的な兆候。`packageManager` で固定した pnpm 自身の版も検査される |
| `blockExoticSubdeps` / `strictDepBuilds` | v11 からの既定値だが、明示しておくと「この repo はこれを前提にしている」ことがファイルから読める。v10 の環境で開かれたときの保険にもなる |
| `allowBuilds` | postinstall は任意コードの実行なので、許可は**パッケージ単位で明示**する。`dangerouslyAllowAllBuilds: true` は使わない |
| `autoDedupe` | 既定（false）では各プロジェクトが自分の範囲で最新を取り、同じパッケージの版が workspace 内でばらける。CI で `pnpm dedupe --check` をしたいなら必須 |
| `saveTypes` | 型定義の入れ忘れを防ぐ。型を同梱しているパッケージはスキップされるので副作用はない |
| `lockfile.includeResolutionSettings` | `autoDedupe` を有効にすると pnpm 自身がこの併用を勧める警告を出す。**全員が v12.10 以上**であることが前提（古い 12.x はこのキーをパースできない） |

## 新規プロジェクトの手順

1. `pnpm init` — v11.23 以降は `packageManager` と `devEngines.packageManager` の両方が書かれる。消さない。
2. **install より前に** `pnpm-workspace.yaml` を上のテンプレートで作る。
3. `pnpm add <deps>` / `pnpm install`。
4. `ERR_PNPM_IGNORED_BUILDS` が出たら、そのパッケージのビルドが本当に必要か判断してから `pnpm approve-builds <pkg>`（非対話）。不要なら `allowBuilds` に `<pkg>: false` を書く。esbuild / sharp / prisma など native binary を取る系は通常必要。
5. `pnpm-lock.yaml` と `pnpm-workspace.yaml` をコミットする。

## monorepo を作るとき

テンプレートに以下を足す。

```yaml
packages:
  - "apps/*"
  - "packages/*"

catalog:                   # 共有する依存の版はここで一元管理し、各 package.json では "catalog:" と書く
  react: ^19.2.0
  typescript: ^5.9.0

catalogMode: strict        # pnpm add が catalog を使うよう強制する（prefer: 自動で catalog 化 / manual: 既定）
catalogPrune: true         # 使われなくなった catalog エントリを自動削除（旧名 cleanupUnusedCatalogs は非推奨）
```

- 内部パッケージへの依存は `"workspace:*"`（または `workspace:^`）と明示する。`linkWorkspacePackages` は既定の false のままにする。true にすると、普通の semver 範囲が workspace 内のパッケージに解決されるか registry に解決されるかが、範囲の書き方しだいで暗黙に変わる。
- pnpm は `package.json` の `workspaces` フィールドを読まない（v12.4.1 から警告）。必ず `pnpm-workspace.yaml` の `packages` に書く。
- `overrides` / `packageExtensions` は root の `pnpm-workspace.yaml` にだけ書ける。`peerDependencyRules` は非推奨で、`"react-dom>react:peer": "^19"` のような `overrides` の `:peer` 記法に置き換わった。
- 単一パッケージで `catalogMode: prefer` / `strict` を使うと、すべての依存が `catalog:` に書き換わって見通しが悪くなる。catalog は複数パッケージで版を共有するときだけ使う。

## lockfile の運用

- `pnpm-lock.yaml` は必ずコミットする。
- CI では lockfile があると `frozenLockfile` が**既定で true** になる。明示したいなら `pnpm ci`（v11、`pnpm clean` してから frozen install）を使う。v12 は `--frozen-lockfile false` を受け付けない（`--no-frozen-lockfile` を使う）。
- merge conflict は手で直さず `pnpm install` を実行する。両側が有効な lockfile なら pnpm がマージする。
- 依存のばらつきは CI で `pnpm dedupe --check` で検出できる（`autoDedupe: true` が前提）。

## install が通らないとき

| 症状 | 対処 |
| --- | --- |
| `ERR_PNPM_IGNORED_BUILDS` | 上の手順 4。**`strictDepBuilds: false` で黙らせない** |
| `minimumReleaseAge` で解決できない（緊急の security fix をすぐ入れたい等） | `minimumReleaseAgeExclude` に**完全な版**で例外を書く（`- next@16.0.7`）。名前だけ・glob で書くとそのパッケージは今後ずっと素通しになる。`pnpm audit --fix` は修正版をここへ自動追記する |
| `trustPolicy` で拒否された | その版の公開経路を確認したうえで、`trustPolicyExclude` に完全な版で書く。provenance 以前から存在する古い版の誤検知が多いなら `trustPolicyIgnoreAfter`（分）を使う |
| `ERR_PNPM_UNRECOGNIZED_WORKSPACE_SETTINGS` | 廃止キーを書いている。`references/settings.md` の「使ってはいけない名前」と照合する |

pnpm 12.22.0 / 11.28.13 未満には、registry を切り替えると `minimumReleaseAge` と `trustPolicy` がスキップされる不具合があった。`packageManager` を更新する機会があれば `pnpm self-update 12` で最新に上げる。

## 既存プロジェクトでのふるまい

- 既存の pnpm プロジェクトの設定を、頼まれていないのにテンプレートへ一括で書き換えない。足りない供給網対策は**提案**として挙げる。
- 既存の `.npmrc` に pnpm の設定（`shamefully-hoist` 等）が残っていたら、v11 以降は効いていないことを伝え、`pnpm-workspace.yaml` への移行を提案する。v10 → v11 の移行は `pnx codemod run pnpm-v10-to-v11` が使える。

## 詳細

- 設定一覧（既定値・追加された版・廃止名・バージョン差分）: `references/settings.md`
- CI（GitHub Actions / GitLab）と Docker: `references/ci-and-docker.md`
