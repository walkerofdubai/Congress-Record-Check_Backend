import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {letter,promiseScore,ethicsScore,legalTrouble,insiderTrading,disclosureDodger,amountMid,pvpScore,pvpActions,billScore,BILL_GROUPS,GAINS_STEPS,ACCESS_STEPS,moneyRatio,matchScore,tradeChecks,billKey,billKeyFromText,oneCreditPerBill,MIN_CHECKS,ETHICS_COST,CASE_KIND,CASE_AGE,INDEX_COST,INSIDER,DODGER} from '../public/grades.js';
const data=JSON.parse(await fs.readFile(new URL('../public/research.json',import.meta.url),'utf8'));
const people=data.members.concat(data.cands,data.featured||[]);
const st=(...a)=>a.map(assessment=>({assessment}));
test('letter grades use the usual 90/80/70/60 cut-offs',()=>{
  assert.deepEqual([100,90,89.9,80,79,70,69,60,59,0].map(letter),['A','A','B','B','C','C','D','D','F','F']);
});
test('promises: kept 1, partly or changed 1/2, broken 0; unclear and outcome checks left out; too few checks is not a zero',()=>{
  assert.equal(promiseScore(st('consistent','consistent','contradiction')).pct,67);
  assert.equal(promiseScore(st('consistent','partial','changed','outcome','unclear')).pct,67);
  assert.equal(promiseScore(st('consistent','consistent','outcome')).pct,null);
  assert.equal(promiseScore([]).pct,null);
  assert.equal(MIN_CHECKS,3);
});
test('ethics: findings, open and closed investigations cost points; allegations and "None found" do not',()=>{
  const e=(status,stage,outcome='x')=>({status,stage,outcome});
  assert.equal(ethicsScore([]).pct,100);
  assert.equal(ethicsScore([e('allegation'),e('allegation'),e('x','x','None found')]).pct,100);
  assert.equal(ethicsScore([e('finding')]).pct,100-ETHICS_COST.finding);
  assert.equal(ethicsScore([e('investigation','open')]).pct,100-ETHICS_COST.open);
  assert.equal(ethicsScore([e('investigation','closed')]).pct,100-ETHICS_COST.closed);
  assert.equal(ethicsScore(Array(9).fill(e('finding'))).pct,0);
});
const mark=(side,weight=1)=>({side,weight,score:(side==='people'?100:-100)*weight});
test('Workers > Profit: a Yea or sponsorship takes the bill side, a Nay the other, missed votes count nothing, one credit per bill; needs 3 actions',()=>{
  const marks=new Map([['119-hr-1',mark('profit')],['119-s-5',mark('people')],['119-hr-7',mark('people')],['119-hr-9',mark('profit')]]);
  const acts=pvpActions(marks,[{bill:'119-hr-1',pos:'Nay'},{bill:'119-s-5',pos:'Yea'},{bill:'119-hr-9',pos:'Not Voting'},{bill:'119-hr-2',pos:'Yea'}],[{bill:'119-hr-7',kind:'sponsored'},{bill:'119-s-5',kind:'cosponsored'}]);
  const r=pvpScore(acts);
  assert.equal(r.n,3);assert.equal(r.people,3);assert.equal(r.nPeople,3);assert.equal(r.profit,0);assert.equal(r.pct,100);
  assert.equal(r.scored.find(a=>a.bill==='119-s-5').kind,'vote');
  assert.equal(pvpScore(pvpActions(marks,[{bill:'119-hr-1',pos:'Yea'},{bill:'119-s-5',pos:'Nay'}],[])).pct,null);
  assert.equal(pvpScore(pvpActions(marks,[{bill:'119-hr-1',pos:'Yea'},{bill:'119-s-5',pos:'Yea'}],[{bill:'119-hr-7'}])).pct,67);
});
test('every displayed investigation says whether it is open or closed',()=>{
  for(const s of people)for(const e of s.ethics)if(e.status==='investigation')assert.ok(['open','closed'].includes(e.stage),`${s.id}: ${e.title}`);
});
test('Workers > Profit: each action counts its bill\'s strength, so a lukewarm bill counts less than a clear-cut one',()=>{
  const marks=new Map([['1-hr-1',mark('people',0.75)],['1-hr-2',mark('profit',1)],['1-hr-3',mark('people',0.5)]]);
  const r=pvpScore(pvpActions(marks,[{bill:'1-hr-1',pos:'Yea'},{bill:'1-hr-2',pos:'Yea'},{bill:'1-hr-3',pos:'Nay'}],[]));
  assert.deepEqual([r.people,r.profit,r.nPeople,r.nProfit,r.pct],[0.75,1.5,1,2,33]);
  assert.deepEqual(r.scored.map(a=>a.points),[0.75,1,0.5]);
});
test('a bill\'s score: who gains and who took a side count half each, and opposite signals set it aside',()=>{
  const g=step=>({step,why:'x',src:{t:'x',u:'https://x'}}),p=(group,pos)=>({group,pos});
  // The One Big Beautiful Bill Act: the bottom loses while the top gains, and the AFL-CIO opposed it while the Chamber backed it.
  assert.deepEqual([billScore({gains:g(-100),sides:[p('aflcio','oppose'),p('chamber','support'),p('nfib','support')]})].map(b=>[b.score,b.status,b.side,b.weight]),[[-100,'scored','profit',1]]);
  // A business group opposing a bill counts toward workers.
  assert.equal(billScore({gains:g(50),sides:[p('aflcio','support'),p('chamber','oppose')]}).score,75);
  assert.equal(billScore({sides:[p('chamber','oppose'),p('aflcio','support')]}).score,100,'opposite sides decide alone');
  assert.equal(billScore({sides:[p('chamber','support'),p('aflcio','support')]}).status,'even','both sides support it');
  assert.equal(billScore({sides:[p('aflcio','oppose')]}).status,'one-side','one side alone does not mark a bill');
  assert.equal(billScore({gains:g(50),sides:[p('aflcio','support')]}).score,75,'with a who-gains study, one side counts');
  assert.equal(billScore({gains:g(-50),sides:[p('aflcio','support'),p('chamber','oppose')]}).status,'disputed');
  assert.equal(billScore({gains:g(-50)}).score,-50);
  // Each side is averaged first, so three business groups don't outweigh one worker group.
  assert.equal(billScore({sides:[p('aflcio','support'),p('chamber','support'),p('nfib','support'),p('nam','support')]}).score,0);
  assert.equal(billScore({sides:[p('aflcio','support'),p('epi','oppose'),p('chamber','oppose')]}).score,50,'a split side counts as its average');
  // The Tax Foundation and ITEP count on tax bills only.
  assert.equal(billScore({sides:[p('itep','support'),p('taxfoundation','oppose')]}).status,'none');
  assert.equal(billScore({tax:true,sides:[p('itep','support'),p('taxfoundation','oppose')]}).score,100);
  assert.equal(billScore({gains:g(30)}).status,'none','only the five steps count');
  // The building-trades unions and the contractors' group count on construction-pay measures only.
  assert.equal(billScore({sides:[p('nabtu','oppose'),p('abc','support')]}).status,'none');
  assert.equal(billScore({construction:true,sides:[p('nabtu','oppose'),p('abc','support')]}).score,-100);
  // Access to a basic need counts with money in who gains; with both, their average.
  assert.equal(billScore({access:g(100),sides:[p('aflcio','support')]}).score,100,'access alone is a who-gains study');
  assert.deepEqual(['gainsPart','moneyPart','accessPart'].map(k=>billScore({gains:g(-100),access:g(-50)})[k]),[-75,-100,-50]);
  assert.equal(billScore({gains:g(50),access:g(-100)}).gainsPart,-25,'money and access pointing opposite ways are averaged');
  // An amendment is keyed on its own, so its vote isn't merged with the bill's.
  assert.equal(billKeyFromText('S.Amdt. 1858 (117th Congress)'),'117-samdt-1858');
});
test('every Workers > Profit bill has a valid ID, cited evidence and known groups',()=>{
  for(const v of data.votes.concat(data.hvotes))assert.ok(!v.pvp,v.id+': bill evidence belongs in the bills list, once per bill');
  const cited=x=>x&&x.why&&x.src&&/^https:\/\//.test(x.src.u);
  for(const b of data.bills||[]){
    assert.ok(/^(\d+-[a-z]+-\d+|eo-\d+)$/.test(b.id),b.id);assert.ok(b.title,b.id+' needs a title');assert.ok(!b.pvp,b.id+': the side comes from its score now');
    if(b.gains){assert.ok(String(b.gains.step) in GAINS_STEPS,b.id+' who-gains step');assert.ok(cited(b.gains)&&b.gains.by,b.id+' who-gains needs a reason, an analyst and a source');}
    if(b.access){assert.ok(String(b.access.step) in ACCESS_STEPS,b.id+' access step');assert.ok(cited(b.access)&&b.access.by,b.id+' access needs a reason, an analyst and a source');}
    for(const k of b.versions||[])assert.ok(/^\d+-[a-z]+-\d+$/.test(k)&&k!==b.id,b.id+': bad version '+k);
    for(const st of b.stated||[]){assert.ok(st.person&&['support','oppose'].includes(st.pos),b.id+' statement');assert.ok(cited(st),b.id+': '+st.person+'\'s statement needs a reason and a source');}
    for(const c of b.cosponsors||[])assert.ok(c.person&&/^\d+-[a-z]+-\d+$/.test(c.bill),b.id+' cosponsor record');
    for(const s of b.sides||[]){assert.ok(BILL_GROUPS[s.group],b.id+': unknown group '+s.group);assert.ok(['support','oppose'].includes(s.pos),b.id);assert.ok(cited(s),b.id+': '+s.group+' needs a reason and a source');}
    assert.ok(b.gains||b.access||b.sides?.length||b.context?.note,b.id+' needs some evidence, or a note saying why there is none');
  }
});
test('My alignment: every issue has a statement to agree or disagree with, and a known category',()=>{
  const groups=new Set(['econ','rights','imm','foreign','env','gov']);
  for(const i of data.issues){
    assert.ok(groups.has(i.group),`${i.id}: group ${i.group}`);
    assert.ok(typeof i.statement==='string'&&i.statement.length>20&&/[.]$/.test(i.statement),`${i.id}: statement`);
  }
});
test('outside money ratio is always for-to-against: larger side gets the number, "all" when one side is zero, nothing when both are',()=>{
  const r=(f,a)=>moneyRatio(f,a).text;
  assert.equal(r(210,100),'2.1 : 1');
  assert.equal(r(100,340),'1 : 3.4');
  assert.equal(r(200,100),'2 : 1');
  assert.equal(r(104,100),'1 : 1');
  assert.equal(r(100,104),'1 : 1');
  assert.equal(r(2100,100),'21 : 1');
  assert.equal(r(9.97,1),'10 : 1');
  assert.equal(r(500,0),'no opposing spending');
  assert.equal(r(0,500),'no supporting spending');
  assert.equal(moneyRatio(500,0).oneSided,true);
  assert.deepEqual([[210,100],[100,340],[500,0],[0,500],[104,100],[100,100]].map(([f,a])=>moneyRatio(f,a).side),['for','against','for','against','even','even']);
  assert.equal(moneyRatio(0,0),null);
  assert.equal(moneyRatio(-5,0),null);
  assert.equal(moneyRatio(300,100).share,.75);
  assert.equal(moneyRatio(100,100).share,.5);
  assert.equal(moneyRatio(0,9).share,0);
});
test('bill IDs: one form for every way a bill is written',()=>{
  assert.equal(billKeyFromText('H.R. 1319 (117th Congress)'),'117-hr-1319');
  assert.equal(billKeyFromText('S.J.Res. 77 (119th Congress)'),'119-sjres-77');
  assert.equal(billKeyFromText('H.Con.Res. 64 (119th Congress)'),'119-hconres-64');
  assert.equal(billKeyFromText('H.Res. 24 (117th Congress)'),'117-hres-24');
  assert.equal(billKeyFromText('Nomination PN11-7 (119th Congress)'),null);
  assert.equal(billKey(119,'S. 3267'),'119-s-3267');
  assert.equal(billKey(119,'H.J.Res. 72'),'119-hjres-72');
  for(const v of data.votes.concat(data.hvotes)){const m=(v.bill||{}).measure||'';if(/^(H|S)\.(R\.|J\.Res\.|Con\.Res\.|Res\.)?\s?\d/.test(m))assert.ok(billKeyFromText(m),v.id+' '+m);}
});
test('one credit per bill: a vote replaces a sponsorship of the same bill',()=>{
  const r=oneCreditPerBill([{bill:'b1',type:'sponsored',side:'A'},{bill:'b1',type:'senate_vote',side:'B'},{bill:'b2',type:'sponsored'},{type:'stated'}]);
  assert.equal(r.length,3);assert.equal(r[0].type,'senate_vote');
});
test('your match: weighted by importance, statement-only issues at half importance, no-evidence issues left out',()=>{
  const ev={a:[{type:'senate_vote',side:'A'},{type:'senate_vote',side:'B'}],b:[{type:'stated',side:'A'}],c:[{type:'house_vote',side:'B'}],d:[]};
  const r=matchScore([{id:'a',side:'A',w:2},{id:'b',side:'A',w:2},{id:'c',side:'A',w:3},{id:'d',side:'A',w:1}],ev);
  // a: 1/2 x 2 = 1; b: 1/1 x (2 x 0.5) = 1; c: 0/1 x 3 = 0 -> 2 / (2 + 1 + 3) = 33%
  assert.equal(r.score,33);assert.equal(r.nCov,3);assert.equal(r.effW,6);
  assert.equal(matchScore([{id:'a',side:'A',w:3},{id:'d',side:'A',w:3}],ev).score,null);
});
test('promises: vague goals and not-yet-actionable promises are left out; an unacted promise counts as contradicted',()=>{
  const r=promiseScore([{assessment:'consistent'},{assessment:'consistent'},{assessment:'contradiction',unacted:{reason:'x'}},{assessment:'pending'},{assessment:'consistent',vague:true}]);
  assert.equal(r.pct,67);assert.equal(r.vague,1);assert.equal(r.notCounted,1);assert.equal(r.unacted,1);
});
test('trade checks: a report after 45 days or never is late; a single stock in an overseen sector is a conflict, a fund is not',()=>{
  const t=tradeChecks([{traded:'2026-01-01',filed:'2026-03-01',sector:'Energy'},{traded:'2026-01-01',filed:'2026-01-20',sector:'Energy',asset:'fund'},{traded:'2026-01-01',filed:'2026-01-10',sector:'Retail'},{missing:true,traded:'2026-02-01'}],['Energy']);
  assert.equal(t.late,2);assert.equal(t.conflict,1);
});
test('Legal Trouble Index: status points × kind × age, totaled with a ceiling of 100',()=>{
  const c=(status,kind,decided,stage)=>({status,stage,kind,decided,outcome:'x'});
  assert.deepEqual([CASE_KIND.criminal,CASE_KIND.ethics,CASE_KIND.technical,CASE_AGE.years,CASE_AGE.factor],[1.5,1,0.5,10,0.5]);
  // The worked example: an open criminal investigation, an ethics finding from 12 years ago and a closed FEC late-filing case.
  const ex=legalTrouble([c('investigation','criminal',null,'open'),c('finding','ethics',2014),c('investigation','technical',2025,'closed')],{asOfYear:2026});
  assert.deepEqual(ex.rows.map(r=>r.points),[22.5,10,2.5]);assert.equal(ex.index,35);
  assert.equal(legalTrouble([c('investigation','criminal',2001,'open')],{asOfYear:2026}).index,22.5,'an open case is never discounted for age, and the index keeps its exact value');
  assert.equal(legalTrouble([c('finding','ethics',2016)],{asOfYear:2026}).index,20,'exactly 10 years is not more than 10');
  assert.equal(legalTrouble([c('finding','criminal',2024),c('finding','criminal',2024),c('finding','criminal',2024),c('finding','criminal',2024)],{asOfYear:2026}).index,100,'ceiling');
  assert.equal(legalTrouble([c('allegation','criminal'),{status:'finding',outcome:'None found'}]).index,0,'allegations and "None found" cost nothing');
  assert.equal(legalTrouble([c('finding',undefined,2024)]).index,ETHICS_COST.finding,'an untagged case counts as ethics, at full value');
  const stock={status:'finding',kind:'technical',type:'STOCK Act',decided:2025,outcome:'x'};
  assert.equal(legalTrouble([stock]).index,10);
  assert.equal(legalTrouble([stock],{stockActCovered:true}).index,0,'counted in the Stock Disclosure Dodger Index instead');
});
test('Insider Trading Index: conflicts by dollar value, trades near votes, trades in donors, single-stock activity',()=>{
  assert.equal(amountMid('$1,001 - $15,000'),8000.5);assert.equal(amountMid('$50,000'),50000);assert.equal(amountMid(''),null);
  assert.deepEqual(insiderTrading([],{covered:false}),{index:null,why:'No trading data',n:0,parts:null});
  assert.equal(insiderTrading([]).index,0);assert.equal(insiderTrading([]).why,'No trades');
  const t=(o)=>Object.assign({traded:'2025-06-01',amount:'$1,001 - $15,000',asset:'stock'},o);
  const few=insiderTrading([t({conflict:true}),t({})]);assert.equal(few.index,null);assert.equal(few.why,'Not enough data');assert.ok(few.parts,'the raw parts are still listed');
  // 10 trades a year apart: one large conflict trade, two flagged near a vote, one in a donor, and two funds.
  const rows=[t({conflict:true,amount:'$100,001 - $250,000',traded:'2025-01-01'}),t({flag:'Near a related vote'}),t({nearVote:true}),t({}),t({}),t({}),t({}),t({traded:'2026-01-01'}),t({asset:'fund',conflict:false}),t({asset:'fund'})];
  const r=insiderTrading(rows,{inDonors:1});
  const single=[175000.5,...Array(7).fill(8000.5)];
  assert.equal(Math.round(r.parts.conflicts),Math.round(175000.5/single.reduce((a,b)=>a+b)*100));
  assert.equal(r.parts.nearVotes,20);assert.equal(r.parts.donors,10);assert.equal(r.parts.activity,8/1/INSIDER.activityCeiling*100);
  const W=INSIDER.weights;assert.equal(r.index,Math.round(W.conflicts*r.parts.conflicts+W.nearVotes*20+W.donors*10+W.activity*r.parts.activity));
});
test('Stock Disclosure Dodger Index: late or missing trade reports, then late annual disclosures; needs 3 filings',()=>{
  const r=k=>({late:k});
  assert.equal(disclosureDodger([],[],{covered:false}).why,'No trading data');
  assert.equal(disclosureDodger([]).why,'No trades');
  assert.equal(disclosureDodger([r(true),r(false)]).why,'Not enough data');
  assert.equal(disclosureDodger([r(true),r(false),r(false),r(false)]).index,25,'trade part alone when no annual disclosures are on file');
  const annual=[{year:2024,due:'2024-05-15',filed:'2024-08-13'},{year:2025,due:'2025-05-15',filed:'2025-05-15'}];
  assert.equal(disclosureDodger([r(true),r(false),r(false),r(false)],annual).index,Math.round(DODGER.weights.trades*25+DODGER.weights.annual*50));
});
test('every case in the research is tagged with its kind, and every decided case with the year of its latest status change',()=>{
  for(const p of people)for(const e of p.ethics||[]){
    if(e.outcome==='None found')continue;
    assert.ok(e.kind in CASE_KIND,`${p.id}: ${e.title}`);
    const decided=e.status==='finding'||(e.status==='investigation'&&e.stage==='closed');
    if(decided)assert.ok(Number.isInteger(e.decided)&&e.decided>=1950&&e.decided<=2026,`${p.id}: ${e.title}`);
  }
});
test('Ethics grade: 100 − Legal Trouble − a tenth of each trading index; an index without enough data costs nothing',()=>{
  const e=(status,stage,outcome='x')=>({status,stage,outcome});
  assert.equal(INDEX_COST,0.1);
  assert.equal(ethicsScore([]).pct,100);
  assert.equal(ethicsScore([e('allegation'),e('allegation'),e('x','x','None found')]).pct,100);
  assert.equal(ethicsScore([e('finding')]).pct,100-ETHICS_COST.finding);
  assert.equal(ethicsScore(Array(9).fill(e('finding'))).pct,0,'never below 0');
  // The worked example: Legal Trouble 35, Insider Trading 23 and Stock Disclosure Dodger 40 give 58.7, shown as 59.
  const legal=[{status:'investigation',stage:'open',kind:'criminal',outcome:'x'},{status:'finding',kind:'ethics',decided:2014,outcome:'x'},{status:'investigation',stage:'closed',kind:'technical',decided:2025,outcome:'x'}];
  const rows=[...Array(2).fill({late:true}),...Array(3).fill({late:false})].map((x,i)=>Object.assign({traded:'2025-0'+(i+1)+'-01',asset:'fund'},x));
  const s=ethicsScore(legal,{rows},{asOfYear:2026});
  assert.equal(s.legal.index,35);assert.equal(s.dodger.index,40);assert.equal(s.insider.index,0);assert.equal(s.pct,Math.round(100-35-0-4));
  assert.equal(ethicsScore(legal,{rows,covered:false},{asOfYear:2026}).pct,65,'not covered: no trading deductions');
});
test('promises: a president\'s PolitiFact tracker tallies count kept 1, compromise 1/2, broken 0; stalled and in the works wait',()=>{
  const p=promiseScore([],[{counts:{kept:3,compromise:2,broken:1,stalled:4,inTheWorks:5}}]);
  assert.equal(p.clear,6);assert.equal(p.pct,Math.round((3+1)/6*100));assert.equal(p.notCounted,9);assert.equal(p.total,15);
  assert.equal(promiseScore(st('consistent'),[{counts:{kept:1,broken:1}}]).clear,3,'tracker tallies add to any checked statements');
  for(const s of people)for(const t of s.promiseTrackers||[]){
    assert.ok(/^https:\/\//.test(t.url)&&/^https:\/\//.test(t.src.u),`${s.id}: ${t.name} needs source links`);
    for(const k of Object.keys(t.counts))assert.ok(['kept','compromise','broken','stalled','inTheWorks'].includes(k)&&Number.isInteger(t.counts[k]),`${s.id}: ${t.name} ${k}`);
    for(const x of t.examples||[])assert.ok(t.counts[x.rating]>0&&/^https:\/\//.test(x.url),`${s.id}: ${t.name} example ${x.title}`);
  }
});
test('Workers > Profit: a president\'s signature or order takes the bill\'s side and a veto the other',()=>{
  const marks=new Map([['119-hr-1',mark('profit')],['118-s-2',mark('people')],['eo-14251',mark('profit')]]);
  const v=pvpScore(pvpActions(marks,[],[{bill:'119-hr-1',kind:'signed'},{bill:'118-s-2',kind:'vetoed'},{bill:'eo-14251',kind:'order'},{bill:'1-hr-9',kind:'signed'}]));
  assert.deepEqual(v.scored.map(a=>a.took),['profit','profit','profit']);assert.equal(v.pct,0);
});

test('Workers > Profit: versions of a bill count once, the latest vote wins, and a statement counts half and gives way to a vote',()=>{
  const m={...mark('people',1),id:'117-hr-842'},marks=new Map([['117-hr-842',m],['118-hr-20',m],['119-hr-20',m]]);
  // A cosponsorship of one version and a vote on another: one credit, the vote.
  let r=pvpScore(pvpActions(marks,[{bill:'117-hr-842',pos:'Nay'}],[{bill:'119-hr-20',kind:'cosponsored'}]));
  assert.deepEqual([r.n,r.scored[0].kind,r.scored[0].took],[1,'vote','profit']);
  // Two cosponsorships of different versions still count once.
  r=pvpScore(pvpActions(marks,[],[{bill:'118-hr-20',kind:'cosponsored'},{bill:'119-hr-20',kind:'cosponsored'}]));
  assert.equal(r.n,1);
  // A statement alone counts half the bill's strength; opposing takes the other side.
  r=pvpScore(pvpActions(marks,[],[],[{bill:'117-hr-842',pos:'oppose'}]));
  assert.deepEqual([r.scored[0].took,r.scored[0].points,r.profit],['profit',0.5,0.5]);
  r=pvpScore(pvpActions(marks,[{bill:'117-hr-842',pos:'Yea'}],[],[{bill:'117-hr-842',pos:'oppose'}]));
  assert.deepEqual([r.n,r.scored[0].kind,r.people],[1,'vote',1],'the vote replaces the statement');
  r=pvpScore(pvpActions(marks,[],[{bill:'118-hr-20',kind:'cosponsored'}],[{bill:'117-hr-842',pos:'oppose'}]));
  assert.equal(r.scored[0].kind,'cosponsored','a cosponsorship wins over a statement');
});
