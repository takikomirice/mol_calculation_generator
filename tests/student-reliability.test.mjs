import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import test from 'node:test';

const source=await readFile('Code.gs','utf8');
function writeRuntime({contended=false}={}) {
  const events=[];let held=false;
  const context={globalThis:{},LockService:{getDocumentLock:()=>null,getScriptLock:()=>({
    waitLock(){events.push('wait');if(contended)throw Error('busy');held=true;},
    releaseLock(){events.push('release');held=false;}
  })},SpreadsheetApp:{flush(){assert.equal(held,true,'writes must flush before the shared lock is released');events.push('flush');}}};
  vm.runInNewContext(source+'\nglobalThis.api={SheetRepository,AnswerService};',context);
  return {...context.globalThis.api,events,isHeld:()=>held};
}

test('student writes use a web-app-safe shared lock and flush before releasing it',()=>{
  const r=writeRuntime();let wrote=false;
  assert.equal(r.SheetRepository.withDocumentLock(()=>{assert.equal(r.isHeld(),true);wrote=true;return 42;}),42);
  assert.equal(wrote,true);assert.deepEqual(r.events,['wait','flush','release']);
});

test('lock contention never executes the student write and callback errors release the lock',()=>{
  const busy=writeRuntime({contended:true});let writes=0;
  assert.throws(()=>busy.SheetRepository.withDocumentLock(()=>writes++),/busy/);
  assert.equal(writes,0);assert.equal(busy.isHeld(),false);assert.deepEqual(busy.events,['wait']);
  const r=writeRuntime();assert.throws(()=>r.SheetRepository.withDocumentLock(()=>{throw Error('write failed');}),/write failed/);
  assert.equal(r.isHeld(),false);assert.deepEqual(r.events,['wait','flush','release']);
});


test('answer append preserves reordered headers and existing rows without querying a destination row',()=>{
  const r=writeRuntime();const headers=['submittedAnswer','attemptId','isCorrect','questionText','extra'];
  const rows=[headers,['old','older',true,'previous','keep']];
  const sheet={getName:()=> '解答ログ',getLastColumn:()=>headers.length,getLastRow:()=>rows.length,
    getRange:()=>({getValues:()=>[headers]}),appendRow:row=>{rows.push(Array.from(row));}};
  r.SheetRepository.getStudentRuntimeSheet_=()=>sheet;
  r.SheetRepository.getHeaderColumnMap_(sheet);
  sheet.getLastRow=()=>{throw Error('destination row query is unnecessary');};
  r.SheetRepository.withDocumentLock(()=>r.SheetRepository.appendAnswerLog({attemptId:'new',submittedAnswer:'1.20',isCorrect:false,questionText:'new question'}));
  assert.deepEqual(rows[1],['old','older',true,'previous','keep']);
  assert.deepEqual(rows[2],['1.20','new',false,'new question','']);
});
