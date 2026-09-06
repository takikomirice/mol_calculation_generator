import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import test from 'node:test';
import {chromium} from 'playwright';

const source = await readFile('Code.gs', 'utf8');
function sheet(name, values) {
  return {values, reads: [], writes: 0, failWrite: false,
    getName: () => name,
    appendRow(row) {if(this.failWrite)throw Error('write interrupted');this.writes++;this.values.push(Array.from(row));},
    getMaxRows:()=>1000, getMaxColumns:()=>26, insertRowsAfter(){}, insertColumnsAfter(){},
    getLastRow() { let count = this.values.length; while (count > 1 && this.values[count-1].every(v => v === '')) count--; return count; },
    getLastColumn() { return this.values[0].length; },
    getDataRange() { return this.getRange(1, 1, this.getLastRow(), this.getLastColumn()); },
    getRange(row, column, height=1, width=1) {
      const target=this;
      return {
        createTextFinder(query) {
          let offset=0,exact=false,sensitive=false;
          return {matchEntireCell(value){exact=value;return this;},matchCase(value){sensitive=value;return this;},
            findAll(){offset=0;const matches=[];let cell;while((cell=this.findNext()))matches.push(cell);return matches;},
            findNext(){
              while(offset<height) {
                const foundRow=row+offset++;const raw=String(target.values[foundRow-1]?.[column-1] ?? '');
                const value=sensitive?raw:raw.toLowerCase();const search=sensitive?String(query):String(query).toLowerCase();
                if(exact?value===search:value.includes(search))return {getRow:()=>foundRow};
              }
              return null;
            }};
        },
        getValues() { target.reads.push({row,column,height,width}); return Array.from({length:height}, (_,r) => Array.from({length:width},(_,c) => target.values[row+r-1]?.[column+c-1] ?? '')); },
        getValue() { return this.getValues()[0][0]; },
        setValues(rows) { if(target.failWrite) throw Error('write interrupted'); target.writes++; rows.forEach((v,r) => { const destination=target.values[row+r-1] ||= new Array(target.getLastColumn()).fill(''); v.forEach((x,c) => destination[column+c-1]=x); }); }
      };
    }
  };
}
function environment(shared={}) {
  const sheets=shared.sheets || {};
  const lock=shared.lock || {available:true, held:false};
  const sequence=shared.sequence || {value:0};
  const lookups=shared.lookups || {active:0,sheets:0};
  const context={console:{log(){},info(){},error(){}}, globalThis:{},
    ScriptApp:{getScriptId:()=>shared.scriptId || '1opnwxGruF4ZYiVvQxADm2-oJcE_ZCLBkPlysFBAx-CTi2GQKN-wMgCnp'},
    SpreadsheetApp:{flush(){},getActiveSpreadsheet:()=>{lookups.active++;return {getSheetByName:name=>{lookups.sheets++;return sheets[name];},insertSheet:name=>sheets[name]=sheet(name,[[]]),getUrl:()=> 'https://example.test/sheet'};}},
    LockService:{getScriptLock:()=>({waitLock:()=>{if(!lock.available||lock.held)throw Error('busy');lock.held=true;},tryLock:()=> { if(!lock.available||lock.held)return false;lock.held=true;return true;},releaseLock:()=>{lock.held=false;}})}};
  if (shared.cache) {
    context.CacheService={getScriptCache:()=>({get:key=>shared.cache.get(key)||null,put:(key,value)=>shared.cache.set(key,value),
      getAll:keys=>Object.fromEntries(keys.filter(key=>shared.cache.has(key)).map(key=>[key,shared.cache.get(key)])),
      putAll:values=>{for(const [key,value] of Object.entries(values))shared.cache.set(key,value);},remove:key=>shared.cache.delete(key)})};
    context.Utilities={getUuid:()=>String(++sequence.value)};
  }
  vm.runInNewContext(source+'\nglobalThis.api={MonitorRefreshService,AdminService,SheetRepository,AggregationService,AnswerService,refreshMonitorDashboard,getMonitorStudentAnswerReview,getCurrentMonitorStudentProblemTypeStats,ReviewBenchmarkService,prepareMonitorReviewBenchmark,getReviewBenchmarkDashboard,getReviewBenchmarkPage,getReviewBenchmarkStats,TokenService,prepareStudentLoadBenchmark:typeof prepareStudentLoadBenchmark==="undefined"?undefined:prepareStudentLoadBenchmark,submitStudentLoadBenchmark:typeof submitStudentLoadBenchmark==="undefined"?undefined:submitStudentLoadBenchmark,finishStudentLoadBenchmark:typeof finishStudentLoadBenchmark==="undefined"?undefined:finishStudentLoadBenchmark,getMonitorOperationLinks:typeof getMonitorOperationLinks==="undefined"?undefined:getMonitorOperationLinks,definitions:MOL_DRILL_SHEETS};',context);
  const api=context.globalThis.api;
  api.AdminService.getAdminToken=()=> 'teacher-secret';
  for(const definition of api.definitions) if(!sheets[definition.name]) sheets[definition.name]=sheet(definition.name,[Array.from(definition.headers)]);
  api.SheetRepository.assertManagementSheetsReady=()=> {throw Error('full schema scan is forbidden on refresh');};
  return {...api,sheets,lock,cache:shared.cache,sequence,lookups};
}
function append(env,name,entry) {
  const target=env.sheets[name];target.values.push(target.values[0].map(key => entry[key] ?? ''));
}
function populate(env,count=100) {
  append(env,'Classroom一覧',{courseId:'course',name:'化学',同期対象:true});
  for(let i=0;i<count;i++) {
    const entry={courseId:'course',courseName:'化学',rosterKey:'course::s'+i,studentId:'s'+i,氏名:'検証生徒'+i,出席番号:i+1,状態:'在籍'};
    append(env,'生徒名簿',entry);append(env,'トークン管理',{...entry,token:'test-token-'+i});
    append(env,'配付ログ',{rosterKey:entry.rosterKey,status:i===0?'ERROR':'SUCCESS'});
  }
}
function answer(i,student=i%100) {
  return {attemptId:'attempt-'+i,rosterKey:'course::s'+student,courseId:'course',studentId:'s'+student,
    timestamp:new Date(Date.UTC(2026,8,6,10,0,0)+Math.floor(i/3)*1000).toISOString(),
    level:'lv'+(i%6+1),problemType:i%2?'mol_to_mass':'mass_to_mol',isCorrect:i%3===0,
    elapsedMs:i%7===0?0:1000+(i%19)*100};
}
function logObject(entry) { return {...entry,number:'',name:'',courseName:''}; }

