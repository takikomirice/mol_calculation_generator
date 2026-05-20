import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import test from 'node:test';

async function loadApi() {
  const code = await readFile('Code.gs', 'utf8');
  const sandbox = {
    console,
    globalThis: {},
    Utilities: {
      getUuid: () => 'uuid-from-test',
      computeDigest: () => [1, 2, 3, 255],
      DigestAlgorithm: { SHA_256: 'SHA_256' }
    }
  };
  vm.runInNewContext(
    `${code}
globalThis.__api = {
  SheetRepository,
  AdminService,
  TokenService,
  AggregationService,
  ClassroomService,
  DistributionService,
  MolProblemService,
  AnswerService,
  generateProblem,
  generateBeginnerProblem,
  generateIntermediateProblem,
  generateAdvancedProblem,
  normalizeNumericInput,
  roundToSignificantDigits,
  isAnswerCorrect,
  buildExplanation,
  generateSampleProblemsForTest,
  validateProblemGenerationSamplesForTest,
  validateStudentToken
};`,
    sandbox,
    { filename: 'Code.gs' }
  );
  return sandbox.globalThis.__api;
}

test('management sheet definitions match the mol drill schema and exclude PDF sheets', async () => {
  const { SheetRepository } = await loadApi();
  const definitions = SheetRepository.getSheetDefinitions();
  const names = definitions.map((definition) => definition.name);

  assert.equal(JSON.stringify(names), JSON.stringify([
    '設定',
    'Classroom一覧',
    '生徒名簿',
    'トークン管理',
    '解答ログ',
    '配付ログ',
    '集計キャッシュ',
    '実行ログ'
  ]));
  assert.equal(SheetRepository.getExpectedSchemaVersion(), '11');

  const byName = Object.fromEntries(definitions.map((definition) => [definition.name, definition]));
  assert.equal(JSON.stringify(byName['トークン管理'].headers), JSON.stringify([
    'token',
    'courseId',
    'courseName',
    'rosterKey',
    'studentId',
    '出席番号',
    '氏名',
    'メール',
    'studentUrl',
    'issuedAt',
    'revoked',
    'note'
  ]));
  assert.ok(!names.includes('PDF割当'));
  assert.ok(!names.includes('PDF割当下書き'));
  assert.ok(!names.includes('共通添付'));
  assert.ok(!names.includes('Drive保存監査ログ'));
});

test('default settings include admin and classroom URL delivery controls', async () => {
  const { SheetRepository } = await loadApi();
  const settings = SheetRepository.getDefaultSettingsForTest();
  const keys = settings.map((setting) => setting.key);

  for (const key of ['WEB_APP_URL', 'ADMIN_TOKEN', 'POST_TEXT_TEMPLATE', 'CLASSROOM_SEND_BATCH_SIZE', 'DRY_RUN', 'ENABLE_DISTRIBUTION_LOG']) {
    assert.ok(keys.includes(key), `${key} should be defined`);
  }
  assert.equal(settings.find((setting) => setting.key === 'CLASSROOM_SEND_BATCH_SIZE').value, '30');
  assert.equal(settings.find((setting) => setting.key === 'DRY_RUN').value, 'false');
});

test('admin service recognizes admin routes and normalizes editable settings', async () => {
  const { AdminService } = await loadApi();

  assert.equal(AdminService.isAdminRoute({ parameter: { admin: 'secret' } }), true);
  assert.equal(AdminService.isAdminRoute({ parameter: { page: 'admin' } }), true);
  assert.equal(AdminService.isAdminRoute({ parameter: { t: 'student-token' } }), false);
  assert.equal(AdminService.extractAdminToken({ parameter: { admin: 'secret' } }), 'secret');

  const settings = AdminService.normalizeSettingsPayload({
    webAppUrl: ' https://example.com/exec ',
    adminToken: ' new-secret ',
    postTextTemplate: ' Hello {{氏名}} {{studentUrl}} ',
    dryRun: true,
    batchSize: '999',
    enableDistributionLog: false
  });

  assert.equal(settings.webAppUrl, 'https://example.com/exec');
  assert.equal(settings.adminToken, 'new-secret');
  assert.equal(settings.postTextTemplate, 'Hello {{氏名}} {{studentUrl}}');
  assert.equal(settings.dryRun, true);
  assert.equal(settings.batchSize, 100);
  assert.equal(settings.enableDistributionLog, false);
});

