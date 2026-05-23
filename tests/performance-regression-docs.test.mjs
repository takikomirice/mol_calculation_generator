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
  const admin = await readText('Admin.html');

  assert.match(extractFunctionBody(code, 'findToken'), /全行読み込みを避け/);
  assert.match(extractFunctionBody(code, 'recordTokenAccess'), /1セル更新/);
  assert.match(extractFunctionBody(code, 'readAnswerLogsForRosterKey'), /生徒別/);
  assert.match(extractFunctionBody(code, 'readLatestRowsAsObjects_'), /末尾行だけ/);
  assert.match(extractFunctionBody(code, 'recordStudentAccess_'), /lastAccessedAt.*スロットリング/);
  assert.match(extractFunctionBody(code, 'submitAnswer'), /同じattemptId/);
  assert.match(extractFunctionBody(admin, 'load'), /遅延ロード/);
  assert.match(extractFunctionBody(admin, 'ensurePanelData'), /重い.*必要時/);
});

test('README documents the lightweight dashboard design after performance work', async () => {
  const readme = await readText('README.md');

  assertIncludesAll(readme, [
    /管理画面は.*ダッシュボード中心/,
    /重い操作は.*スプレッドシート.*メニュー.*推奨/,
    /高度な操作.*補助導線/,
    /token検索.*高速化/,
    /lastAccessedAt.*単一セル/,
    /解答ログ.*生徒別/,
    /集計キャッシュ.*1行更新/,
    /管理画面.*遅延ロード/
  ], 'README');
});

test('README and operation guide describe menu-first admin dashboard without admin URL or admin token setup', async () => {
  const readme = await readText('README.md');
  const guide = await readText('運用手順.md');
  const docs = `${readme}\n${guide}`;

  assertIncludesAll(docs, [
    /もるくえ！.*管理ダッシュボードを開く/,
    /初期設定.*同期操作.*onOpenメニュー/,
    /管理シートを作成・補修.*既存データを残して/,
    /管理データを全削除して初期状態に戻す.*危険操作/,
    /同期対象.*1.*ON.*空欄.*OFF/
  ], 'docs');

  assert.doesNotMatch(docs, /管理画面URLを発行/);
  assert.doesNotMatch(docs, /管理者トークン.*(保存|入力|手入力|設定)/);
  assert.doesNotMatch(docs, /管理シートを初期化/);
});

test('operation guide keeps the full classroom regression scenario and in-class dashboard reading points', async () => {
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
    /初級.*中級.*上級/,
    /解答送信/,
    /次の問題/,
    /集計キャッシュ更新/,
    /管理ダッシュボード確認/,
    /授業中に見るべきダッシュボード項目/,
    /要フォロー生徒/,
    /レベル別解答状況/,
    /重い処理.*授業中.*連打しない/
  ], 'operation guide');
});
