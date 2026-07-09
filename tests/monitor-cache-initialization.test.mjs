import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import test from 'node:test';

async function loadServerApi() {
  const code = await readFile('Code.gs', 'utf8');
  const alerts = [];
  const errors = [];
  const sandbox = {
    console,
    globalThis: {},
    Utilities: {
      getUuid: () => 'uuid-from-monitor-cache-test',
      computeDigest: () => [1, 2, 3, 255],
      DigestAlgorithm: { SHA_256: 'SHA_256' }
    },
    SpreadsheetApp: {
      getUi: () => ({
        Button: { OK: 'OK' },
        ButtonSet: { OK_CANCEL: 'OK_CANCEL' },
        alert: (...args) => {
          alerts.push(args.map((value) => String(value)).join('\n'));
          return 'OK';
        }
      })
    }
  };
  vm.runInNewContext(
    `${code}
globalThis.__api = {
  AdminService,
  AggregationService,
  LoggerService,
  MonitorService,
  MonitorSnapshotService,
  SheetRepository,
  TokenService,
  rebuildMonitorSnapshotFromMonitor,
  tryBuildInitialMonitorSnapshotAfterTeacherUrlSetup_: typeof tryBuildInitialMonitorSnapshotAfterTeacherUrlSetup_ === 'function'
    ? tryBuildInitialMonitorSnapshotAfterTeacherUrlSetup_
    : null,
  writeTeacherUrlsToSettingsFromMenu
};`,
    sandbox,
    { filename: 'Code.gs' }
  );
  const api = sandbox.globalThis.__api;
  api.LoggerService.logDeveloperError = (context, error) => {
    errors.push({ context, message: error && error.message ? error.message : String(error) });
  };
  api.SheetRepository.appendRunLog = () => {};
  return { api, alerts, errors };
}

function stubTeacherUrlSettings(api) {
  const writtenSettings = [];
  api.SheetRepository.assertManagementSheetsReady = () => {};
  api.SheetRepository.getSettingValue = (key) => {
    if (key === 'WEB_APP_URL') return 'https://script.example/macros/s/demo/exec';
    return '';
  };
  api.SheetRepository.setSettingValues_ = (settings) => {
    writtenSettings.push(...settings);
  };
  api.TokenService.ensureTeacherTestStudentToken = (baseUrl) => ({
    studentUrl: `${baseUrl}?t=test-teacher-token`
  });
  return writtenSettings;
}

test('teacher URL menu creates the initial monitor snapshot without full aggregate rebuilds', async () => {
  const { api, alerts } = await loadServerApi();
  const writtenSettings = stubTeacherUrlSettings(api);
  let snapshotBuilds = 0;
  let aggregateRebuilds = 0;
  let problemTypeRebuilds = 0;

  api.MonitorSnapshotService.writeDashboardSnapshot = () => {
    snapshotBuilds += 1;
    return {
      generatedAt: '2026-07-09T00:00:00.000Z',
      progressRows: [{ rosterKey: 'course-1::student-1' }]
    };
  };
  api.AggregationService.rebuildAggregateCache = () => {
    aggregateRebuilds += 1;
    throw new Error('full aggregate rebuild should not run');
  };
  api.AggregationService.rebuildProblemTypeStatsCache = () => {
    problemTypeRebuilds += 1;
    throw new Error('problem type rebuild should not run');
  };

  const result = api.writeTeacherUrlsToSettingsFromMenu();

  assert.equal(snapshotBuilds, 1);
  assert.equal(aggregateRebuilds, 0);
  assert.equal(problemTypeRebuilds, 0);
  assert.equal(result.initialMonitorSnapshot.ok, true);
  assert.equal(result.initialMonitorSnapshot.rowCount, 1);
  assert.equal(writtenSettings.some((setting) => setting.key === 'MONITOR_URL'), true);
  assert.equal(writtenSettings.some((setting) => setting.key === 'TEST_STUDENT_URL'), true);
  assert.match(alerts.join('\n'), /モニター表示用キャッシュも初期作成しました/);
  assert.match(alerts.join('\n'), /MONITOR_URL を開くとWebモニターを確認できます/);
});

test('teacher URL menu still succeeds and logs when initial monitor snapshot creation fails', async () => {
  const { api, alerts, errors } = await loadServerApi();
  const writtenSettings = stubTeacherUrlSettings(api);

  api.MonitorSnapshotService.writeDashboardSnapshot = () => {
    throw new Error('monitor cache source sheets are not ready');
  };
  api.AggregationService.rebuildAggregateCache = () => {
    throw new Error('full aggregate rebuild should not run');
  };
  api.AggregationService.rebuildProblemTypeStatsCache = () => {
    throw new Error('problem type rebuild should not run');
  };

  const result = api.writeTeacherUrlsToSettingsFromMenu();

  assert.equal(result.initialMonitorSnapshot.ok, false);
  assert.match(result.initialMonitorSnapshot.message, /monitor cache source sheets are not ready/);
  assert.equal(writtenSettings.some((setting) => setting.key === 'MONITOR_URL'), true);
  assert.match(alerts.join('\n'), /モニター表示用キャッシュの初期作成はスキップされました/);
  assert.match(alerts.join('\n'), /必要に応じて「モニターだけ更新」または「集計から完全更新」を押してください/);
  assert.equal(errors.some((entry) => /initial monitor snapshot/.test(entry.context)), true);
});

test('initial monitor snapshot helper catches failures and returns a teacher-safe result', async () => {
  const { api, errors } = await loadServerApi();

  assert.equal(typeof api.tryBuildInitialMonitorSnapshotAfterTeacherUrlSetup_, 'function');
  api.MonitorSnapshotService.writeDashboardSnapshot = () => {
    throw new Error('snapshot write failed');
  };
  api.AggregationService.rebuildAggregateCache = () => {
    throw new Error('full aggregate rebuild should not run');
  };
  api.AggregationService.rebuildProblemTypeStatsCache = () => {
    throw new Error('problem type rebuild should not run');
  };

  const result = api.tryBuildInitialMonitorSnapshotAfterTeacherUrlSetup_();

  assert.equal(result.ok, false);
  assert.equal(result.message, 'snapshot write failed');
  assert.equal(errors.some((entry) => /initial monitor snapshot/.test(entry.context)), true);
});

test('monitor snapshot rebuild failure recommends full rebuild except for lock contention', async () => {
  const { api } = await loadServerApi();
  api.SheetRepository.assertManagementSheetsReady = () => {};

  api.AdminService.runLoggedOperation = () => {
    throw new Error('モニターキャッシュを作成できませんでした');
  };
  const failed = api.rebuildMonitorSnapshotFromMonitor();
  assert.equal(failed.ok, false);
  assert.equal(failed.requiresFullRebuild, true);
  assert.equal(failed.recommendedAction, 'full-rebuild');
  assert.match(failed.message, /集計から完全更新を実行してください/);

  api.AdminService.runLoggedOperation = () => {
    throw new Error('別の処理が実行中です。少し待ってから再実行してください。');
  };
  const locked = api.rebuildMonitorSnapshotFromMonitor();
  assert.equal(locked.ok, false);
  assert.equal(locked.requiresFullRebuild, false);
  assert.equal(locked.recommendedAction, 'retry');
  assert.match(locked.message, /少し待ってから再実行/);
});
