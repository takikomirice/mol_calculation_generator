import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

async function readText(path) {
  return readFile(path, 'utf8');
}

function assertIncludesAll(source, patterns, label) {
  for (const pattern of patterns) {
    assert.match(source, pattern, `${label} should mention ${pattern}`);
  }
}

function legacyStudentRouteSettingKeyForTest() {
  return ['STUDENT', 'FAST', 'MODE'].join('_');
}

function legacyMonitorEmailSettingKeyForTest() {
  return ['MONITOR', 'ALLOWED', 'EMAILS'].join('_');
}

function legacyStudentRuntimeFieldNameForTest() {
  return ['student', 'Fast', 'Mode'].join('');
}

function legacyStudentRuntimeAccessorNameForTest() {
  return ['isStudent', 'FastMode', 'Enabled'].join('');
}

function extractFunctionBody(source, functionName) {
  const match = new RegExp(`static\\s+${functionName}\\s*\\(`).exec(source)
    || new RegExp(`async\\s+function\\s+${functionName}\\s*\\(`).exec(source)
    || new RegExp(`function\\s+${functionName}\\s*\\(`).exec(source);
  assert.ok(match, `${functionName} should be defined`);
  const braceStart = source.indexOf('{', match.index);
  assert.notEqual(braceStart, -1, `${functionName} should have a body`);
  let depth = 0;
  for (let index = braceStart; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    if (source[index] === '}') {
      depth -= 1;
      if (depth === 0) {
        return source.slice(braceStart + 1, index);
      }
    }
  }
  assert.fail(`${functionName} body should close`);
}

test('performance-sensitive paths keep maintainer comments explaining the avoided heavy reads', async () => {
  const code = await readText('Code.gs');

  assert.match(extractFunctionBody(code, 'findToken'), /全行読み込みを避け/);
  assert.match(extractFunctionBody(code, 'recordTokenAccess'), /1セル更新/);
  assert.match(extractFunctionBody(code, 'readAnswerLogsForRosterKey'), /生徒別/);
  assert.match(extractFunctionBody(code, 'readLatestRowsAsObjects_'), /末尾行だけ/);
  assert.match(extractFunctionBody(code, 'recordStudentAccess_'), /lastAccessedAt.*スロットリング/);
  assert.match(extractFunctionBody(code, 'submitAnswer'), /同じattemptId/);
});

test('current teacher docs describe one refresh action, incremental progress and recovery', async () => {
  const docs = (await readText('README.md')) + (await readText('運用手順.md'));
  assertIncludesAll(docs, [
    /更新操作は「更新」1つ/, /差分集計/, /500行ずつ/, /進捗/, /再試行/,
    /⑨ 集計キャッシュを更新/, /モニターキャッシュ/, /JSON/, /直接編集しない/,
    /確認ダイアログは出しません/, /生徒の解答ログ保存処理は変更していません/,
    /表示中一覧CSV/, /各管理シート/, /自動更新/, /60秒/
  ], 'single refresh docs');
  assert.doesNotMatch(docs, /モニターだけ更新|集計から完全更新|再取得するだけで、集計処理自体は行いません/);
});

test('teacher docs identify source data and distinguish monitor refresh from full repair', async () => {
  const docs = (await readText('README.md')) + (await readText('運用手順.md'));
  assertIncludesAll(docs, [/モニターキャッシュ/, /JSONを分割保存/, /途中結果/, /500行ずつ/, /正本データ/, /解答ログ/, /トークン管理/, /生徒名簿/, /配付ログ/, /⑨ 集計キャッシュを更新/, /全履歴から復旧/, /60秒/, /読み込み開始後.*次回の更新/], 'refresh source data');
});

