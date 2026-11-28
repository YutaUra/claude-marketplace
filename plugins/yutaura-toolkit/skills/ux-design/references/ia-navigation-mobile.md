# 情報設計・ナビゲーション・検索・モバイル

## 情報設計（IA）

- **ナビの部品より先に、中身の構造を決める**: コンテンツの棚卸し → グループ分け → 用語の統一 → その後でナビの形（グローバル・ローカル・パンくず・ファセット）を選ぶ。
- **組織図をナビにしない**: 「誰が管理しているか」ではなく「どう使われるか」（タスク・トピック）でまとめる。部署別の構造は組織変更のたびに壊れる。
- **利用者層別の入口（「法人の方」「個人の方」）はたいてい問題を起こす**: 複数に当てはまる人・どれにも当てはまらない人がいて、選ぶ手間と「他の層の方が得をしているのでは」という不安を生む。中身が本当にその層専用のときだけ使う。
- **ラベルはユーザーのメンタルモデルの言葉で**: 作り手は自分の仕組みを知りすぎている。社内用語・ひねった名前を避ける。
- **構造はカードソートで作り、ツリーテストで確かめる**: カードは 30〜50 枚。ツリーテストのタスク文にラベルの言葉を使わない（答えが漏れる）。Claude が机上で作った分類は仮説であり、検証が必要だと明記する。

出典: https://www.nngroup.com/articles/ia-vs-navigation/ / https://www.nngroup.com/articles/intranet-information-architecture-ia/ / https://www.nngroup.com/articles/audience-based-navigation/ / https://www.nngroup.com/articles/card-sorting-definition/ / https://www.nngroup.com/articles/tree-testing/

## ナビゲーション

- **どのページでも現在地が分かる**: ナビの選択状態、ページの見出し、パンくず、手順の表示を重ねる。検索から直接着地する人がいるので、トップから来る前提にしない。
  - 確かめ方: ナビを隠したページを見せて「ここはどこか、なぜ分かるか」を問う。
- **深さ**: 単純なドロップダウンは 2 階層からつらく、3 階層以上は避ける。深いならメガメニュー。
- **項目数を 7 個で切らない**: メニューは見て選ぶもの。短くしすぎると各項目が抽象的になる。
- **デスクトップでハンバーガーメニューを使わない**: 隠したナビは見つけられにくく（使われたのは 27% 対 見せた場合 48〜50%）、タスク時間も 39% 以上伸びた（NN/g）。モバイルでもトップレベルが 4 項目以下なら見せる。
- **モバイルのタブバーは同格の行き先 3〜5 個**: 操作（「作成」「共有」）を置かない。画面を移っても隠さない（モーダルは例外）。「その他」タブで溢れさせるより、構造を見直す。
- **パンくずは階層を示すもの**: 閲覧履歴ではない。末尾は現在ページでリンクにしない。1〜2 階層の浅いサイトや一本道のフローには不要。
- **端からスワイプで出す隠しメニュー**はほぼ発見されず、iOS の「戻る」スワイプとも衝突する。

出典: https://www.nngroup.com/articles/navigation-you-are-here/ / https://www.nngroup.com/articles/menu-design/ / https://www.nngroup.com/articles/hamburger-menus/ / https://developer.apple.com/design/human-interface-guidelines/tab-bars / https://www.nngroup.com/articles/breadcrumbs/

## 検索

- **ゼロ件を行き止まりにしない**: 「結果がありません」をはっきり示したうえで、検索語を残した検索窓、表記ゆれの修正候補、結果が出る代わりの語、関連カテゴリ、人気のもの、問い合わせ窓口を出す。代わりの語で結果が出るのが 1 つだけなら自動で適用し、変えたことを伝える。「検索のコツ」の表示だけでは足りない。
- **表記ゆれを吸収する**: 全角・半角、ひらがな・カタカナ、略称、よくある誤字。
- **ファセット（絞り込み）**: 同じ軸の中は OR（複数選択できるチェックボックス）、軸どうしは AND。同じ軸で 1 つしか選べないと、ユーザーは条件ごとに検索して記憶で比べることになる。軸は中身の形式ではなくユーザーの探し方に合わせる。選択中の条件を一覧で見せ、1 つずつ外せるようにする。

出典: https://baymard.com/blog/no-results-page / https://www.nngroup.com/articles/search-no-results-serp/ / https://baymard.com/blog/allow-applying-of-multiple-filter-values / https://www.nngroup.com/articles/filters-vs-facets/

## モバイル

### タッチターゲット
| 基準 | 値 | 位置づけ |
| --- | --- | --- |
| WCAG 2.2 の 2.5.8（AA） | 24×24 CSS px | **割ってはいけない下限**。小さくても、中心から直径 24px の円が他と重ならない間隔があれば適合 |
| WCAG 2.5.5（AAA） | 44×44 CSS px | 推奨 |
| Apple HIG | 既定 44×44pt、最小 28×28pt | 「Apple の最小は 44pt」は不正確 |
| Android / Material | 48×48dp、間隔 8dp | 推奨 |

主要な操作・頻繁な操作・取り消しにくい操作ほど大きくする。見た目のサイズではなく反応する領域で判定する。ズームできることは理由にならない。

出典: https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html / https://developer.apple.com/design/human-interface-guidelines/accessibility / https://support.google.com/accessibility/android/answer/7101858

### 持ち方
- 観察では片手持ち 49%、片手で持ってもう一方の指で操作 36%、両手持ち 15%（Hoober 2013）。ただし持ち方は数秒ごとに変わる。
- 「75% が親指で操作」は出典不明。親指ゾーン図も作者自身が一部不正確だったと修正している。図を絶対視せず、主要操作を大きく・押しやすい位置に置き、危険な操作を主要操作の隣に置かない、で十分。

出典: https://www.uxmatters.com/mt/archives/2013/02/how-do-users-really-hold-mobile-devices.php

### 入力
- `type` / `inputmode` / `autocomplete` を指定して、適切なキーボードと自動入力を出す（数字キーボードはキーが大きく、打ち間違いが減る）。
- 書式の例は、そのキーボードで打てる文字だけで示す。
- 入力そのものを減らす（選択肢、既定値、カメラでの読み取り、位置情報）。

出典: https://baymard.com/blog/mobile-touch-keyboards