test('course sync selection updates only active known classroom rows', async () => {
  const { AdminService } = await loadApi();
  const rows = [
    { courseId: 'course-1', name: '化学A', courseState: 'ACTIVE', checked: false },
    { courseId: 'course-2', name: '化学B', courseState: 'ACTIVE', checked: true },
    { courseId: 'course-3', name: '終了', courseState: 'ARCHIVED', checked: true }
  ];

  const next = AdminService.applyCourseSelection(rows, ['course-1', 'course-3', 'missing']);

  assert.equal(next.find((row) => row.courseId === 'course-1').checked, true);
  assert.equal(next.find((row) => row.courseId === 'course-2').checked, false);
  assert.equal(next.find((row) => row.courseId === 'course-3').checked, false);
});

test('token rows use courseId::studentId roster keys and preserve active existing tokens', async () => {
  const { TokenService } = await loadApi();
  const students = [
    {
      courseId: 'course-1',
      courseName: '化学A',
      studentId: 'student-1',
      number: '7',
      name: '山田 太郎',
      email: 'taro@example.com',
      status: '在籍'
    },
    {
      courseId: 'course-1',
      courseName: '化学A',
      studentId: 'student-2',
      number: '8',
      name: '佐藤 花子',
      email: 'hanako@example.com',
      status: '退籍'
    }
  ];
  const existing = [
    {
      token: 'existing-token',
      rosterKey: 'course-1::student-1',
      studentUrl: 'https://script.google.com/macros/s/old/exec?t=existing-token',
      revoked: false,
      issuedAt: '2026-05-20T10:00:00.000Z',
      note: 'keep'
    }
  ];

  const rows = TokenService.buildTokenRowsForStudents(
    students,
    existing,
    'https://script.google.com/macros/s/deploy/exec',
    '2026-05-20T12:00:00.000Z',
    () => 'new-token'
  );

  assert.equal(rows.length, 1);
  assert.equal(rows[0].rosterKey, 'course-1::student-1');
  assert.equal(rows[0].token, 'existing-token');
  assert.equal(rows[0].studentUrl, 'https://script.google.com/macros/s/deploy/exec?t=existing-token');
  assert.equal(rows[0].issuedAt, '2026-05-20T10:00:00.000Z');
  assert.equal(rows[0].revoked, false);
});

test('token rows can be reissued and revoked for a roster key', async () => {
  const { TokenService } = await loadApi();
  const rows = [
    {
      token: 'old-token',
      courseId: 'course-1',
      courseName: '化学A',
      rosterKey: 'course-1::student-1',
      studentId: 'student-1',
      number: '7',
      name: '山田 太郎',
      email: 'taro@example.com',
      studentUrl: 'https://example.com/exec?t=old-token',
      issuedAt: '2026-05-20T10:00:00.000Z',
      revoked: false,
      note: ''
    }
  ];

  const reissued = TokenService.reissueTokenRowsForRosterKey(
    rows,
    'course-1::student-1',
    'https://example.com/exec',
    '2026-05-20T12:00:00.000Z',
    () => 'new-token'
  );
  assert.equal(reissued.updated.token, 'new-token');
  assert.equal(reissued.updated.studentUrl, 'https://example.com/exec?t=new-token');
  assert.equal(reissued.updated.revoked, false);
  assert.match(reissued.updated.note, /再発行/);

  const revoked = TokenService.revokeTokenRowsForRosterKey(
    reissued.rows,
    'course-1::student-1',
    '2026-05-20T13:00:00.000Z'
  );
  assert.equal(revoked.updated.revoked, true);
  assert.match(revoked.updated.note, /無効化/);
});

