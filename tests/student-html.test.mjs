import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

async function loadStudentHtml() {
  return readFile('Student.html', 'utf8');
}

test('student screen exposes required learner, status, level, problem, result, and error regions', async () => {
  const html = await loadStudentHtml();

  assert.match(html, /<h1 class="app-title">もるくえ！<\/h1>/);
  assert.match(html, /Classroom連携型モル計算練習アプリ/);

  for (const id of [
    'studentName',
    'className',
    'studentNumber',
    'totalAttempts',
    'recentAccuracy',
    'currentLevelLabel',
    'questionText',
    'givenValuesPanel',
    'givenValuesTitle',
    'givenValuesList',
    'answerInput',
    'unitLabel',
    'submitButton',
    'nextProblemButton',
    'resultPanel',
    'expectedAnswerText',
    'submittedAnswerText',
    'explanationText',
    'roundingNoteText',
    'errorPanel',
    'retryButton'
  ]) {
    assert.match(html, new RegExp(`id="${id}"`), `${id} should exist`);
  }

  for (const level of ['lv1', 'lv2', 'lv3', 'lv4', 'lv5', 'lv6']) {
    assert.match(html, new RegExp(`data-level="${level}"`), `${level} level button should exist`);
  }
});

test('student screen uses encouraging result titles with advanced-only significant-digit context', async () => {
  const html = await loadStudentHtml();

  for (const copy of [
    'できた！',
    'いい感じ！',
    'その調子！',
    'いいですね！答えが合っています！',
    '3問連続',
    '5問連続',
    'molと1種類の変換',
    'molを経由する1種類の変換',
    '有効数字3桁',
    '有効数字までOK',
    'もう一歩！',
    '惜しい！',
    'ここで整理しておこう！解説を見て、次の1問で確認しよう。',
    'ここで整理しておこう！次はきっと近づく！'
  ]) {
    assert.match(html, new RegExp(copy), `${copy} should be available in result copy`);
  }

  assert.match(html, /function buildResultTitle/);
  assert.match(html, /currentCorrectStreak/);
  assert.match(html, /requiresRounding/);
  assert.match(html, /significantDigits/);
  assert.match(html, /data.level === 'lv8'/);
  assert.doesNotMatch(html, /有効数字に合わせて丸めて判定します/);
  assert.match(html, /elements\.resultTitle\.textContent = buildResultTitle\(data, correct\)/);
});

test('student screen examples use times-ten notation without e notation', async () => {
  const html = await loadStudentHtml();

  assert.match(html, /6\.0×10\^23、6\.0x10\^23/);
  assert.doesNotMatch(html, /6\.0e23/i);
  assert.doesNotMatch(html, /6\.02e23/i);
  assert.doesNotMatch(html, /E\+23/);
});

test('student screen reads token from URL params and uses Apps Script server functions', async () => {
  const html = await loadStudentHtml();

  assert.match(html, /new URLSearchParams\(window\.location\.search\)/);
  assert.match(html, /params\.get\('t'\)/);
  assert.match(html, /params\.get\('token'\)/);
  assert.match(html, /initialToken/);
  assert.match(html, /const initialToken = <\?!= JSON\.stringify\(typeof initialToken === 'undefined' \? '' : initialToken\)\.replace/);

  for (const method of ['initializeStudentSession', 'getPracticeProblem', 'submitAnswer']) {
    assert.match(html, new RegExp(`'${method}'`), `${method} should be available through mode-aware server dispatch`);
  }
  assert.match(html, /runServer\(method, args\)/);
  assert.match(html, /const runner = google\.script\.run/);
  assert.match(html, /runner\[method\]\.apply\(runner, args \|\| \[\]\)/);
});

