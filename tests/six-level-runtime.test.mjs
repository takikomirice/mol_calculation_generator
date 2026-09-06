import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import vm from 'node:vm';
import test from 'node:test';
import {chromium} from 'playwright';

async function runtime(shared = {}) {
  const store = shared.store || new Map(); const logs = shared.logs || [];
  const sequence = shared.sequence || {value:0}; let seed = 42;
  const math = Object.create(Math); math.random = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  const ctx = {console:{log(){},error(){},info(){}}, Math:math, CacheService:{getScriptCache:()=>({get:k=>store.get(k)||null,put:(k,v)=>store.set(k,v),remove:k=>store.delete(k)})},
    Utilities:{getUuid:()=>`test-${++sequence.value}`,computeDigest:(_,s)=>Array.from(createHash('sha256').update(s).digest()),DigestAlgorithm:{SHA_256:'sha256'}}, globalThis:{}, SpreadsheetApp:{getUi:()=>{throw Error('web context');}}};
  vm.runInNewContext((await readFile('Code.gs','utf8'))+'\nglobalThis.api={AutoPracticeService,MolProblemService,AnswerService,SheetRepository,TokenService,AdminService,MonitorService,MonitorSnapshotService,AggregationService,getMonitorDashboardData,getMonitorStudentAnswerHistory,getMonitorStudentProblemTypeStats,rebuildMonitorSnapshotFromMonitor,rebuildAggregateAndMonitorCacheFromMonitor,setupSheets,reinitializeSheets};',ctx);
  const api=ctx.globalThis.api;
  api.TokenService.validateToken = token => { if(token!=='student-token') throw Error('revoked'); return {token,rosterKey:'course::student',studentId:'student',courseId:'course',name:'検証生徒'}; };
  api.SheetRepository.withDocumentLock=fn=>fn();
  api.SheetRepository.readAnswerLogsForRosterKey=key=>logs.filter(r=>r.rosterKey===key);
  api.SheetRepository.findAnswerLogByAttemptId=(key,id)=>logs.find(r=>r.rosterKey===key && r.attemptId===id);
  api.SheetRepository.appendAnswerLog=row=>logs.push(row);
  api.AdminService.getAdminToken=()=> 'teacher-secret';
  return {...api,store,logs,sequence};
}
function independentExpected(p) {
  const g=p.given; const amount=g.unit==='mol'?g.value:g.unit==='g'?g.value/p.substance.molarMass:g.unit==='L'?g.value/22.4:g.value/p.avogadroConstant;
  return p.unit==='mol'?amount:p.unit==='g'?amount*p.substance.molarMass:p.unit==='L'?amount*22.4:amount*p.avogadroConstant;
}

test('six levels cover the requested pairs, respect focus, and grade the displayed quantities',async()=>{
  const {MolProblemService:m}=await runtime();
  for(let level=1;level<=6;level++) {
    const lv=`lv${level}`;const groups=level===1?['mol_mass','mol_particles','mol_volume']:level===3?['mass_particles','mass_volume','volume_particles']:[''];const seen=new Set();
    for(const category of groups) for(let i=0;i<100;i++) {
      const p=m.generateProblem({level:lv,category});seen.add(p.problemTypeId);
      assert.equal(p.level,lv); assert.ok(p.problemTypeId<=12);
      if(category) assert.ok(m.practiceGroups_(lv)[category].includes(p.problemTypeId));
      if([1,2,5].includes(level)) assert.ok(p.problemTypeId<=6);else assert.ok(p.problemTypeId>=7);
      const raw=independentExpected(p);const expected=level>=5?Number(raw.toPrecision(3)):raw;
      assert.ok(Math.abs(p.expectedAnswer-expected)<=Math.abs(expected)*1e-12,JSON.stringify(p));
      const answer=level>=5?expected.toExponential(2):String(expected);
      assert.equal(m.gradeProblemAnswer(p,answer).isCorrect,true,`${lv}: ${answer}`);
      assert.equal(m.gradeProblemAnswer(p,String(expected*1.1)).isCorrect,false);
      assert.ok(p.givenValues.every(v=>v.required!==false),'no unrelated dummy constants');
      assert.ok(!p.problemType.includes('gas_volume')||p.substance.isGasAtSTP);
      const pub=m.toPublicProblem(p);assert.equal(pub.expectedAnswer,undefined);assert.equal(pub.explanation,undefined);
    }
    assert.equal(seen.size,6,lv);
  }
  assert.throws(()=>m.generateProblem({level:'lv1',category:'mass_volume'}),/このレベル/);
});

test('strict grading separates numeric errors from significant digits and rejects permissive numeric syntax',async()=>{
  const {MolProblemService:m}=await runtime();
  for(const input of ['1.20','１．２０','1.20e0','1.20×10^0']) assert.equal(m.strictPracticeGrade_(input,1.2,'lv5').isCorrect,true,input);
  for(const input of ['1.2','1.200']) {const r=m.strictPracticeGrade_(input,1.2,'lv5');assert.equal(r.isCorrect,false);assert.equal(r.acceptedAnswerType,'precision');}
  for(const input of ['0x10','Infinity','1,2','-1.20','1.30']) assert.equal(m.strictPracticeGrade_(input,1.2,'lv5').isCorrect,false,input);
  assert.equal(m.strictPracticeGrade_('11',11.2,'lv1').isCorrect,false);
  assert.equal(m.strictPracticeGrade_('11.20',11.2,'lv1').isCorrect,true);
});

