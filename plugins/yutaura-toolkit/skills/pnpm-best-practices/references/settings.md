# pnpm 設定リファレンス

pnpm.io のドキュメント（2026-11 時点、v12.x）で確認した内容。キーはすべて `pnpm-workspace.yaml` に camelCase で書く。
一次情報は https://pnpm.io/settings 。ここに無い設定や、版が新しくなって挙動が怪しいときはそちらを見る。

## 供給網対策

| キー | 既定値（v12） | 追加 | メモ |
| --- | --- | --- | --- |
| `minimumReleaseAge` | `1440`（v10 は 0） | v10.16 | 分単位。推移的依存にも効く |
| `minimumReleaseAgeStrict` | `minimumReleaseAge` を明示したら `true`、未設定なら `false` | v11.0 | false だと条件を満たさない版に黙ってフォールバックする |
| `minimumReleaseAgeExclude` | なし | v10.16 | 名前 / glob / 完全な版（`nx@21.6.5`）。**完全な版で書く** |
| `minimumReleaseAgeExcludePrune` | `false` | v11.22 | 不要になった例外を自動削除 |
| `minimumReleaseAgeIgnoreMissingTime` | `true` | v11.0 | `time` を返さない registry で失敗させたいなら false |
| `trustPolicy` | `off` | v10.21 | `no-downgrade` を推奨 |
| `trustPolicyExclude` | `[]` | v10.22 | 完全な版で例外を書く |
| `trustPolicyIgnoreAfter` | なし | v10.27 | 分単位。これより古い版は検査しない |
| `trustPolicyExcludePrune` | `false` | v12.4 | |
| `trustLockfile` | `false` | v11.3 | false のままにする。lockfile の全エントリを policy で再検査する |
| `blockExoticSubdeps` | `true`（v10 は false） | v10.26 | |
| `strictDepBuilds` | `true`（v10 は false） | v10.3 | |
| `allowBuilds` | 未記載 = 不許可 | v10.26 | `pkg: true/false`、`pkg@1.2.3 \|\| 1.2.4: true` のように版指定も可。git 依存は URL か commit で許可 |
| `dangerouslyAllowAllBuilds` | `false` | v10.9 | 使わない |
| `permissions`（`build` / `skills`） | なし | v12.11 | `allowBuilds` より優先される新しい書き方。古い pnpm は読まないので、チームの全員が v12.11 以上になるまでは `allowBuilds` を使う |

## 依存解決・lockfile

| キー | 既定値 | 追加 | メモ |
| --- | --- | --- | --- |
| `autoDedupe` | `false` | v12.6 | frozen install では lockfile を変えない |
| `lockfile.includeResolutionSettings` | `false` | v12.10 | 全員 v12.10 以上が前提 |
| `resolutionMode` | `highest` | | `time-based` / `lowest-direct` |
| `frozenLockfile` | CI かつ lockfile ありなら `true` | | |
| `gitBranchLockfile` | `false` | | branch ごとに lockfile を分けて conflict を避ける |
| `mergeGitBranchLockfilesBranchPattern` | `null` | | 上と組み合わせる（例: `- main`） |
| `saveTypes` | `false` | v12.6 | CLI では `--save-types` |
| `savePrefix` | `^` | | |
| `verifyDepsBeforeRun` | `install`（v10 は false） | | `pnpm run` 前に依存が古ければ install する |
| `optimisticRepeatInstall` | `true`（v11 から） | v10.1 | |

## workspace / catalog

| キー | 既定値 | 追加 | メモ |
| --- | --- | --- | --- |
| `packages` | なし | | workspace の定義はここだけ（`package.json` の `workspaces` は読まれない） |
| `catalog` / `catalogs` | なし | | v12.6 から `file:` / `link:` も書ける |
| `catalogMode` | `manual` | v10.12.1 | `strict` / `prefer` |
| `catalogPrune` | `false` | v11.22 | 旧名 `cleanupUnusedCatalogs` |
| `linkWorkspacePackages` | `false` | | false のまま `workspace:` を明示する |
| `saveWorkspaceProtocol` | `rolling` | | |
| `injectWorkspacePackages` | `false` | | `pnpm deploy` は v12.2 から不要 |