test('teacher-facing docs explain optional aggregate monitor auto refresh operations', async () => {
  const readme = await readText('README.md');
  const guide = await readText('運用手順.md');
  const adminRetirement = await readText('docs/admin-retirement.md');
  const docs = `${readme}\n${guide}\n${adminRetirement}`;

  assertIncludesAll(docs, [
    /⑤ 自動更新[\s\S]*⑤-1 集計・モニター自動更新を有効化/,
    /⑤-2 集計・モニター自動更新を停止/,
    /⑤-3 自動更新の状態を表示/,
    /通常は5分|5分程度/,
    /自動更新[\s\S]*生徒.*採点レスポンス.*別実行/,
    /生徒画面.*常時高速ルート[\s\S]*採点直後.*反映.*遅れる/,
    /すぐ新しい解答[\s\S]*Webモニター[\s\S]*更新/,
    /解答ログから正確[\s\S]*⑨ 集計キャッシュを更新/,
    /Admin\.html[\s\S]*削除済み/,
    /表示中一覧CSV[\s\S]*軽量/,
    /解答ログ全履歴CSV[\s\S]*対象外|分析CSV[\s\S]*対象外/,
    /苦手傾向Classroom通知[\s\S]*今後|今後[\s\S]*苦手傾向Classroom通知/
  ], 'auto refresh docs');

  assert.doesNotMatch(docs, /Webモニターで分析/);
});

test('teacher-facing docs include a pre-merge student runtime verification checklist', async () => {
  const readme = await readText('README.md');
  const guide = await readText('運用手順.md');
  const verification = await readText('docs/student-fast-mode-verification.md');
  const linkedDocs = `${readme}\n${guide}`;

  assertIncludesAll(linkedDocs, [
    /docs\/student-fast-mode-verification\.md/,
    /本番反映|本番GAS/,
    /テスト用GAS|テスト用スプレッドシート/
  ], 'verification doc links');

  assertIncludesAll(verification, [
    /テスト用GAS[\s\S]*テスト用スプレッドシート/,
    /本番GAS[\s\S]*未検証コード[\s\S]*(貼らない|反映しない)/,
    /Code\.gs[\s\S]*Student\.html[\s\S]*Monitor\.html/,
    /スプレッドシート再読み込み/,
    /⓪-1 管理シートを作成・補修/,
    /WEB_APP_URL/,
    /先生用URLを設定シートに出力/,
    /通常\/高速切替設定[\s\S]*存在しない/,
    /TEST_STUDENT_URL/,
    /初回問題表示/,
    /初級[\s\S]*中級[\s\S]*上級/,
    /正誤[\s\S]*正答[\s\S]*解説/,
    /プリフェッチ[\s\S]*skipNextProblem/,
    /initializeStudentSession[\s\S]*elapsedMs/,
    /getPracticeProblem[\s\S]*elapsedMs/,
    /submitAnswer[\s\S]*elapsedMs/,
    /tokenElapsedMs/,
    /tokenCacheReadElapsedMs/,
    /tokenSheetFindElapsedMs/,
    /tokenCacheWriteElapsedMs/,
    /lockElapsedMs/,
    /documentLockWaitAndRunElapsedMs/,
    /duplicateCheckElapsedMs/,
    /appendLogElapsedMs/,
    /appendOnlyElapsedMs/,
    /studentRoute=fast/,
    /aggregatePath=deferred_aggregate_update/,
    /cacheUpdated=false/,
    /problemTypeCacheUpdated=false/,
    /nextProblemIncluded=false/,
    /解答ログ[\s\S]*残る/,
    /常時高速ルート[\s\S]*集計キャッシュ[\s\S]*即時更新されない/,
    /⑨ 集計キャッシュを更新[\s\S]*集計[\s\S]*問題タイプ別[\s\S]*モニターキャッシュ/,
    /MONITOR_URL/,
    /スナップショット/,
    /snapshot-missing/,
    /ライブ構築[\s\S]*行わ/,
    /getMonitorDashboardData elapsedMs/,
    /cacheReadElapsedMs/,
    /sheetReadElapsedMs/,
    /jsonParseElapsedMs/,
    /payloadBytes/,
    /liveFallback=false/,
    /モニターだけ更新/,
    /集計から完全更新/,
    /管理スプレッドシートを開く/,
    /表示中一覧CSV/,
    /⑤-1[\s\S]*ON/,
    /⑤-2[\s\S]*OFF/,
    /⑤-3[\s\S]*状態/,
    /トリガー数/,
    /モニターキャッシュ更新時刻/,
    /該当トリガー[\s\S]*残らない/,
    /安定デプロイ/,
    /先生用URL[\s\S]*教師プレビュー[\s\S]*個別対応/,
    /5分程度/,
    /自動更新[\s\S]*停止/
  ], 'student runtime verification checklist');

  assert.doesNotMatch(verification, new RegExp(legacyStudentRouteSettingKeyForTest()));
  assert.doesNotMatch(verification, new RegExp(legacyMonitorEmailSettingKeyForTest()));
  assert.doesNotMatch(verification, /Webモニターで分析/);
});

