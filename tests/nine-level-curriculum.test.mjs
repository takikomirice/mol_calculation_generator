import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import vm from 'node:vm';
import test from 'node:test';

async function runtime() {
  let id=0, seed=19;
  const math=Object.create(Math);math.random=()=>((seed=(seed*1664525+1013904223)>>>0)/4294967296);
  const ctx={Math:math,console,Utilities:{getUuid:()=>String(++id),DigestAlgorithm:{SHA_256:'sha'},computeDigest:(_,s)=>Array.from(createHash('sha256').update(s).digest())}};
  vm.runInNewContext(await readFile('Code.gs','utf8')+'\nglobalThis.api={MolProblemService,AutoPracticeService,StudentLearningService,AggregationService,AnswerService,SheetRepository,MonitorRefreshService};',ctx);
  return ctx.api;
}
const atomic={H:1,C:12,N:14,O:16,Na:23,Cl:35.5,S:32,Ca:40};
function mass(formula) {return [...formula.matchAll(/([A-Z][a-z]?)(\d*)/g)].reduce((n,m)=>n+atomic[m[1]]*Number(m[2]||1),0);}
function expected(p) {
  const g=p.given, m=mass(p.substance.formula);
  if(p.problemType==='formula_to_relative_mass')return m;
  if(p.problemType==='density_to_mass')return g.value*g.density;
  if(p.problemType==='density_mass_to_volume')return g.value/g.density;
  if(p.problemType==='density_to_mol')return g.value*g.density/m;
  if(p.problemType==='density_to_particles')return g.value*g.density/m*p.avogadroConstant;
  const n=g.unit==='mol'?g.value:g.unit==='g'?g.value/m:g.unit==='L'?g.value/22.4:g.value/p.avogadroConstant;
  return p.unit==='mol'?n:p.unit==='g'?n*m:p.unit==='L'?n*22.4:n*p.avogadroConstant;
}

test('Lv0-8 questions are solvable from atomic data and displayed quantities without leaked molar mass',async()=>{
  const {MolProblemService:m}=await runtime();
  const counts=[1,6,6,6,6,4,6,10,16];
  for(let level=0;level<=8;level++) {
    const lv='lv'+level, groups=m.practiceGroups_(lv), seen=new Set();
    for(const category of Object.keys(groups))for(let i=0;i<100;i++) {
      const p=m.generateProblem({level:lv,category});assert.equal(p.level,lv);seen.add(p.problemType);
      const raw=expected(p), want=level===8?Number(raw.toPrecision(3)):raw;
      assert.ok(Math.abs(p.expectedAnswer-want)<=Math.abs(want)*1e-11,JSON.stringify(p));
      assert.equal(m.gradeProblemAnswer(p,level===8?want.toExponential(2):String(want)).isCorrect,true);
      assert.equal(m.gradeProblemAnswer(p,String(want*1.1)).isCorrect,false);
      const pub=m.toPublicProblem(p);
      if(level===8) {
        assert.match(pub.questionText,/有効数字3桁で求めてください/);
        assert.doesNotMatch(pub.questionText+p.explanation,/丸め/);
      }
      assert.equal(pub.expectedAnswer,undefined);assert.equal(pub.explanation,undefined);
      assert.ok(pub.givenValues.every(v=>!('isRequired' in v)));
      assert.ok(pub.givenValues.every(v=>!v.value.includes('g/mol')));
      if(level===0){assert.equal(p.unit,'');assert.match(p.questionText,/分子量|式量/);assert.match(pub.inputHint,/単位を付けません/);}
      if(level>=6){assert.equal(pub.givenValues.filter(v=>v.label.includes('原子量')).length,8);assert.ok(pub.givenValues.some(v=>v.label==='アボガドロ定数'));assert.ok(pub.givenValues.some(v=>v.label.includes('モル体積')));}
      if(p.problemType.startsWith('density_')){assert.equal(p.substance.isGasAtSTP,false);assert.match(p.questionText,/液体/);assert.ok(p.givenValues.some(v=>v.value.includes('g/mL')));}
    }
    assert.equal(seen.size,counts[level],lv);
  }
});

test('only Lv8 strictly grades significant digits; invalid levels and unsupported focus are rejected',async()=>{
  const {MolProblemService:m}=await runtime();
  for(let i=0;i<8;i++){assert.equal(m.strictPracticeGrade_('1.2',1.2,'lv'+i).isCorrect,true);assert.equal(m.strictPracticeGrade_('1',1.2,'lv'+i).isCorrect,false);}
  assert.equal(m.strictPracticeGrade_('1.2',1.2,'lv8').acceptedAnswerType,'precision');
  assert.equal(m.strictPracticeGrade_('1.20',1.2,'lv8').isCorrect,true);
  for(const level of ['lv9','lv-1','nonsense'])assert.throws(()=>m.generateProblem({level}),/レベル/);
});