## node_modules / peer

| キー | 既定値 | メモ |
| --- | --- | --- |
| `nodeLinker` | `isolated` | React Native などで必要なときだけ `hoisted` |
| `shamefullyHoist` | `false` | 幽霊依存を許すことになるので、必要なパッケージだけ `publicHoistPattern` に書く |
| `publicHoistPattern` | `[]` | |
| `strictPeerDependencies` | `false` | |
| `autoInstallPeers` | `true` | |
| `engineStrict` | `false` | |

## パッケージマネージャと runtime の固定

- `packageManager`: 完全な版のみ（例 `pnpm@12.21.0`）。
- `devEngines.packageManager`（v11）: 範囲指定可。解決された版は lockfile の `packageManagerDependencies` に記録され、`minimumReleaseAge` / `trustPolicy` も効く。
- `pmOnFail`（v11、既定 `download`）: 版が違うとき pnpm が自動で取りに行く。mise / asdf / Volta で版を管理しているなら `ignore`。
- Node の版の固定は `devEngines.runtime`（v10.14）。`useNodeVersion` / `executionEnv.nodeVersion` は廃止。
- Corepack は使わない（pnpm 公式の CI ドキュメントが「呼び出しのたびに Node の shim を経由する」として非推奨にしている。v12 は Node 不要の native binary）。
- 版を上げるときは `pnpm self-update 12`。

## 使ってはいけない名前

| 状態 | 名前 → 代わり |
| --- | --- |
| v11 で削除 | `onlyBuiltDependencies` / `onlyBuiltDependenciesFile` / `neverBuiltDependencies` / `ignoredBuiltDependencies` / `ignoreDepScripts` → `allowBuilds` |
| v11 で削除 | `managePackageManagerVersions` / `packageManagerStrict` / `packageManagerStrictVersion` / `COREPACK_ENABLE_STRICT` → `pmOnFail` |
| v11 で削除 | `useNodeVersion` / `executionEnv.nodeVersion` → `devEngines.runtime` |
| v11 で削除 | `allowNonAppliedPatches` → `allowUnusedPatches`、`ignorePatchFailures`、`auditConfig.ignoreCves` → `ignoreGhsas` |
| v12 で拒否 / 無視 | `confirmModulesPurge`（エラー）、`scriptsPrependNodePath`（無視） |
| 読まれない | `package.json` の `"pnpm"` フィールド、`.npmrc` の auth / registry 以外のキー、`npm_config_*` 環境変数 |
| CLI から削除 | `--resolution-only`（→ `pnpm peers check`）、`--frozen-lockfile false`（→ `--no-frozen-lockfile`） |
| 非推奨（動く） | `cleanupUnusedCatalogs` → `catalogPrune`、`peerDependencyRules` → `overrides` の `:peer`、`pnpm env use` → `pnpm runtime set` |

## バージョン差分（v10 以前のプロジェクトを触るとき）

v10 では次が違う。v10 のまま運用するなら、この表のとおりに読み替える。

- 設定は `.npmrc`（kebab-case）、`package.json` の `"pnpm"` フィールド、`pnpm-workspace.yaml` のどこでも読まれる。
- `minimumReleaseAge` の既定は 0、`blockExoticSubdeps` / `strictDepBuilds` の既定は false。**すべて明示が必要**。
- ビルド許可は `onlyBuiltDependencies`（v10.26 以降は `allowBuilds` も使える）。
- `autoDedupe` / `saveTypes` / `catalogPrune` / `trustLockfile` / `pmOnFail` は存在しない。

可能なら v11 以降に上げることを提案する。移行は `pnx codemod run pnpm-v10-to-v11`。