test('student runtime verification guide explains real-device log judgment and preview URL boundaries', async () => {
  const verification = await readText('docs/student-fast-mode-verification.md');

  assertIncludesAll(verification, [
    /TEST_STUDENT_URL[\s\S]*\?t=/,
    /TEST_STUDENT_URL[\s\S]*通常.*生徒URL/,
    /TEST_STUDENT_URL[\s\S]*高速化対象/,
    /④-1 選択行の教師プレビューURL[\s\S]*preview=teacher/,
    /教師プレビュー[\s\S]*解答ログ[\s\S]*(保存しない|残さない)/,
    /生徒画面の速度検証[\s\S]*TEST_STUDENT_URL/,
    /教師プレビュー[\s\S]*常時高速ルート検証[\s\S]*(使わない|対象ではない)/,
    /常時高速ルートに乗っている[\s\S]*initializeStudentSession[\s\S]*studentRoute=fast/,
    /accessRecord=skipped_student_runtime/,
    /submitAnswer[\s\S]*studentRoute=fast/,
    /aggregatePath=deferred_aggregate_update/,
    /cacheUpdated=false/,
    /problemTypeCacheUpdated=false/,
    /nextProblemIncluded=false/,
    /古いデプロイ[\s\S]*studentRoute=fast[\s\S]*出ない/,
    /accessRecord=recorded/,
    /cacheUpdated=true/,
    /problemTypeCacheUpdated=true/,
    /モニター更新経路が古い可能性[\s\S]*モニターキャッシュ[\s\S]*更新されない/,
    /初回表示が遅い[\s\S]*initializeStudentSession elapsedMs[\s\S]*tokenElapsedMs[\s\S]*tokenCacheReadElapsedMs[\s\S]*tokenSheetFindElapsedMs[\s\S]*tokenCacheWriteElapsedMs[\s\S]*summaryElapsedMs[\s\S]*adaptiveElapsedMs[\s\S]*problemElapsedMs[\s\S]*studentRoute[\s\S]*accessRecord/,
    /採点が遅い[\s\S]*submitAnswer elapsedMs[\s\S]*storedProblemElapsedMs[\s\S]*gradingElapsedMs[\s\S]*lockElapsedMs[\s\S]*documentLockWaitAndRunElapsedMs[\s\S]*duplicateCheckElapsedMs[\s\S]*appendLogElapsedMs[\s\S]*appendOnlyElapsedMs[\s\S]*aggregateUpdateElapsedMs[\s\S]*problemTypeCacheUpdateElapsedMs[\s\S]*nextProblemElapsedMs[\s\S]*nextProblemIncluded/,
    /モニターが遅い[\s\S]*getMonitorDashboardData[\s\S]*スナップショット/,
    /モニターが遅い[\s\S]*モニターキャッシュ[\s\S]*dashboard/,
    /モニターが遅い[\s\S]*モニターだけ更新[\s\S]*updatedAt/,
    /モニターが遅い[\s\S]*(⑨ 集計キャッシュを更新|集計から完全更新)[\s\S]*キャッシュ/
  ], 'student runtime real-device verification guide');
});