test('token validation rejects empty missing and revoked tokens', async () => {
  const { TokenService } = await loadApi();
  const rows = [
    {
      token: 'active-token',
      rosterKey: 'course-1::student-1',
      courseId: 'course-1',
      studentId: 'student-1',
      name: '山田 太郎',
      revoked: false
    },
    {
      token: 'revoked-token',
      rosterKey: 'course-1::student-2',
      courseId: 'course-1',
      studentId: 'student-2',
      name: '佐藤 花子',
      revoked: true
    }
  ];

  assert.equal(TokenService.validateTokenAgainstRows('active-token', rows).rosterKey, 'course-1::student-1');
  assert.throws(() => TokenService.validateTokenAgainstRows('', rows), /tokenが空/);
  assert.throws(() => TokenService.validateTokenAgainstRows('missing-token', rows), /tokenが見つかりません/);
  assert.throws(() => TokenService.validateTokenAgainstRows('revoked-token', rows), /無効化/);
});

test('classroom distribution target builder skips sent rows and supports failed-only retry', async () => {
  const { DistributionService } = await loadApi();
  const tokenRows = [
    {
      token: 'sent-token',
      courseId: 'course-1',
      courseName: '化学A',
      rosterKey: 'course-1::student-1',
      studentId: 'student-1',
      name: '送信済み',
      studentUrl: 'https://example.com/exec?t=sent-token',
      revoked: false
    },
    {
      token: 'failed-token',
      courseId: 'course-1',
      courseName: '化学A',
      rosterKey: 'course-1::student-2',
      studentId: 'student-2',
      name: '失敗',
      studentUrl: 'https://example.com/exec?t=failed-token',
      revoked: false
    },
    {
      token: 'new-token',
      courseId: 'course-1',
      courseName: '化学A',
      rosterKey: 'course-1::student-3',
      studentId: 'student-3',
      name: '未配付',
      studentUrl: 'https://example.com/exec?t=new-token',
      revoked: false
    },
    {
      token: 'other-course-token',
      courseId: 'course-2',
      courseName: '化学B',
      rosterKey: 'course-2::student-4',
      studentId: 'student-4',
      name: '別クラス',
      studentUrl: 'https://example.com/exec?t=other-course-token',
      revoked: false
    }
  ];
  const logRows = [
    { token: 'sent-token', rosterKey: 'course-1::student-1', status: 'SUCCESS', classroomAnnouncementId: 'ann-1' },
    { token: 'failed-token', rosterKey: 'course-1::student-2', status: 'ERROR', errorMessage: 'quota' }
  ];

  const normalTargets = DistributionService.buildDistributionTargets(tokenRows, logRows, {
    courseId: 'course-1',
    batchSize: 10
  });
  assert.equal(JSON.stringify(normalTargets.map((row) => row.token)), JSON.stringify(['failed-token', 'new-token']));

  const retryTargets = DistributionService.buildDistributionTargets(tokenRows, logRows, {
    courseId: 'course-1',
    retryFailedOnly: true,
    batchSize: 10
  });
  assert.equal(JSON.stringify(retryTargets.map((row) => row.token)), JSON.stringify(['failed-token']));

  const limitedTargets = DistributionService.buildDistributionTargets(tokenRows, logRows, {
    courseId: 'course-1',
    batchSize: 1
  });
  assert.equal(JSON.stringify(limitedTargets.map((row) => row.token)), JSON.stringify(['failed-token']));
});

test('mol problem engine normalizes numeric input and rounds significant digits', async () => {
  const { normalizeNumericInput, roundToSignificantDigits, isAnswerCorrect } = await loadApi();

  assert.equal(normalizeNumericInput('１．２３'), 1.23);
  assert.equal(normalizeNumericInput('6.0×10^23'), 6.0e23);
  assert.equal(normalizeNumericInput('６．０×１０＾２３'), 6.0e23);
  assert.equal(normalizeNumericInput('1.0e23'), 1.0e23);
  assert.equal(roundToSignificantDigits(1234, 3), 1230);
  assert.equal(roundToSignificantDigits(0.012345, 3), 0.0123);
  assert.equal(isAnswerCorrect('2.00', 2.004, 0.01, 3), true);
  assert.equal(isAnswerCorrect('2.20', 2.004, 0.01, 3), false);
});

