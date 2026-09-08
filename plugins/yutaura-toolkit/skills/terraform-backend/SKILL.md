---
name: terraform-backend
description: >
  yutaura の個人リポジトリ（github.com/YutaUra/*, github.com/yutaura-dev/*）で
  Terraform / OpenTofu の state backend を設定するときの規約。state は例外なく共通の
  S3 バケット `terraform-backend-147997134905` に集約し、key を
  `github.com/<owner>/<repo>/_/<repo 内パス>` で一意化する。Use when: (1) 個人リポジトリで
  新しく .tf を書き始める / terraform ディレクトリを増やすとき、(2) backend ブロックを
  作成・変更・レビューするとき、(3) terraform init が 403 / NoSuchBucket / state が空、など
  backend 起因で失敗したとき、(4) state バケットや DynamoDB ロックテーブルを新規に作ろうと
  しているとき（この構成ではどちらも不要）。
---

# terraform-backend

yutaura の個人リポジトリでは、**すべての Terraform / OpenTofu state を単一の S3 バケットに集約する**。GCP・Cloudflare・GitHub など何を管理する構成であっても、state の置き場は AWS S3 で固定する。

集約する理由は、state 置き場そのものを Terraform で作るときのブートストラップ問題（「state 置き場を作る構成の state はどこに置くのか」）を、`YutaUra/terraform` の `aws/147997134905/terraform-backend` 1 箇所に閉じ込めるため。バケットをプロジェクトごとに作ると、その数だけ卵が先か鶏が先かの問題が増える。

## 書くもの

`backend.tf` を独立したファイルとして置き、この形をコピーして `key` だけ差し替える。

```hcl
terraform {
  backend "s3" {
    bucket       = "terraform-backend-147997134905"
    key          = "github.com/<owner>/<repo>/_/<repo 内の tf ディレクトリのパス>"
    region       = "ap-northeast-1"
    encrypt      = true
    use_lockfile = true
  }
}
```

`versions.tf`（`required_version` / `required_providers`）とは別ファイルに分けるのが最近の慣習。分けない構成（`versions.tf` や `main.tf` に同居）も既存にあるので、**既にあるリポジトリではその配置に合わせる**。新規なら `backend.tf` に分ける。

## key の組み立て方

3 つを `/` で連結する。`_` は repo 名と repo 内パスの境界を示す区切り記号で、リテラルとしてそのまま置く。

| 部品 | 取り方 | 例 |
| --- | --- | --- |
| `github.com/<owner>/<repo>` | `git remote get-url origin` の表記をそのまま使う | `github.com/YutaUra/chinese-poker-solver` |
| `_` | 固定の区切り | `_` |
| `<repo 内パス>` | リポジトリルートから見た tf ディレクトリの相対パス。先頭・末尾に `/` は付けない | `infra/terraform` |

```
github.com/YutaUra/chinese-poker-solver/_/infra/terraform
           └─ owner ─┘└──── repo ────┘ │ └───  repo 内パス ───┘
                                     区切り
```

**owner は大文字小文字をそのまま写す。** `YutaUra` と `yutaura-dev` は別物で、S3 のキーは case-sensitive。`yutaura/foo` と書くと既存 state と別のキーになり、`terraform init` は「state が空の新規構成」として黙って通ってしまう。この失敗は成功したように見えるので厄介。

既存の実例:

| リポジトリ | tf ディレクトリ | key |
| --- | --- | --- |
| `YutaUra/terraform` | `aws/147997134905/terraform-backend` | `github.com/YutaUra/terraform/_/aws/147997134905/terraform-backend` |
| `YutaUra/chinese-poker-solver` | `infra/terraform` | `github.com/YutaUra/chinese-poker-solver/_/infra/terraform` |
| `yutaura-dev/my-niido` | `infra/terraform` | `github.com/yutaura-dev/my-niido/_/infra/terraform` |
| `yutaura-dev/self-hosted-github-runner` | `terraform` | `github.com/yutaura-dev/self-hosted-github-runner/_/terraform` |

1 リポジトリに複数の tf ディレクトリがあるときは、パス部分が違うので key も自然に分かれる。**同じ key を 2 つの構成が使うと後から init した側が state を上書きして破壊する**ので、新しい key を書いたら既存と衝突していないか必ず確かめる（後述の検証手順）。

## 各フィールドの根拠

- **`bucket`**: 全リポジトリ共通。AWS アカウント `147997134905`、バケット本体は `YutaUra/terraform` の `aws/147997134905/terraform-backend/s3.tf` が管理している。新しいバケットは作らない。
- **`region`**: `ap-northeast-1` 固定。バケットのリージョンなので、管理対象リソースがどのリージョン・どのクラウドにあっても変わらない。
- **`encrypt = true`**: state には平文の secret が入りうるため、保存時暗号化を明示する。
- **`use_lockfile = true`**: S3 ネイティブロック（Terraform 1.10+ / OpenTofu 1.10+）。ロックファイルは state と同じ prefix に `.tflock` として置かれるので、追加の権限もリソースも要らない。

`backend` ブロックでは変数・ローカル値・関数が一切使えない（Terraform が backend を評価するのは変数解決より前）。key を `"github.com/YutaUra/${var.repo}/..."` のように組み立てようとしても init で落ちるので、全部リテラルで書く。

## やらないこと

| アンチパターン | なぜ |
| --- | --- |
| DynamoDB のロックテーブルを作る / `dynamodb_table` を書く | `use_lockfile` で置き換え済み。テーブルは存在しない。古い記事のコピーで足すと、存在しないテーブルを参照して init が落ちる |
| プロジェクト専用の state バケットを新規作成する | 集約の意味がなくなり、そのバケット自体の state をどこに置くか問題が再発する |
| GCP しか管理しないから `backend "gcs"` にする | state 置き場は管理対象クラウドと独立。GCP プロジェクトの state も S3 に置いている（`YutaUra/terraform` の `gcp/yutaura.dev/projects/*`） |
| backend を書かずにローカル state で済ませる | ローカル state はマシンごと失われると管理対象が丸ごと孤児になり、destroy すら不能になる |
| `terraform workspace` で環境を分ける | 現状どのリポジトリも使っていない。環境を分けるならディレクトリを分けて key を分ける |
| owner を小文字に正規化する | S3 キーは case-sensitive。別 state になる（上記参照） |

## 検証

`backend.tf` を書いたら init する前に、その key が既に使われていないかを確かめる。

```bash
aws s3 ls s3://terraform-backend-147997134905/github.com/<owner>/<repo>/ --recursive
```

- **何も出ない**: 新規構成として正しい。そのまま `terraform init` してよい。
- **書こうとした key と同じものが出る**: 既存構成の state。同じ構成を再 init しているなら正常、別構成なら key を変える。

init 後は `terraform plan` が「全リソースを新規作成」と言い出さないかを見る。既存構成なのに全部 create になっているなら、ほぼ確実に key の綴り違い（owner の大文字小文字、`_` の欠落、パスのずれ）で別 state を掴んでいる。

## CI から使うとき

GitHub Actions からこのバケットにアクセスする場合、`YutaUra/terraform` の `aws/147997134905/terraform-backend/roles.tf` にそのリポジトリが登録されている必要がある。IAM ポリシーが `github.com/<owner>/<repo>/*` の prefix で絞られているため、**未登録のリポジトリは key が正しくても CI で 403 になる**。403 を見たら、まず backend の綴りではなくこの登録を疑う。

ロールは `arn:aws:iam::147997134905:role/github-actions-<repo>` の形で作られ、`aws-actions/configure-aws-credentials` の `role-to-assume` に渡す（静的キーは使わない）。登録手順そのものは `YutaUra/terraform` 側の作業なので、必要ならそのリポジトリを開いて `roles.tf` の `github_repositories` に追加する。
