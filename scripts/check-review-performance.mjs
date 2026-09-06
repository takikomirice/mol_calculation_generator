import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';

export const reviewBudgets = Object.freeze({
  'open-review': 5000, 'expand-explanation': 100,
  'filter-incorrect': 5000, 'filter-level': 5000, 'load-more': 5000
});

export function checkReviewPerformance(report) {
  if (report?.schemaVersion !== 1 || !Array.isArray(report.samples) || ![3,10].includes(report.requestedRepetitions)) throw Error('Invalid benchmark report');
  const rows = Object.entries(reviewBudgets).map(([operation, budgetMs]) => {
    const samples = report.samples.filter(sample => sample.operation === operation);
    if(samples.some(s=>typeof s.ok!=='boolean' || !Number.isFinite(s.elapsedMs) || s.elapsedMs<0)) throw Error('Invalid timing sample');
    const times = samples.filter(s=>s.ok).map(s=>s.elapsedMs).sort((a,b)=>a-b);
    const p95Ms = times.length ? times[Math.ceil(times.length*0.95)-1] : null;
    const failures = samples.filter(s=>!s.ok).length;
    return {operation,budgetMs,p95Ms,failures,samples:samples.length,
      pass:samples.length===report.requestedRepetitions && failures===0 && p95Ms!==null && p95Ms<=budgetMs};
  });
  return {pass:report.complete===true && report.samples.length===report.requestedRepetitions*5 && rows.every(row=>row.pass),rows};
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    if(!process.argv[2])throw Error('Usage: npm run check:review-performance -- <report.json>');
    const result=checkReviewPerformance(JSON.parse(await readFile(process.argv[2],'utf8')));
    for(const row of result.rows) console.log(`${row.pass?'PASS':'FAIL'} ${row.operation}: p95=${row.p95Ms ?? '-'}ms / budget=${row.budgetMs}ms, failures=${row.failures}, samples=${row.samples}`);
    process.exitCode=result.pass?0:1;
  } catch(error) {console.error(error.message);process.exitCode=2;}
}
