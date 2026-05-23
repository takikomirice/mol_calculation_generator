import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

async function loadAdminHtml() {
  return readFile('Admin.html', 'utf8');
}

async function loadCodeGs() {
  return readFile('Code.gs', 'utf8');
}

function extractFunctionBody(source, functionName) {
  const match = new RegExp(`function\\s+${functionName}\\s*\\(`).exec(source);
  assert.ok(match, `${functionName} should be defined`);
  const start = match.index;
  const braceStart = source.indexOf('{', start);
  assert.notEqual(braceStart, -1, `${functionName} should have a body`);
  let depth = 0;
  for (let index = braceStart; index < source.length; index += 1) {
    const char = source[index];
    if (char === '{') depth += 1;
    if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        return source.slice(braceStart + 1, index);
      }
    }
  }
  assert.fail(`${functionName} body should close`);
}

const ADMIN_ACTION_BUTTON_IDS = [
  'refreshButton',
  'saveSettingsButton',
  'refreshCoursesButton',
  'saveCourseSelectionButton',
  'refreshStudentsButton',
  'issueTokensButton',
  'previewDistributionButton',
  'dryRunButton',
  'distributeButton',
  'retryFailedButton',
  'aggregateButton',
  'confirmOkButton'
];

test('admin screen exposes setup, classroom, token, distribution, progress, and log regions', async () => {
  const html = await loadAdminHtml();

  assert.match(html, /<h1>もるくえ！ 管理ダッシュボード<\/h1>/);

  for (const id of [
    'dashboardPanel',
    'setupPanel',
    'webAppUrlInput',
    'postTextTemplateInput',
    'dryRunToggle',
    'adaptiveProblemSelectionToggle',
    'batchSizeInput',
    'beginnerAvogadroInput',
    'intermediateAvogadroInput',
    'advancedAvogadroInput',
    'beginnerToleranceInput',
    'intermediateToleranceInput',
    'advancedToleranceInput',
    'classroomPanel',
    'courseSearchInput',
    'courseBody',
    'studentSearchInput',
    'studentBody',
    'tokenPanel',
    'tokenSearchInput',
    'tokenBody',
    'distributionModeBadge',
    'distributionProgress',
    'distributionLogBody',
    'summarySearchInput',
    'dashboardSortFilter',
    'summaryNotStartedOnlyToggle',
    'summaryFollowOnlyToggle',
    'summaryBody',
    'answerHistoryModal',
    'answerHistoryTitle',
    'answerHistoryTrend',
    'answerProblemTypeStatsBody',
    'answerHistoryBody',
    'answerLogBody',
    'runLogBody',
    'confirmModal'
  ]) {
    assert.match(html, new RegExp(`id="${id}"`), `${id} should exist`);
  }

  for (const removedId of [
    'adminTokenInput',
    'adminTokenBadge',
    'adminTokenStatus'
  ]) {
    assert.doesNotMatch(html, new RegExp(`id="${removedId}"`), `${removedId} should not be visible or editable`);
  }
});

test('admin screen opens on the dashboard and demotes execution panels to advanced operations', async () => {
  const html = await loadAdminHtml();

  assert.match(html, /class="flow-button active"[^>]+data-panel="dashboardPanel"/);
  assert.match(html, /id="dashboardPanel" class="panel panel-screen is-active"/);
  assert.match(html, /id="setupPanel" class="panel panel-screen" hidden/);
  assert.match(html, /高度な操作/);

  const dashboardIndex = html.indexOf('実施状況ダッシュボード');
  const advancedIndex = html.indexOf('高度な操作');
  const classroomIndex = html.indexOf('Classroom一覧取得');
  const tokenIndex = html.indexOf('トークン発行');
  assert.ok(dashboardIndex >= 0, 'dashboard heading should exist');
  assert.ok(advancedIndex > dashboardIndex, 'advanced operation group should appear after the dashboard route');
  assert.ok(classroomIndex > advancedIndex, 'Classroom execution should be under advanced operations');
  assert.ok(tokenIndex > advancedIndex, 'token execution should be under advanced operations');

  assert.match(html, /スプレッドシートメニュー/);
  assert.match(html, /DRY_RUN/);
  assert.match(html, /本送信/);
  assert.match(html, /要フォロー/);
  assert.match(html, /未実施/);
});

