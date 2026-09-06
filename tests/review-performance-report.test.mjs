import assert from 'node:assert/strict';
import test from 'node:test';
import {checkReviewPerformance,reviewBudgets} from '../scripts/check-review-performance.mjs';
const valid=()=>({schemaVersion:1,complete:true,requestedRepetitions:3,samples:Object.keys(reviewBudgets).flatMap(operation=>Array.from({length:3},()=>({operation,elapsedMs:50,ok:true})))});
test('performance gate rejects incomplete, failed or slow runs and does not trust embedded budgets',()=>{
  assert.equal(checkReviewPerformance(valid()).pass,true);
  const partial=valid();partial.samples.pop();assert.equal(checkReviewPerformance(partial).pass,false);
  const failed=valid();failed.samples[0].ok=false;assert.equal(checkReviewPerformance(failed).pass,false);
  const slow=valid();slow.samples[0].elapsedMs=6000;slow.samples[0].budgetMs=99999;assert.equal(checkReviewPerformance(slow).pass,false);
  const unfinished=valid();unfinished.complete=false;assert.equal(checkReviewPerformance(unfinished).pass,false);
  const invalid=valid();invalid.samples[0].elapsedMs=-1;assert.throws(()=>checkReviewPerformance(invalid),/Invalid/);
  assert.throws(()=>checkReviewPerformance({}),/Invalid/);
});
