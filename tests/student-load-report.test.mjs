import assert from 'node:assert/strict';
import test from 'node:test';
import {checkStudentLoad} from '../scripts/check-student-load.mjs';
function report() {return {schemaVersion:1,kind:'student-load',count:40,pattern:'steady',complete:true,cancelled:false,
  integrity:{expected:40,recorded:40,uniqueAttempts:40,duplicates:0,gradingErrors:0,closed:true},
  samples:Array.from({length:40},(_,index)=>({index,retry:false,operation:'submit-student',ok:true,elapsedMs:2500,startedMs:index*1500,isCorrect:index%5!==0,expectedCorrect:index%5!==0,duplicate:false}))};}
test('load gate derives p95 and requires complete unique saved work',()=>{
  const value=report();assert.equal(checkStudentLoad(value).pass,true);
  value.samples[0].elapsedMs=20000;assert.equal(checkStudentLoad(value).p95Ms,2500);assert.equal(checkStudentLoad(value).pass,false,'even a single very long wait exceeds the maximum-time budget');
  value.samples[1].elapsedMs=20000;value.samples[2].elapsedMs=20000;assert.equal(checkStudentLoad(value).pass,false);
  assert.equal(checkStudentLoad(value).p95Ms,20000);
  const missing=report();missing.integrity.recorded=39;assert.equal(checkStudentLoad(missing).pass,false);
  const duplicate=report();duplicate.samples[39].index=0;assert.equal(checkStudentLoad(duplicate).pass,false);
  const wrong=report();wrong.samples[0].isCorrect=true;assert.equal(checkStudentLoad(wrong).pass,false);
});
test('load gate keeps initial failures visible even when retry succeeds and rejects malformed measurements',()=>{
  const value=report();value.samples[0].ok=false;value.samples.push({...report().samples[0],retry:true,duplicate:true});
  assert.equal(checkStudentLoad(value).pass,false);assert.equal(checkStudentLoad(value).initialFailures,1);
  assert.throws(()=>checkStudentLoad({...report(),count:NaN}),/Invalid/);
  const malformed=report();malformed.samples[0].elapsedMs=-1;assert.throws(()=>checkStudentLoad(malformed),/Invalid/);
  const cancelled=report();cancelled.cancelled=true;assert.equal(checkStudentLoad(cancelled).pass,false);
});