test('admin dashboard exposes requested metrics, student columns, and follow-up filters', async () => {
  const html = await loadAdminHtml();

  for (const id of [
    'answeredStudentCount',
    'dashboardNotStartedCount',
    'totalAnswerCount',
    'recent10AverageAccuracy',
    'beginnerAnswerCount',
    'intermediateAnswerCount',
    'advancedAnswerCount',
    'followUpStudentCount'
  ]) {
    assert.match(html, new RegExp(`id="${id}"`), `${id} should exist`);
  }

  for (const label of [
    '解答済み人数',
    '未実施人数',
    '総解答数',
    '直近10問平均正答率',
    '初級/中級/上級',
    '要フォロー'
  ]) {
    assert.match(html, new RegExp(label), `${label} should be visible`);
  }

  for (const removedId of [
    'distributedStudentCount',
    'accessedStudentCount',
    'averageAccuracy',
    'speedImprovedStudentCount',
    'courseCount',
    'checkedCourseCount',
    'retiredStudentCount',
    'tokenCount',
    'revokedTokenCount'
  ]) {
    assert.doesNotMatch(html, new RegExp(`id="${removedId}"`), `${removedId} should not be in the top metrics`);
  }

  for (const removedLabel of [
    '配付済み人数',
    'アクセス済み人数',
    '配付失敗数',
    'Classroom',
    '有効トークン',
    '退籍',
    '速度改善人数',
    '速度改善'
  ]) {
    assert.doesNotMatch(html, new RegExp(`<div class="metric-label">${removedLabel}</div>`), `${removedLabel} card should not exist`);
  }

  for (const header of [
    'クラス',
    '氏名',
    '状態',
    '解答数',
    'レベル別',
    '初級正答率',
    '中級正答率',
    '上級正答率',
    '直近正答率',
    '現在の平均速度',
    '最終解答日時',
    '履歴',
  ]) {
    assert.match(html, new RegExp(`<th>${header}</th>`), `${header} column should exist`);
  }

  for (const removedHeader of [
    '出席番号',
    '配付状態',
    'アクセス状態',
    '直近10問平均時間',
    '初期比速度改善率'
  ]) {
    assert.doesNotMatch(html, new RegExp(`<th>${removedHeader}</th>`), `${removedHeader} column should not exist`);
  }

  assert.match(html, /id="summaryCourseFilter"/);
  assert.match(html, /id="summaryNotStartedOnlyToggle"/);
  assert.match(html, /id="summaryFollowOnlyToggle"/);
  assert.match(html, /id="dashboardSortFilter"/);
  assert.match(html, /直近10問正答率が低い順/);
  assert.match(html, /解答数が少ない順/);
  assert.match(html, /最終解答が古い順/);
  assert.doesNotMatch(html, /speedImprovementDesc/);
  assert.doesNotMatch(html, /速度改善が大きい順/);
});