test('mol problem engine generates level-appropriate signed problems', async () => {
  const { MolProblemService } = await loadApi();
  const beginnerTypes = new Set(MolProblemService.getProblemTypeIdsForLevel('beginner'));
  const intermediateTypes = new Set(MolProblemService.getProblemTypeIdsForLevel('intermediate'));
  const advancedTypes = new Set(MolProblemService.getProblemTypeIdsForLevel('advanced'));

  for (let index = 0; index < 20; index += 1) {
    const beginner = MolProblemService.generateProblem('beginner');
    assert.equal(beginner.level, 'beginner');
    assert.equal(beginner.avogadroConstant, 6.0e23);
    assert.ok(beginnerTypes.has(MolProblemService.getProblemTypeId(beginner.problemType)));
    assert.ok(beginner.problemId.startsWith('MP_'));
    assert.equal(MolProblemService.verifyProblemIntegrity(beginner), true);

    const intermediate = MolProblemService.generateProblem('intermediate');
    assert.equal(intermediate.level, 'intermediate');
    assert.equal(intermediate.avogadroConstant, 6.0e23);
    assert.ok(intermediateTypes.has(MolProblemService.getProblemTypeId(intermediate.problemType)));
    assert.equal(MolProblemService.verifyProblemIntegrity(intermediate), true);

    const advanced = MolProblemService.generateProblem('advanced');
    assert.equal(advanced.level, 'advanced');
    assert.equal(advanced.avogadroConstant, 6.02e23);
    assert.ok(advancedTypes.has(MolProblemService.getProblemTypeId(advanced.problemType)));
    assert.equal(advanced.significantDigits, 3);
    assert.equal(MolProblemService.verifyProblemIntegrity(advanced), true);
  }
});

test('mol problem public payload hides answers and server can restore by token and problemId', async () => {
  const { MolProblemService } = await loadApi();
  const issued = MolProblemService.issueProblemForToken('token-1', { level: 'advanced', problemType: 14 });
  const publicProblem = issued.publicProblem;

  assert.equal(publicProblem.level, 'advanced');
  assert.ok(publicProblem.problemId.startsWith('MP_'));
  assert.equal(typeof publicProblem.questionText, 'string');
  assert.equal(typeof publicProblem.unit, 'string');
  assert.equal(typeof publicProblem.inputHint, 'string');
  assert.ok(Array.isArray(publicProblem.givenValues));
  assert.ok(publicProblem.givenValues.length > 0);
  assert.equal(typeof publicProblem.givenValuesTitle, 'string');
  assert.ok(publicProblem.givenValues.every((item) => typeof item.label === 'string' && typeof item.value === 'string'));
  assert.ok(publicProblem.givenValues.every((item) => !Object.hasOwn(item, 'isRequired')));
  assert.equal(Object.hasOwn(publicProblem, 'expectedAnswer'), false);
  assert.equal(Object.hasOwn(publicProblem, 'displayAnswer'), false);
  assert.equal(Object.hasOwn(publicProblem, 'explanation'), false);
  assert.equal(Object.hasOwn(publicProblem, 'substance'), false);

  const restored = MolProblemService.getStoredProblemForToken('token-1', publicProblem.problemId);
  assert.equal(restored.problemId, publicProblem.problemId);
  assert.equal(typeof restored.expectedAnswer, 'number');
  assert.equal(typeof restored.explanation, 'string');
  assert.throws(() => MolProblemService.getStoredProblemForToken('other-token', publicProblem.problemId), /問題データが見つかりません/);
});

