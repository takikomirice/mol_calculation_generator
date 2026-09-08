import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

async function loadMonitorHtml() {
  return readFile('Monitor.html', 'utf8');
}

test('monitor screen exposes read-only classroom monitor layout', async () => {
  const html = await loadMonitorHtml();

  assert.match(html, /もるくえ！ モニター/);
  assert.match(html, /id="refreshButton"/);
  assert.match(html, /id="autoRefreshToggle"/);
  assert.doesNotMatch(html, /id="rebuildMonitorSnapshotButton"/);
  assert.doesNotMatch(html, /id="rebuildCachesButton"/);
  assert.match(html, /id="openSpreadsheetButton"/);
  assert.match(html, /id="downloadCsvButton"/);
  assert.match(html, /id="lastUpdatedAt"/);
  assert.match(html, /id="kpiBar"/);
  assert.match(html, /id="studentTable"/);
  assert.match(html, /id="studentBody"/);
  assert.match(html, /id="historyModal"/);
  assert.match(html, /id="searchInput"/);
  assert.match(html, /id="courseFilter"/);
  assert.match(html, /id="statusFilter"/);
  assert.match(html, /id="viewModeSelect"/);
  assert.match(html, /id="followOnlyToggle"/);
  assert.match(html, /id="notStartedOnlyToggle"/);
  assert.doesNotMatch(html, /id="sortSelect"/);

  for (const label of [
    '配付済み',
    'アクセス済み',
    '解答済み',
    '未実施',
    '要フォロー',
    '総解答',
    '直近正答率',
    '自動更新',
    '管理スプレッドシートを開く',
    '表示中一覧CSV',
    '表示',
    'Classroom',
    '番号',
    '氏名',
    '状態',
    '配付',
    'アクセス',
    '解答',
    'レベル別',
    '最終解答',
    '要フォロー理由',
    '履歴'
  ]) {
    assert.match(html, new RegExp(label), `${label} should be visible`);
  }

  assert.match(html, /<thead id="studentHead">/);
});

