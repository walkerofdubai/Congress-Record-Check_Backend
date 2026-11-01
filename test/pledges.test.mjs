// Money pledges (step 7): statements tagged "pledge" are checked again against the records on file (public/pledges.js),
// shown under the reviewed verdict, and flagged only when the records directly conflict with it.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {pledgeCheck,allPledges,reportTiming,pledgeSince,conflictWith,PLEDGE_KINDS} from '../public/pledges.js';
import {promiseScore} from '../public/grades.js';
const D=JSON.parse(await fs.readFile(new URL('../public/research.json',import.meta.url),'utf8'));

const filings=[{report:'Q1',start:'2026-01-01',end:'2026-03-31',url:'u1'},{report:'Q2',start:'2026-04-01',end:'2026-06-30',url:'u2'},{report:'Y24',start:'2024-01-01',end:'2024-12-31',url:'u0'}];
// PAC names 0-5, with FEC records for 0-3 (4 and 5 not matched).
const base={pacNames:['Acme Corp PAC','Widget Makers Association PAC','Teamsters DRIVE','Clean Air Voters','Unnamed Fund','Steel Builders PAC'],
  pacIds:['C1','C2','C3','C4',null,null],pacCommittees:{C1:['ACME CORP PAC','Q','B','C'],C2:['WIDGET MAKERS','Q','U','T'],C3:['DRIVE','Q','U','L'],C4:['CLEAN AIR','N','U',null]}};
const said=date=>({text:'pledge',date,src:{t:'s',u:'u'}});

test('a report counts after a pledge only when it starts on or after the pledge date',()=>{
  assert.equal(reportTiming(filings[1],'2026-03-26'),'after');
  assert.equal(reportTiming(filings[0],'2026-03-26'),'during','the report covering the pledge date decides nothing');
  assert.equal(reportTiming(filings[2],'2026-03-26'),'before');
  assert.equal(reportTiming(filings[0],null),'after','no start date: the whole record on file counts');
  assert.equal(pledgeSince({said:said('2026-03-26'),pledge:{kind:'corporate-pac'}}),'2026-03-26');
  assert.equal(pledgeSince({said:said('2026-03-26'),pledge:{kind:'corporate-pac',since:null}}),null);
  assert.equal(pledgeSince({said:{date:'2025–2026'},pledge:{kind:'corporate-pac'}}),null,'a date that is not a day counts the whole record');
});

test('a corporate-PAC pledge counts only PACs the FEC records as a company\'s, after the pledge',()=>{
  const s={id:'x',pac:{filings,rows:[[0,5000,'manuf',1],[0,2500,'manuf',0],[0,1000,'manuf',2],[1,4000,'manuf',1],[2,5000,'labor',1],[3,1000,'ideo',1]]}};
  const x={assessment:'consistent',said:said('2026-03-26'),pledge:{kind:'corporate-pac'}};
  const r=pledgeCheck(base,s,x);
  assert.equal(r.outcome,'not-kept');assert.equal(r.after,5000);
  assert.deepEqual(r.totals,{after:5000,during:2500,before:1000,beside:4000,unknown:0},'the trade association is listed beside it, not counted');
  assert.equal(r.counted.after[0].type,'Corporate PAC');assert.equal(r.counted.after[0].url,'u2');
  assert.equal(r.conflict,true,'a reviewed "consistent" with company PAC money after the pledge is flagged');
  // Refunded checks named in the pledge come off.
  assert.equal(pledgeCheck(base,s,{...x,pledge:{kind:'corporate-pac',refunded:[{pac:'Acme Corp PAC',amount:5000}]}}).outcome,'kept');
  // Only money in the report covering the pledge date: kept, with that report shown apart.
  const d=pledgeCheck(base,{id:'x',pac:{filings,rows:[[0,2500,'manuf',0]]}},x);
  assert.equal(d.outcome,'kept');assert.equal(d.totals.during,2500);assert.equal(d.conflict,false);
});

test('a corporate-PAC pledge waits while a PAC after it has no FEC type on file',()=>{
  const s={id:'x',pac:{filings,rows:[[5,5000,'manuf',1],[4,1000,'lead',1],[2,5000,'labor',1]]}};
  const x={assessment:'consistent',said:said('2026-03-26'),pledge:{kind:'corporate-pac'}};
  const r=pledgeCheck(base,s,x);
  assert.equal(r.outcome,'waiting');assert.equal(r.totals.unknown,5000,'leadership and labor PACs by name are never a company\'s');assert.equal(r.conflict,false);
  // Before the PAC types are saved, every business-sector or unclassified PAC after the pledge waits.
  const none={pacNames:base.pacNames};
  assert.equal(pledgeCheck(none,{id:'x',pac:{filings,rows:[[0,5000,'manuf',1]]}},x).outcome,'waiting');
  assert.equal(pledgeCheck(none,{id:'x',pac:{filings,rows:[[2,5000,'labor',1]]}},x).outcome,'kept');
  assert.equal(pledgeCheck(none,{id:'x',pac:{filings,rows:[[0,5000,'manuf',2]]}},x).outcome,'kept','money before the pledge doesn\'t count');
  assert.equal(pledgeCheck(none,{id:'x'},x).outcome,'none');
});