test('durable refresh batches 5,003 answers for 100 students and matches independent full aggregation',()=>{
  let env=environment();populate(env);
  const logs=Array.from({length:5003},(_,i)=>answer(i));
  // Arrival order may differ from the submitted timestamp under simultaneous use.
  [logs[4980],logs[4999]]=[logs[4999],logs[4980]];
  logs.forEach(row=>append(env,'解答ログ',row));
  let result;let batches=0;
  do { env=environment(env);result=env.refreshMonitorDashboard('teacher-secret');batches++; } while(!result.complete);
  assert.equal(batches,11);assert.equal(result.data.dashboardMetrics.totalAnswers,5003);
  const expected=env.AggregationService.buildAggregateRows(logs.map(logObject),'');
  for(const actual of result.data.progressRows) {
    const full=expected.find(row=>row.rosterKey===actual.rosterKey);
    for(const key of ['totalAttempts','totalCorrect','totalAccuracy','recent10Attempts','recent10Correct','recent10Accuracy','averageElapsedMs','recent10AverageElapsedMs','recent10MedianElapsedMs','correctAverageElapsedMs','correctRecent10AverageElapsedMs','first10AverageElapsedMs','speedImprovementRate','lastAnsweredAt','lastLevel','lastProblemType','lastElapsedMs',...Array.from({length:6},(_,i)=>'lv'+(i+1)+'Attempts')]) assert.equal(actual[key],full[key],actual.rosterKey+' '+key);
  }
  const reads=env.sheets['解答ログ'].reads.filter(r=>r.width>1&&r.row>1);
  assert.equal(reads.length,11);assert.ok(reads.every(r=>r.height<=500));
  const cachedRows=env.sheets['モニターキャッシュ'].values;
  assert.ok(cachedRows.length>2,'checkpoint crosses sheet-cell chunk boundaries');
  assert.ok(cachedRows.every(row=>String(row[1]||'').length<=30000));
  env=environment(env);const writes=env.sheets['モニターキャッシュ'].writes;
  result=env.refreshMonitorDashboard('teacher-secret');assert.equal(result.data.dashboardMetrics.totalAnswers,5003);
  assert.equal(env.sheets['モニターキャッシュ'].writes,writes,'no new answers requires no checkpoint write');
  append(env,'解答ログ',answer(5003));env=environment(env);
  result=env.refreshMonitorDashboard('teacher-secret');assert.equal(result.data.dashboardMetrics.totalAnswers,5004);
  assert.equal(env.sheets['解答ログ'].reads.filter(r=>r.width>1&&r.row>1).at(-1).height,1);
});

test('interrupted persistence, repeated refresh, truncated logs and denied access do not miscount',()=>{
  let env=environment();populate(env,1);append(env,'解答ログ',answer(0,0));
  assert.equal(env.refreshMonitorDashboard('teacher-secret').data.dashboardMetrics.totalAnswers,1);
  append(env,'解答ログ',answer(1,0));env.sheets['モニターキャッシュ'].failWrite=true;
  assert.throws(()=>env.refreshMonitorDashboard('teacher-secret'),/write interrupted/);
  assert.equal(env.lock.held,false);
  env.sheets['モニターキャッシュ'].failWrite=false;env=environment(env);
  assert.equal(env.refreshMonitorDashboard('teacher-secret').data.dashboardMetrics.totalAnswers,2);
  assert.equal(env.refreshMonitorDashboard('teacher-secret').data.dashboardMetrics.totalAnswers,2);
  const readCount=env.sheets['解答ログ'].reads.length;
  assert.throws(()=>env.refreshMonitorDashboard('test-token-0'),/内部認証/);
  env.lock.available=false;assert.throws(()=>env.refreshMonitorDashboard('teacher-secret'),/別の処理/);
  assert.equal(env.sheets['解答ログ'].reads.length,readCount);
  env.lock.available=true;env.sheets['解答ログ'].values.pop();env=environment(env);
  assert.equal(env.refreshMonitorDashboard('teacher-secret').data.dashboardMetrics.totalAnswers,1);
  env.sheets['解答ログ'].values[1][1]='replacement-attempt';env=environment(env);
  assert.equal(env.refreshMonitorDashboard('teacher-secret').data.dashboardMetrics.totalAnswers,1);
});