test('student screen supports teacher preview without requiring a student token', async () => {
  const html = await loadStudentHtml();

  assert.match(html, /initialAdminToken/);
  assert.match(html, /initialTeacherPreview/);
  assert.match(html, /teacherPreview/);
  assert.match(html, /adminToken/);
  assert.match(html, /教師プレビュー中：この操作は解答ログに保存されません/);
  assert.doesNotMatch(html, /params\.get\('admin'\)/);
  assert.doesNotMatch(html, /params\.get\('adminToken'\)/);
  assert.match(html, /params\.get\('teacherPreview'\)/);
  assert.match(html, /params\.get\('preview'\)\s*===\s*'teacher'/);
  assert.match(html, /initializeTeacherPreviewSession/);
  assert.match(html, /getTeacherPreviewProblem/);
  assert.match(html, /submitTeacherPreviewAnswer/);
  assert.match(html, /state\.teacherPreview\s*\?\s*'initializeTeacherPreviewSession'\s*:\s*'initializeStudentSession'/);
  assert.match(html, /if \(!state\.teacherPreview && !state\.token\)/);
  assert.match(html, /if \(state\.teacherPreview && !state\.adminToken\)/);
});

test('student screen prevents double submit and keeps a retryable error path', async () => {
  const html = await loadStudentHtml();

  assert.match(html, /state\.isSubmitting = true/);
  assert.match(html, /state\.isSubmitting = false/);
  assert.match(html, /answerLocked/);
  assert.match(html, /state\.answerLocked = true/);
  assert.match(html, /state\.answerLocked = false/);
  assert.match(html, /submitButton\.disabled = busy \|\| !state\.problem \|\| state\.answerLocked/);
  assert.match(html, /submitButton\.disabled = true/);
  assert.match(html, /data-retry-action/);
  assert.match(html, /retryLastAction/);
  assert.match(html, /入力不正/);
  assert.match(html, /通信失敗/);
  assert.match(html, /token不正/);
});

test('student screen prefetches one next problem and prefers it after grading', async () => {
  const html = await loadStudentHtml();
  const keydownBody = html.slice(html.indexOf("elements.answerInput.addEventListener('keydown'"), html.indexOf('selectLevel(state.selectedLevel)'));

  assert.match(html, /prefetchedProblem: null/);
  assert.match(html, /prefetchedLevel: ''/);
  assert.match(html, /isPrefetching: false/);
  assert.match(html, /prefetchRequestId: 0/);
  assert.match(html, /function startPrefetchForCurrentLevel/);
  assert.match(html, /function hasUsablePrefetchedProblem/);
  assert.match(html, /function takePrefetchedProblem/);
  assert.match(html, /function canShowPrefetchedProblem/);
  assert.match(html, /showNextProblem\(\)/);
  assert.match(html, /state\.prefetchPromise = runServer\(method, args\)/);
  assert.match(html, /skipNextProblem: state\.practiceMode !== 'auto' && hasUsablePrefetchedProblem\(state\.selectedLevel\)/);
  assert.match(html, /state\.pendingProblem = state\.practiceMode === 'auto' \? response\.nextProblem \|\| null : takePrefetchedProblem\(state\.selectedLevel\) \|\| response\.nextProblem \|\| null/);
  assert.match(keydownBody, /if \(canShowPrefetchedProblem\(\)\)/);
  assert.match(keydownBody, /showNextProblem\(\)/);
  assert.match(keydownBody, /submitAnswer\(\)/);
  assert.match(html, /startPrefetchForCurrentLevel\(\)/);
  assert.match(html, /elements\.answerInput\.focus\(\)/);
});

