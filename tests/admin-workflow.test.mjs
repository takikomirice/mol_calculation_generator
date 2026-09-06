import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import {chromium} from 'playwright';

const sheetUrl='https://docs.google.com/spreadsheets/d/synthetic-book/edit';
const rows=Array.from({length:4},(_,i)=>({rosterKey:'course::s'+i,courseId:i<2?'class-a':'class-b',courseName:'化学',number:i%2+1,name:'生徒'+i,totalAttempts:3,totalCorrect:2,statusLabel:'解答中',followUp:i===1}));
const html=(await readFile('Monitor.html','utf8')).replace(/<\?!=[\s\S]*?\?>/g,s=>s.includes('initialReviewBenchmark')?'false':'"teacher-secret"');
const bridge=`<script>window.google={script:{run:{withSuccessHandler(success){return {withFailureHandler(failure){return new Proxy({},{get:(_,method)=>(...args)=>window.gasCall(method,args).then(success,failure)});}};}}}};<\/script>`;
async function openApp({mobile=false}={}) {
  const browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:mobile?{width:390,height:844}:{width:1280,height:900}});
  const dataRows=rows.map(row=>({...row}));const overrides={};
  const calls=[],errors=[];const gates={};page.on('pageerror',e=>errors.push(e.message));
  await page.exposeFunction('gasCall',async(method,args)=>{
    calls.push({method,args});assert.equal(args[0],'teacher-secret');
    if(gates[method])await gates[method](args);
    if(overrides[method])return overrides[method](args);
    if(method==='refreshMonitorDashboard')return {ok:true,complete:true,processed:12,total:12,data:{progressRows:dataRows,dashboardMetrics:{},maintenanceLinks:{spreadsheetUrl:sheetUrl}}};
    if(method==='getMonitorStudentAnswerReview')return {rows:[{attemptId:args[1]+'-answer',level:'lv1',problemType:'mol_to_mass',questionText:args[1]+' の問題',isCorrect:false,submittedAnswer:'1',expectedAnswerText:'2 g',explanation:'説明'}],nextBeforeRow:null};
    if(method==='getCurrentMonitorStudentProblemTypeStats')return [];
    if(method==='getMonitorOperationLinks')return {sheets:{settings:sheetUrl+'#gid=1',tokens:sheetUrl+'#gid=2',roster:sheetUrl+'#gid=3',classrooms:sheetUrl+'#gid=4',distribution:sheetUrl+'#gid=5',execution:''},studentRows:args[1]?{tokens:sheetUrl+'#gid=2&range=A3',roster:sheetUrl+'#gid=3&range=A3'}:{}};
    throw Error('unexpected API '+method);
  });
  await page.route('https://admin.test/**',r=>r.fulfill({contentType:'text/html',body:bridge+html}));
  await page.goto('https://admin.test/');await page.locator('[data-history="course::s0"]').waitFor();
  return {browser,page,calls,errors,gates,dataRows,overrides};
}

test('teacher filters distinguish same-name classes, survive reload, reset clearly and make no extra calls',async()=>{
  const r=await openApp();const {page}=r;
  try {
    assert.equal(await page.locator('#filterSummary').count(),1);
    await page.locator('#courseFilter').selectOption('class-b');
    assert.equal(await page.locator('[data-history]').count(),2);
    assert.match(await page.locator('#filterSummary').innerText(),/2.*4/);
    await page.locator('#viewModeSelect').selectOption('detail');
    await page.locator('[data-sort-key="number"]').click();
    await page.reload();await page.locator('[data-history="course::s2"]').waitFor();
    assert.equal(await page.locator('#courseFilter').inputValue(),'class-b');
    assert.equal(await page.locator('#viewModeSelect').inputValue(),'detail');
    assert.equal(await page.locator('[data-history]').count(),2);
    await page.locator('#searchInput').fill('見つからない');
    assert.equal(await page.locator('[data-history]').count(),0);
    await page.getByRole('button',{name:'絞り込みを解除',exact:true}).click();
    assert.equal(await page.locator('[data-history]').count(),4);
    assert.equal(await page.locator('#viewModeSelect').inputValue(),'detail');
    assert.ok(r.calls.every(c=>c.method==='refreshMonitorDashboard'));
    assert.deepEqual(r.errors,[]);
  } finally {await r.browser.close();}
});

test('sequential reviews keep filters and roster order, reject late replies, and return focus',async()=>{
  const r=await openApp();const {page}=r;let release;
  try {
    assert.equal(await page.locator('#reviewNextStudent').count(),1);
    await page.locator('#courseFilter').selectOption('class-a');
    await page.locator('[data-history="course::s0"]').click();await page.locator('.review-card').waitFor();
    await page.locator('#reviewResultFilter').selectOption('incorrect');
    await page.waitForFunction(()=>document.querySelector('#answerHistoryBody').getAttribute('aria-busy')==='false');
    r.gates.getMonitorStudentAnswerReview=async args=>{if(args[1]==='course::s1')await new Promise(resolve=>release=resolve);};
    await page.getByRole('button',{name:'次の生徒',exact:true}).click();
    await page.getByRole('button',{name:'前の生徒',exact:true}).click();
    await page.locator('.review-card').waitFor();release();
    await page.waitForTimeout(30);
    assert.match(await page.locator('#historyTitle').innerText(),/生徒0/);
    assert.match(await page.locator('#answerHistoryBody').innerText(),/course::s0/);
    assert.doesNotMatch(await page.locator('#answerHistoryBody').innerText(),/course::s1/);
    assert.equal(await page.locator('#reviewResultFilter').inputValue(),'incorrect');
    assert.equal(await page.locator('#reviewPreviousStudent').isDisabled(),true);
    r.gates.getMonitorStudentAnswerReview=null;
    await page.getByRole('button',{name:'次の生徒',exact:true}).click();await page.locator('.review-card').waitFor();
    assert.equal(await page.locator('#reviewNextStudent').isDisabled(),true);
    assert.match(await page.locator('#reviewPosition').innerText(),/2.*2/);
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('[data-history="course::s0"]').evaluate(el=>el===document.activeElement),true);
    assert.deepEqual(r.errors,[]);
  } finally {release?.();await r.browser.close();}
});