test('new submissions during a batch are caught next refresh without moving the original cutoff',()=>{
  let env=environment();populate(env,1);
  for(let i=0;i<501;i++)append(env,'解答ログ',answer(i,0));
  assert.equal(env.refreshMonitorDashboard('teacher-secret').complete,false);
  append(env,'解答ログ',answer(501,0));env=environment(env);
  const completed=env.refreshMonitorDashboard('teacher-secret');
  assert.equal(completed.complete,true);assert.equal(completed.data.dashboardMetrics.totalAnswers,501);
  assert.equal(env.refreshMonitorDashboard('teacher-secret').data.dashboardMetrics.totalAnswers,502);
});

test('refresh uses current roster, token revocation and distribution outcomes and excludes test students',()=>{
  let env=environment();populate(env,2);
  let rows=env.refreshMonitorDashboard('teacher-secret').data.progressRows;
  assert.equal(rows[0].distributionStatus,'配付失敗');assert.equal(rows[1].distributionStatus,'配付済み');
  const tokens=env.sheets['トークン管理'];tokens.values[2][tokens.values[0].indexOf('revoked')]='済';
  append(env,'解答ログ',{...answer(0),rosterKey:'__TEST__::test-student'});
  env=environment(env);rows=env.refreshMonitorDashboard('teacher-secret').data.progressRows;
  assert.equal(rows[1].distributionStatus,'未配付');assert.equal(rows.reduce((sum,row)=>sum+row.totalAttempts,0),0);
});

test('monitor JavaScript keeps one update button, preserves old results on failure, and completes batched updates',async()=>{
  const env=environment();populate(env,1);
  const browser=await chromium.launch({headless:true});const page=await browser.newPage();
  const errors=[];page.on('pageerror',error=>errors.push(error.message));let calls=0;let fail=false;let release;
  await page.exposeFunction('gasCall',async(method,args)=>{
    assert.equal(method,'refreshMonitorDashboard');assert.equal(args[0],'teacher-secret');calls++;
    if(fail)throw Error('接続を確認してください');
    if(release)await new Promise(resolve=>{release=resolve;});
    return JSON.parse(JSON.stringify(env.refreshMonitorDashboard(...args)));
  });
  const bridge=`<script>
    window.google = { script: { run: {
      withSuccessHandler(success) {
        return { withFailureHandler(failure) {
          return new Proxy({}, { get(_target, method) {
            return (...args) => window.gasCall(method, args).then(success, failure);
          } });
        } };
      }
    } } };
  <\/script>`;
  try {
    const html=(await readFile('Monitor.html','utf8')).replace(/<\?!=[\s\S]*?\?>/g,'"teacher-secret"');
    await page.setContent(bridge+html);
    await page.waitForFunction(()=>document.querySelector('#refreshButton').disabled===false && document.querySelector('#statusLine').textContent.includes('最新の解答を反映しました'),null,{timeout:5000}).catch(async error=>{throw Error(JSON.stringify({errors,status:await page.locator('#statusLine').innerText(),calls}));});
    assert.equal(await page.getByRole('button',{name:'更新',exact:true}).count(),1);
    assert.equal(await page.getByRole('button',{name:'モニターだけ更新',exact:true}).count(),0);
    const originalTime=await page.locator('#lastUpdatedAt').innerText();
    fail=true;await page.getByRole('button',{name:'更新',exact:true}).click();
    await page.getByText('前回の表示を保持しています。',{exact:false}).waitFor();
    assert.equal(await page.locator('#lastUpdatedAt').innerText(),originalTime);
    assert.equal(await page.locator('#studentBody').getByText('検証生徒0',{exact:true}).count(),1);
    fail=false;for(let i=0;i<501;i++)append(env,'解答ログ',answer(i,0));
    release=true;await page.getByRole('button',{name:'更新',exact:true}).click();
    await page.waitForFunction(()=>document.querySelector('#refreshButton').disabled===true);
    assert.equal(await page.locator('#studentBody').getByText('検証生徒0',{exact:true}).count(),1);
    await page.evaluate(() => loadDashboard());
    assert.equal(calls,3,'a refresh while the previous request is pending must not overlap');
    const unblock=release;release=null;unblock();
    await page.waitForFunction(()=>document.querySelector('#refreshButton').disabled===false);
    assert.equal(await page.locator('#kpiTotalAnswers').innerText(),'501');
    assert.equal(calls,4,'one initial request, one failed request, two bounded refresh batches');
    assert.deepEqual(errors,[]);
  } finally {await browser.close();}
});


