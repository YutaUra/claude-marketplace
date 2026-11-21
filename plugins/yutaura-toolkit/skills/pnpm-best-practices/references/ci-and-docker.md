# CI と Docker

一次情報: https://pnpm.io/continuous-integration 、https://pnpm.io/docker

## GitHub Actions

公式ドキュメントが現在案内しているのは `pnpm/setup` で、pnpm と Node をまとめて入れ、`pnpm install` まで実行する。
`actions/setup-node` や Corepack は要らない。

```yaml
- uses: actions/checkout@<sha>
- uses: pnpm/setup@fa36a5ef7dcdefc3a7cb25655c122e00cf6e636e # v3.1.2
  with:
    runtime: node@24
    cache: true        # pnpm store をキャッシュ
    # install: false   # install を自分で実行したいとき
- run: pnpm run build
```

- pnpm の版は `packageManager` / `devEngines.packageManager` から読まれるので、workflow 側で版を書かない。
- action は tag ではなく commit SHA で固定する（tag の付け替えによる供給網攻撃対策）。
- CI では lockfile があれば `frozenLockfile` が既定で true。明示したいなら `pnpm ci`。
- 依存のばらつきを止めたいなら `pnpm dedupe --check` を step に足す（`autoDedupe: true` が前提）。
- キャッシュは信頼できるジョブしか書き込めない場所にだけ置く（fork PR から汚染されないように）。

## GitLab CI など

```yaml
build:
  image: ghcr.io/pnpm/pnpm:12
  before_script:
    - pnpm config set store-dir .pnpm-store
    - pnpm runtime set node 24 -g
  script:
    - pnpm install
  cache:
    key:
      files: [pnpm-lock.yaml]
    paths: [.pnpm-store]
```

## Docker

```dockerfile
FROM ghcr.io/pnpm/pnpm:12 AS deps
WORKDIR /app
# v11 以降は pnpm-workspace.yaml を install 前に必ずコピーする（設定がここにあるため）
COPY pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,id=pnpm,target=/var/cache/pnpm \
    pnpm fetch --store-dir /var/cache/pnpm
COPY . .
RUN --mount=type=cache,id=pnpm,target=/var/cache/pnpm \
    pnpm install --offline --frozen-lockfile --store-dir /var/cache/pnpm
RUN pnpm deploy --filter=app --prod /out
```

- `pnpm fetch` は lockfile だけで store を埋めるので、`package.json` の変更で依存レイヤーのキャッシュが壊れにくい。
- monorepo の 1 アプリだけを本番イメージに入れるなら `pnpm deploy --filter=<app> --prod <dir>`。
- 温めた store をイメージのレイヤーに焼き込まない（BuildKit の cache mount を使う）。
- 公式イメージ `ghcr.io/pnpm/pnpm` は Node を含まない。runtime が必要なら `pnpm runtime set` か別ステージで用意する。
