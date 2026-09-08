import assert from 'node:assert/strict';
import {readFile,mkdir} from 'node:fs/promises';
import test from 'node:test';
import {chromium} from 'playwright';

async function fixture(width=1100) {
  const browser=await chromium.launch({headless:true});const context=await browser.newContext({viewport:{width,height:844}});
  const page=await context.newPage();page.setDefaultTimeout(3000);const calls=[],errors=[];
  const data={appVersion:'4.0.2',answersThrough:'2026-09-08T04:00:00Z',maintenanceLinks:{spreadsheetUrl:'https://docs.google.com/spreadsheets/d/test-book/edit'},dashboardMetrics:{},progressRows:[
    {rosterKey:'c::0',courseId:'c',courseName:'化学',number:'1',name:'未解答',totalAttempts:0,averageElapsedMs:0},
    {rosterKey:'c::1',courseId:'c',courseName:'化学',number:'2',name:'生徒A',totalAttempts:10,totalCorrect:8,totalAccuracy:.8,recent10Accuracy:.8,averageElapsedMs:20000,correctAverageElapsedMs:15000,recent10AverageElapsedMs:18000,elapsedCount:9,correctElapsedCount:7,recent10ElapsedCount:9,lv8Attempts:2,lv8Correct:1,lv8Accuracy:.5},
    {rosterKey:'c::2',courseId:'c',courseName:'化学',number:'3',name:'生徒B',totalAttempts:5,totalCorrect:4,totalAccuracy:.8,recent10Accuracy:.8,averageElapsedMs:10000,correctAverageElapsedMs:8000,elapsedCount:5,correctElapsedCount:4,lv8Attempts:0}
  ]};
  page.on('pageerror',error=>errors.push(error.message));
  await page.exposeFunction('gasCall',(method)=>{calls.push(method);if(method!=='refreshMonitorDashboard')throw Error('Unexpected extra request: '+method);return {ok:true,complete:true,processed:15,total:15,data};});
  const bridge=`<script>window.google={script:{run:{withSuccessHandler(success){return{withFailureHandler(failure){return new Proxy({}, {get(_t,method){return(...args)=>window.gasCall(method,args).then(success,failure)}})}}}}}};</script>`;
  const html=(await readFile('Monitor.html','utf8')).replace(/<\?!=[\s\S]*?\?>/g,'"teacher-secret"');
  await page.route('https://mol.test/**',route=>route.fulfill({contentType:'text/html',body:bridge+html}));
  const ready=()=>page.waitForFunction(()=>document.querySelector('#statusLine').textContent.includes('最新の解答を反映しました'));
  await page.goto('https://mol.test/');await ready();
  return {browser,context,page,calls,errors,data,ready};
}