test('checkpoint cache loss restores the durable cursor without rereading old answers',()=>{
  let env=environment({cache:new Map()});populate(env,100);
  for(let i=0;i<1200;i++)append(env,'解答ログ',answer(i));
  let result;
  do {env=environment(env);result=env.refreshMonitorDashboard('teacher-secret');}while(!result.complete);
  const stateReads=env.sheets['モニターキャッシュ'].reads.length;
  const logReads=env.sheets['解答ログ'].reads.filter(row=>row.width>1&&row.row>1).length;
  env=environment(env);assert.equal(env.refreshMonitorDashboard('teacher-secret').data.dashboardMetrics.totalAnswers,1200);
  assert.equal(env.sheets['モニターキャッシュ'].reads.length,stateReads);
  const keys=JSON.parse(env.cache.get('monitorRefresh:manifest:v1'));assert.ok(keys.length>1);env.cache.delete(keys[0]);
  env=environment(env);assert.equal(env.refreshMonitorDashboard('teacher-secret').data.dashboardMetrics.totalAnswers,1200);
  assert.equal(env.sheets['解答ログ'].reads.filter(row=>row.width>1&&row.row>1).length,logReads);
  env.cache.clear();append(env,'解答ログ',answer(1200));env=environment(env);
  assert.equal(env.refreshMonitorDashboard('teacher-secret').data.dashboardMetrics.totalAnswers,1201);
});


test('review pages isolate students, retain grading details and scan at most 500 rows per request',()=>{
  const env=environment();populate(env,2);
  for(let i=0;i<1205;i++) append(env,'解答ログ',{
    ...answer(i,i%2),questionText:'水 36.0 g の物質量は？',expectedAnswer:'2',submittedAnswer:i===1204?'2.0':'2.00',
    significantDigits:3,unit:'mol',explanation:'36.0 ÷ 18.0 = 2.00 mol',
    token:'never-expose',clientInfo:JSON.stringify({acceptedAnswerType:i===1204?'precision':'exact',device:'private'})
  });
  const before=env.sheets['解答ログ'].reads.length;
  assert.throws(()=>env.getMonitorStudentAnswerReview('test-token-0','course::s0',{}),/内部認証/);
  assert.equal(env.sheets['解答ログ'].reads.length,before);
  assert.throws(()=>env.getMonitorStudentAnswerReview('teacher-secret','course::s0',{beforeRow:1}),/続き位置/);
  assert.throws(()=>env.getMonitorStudentAnswerReview('teacher-secret','course::s0',{result:'anything'}),/絞り込み/);
  let cursor=null;const actual=[];
  do {
    const page=env.getMonitorStudentAnswerReview('teacher-secret','course::s0',{result:'incorrect',level:'lv5',beforeRow:cursor});
    assert.ok(page.rows.length<=20);
    actual.push(...page.rows);cursor=page.nextBeforeRow;
  } while(cursor);
  const expected=Array.from({length:1205},(_,i)=>answer(i,i%2)).filter(row=>row.rosterKey==='course::s0' && !row.isCorrect && row.level==='lv5').reverse();
  assert.deepEqual(actual.map(row=>row.attemptId),expected.map(row=>row.attemptId));
  assert.equal(actual[0].submittedAnswer,'2.0');assert.equal(actual[0].expectedAnswerText,'2.00 mol');
  assert.equal(actual[0].acceptedAnswerType,'precision');assert.equal(actual[0].explanation,'36.0 ÷ 18.0 = 2.00 mol');
  assert.ok(!JSON.stringify(actual).includes('never-expose'));assert.ok(!JSON.stringify(actual).includes('private'));
  assert.ok(env.sheets['解答ログ'].reads.filter(r=>r.row>1).every(r=>r.height<=500));
  const initial=env.getMonitorStudentAnswerReview('teacher-secret','course::s1',{});
  append(env,'解答ログ',answer(9999,1));
  const next=env.getMonitorStudentAnswerReview('teacher-secret','course::s1',{beforeRow:initial.nextBeforeRow});
  assert.ok(next.rows.every(row=>!initial.rows.some(old=>old.attemptId===row.attemptId)));
  assert.ok(next.rows.every(row=>row.attemptId!=='attempt-9999'));
  const missing=env.getMonitorStudentAnswerReview('teacher-secret','missing',{});
  assert.equal(missing.rows.length,0);assert.ok(missing.nextBeforeRow,'empty pages can still have older matches');
  assert.equal(env.getMonitorStudentAnswerReview('teacher-secret','__TEST__::test-student',{}).rows.length,0);
});