test('runtime totals survive independent GAS invocations, retries, reload, and cache loss with an exact last-ten window',async()=>{
  let r=await runtime();
  r.AnswerService.initializeStudentSession('student-token',{level:'lv1',category:'mol_mass'});
  let correct=0; let lastRequest;
  for(let i=0;i<12;i++) {
    r=await runtime(r);
    const problem=r.AnswerService.getPracticeProblem('student-token',{level:'lv2'});
    const stored=r.MolProblemService.getStoredProblemForToken('student-token',problem.attemptId);
    const isCorrect=i<4;correct+=isCorrect?1:0;
    lastRequest={token:'student-token',problem,submittedAnswer:isCorrect?String(stored.expectedAnswer):'999999',elapsedMs:1500};
    const response=r.AnswerService.submitAnswer(lastRequest);
    assert.equal(response.result.totalAttempts,i+1);assert.equal(response.result.totalCorrect,correct);
  }
  const response=r.AnswerService.submitAnswer(lastRequest);assert.equal(response.duplicate,true);assert.equal(r.logs.length,12);assert.equal(response.result.totalAttempts,12);
  assert.equal(response.result.recent10Accuracy,0.2);
  // A retry with a different value must still return the first persisted result.
  assert.equal(r.AnswerService.submitAnswer({...lastRequest,submittedAnswer:'0'}).result.submittedAnswerText,response.result.submittedAnswerText);
  for(const key of [...r.store.keys()]) if(key.startsWith('studentSummary:')) r.store.delete(key);
  r=await runtime(r);
  const summary=r.AnswerService.initializeStudentSession('student-token',{level:'lv6'}).summary;
  assert.equal(summary.totalAttempts,12);assert.equal(summary.recent10Accuracy,0.2);
  assert.throws(()=>r.AnswerService.getStudentState('other-token'),/無効なURL/);
});