test('teacher-facing docs use times-ten notation instead of e notation examples', async () => {
  const readme = await readText('README.md');
  const guide = await readText('運用手順.md');
  const docs = `${readme}\n${guide}`;

  assert.match(docs, /6\.0×10\^23/);
  assert.match(docs, /6\.02×10\^23/);
  assert.doesNotMatch(docs, /6\.0e23/i);
  assert.doesNotMatch(docs, /6\.02e23/i);
  assert.doesNotMatch(docs, /E\+23/);
});

test('README and operation guide describe menu-first operations without legacy admin screen', async () => {
  const readme = await readText('README.md');
  const guide = await readText('運用手順.md');
  const docs = `${readme}\n${guide}`;

  assertIncludesAll(docs, [
    /初期設定.*同期操作.*onOpenメニュー/,
    /管理シートを作成・補修.*既存データを保持/,
    /不足している列.*自動/,
    /管理データを全削除して初期状態に戻す.*危険操作/,
    /同期対象.*1.*ON.*空欄.*OFF/,
    /通常運用.*Webモニター.*設定シート.*onOpenメニュー.*各管理シート/,
    /先生用URLを設定シートに出力[\s\S]*MONITOR_URL[\s\S]*TEST_STUDENT_URL/,
    /個別対応.*トークン管理[\s\S]*④ 個別対応/
  ], 'docs');

  assert.match(docs, /Admin\.html[\s\S]*削除済み/);
  assert.match(docs, /旧管理画面[\s\S]*(使わず|復活させず)/);
  assert.doesNotMatch(docs, /Admin\.html[^\r\n]*(作成|貼り付け|インストール|開く)/);
  assert.doesNotMatch(docs, /旧管理画面[^\r\n]*(開く|使う|利用する)/);
  assert.doesNotMatch(docs, /旧管理ダッシュボード/);
  assert.doesNotMatch(docs, /管理画面URLを発行/);
  assert.doesNotMatch(docs, /管理者トークン.*(保存|入力|手入力|設定)/);
  assert.doesNotMatch(docs, /管理シートを初期化/);
});

test('README and operation guide describe the teacher web monitor route and deployment-based access control', async () => {
  const readme = await readText('README.md');
  const guide = await readText('運用手順.md');
  const docs = `${readme}\n${guide}`;

  assertIncludesAll(docs, [
    /MONITOR_URL/,
    /TEST_STUDENT_URL/,
    /(MONITOR_URL|Webモニター).*ブックマーク/,
    /表示.*読み取り中心/,
    /更新操作は「更新」1つ/,
    /WebモニターURL.*先生用/,
    /WebモニターURL.*生徒には共有しない/,
    /TEST_STUDENT_URL[\s\S]*Classroomには配付しません/,
    /アクセス範囲.*Webアプリ.*デプロイ設定/,
    /アクセスできるユーザー.*学校|学校.*アクセスできるユーザー/,
    /準備.*設定.*配付.*保守.*もるくえ！.*メニュー/
  ], 'docs');

  assert.doesNotMatch(docs, new RegExp(legacyMonitorEmailSettingKeyForTest()));
});

test('admin retirement inventory document records completed Admin.html removal', async () => {
  const inventory = await readText('docs/admin-retirement.md');

  assertIncludesAll(inventory, [
    /Admin\.html[\s\S]*削除済み/,
    /旧管理画面[\s\S]*削除済み/,
    /openAdminDialog[\s\S]*削除済み/,
    /Webモニター/,
    /onOpenメニュー/,
    /設定シート/,
    /各管理シート/,
    /表示中一覧CSV/,
    /通常.*Webモニター.*設定シート.*onOpenメニュー/,
    /Webモニター[\s\S]*差分集計/,
    /全履歴から復旧[\s\S]*⑨ 集計キャッシュを更新/,
    /解答ログ全履歴CSV[\s\S]*対象外|分析CSV[\s\S]*対象外/,
    /分析CSV[\s\S]*対象外/
  ], 'admin retirement inventory');

  assert.doesNotMatch(inventory, /今回は削除しない/);
  assert.doesNotMatch(inventory, new RegExp(legacyStudentRouteSettingKeyForTest()));
  assert.doesNotMatch(inventory, new RegExp(legacyMonitorEmailSettingKeyForTest()));
});