test('review panel shows full problems on demand, filters, appends, retries and guards stale replies at desktop and mobile widths',async()=>{
  const env=environment();populate(env,2);
  for(let i=0;i<45;i++)append(env,'解答ログ',{...answer(i,0),level:i%2?'lv1':'lv5',isCorrect:i%2===1,
    questionText:'水のモル質量を18.0 g/molとして、水36.0 gの物質量を有効数字3桁で答えなさい。省略されない問題文の末尾。',
    expectedAnswer:'2',submittedAnswer:'2.0',significantDigits:3,unit:'mol',
    explanation:'36.0 ÷ 18.0 = 2.00 mol\n<script>window.injected=true</script>',clientInfo:'{"acceptedAnswerType":"precision"}'});
  const browser=await chromium.launch({headless:true});const page=await browser.newPage();
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  let fail=false,hold=false,release;const calls=[];
  await page.exposeFunction('gasCall',async(method,args)=>{
    calls.push(method);assert.equal(args[0],'teacher-secret');
    if(method==='getCurrentMonitorStudentProblemTypeStats')return [];
    const result=JSON.parse(JSON.stringify(env[method](...args)));
    if(method==='getMonitorStudentAnswerReview'){
      if(fail)throw Error('一時的な通信エラー');
      if(hold){hold=false;await new Promise(resolve=>release=resolve);}
    }
    return result;
  });
  const bridge=`<script>window.google={script:{run:{withSuccessHandler(success){return {withFailureHandler(failure){return new Proxy({},{get:(_,method)=>(...args)=>window.gasCall(method,args).then(success,failure)});}};}}}};<\/script>`;
  try {
    const html=(await readFile('Monitor.html','utf8')).replace(/<\?!=[\s\S]*?\?>/g,'"teacher-secret"');
    await page.setContent(bridge+html);
    const open=page.locator('[data-history="course::s0"]');await open.waitFor();
    assert.equal(await page.locator('.review-card').count(),0,'dashboard contains no problem details');
    assert.equal(await page.locator('#loadBenchmarkPanel').isVisible(),false);
    const initialCalls=calls.length;await page.evaluate(()=>runStudentLoadMeasurement());assert.equal(calls.length,initialCalls,'normal monitoring cannot start load tests');
    await open.click();await page.waitForFunction(()=>document.querySelectorAll('.review-card').length===20);
    assert.equal(calls.filter(x=>x==='getCurrentMonitorStudentProblemTypeStats').length,0,'aggregate stats are lazy');
    assert.equal(await page.locator('.review-card[open]').count(),0);
    assert.ok((await page.locator('.review-card').first().innerText()).includes('省略されない問題文の末尾。'));
    await page.locator('.review-card > summary').first().click();
    assert.ok((await page.locator('.review-card').first().innerText()).includes('有効数字3桁の指定を満たしていません'));
    assert.ok((await page.locator('.review-card').first().innerText()).includes('2.00 mol'));
    assert.equal(await page.evaluate(()=>window.injected),undefined);
    await page.getByRole('button',{name:'続きを読み込む',exact:true}).click();
    await page.waitForFunction(()=>document.querySelectorAll('.review-card').length===40);
    assert.equal(await page.locator('.review-card[open]').count(),1,'expanded cards survive pagination');
    fail=true;await page.getByRole('button',{name:'続きを読み込む',exact:true}).click();await page.getByRole('button',{name:'再試行',exact:true}).waitFor();
    assert.equal(await page.locator('.review-card').count(),40);
    fail=false;await page.getByRole('button',{name:'再試行',exact:true}).click();
    await page.waitForFunction(()=>document.querySelectorAll('.review-card').length===45);
    assert.equal(await page.locator('#reviewMoreButton').isVisible(),false);
    await page.locator('#reviewResultFilter').selectOption('correct');
    await page.waitForFunction(()=>document.querySelectorAll('.review-card').length===20 && document.querySelector('#answerHistoryBody').getAttribute('aria-busy')==='false');
    assert.equal(await page.locator('.review-card .status-follow').count(),0);
    await page.locator('#reviewLevelFilter').selectOption('lv5');await page.getByText('条件に合う解答履歴はありません。',{exact:true}).waitFor();
    await page.locator('#reviewStats > summary').click();await page.getByText('問題タイプ統計はありません。',{exact:true}).waitFor();
    assert.equal(calls.filter(x=>x==='getCurrentMonitorStudentProblemTypeStats').length,1);
    await page.keyboard.press('Escape');assert.equal(await page.locator('#historyModal').isVisible(),false);
    assert.equal(await open.evaluate(el=>el===document.activeElement),true);
    // Closing and opening a different student must not show the old pending response.
    hold=true;await open.click();await page.waitForFunction(()=>document.querySelector('#answerHistoryBody').getAttribute('aria-busy')==='true');
    await page.keyboard.press('Escape');await page.locator('[data-history="course::s1"]').click();
    await page.getByText('条件に合う解答履歴はありません。',{exact:true}).waitFor();
    release();await page.waitForFunction(()=>document.querySelector('#historyTitle').textContent.includes('検証生徒1'));
    assert.equal(await page.locator('.review-card').count(),0);
    await page.keyboard.press('Escape');await page.setViewportSize({width:390,height:844});await open.click();
    await page.waitForFunction(()=>document.querySelectorAll('.review-card').length===20);
    await page.locator('.review-card > summary').first().click();
    assert.equal(await page.locator('.modal-body').evaluate(el=>el.scrollWidth<=el.clientWidth),true,'review fits mobile width');
    await page.locator('#closeHistoryButton').focus();await page.keyboard.press('Shift+Tab');
    assert.equal(await page.locator('#reviewStats > summary').evaluate(el=>el===document.activeElement),true,'focus stays inside dialog');
    await page.locator('.modal-body').evaluate(el=>el.scrollTop=0);
    await page.screenshot({path:'output/playwright/student-review-mobile.png'});
    await page.setViewportSize({width:1280,height:900});await page.screenshot({path:'output/playwright/student-review-desktop.png'});
    assert.deepEqual(errors,[]);
  } finally {await browser.close();}
});