test('a single-issue PAC pledge counts ideological PACs and bundled gifts after it',()=>{
  const s={id:'x',pac:{filings,rows:[[3,1000,'ideo',2],[3,500,'ideo',0]]}};
  const x={assessment:'changed',said:said('2026-03-26'),pledge:{kind:'single-issue-pac'}};
  let r=pledgeCheck(base,s,x);
  assert.equal(r.outcome,'kept');assert.deepEqual([r.totals.before,r.totals.during],[1000,500]);
  const withBundled=m=>({...base,groupPos:[{key:'aipac',org:'AIPAC'}],bundled:{people:{x:{aipac:{routed:9000,src:'b',...m}}}}});
  r=pledgeCheck(withBundled({byMonth:{'2025-11':4000,'2026-03':2000,'2026-05':3000}}),s,x);
  assert.equal(r.outcome,'not-kept');assert.equal(r.after,3000);
  assert.deepEqual(r.bundled.map(b=>[b.when,b.amount]),[['after',3000],['during',2000],['before',4000]]);
  r=pledgeCheck(withBundled({}),s,x);
  assert.equal(r.outcome,'kept','bundled gifts without months saved decide nothing');assert.equal(r.bundled[0].when,'undated');
});

test('a stock-trading pledge is checked against the bans\' sponsors, cosponsors and votes',()=>{
  const data={billIndex:[{id:'119-s-9',title:'Ban',reform:['stock-trading'],versions:['117-s-3'],cosponsors:[{person:'x',bill:'119-s-9',sponsor:true,date:'2025-05-01'}]},
    {id:'119-hr-7',title:'Limit',reform:['stock-trading']},{id:'119-hr-8',title:'Revolving door',reform:['lobbying'],cosponsors:[{person:'x',bill:'119-hr-8'}]}],
    votes:[{congress:119,session:2,number:253,date:'2026-09-30',question:'Cloture',bill:{measure:'H.R. 7 (119th Congress)'},pos:{x:'Nay',y:'Yea'}}],hvotes:[]};
  const x={assessment:'unclear',said:said('2022-01-12'),pledge:{kind:'stock-trading'}};
  let r=pledgeCheck(data,{id:'x',bills:[{congress:117,num:'S. 3'}]},x);
  assert.equal(r.outcome,'mixed');assert.equal(r.forBills,1,'a bill and its earlier version are one bill');assert.equal(r.againstBills,1);
  assert.deepEqual(r.actions.map(a=>a.what),['Voted Nay (Cloture)','Sponsored','Sponsored']);
  assert.match(r.actions[0].src.u,/vote_119_2_00253\.htm$/);assert.match(r.actions[1].src.u,/119th-congress\/senate-bill\/9$/);
  assert.equal(pledgeCheck(data,{id:'y'},x).outcome,'kept');
  assert.equal(pledgeCheck(data,{id:'z'},x).outcome,'none');
  assert.equal(pledgeCheck(data,{id:'x'},{...x,pledge:{kind:'lobbying'}}).outcome,'kept','each pledge reads its own bills');
  // Voting against a ban is only flagged when the review called the pledge kept.
  assert.equal(conflictWith('consistent','against'),true);assert.equal(conflictWith('unclear','against'),false);assert.equal(conflictWith('partial','mixed'),false);
  assert.equal(conflictWith('contradiction','kept'),true);
});

test('the money pledges on file are tagged, checked, and never change the Promise score',()=>{
  const all=allPledges(D);
  assert.equal(all.length,12);
  for(const {statement:x,check:c} of all){assert.ok(PLEDGE_KINDS[x.pledge.kind]);assert.ok(c.outcomeLabel);}
  const by=Object.fromEntries(all.map(({person,statement,check})=>[`${person.id}:${statement.pledge.kind}`,check]));
  assert.deepEqual(Object.keys(by).sort(),['booker:corporate-pac','booker:single-issue-pac','conley:corporate-pac','elsayed:corporate-pac','hinson:stock-trading','marshall:stock-trading',
    'mgp:stock-trading','ossoff:corporate-pac','ossoff:stock-trading','pappas:stock-trading','ricketts:stock-trading','stratton:corporate-pac']);
  assert.equal(by['ossoff:stock-trading'].outcome,'mixed','sponsored bans, and voted against the Stop Insider Trading Act');
  assert.ok(by['ossoff:stock-trading'].actions.some(a=>a.measure==='S. 3494'),'his 2022 ban counts as a version of S. 1879');
  for(const k of ['mgp','hinson','pappas','ricketts'])assert.equal(by[`${k}:stock-trading`].outcome,'kept',k);
  assert.equal(by['booker:single-issue-pac'].outcome,'kept','no ideological PAC money in the reports after March 26, 2026');
  // Until the FEC PAC types are saved, the corporate-PAC checks wait rather than guess.
  if(!Array.isArray(D.pacIds))for(const k of ['ossoff','booker','stratton','conley','elsayed'])assert.equal(by[`${k}:corporate-pac`].outcome,'waiting',k);
  assert.ok(D.billIndex.find(b=>b.id==='119-hr-7008').reform.includes('stock-trading'));
  assert.ok(!D.billIndex.find(b=>b.id==='119-hr-7008').issue,'the Stop Insider Trading Act still stays out of Your match');
  // The Promise score reads only the reviewed verdicts.
  for(const {person} of all){const strip=person.statements.map(({pledge,...x})=>x);assert.deepEqual(promiseScore(person.statements),promiseScore(strip));}
});
