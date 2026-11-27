# archive

役目を終えた skill / agent の置き場。**ここに置かれたものは plugin として配信されない**
（marketplace が読むのは `plugins/yutaura-toolkit/` 配下のみ）。

削除ではなく残す理由は、調査の過程で得た知見（CLI の挙動・落とし穴・検証結果）が
再利用しうる形で書かれているため。git log を掘らなくても参照できる状態にしておく。

| Archived | 時期 | 経緯 |
| --- | --- | --- |
| `skills/herdr-agent-message` | 2026-09 | Claude Code 公式の `ListAgents` / `SendMessage` が同一マシンの他ローカルセッションを直接アドレッシングできるようになり、この skill の主目的（別 pane のエージェントへの依頼と返信受領）が標準機能で満たされたため |