test('benchmark fixtures are idempotent and isolated, and refuse student auth or another GAS project',()=>{
  const env=environment();populate(env,2);append(env,'解答ログ',answer(1,0));
  const original=JSON.stringify(Object.fromEntries(Object.entries(env.sheets).map(([key,value])=>[key,value.values])));
  assert.throws(()=>env.prepareMonitorReviewBenchmark('test-token-0'),/内部認証/);
  assert.equal(env.prepareMonitorReviewBenchmark('teacher-secret').answers,1200);
  const fixture=env.sheets[env.ReviewBenchmarkService.sheetName_()];
  const writes=fixture.writes;
  env.prepareMonitorReviewBenchmark('teacher-secret');assert.equal(fixture.writes,writes);
  assert.equal(JSON.stringify(Object.fromEntries(Object.entries(env.sheets).filter(([key])=>key!==env.ReviewBenchmarkService.sheetName_()).map(([key,value])=>[key,value.values]))),original);
  assert.equal(env.getReviewBenchmarkDashboard('teacher-secret').data.progressRows.length,10);
  assert.equal(env.getReviewBenchmarkPage('teacher-secret','benchmark::s0',{}).rows.length,20);
  assert.throws(()=>env.getReviewBenchmarkPage('teacher-secret','course::s0',{}),/測定用/);
  const other=environment({scriptId:'another-project'});
  for(const name of ['prepareMonitorReviewBenchmark','getReviewBenchmarkDashboard','getReviewBenchmarkPage','getReviewBenchmarkStats']){
    assert.throws(()=>other[name]('teacher-secret','benchmark::s0',{}),/検証プロジェクト/);
    assert.throws(()=>env[name]('test-token-0','benchmark::s0',{}),/内部認証/);
  }
  fixture.values[0][0]='unexpected';assert.throws(()=>env.prepareMonitorReviewBenchmark('teacher-secret'),/列が一致/);
  assert.equal(fixture.writes,writes,'unexpected existing fixtures are never overwritten');
});

test('benchmark runner measures rendered responses, reports every operation and records failed runs',async()=>{
  const env=environment();env.prepareMonitorReviewBenchmark('teacher-secret');
  const browser=await chromium.launch({headless:true});const page=await browser.newPage();let fail=false;
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.exposeFunction('gasCall',async(method,args)=>{
    await new Promise(resolve=>setTimeout(resolve,80));
    if(fail && method==='getReviewBenchmarkPage') throw Error('simulated outage with private information');
    return JSON.parse(JSON.stringify(env[method](...args)));
  });
  const bridge=`<script>window.google={script:{run:{withSuccessHandler(success){return {withFailureHandler(failure){return new Proxy({},{get:(_,method)=>(...args)=>window.gasCall(method,args).then(success,failure)});}};}}}};<\/script>`;
  try {
    const html=(await readFile('Monitor.html','utf8')).replace(/<\?!=[^?]*initialReviewBenchmark[^?]*\?>/g,'true').replace(/<\?!=[\s\S]*?\?>/g,'"teacher-secret"');
    await page.setContent(bridge+html);
    await page.getByRole('button',{name:'測定データを準備',exact:true}).click();
    await page.waitForFunction(()=>!document.getElementById('benchmarkRun').disabled);
    await page.getByRole('button',{name:'測定を開始',exact:true}).click();
    await page.waitForFunction(()=>document.getElementById('benchmarkJson').textContent.length>0);
    const report=JSON.parse(await page.locator('#benchmarkJson').textContent());
    assert.equal(report.complete,true);assert.equal(report.samples.length,15);assert.equal(report.summary.length,5);
    assert.ok(report.samples.filter(s=>s.operation!=='expand-explanation').every(s=>s.elapsedMs>=80),'includes server wait and render, not just button click');
    assert.ok(report.samples.every(s=>s.ok && s.actionElapsedMs>=0 && s.frameWaitMs>=0 && s.actionElapsedMs+s.frameWaitMs===s.elapsedMs));
    assert.ok(!JSON.stringify(report).includes('teacher-secret'));
    const reduced=await page.evaluate(()=>summarizeBenchmark([{operation:'a',elapsedMs:10,ok:true,budgetMs:50},{operation:'a',elapsedMs:100,ok:true,budgetMs:50},{operation:'a',elapsedMs:999,ok:false,budgetMs:50}]));
    assert.deepEqual(reduced,[{operation:'a',samples:3,failures:1,overBudget:1,p50Ms:55,p95Ms:100,maxMs:100}]);
    fail=true;await page.getByRole('button',{name:'測定を開始',exact:true}).click();
    await page.waitForFunction(()=>!document.getElementById('benchmarkRun').disabled);
    const failed=JSON.parse(await page.locator('#benchmarkJson').textContent());
    assert.equal(failed.complete,false);assert.equal(failed.samples.length,1);assert.equal(failed.summary[0].failures,1);
    assert.equal(failed.summary[0].p95Ms,null);assert.equal(failed.samples[0].error,'operation-failed');
    assert.ok(!JSON.stringify(failed).includes('private information'));
    assert.deepEqual(errors,[]);
  } finally {await browser.close();}
});


