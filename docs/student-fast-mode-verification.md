# 生徒画面高速化 実機検証手順

この手順は `v2.0.0` を本番反映する前に、テスト用GASとテスト用スプレッドシートで確認するためのチェックリストです。本番GASには未検証コードを貼らないでください。本番反映は、この手順で生徒画面、採点、Webモニター、集計更新、表示中一覧CSV、自動更新を確認してから行います。

## 事前準備

1. テスト用スプレッドシートを用意します。
2. テスト用GASに `Code.gs`, `Student.html`, `Monitor.html` を貼ります。
3. スプレッドシート再読み込みを行います。
4. `もるくえ！` -> `⓪ 初期整備・保守` -> `⓪-1 管理シートを作成・補修` を実行します。
5. `設定` シートの `WEB_APP_URL` にテスト用WebアプリURLを入れます。
6. `もるくえ！` -> `★ 先生用URLを設定シートに出力` を実行します。`MONITOR_URL` と `TEST_STUDENT_URL` が出力され、可能ならモニター表示用キャッシュもbest-effortで初期作成されることを確認します。初期作成に失敗してもURL出力自体は成功扱いです。
7. `MONITOR_URL` を開き、通常は生徒一覧または空のモニター状態が表示されることを確認します。`snapshot-missing` の場合は、強調表示された `モニターだけ更新` を使って復旧確認します。
8. `設定` シートで `AUTO_REBUILD_CACHE_ENABLED=false`、`AUTO_REBUILD_CACHE_INTERVAL_MINUTES=5` を確認します。生徒APIの通常/高速切替設定は存在しないため、生徒画面は常時高速ルートで動きます。
9. 問題があれば、実機ログで原因を切り分け、必要に応じて直前の安定デプロイへ戻せるようにしておきます。

## 生徒画面確認

1. `設定` シートの `TEST_STUDENT_URL` を開きます。
2. 初回問題表示が待たされすぎないことを確認します。
3. 初級、中級、上級の問題取得を確認します。
4. 解答送信後に、正誤、正答、解説が表示されることを確認します。
5. 次問へ進めることを確認します。
6. プリフェッチ済みの次問がある場合、クライアントが `skipNextProblem=true` を送っても画面遷移が破綻しないことを確認します。
7. 採点レスポンスの `nextProblem` が `null` でも、プリフェッチ済み問題を表示できることを確認します。プリフェッチがない場合は、次問ボタン押下時に `getPracticeProblem` で取得できることを確認します。
8. 初回表示時の `lastAccessedAt` 即時書き込みがなくても、生徒画面が通常通り使えることを確認します。

## TEST_STUDENT_URL と教師プレビューURL

- `TEST_STUDENT_URL` は `?t=...` の通常の生徒URLです。通常生徒画面と同じ `initializeStudentSession` / `submitAnswer` ルートを通るため、高速化対象です。
- `④-1 選択行の教師プレビューURL` は `preview=teacher` と `previewNonce` を使う先生用確認ルートです。教師プレビューは解答ログに保存しないため、通常生徒のログ保存確認には使いません。
- 生徒画面の速度検証、常時高速ルート検証、解答ログ保存確認は `TEST_STUDENT_URL` で行います。
- 教師プレビューは表示、問題生成、採点UI確認用です。通常生徒のログ保存や常時高速ルート検証の対象ではないため、実機ログの判定では通常生徒URLと分けて見ます。

## ログ確認

Apps Scriptの実行ログまたは `実行ログ`、開発ログで次の語句を確認します。生tokenがログに出ていないことも確認します。

- `initializeStudentSession elapsedMs`
- `getPracticeProblem elapsedMs`
- `submitAnswer elapsedMs`
- `studentRoute=fast`
- `tokenElapsedMs`
- `tokenCacheReadElapsedMs`
- `tokenSheetFindElapsedMs`
- `tokenCacheWriteElapsedMs`
- `lockElapsedMs`
- `documentLockWaitAndRunElapsedMs`
- `duplicateCheckElapsedMs`
- `appendLogElapsedMs`
- `appendOnlyElapsedMs`
- `aggregatePath=deferred_aggregate_update`
- `cacheUpdated=false`
- `problemTypeCacheUpdated=false`
- `nextProblemIncluded=false`

### 高速化ルートの判定