test('source and docs do not contain removed student runtime toggle identifiers', async () => {
  const sources = await Promise.all([
    readText('Code.gs'),
    readText('README.md'),
    readText('運用手順.md'),
    readText('docs/student-fast-mode-verification.md'),
    readText('docs/admin-retirement.md')
  ]);
  const text = sources.join('\n');

  assert.doesNotMatch(text, new RegExp(legacyStudentRouteSettingKeyForTest()));
  assert.doesNotMatch(text, new RegExp(legacyStudentRuntimeAccessorNameForTest()));
  assert.doesNotMatch(text, new RegExp(legacyStudentRuntimeFieldNameForTest()));
  assert.doesNotMatch(text, new RegExp(legacyMonitorEmailSettingKeyForTest()));
  assert.doesNotMatch(text, new RegExp(['fastMode', 'false'].join('=')));
});

test('admin retirement inventory marks individual legacy actions as moved to menu support', async () => {
  const inventory = await readText('docs/admin-retirement.md');

  assertIncludesAll(inventory, [
    /個別トークン再発行[\s\S]*移管済み[\s\S]*④ 個別対応/,
    /個別トークン無効化[\s\S]*移管済み[\s\S]*④ 個別対応/,
    /教師プレビュー[\s\S]*移管済み[\s\S]*④ 個別対応/,
    /同期対象保存[\s\S]*Classroom一覧[\s\S]*同期対象[\s\S]*直接編集/,
    /設定保存[\s\S]*設定[\s\S]*値[\s\S]*直接編集/,
    /残課題[\s\S]*分析CSV/
  ], 'admin retirement individual support inventory');
});

test('README and operation guide document individual support menu instead of old admin usage', async () => {
  const readme = await readText('README.md');
  const guide = await readText('運用手順.md');
  const docs = `${readme}\n${guide}`;

  assertIncludesAll(docs, [
    /④ 個別対応/,
    /トークン管理[\s\S]*対象行[\s\S]*選択[\s\S]*④-1/,
    /教師プレビュー/,
    /④-2[\s\S]*トークン[\s\S]*再発行/,
    /④-3[\s\S]*URL[\s\S]*無効化/,
    /投稿削除[\s\S]*1[\s\S]*③ 投稿・URL取消/,
    /表示中一覧CSV[\s\S]*軽量|解答ログ全履歴CSV[\s\S]*対象外/
  ], 'docs individual support menu');

  assert.match(docs, /旧管理画面[\s\S]*(使わず|復活させず)/);
  assert.doesNotMatch(docs, /旧管理画面[^\r\n]*(開く|使う|利用する)/);
});