test('teacher APIs reject student credentials before reading or changing data',async()=>{
  const r=await runtime(); let touches=0;
  r.SheetRepository.assertManagementSheetsReady=()=>{touches++};
  for(const credential of ['',undefined,'student-token']) {
    assert.throws(()=>r.MonitorService.assertMonitorAccess(credential),/内部認証/);
    assert.throws(()=>r.getMonitorDashboardData(credential),/内部認証/);
    assert.throws(()=>r.getMonitorStudentAnswerHistory(credential,'other-student'),/内部認証/);
    assert.throws(()=>r.getMonitorStudentProblemTypeStats(credential,'other-student'),/内部認証/);
    assert.equal(r.rebuildMonitorSnapshotFromMonitor(credential).ok,false);
    assert.equal(r.rebuildAggregateAndMonitorCacheFromMonitor(credential).ok,false);
  }
  assert.equal(touches,0);r.MonitorService.assertMonitorAccess('teacher-secret');assert.equal(touches,0);
  assert.throws(()=>r.setupSheets(),/web context/);assert.throws(()=>r.reinitializeSheets(),/web context/);
  const source=await readFile('Code.gs','utf8');assert.doesNotMatch(source,/function rebuildAggregateAndMonitorCacheForTrigger\(/);
});


test('monitor snapshot reads stay authorized without scanning unrelated sheets',async()=>{
  const r=await runtime();
  r.SheetRepository.assertManagementSheetsReady=()=>{throw Error('unrelated sheet scan');};
  let reads=0;
  const snapshot={progressRows:[],dashboardMetrics:{},courseOverview:{},studentOverview:{},tokenOverview:{}};
  r.SheetRepository.readMonitorCacheRow=()=>{reads++;return {json:JSON.stringify(snapshot)};};
  assert.equal(r.getMonitorDashboardData('teacher-secret').snapshotMode,'snapshot');
  assert.equal(reads,1);
  assert.equal(r.getMonitorDashboardData('teacher-secret').snapshotMode,'snapshot');
  assert.equal(reads,1,'warm snapshot must avoid sheet reads');
  assert.throws(()=>r.getMonitorDashboardData('student-token'),/内部認証/);
});

test('six-level metrics appear in teacher aggregation and header serialization',async()=>{
  const r=await runtime();const logs=Array.from({length:6},(_,i)=>({rosterKey:'class::learner',level:`lv${i+1}`,isCorrect:i%2===0,timestamp:`2026-09-06T10:00:0${i}Z`}));
  const row=r.AggregationService.buildAggregateRows(logs,new Date().toISOString())[0];
  const serialized=r.SheetRepository.aggregateCacheSummaryToHeaderValues_(row);
  const restored=r.SheetRepository.aggregateCacheObjectToRow_(serialized);
  for(let i=1;i<=6;i++){assert.equal(row[`lv${i}Attempts`],1);assert.equal(restored[`lv${i}Correct`],i%2===1?1:0);}
});

test('live JavaScript UI switches focus and levels, prevents double submit, and renders an exact cumulative summary',async()=>{
  const r=await runtime();const browser=await chromium.launch({headless:true});
  const page=await browser.newPage({viewport:{width:390,height:844}});page.setDefaultTimeout(5000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
  try {
    await page.exposeFunction('gasCall',async(method,args)=>{
      if(method==='initializeStudentSession')return JSON.parse(JSON.stringify(r.AnswerService.initializeStudentSession(...args)));
      if(method==='getPracticeProblem')return JSON.parse(JSON.stringify(r.AnswerService.getPracticeProblem(...args)));
      if(method==='submitAnswer')return JSON.parse(JSON.stringify(r.AnswerService.submitAnswer(...args)));
      throw Error('Unexpected API: '+method);
    });
    const bridge=`<script>window.google={script:{run:new Proxy({}, {get(_t,key){if(key==='withSuccessHandler')return function(success){return {withFailureHandler(failure){return new Proxy({}, {get(_t,method){return (...args)=>window.gasCall(method,args).then(success,failure)}})}}}}})}};<\/script>`;
    let html=await readFile('Student.html','utf8');
    html=html.replace(/<\?!= [\s\S]*?\?>/g, snippet => snippet.includes('initialTeacherPreview') ? 'false' : snippet.includes('initialAdminToken') ? '""' : '"student-token"');
    await page.setContent(bridge+html);
    await page.getByRole('button',{name:'解答する',exact:true}).waitFor();
    await page.waitForFunction(()=>document.querySelector('#submitButton').disabled===false).catch(async e=>{throw Error(JSON.stringify({errors,detail:await page.locator('#errorMessage').innerText()}))});
    assert.equal(await page.locator('[data-level]').count(),6);
    await page.getByRole('combobox',{name:'練習する変換'}).selectOption('mol_volume');
    await page.waitForFunction(()=>document.querySelector('#submitButton').disabled===false);
    assert.match(await page.locator('#questionText').innerText(),/標準状態/);
    const answer=await page.evaluate(()=>state.problem.attemptId).then(id=>r.MolProblemService.getStoredProblemForToken('student-token',id).expectedAnswer);
    await page.getByRole('textbox',{name:'解答入力'}).fill(String(answer));
    await page.getByRole('button',{name:'解答する',exact:true}).click();
    await page.waitForFunction(()=>!document.querySelector('#nextProblemButton').disabled);
    assert.equal(await page.locator('#totalAttempts').innerText(),'1');
    await page.waitForFunction(()=>document.activeElement.id==='resultTitle',{},{timeout:1500});
    assert.equal(await page.locator('#resultPanel #nextProblemButton').count(),1,'next action follows the result and explanation');
    assert.ok(await page.locator('#resultTitle').evaluate(el=>{const rect=el.getBoundingClientRect();return rect.top>=0 && rect.bottom<=innerHeight;}),'grading result is visible without scrolling');
    await page.evaluate(() => submitAnswer());
    assert.equal(r.logs.length,1,'a repeated submit after grading must not call the server again');
    await page.getByRole('button',{name:'次の問題',exact:true}).click();
    await page.waitForFunction(()=>!document.querySelector('#submitButton').disabled);
    await page.getByRole('textbox',{name:'解答入力'}).fill('999999');await page.getByRole('button',{name:'解答する',exact:true}).click();
    await page.waitForFunction(()=>!document.querySelector('#nextProblemButton').disabled);
    assert.equal(await page.locator('#totalAttempts').innerText(),'2');assert.equal(await page.locator('#recentAccuracy').innerText(),'50%');
    await page.getByRole('button',{name:'Lv.3 molを経由する1種類の変換',exact:true}).click();
    await page.waitForFunction(()=>!document.querySelector('#submitButton').disabled);
    assert.equal(await page.locator('#categorySelect').inputValue(),'mass_particles');
    await page.getByRole('button',{name:'Lv.5 Lv.2＋有効数字3桁',exact:true}).click();
    await page.waitForFunction(()=>!document.querySelector('#submitButton').disabled);
    assert.equal(await page.locator('#categoryPanel').isVisible(),false);
    assert.match(await page.locator('#inputHintText').innerText(),/有効数字3桁/);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    // Simulate GAS losing the issued problem while the learner leaves the page open.
    r.store.clear();
    const memoryProblems = r.MolProblemService.getMemoryProblemStore_();
    for (const key of Object.keys(memoryProblems)) delete memoryProblems[key];
    await page.getByRole('textbox',{name:'解答入力'}).fill('1.23');
    await page.getByRole('button',{name:'解答する',exact:true}).click();
    await page.getByRole('button',{name:'新しい問題',exact:true}).waitFor();
    assert.equal(r.logs.length,2,'an expired question must not create an answer');
    await page.getByRole('button',{name:'新しい問題',exact:true}).click();
    await page.waitForFunction(()=>!document.querySelector('#submitButton').disabled);
    assert.equal(await page.locator('#errorPanel').isVisible(),false);
    assert.equal(await page.locator('#totalAttempts').innerText(),'2');
    assert.deepEqual(errors,[]);
  }finally{await browser.close();}
});


test('automatic practice covers all six levels, survives cache loss and rejects fabricated progress',async()=>{
  let r=await runtime();let problem=r.AnswerService.initializeStudentSession('student-token',{practiceMode:'auto',level:'lv6'}).problem;
  assert.equal(problem.level,'lv1');let request;const counts={};
  for(let i=0;i<70;i++) {
    r=await runtime(r);
    counts[problem.level]=(counts[problem.level]||0)+1;
    const canonical=r.MolProblemService.getStoredProblemForToken('student-token',problem.attemptId);
    request={token:'student-token',problem:{...problem,level:'lv6'},submittedAnswer:Number(canonical.expectedAnswer).toExponential(2),skipNextProblem:true};
    const response=r.AnswerService.submitAnswer(request);
    assert.equal(response.result.isCorrect,true);
    assert.ok(response.nextProblem,'auto mode must produce a post-grading next question even when browser asks to skip it');
    assert.equal(response.nextProblem.expectedAnswer,undefined);
    problem=response.nextProblem;
    if(i===19)for(const key of [...r.store.keys()])if(key.startsWith('studentSummary:'))r.store.delete(key);
  }
  assert.deepEqual(counts,{lv1:15,lv2:10,lv3:15,lv4:10,lv5:10,lv6:10});
  assert.equal(problem.level,'lv6');assert.match(problem.learningPlan.message,/Lv.6/);
  const before=JSON.stringify(r.AutoPracticeService.rebuild_(r.logs));
  const retry=r.AnswerService.submitAnswer(request);assert.equal(retry.duplicate,true);assert.equal(r.logs.length,70);
  assert.equal(JSON.stringify(r.AutoPracticeService.rebuild_(r.logs)),before);
  for(const key of [...r.store.keys()])if(key.startsWith('studentSummary:'))r.store.delete(key);
  r=await runtime(r);const resumed=r.AnswerService.initializeStudentSession('student-token',{practiceMode:'auto'}).problem;
  assert.equal(resumed.level,'lv6');assert.equal(resumed.learningPlan.stageId,problem.learningPlan.stageId);
  const manual=r.AnswerService.getPracticeProblem('student-token',{level:'lv1',category:'mol_volume'});
  const response=r.AnswerService.submitAnswer({token:'student-token',problem:manual,submittedAnswer:'999999',clientInfo:{autoPractice:{version:1,stageId:8,level:'lv6',category:''},acceptedAnswerType:'precision'}});
  assert.equal(response.nextProblem,null);
  const metadata=JSON.parse(r.logs.at(-1).clientInfo);
  assert.equal(metadata.autoPractice,undefined);assert.equal(metadata.acceptedAnswerType,undefined);
  assert.equal(JSON.stringify(r.AutoPracticeService.rebuild_(r.logs)),before);
  assert.throws(()=>r.AnswerService.getPracticeProblem('other-token',{practiceMode:'auto'}),/無効なURL/);
});

test('automatic policy requires directional coverage and keeps precision mistakes separate from numerical support',async()=>{
  const r=await runtime(), a=r.AutoPracticeService;
  let state=a.initial_();a.move_(state,'lv2','','practice');
  const add=(type,correct,precision=false)=>a.apply_(state,{level:state.level,problemType:r.MolProblemService.getProblemTypeById_(type).key,isCorrect:correct,clientInfo:JSON.stringify({autoPractice:a.metadata_(state),acceptedAnswerType:precision?'precision':correct?'exact':''})});
  for(let i=0;i<15;i++)add(1,true);
  assert.equal(state.level,'lv2','one mastered direction must not advance a random level');
  a.move_(state,'lv5','','practice');
  for(let i=0;i<6;i++)add(i+1,false,true);
  assert.equal(state.level,'lv5');assert.equal(state.resume,null);assert.match(a.plan_(state).message,/有効数字/);
  for(let i=0;i<3;i++)add(i+1,false);
  assert.equal(state.level,'lv2');assert.equal(state.resume.level,'lv5');
  const supportStage=state.stageId;
  for(let i=0;i<4;i++)add(i+1,true);
  assert.equal(state.stageId,supportStage,'no immediate bounce after one correct answer');
  for(let i=4;i<10;i++)add(i%6+1,true);
  assert.equal(state.level,'lv5');assert.equal(state.resume,null);assert.equal(state.reason,'return');
  const unchanged=JSON.stringify(state);
  a.apply_(state,{level:'lv5',problemType:'mol_to_mass',isCorrect:true,clientInfo:JSON.stringify({autoPractice:{version:1,stageId:supportStage-1,level:'lv5',category:''}})});
  assert.equal(JSON.stringify(state),unchanged,'an older outstanding question cannot advance the new stage');
});

test('automatic UI changes mode, ignores stale manual prefetch, returns to manual and resumes after reload',async()=>{
  const r=await runtime();const browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:390,height:844}});
  const errors=[];page.on('pageerror',error=>errors.push(error.message));let release,hold=true,failAuto=false;const calls=[];
  await page.exposeFunction('gasCall',async(method,args)=>{
    calls.push({method,mode:args[1]?.practiceMode});
    if(method==='getPracticeProblem' && args[1]?.practiceMode==='auto' && failAuto)throw Error('temporary connection failure');
    const result=JSON.parse(JSON.stringify(r.AnswerService[method](...args)));
    if(method==='getPracticeProblem' && args[1]?.practiceMode!=='auto' && hold){hold=false;await new Promise(resolve=>release=resolve);}
    return result;
  });
  const bridge=`<script>window.google={script:{run:{withSuccessHandler(success){return {withFailureHandler(failure){return new Proxy({},{get:(_,method)=>(...args)=>window.gasCall(method,args).then(success,failure)});}};}}}};<\/script>`;
  const html=(await readFile('Student.html','utf8')).replace(/<\?!= [\s\S]*?\?>/g,snippet=>snippet.includes('initialTeacherPreview')?'false':snippet.includes('initialAdminToken')?'""':'"student-token"');
  await page.route('https://mol.test/**',route=>route.fulfill({contentType:'text/html',body:bridge+html}));
  try {
    await page.goto('https://mol.test/');await page.waitForFunction(()=>!document.querySelector('#submitButton').disabled,null,{timeout:5000}).catch(async()=>{throw Error(JSON.stringify({errors,calls,message:await page.locator('#errorMessage').innerText()}));});
    failAuto=true;await page.getByRole('button',{name:'オートレベリング',exact:true}).click();
    await page.getByRole('button',{name:'再試行',exact:true}).waitFor();
    assert.equal(await page.locator('#submitButton').isDisabled(),true,'a failed mode switch must not submit the old manual question as automatic');
    failAuto=false;await page.getByRole('button',{name:'再試行',exact:true}).click();
    await page.waitForFunction(()=>!document.querySelector('#submitButton').disabled);
    assert.equal(await page.locator('#manualLevelPanel').isVisible(),false);
    assert.equal(await page.getByRole('button',{name:'マニュアル',exact:true}).isVisible(),true);
    assert.equal(await page.getByRole('button',{name:'オートレベリング',exact:true}).isVisible(),true);
    assert.equal(await page.locator('#autoPracticeLevel').innerText(),'Lv.1');
    assert.equal(await page.locator('#autoPracticeFocus').innerText(),'mol ⇔ 質量');
    assert.equal(await page.locator('#categoryPanel').isVisible(),false);
    assert.match(await page.locator('#autoPracticeMessage').innerText(),/molと質量/);
    release();
    for(let i=0;i<5;i++) {
      const problem=await page.evaluate(()=>state.problem);
      const expected=r.MolProblemService.getStoredProblemForToken('student-token',problem.attemptId).expectedAnswer;
      await page.getByRole('textbox',{name:'解答入力'}).fill(String(expected));
      await page.getByRole('button',{name:'解答する',exact:true}).click();
      await page.waitForFunction(()=>!document.querySelector('#nextProblemButton').disabled);
      await page.getByRole('button',{name:'次の問題',exact:true}).click();
      await page.waitForFunction(()=>!document.querySelector('#submitButton').disabled);
    }
    assert.equal(await page.evaluate(()=>state.problem.category),'mol_particles');
    assert.equal(calls.filter(call=>call.method==='getPracticeProblem' && call.mode==='auto').length,2,'no pre-grading automatic prefetch calls');
    await page.reload();await page.waitForFunction(()=>!document.querySelector('#submitButton').disabled);
    assert.equal(await page.getByRole('button',{name:'オートレベリング',exact:true}).getAttribute('aria-pressed'),'true');
    assert.equal(await page.evaluate(()=>state.problem.category),'mol_particles');
    assert.equal(await page.locator('#autoPracticeFocus').innerText(),'mol ⇔ 個数');
    await page.screenshot({path:'output/playwright/automatic-practice-mobile.png'});
    await page.getByRole('button',{name:'マニュアル',exact:true}).click();
    await page.waitForFunction(()=>!document.querySelector('#submitButton').disabled);
    assert.equal(await page.locator('#manualLevelPanel').isVisible(),true);
    await page.getByRole('button',{name:'Lv.6 Lv.4＋有効数字3桁',exact:true}).click();
    await page.waitForFunction(()=>!document.querySelector('#submitButton').disabled);
    assert.equal(await page.locator('#currentLevelLabel').innerText(),'Lv.6');
    await page.getByRole('button',{name:'オートレベリング',exact:true}).click();
    await page.waitForFunction(()=>!document.querySelector('#submitButton').disabled);
    assert.equal(await page.locator('#autoPracticeLevel').innerText(),'Lv.1','current auto level reflects the served problem, not the manual selection');
    await page.reload();await page.waitForFunction(()=>!document.querySelector('#submitButton').disabled);
    await page.getByRole('button',{name:'マニュアル',exact:true}).click();
    await page.waitForFunction(()=>!document.querySelector('#submitButton').disabled);
    assert.equal(await page.locator('#currentLevelLabel').innerText(),'Lv.6','manual selection survives auto mode and reload');
    assert.equal(await page.locator('#autoPracticeDetails').isVisible(),false);
    assert.equal(await page.locator('[data-level="lv6"]').getAttribute('aria-pressed'),'true');
    await page.screenshot({path:'output/playwright/manual-practice-mobile.png'});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    assert.deepEqual(errors,[]);
  } finally {await browser.close();}
});


