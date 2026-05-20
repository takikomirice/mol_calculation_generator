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
  TokenService,
  MolProblemService,
  AnswerService,
  normalizeNumericInput,
  isAnswerCorrect
};`,
    sandbox,
    { filename: 'Code.gs' }
  );
  return sandbox.globalThis.__api;
}

function isFriendlyValue(value) {
  const numeric = Math.abs(Number(value));
  if (!Number.isFinite(numeric)) {
    return false;
  }
  if (numeric >= 1e10) {
    const scaled = numeric / 1e23;
    return Math.abs(scaled - Math.round(scaled * 2) / 2) < 1e-9;
  }
  return [1, 0.5, 0.25, 0.1].some((step) => Math.abs(numeric / step - Math.round(numeric / step)) < 1e-9);
}

test('problem generation keeps each level numerically manageable and uses the expected Avogadro constant', async () => {
  const { MolProblemService } = await loadApi();

  for (let index = 0; index < 30; index += 1) {
    const beginner = MolProblemService.generateProblem('beginner');
    assert.equal(beginner.avogadroConstant, 6.0e23);
    assert.equal(beginner.significantDigits, 2);
    assert.equal(isFriendlyValue(beginner.expectedAnswer), true, `beginner answer should be friendly: ${beginner.expectedAnswer}`);

    const intermediate = MolProblemService.generateProblem('intermediate');
    assert.equal(intermediate.avogadroConstant, 6.0e23);
    assert.equal(intermediate.significantDigits, 3);
    assert.equal(
      intermediate.expectedAnswer,
      MolProblemService.roundToSignificantDigits(intermediate.expectedAnswer, 3),
      `intermediate answer should already be rounded to 3 significant digits: ${intermediate.expectedAnswer}`
    );

    const advanced = MolProblemService.generateProblem('advanced');
    assert.equal(advanced.avogadroConstant, 6.02e23);
    assert.equal(advanced.significantDigits, 3);
    assert.equal(MolProblemService.verifyProblemIntegrity(advanced), true);
  }
});

test('advanced generation includes problems where rounding is required', async () => {
  const { MolProblemService } = await loadApi();
  const advancedProblems = Array.from({ length: 80 }, () => MolProblemService.generateProblem('advanced'));

  assert.ok(advancedProblems.some((problem) => problem.requiresRounding === true));
});

test('numeric normalization accepts supported formats and rejects empty or invalid input', async () => {
  const { normalizeNumericInput } = await loadApi();

  assert.equal(normalizeNumericInput('123.45'), 123.45);
  assert.equal(normalizeNumericInput('１２３．４５'), 123.45);
  assert.equal(normalizeNumericInput('6.02e23'), 6.02e23);
  assert.equal(normalizeNumericInput('６．０２×１０＾２３'), 6.02e23);
  assert.equal(Number.isNaN(normalizeNumericInput('')), true);
  assert.equal(Number.isNaN(normalizeNumericInput('abc')), true);
});

test('answer judgment handles exact matches tolerance failures and significant-digit rounding', async () => {
  const { isAnswerCorrect } = await loadApi();

  assert.equal(isAnswerCorrect('2.50', 2.5, 0.01, 3), true);
  assert.equal(isAnswerCorrect('101', 100, 0.01, 3), true);
  assert.equal(isAnswerCorrect('102', 100, 0.01, 3), false);
  assert.equal(isAnswerCorrect('2.004', 2.0039, 0.00001, 3), true);
});

test('token validation accepts active tokens and rejects missing or revoked tokens', async () => {
  const { TokenService } = await loadApi();
  const rows = [
    { token: 'active-token', rosterKey: 'course-1::student-1', revoked: false },
    { token: 'revoked-token', rosterKey: 'course-1::student-2', revoked: true }
  ];

  assert.equal(TokenService.validateTokenAgainstRows('active-token', rows).rosterKey, 'course-1::student-1');
  assert.throws(() => TokenService.validateTokenAgainstRows('missing-token', rows), /tokenが見つかりません/);
  assert.throws(() => TokenService.validateTokenAgainstRows('revoked-token', rows), /無効化/);
});

test('answer log schema contains required fields including attemptId', async () => {
  const { SheetRepository } = await loadApi();
  const answerLog = SheetRepository.getSheetDefinitions().find((definition) => definition.name === '解答ログ');

  for (const header of [
    'timestamp',
    'attemptId',
    'token',
    'courseId',
    'rosterKey',
    'studentId',
    'level',
    'problemType',
    'expectedAnswer',
    'submittedAnswer',
    'normalizedSubmittedAnswer',
    'isCorrect',
    'significantDigits',
    'avogadroConstant',
    'elapsedMs',
    'clientInfo'
  ]) {
    assert.ok(answerLog.headers.includes(header), `${header} should be present`);
  }
});

test('answer submission appends an attemptId and returns recent ten accuracy', async () => {
  const { SheetRepository, MolProblemService, AnswerService } = await loadApi();
  const tokenRow = {
    token: 'active-token',
    courseId: 'course-1',
    courseName: '化学A',
    rosterKey: 'course-1::student-1',
    studentId: 'student-1',
    number: '7',
    name: '山田 太郎',
    revoked: false
  };
  const issued = MolProblemService.issueProblemForToken('active-token', { level: 'beginner', problemType: 1 });
  const existingLogs = Array.from({ length: 9 }, (_, index) => ({
    timestamp: `2026-05-20T12:0${index}:00.000Z`,
    rosterKey: tokenRow.rosterKey,
    isCorrect: index % 2 === 0,
    level: 'beginner'
  }));
  let appendedEntry = null;

  SheetRepository.readTokenRows = () => [tokenRow];
  SheetRepository.withDocumentLock = (callback) => callback();
  SheetRepository.findAnswerLogByAttemptId = () => null;
  SheetRepository.appendAnswerLog = (entry) => {
    appendedEntry = entry;
    existingLogs.push(entry);
  };
  SheetRepository.readAnswerLogsForRosterKey = () => existingLogs;
  SheetRepository.upsertAggregateCacheRow = () => {};

  const response = AnswerService.submitAnswer({
    token: 'active-token',
    problem: issued.publicProblem,
    submittedAnswer: String(issued.problem.expectedAnswer),
    elapsedMs: 1200,
    clientInfo: { userAgent: 'node-test' }
  });

  assert.equal(appendedEntry.attemptId, issued.problem.problemId);
  assert.equal(appendedEntry.isCorrect, true);
  assert.equal(appendedEntry.normalizedSubmittedAnswer, issued.problem.expectedAnswer);
  assert.equal(response.result.recent10Attempts, 10);
  assert.equal(response.result.recent10Correct, 6);
  assert.equal(response.result.recent10Accuracy, 0.6);
});