test('management navigation is on demand, retryable, contextual and usable on mobile',async()=>{
  const r=await openApp({mobile:true});const {page}=r;
  try {
    assert.equal(await page.locator('#operationsDialog').count(),1);
    assert.equal(r.calls.filter(c=>c.method==='getMonitorOperationLinks').length,0);
    r.gates.getMonitorOperationLinks=()=>{throw Error('一時的な通信エラー');};
    await page.getByRole('button',{name:'管理操作',exact:true}).click();
    await page.locator('#operationsRetry').waitFor();
    r.gates.getMonitorOperationLinks=null;await page.locator('#operationsRetry').click();
    await page.locator('#operationsDialog a[href$="#gid=1"]').waitFor();
    assert.equal(await page.locator('#operationsDialog').evaluate(el=>el.scrollWidth<=el.clientWidth),true);
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#openSpreadsheetButton').evaluate(el=>el===document.activeElement),true);
    await page.locator('[data-history="course::s1"]').click();await page.locator('.review-card').waitFor();
    await page.getByRole('button',{name:'この生徒の管理',exact:true}).click();
    await page.locator('#operationsDialog a[href$="range=A3"]').first().waitFor();
    assert.match(await page.locator('#operationsContext').innerText(),/生徒1/);
    assert.ok(r.calls.filter(c=>c.method==='getMonitorOperationLinks').at(-1).args.includes('course::s1'));
    await page.screenshot({path:'output/playwright/admin-operations-mobile.png'});
    await page.keyboard.press('Escape');assert.equal(await page.locator('#historyModal').isVisible(),true);
    assert.equal(await page.locator('#reviewOperationsButton').evaluate(el=>el===document.activeElement),true);
    assert.deepEqual(r.errors,[]);
  } finally {await r.browser.close();}
});


test('review queue stays stable across refresh and restores the replaced list button',async()=>{
  const r=await openApp();const {page}=r;
  try {
    await page.locator('#courseFilter').selectOption('class-a');
    await page.locator('[data-history="course::s0"]').click();await page.locator('.review-card').waitFor();
    r.dataRows[1].number=0;await page.evaluate(()=>loadDashboard());
    await page.getByRole('button',{name:'次の生徒',exact:true}).click();await page.locator('.review-card').waitFor();
    assert.match(await page.locator('#historyTitle').innerText(),/生徒1/,'the review keeps the original ordered queue');
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('[data-history="course::s0"]').evaluate(el=>el===document.activeElement),true);
    assert.deepEqual(r.errors,[]);
  } finally {await r.browser.close();}
});

test('operation dialog ignores closed requests and blocks unexpected link origins',async()=>{
  const r=await openApp();const {page}=r;let release;
  try {
    r.gates.getMonitorOperationLinks=async args=>{if(!args[1])await new Promise(resolve=>release=resolve);};
    await page.getByRole('button',{name:'管理操作',exact:true}).click();await page.keyboard.press('Escape');
    await page.locator('[data-history="course::s1"]').click();await page.locator('.review-card').waitFor();
    await page.getByRole('button',{name:'この生徒の管理',exact:true}).click();
    await page.locator('#operationsDialog a[href$="range=A3"]').first().waitFor();
    release();await page.waitForTimeout(30);
    assert.match(await page.locator('#operationsContext').innerText(),/生徒1/);
    assert.equal(await page.locator('#operationsDialog a[href$="range=A3"]').count(),2);
    await page.keyboard.press('Escape');await page.keyboard.press('Escape');
    r.gates.getMonitorOperationLinks=null;
    r.overrides.getMonitorOperationLinks=()=>({sheets:{settings:'javascript:alert(1)',tokens:'https://docs.google.com.evil.test/spreadsheets/d/x/edit'},studentRows:{}});
    await page.getByRole('button',{name:'管理操作',exact:true}).click();
    await page.getByText('操作場所を確認しました。リンクは別タブで開きます。',{exact:true}).waitFor();
    assert.equal(await page.locator('#operationsContent a').count(),0);
    assert.deepEqual(r.errors,[]);
  } finally {release?.();await r.browser.close();}
});

test('unavailable preference storage does not block the monitor or filter clearing',async()=>{
  const r=await openApp();const {page}=r;
  try {
    await page.addInitScript(()=>Object.defineProperty(window,'sessionStorage',{get(){throw Error('blocked');}}));
    await page.reload();await page.locator('[data-history="course::s0"]').waitFor();
    await page.locator('#courseFilter').selectOption('class-b');
    await page.getByRole('button',{name:'絞り込みを解除',exact:true}).click();
    assert.equal(await page.locator('[data-history]').count(),4);assert.deepEqual(r.errors,[]);
  } finally {await r.browser.close();}
});