function learningLog(overrides={}) {
  return {rosterKey:'course::student',timestamp:'2026-09-06T01:00:00.000Z',attemptId:'history',level:'lv1',problemType:'mol_to_mass',isCorrect:false,
    questionText:'水素2 molの質量は？',submittedAnswer:'8',expectedAnswer:4,unit:'g',significantDigits:3,explanation:'2 × 2 = 4 g',clientInfo:'{}',...overrides};
}

test('learning check isolates students, requires an active token, and rebuilds the same evidence after cache eviction',async()=>{
  const r=await runtime({logs:[learningLog(),learningLog({rosterKey:'other',questionText:'private other student'})]});
  assert.equal(typeof r.AnswerService.getStudentLearningCheck,'function','student learning check API is available');
  assert.throws(()=>r.AnswerService.getStudentLearningCheck('revoked',{level:'lv1'}),/revoked/);
  const check=r.AnswerService.getStudentLearningCheck('student-token',{level:'lv1',rosterKey:'other'});
  assert.equal(check.summary.totalAttempts,1);
  assert.equal(check.mistakes.length,1);assert.equal(check.mistakes[0].questionText,'水素2 molの質量は？');
  assert.equal(check.advice.kind,'explore','one mistake must not label a weakness');
  assert.doesNotMatch(JSON.stringify(check),/private other student|student-token|rosterKey|clientInfo/);
  r.SheetRepository.readAnswerLogsForRosterKey=()=>{throw Error('warm check must not scan logs');};
  assert.equal(JSON.stringify(r.AnswerService.getStudentLearningCheck('student-token',{level:'lv1'})),JSON.stringify(check));
  r.store.clear();r.SheetRepository.readAnswerLogsForRosterKey=key=>r.logs.filter(row=>row.rosterKey===key);
  assert.equal(JSON.stringify(r.AnswerService.getStudentLearningCheck('student-token',{level:'lv1'})),JSON.stringify(check));
});

