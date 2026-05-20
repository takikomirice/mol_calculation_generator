import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

async function loadAdminHtml() {
  return readFile('Admin.html', 'utf8');
}

test('admin screen exposes setup, classroom, token, distribution, progress, and log regions', async () => {
  const html = await loadAdminHtml();

  for (const id of [
    'setupPanel',
    'webAppUrlInput',
    'adminTokenInput',
    'postTextTemplateInput',
    'dryRunToggle',
    'batchSizeInput',
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
    'summaryBody',
    'answerLogBody',
    'runLogBody',
    'confirmModal'
  ]) {
    assert.match(html, new RegExp(`id="${id}"`), `${id} should exist`);
  }
});

test('admin screen shows the classroom to roster to token to distribution workflow in order', async () => {
  const html = await loadAdminHtml();
  const labels = [
    '1. 初期設定',
    '2. Classroom取得',
    '3. 名簿取得',
    '4. トークン発行',
    '5. URL配付',
    '6. 実施状況確認'
  ];

  let previous = -1;
  for (const label of labels) {
    const index = html.indexOf(label);
    assert.ok(index > previous, `${label} should appear after the previous step`);
    previous = index;
  }

  assert.match(html, /DRY_RUN/);
  assert.match(html, /本送信/);
  assert.match(html, /低正答率/);
  assert.match(html, /未実施/);
});

test('admin screen uses flow buttons to show only one focused panel at a time', async () => {
  const html = await loadAdminHtml();

  for (const panel of ['setupPanel', 'classroomPanel', 'studentRosterPanel', 'tokenPanel', 'distributionPanel', 'summaryPanel', 'logsPanel']) {
    assert.match(html, new RegExp(`data-panel="${panel}"`), `${panel} should have a flow button`);
  }

  assert.match(html, /class="flow-button active"[^>]+data-panel="setupPanel"/);
  assert.match(html, /id="setupPanel" class="panel panel-screen is-active"/);
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

test('admin screen uses guarded server calls, failure handlers, filtering, and dangerous confirmations', async () => {
  const html = await loadAdminHtml();

  assert.match(html, /new URLSearchParams\(window\.location\.search\)/);
  assert.match(html, /params\.get\('admin'\)/);
  assert.match(html, /initialAdminToken/);
  assert.match(html, /withSuccessHandler/);
  assert.match(html, /withFailureHandler/);
  assert.match(html, /showConfirm/);
  assert.match(html, /applyFilters/);

  for (const method of [
    'getAdminDashboardState',
    'saveAdminSettings',
    'refreshClassroomList',
    'saveCourseSyncSelection',
    'refreshStudentsForCheckedCourses',
    'issueTokensForActiveStudents',
    'reissueStudentToken',
    'revokeStudentToken',
    'getDistributionTargetsPreview',
    'dryRunStudentUrlDistribution',
    'distributeStudentUrlsForCheckedCourses',
    'retryFailedStudentUrlDistributions',
    'rebuildAggregateCache'
  ]) {
    assert.match(html, new RegExp(`runServer\\('${method}'`), `${method} should be called through runServer`);
  }
});