test('auto progresses through all nine levels including staged density and precision without deadlock',async()=>{
  const {AutoPracticeService:a,MolProblemService:m}=await runtime();let state=a.initial_();assert.equal(state.level,'lv0');
  const visited=new Set(),categories=new Set();
  for(let i=0;i<360;i++) {
    visited.add(state.level);categories.add(state.level+':'+state.category);
    const types=a.types_(state), type=types[i%types.length];
    a.apply_(state,{level:state.level,problemType:m.getProblemTypeById_(type).key,isCorrect:true,clientInfo:JSON.stringify({curriculumVersion:4,autoPractice:a.metadata_(state)})});
  }
  assert.equal(visited.size,9);assert.equal(state.level,'lv8');assert.equal(state.reason,'steady');
  for(const key of ['lv5:density_basics','lv5:density_mol','lv5:density_particles','lv8:precision_basic','lv8:precision_mixed'])assert.ok(categories.has(key),key);
  const before=JSON.stringify(state);a.apply_(state,{level:'lv8',problemType:'mol_to_mass',isCorrect:true,clientInfo:JSON.stringify({curriculumVersion:3,autoPractice:{version:1,level:'lv8',category:state.category,stageId:state.stageId}})});assert.equal(JSON.stringify(state),before);
});

test('old answers remain in effort totals but cannot become current level mastery or auto progress',async()=>{
  const {AnswerService:s,AggregationService:g,AutoPracticeService:a,MonitorRefreshService:r,SheetRepository:repo}=await runtime();
  const old={rosterKey:'c::s',level:'lv5',problemType:'mol_to_mass',isCorrect:true,timestamp:'2026-09-01',clientInfo:'{}'};
  const fresh={...old,level:'lv0',problemType:'formula_to_relative_mass',timestamp:'2026-09-08',clientInfo:JSON.stringify({curriculumVersion:4,autoPractice:a.metadata_(a.initial_())})};
  const rows=[old,fresh],summary=g.buildAggregateRows(rows,'now')[0];
  assert.equal(summary.totalAttempts,2);assert.equal(summary.lv5Attempts,0);assert.equal(summary.lv0Attempts,1);
  assert.equal(g.buildProblemTypeStatsRows(rows,'now').length,1);
  assert.equal(summary.autoProgress.level,'lv0');assert.equal(summary.autoProgress.lastMode,'auto');
  const roundtrip=repo.aggregateCacheObjectToRow_(repo.aggregateCacheSummaryToHeaderValues_(summary));assert.equal(roundtrip.autoProgress.level,'lv0');
  const incremental=r.emptyState_();rows.forEach((row,i)=>r.add_(incremental,row,i+2));const actual=r.summaries_(incremental)[0];
  assert.equal(actual.lv0Attempts,1);assert.equal(actual.lv5Attempts,0);assert.deepEqual(JSON.parse(JSON.stringify(actual.autoProgress)),JSON.parse(JSON.stringify(summary.autoProgress)));
  assert.equal(s.buildAnswerClientInfo_({curriculumVersion:99},{}).curriculumVersion,4);
});

test('density-only explanations select density without asking for molar mass; fallback always selects a valid stage',async()=>{
  const {MolProblemService:m,AutoPracticeService:a}=await runtime();
  for(const id of [16,17]) {
    const p=m.generateProblem({level:'lv7',problemType:id});
    assert.doesNotMatch(p.explanation.split('使用する情報：')[1],/モル質量/);
  }
  for(const [level,category,type] of [['lv1','mol_mass',1],['lv7','',7],['lv7','',18],['lv8','precision_basic',1]]) {
    const state=a.initial_();a.move_(state,level,category,'practice');
    for(let i=0;i<5;i++)a.apply_(state,{level:state.level,problemType:m.getProblemTypeById_(type).key,isCorrect:false,clientInfo:JSON.stringify({curriculumVersion:4,autoPractice:a.metadata_(state)})});
    assert.ok(a.types_(state)?.length,JSON.stringify(state));
    assert.ok(m.generateProblem({level:state.level,category:state.category}));
  }
});

test('out-of-order timestamps do not disagree between full and incremental auto monitoring',async()=>{
  const {AutoPracticeService:a,AggregationService:g,MonitorRefreshService:r}=await runtime();
  const first={rosterKey:'c::s',level:'lv0',problemType:'formula_to_relative_mass',isCorrect:true,timestamp:'2026-09-08T10:00:02Z',clientInfo:JSON.stringify({curriculumVersion:4,autoPractice:a.metadata_(a.initial_())})};
  const earlier={...first,timestamp:'2026-09-08T10:00:01Z',clientInfo:JSON.stringify({curriculumVersion:4})};
  const state=r.emptyState_();[first,earlier].forEach((row,i)=>r.add_(state,row,i+2));
  assert.deepEqual(JSON.parse(JSON.stringify(r.summaries_(state)[0].autoProgress)),JSON.parse(JSON.stringify(g.buildAggregateRows([first,earlier],'now')[0].autoProgress)));
});