test('learning advice separates precision from calculation, needs directional coverage to level up, and uses recent evidence',async()=>{
  const logs=Array.from({length:5},(_,i)=>learningLog({attemptId:String(i),isCorrect:true}));
  let r=await runtime({logs});
  assert.equal(typeof r.AnswerService.getStudentLearningCheck,'function');
  assert.notEqual(r.AnswerService.getStudentLearningCheck('student-token',{level:'lv1'}).advice.kind,'challenge');
  for(const type of ['mass_to_mol','mol_to_particles','particles_to_mol','mol_to_gas_volume','gas_volume_to_mol']) {
    for(let i=0;i<5;i++)logs.push(learningLog({attemptId:type+i,problemType:type,isCorrect:i!==0}));
  }
  r=await runtime({logs});let check=r.AnswerService.getStudentLearningCheck('student-token',{level:'lv1'});
  assert.equal(check.advice.kind,'challenge');assert.equal(check.advice.target.level,'lv2');assert.equal(check.coverage.confirmed,6);
  logs.push(...Array.from({length:3},(_,i)=>learningLog({attemptId:'new'+i})));
  r=await runtime({logs});check=r.AnswerService.getStudentLearningCheck('student-token',{level:'lv1'});
  assert.equal(check.advice.kind,'practice');assert.equal(check.advice.target.category,'mol_mass');
  assert.equal(check.coverage.confirmed,5,'older correct answers must not hide current mistakes');
  r=await runtime({logs:Array.from({length:3},(_,i)=>learningLog({attemptId:String(i),level:'lv5',clientInfo:JSON.stringify({acceptedAnswerType:'precision'})}))});
  check=r.AnswerService.getStudentLearningCheck('student-token',{level:'lv5'});
  assert.equal(check.advice.kind,'precision');assert.equal(check.advice.target.level,'lv5','precision-only mistakes should keep the calculation level');
  assert.equal(check.mistakes[0].acceptedAnswerType,'precision');
});