test('given values include only required values for beginner and intermediate problem types', async () => {
  const { MolProblemService } = await loadApi();
  const massOrFormula = /モル質量|式量/;
  const expectations = new Map([
    [1, [massOrFormula]],
    [2, [massOrFormula]],
    [3, ['アボガドロ定数']],
    [4, ['アボガドロ定数']],
    [5, ['標準状態のモル体積']],
    [6, ['標準状態のモル体積']],
    [7, [massOrFormula, 'アボガドロ定数']],
    [8, ['アボガドロ定数', massOrFormula]],
    [9, [massOrFormula, '標準状態のモル体積']],
    [10, ['標準状態のモル体積', massOrFormula]],
    [11, ['標準状態のモル体積', 'アボガドロ定数']],
    [12, ['アボガドロ定数', '標準状態のモル体積']]
  ]);

  for (const [typeId, requiredLabelParts] of expectations) {
    const level = typeId <= 6 ? 'beginner' : 'intermediate';
    const problem = MolProblemService.generateProblem({ level, problemType: typeId });
    const publicProblem = MolProblemService.toPublicProblem(problem);

    assert.equal(problem.givenValues.length, requiredLabelParts.length, `${level} type ${typeId} should expose only required values`);
    assert.equal(publicProblem.givenValuesTitle, 'この問題で使う値');
    assert.ok(problem.givenValues.every((item) => item.isRequired === true));
    for (const labelPart of requiredLabelParts) {
      const matches = labelPart instanceof RegExp
        ? (item) => labelPart.test(item.label)
        : (item) => item.label.includes(labelPart);
      assert.ok(
        problem.givenValues.some(matches),
        `type ${typeId} should include ${labelPart}`
      );
    }
  }
});

test('advanced public problems may include correct dummy given values without exposing isRequired', async () => {
  const { MolProblemService } = await loadApi();
  const problem = MolProblemService.generateProblem({ level: 'advanced', problemType: 1 });
  const publicProblem = MolProblemService.toPublicProblem(problem);

  assert.ok(problem.givenValues.some((item) => item.isRequired === true));
  assert.ok(problem.givenValues.some((item) => item.isRequired === false));
  assert.equal(publicProblem.givenValuesTitle, '与えられた値');
  assert.equal(publicProblem.givenValues.length, problem.givenValues.length);
  assert.ok(publicProblem.givenValues.every((item) => !Object.hasOwn(item, 'isRequired')));
  assert.ok(publicProblem.givenValues.some((item) => item.label.includes('アボガドロ定数') || item.label.includes('標準状態のモル体積')));
});

test('substance metadata and gas-only problem types are chemically constrained', async () => {
  const { MolProblemService } = await loadApi();
  const substances = MolProblemService.getSubstances();
  const nacl = substances.find((substance) => substance.formula === 'NaCl');
  const glucose = substances.find((substance) => substance.formula === 'C6H12O6');

  assert.ok(substances.every((substance) => (
    typeof substance.formula === 'string'
    && typeof substance.name === 'string'
    && typeof substance.molarMass === 'number'
    && typeof substance.isGasAtSTP === 'boolean'
    && typeof substance.type === 'string'
  )));
  assert.equal(nacl.isGasAtSTP, false);
  assert.equal(glucose.isGasAtSTP, false);

  for (const typeId of [5, 6, 9, 10, 11, 12]) {
    for (let index = 0; index < 20; index += 1) {
      const problem = MolProblemService.generateProblem({ level: 'advanced', problemType: typeId });
      assert.equal(problem.substance.isGasAtSTP, true, `type ${typeId} should use gas at STP`);
      assert.notEqual(problem.substance.formula, 'NaCl');
      assert.notEqual(problem.substance.formula, 'C6H12O6');
    }
  }

  const atomProblem = MolProblemService.generateProblem({ level: 'advanced', problemType: 13 });
  assert.equal(atomProblem.substance.type, 'element');
  assert.equal(atomProblem.unit, 'g');
});