test('monitor screen defines compact view modes', async () => {
  const html = await loadMonitorHtml();

  assert.match(html, /id="viewModeSelect"/);
  assert.match(html, /<option value="standard" selected>標準<\/option>/);
  assert.match(html, /<option value="follow">フォロー<\/option>/);
  assert.match(html, /<option value="detail">詳細<\/option>/);
  assert.match(html, /<option value="distribution">配付確認<\/option>/);
  assert.match(html, /const DEFAULT_VIEW_MODE = 'standard'/);
  assert.match(html, /const VIEW_MODE_COLUMNS = {/);
  assert.match(html, /standard:\s*\[\s*'number',\s*'name',\s*'status',\s*'attempts',\s*'recentAccuracy',\s*'autoProgress',\s*'lastAnsweredAt',\s*'history'\s*\]/);
  assert.match(html, /follow:\s*\[\s*'number',\s*'name',\s*'status',\s*'followReason',\s*'attempts',\s*'recentAccuracy',\s*'autoProgress',\s*'lastAnsweredAt',\s*'history'\s*\]/);
  assert.match(html, /detail:\s*\[\s*'number',\s*'name',\s*'status',\s*'distribution',\s*'access',\s*'attempts',\s*'recentAccuracy',\s*'levelSummary',\s*'autoProgress',\s*'lastAnsweredAt',\s*'history'\s*\]/);
  assert.match(html, /distribution:\s*\[\s*'number',\s*'name',\s*'courseName',\s*'distribution',\s*'access',\s*'history'\s*\]/);
  assert.match(html, /elements\.viewModeSelect\.addEventListener\('change',/);
});

test('monitor screen keeps number and name sticky during horizontal scroll', async () => {
  const html = await loadMonitorHtml();

  assert.match(html, /\.sticky-number/);
  assert.match(html, /\.sticky-name/);
  assert.match(html, /position:\s*sticky/);
  assert.match(html, /\.sticky-number\s*{[\s\S]*left:\s*0/);
  assert.match(html, /\.sticky-name\s*{[\s\S]*left:\s*var\(--number-column-width\)/);
  assert.match(html, /key:\s*'number'[\s\S]*thClass:\s*'sticky-number'[\s\S]*tdClass:\s*'nowrap num sticky-number'/);
  assert.match(html, /key:\s*'name'[\s\S]*thClass:\s*'sticky-name'[\s\S]*tdClass:\s*'sticky-name'/);
  assert.doesNotMatch(html, /sticky-course/);
  const courseNameColumn = html.match(/key:\s*'courseName'[\s\S]*?render:\s*\(row\) => escapeHtml\(row\.courseName \|\| '-'\)/)?.[0] || '';
  assert.doesNotMatch(courseNameColumn, /sticky/);
});

test('monitor screen supports sortable table headers', async () => {
  const html = await loadMonitorHtml();

  assert.match(html, /sortKey:\s*null/);
  assert.match(html, /state\.sortKey/);
  assert.match(html, /state\.sortDirection/);
  assert.match(html, /function handleSortHeaderClick\(sortKey\)/);
  assert.match(html, /data-sort-key/);
  assert.match(html, /sort-header/);

  for (const [label, key] of [
    ['番号', 'number'],
    ['氏名', 'name'],
    ['状態', 'status'],
    ['配付', 'distribution'],
    ['アクセス', 'access'],
    ['解答', 'attempts'],
    ['直近正答率', 'recentAccuracy'],
    ['最終解答', 'lastAnsweredAt']
  ]) {
    assert.match(html, new RegExp(`label:\\s*'${label}'[\\s\\S]*sortKey:\\s*'${key}'`), `${label} should be sortable by ${key}`);
  }

  assert.match(html, /state\.sortDirection = 'asc'/);
  assert.match(html, /state\.sortDirection = 'desc'/);
  assert.match(html, /state\.sortKey = ''/);
  assert.match(html, /state\.sortDirection = ''/);
  assert.match(html, /▲/);
  assert.match(html, /▼/);
  assert.match(html, /function compareNumberLike\(a, b\)/);
  assert.match(html, /function compareDateTimeWithEmptyLast\(a, b, direction\)/);
  assert.match(html, /localeCompare\(String\(b \|\| ''\), 'ja'\)/);
});

test('monitor screen calls only monitoring and isolated measurement APIs through google.script.run', async () => {
  const html = await loadMonitorHtml();

  assert.match(html, /google\.script\.run/);
  const serverCalls = Array.from(html.matchAll(/runServer\('([^']+)'/g), (match) => match[1]);
  assert.deepEqual(new Set(serverCalls), new Set([
    'refreshMonitorDashboard',
    'getMonitorStudentAnswerReview',
    'getMonitorOperationLinks',
    'getCurrentMonitorStudentProblemTypeStats',
    'prepareMonitorReviewBenchmark',
    'prepareStudentLoadBenchmark',
    'submitStudentLoadBenchmark',
    'finishStudentLoadBenchmark'
  ]));
  assert.equal(serverCalls.some((name) => /csv/i.test(name)), false, 'CSV export should not call a server function');

  for (const forbidden of [
    'refreshClassroomList',
    'refreshStudentsForCheckedCourses',
    'issueTokens',
    'reissueStudentToken',
    'revokeStudentToken',
    'distributeStudentUrls',
    'deleteRequestedClassroomUrlPosts',
    'deleteLatestClassroomUrlDistribution',
    'reinitializeSheets',
    'saveAdminSettings',
    'saveCourseSyncSelection',
    'writeDashboardSnapshot',
    'rebuildAggregateCacheFromMenu',
    'installAggregateMonitorAutoRefreshTriggerFromMenu',
    'uninstallAggregateMonitorAutoRefreshTriggerFromMenu',
    'showAggregateMonitorAutoRefreshStatusFromMenu',
    'rebuildAggregateAndMonitorCacheForTrigger',
    'MonitorSnapshotService',
    'configureWebAppUrlFromMenu',
    'configureClassroomPostTextFromMenu',
    'configureDistributionSettingsFromMenu',
    'configureProblemSettingsFromMenu',
    'showTeacherPreviewUrlForSelectedTokenRowFromMenu',
    'reissueSelectedStudentTokenFromMenu',
    'revokeSelectedStudentTokenFromMenu',
    'openAdminDialog',
    'getAdminDashboardOverview',
    'getAdminLogData',
    'getAdminDashboardData'
  ]) {
    assert.doesNotMatch(html, new RegExp(forbidden), `${forbidden} should not be available on monitor screen`);
  }

  for (const forbidden of [
    'analyzeAnswers',
    'renderAnalytics',
    'analysisDashboard'
  ]) {
    assert.doesNotMatch(html, new RegExp(forbidden, 'i'), `${forbidden} should not be available on monitor screen`);
  }
});

test('monitor screen formats levels and problem types for teachers', async () => {
  const html = await loadMonitorHtml();

  assert.match(html, /function formatLevel\(level\)/);
  assert.doesNotMatch(html, /beginner:\s*'旧初級'/);
  assert.doesNotMatch(html, /intermediate:\s*'中級'/);
  assert.doesNotMatch(html, /advanced:\s*'上級'/);
  assert.match(html, /function formatProblemType\(problemType\)/);
  assert.match(html, /mol_to_mass:\s*'mol→質量'/);
  assert.match(html, /mass_to_mol:\s*'質量→mol'/);
  assert.match(html, /'1':\s*'mol→質量'/);
  assert.match(html, /'14':\s*'質量→モル質量推定'/);
  assert.match(html, /text\.toLowerCase\(\) === 'undefined'/);
  assert.match(html, /return labels\[text\] \|\| text \|\| '-'/);
});

test('monitor screen supports read-only auto refresh without overlapping loads', async () => {
  const html = await loadMonitorHtml();

  assert.match(html, /id="autoRefreshToggle"/);
  assert.match(html, /const AUTO_REFRESH_INTERVAL_MS = 60000/);
  assert.match(html, /setInterval\(refreshFromAutoRefresh, AUTO_REFRESH_INTERVAL_MS\)/);
  assert.match(html, /if \(state\.loading\) return/);
  assert.match(html, /window\.addEventListener\('beforeunload', stopAutoRefresh\)/);
});

test('monitor presents one refresh action and reports actual answer confirmation time', async () => {
  const html = await loadMonitorHtml();
  assert.match(html, /id="refreshButton"/);
  assert.doesNotMatch(html, /rebuildCachesButton|rebuildMonitorSnapshotButton|fullRebuildRecommended/);
  assert.match(html, /answersThrough/);
  assert.match(html, /確認した解答を反映/);
  assert.match(html, /result.processed/);
  assert.match(html, /前回の表示を保持/);
  const load = html.slice(html.indexOf('async function loadDashboard'), html.indexOf('function renderDashboard'));
  assert.doesNotMatch(load, /window.confirm/);
  assert.match(load, /refreshMonitorDashboard/);
  assert.match(load, /refreshButton.disabled = true/);
  assert.match(load, /refreshButton.disabled = false/);
});

test('monitor screen builds visible rows CSV on the client only', async () => {
  const html = await loadMonitorHtml();

  assert.match(html, /function downloadVisibleRowsCsv\(/);
  assert.match(html, /const rows = getFilteredRows\(\)/);
  assert.match(html, /Classroom/);
  assert.match(html, /label: '番号'/);
  assert.match(html, /氏名/);
  assert.match(html, /状態/);
  assert.match(html, /配付/);
  assert.match(html, /アクセス/);
  assert.match(html, /解答数/);
  assert.match(html, /label: '直近正答率'/);
  assert.match(html, /getVisibleColumns\(\)\.filter\(column=>typeof column.csvValue==='function'\)/);
  assert.match(html, /最終解答/);
  assert.match(html, /要フォロー理由/);
  assert.match(html, /'\\ufeff' \+ csvText/);
  assert.match(html, /new Blob\(/);
  assert.match(html, /URL\.createObjectURL/);
  assert.match(html, /const filename = `molque-monitor-\$\{formatCsvTimestamp/);
  assert.match(html, /window\.open\('', '_blank'\)/);
  assert.match(html, /escapeCsvValue/);
  assert.match(html, /replace\(\/"\/g, '""'\)/);
  assert.doesNotMatch(html, /runServer\('[^']*Csv[^']*'/i);
});

test('monitor screen has status badge classes for monitor states', async () => {
  const html = await loadMonitorHtml();

  assert.match(html, /function getStatusBadgeClass\(statusLabel\)/);
  for (const cssClass of [
    'status-undistributed',
    'status-distribution-failed',
    'status-not-accessed',
    'status-not-started',
    'status-follow',
    'status-speed-drop',
    'status-active',
    'status-good',
    'status-advanced'
  ]) {
    assert.match(html, new RegExp(cssClass), `${cssClass} should be defined`);
  }
});

test('monitor screen has no left menu or settings form', async () => {
  const html = await loadMonitorHtml();

  assert.doesNotMatch(html, /side-nav|sidebar|left-menu|nav-button/i);
  assert.doesNotMatch(html, /<form[\s>]/i);
  assert.doesNotMatch(html, /設定を保存|URLをClassroomに配付|トークン再発行|無効化|投稿削除|全初期化/);
});

test('monitor screen keeps level summary in one row and only in detail mode', async () => {
  const html = await loadMonitorHtml();

  assert.match(html, /function levelSummary\(row\)/);
  assert.match(html, /\.join\(' \/ '\)/);
  assert.doesNotMatch(html, /levelSummary\(row\)[\s\S]*<br/i);
  assert.match(html, /detail:\s*\[[^\]]*'levelSummary'[^\]]*\]/);
  assert.doesNotMatch(html, /standard:\s*\[[^\]]*'levelSummary'[^\]]*\]/);
  assert.doesNotMatch(html, /follow:\s*\[[^\]]*'levelSummary'[^\]]*\]/);
  assert.doesNotMatch(html, /distribution:\s*\[[^\]]*'levelSummary'[^\]]*\]/);
});

test('monitor documentation explains classroom-oriented monitor controls', async () => {
  const [readme, operationGuide] = await Promise.all([
    readFile('README.md', 'utf8'),
    readFile('運用手順.md', 'utf8')
  ]);
  const docs = `${readme}\n${operationGuide}`;

  assert.match(docs, /表示モード/);
  assert.match(docs, /番号・氏名/);
  assert.match(docs, /見出しクリック|見出しをクリック/);
  assert.match(docs, /WebモニターURL.*先生用/);
  assert.match(docs, /WebモニターURL.*生徒には共有しない/);
  assert.match(docs, /アクセス範囲.*Webアプリ.*デプロイ設定/);
  assert.match(docs, /更新操作は「更新」1つ/);
  assert.match(docs, /差分集計/);
  assert.match(docs, /通信失敗時[\s\S]*再試行/);
  assert.match(docs, /管理スプレッドシートを開/);
  assert.match(docs, /表示中一覧CSV/);
  assert.match(docs, /解答ログ全履歴CSV|分析CSV/);
  assert.doesNotMatch(docs, new RegExp(['MONITOR', 'ALLOWED', 'EMAILS'].join('_')));
  assert.doesNotMatch(docs, /Webモニターで分析/);
});