test('learning progress survives wrong answers, retry duplicates, manual/auto changes and cache eviction',async()=>{
  const r=await runtime();assert.equal(typeof r.AnswerService.getStudentLearningCheck,'function');
  const p=r.AnswerService.getPracticeProblem('student-token',{level:'lv1',category:'mol_mass'});
  const answer=r.MolProblemService.getStoredProblemForToken('student-token',p.attemptId).expectedAnswer;
  const request={token:'student-token',problem:p,submittedAnswer:String(answer),skipNextProblem:true};
  r.AnswerService.submitAnswer(request);r.AnswerService.submitAnswer(request);
  const q=r.AnswerService.getPracticeProblem('student-token',{practiceMode:'auto'});
  r.AnswerService.submitAnswer({token:'student-token',problem:q,submittedAnswer:'999999',skipNextProblem:true});
  let check=r.AnswerService.getStudentLearningCheck('student-token',{level:'lv1'});
  assert.equal(check.summary.totalCorrect,1);assert.equal(check.summary.totalAttempts,2);assert.equal(check.mistakes.length,1);
  const evidence=JSON.stringify(check);r.store.clear();
  assert.equal(JSON.stringify(r.AnswerService.getStudentLearningCheck('student-token',{level:'lv1'})),evidence);
});


test('student self-study UI keeps earned progress, reviews mistakes safely, retries and applies optional practice on mobile',async()=>{
  const logs=Array.from({length:9},(_,i)=>learningLog({attemptId:'seed'+i,isCorrect:true}));
  logs.push(learningLog({questionText:'<img src=x onerror=alert(1)> 問題',explanation:'振り返りの解説'}));
  const r=await runtime({logs});const browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:390,height:844}});
  const errors=[];page.on('pageerror',error=>errors.push(error.message));let failCheck=true,holdCheck=false,releaseCheck;
  await page.exposeFunction('gasCall',async(method,args)=>{
    if(method==='getStudentLearningCheck' && failCheck)throw Error('一時的な通信エラー');
    const response=JSON.parse(JSON.stringify(r.AnswerService[method](...args)));
    if(method==='getStudentLearningCheck' && holdCheck){holdCheck=false;await new Promise(resolve=>releaseCheck=resolve);}
    return response;
  });
  const bridge=`<script>window.google={script:{run:{withSuccessHandler(success){return {withFailureHandler(failure){return new Proxy({},{get:(_,method)=>(...args)=>window.gasCall(method,args).then(success,failure)});}};}}}};<\/script>`;
  const html=(await readFile('Student.html','utf8')).replace(/<\?!= [\s\S]*?\?>/g,snippet=>snippet.includes('initialTeacherPreview')?'false':snippet.includes('initialAdminToken')?'""':'"student-token"');
  await page.route('https://mol.test/**',route=>route.fulfill({contentType:'text/html',body:bridge+html}));
  try {
    await page.goto('https://mol.test/');await page.waitForFunction(()=>!document.querySelector('#submitButton').disabled);
    assert.equal(await page.locator('#earnedCorrect').count(),1,'cumulative correct progress is shown');
    assert.equal(await page.locator('#earnedCorrect').innerText(),'9');
    for(const correct of [true,false]) {
      const p=await page.evaluate(()=>state.problem);
      const answer=correct?r.MolProblemService.getStoredProblemForToken('student-token',p.attemptId).expectedAnswer:'999999';
      await page.getByRole('textbox',{name:'解答入力'}).fill(String(answer));await page.getByRole('button',{name:'解答する',exact:true}).click();
      await page.waitForFunction(()=>!document.querySelector('#nextProblemButton').disabled);
      assert.equal(await page.locator('#earnedCorrect').innerText(),'10');
      assert.equal(await page.locator('#correctGauge').getAttribute('value'),'10');
      await page.getByRole('button',{name:'次の問題',exact:true}).click();await page.waitForFunction(()=>!document.querySelector('#submitButton').disabled);
    }
    await page.reload();await page.waitForFunction(()=>!document.querySelector('#submitButton').disabled);
    assert.equal(await page.locator('#earnedCorrect').innerText(),'10');
    await page.getByRole('button',{name:'苦手チェック',exact:true}).click();
    await page.locator('#learningRetry').waitFor();
    assert.equal(await page.locator('#learningPractice').isVisible(),false);
    failCheck=false;await page.locator('#learningRetry').click();await page.locator('#learningPractice').waitFor();
    assert.equal(await page.locator('#learningMistakes img').count(),0,'recorded text must never create HTML');
    await page.locator('#learningMistakes details').last().locator('summary').click();
    assert.match(await page.locator('#learningMistakes').innerText(),/振り返りの解説/);
    assert.ok(await page.evaluate(()=>document.querySelector('#learningDialog').scrollWidth<=document.querySelector('#learningDialog').clientWidth));
    await page.keyboard.press('Escape');assert.equal(await page.locator('#learningDialog').isVisible(),false);
    assert.equal(await page.locator('#learningCheckButton').evaluate(el=>el===document.activeElement),true);
    holdCheck=true;await page.getByRole('button',{name:'苦手チェック',exact:true}).click();
    await page.locator('#learningStatus').getByText('記録を確認しています…',{exact:true}).waitFor();
    await page.keyboard.press('Escape');
    await page.locator('[data-level="lv3"]').click();await page.waitForFunction(()=>!document.querySelector('#submitButton').disabled);
    await page.getByRole('button',{name:'苦手チェック',exact:true}).click();await page.locator('#learningPractice').waitFor();
    releaseCheck();await page.waitForTimeout(20);
    assert.match(await page.locator('#learningStatus').innerText(),/Lv.3/,'an older response must not replace the new level check');
    await page.screenshot({path:'output/playwright/self-study-check-mobile.png'});
    await page.keyboard.press('Escape');
    await page.getByRole('button',{name:'オートレベリング',exact:true}).click();await page.waitForFunction(()=>!document.querySelector('#submitButton').disabled);
    await page.getByRole('button',{name:'苦手チェック',exact:true}).click();await page.locator('#learningPractice').waitFor();
    await page.locator('#learningPractice').click();await page.waitForFunction(()=>!document.querySelector('#submitButton').disabled);
    assert.equal(await page.getByRole('button',{name:'マニュアル',exact:true}).getAttribute('aria-pressed'),'true');
    assert.equal(await page.locator('#manualLevelPanel').isVisible(),true);
    assert.equal(await page.locator('#earnedCorrect').innerText(),'10');
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    assert.deepEqual(errors,[]);
  } finally {await browser.close();}
});