| 判定 | 実機ログで見る語句 |
| --- | --- |
| `TEST_STUDENT_URL` で常時高速ルートに乗っている | `initializeStudentSession ... studentRoute=fast`、`accessRecord=skipped_student_runtime`、`submitAnswer ... studentRoute=fast`、`aggregatePath=deferred_aggregate_update`、`cacheUpdated=false`、`problemTypeCacheUpdated=false`、`nextProblemIncluded=false` |
| 古いデプロイを見ている可能性 | `studentRoute=fast` が出ない、`accessRecord=recorded`、`cacheUpdated=true`、`problemTypeCacheUpdated=true` |
| モニター更新経路が古い可能性 | `★ 先生用URLを設定シートに出力` 後に `モニターキャッシュ` の `dashboard` 行が作られない、Webモニターの `モニターだけ更新` 後に `モニターキャッシュ` が更新されない、または `⑨ 集計キャッシュを更新` / Webモニターの `集計から完全更新` 後に `集計キャッシュ`、`問題タイプ別キャッシュ`、`モニターキャッシュ` が更新されない |

`mode=student` が付いた `initializeStudentSession` / `getPracticeProblem` / `submitAnswer` は通常生徒ルートです。`mode=teacherPreview` が付いた `initializeTeacherPreviewSession` / `getTeacherPreviewProblem` / `submitTeacherPreviewAnswer` は教師プレビュー用で、解答ログ保存や常時高速ルート判定には使いません。

### 遅い場合の切り分け

| 症状 | 優先して見るログ・シート |
| --- | --- |
| 初回表示が遅い | `initializeStudentSession elapsedMs`、`tokenElapsedMs`、`tokenCacheReadElapsedMs`、`tokenSheetFindElapsedMs`、`tokenCacheWriteElapsedMs`、`summaryElapsedMs`、`adaptiveElapsedMs`、`problemElapsedMs`、`studentRoute`、`accessRecord` |
| 採点が遅い | `submitAnswer elapsedMs`、`storedProblemElapsedMs`、`gradingElapsedMs`、`lockElapsedMs`、`documentLockWaitAndRunElapsedMs`、`duplicateCheckElapsedMs`、`appendLogElapsedMs`、`appendOnlyElapsedMs`、`aggregateUpdateElapsedMs`、`problemTypeCacheUpdateElapsedMs`、`nextProblemElapsedMs`、`nextProblemIncluded` |
| モニターが遅い | `getMonitorDashboardData elapsedMs`、`snapshotMode=snapshot` または `snapshotMode=snapshot-missing`、`cacheReadElapsedMs`、`sheetReadElapsedMs`、`jsonParseElapsedMs`、`rowCount`、`payloadBytes`、`liveFallback=false`、`モニターキャッシュ` の `dashboard` 行があるか、Webモニターの `モニターだけ更新` 後に `updatedAt` が変わるか、必要時に `⑨ 集計キャッシュを更新` またはWebモニターの `集計から完全更新` 後に各キャッシュが変わるか |

15秒級に遅い場合は、まず `studentRoute=fast`、`aggregatePath=deferred_aggregate_update`、`nextProblemIncluded=false` が出ているかを確認します。出ているのに遅い場合は、`tokenSheetFindElapsedMs`、`duplicateCheckElapsedMs`、`appendOnlyElapsedMs`、`documentLockWaitAndRunElapsedMs`、`storedProblemElapsedMs` のどれが大きいかを見ます。どれも小さい場合は、Apps Scriptのコールドスタート、Spreadsheetサービス全体の待ち時間、CacheService待ち時間、デプロイ差し替え漏れを疑います。

## 集計確認

1. 解答送信後、`解答ログ` に解答が残ることを確認します。
2. 常時高速ルートでは、採点直後に `集計キャッシュ` が即時更新されない前提で確認します。
3. `もるくえ！` -> `⑨ 集計キャッシュを更新` を実行します。
4. 実行後、`集計キャッシュ`、`問題タイプ別キャッシュ`、`モニターキャッシュ` が更新されることを確認します。
5. `モニターキャッシュ` の `dashboard` 行にJSONと更新時刻が入ることを確認します。
6. Webモニターの `モニターだけ更新` では、既存キャッシュから `モニターキャッシュ` だけが更新され、実行ログに `MONITOR_REBUILD_MONITOR_SNAPSHOT` が残ることを確認します。
7. Webモニターの `集計から完全更新` では、`集計キャッシュ`、`問題タイプ別キャッシュ`、`モニターキャッシュ` が更新され、実行ログに `MONITOR_REBUILD_AGGREGATE_MONITOR_CACHE` が残ることを確認します。

## モニター確認