test('teacher learning metrics distinguish effort from coverage and do not certify sparse or old successes',async()=>{
  const env=environment();populate(env,1);
  for(let i=0;i<5;i++)append(env,'解答ログ',{...answer(i,0),level:'lv1',problemType:'mol_to_mass',isCorrect:i!==0});
  for(let i=5;i<7;i++)append(env,'解答ログ',{...answer(i,0),level:'lv5',problemType:'mol_to_mass',isCorrect:true});
  const browser=await chromium.launch({headless:true});const page=await browser.newPage();
  await page.exposeFunction('gasCall',(method,args)=>JSON.parse(JSON.stringify(env[method](...args))));
  const bridge=`<script>window.google={script:{run:{withSuccessHandler(success){return {withFailureHandler(failure){return new Proxy({},{get:(_,method)=>(...args)=>window.gasCall(method,args).then(success,failure)});}};}}}};<\/script>`;
  try {
    const html=(await readFile('Monitor.html','utf8')).replace(/<\?!=[\s\S]*?\?>/g,'"teacher-secret"');
    await page.setContent(bridge+html);await page.locator('[data-history="course::s0"]').click();
    assert.equal(await page.locator('#reviewLearningMetrics').count(),1,'teacher detail contains learning metrics');
    assert.equal(await page.locator('#reviewLearningMetrics').isVisible(),false,'closed detail adds no dashboard clutter');
    await page.locator('#reviewStats > summary').click();await page.locator('#reviewLearningMetrics').waitFor();
    assert.match(await page.locator('#reviewEffort').innerText(),/7問.*6問/);
    assert.equal(await page.locator('#reviewCoverageGauge').getAttribute('value'),'1');
    assert.match(await page.locator('#reviewCoverageScore').innerText(),/3 \/ 100/);
    for(let i=7;i<17;i++)append(env,'解答ログ',{...answer(i,0),level:'lv1',problemType:'mol_to_mass',isCorrect:false});
    await page.locator('#reviewReloadButton').click();await page.locator('#reviewLearningMetrics').waitFor();
    await page.waitForFunction(()=>document.querySelector('#reviewEffort').textContent.includes('17問'));
    assert.equal(await page.locator('#reviewCoverageGauge').getAttribute('value'),'0','recent mistakes remove confirmation even with old correct answers');
    await page.setViewportSize({width:390,height:844});
    assert.equal(await page.locator('.modal-body').evaluate(el=>el.scrollWidth<=el.clientWidth),true);
  } finally {await browser.close();}
});


test('student history cold reads batch nearby matches, skip unrelated gaps and keep append order',()=>{
  const env=environment();populate(env,2);
  for(let i=0;i<1800;i++)append(env,'解答ログ',{...answer(i,1),rosterKey:i<40 || i>=1500 && i<1540?'course::s0':'course::s1'});
  const sheet=env.sheets['解答ログ'];
  const result=env.SheetRepository.readAnswerLogsForRosterKey('course::s0');
  assert.equal(result.length,80);assert.equal(result[0].attemptId,'attempt-0');assert.equal(result[79].attemptId,'attempt-1539');
  const bodyReads=sheet.reads.filter(read=>read.row>1 && read.width>1);
  assert.ok(bodyReads.length<=2,'nearby student answers should be retrieved in two bounded reads, not 80 per-row reads');
  assert.ok(bodyReads.every(read=>read.height<=500));
  assert.ok(bodyReads.every(read=>read.row<42 || read.row>=1502),'do not scan the unrelated gap');
  const before=sheet.reads.length;assert.equal(env.SheetRepository.readAnswerLogsForRosterKey('missing').length,0);
  assert.equal(sheet.reads.slice(before).filter(read=>read.row>1 && read.width>1).length,0);
});


test('student load measurement only prepares authorized test students and leaves real rosters unchanged',()=>{
  const env=environment({cache:new Map()});populate(env,1);append(env,'解答ログ',answer(100,0));
  assert.equal(typeof env.prepareStudentLoadBenchmark,'function');
  const original=JSON.stringify(env.sheets['生徒名簿'].values);
  const readTokens=()=>{const [headers,...rows]=env.sheets['トークン管理'].values;return rows.map(row=>env.SheetRepository.tokenObjectToRow_(Object.fromEntries(headers.map((header,index)=>[header,row[index]]))));};
  assert.throws(()=>env.prepareStudentLoadBenchmark('test-token-0',{count:2}),/内部認証/);
  assert.throws(()=>env.prepareStudentLoadBenchmark('teacher-secret',{count:1000}),/人数/);
  assert.throws(()=>environment({scriptId:'other'}).prepareStudentLoadBenchmark('teacher-secret',{count:2}),/検証プロジェクト/);
  assert.equal(env.sheets['トークン管理'].values.length,2);
  const run=env.prepareStudentLoadBenchmark('teacher-secret',{count:2});
  assert.equal(run.count,2);assert.doesNotMatch(JSON.stringify(run),/token|mdl_|rosterKey/);
  assert.equal(JSON.stringify(env.sheets['生徒名簿'].values),original);
  const tokens=readTokens();assert.equal(tokens.length,3);
  assert.equal(new Set(tokens.map(row=>row.token)).size,3);
  assert.ok(tokens.slice(1).every(row=>env.TokenService.isTeacherTestStudentRosterKey(row.rosterKey)));
  assert.throws(()=>env.submitStudentLoadBenchmark('test-token-0',run.runId,0),/内部認証/);
  assert.throws(()=>env.submitStudentLoadBenchmark('teacher-secret',run.runId,9),/番号/);
  const first=env.submitStudentLoadBenchmark('teacher-secret',run.runId,0);
  assert.equal(first.isCorrect,false);assert.equal(first.duplicate,false);
  const second=env.submitStudentLoadBenchmark('teacher-secret',run.runId,1);
  assert.equal(second.isCorrect,true);
  assert.equal(env.submitStudentLoadBenchmark('teacher-secret',run.runId,1).duplicate,true);
  const result=env.finishStudentLoadBenchmark('teacher-secret',run.runId);
  assert.equal(result.recorded,2);assert.equal(result.uniqueAttempts,2);assert.equal(result.duplicates,0);assert.equal(result.gradingErrors,0);
  assert.equal(readTokens().slice(1).every(row=>row.revoked),true);
  assert.equal(readTokens()[0].revoked,false);
  const dashboard=env.refreshMonitorDashboard('teacher-secret').data;
  assert.equal(dashboard.progressRows.length,1);assert.equal(dashboard.dashboardMetrics.totalAnswers,1,'measurement logs never enter normal results');
});