test('numeric difficulty recommendations issue a focused pair and precision recommendations retain harder calculation',async()=>{
  for(const [level,expectedLevel,type,category] of [['lv5','lv1','mol_to_mass','mol_mass'],['lv6','lv3','gas_volume_to_particles','volume_particles']]) {
    const r=await runtime({logs:Array.from({length:3},(_,i)=>learningLog({level,problemType:type,attemptId:String(i)}))});
    const target=r.AnswerService.getStudentLearningCheck('student-token',{level}).advice.target;
    assert.equal(target.level,expectedLevel);assert.equal(target.category,category);
    for(let i=0;i<6;i++) {
      const p=r.AnswerService.getPracticeProblem('student-token',{...target,practiceMode:'manual'});
      assert.equal(p.category,category);
    }
  }
});


test('student grading exposes numeric timing stages without identity or answer contents',async()=>{
  const r=await runtime();const problem=r.AnswerService.getPracticeProblem('student-token',{level:'lv1',category:'mol_mass'});
  const response=r.AnswerService.submitAnswer({token:'student-token',problem,submittedAnswer:'99999'});
  assert.ok(response.performance,'grading timing is returned for measurement');
  for(const key of ['serverElapsedMs','tokenElapsedMs','storedProblemElapsedMs','gradingElapsedMs','lockWaitElapsedMs','duplicateCheckElapsedMs','appendOnlyElapsedMs','summaryElapsedMs','nextProblemElapsedMs']) {
    assert.equal(typeof response.performance[key],'number',key);assert.ok(response.performance[key]>=0,key);
  }
  assert.doesNotMatch(JSON.stringify(response.performance),/student-token|rosterKey|99999|questionText/);
});