1. `設定` シートの `MONITOR_URL` を開きます。
2. スナップショットがある場合、Webモニターに生徒一覧とKPIが表示されることを確認します。
3. スナップショットが未作成または壊れている場合、Webモニター上で重いライブ構築を行わず、`snapshot-missing` として強調表示された `モニターだけ更新` を先に促し、必要時だけ `集計から完全更新` を使うメッセージが出ることを確認します。
4. `モニターだけ更新` を押すと、既存キャッシュからWebモニター上で復旧でき、`モニターキャッシュ` の `updatedAt` が変わることを確認します。
5. `モニターだけ更新` が失敗した場合、または更新後も `snapshot-missing` が続く場合、強調表示が `集計から完全更新` に移り、status line に次に押すべきボタンが出ることを確認します。
6. `モニターだけ更新` でも人数や集計が古い場合に限り、`集計から完全更新` で `集計キャッシュ`、`問題タイプ別キャッシュ`、`モニターキャッシュ` を作り直せることを確認します。`集計から完全更新` は重いので授業中は必要時だけ使います。
7. `管理スプレッドシートを開く` が同じ管理ブックを別タブで開くことを確認します。
8. `表示中一覧CSV` が現在の検索・フィルター・表示状態・ソート後の生徒一覧だけをUTF-8 BOM付きCSVとして保存することを確認します。解答ログ全履歴CSV、問題タイプ別詳細CSV、分析CSVではありません。
9. Webモニターから許可される書き込み系操作が `rebuildMonitorSnapshotFromMonitor` と `rebuildAggregateAndMonitorCacheFromMonitor` だけであることを確認します。トリガー作成、トークン操作、Classroom投稿操作、URL無効化、初期化、自動更新ON/OFFはできないままにします。
10. 表示モード、番号・氏名固定、見出しクリックソート、自動更新60秒が維持されていることを確認します。60秒自動更新は保存済みスナップショットを再取得するだけで、集計処理自体は行いません。

## 自動更新確認

1. `もるくえ！` -> `⑤ 自動更新` -> `⑤-1 集計・モニター自動更新を有効化` を実行します。
2. 通常は5分程度にします。1分更新は短時間のテスト時だけにします。
3. `⑤-3 自動更新の状態を表示` で、`AUTO_REBUILD_CACHE_ENABLED=true`、トリガー数、モニターキャッシュ更新時刻、生徒画面が常時高速ルートで動く旨を確認します。
4. 時間トリガー実行後に、`モニターキャッシュ` の更新時刻が変わることを確認します。
5. `⑤-2 集計・モニター自動更新を停止` を実行します。
6. 停止後、該当トリガーが残らないことを確認します。
7. 授業後や不要時は自動更新を停止します。
8. `AUTO_REBUILD_CACHE_ENABLED=false` の状態でトリガーが残っていても、重い集計処理をスキップすることをログで確認します。

## 既存機能の回帰確認

次の導線が壊れていないことを確認します。

- 先生用URLの出力
- 教師プレビュー
- `④ 個別対応`
- 選択行のトークン再発行
- 選択行のURL無効化
- 投稿削除=1 のURL無効化とClassroom投稿削除
- Webモニターの表示・履歴参照
- Webモニターの `モニターだけ更新`
- Webモニターの `集計から完全更新`
- Webモニターの `管理スプレッドシートを開く`
- Webモニターの `表示中一覧CSV`
- Admin.html削除済み運用

## 合格基準

- 生徒画面の初回表示と採点が、従来より明らかに軽い。
- 解答ログが欠けない。
- 常時高速ルートで採点レスポンスが正誤、正答、解説を返す。
- `★ 先生用URLを設定シートに出力` 後、通常は `MONITOR_URL` ですぐWebモニターを確認できる。初期作成に失敗してもURL出力は成功する。
- `snapshot-missing` では `モニターだけ更新`、復旧できない場合は `集計から完全更新` が強調表示され、status line で次の操作を判断できる。
- モニターは遅延してもWebモニターの `モニターだけ更新`、`⑨ 集計キャッシュを更新`、Webモニターの `集計から完全更新`、または自動更新で整合する。
- `⑤ 自動更新` のON/OFF/状態表示が使える。
- 先生用URL、教師プレビュー、個別対応が壊れていない。
- 問題があれば実機ログで原因を切り分け、必要に応じて直前の安定デプロイへ戻せる。
- Webモニターの `表示中一覧CSV` は表示中の生徒一覧だけに限定される。解答ログ全履歴CSV、問題タイプ別詳細CSV、分析CSV、苦手傾向分析、苦手傾向Classroom通知は今回の確認対象に含めない。