test('student screen invalidates prefetched problems on level changes and falls back when prefetch fails', async () => {
  const html = await loadStudentHtml();
  const levelClickBody = html.slice(html.indexOf('elements.levelButtons.forEach'), html.indexOf('elements.submitButton.addEventListener'));
  const showNextBody = html.slice(html.indexOf('async function showNextProblem'), html.indexOf('function retryLastAction'));
  const prefetchBody = html.slice(html.indexOf('function startPrefetchForCurrentLevel'), html.indexOf('async function initialize'));

  assert.match(html, /function clearPrefetchedProblem/);
  assert.match(levelClickBody, /clearPrefetchedProblem\(\)/);
  assert.match(prefetchBody, /state\.prefetchRequestId !== requestId/);
  assert.match(prefetchBody, /state\.prefetchLevel !== state\.selectedLevel/);
  assert.match(prefetchBody, /console\.warn\('prefetchProblem failed'/);
  assert.match(showNextBody, /await state\.prefetchPromise/);
  assert.match(showNextBody, /fetchProblem\(\)/);
});

test('student screen does not advance to a prefetched problem before the current answer is graded', async () => {
  const html = await loadStudentHtml();
  const updateButtonStatesBody = html.slice(html.indexOf('function updateButtonStates'), html.indexOf('function setMetaElement'));
  const showNextBody = html.slice(html.indexOf('async function showNextProblem'), html.indexOf('function retryLastAction'));
  const keydownBody = html.slice(html.indexOf("elements.answerInput.addEventListener('keydown'"), html.indexOf('selectLevel(state.selectedLevel)'));

  assert.match(updateButtonStatesBody, /nextProblemButton\.disabled = busy \|\| !state\.answerLocked/);
  assert.doesNotMatch(updateButtonStatesBody, /hasUsablePrefetchedProblem\(state\.selectedLevel\)/);
  assert.match(showNextBody, /if \(!state\.answerLocked\) {\s*return;\s*}/);
  assert.match(showNextBody, /if \(state\.isSubmitting \|\| state\.isInitializing\) {\s*return;\s*}/);
  assert.match(keydownBody, /if \(canShowPrefetchedProblem\(\)\) {\s*showNextProblem\(\);\s*return;\s*}\s*submitAnswer\(\)/);
});

test('student screen renders given values between question text and answer input', async () => {
  const html = await loadStudentHtml();
  const questionIndex = html.indexOf('id="questionText"');
  const givenIndex = html.indexOf('id="givenValuesPanel"');
  const answerIndex = html.indexOf('class="answer-row"');

  assert.ok(questionIndex > 0, 'question text should exist');
  assert.ok(givenIndex > questionIndex, 'given values should be after the question');
  assert.ok(answerIndex > givenIndex, 'given values should be before the answer input');
  assert.match(html, /この問題で使う値/);
  assert.match(html, /givenValuesTitle.textContent = title/);
  assert.match(html, /renderGivenValues/);
  assert.match(html, /givenValuesTitle/);
});

test('student screen renders only server-provided chemical formula html safely', async () => {
  const html = await loadStudentHtml();
  const applyProblemBody = html.slice(html.indexOf('function applyProblem'), html.indexOf('async function initialize'));
  const renderGivenValuesBody = html.slice(html.indexOf('function renderGivenValues'), html.indexOf('function normalizeClientNumber'));
  const renderResultBody = html.slice(html.indexOf('function renderResult'), html.indexOf('async function submitAnswer'));

  assert.match(html, /function isSafeServerHtml/);
  assert.match(html, /function renderServerHtmlOrText/);
  assert.match(html, /tagName !== 'SUB'/);
  assert.match(html, /questionHtml/);
  assert.match(html, /labelHtml/);
  assert.match(html, /valueHtml/);
  assert.match(html, /explanationHtml/);
  assert.match(applyProblemBody, /renderServerHtmlOrText\(elements\.questionText,\s*state\.problem\.questionHtml,\s*state\.problem\.questionText/);
  assert.match(renderGivenValuesBody, /renderServerHtmlOrText\(label,\s*item\.labelHtml/);
  assert.match(renderGivenValuesBody, /renderServerHtmlOrText\(value,\s*item\.valueHtml/);
  assert.match(renderResultBody, /renderServerHtmlOrText\(elements\.explanationText,\s*data\.explanationHtml,\s*data\.explanation/);
  assert.doesNotMatch(applyProblemBody, /elements\.questionText\.innerHTML\s*=\s*state\.problem\.questionHtml/);
  assert.doesNotMatch(renderResultBody, /elements\.explanationText\.innerHTML\s*=\s*data\.explanationHtml/);
});