test('load-test tokens expire and ordinary students cannot be hidden by a similar key',()=>{
  const env=environment({cache:new Map()});
  assert.equal(typeof env.prepareStudentLoadBenchmark,'function');
  assert.equal(env.TokenService.isTeacherTestStudentRosterKey('course::__TEST_LOAD__'),false);
  assert.throws(()=>env.TokenService.validateTokenAgainstRows('expired',[{token:'expired',rosterKey:'__TEST_LOAD__::old:0',issuedAt:'2000-01-01T00:00:00Z',revoked:false}]),/期限/);
});


test('student load UI records failed first attempts, retries safely, and verifies durable totals',async()=>{
  const env=environment({cache:new Map()});const browser=await chromium.launch({headless:true});const page=await browser.newPage();
  let failed=false;const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.exposeFunction('gasCall',async(method,args)=>{
    const response=JSON.parse(JSON.stringify(env[method](...args)));
    if(method==='submitStudentLoadBenchmark' && !failed){failed=true;throw Error('lost response after commit');}
    return response;
  });
  const bridge=`<script>window.google={script:{run:{withSuccessHandler(success){return {withFailureHandler(failure){return new Proxy({},{get:(_,method)=>(...args)=>window.gasCall(method,args).then(success,failure)});}};}}}};<\/script>`;
  const html=(await readFile('Monitor.html','utf8')).replace(/<\?!=[\s\S]*?\?>/g,text=>text.includes('initialReviewBenchmark')?'true':'"teacher-secret"');
  try {
    await page.setContent(bridge+html);
    assert.equal(await page.locator('#loadBenchmarkRun').count(),1,'student load measurement has its own action');
    await page.locator('#loadBenchmarkCount').selectOption('2');await page.locator('#loadBenchmarkPattern').selectOption('burst');
    await page.locator('#loadBenchmarkRun').click();
    await page.waitForFunction(()=>!document.querySelector('#loadBenchmarkRun').disabled && document.querySelector('#loadBenchmarkJson').textContent.length>0);
    const report=JSON.parse(await page.locator('#loadBenchmarkJson').textContent());
    assert.equal(report.kind,'student-load');assert.equal(report.initialFailures,1);assert.equal(report.retryFailures,0);
    assert.equal(report.integrity.recorded,2);assert.equal(report.integrity.duplicates,0);assert.equal(report.integrity.gradingErrors,0);
    assert.equal(report.samples.length,3);assert.equal(report.samples.filter(sample=>sample.retry && sample.duplicate).length,1);
    assert.equal(report.complete,true);assert.doesNotMatch(JSON.stringify(report),/mdl_|rosterKey|studentUrl/);
    assert.deepEqual(errors,[]);
  } finally {await browser.close();}
});


test('operation links authenticate before reads, target exact student rows, and expose no token or settings',()=>{
  const env=environment();populate(env,2);
  const accessBefore=JSON.stringify(env.lookups);
  Object.values(env.sheets).forEach((sheet,index)=>sheet.getSheetId=()=>index+100);
  assert.equal(typeof env.getMonitorOperationLinks,'function');
  assert.throws(()=>env.getMonitorOperationLinks('test-token-0','course::s0'),/内部認証/);
  assert.equal(JSON.stringify(env.lookups),accessBefore);
  const before=JSON.stringify(Object.values(env.sheets).map(sheet=>sheet.values));
  const result=env.getMonitorOperationLinks('teacher-secret','course::s1');
  assert.ok(env.lookups.active>0 && env.lookups.sheets>0,'authorized lookup exercises the observed spreadsheet access');
  assert.match(result.sheets.settings,/#gid=\d+$/);
  assert.match(result.studentRows.tokens,/#gid=\d+&range=A3$/);
  assert.match(result.studentRows.roster,/#gid=\d+&range=A3$/);
  assert.doesNotMatch(JSON.stringify(result),/test-token|teacher-secret|questionText/);
  assert.equal(JSON.stringify(Object.values(env.sheets).map(sheet=>sheet.values)),before,'navigation must not mutate sheets');
  assert.equal(env.sheets['解答ログ'].reads.length,0);
  const missing=env.getMonitorOperationLinks('teacher-secret','no-such-student');
  assert.equal(missing.studentRows.tokens,'');assert.equal(missing.studentRows.roster,'');
  delete env.sheets['設定'];
  assert.equal(env.getMonitorOperationLinks('teacher-secret').sheets.settings,'','missing sheets do not prevent other navigation');
});