test('README and operation guide describe direct settings sheet editing instead of setup dialog menus', async () => {
  const readme = await readText('README.md');
  const guide = await readText('運用手順.md');
  const docs = `${readme}\n${guide}`;

  assertIncludesAll(docs, [
    /設定[\s\S]*設定[\s\S]*値[\s\S]*直接編集/,
    /説明[\s\S]*列[\s\S]*参考/,
    /⓪ 初期整備・保守[\s\S]*⓪-1 管理シートを作成・補修/,
    /最初の1回[\s\S]*アップデート[\s\S]*列が増えた[\s\S]*シート構成が壊れた/,
    /① Classroom同期[\s\S]*② 生徒URL[\s\S]*(Webモニター|MONITOR_URL)/,
    /POST_TEXT_TEMPLATE[\s\S]*\{\{氏名\}\}[\s\S]*\{\{出席番号\}\}[\s\S]*\{\{Classroom名\}\}[\s\S]*\{\{studentUrl\}\}/,
    /POST_TEXT_TEMPLATE[\s\S]*必ず[\s\S]*\{\{studentUrl\}\}/
  ], 'docs');

  assert.doesNotMatch(docs, /①-2 WebアプリURLを設定/);
  assert.doesNotMatch(docs, /①-3 Classroom投稿文を設定/);
  assert.doesNotMatch(docs, /①-4 配付設定を変更/);
  assert.doesNotMatch(docs, /①-5 出題・採点設定を変更/);
  assert.doesNotMatch(docs, /POST_TEXT_TEMPLATE[\s\S]{0,500}\{\{token\}\}/);
  assert.doesNotMatch(docs, /POST_TEXT_TEMPLATE[\s\S]{0,500}\{\{studentId\}\}/);
  assert.doesNotMatch(docs, /POST_TEXT_TEMPLATE[\s\S]{0,500}\{\{rosterKey\}\}/);
  assert.doesNotMatch(docs, /POST_TEXT_TEMPLATE[\s\S]{0,500}\{\{courseId\}\}/);
});

test('docs describe requested classroom post deletion from token sheet flags and avoid e notation examples', async () => {
  const readme = await readText('README.md');
  const guide = await readText('運用手順.md');
  const docs = `${readme}\n${guide}`;

  assertIncludesAll(docs, [
    /トークン管理[\s\S]*投稿削除[\s\S]*1/,
    /もるくえ！[\s\S]*③ 投稿・URL取消[\s\S]*投稿削除=1 のURLを無効化してClassroom投稿を削除/,
    /対象生徒のURL.*無効化/,
    /対応するClassroom投稿.*削除/,
    /revoked[\s\S]*空欄[\s\S]*有効[\s\S]*済[\s\S]*無効化済み/,
    /既存の 1[\s\S]*TRUE[\s\S]*無効として読み取/,
    /投稿削除[\s\S]*空欄[\s\S]*対象外[\s\S]*1[\s\S]*削除対象[\s\S]*済[\s\S]*投稿削除済み[\s\S]*失敗[\s\S]*投稿削除に失敗[\s\S]*対象なし/,
    /再実行したい場合[\s\S]*投稿削除[\s\S]*1/,
    /チェックボックスではなく/,
    /結果.*トークン管理[\s\S]*配付ログ[\s\S]*実行ログ/,
    /行は削除せず[\s\S]*履歴/,
    /DELETED[\s\S]*DELETE_ERROR[\s\S]*DELETE_SKIPPED/
  ], 'docs');

  assert.doesNotMatch(docs, /revoked`? は `?1`? で無効/);
  assert.doesNotMatch(docs, /直近のClassroom URL配付投稿を削除[\s\S]*通常/);
  assert.doesNotMatch(docs, /6\.02e23/i);
  assert.doesNotMatch(docs, /6\.0e23/i);
  assert.doesNotMatch(docs, /E\+23/);
});

test('operation guide keeps the full classroom regression scenario and in-class monitor reading points', async () => {
  const guide = await readText('運用手順.md');

  assertIncludesAll(guide, [
    /授業前に済ませること/,
    /作成・補修/,
    /Classroom一覧取得/,
    /同期対象保存/,
    /生徒名簿取得/,
    /トークン発行/,
    /DRY_RUN/,
    /URL配付/,
    /生徒URL初回アクセス/,
    /Lv\.0〜Lv\.8/,
    /解答送信/,
    /次の問題/,
    /集計キャッシュ更新/,
    /Webモニター確認|MONITOR_URL.*確認/,
    /授業中に見るべきダッシュボード項目/,
    /要フォロー生徒/,
    /レベル別成績/,
    /重い処理.*授業中.*連打しない/
  ], 'operation guide');
});