test('first submissions avoid a history search but retries and evicted permits still check durable logs',async()=>{
  let r=await runtime();const p=r.AnswerService.getPracticeProblem('student-token',{level:'lv1'});r=await runtime(r);
  let searches=0;const find=r.SheetRepository.findAnswerLogByAttemptId;r.SheetRepository.findAnswerLogByAttemptId=(...args)=>{searches++;return find(...args);};
  const request={token:'student-token',problem:p,submittedAnswer:'99999'};
  r.AnswerService.submitAnswer(request);assert.equal(searches,0,'fresh issued attempt requires no log search');
  assert.equal(r.AnswerService.submitAnswer(request).duplicate,true);assert.equal(searches,1);assert.equal(r.logs.length,1);
  const q=r.AnswerService.getPracticeProblem('student-token',{practiceMode:'auto'});
  for(const key of [...r.store.keys()])if(key.startsWith('firstSubmission:'))r.store.delete(key);
  r.AnswerService.submitAnswer({token:'student-token',problem:q,submittedAnswer:'99999'});assert.equal(searches,2);
});

test('interrupted writes consume first-submission permission before writing and retry restores one authoritative result',async()=>{
  const r=await runtime();const p=r.AnswerService.getPracticeProblem('student-token',{level:'lv1'});
  const request={token:'student-token',problem:p,submittedAnswer:'99999'};
  r.SheetRepository.appendAnswerLog=row=>{r.logs.push(row);throw Error('lost write acknowledgement');};
  assert.throws(()=>r.AnswerService.submitAnswer(request),/lost write acknowledgement/);
  r.SheetRepository.appendAnswerLog=row=>r.logs.push(row);
  const response=r.AnswerService.submitAnswer({...request,submittedAnswer:'1'});
  assert.equal(response.duplicate,true);assert.equal(r.logs.length,1);assert.match(response.result.submittedAnswerText,/99999/);
  assert.equal(response.result.totalAttempts,1);
});

test('first-submission permit removal failure must not write a row',async()=>{
  const r=await runtime();const p=r.AnswerService.getPracticeProblem('student-token',{level:'lv1'});
  const original=r.AnswerService.getStudentAccessCache_;
  r.AnswerService.getStudentAccessCache_=()=>({get:key=>r.store.get(key)||null,put:(key,value)=>r.store.set(key,value),remove:()=>{throw Error('cache removal failed');}});
  assert.throws(()=>r.AnswerService.submitAnswer({token:'student-token',problem:p,submittedAnswer:'99999'}),/cache removal failed/);
  assert.equal(r.logs.length,0);
  r.AnswerService.getStudentAccessCache_=original;
  assert.equal(r.AnswerService.submitAnswer({token:'student-token',problem:p,submittedAnswer:'99999'}).result.totalAttempts,1);
});


test('unconfirmed permit deletion and an uncertain flush cannot create duplicate credit',async()=>{
  const r=await runtime();const p=r.AnswerService.getPracticeProblem('student-token',{level:'lv1'});
  const request={token:'student-token',problem:p,submittedAnswer:'99999'};
  const getCache=r.AnswerService.getStudentAccessCache_;
  r.AnswerService.getStudentAccessCache_=()=>({get:key=>r.store.get(key)||null,put:(key,value)=>r.store.set(key,value),remove(){}});
  assert.throws(()=>r.AnswerService.submitAnswer(request),/保存/);
  assert.equal(r.logs.length,0,'an unconfirmed permit removal must not reach the sheet');
  r.AnswerService.getStudentAccessCache_=getCache;
  r.SheetRepository.withDocumentLock=fn=>{fn();throw Error('flush acknowledgement lost');};
  assert.throws(()=>r.AnswerService.submitAnswer(request),/flush acknowledgement lost/);
  assert.equal(r.logs.length,1);
  assert.equal(r.AnswerService.readRuntimeSummaryCache_({token:'student-token',rosterKey:'course::student'}),null);
  r.SheetRepository.withDocumentLock=fn=>fn();
  const retry=r.AnswerService.submitAnswer({...request,submittedAnswer:'1'});
  assert.equal(retry.duplicate,true);assert.equal(retry.result.totalAttempts,1);assert.equal(r.logs.length,1);
  assert.match(retry.result.submittedAnswerText,/99999/);
});