test('custom columns select, reorder, sort and export exactly the visible data without extra requests',async()=>{
  const f=await fixture();const {page}=f;
  try {
    const before=await page.locator('#studentHead th').allTextContents();
    await page.getByRole('button',{name:'表示項目を編集',exact:true}).click();
    const dialog=page.getByRole('dialog',{name:'表示項目を編集'});
    await dialog.getByRole('checkbox',{name:'平均解答時間',exact:true}).check();
    await dialog.getByRole('checkbox',{name:'正解時の平均解答時間',exact:true}).check();
    await dialog.getByRole('checkbox',{name:'累計正解数',exact:true}).check();
    await dialog.getByRole('checkbox',{name:'Lv.8 正答率',exact:true}).check();
    await dialog.getByRole('checkbox',{name:'状態',exact:true}).uncheck();
    await dialog.getByRole('button',{name:'Lv.8 正答率を上へ',exact:true}).click();
    await dialog.getByRole('button',{name:'適用',exact:true}).click();
    const keys=await page.evaluate(()=>getVisibleColumns().map(c=>c.key));
    assert.deepEqual(keys.slice(0,2),['number','name']);assert.ok(!keys.includes('status'));
    assert.equal(keys.at(-2),'lv8');assert.equal(keys.at(-1),'totalCorrect');
    assert.equal(f.calls.length,1,'column changes must not fetch each student review');
    assert.equal(await page.locator('#viewModeSelect').inputValue(),'custom');
    assert.match(await page.locator('#studentBody').innerText(),/20\.0秒.*9件/s);
    await page.locator('#studentHead').getByRole('button',{name:'平均解答時間',exact:true}).click();
    assert.deepEqual(await page.locator('#studentBody .student-name').allTextContents(),['生徒B','生徒A','未解答']);
    await page.locator('#studentHead').getByRole('button',{name:'平均解答時間',exact:true}).click();
    assert.deepEqual(await page.locator('#studentBody .student-name').allTextContents(),['生徒A','生徒B','未解答']);
    const csv=await page.evaluate(()=>buildVisibleRowsCsvText(getFilteredRows()));
    const header=await page.evaluate(()=>getVisibleColumns().filter(c=>c.key!=='history').map(c=>c.label));
    assert.deepEqual(csv.split('\r\n')[0].split(',').map(v=>v.replace(/^"|"$/g,'')),header);
    assert.ok(csv.indexOf('生徒A')<csv.indexOf('生徒B'));assert.ok(!csv.includes('詳細レビュー'));
    await page.locator('#searchInput').fill('生徒B');
    assert.ok(!(await page.evaluate(()=>buildVisibleRowsCsvText(getFilteredRows()))).includes('生徒A'));
    await page.locator('#searchInput').fill('');await page.locator('#refreshButton').click();await f.ready();
    assert.deepEqual(await page.evaluate(()=>getVisibleColumns().map(c=>c.key)),keys);
    await page.getByRole('button',{name:'表示項目を編集',exact:true}).click();
    await dialog.getByRole('checkbox',{name:'解答',exact:true}).uncheck();await page.keyboard.press('Escape');
    assert.deepEqual(await page.evaluate(()=>getVisibleColumns().map(c=>c.key)),keys,'cancel leaves the current layout intact');
    await page.reload();await f.ready();assert.deepEqual(await page.evaluate(()=>getVisibleColumns().map(c=>c.key)),keys);
    await page.getByRole('button',{name:'表示項目を編集',exact:true}).click();
    await dialog.getByRole('button',{name:'標準に戻す',exact:true}).click();await dialog.getByRole('button',{name:'適用',exact:true}).click();
    assert.deepEqual(await page.locator('#studentHead th').allTextContents(),before);
    assert.equal(await page.evaluate(()=>state.sortKey),'','removing a sorted column clears its hidden sort');
    assert.deepEqual(f.errors,[]);
  }finally{await f.browser.close();}
});

test('column preferences survive preset switches, keep identity-only layouts, and are scoped to the spreadsheet',async()=>{
  const f=await fixture();const {page}=f;
  try {
    await page.getByRole('button',{name:'表示項目を編集',exact:true}).click();
    const dialog=page.getByRole('dialog',{name:'表示項目を編集'});
    const selected=await dialog.locator('input:checked').evaluateAll(inputs=>inputs.map(input=>input.dataset.columnToggle));
    for(const key of selected)await dialog.locator('[data-column-toggle="'+key+'"]').uncheck();
    await dialog.getByRole('button',{name:'適用',exact:true}).click();
    assert.deepEqual(await page.evaluate(()=>getVisibleColumns().map(c=>c.key)),['number','name']);
    assert.equal((await page.evaluate(()=>buildVisibleRowsCsvText(getFilteredRows()))).split('\r\n')[0],'番号,氏名');
    for(const mode of ['standard','follow','detail','distribution']) {
      await page.locator('#viewModeSelect').selectOption(mode);
      assert.deepEqual((await page.evaluate(()=>getVisibleColumns().map(c=>c.key))).slice(0,2),['number','name']);
    }
    await page.locator('#viewModeSelect').selectOption('custom');
    await page.evaluate(()=>sessionStorage.setItem(viewPreferencesKey(),JSON.stringify({viewMode:'standard',sortKey:'attempts',sortDirection:'desc'})));
    await page.reload();await f.ready();
    assert.deepEqual(await page.evaluate(()=>getVisibleColumns().map(c=>c.key)),['number','name'],'latest persistent mode wins over a stale tab preference');
    assert.equal(await page.evaluate(()=>state.sortKey),'','sort restoration uses the final visible columns');
    await page.evaluate(()=>sessionStorage.clear());await page.reload();await f.ready();
    assert.deepEqual(await page.evaluate(()=>getVisibleColumns().map(c=>c.key)),['number','name'],'persistent preference works without session storage');
    f.data.maintenanceLinks.spreadsheetUrl='https://docs.google.com/spreadsheets/d/another-book/edit';
    await page.reload();await f.ready();
    assert.equal(await page.locator('#viewModeSelect').inputValue(),'standard','another spreadsheet starts with its own preference');
    await page.evaluate(()=>localStorage.setItem(columnPreferencesKey(),'{malformed'));
    await page.reload();await f.ready();
    assert.equal(await page.locator('#viewModeSelect').inputValue(),'standard');
    assert.deepEqual(f.errors,[]);
  }finally{await f.browser.close();}
});

