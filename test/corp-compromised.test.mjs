// The Corporation Compromised Index 🏢 (step 9): business PACs' share of campaign funds and votes with business funders
// beyond the party, 25% of the Workers > Profit grade. Parts without data drop out; the PAC share is required.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {corporationCompromised,workersOverProfit,CORP_COMPROMISED} from '../public/grades.js';
import {businessLoyalty,BUSINESS_FUNDERS} from '../public/influence.js';
import {makeScorer} from '../public/scoring.js';
const read=async f=>JSON.parse(await fs.readFile(new URL(`../public/${f}`,import.meta.url),'utf8'));
const D=await read('research.json'),T=(await read('vote-party.json')).votes;

test('the index weights its parts, drops the ones without data, and needs the PAC share',()=>{
  // 8% of funds from business PACs scores 40; 10 points above the party scores 40; 2 of 4 lobbied bills 50; employees 3% 30.
  const full=corporationCompromised({businessPac:8,receipts:100,employees:3,businessVotes:{index:40},lobbied:{profit:2,n:4}});
  assert.equal(full.index,41,'the design\'s example: 0.35×40 + 0.10×30 + 0.35×40 + 0.20×50');
  assert.deepEqual(full.used,['pacShare','employees','businessVotes','lobbiedBills']);
  // Only the two parts on file today: reweighted to half each.
  const two=corporationCompromised({businessPac:8,receipts:100,businessVotes:{index:60}});
  assert.equal(two.index,50);assert.deepEqual(two.weights,{pacShare:0.5,businessVotes:0.5});
  assert.equal(corporationCompromised({businessPac:30,receipts:100}).index,100,'20% of funds scores 100');
  assert.equal(corporationCompromised({businessPac:0,receipts:100}).index,0,'no business PAC money scores 0');
  assert.equal(corporationCompromised({businessPac:5,receipts:100,lobbied:{profit:2,n:2}}).parts.lobbiedBills,null,'lobbied bills need 3');
  assert.equal(corporationCompromised({businessVotes:{index:80}}).index,null,'no campaign money: no index');
});

test('it is a quarter of the Workers > Profit grade, and costs nothing without data',()=>{
  const v={pct:80,people:4,profit:1,n:5,nPeople:4,nProfit:1,scored:[]};
  const g=workersOverProfit(v,{index:40});
  assert.equal(g.pct,Math.round(0.75*80+0.25*60));assert.equal(g.billsPct,80);assert.equal(g.blended,true);
  assert.equal(workersOverProfit(v,{index:null}).pct,80,'no index: the bills alone');
  assert.equal(workersOverProfit({...v,pct:null},{index:40}).pct,null,'not enough scored actions: still not graded');
  assert.equal(CORP_COMPROMISED.inGrade,0.25);
});

test('the business-funder votes use Donor Loyalty\'s method on business groups, weighted by money they gave',()=>{
  const c=(id,match)=>({voteId:id,wanted:'Yea',cast:match?'Yea':'Nay',match});
  const tallies=Object.fromEntries(['v1','v2','v3','v4','v5','v6'].map(v=>[v,{R:{Yea:30,Nay:20}}]));
  const funders=[{key:'chamber',org:'U.S. Chamber of Commerce',pac:10000,compared:['v1','v2','v3','v4','v5'].map(v=>c(v,true))},
    {key:'aflcio',org:'AFL-CIO',pac:50000,compared:['v6'].map(v=>c(v,true))},{key:'nfib',org:'NFIB',pac:0,for:900000,compared:['v6'].map(v=>c(v,true))}];
  const r=businessLoyalty(funders,'R',tallies);
  assert.deepEqual(r.rows.map(x=>x.key),['chamber'],'a union isn\'t a business funder, and spending on its own doesn\'t count');
  assert.equal(r.n,5);assert.equal(r.index,100,'voting with it 100% when the party did 60% is 40 points above, past the 25-point ceiling');
  assert.ok(BUSINESS_FUNDERS.includes('afp')&&BUSINESS_FUNDERS.includes('phrma')&&!BUSINESS_FUNDERS.includes('aflcio'));
});

test('on the data on file, the PAC share is applied to the cycle and the grade blends only when both exist',()=>{
  const sc=makeScorer(D,undefined,undefined,T),ppl=[...D.members,...D.cands];
  const ossoff=sc.pvp(ppl.find(p=>p.id==='ossoff'));
  assert.equal(ossoff.cci.index,1,'about $160,000 from business PACs of $77 million raised');assert.equal(ossoff.pct,100);
  const m=sc.cci(ppl.find(p=>p.id==='marshall'));
  assert.equal(m.money.pacTotal,ppl.find(p=>p.id==='marshall').camp.pac);assert.ok(m.share>20&&m.parts.pacShare===100);
  // Each grade is 75% the bills + 25% (100 − the index), rounded.
  for(const p of ppl){const v=sc.pvp(p);if(v.blended)assert.equal(v.pct,Math.round(0.75*v.billsPct+0.25*(100-v.cci.index)),p.id);else assert.equal(v.pct,v.billsPct,p.id);}
  assert.equal(sc.cci(D.featured[0]).index,null,'not for a president');
  assert.equal(sc.pvp(D.featured[0]).pct,sc.pvp(D.featured[0]).billsPct);
  // Without the party totals the vote part drops out instead of guessing.
  assert.equal(makeScorer(D).cci(ppl.find(p=>p.id==='sullivan')).parts.businessVotes,null);
});