test('admin dashboard top metrics are limited to answer-status cards', async () => {
  const html = await loadAdminHtml();
  const renderMetricsBody = extractFunctionBody(html, 'renderMetrics');

  for (const [label, id] of [
    ['解答済み人数', 'answeredStudentCount'],
    ['未実施人数', 'dashboardNotStartedCount'],
    ['総解答数', 'totalAnswerCount'],
    ['直近10問平均正答率', 'recent10AverageAccuracy'],
    ['要フォロー人数', 'followUpStudentCount'],
  ]) {
    assert.match(
      html,
      new RegExp(`<div class="metric-label">${label}</div>[\\s\\S]*id="${id}" class="metric-value"`),
      `${label} should be visible as a primary metric card`
    );
  }

  assert.match(
    html,
    /<div class="metric-label">初級\/中級\/上級の解答数<\/div>[\s\S]*id="beginnerAnswerCount"[\s\S]*id="intermediateAnswerCount"[\s\S]*id="advancedAnswerCount"/,
    'level answer counts should share one primary metric card'
  );
  assert.match(html, /未実施・低正答率・解答数不足/);
  assert.match(html, /\.metrics\s*\{[\s\S]*?grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(renderMetricsBody, /elements\.totalAnswerCount\.textContent = String\(metrics\.totalAnswers \|\| 0\)/);
  assert.doesNotMatch(renderMetricsBody, /distributedStudentCount/);
  assert.doesNotMatch(renderMetricsBody, /accessedStudentCount/);
  assert.doesNotMatch(renderMetricsBody, /speedImprovedStudentCount/);
  assert.doesNotMatch(renderMetricsBody, /courseCount/);
  assert.doesNotMatch(renderMetricsBody, /retiredStudentCount/);
  assert.doesNotMatch(renderMetricsBody, /tokenCount/);
  assert.doesNotMatch(renderMetricsBody, /distributionFailedCount/);
});

test('admin progress table shows compact per-level correct counts and separate accuracy columns', async () => {
  const html = await loadAdminHtml();

  assert.match(html, /<th>レベル別<\/th>/);
  assert.match(html, /<th>初級正答率<\/th>/);
  assert.match(html, /<th>中級正答率<\/th>/);
  assert.match(html, /<th>上級正答率<\/th>/);
  assert.match(html, /function formatLevelLabel/);
  assert.match(html, /function formatLevelLine/);
  assert.match(html, /function formatAccuracyOrDash/);
  assert.match(html, /beginner:\s*'初級'/);
  assert.match(html, /intermediate:\s*'中級'/);
  assert.match(html, /advanced:\s*'上級'/);
  assert.match(html, /row\.beginnerCorrect/);
  assert.match(html, /row\.beginnerAttempts/);
  assert.match(html, /row\.beginnerAccuracy/);
  assert.match(html, /row\.intermediateAccuracy/);
  assert.match(html, /row\.advancedAccuracy/);
  assert.doesNotMatch(html, /直近10問:/);
  assert.doesNotMatch(html, /基礎\/標準\/発展/);
});

test('admin progress table renders per-level rows without chip-style nested cards', async () => {
  const html = await loadAdminHtml();

  assert.match(html, /function formatLevelCell/);
  assert.match(html, /class="level-stack"/);
  assert.match(html, /class="level-line"/);
  assert.match(html, /row\.beginnerAttempts/);
  assert.match(html, /row\.intermediateAttempts/);
  assert.match(html, /row\.advancedAttempts/);
  assert.doesNotMatch(html, /function formatLevelCountChip/);
  assert.doesNotMatch(html, /class="level-counts"/);
  assert.doesNotMatch(html, /class="level-accuracy"/);
  assert.doesNotMatch(html, /正答率:/);
});

test('admin dashboard combines distribution access and follow-up into one status column', async () => {
  const html = await loadAdminHtml();

  assert.match(html, /class="toggle-row priority-filter"[\s\S]*id="summaryFollowOnlyToggle"/);
  assert.match(html, /function getUnifiedStatusLabels/);
  assert.match(html, /function formatUnifiedStatusCell/);
  assert.match(html, /配付失敗/);
  assert.match(html, /未アクセス/);
  assert.match(html, /要フォロー/);
  assert.doesNotMatch(html, /summary-status-inline/);
  assert.doesNotMatch(html, /function formatStatusCell/);
});

test('admin progress table shows current average speed as a reference metric without speed-improvement column', async () => {
  const html = await loadAdminHtml();

  assert.match(html, /<th>現在の平均速度<\/th>/);
  assert.match(html, /<th>履歴<\/th>/);
  assert.match(html, /速度は参考値/);
  assert.match(html, /formatElapsedSeconds/);
  assert.match(html, /recent10AverageElapsedMs/);
  assert.match(html, /averageElapsedMs/);
  assert.doesNotMatch(html, /<th>初期比速度改善率<\/th>/);
  assert.doesNotMatch(html, /正答のみ/);
  assert.doesNotMatch(html, /formatImprovementRate/);
});

test('admin screen uses flow buttons to show only one focused panel at a time', async () => {
  const html = await loadAdminHtml();

  for (const panel of ['dashboardPanel', 'logsPanel', 'setupPanel', 'classroomPanel', 'studentRosterPanel', 'tokenPanel', 'distributionPanel']) {
    assert.match(html, new RegExp(`data-panel="${panel}"`), `${panel} should have a flow button`);
  }

  assert.match(html, /class="flow-button active"[^>]+data-panel="dashboardPanel"/);
  assert.match(html, /id="dashboardPanel" class="panel panel-screen is-active"/);
  assert.match(html, /id="classroomPanel" class="panel panel-screen" hidden/);
  assert.match(html, /function showPanel/);
  assert.match(html, /state\.activePanel/);
  assert.doesNotMatch(html, /workflow-card/);
});

test('admin tables are redesigned to fit inside the panel without wide two-column layouts', async () => {
  const html = await loadAdminHtml();

  assert.doesNotMatch(html, /class="grid-2"/);
  assert.doesNotMatch(html, /min-width:\s*760px/);
  assert.match(html, /table-layout:\s*fixed/);
  assert.match(html, /word-break:\s*break-word/);
  assert.match(html, /col class="col-student"/);
  assert.match(html, /col class="col-actions"/);
});

test('admin summary table keeps many columns readable with horizontal scrolling', async () => {
  const html = await loadAdminHtml();

  assert.match(html, /overflow-x:\s*auto/);
  assert.match(html, /class="summary-table"/);
  assert.match(html, /\.app-shell\s*\{[\s\S]*?min-width:\s*0/);
  assert.match(html, /\.layout\s*\{[\s\S]*?grid-template-columns:\s*240px minmax\(0,\s*1fr\)/);
  assert.match(html, /\.main\s*\{[\s\S]*?min-width:\s*0/);
  assert.match(html, /\.metrics\s*\{[\s\S]*?repeat\(3,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(html, /\.summary-table\s*\{[\s\S]*?min-width:\s*1040px/);
  assert.match(html, /\.summary-table th\s*\{[\s\S]*?white-space:\s*nowrap/);
  assert.doesNotMatch(html, /\.summary-table\s*\{[\s\S]*?min-width:\s*1360px/);
  assert.doesNotMatch(html, /overflow-x:\s*hidden/);
});

test('admin screen uses guarded server calls, failure handlers, filtering, and dangerous confirmations', async () => {
  const html = await loadAdminHtml();

  assert.match(html, /initialAdminToken/);
  assert.doesNotMatch(html, /new URLSearchParams\(window\.location\.search\)/);
  assert.doesNotMatch(html, /params\.get\('admin'\)/);
  assert.doesNotMatch(html, /urlAdminToken/);
  assert.match(html, /withSuccessHandler/);
  assert.match(html, /withFailureHandler/);
  assert.match(html, /showConfirm/);
  assert.match(html, /applyFilters/);

  for (const method of [
    'getAdminDashboardOverview',
    'getAdminLogData',
    'getAdminDistributionPreviewData',
    'getAdminRosterData',
    'getStudentAnswerHistory',
    'getStudentProblemTypeStats',
    'saveAdminSettings',
    'refreshClassroomList',
    'saveCourseSyncSelection',
    'refreshStudentsForCheckedCourses',
    'issueTokensForActiveStudents',
    'reissueStudentToken',
    'revokeStudentToken',
    'dryRunStudentUrlDistribution',
    'distributeStudentUrlsForCheckedCourses',
    'retryFailedStudentUrlDistributions',
    'rebuildAggregateCache'
  ]) {
    assert.match(html, new RegExp(`runServer\\('${method}'`), `${method} should be called through runServer`);
  }
  assert.match(html, /const runner = google\.script\.run/);
  assert.match(html, /runner\[method\]\.apply\(runner, callArgs\)/);
});

test('admin initial load uses the lightweight overview API and lazy-loads heavy panels', async () => {
  const html = await loadAdminHtml();
  const loadBody = extractFunctionBody(html, 'load');
  const showPanelBody = extractFunctionBody(html, 'showPanel');
  const renderLogsBody = extractFunctionBody(html, 'renderLogs');
  const renderDistributionBody = extractFunctionBody(html, 'renderDistribution');

  assert.match(loadBody, /getAdminDashboardOverview/);
  assert.doesNotMatch(loadBody, /getAdminDashboardData/);
  assert.match(showPanelBody, /ensurePanelData\(state\.activePanel\)/);
  assert.match(html, /function loadLogData/);
  assert.match(html, /function loadDistributionPreviewData/);
  assert.match(html, /function loadRosterData/);
  assert.match(renderLogsBody, /ログタブを開くと最新50件を読み込みます/);
  assert.match(renderDistributionBody, /配付対象確認を押してください/);
  assert.doesNotMatch(loadBody, /getStudentAnswerHistory/);
  assert.doesNotMatch(loadBody, /getStudentProblemTypeStats/);
});

test('admin dashboard opens per-student answer history lazily in a modal', async () => {
  const html = await loadAdminHtml();
  const renderSummaryBody = extractFunctionBody(html, 'renderSummary');
  const openHistoryBody = extractFunctionBody(html, 'openAnswerHistory');

  assert.match(html, /id="answerHistoryModal"/);
  assert.match(html, /id="answerHistoryTrend"/);
  assert.match(html, /id="answerProblemTypeStatsBody"/);
  assert.match(html, /id="answerHistoryBody"/);
  assert.match(html, /data-action="history"/);
  assert.match(renderSummaryBody, /data-roster-key="[^']*'\s*\+\s*escapeAttr\(row\.rosterKey\)/);
  assert.match(html, /elements\.summaryBody\.addEventListener\('click'/);
  assert.match(openHistoryBody, /runServer\('getStudentAnswerHistory',\s*\[rosterKey,\s*20\]\)/);
  assert.match(openHistoryBody, /runServer\('getStudentProblemTypeStats',\s*\[rosterKey\]\)/);
  assert.match(openHistoryBody, /state\.answerHistoryByRosterKey/);
  assert.match(openHistoryBody, /state\.problemTypeStatsByRosterKey/);
  assert.match(openHistoryBody, /renderAnswerHistoryModal/);
  assert.match(html, /function renderProblemTypeTrend/);
  assert.match(html, /function renderProblemTypeStats/);
  assert.match(html, /function getProblemTypeStatusLabel/);
  assert.match(html, /mol_to_mass:\s*'mol→質量'/);
  assert.match(html, /mass_to_mol:\s*'質量→mol'/);
  assert.match(html, /mol_to_particles:\s*'mol→粒子数'/);
  assert.match(html, /particles_to_mol:\s*'粒子数→mol'/);
  assert.match(html, /mol_to_gas_volume:\s*'mol→気体体積'/);
  assert.match(html, /gas_volume_to_mol:\s*'気体体積→mol'/);
  assert.match(html, /mass_to_particles:\s*'質量→粒子数'/);
  assert.match(html, /particles_to_mass:\s*'粒子数→質量'/);
  assert.match(html, /mass_to_gas_volume:\s*'質量→気体体積'/);
  assert.match(html, /gas_volume_to_mass:\s*'気体体積→質量'/);
  assert.match(html, /gas_volume_to_particles:\s*'気体体積→粒子数'/);
  assert.match(html, /particles_to_gas_volume:\s*'粒子数→気体体積'/);
  assert.match(html, /atomic_mass_to_atom_mass:\s*'原子量→原子1粒の質量'/);
  assert.match(html, /mass_to_molar_mass_estimate:\s*'分子量・式量推定'/);
  for (const header of ['問題タイプ', 'attempts', 'correct', 'accuracy', 'recentAccuracy', 'averageElapsedMs', 'recentAverageElapsedMs', '状態']) {
    assert.match(html, new RegExp(`<th>${header}</th>`), `${header} problem type stats column should exist`);
  }
  for (const label of ['未実施', '苦手', '時間がかかる', '安定', '得意']) {
    assert.match(html, new RegExp(label), `${label} status label should be available`);
  }
  assert.match(html, /safeServerHtmlOrEscapedText\(row\.questionHtml,\s*row\.questionText\)/);
  assert.match(html, /row\.expectedAnswer/);
  assert.match(html, /row\.submittedAnswer/);
  assert.match(html, /formatElapsedSeconds\(row\.elapsedMs\)/);
  assert.match(html, /badge\(row\.isCorrect \? '正答' : '誤答'/);
});

test('admin settings exposes adaptive problem selection toggle and saves it', async () => {
  const html = await loadAdminHtml();
  const renderSettingsBody = extractFunctionBody(html, 'renderSettings');
  const saveSettingsBody = extractFunctionBody(html, 'saveSettings');

  assert.match(html, /id="adaptiveProblemSelectionToggle"/);
  assert.match(html, /履歴に応じて問題タイプを調整する/);
  assert.match(renderSettingsBody, /elements\.adaptiveProblemSelectionToggle\.checked = settings\.adaptiveProblemSelection !== false/);
  assert.match(saveSettingsBody, /adaptiveProblemSelection:\s*elements\.adaptiveProblemSelectionToggle\.checked/);
});

test('admin lazy loaders share in-flight requests and tab clicks handle load failures', async () => {
  const html = await loadAdminHtml();
  const showPanelBody = extractFunctionBody(html, 'showPanel');
  const distributionLoaderBody = extractFunctionBody(html, 'loadDistributionPreviewData');
  const previewDistributionBody = extractFunctionBody(html, 'previewDistribution');

  assert.match(html, /loadingPromises:\s*\{/);
  assert.match(distributionLoaderBody, /state\.loadingPromises\.distribution/);
  assert.match(distributionLoaderBody, /return state\.loadingPromises\.distribution/);
  assert.match(distributionLoaderBody, /state\.loadingPromises\.distribution = null/);
  assert.match(previewDistributionBody, /await loadDistributionPreviewData\(\{ force: true \}\)/);
  assert.match(previewDistributionBody, /return \(getDashboard\(\)\.distributionPreview \|\| null\)/);
  assert.match(showPanelBody, /try\s*\{/);
  assert.match(showPanelBody, /catch\s*\(error\)/);
  assert.match(showPanelBody, /setStatus\(error\.message \|\| String\(error\), 'error'\)/);
});

test('admin answer logs render level labels in Japanese', async () => {
  const html = await loadAdminHtml();

  assert.match(html, /function formatLevelLabel/);
  assert.match(html, /formatLevelLabel\(row\.level\)/);
  assert.match(html, /beginner:\s*'初級'/);
  assert.match(html, /intermediate:\s*'中級'/);
  assert.match(html, /advanced:\s*'上級'/);
});

test('admin answer logs can render safe question html without trusting arbitrary html', async () => {
  const html = await loadAdminHtml();
  const renderLogsBody = extractFunctionBody(html, 'renderLogs');

  assert.match(html, /function isSafeServerHtml/);
  assert.match(html, /function safeServerHtmlOrEscapedText/);
  assert.match(html, /tagName !== 'SUB'/);
  assert.match(renderLogsBody, /row\.questionHtml/);
  assert.match(renderLogsBody, /safeServerHtmlOrEscapedText\(row\.questionHtml,\s*row\.questionText/);
  assert.match(html, /<th>問題<\/th>/);
  assert.match(html, /<th>正答<\/th>/);
  assert.match(html, /<th>生徒解答<\/th>/);
  assert.match(html, /<tbody id="answerLogBody"><tr><td colspan="7"/);
  assert.doesNotMatch(renderLogsBody, /row\.questionHtml\s*\|\|\s*escapeHtml/);
});

test('admin screen exposes and wires all execution buttons', async () => {
  const html = await loadAdminHtml();

  for (const id of ADMIN_ACTION_BUTTON_IDS) {
    assert.match(html, new RegExp(`id="${id}"`), `${id} should exist`);
    assert.match(html, new RegExp(`elements\\.${id}\\.addEventListener\\('click'`), `${id} should have a click listener`);
  }

  assert.match(html, /data-action="reissue"/);
  assert.match(html, /data-action="revoke"/);
  assert.match(html, /elements\.tokenBody\.addEventListener\('click'/);
});

test('admin actions share busy guard and disable execution buttons', async () => {
  const html = await loadAdminHtml();

  assert.match(html, /function setBusy\(isBusy, message\)/);
  assert.match(html, /function withBusy\(label, task, runningMessage\)/);
  assert.match(html, /function disableActionButtons\(isBusy\)/);

  for (const id of ADMIN_ACTION_BUTTON_IDS) {
    assert.match(html, new RegExp(`'${id}'`), `${id} should be in the shared action button list`);
  }

  const withBusyBody = extractFunctionBody(html, 'withBusy');
  assert.match(withBusyBody, /if\s*\(state\.busy\)\s*return null/);
  assert.match(withBusyBody, /setBusy\(true,\s*label \+ 'を実行中\.\.\.'\)/);
  assert.match(withBusyBody, /setBusy\(false\)/);

  for (const functionName of ['runAction', 'saveSettings', 'previewDistribution']) {
    assert.match(extractFunctionBody(html, functionName), /withBusy\(/, `${functionName} should use withBusy`);
  }

  const dangerousBody = extractFunctionBody(html, 'runDangerousDistribution');
  assert.match(dangerousBody, /if\s*\(state\.busy\)\s*return null/);
  assert.match(dangerousBody, /elements\.confirmOkButton\.disabled = true/);
  assert.match(extractFunctionBody(html, 'closeConfirm'), /confirmResolver = null/);
  assert.match(html, /if\s*\(state\.busy\)\s*return;\s*const action = button\.dataset\.action/);
});

test('admin action feedback uses concrete running messages and count-aware completion messages', async () => {
  const html = await loadAdminHtml();

  for (const message of [
    'Classroom一覧取得中',
    '生徒名簿取得中',
    'トークン発行中',
    '配付対象確認中',
    'URL配付中',
    '集計更新中'
  ]) {
    assert.match(html, new RegExp(message), `${message} should be shown while an operation is running`);
  }

  assert.match(html, /function getActionRunningMessage/);
  assert.match(html, /function formatActionResultMessage/);
  assert.match(html, /processedCount/);
  assert.match(html, /successCount/);
  assert.match(html, /errorCount/);
  assert.match(html, /処理 /);
  assert.match(html, /成功 /);
  assert.match(html, /失敗 /);
});

test('admin execution function names exist in Code.gs', async () => {
  const code = await loadCodeGs();

  for (const functionName of [
    'getAdminDashboardOverview',
    'getAdminLogData',
    'getAdminDistributionPreviewData',
    'getAdminRosterData',
    'getStudentAnswerHistory',
    'getStudentProblemTypeStats',
    'getAdminDashboardData',
    'getAdminDashboardState',
    'saveAdminSettings',
    'refreshClassroomList',
    'saveCourseSyncSelection',
    'refreshStudentsForCheckedCourses',
    'issueTokensForActiveStudents',
    'reissueStudentToken',
    'revokeStudentToken',
    'dryRunStudentUrlDistribution',
    'distributeStudentUrlsForCheckedCourses',
    'retryFailedStudentUrlDistributions',
    'rebuildAggregateCache'
  ]) {
    assert.match(code, new RegExp(`function ${functionName}\\(`), `${functionName} should exist`);
  }
});

test('spreadsheet menu is the official route for heavy operations and reports results with alerts', async () => {
  const code = await loadCodeGs();

  for (const label of [
    '管理シートを作成・補修',
    'Classroom一覧を取得',
    '生徒名簿を取得',
    'トークンを発行',
    '配付対象を確認',
    'DRY_RUNでURL配付確認',
    'URLをClassroomに配付',
    '失敗分を再送',
    '集計キャッシュを更新',
    '管理ダッシュボードを開く'
  ]) {
    assert.match(code, new RegExp(label), `${label} should be in the spreadsheet menu`);
  }

  for (const functionName of [
    'setupSheetsFromMenu',
    'refreshClassroomListFromMenu',
    'refreshStudentsForCheckedCoursesFromMenu',
    'issueTokensForActiveStudentsFromMenu',
    'previewDistributionTargetsFromMenu',
    'dryRunStudentUrlDistributionFromMenu',
    'distributeStudentUrlsForCheckedCoursesFromMenu',
    'retryFailedStudentUrlDistributionsFromMenu',
    'rebuildAggregateCacheFromMenu'
  ]) {
    const body = extractFunctionBody(code, functionName);
    assert.match(body, /runMenuOperation_\(/, `${functionName} should use the menu operation wrapper`);
  }

  assert.match(code, /SpreadsheetApp\.getUi\(\)\.alert/);
  assert.match(code, /appendRunLog/);
});

test('spreadsheet menu omits admin entry URL issuer and admin route points users back to the spreadsheet menu', async () => {
  const code = await loadCodeGs();

  const menuBody = extractFunctionBody(code, 'molDrillOnOpen');
  assert.doesNotMatch(menuBody, /管理画面URLを発行・表示|showAdminEntryUrlFromMenu/);
  assert.match(menuBody, /addSubMenu/);
  assert.match(menuBody, /管理シートを作成・補修/);
  assert.match(menuBody, /管理データを全削除して初期状態に戻す/);

  assert.doesNotMatch(code, /function showAdminEntryUrlFromMenu\(/);
  assert.doesNotMatch(code, /function showAdminEntryUrlDialog_\(/);
  assert.doesNotMatch(code, /buildAdminEntryUrl\(/);
  assert.doesNotMatch(code, /admin=\$\{encodeURIComponent\(normalizedToken\)\}/);
  const doGetBody = extractFunctionBody(code, 'doGet');
  assert.doesNotMatch(doGetBody, /createTemplateFromFile\('Admin'\)/);
  assert.match(doGetBody, /管理画面はスプレッドシートの/);
  assert.match(doGetBody, /もるくえ！/);
});

test('admin token table separates URL display from teacher preview', async () => {
  const html = await loadAdminHtml();

  assert.match(html, /data-action="url"[\s\S]*>URL表示<\/button>/);
  assert.match(html, /data-action="teacherPreview"/);
  assert.match(html, /教師プレビュー/);
  assert.match(html, /buildTeacherStudentPreviewUrl/);
  assert.match(html, /window\.open\(previewUrl,\s*'_blank'/);
});

test('admin token table keeps only student, status, and action columns', async () => {
  const html = await loadAdminHtml();
  const renderTokensBody = extractFunctionBody(html, 'renderTokens');

  assert.match(html, /<thead><tr><th>生徒<\/th><th>状態<\/th><th>操作<\/th><\/tr><\/thead>/);
  assert.doesNotMatch(html, /<th>URL \/ token<\/th>/);
  assert.match(html, /<tbody id="tokenBody"><tr><td colspan="3" class="empty">トークンは未発行です。<\/td><\/tr><\/tbody>/);
  assert.match(renderTokensBody, /emptyRow\(3,\s*'トークン詳細を読み込んでいます。'\)/);
  assert.match(renderTokensBody, /emptyRow\(3,\s*'トークンタブを開くと詳細を読み込みます。'\)/);
  assert.match(renderTokensBody, /emptyRow\(3,\s*'条件に一致するトークンはありません。'\)/);
  assert.doesNotMatch(renderTokensBody, /class="wrap"/);
  assert.doesNotMatch(renderTokensBody, /shortToken\(row\.token\)/);
});

test('admin token actions show and copy student URLs without listing the token string', async () => {
  const html = await loadAdminHtml();
  const renderTokensBody = extractFunctionBody(html, 'renderTokens');
  const copyHelperBody = extractFunctionBody(html, 'copyTextToClipboard');

  assert.match(renderTokensBody, /const primaryActions = teacherPreviewButton \+ copyUrlButton/);
  assert.match(renderTokensBody, /const menuActions = urlButton \+ reissueButton \+ revokeButton \+ redistributeButton/);
  assert.match(renderTokensBody, /aria-expanded="false"/);
  assert.match(renderTokensBody, /role="menu"/);
  assert.match(renderTokensBody, /role="menuitem"/);

  for (const [action, label] of [
    ['copyUrl', 'URLコピー'],
    ['teacherPreview', '教師プレビュー']
  ]) {
    assert.match(renderTokensBody, new RegExp(`data-action="${action}"[\\s\\S]*>${label}<\\/button>`), `${label} should be a primary action`);
  }

  for (const [action, label] of [
    ['url', 'URL表示'],
    ['reissue', '再発行'],
    ['revoke', '無効化'],
    ['redistributeStudent', 'この生徒に再配付']
  ]) {
    assert.match(renderTokensBody, new RegExp(`role="menuitem"[\\s\\S]*data-action="${action}"[\\s\\S]*>${label}<\\/button>`), `${label} should be in the more menu`);
  }

  assert.match(renderTokensBody, /data-url="'\s*\+\s*escapeAttr\(row\.studentUrl\)/);
  assert.match(html, /function showStudentUrlDialog/);
  assert.match(html, /showStudentUrlDialog\(button\.dataset\.url \|\| ''\)/);
  assert.match(html, /copyTextToClipboard\(button\.dataset\.url \|\| ''\)/);
  assert.match(html, /コピーしました。/);
  assert.match(html, /if \(action === 'reissue'\) \{[\s\S]*?confirmLabel: '再発行',\s*danger: false/);
  assert.match(html, /if \(action === 'revoke'\) \{[\s\S]*?confirmLabel: '無効化',\s*danger: true/);
  assert.match(copyHelperBody, /navigator\.clipboard\.writeText/);
  assert.match(copyHelperBody, /document\.execCommand\('copy'\)/);
  assert.doesNotMatch(renderTokensBody, /'<td class="wrap">/);
});

test('admin token more menu closes on outside click, escape, and action execution', async () => {
  const html = await loadAdminHtml();
  const tokenClickHandler = html.slice(html.indexOf("elements.tokenBody.addEventListener('click'"));

  assert.match(html, /function closeTokenActionMenus/);
  assert.match(html, /function toggleTokenActionMenu/);
  assert.match(html, /document\.addEventListener\('click'/);
  assert.match(html, /document\.addEventListener\('keydown'/);
  assert.match(html, /event\.key === 'Escape'/);
  assert.match(tokenClickHandler, /const moreButton = event\.target\.closest\('\.token-more-button'\)/);
  assert.match(tokenClickHandler, /toggleTokenActionMenu\(moreButton\)/);
  assert.match(tokenClickHandler, /closeTokenActionMenus\(\)/);
});

test('admin token action cell does not force horizontal scrolling', async () => {
  const html = await loadAdminHtml();

  assert.doesNotMatch(html, /\.token-table\s+\.actions-cell\s*\{[\s\S]*?flex-wrap:\s*nowrap[\s\S]*?\}/);
  assert.doesNotMatch(html, /\.token-table\s+\.actions-cell\s*\{[\s\S]*?overflow-x:\s*auto[\s\S]*?\}/);
  assert.match(html, /\.token-table\s+\.actions-cell\s*\{[\s\S]*?overflow-x:\s*visible[\s\S]*?\}/);
});

test('admin distribution panel exposes scoped target controls and builds safe options', async () => {
  const html = await loadAdminHtml();
  const buildOptionsBody = extractFunctionBody(html, 'buildDistributionOptions');
  const confirmMessageBody = extractFunctionBody(html, 'buildDistributionConfirmationMessage');

  for (const id of [
    'distributionTargetModeSelect',
    'distributionCourseSelect',
    'distributionStudentSearchInput',
    'distributionStudentSelect',
    'forceRedistributeToggle',
    'distributionDryRunState',
    'distributionTargetSummary'
  ]) {
    assert.match(html, new RegExp(`id="${id}"`), `${id} should exist`);
    assert.match(html, new RegExp(`elements\\.${id}`), `${id} should be wired`);
  }

  for (const [value, label] of [
    ['pending', '未配付のみ（通常）'],
    ['course', 'Classroom指定'],
    ['student', '生徒指定'],
    ['failed', '失敗分再送']
  ]) {
    assert.match(html, new RegExp(`<option value="${value}">${label}<\\/option>`), `${label} mode should be available`);
  }

  assert.match(html, /強制再配付: 過去に配付済みの生徒にも/);
  assert.match(html, /function renderDistributionTargetControls/);
  assert.match(html, /function getSelectedDistributionCourse/);
  assert.match(html, /function getSelectedDistributionStudent/);
  assert.match(html, /function formatDistributionTargetSummary/);
  assert.match(html, /function buildDistributionOptions/);
  assert.match(buildOptionsBody, /mode === 'pending'[\s\S]*return \{\}/);
  assert.match(buildOptionsBody, /mode === 'course'[\s\S]*courseIds:\s*\[courseId\]/);
  assert.match(buildOptionsBody, /mode === 'student'[\s\S]*rosterKeys:\s*\[rosterKey\]/);
  assert.match(buildOptionsBody, /mode === 'failed'[\s\S]*retryFailedOnly:\s*true/);
  assert.match(buildOptionsBody, /forceRedistribute/);
  assert.doesNotMatch(buildOptionsBody, /forceRedistribute:\s*true[\s\S]*mode === 'pending'/);
  assert.match(confirmMessageBody, /過去に配付済みでも再送します/);
  assert.match(confirmMessageBody, /同期対象Classroom全体の未配付者に送信します/);
  assert.match(confirmMessageBody, /失敗分だけ再送します/);
});

test('admin distribution actions pass scoped options to preview dry-run send and retry', async () => {
  const html = await loadAdminHtml();
  const loaderBody = extractFunctionBody(html, 'loadDistributionPreviewData');
  const previewBody = extractFunctionBody(html, 'previewDistribution');
  const dangerousBody = extractFunctionBody(html, 'runDangerousDistribution');
  const retryBody = extractFunctionBody(html, 'retryFailedDistribution');

  assert.match(loaderBody, /buildDistributionOptions\(\)/);
  assert.match(loaderBody, /runServer\('getAdminDistributionPreviewData',\s*\[previewOptions\]\)/);
  assert.match(previewBody, /await loadDistributionPreviewData\(\{ force: true \}\)/);
  assert.match(dangerousBody, /const baseOptions = buildDistributionOptions\(\)/);
  assert.match(dangerousBody, /Object\.assign\(\{\},\s*baseOptions,\s*\{ dryRun: method === 'dryRunStudentUrlDistribution' \}\)/);
  assert.match(dangerousBody, /buildDistributionConfirmationMessage\(method,\s*baseOptions\)/);
  assert.match(dangerousBody, /return runAction\(method,\s*label,\s*\[options\]\)/);
  assert.match(retryBody, /retryFailedOnly:\s*true/);
  assert.match(retryBody, /forceRedistribute:\s*false/);
});

test('admin distribution option validation errors are caught and shown in status', async () => {
  const html = await loadAdminHtml();
  const loaderBody = extractFunctionBody(html, 'loadDistributionPreviewData');
  const dangerousBody = extractFunctionBody(html, 'runDangerousDistribution');
  const retryBody = extractFunctionBody(html, 'retryFailedDistribution');

  assert.match(loaderBody, /try\s*\{[\s\S]*const previewOptions = buildDistributionOptions\(\)/);
  assert.match(loaderBody, /catch\s*\(error\)\s*\{[\s\S]*setStatus\(error\.message \|\| String\(error\), 'error'\)/);
  assert.match(dangerousBody, /try\s*\{[\s\S]*const baseOptions = buildDistributionOptions\(\)/);
  assert.match(dangerousBody, /catch\s*\(error\)\s*\{[\s\S]*setStatus\(error\.message \|\| String\(error\), 'error'\)/);
  assert.match(dangerousBody, /return null/);
  assert.match(retryBody, /try\s*\{[\s\S]*buildDistributionOptions\(\)/);
  assert.match(retryBody, /catch\s*\(error\)\s*\{[\s\S]*setStatus\(error\.message \|\| String\(error\), 'error'\)/);
});

test('admin distribution student select preserves current selection outside the 200 result window', async () => {
  const html = await loadAdminHtml();
  const controlsBody = extractFunctionBody(html, 'renderDistributionTargetControls');

  assert.match(controlsBody, /const allStudentRows = getTokenRowsWithMissing\(\)/);
  assert.match(controlsBody, /let studentRows = allStudentRows\.filter/);
  assert.match(controlsBody, /\.slice\(0,\s*200\)/);
  assert.match(controlsBody, /const selectedStudentRow = selectedStudent/);
  assert.match(controlsBody, /!studentRows\.some\(function \(row\)/);
  assert.match(controlsBody, /studentRows = studentRows\.concat\(\[selectedStudentRow\]\)/);
  assert.match(controlsBody, /elements\.distributionStudentSelect\.value = selectedStudent \|\| ''/);
});

test('admin token reissue flow can select one student for forced redistribution', async () => {
  const html = await loadAdminHtml();
  const renderTokensBody = extractFunctionBody(html, 'renderTokens');
  const tokenClickHandler = html.slice(html.indexOf("elements.tokenBody.addEventListener('click'"));
  const selectStudentBody = extractFunctionBody(html, 'selectStudentForRedistribution');

  assert.match(renderTokensBody, /data-action="redistributeStudent"[\s\S]*>この生徒に再配付<\/button>/);
  assert.match(renderTokensBody, /data-roster-key="'\s*\+\s*escapeAttr\(row\.rosterKey\)/);
  assert.match(tokenClickHandler, /action === 'redistributeStudent'/);
  assert.match(tokenClickHandler, /selectStudentForRedistribution\(button\.dataset\.rosterKey/);
  assert.match(tokenClickHandler, /if \(ok\) \{[\s\S]*await runAction\('reissueStudentToken'[\s\S]*selectStudentForRedistribution/);
  assert.match(selectStudentBody, /distributionTargetModeSelect\.value = 'student'/);
  assert.match(selectStudentBody, /distributionStudentSelect\.value = rosterKey/);
  assert.match(selectStudentBody, /forceRedistributeToggle\.checked = true/);
  assert.match(selectStudentBody, /showPanel\('distributionPanel'\)/);
  assert.match(selectStudentBody, /DRY_RUNまたは本送信を実行してください/);
});