test('type 14 always gives enough amount information and returns g/mol', async () => {
  const { MolProblemService } = await loadApi();
  const amountModes = new Set();

  for (let index = 0; index < 30; index += 1) {
    const problem = MolProblemService.generateProblem({ level: 'advanced', problemType: 14 });
    assert.equal(problem.problemTypeId, 14);
    assert.equal(problem.unit, 'g/mol');
    assert.equal(problem.substance.formula, 'X');
    assert.equal(problem.given.unit, 'g');
    assert.ok(['mol', 'particles', 'gasVolume'].includes(problem.given.amountMode));
    amountModes.add(problem.given.amountMode);
    if (problem.given.amountMode === 'gasVolume') {
      assert.equal(problem.substance.isGasAtSTP, true);
      assert.equal(problem.given.secondaryUnit, 'L');
    }
  }
  assert.ok(amountModes.size >= 2);
});

test('sample validation test function checks level and chemistry constraints', async () => {
  const { validateProblemGenerationSamplesForTest } = await loadApi();
  const result = validateProblemGenerationSamplesForTest(80);

  assert.equal(result.ok, true);
  assert.equal(result.beginnerHasType7OrLater, false);
  assert.equal(result.intermediateHasType13Or14, false);
  assert.equal(result.gasProblemUsesNonGas, false);
  assert.equal(result.beginnerAnswersAreFriendly, true);
  assert.equal(result.advancedHasRoundingCase, true);
  assert.equal(result.advancedSawType13, true);
  assert.equal(result.advancedSawType14, true);
});

test('answer service summarizes total and recent ten attempts for one student', async () => {
  const { AnswerService } = await loadApi();
  const logs = Array.from({ length: 12 }, (_, index) => ({
    timestamp: `2026-05-20T12:${String(index).padStart(2, '0')}:00.000Z`,
    rosterKey: index === 0 ? 'other-course::student-x' : 'course-1::student-1',
    isCorrect: index % 3 !== 0,
    level: index < 4 ? 'beginner' : index < 8 ? 'intermediate' : 'advanced'
  }));

  const summary = AnswerService.summarizeAnswerLogsForStudent('course-1::student-1', logs);

  assert.equal(summary.totalAttempts, 11);
  assert.equal(summary.totalCorrect, 8);
  assert.equal(summary.recent10Attempts, 10);
  assert.equal(summary.recent10Correct, 7);
  assert.equal(summary.recent10Accuracy, 0.7);
  assert.equal(summary.beginnerAttempts, 3);
  assert.equal(summary.intermediateAttempts, 4);
  assert.equal(summary.advancedAttempts, 4);
});

test('answer submission response includes result summary and next public problem', async () => {
  const { AnswerService, MolProblemService } = await loadApi();
  const problem = MolProblemService.generateProblem({ level: 'beginner', problemType: 2 });
  const entry = {
    isCorrect: true,
    expectedAnswer: problem.expectedAnswer,
    submittedAnswer: '2.0',
    unit: problem.unit,
    explanation: problem.explanation
  };
  const summary = {
    totalAttempts: 12,
    recent10Attempts: 10,
    recent10Correct: 8,
    recent10Accuracy: 0.8
  };
  const nextProblem = MolProblemService.toPublicProblem(MolProblemService.generateProblem('beginner'));

  const response = AnswerService.buildSubmitAnswerResponse(entry, summary, nextProblem);

  assert.equal(response.ok, true);
  assert.equal(response.result.isCorrect, true);
  assert.match(response.result.expectedAnswerText, new RegExp(problem.unit.replace('/', '\\/')));
  assert.equal(response.result.totalAttempts, 12);
  assert.equal(response.result.recent10Accuracy, 0.8);
  assert.equal(Object.hasOwn(response.nextProblem, 'expectedAnswer'), false);
});

test('answer service detects duplicate attempts by attemptId for the same student', async () => {
  const { AnswerService } = await loadApi();
  const logs = [
    { attemptId: 'MP_same', rosterKey: 'course-1::student-1', isCorrect: true },
    { attemptId: 'MP_same', rosterKey: 'course-2::student-1', isCorrect: false }
  ];

  assert.equal(AnswerService.hasDuplicateAttempt('course-1::student-1', 'MP_same', logs), true);
  assert.equal(AnswerService.hasDuplicateAttempt('course-1::student-1', 'MP_other', logs), false);
});