test('column editor supports desktop drag and mobile keyboard moves with fixed identity columns',async()=>{
  const f=await fixture();const {page}=f;
  try {
    await page.getByRole('button',{name:'表示項目を編集',exact:true}).click();
    const dialog=page.getByRole('dialog',{name:'表示項目を編集'});
    await dialog.getByRole('checkbox',{name:'平均解答時間',exact:true}).check();
    await page.setViewportSize({width:1100,height:1400});await dialog.evaluate(el=>el.scrollTop=0);
    await dialog.locator('[data-column-key="averageElapsedMs"]').dragTo(dialog.locator('[data-column-key="status"]'),{sourcePosition:{x:5,y:10},targetPosition:{x:5,y:10}});
    await dialog.getByRole('button',{name:'適用',exact:true}).click();
    assert.deepEqual((await page.evaluate(()=>getVisibleColumns().map(c=>c.key))).slice(0,3),['number','name','averageElapsedMs']);
    await page.setViewportSize({width:390,height:844});
    await page.getByRole('button',{name:'表示項目を編集',exact:true}).click();
    assert.ok((await dialog.boundingBox()).width<=390);
    assert.equal(await dialog.getByRole('button',{name:'平均解答時間を上へ',exact:true}).isDisabled(),true);
    await dialog.getByRole('button',{name:'平均解答時間を下へ',exact:true}).focus();await page.keyboard.press('Enter');
    await mkdir('output/playwright',{recursive:true});await page.screenshot({path:'output/playwright/monitor-columns-mobile.png'});
    await dialog.getByRole('button',{name:'適用',exact:true}).click();
    assert.deepEqual((await page.evaluate(()=>getVisibleColumns().map(c=>c.key))).slice(0,4),['number','name','status','averageElapsedMs']);
    assert.deepEqual(f.errors,[]);
  }finally{await f.browser.close();}
});

test('saved column configuration rejects unknown fields and survives unavailable storage',async()=>{
  const f=await fixture();const {page}=f;
  try {
    assert.equal(await page.evaluate(()=>typeof columnPreferencesKey),'function');
    await page.evaluate(()=>{sessionStorage.clear();localStorage.setItem(columnPreferencesKey(),JSON.stringify({version:1,mode:'custom',columns:['name','<img src=x onerror=alert(1)>','totalCorrect','totalCorrect']}));});
    await page.reload();await f.ready();
    assert.deepEqual(await page.evaluate(()=>getVisibleColumns().map(c=>c.key)),['number','name','totalCorrect']);
    await page.evaluate(()=>{Storage.prototype.setItem=function(){throw Error('Storage denied');};});
    await page.getByRole('button',{name:'表示項目を編集',exact:true}).click();
    const dialog=page.getByRole('dialog',{name:'表示項目を編集'});
    await dialog.getByRole('checkbox',{name:'平均解答時間',exact:true}).check();await dialog.getByRole('button',{name:'適用',exact:true}).click();
    assert.ok((await page.evaluate(()=>getVisibleColumns().map(c=>c.key))).includes('averageElapsedMs'));
    assert.match(await page.locator('#statusLine').innerText(),/保存できません/);assert.deepEqual(f.errors,[]);
  }finally{await f.browser.close();}
});
