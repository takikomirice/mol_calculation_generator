import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import test from 'node:test';

async function readText(path) {
  return readFile(path, 'utf8');
}

function extractFunctionBody(source, functionName) {
  const match = new RegExp(`function\\s+${functionName}\\s*\\(`).exec(source);
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

test('legacy Admin.html file and dialog entrypoint are removed', async () => {
  const code = await readText('Code.gs');

  await assert.rejects(access('Admin.html', constants.F_OK), { code: 'ENOENT' });
  assert.doesNotMatch(code, /function\s+openAdminDialog\s*\(/);
  assert.doesNotMatch(code, /createTemplateFromFile\(['"]Admin['"]\)/);
  assert.doesNotMatch(code, /MOL_DRILL_ADMIN_APP_NAME/);
});

test('spreadsheet menu keeps normal workflow without legacy admin submenu', async () => {
  const code = await readText('Code.gs');
  const menuBody = extractFunctionBody(code, 'molDrillOnOpen');

  for (const label of [
    '★ 先生用URLを設定シートに出力',
    '⑨ 集計キャッシュを更新',
    '⓪ 初期整備・保守',
    '① Classroom同期',
    '② 生徒URL',
    '③ 投稿・URL取消',
    '④ 個別対応',
    '④-1 選択行の教師プレビューURLを表示',
    '④-2 選択行のトークンを再発行',
    '④-3 選択行のURLを無効化'
  ]) {
    assert.match(menuBody, new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }

  assert.doesNotMatch(menuBody, /旧管理画面/);
  assert.doesNotMatch(menuBody, /旧管理ダッシュボードを開く/);
  assert.doesNotMatch(menuBody, /openAdminDialog/);
  assert.doesNotMatch(menuBody, /★ 管理ダッシュボードを開く/);
});

test('admin web route returns a retirement notice without reading Admin template', async () => {
  const code = await readText('Code.gs');
  const doGetBody = extractFunctionBody(code, 'doGet');

  assert.match(doGetBody, /AdminService\.isAdminRoute/);
  assert.match(doGetBody, /旧管理画面は廃止されました/);
  assert.match(doGetBody, /Webモニター/);
  assert.match(doGetBody, /もるくえ！/);
  assert.doesNotMatch(doGetBody, /createTemplateFromFile\(['"]Admin['"]\)/);
});

test('teacher-facing docs no longer instruct users to install or open Admin.html', async () => {
  const docs = `${await readText('README.md')}\n${await readText('運用手順.md')}`;

  assert.match(docs, /Admin\.html[\s\S]*削除済み/);
  assert.match(docs, /旧管理画面[\s\S]*(使わず|復活させず)/);
  assert.doesNotMatch(docs, /Admin\.html[^\r\n]*(作成|貼り付け|インストール|開く)/);
  assert.doesNotMatch(docs, /旧管理画面[^\r\n]*(開く|使う|利用する)/);
  assert.doesNotMatch(docs, /旧管理ダッシュボード/);
  assert.match(docs, /Webモニター/);
  assert.match(docs, /設定[\s\S]*値[\s\S]*直接編集/);
  assert.match(docs, /④ 個別対応/);
  assert.match(docs, /各管理シート/);
  assert.match(docs, /表示中一覧CSV/);
  assert.match(docs, /分析CSV|解答ログ全履歴CSV/);
});
