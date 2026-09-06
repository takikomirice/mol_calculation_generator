import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';

export function checkStudentLoad(report) {
  if(report?.schemaVersion!==1 || report.kind!=='student-load' || !Number.isSafeInteger(report.count) || report.count<1 || !['steady','burst'].includes(report.pattern) || !Array.isArray(report.samples)) throw Error('Invalid load report');
  for(const sample of report.samples) {
    if(!Number.isSafeInteger(sample.index) || sample.index<0 || sample.index>=report.count || typeof sample.retry!=='boolean' || typeof sample.ok!=='boolean' || !Number.isFinite(sample.elapsedMs) || sample.elapsedMs<0 || !Number.isFinite(sample.startedMs) || sample.startedMs<0 || sample.operation!=='submit-student') throw Error('Invalid load sample');
    if(sample.ok && (typeof sample.isCorrect!=='boolean' || typeof sample.expectedCorrect!=='boolean' || typeof sample.duplicate!=='boolean'))throw Error('Invalid grading sample');
  }
  const initial=report.samples.filter(sample=>!sample.retry);
  const times=initial.filter(sample=>sample.ok).map(sample=>sample.elapsedMs).sort((a,b)=>a-b);
  const p95Ms=times.length?times[Math.ceil(times.length*0.95)-1]:null;
  const maxMs=times.length?times[times.length-1]:null;
  const p50Ms=times.length?(times[Math.floor((times.length-1)/2)]+times[Math.floor(times.length/2)])/2:null;
  const initialFailures=initial.filter(sample=>!sample.ok).length;
  const gradingErrors=report.samples.filter(sample=>sample.ok && sample.isCorrect!==sample.expectedCorrect).length;
  const integrity=report.integrity || {};
  const durable=integrity.closed===true && integrity.expected===report.count && integrity.recorded===report.count && integrity.uniqueAttempts===report.count && integrity.duplicates===0 && integrity.gradingErrors===0;
  const complete=report.complete===true && !report.cancelled && initial.length===report.count && new Set(initial.map(sample=>sample.index)).size===report.count;
  const p95BudgetMs=report.pattern==='steady'?5000:8000;
  const maxBudgetMs=report.pattern==='steady'?10000:12000;
  const started=initial.map(sample=>sample.startedMs);
  const paced=report.pattern!=='steady' || !started.length || Math.max(...started)-Math.min(...started)<=(report.count-1)*2500;
  const pass=complete && report.count>=40 && durable && initialFailures===0 && gradingErrors===0 && !initial.some(sample=>sample.duplicate) && paced && p95Ms!==null && p95Ms<=p95BudgetMs && maxMs<=maxBudgetMs;
  return {pass,complete,durable,paced,count:report.count,initialFailures,gradingErrors,p50Ms,p95Ms,maxMs,p95BudgetMs,maxBudgetMs};
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
  try {
    if(!process.argv[2])throw Error('Usage: npm run check:student-load -- report.json');
    const result=checkStudentLoad(JSON.parse(await readFile(process.argv[2],'utf8')));
    console.log(JSON.stringify(result,null,2));process.exitCode=result.pass?0:1;
  } catch(error) {console.error(error.message);process.exitCode=2;}
}
