import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

async function loadStudentHtml() {
  return readFile('Student.html', 'utf8');
}

test('student screen exposes required learner, status, level, problem, result, and error regions', async () => {
  const html = await loadStudentHtml();

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

  for (const level of ['beginner', 'intermediate', 'advanced']) {
    assert.match(html, new RegExp(`data-level="${level}"`), `${level} level button should exist`);
  }
});

test('student screen reads token from URL params and uses Apps Script server functions', async () => {
  const html = await loadStudentHtml();

  assert.match(html, /new URLSearchParams\(window\.location\.search\)/);
  assert.match(html, /params\.get\('t'\)/);
  assert.match(html, /params\.get\('token'\)/);
  assert.match(html, /initialToken/);

  for (const method of ['initializeStudentSession', 'getPracticeProblem', 'submitAnswer']) {
    assert.match(html, new RegExp(`runServer\\('${method}'`), `${method} should be called through runServer`);
  }
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

test('student screen renders given values between question text and answer input', async () => {
  const html = await loadStudentHtml();
  const questionIndex = html.indexOf('id="questionText"');
  const givenIndex = html.indexOf('id="givenValuesPanel"');
  const answerIndex = html.indexOf('class="answer-row"');

  assert.ok(questionIndex > 0, 'question text should exist');
  assert.ok(givenIndex > questionIndex, 'given values should be after the question');
  assert.ok(answerIndex > givenIndex, 'given values should be before the answer input');
  assert.match(html, /この問題で使う値/);
  assert.match(html, /与えられた値/);
  assert.match(html, /renderGivenValues/);
  assert.match(html, /givenValuesTitle/);
});