test('mol problem integrity check detects expected-answer tampering', async () => {
  const { MolProblemService } = await loadApi();
  const problem = MolProblemService.generateProblem('beginner');
  const tampered = {
    ...problem,
    expectedAnswer: Number(problem.expectedAnswer) * 2 + 1
  };

  assert.equal(MolProblemService.verifyProblemIntegrity(problem), true);
  assert.equal(MolProblemService.verifyProblemIntegrity(tampered), false);
});

test('sample problem test function returns five problems for each level', async () => {
  const { generateSampleProblemsForTest } = await loadApi();
  const samples = generateSampleProblemsForTest();

  assert.equal(samples.beginner.length, 5);
  assert.equal(samples.intermediate.length, 5);
  assert.equal(samples.advanced.length, 5);
  assert.ok(samples.beginner.every((problem) => problem.level === 'beginner'));
  assert.ok(samples.intermediate.every((problem) => problem.level === 'intermediate'));
  assert.ok(samples.advanced.every((problem) => problem.level === 'advanced'));
});

test('aggregation cache calculates totals and recent ten accuracy per student', async () => {
  const { AggregationService } = await loadApi();
  const logs = Array.from({ length: 12 }, (_, index) => ({
    timestamp: `2026-05-20T12:${String(index).padStart(2, '0')}:00.000Z`,
    courseId: 'course-1',
    courseName: '化学A',
    rosterKey: 'course-1::student-1',
    studentId: 'student-1',
    number: '7',
    name: '山田 太郎',
    level: index < 4 ? 'beginner' : index < 8 ? 'intermediate' : 'advanced',
    isCorrect: index % 3 !== 0
  }));

  const rows = AggregationService.buildAggregateRows(logs, '2026-05-20T13:00:00.000Z');

  assert.equal(rows.length, 1);
  assert.equal(rows[0].totalAttempts, 12);
  assert.equal(rows[0].totalCorrect, 8);
  assert.equal(rows[0].totalAccuracy, 0.6667);
  assert.equal(rows[0].recent10Attempts, 10);
  assert.equal(rows[0].recent10Correct, 7);
  assert.equal(rows[0].recent10Accuracy, 0.7);
  assert.equal(rows[0].beginnerAttempts, 4);
  assert.equal(rows[0].intermediateAttempts, 4);
  assert.equal(rows[0].advancedAttempts, 4);
  assert.equal(rows[0].lastAnsweredAt, '2026-05-20T12:11:00.000Z');
});

test('aggregation progress rows include active students with no attempts and flag risk groups', async () => {
  const { AggregationService } = await loadApi();
  const students = [
    {
      courseId: 'course-1',
      courseName: '化学A',
      rosterKey: 'course-1::student-1',
      studentId: 'student-1',
      number: '7',
      name: '山田 太郎',
      status: '在籍'
    },
    {
      courseId: 'course-1',
      courseName: '化学A',
      rosterKey: 'course-1::student-2',
      studentId: 'student-2',
      number: '8',
      name: '佐藤 花子',
      status: '在籍'
    }
  ];
  const summaries = [
    {
      rosterKey: 'course-1::student-1',
      totalAttempts: 12,
      totalCorrect: 5,
      totalAccuracy: 0.4167,
      recent10Attempts: 10,
      recent10Correct: 4,
      recent10Accuracy: 0.4,
      beginnerAttempts: 4,
      intermediateAttempts: 4,
      advancedAttempts: 4,
      lastAnsweredAt: '2026-05-20T12:11:00.000Z'
    }
  ];

  const rows = AggregationService.buildAdminProgressRows(students, summaries);

  assert.equal(rows.length, 2);
  assert.equal(rows[0].statusLabel, '低正答率');
  assert.equal(rows[1].totalAttempts, 0);
  assert.equal(rows[1].statusLabel, '未実施');
  assert.equal(rows[1].lastAnsweredAt, '');
});
