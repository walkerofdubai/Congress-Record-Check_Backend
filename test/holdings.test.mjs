// Blind trusts and divestment (step 8): a qualified blind trust takes the trustee's trades out of the trading indexes; a
// managed account or a trust in name only doesn't; "no individual stocks" labels the index. The annual report's asset list
// gives a lead (public/holdings.js), and only the reviewed status counts.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {assetKind,holdingsLead,holdingsReview,stockTradesSince} from '../public/holdings.js';
import {ethicsScore,tradeChecks,HOLDINGS,INSIDER} from '../public/grades.js';
import {makeScorer} from '../public/scoring.js';
import {holdingsReport} from '../scripts/review-holdings.mjs';
const D=JSON.parse(await fs.readFile(new URL('../public/research.json',import.meta.url),'utf8'));

test('each asset on an annual report is sorted by kind, from the House codes or the Senate types',()=>{
  const k=a=>assetKind(a);
  assert.equal(k({name:'Apple Inc.',code:'ST'}),'stock');assert.equal(k({name:'Call options',code:'OP'}),'stock');
  assert.equal(k({name:'Smith Family Qualified Blind Trust',code:'EQ'}),'blind');
  assert.equal(k({name:'Excepted Investment Fund Trust',code:'EQ'}),'trust','an excepted trust is not a blind trust');
  assert.equal(k({name:'Vanguard 500 Index',code:'MF'}),'fund');assert.equal(k({name:'Merrill Lynch account',code:'MA'}),'managed');
  assert.equal(k({name:'Hinson Insurance stock',code:'PS'}),'private');assert.equal(k({name:'Checking',code:'BA'}),'cash');
  assert.equal(k({name:'Microsoft Corp',type:'Stocks (including ADRs)'}),'stock');assert.equal(k({name:'Family firm',type:'Non-Public Stock'}),'private');
  assert.equal(k({name:'Fidelity Contrafund',type:'Mutual Funds'}),'fund');assert.equal(k({name:'S&P 500 ETF',type:'Stock Fund'}),'fund');
  assert.equal(k({name:'The J. Doe Qualified Blind Trust',type:'Trust'}),'blind');assert.equal(k({name:'Treasury bill',type:'Government Securities'}),'bond');
});

test('the latest report gives a lead: a blind trust, no individual stocks, or stocks',()=>{
  const r=assets=>holdingsLead({year:2025,url:'u',assets});
  assert.equal(r([{name:'Vanguard',code:'MF'},{name:'Checking',code:'BA'}]).status,'no-stocks');
  const s=r([{name:'Apple',code:'ST'},{name:'Nvidia',code:'ST'},{name:'Vanguard',code:'MF'}]);
  assert.equal(s.status,'stocks');assert.equal(s.stocks,2);assert.deepEqual(s.stockNames,['Apple','Nvidia']);assert.match(s.label,/^2 individual stocks/);
  const b=r([{name:'Ossoff Qualified Blind Trust',code:'EQ'},{name:'Apple',code:'ST'}]);
  assert.equal(b.status,'blind-trust');assert.equal(b.stocks,1,'stocks outside the trust are still counted');
  assert.equal(holdingsLead({unreadable:true,assets:[]}),null);assert.equal(holdingsLead(null),null);
  // Compared with the reviewed status.
  assert.equal(holdingsReview({status:'no-stocks'},r([{name:'Vanguard',code:'MF'}])),'agrees');
  assert.equal(holdingsReview({status:'no-stocks'},s),'differs');
  assert.equal(holdingsReview(null,b),'lead');assert.equal(holdingsReview(null,s),null,'holding stocks is the usual case, not a lead');
  assert.equal(holdingsReview({status:'blind-trust'},null),null);
});

const trades=n=>Array.from({length:n},(_,i)=>({traded:`2025-0${1+i%9}-10`,filed:`2025-0${1+i%9}-20`,amount:'$1,001 - $15,000',sector:'Technology',asset:'stock'}));
test('a qualified blind trust takes the trustee\'s trades out of both trading indexes; nothing else is excused',()=>{
  const rows=tradeChecks([...trades(6).map(t=>({...t,inTrust:true})),...trades(5)],['Technology']).rows;
  const none=ethicsScore([],{rows,covered:true});
  const qbt=ethicsScore([],{rows,covered:true,holdings:{status:'blind-trust',since:'2021'}});
  assert.equal(none.insider.n,11);assert.equal(qbt.insider.n,5,'only the trades they made themselves');assert.equal(qbt.inTrust,6);
  // A managed account or a trust that isn't a qualified blind trust: every trade counts.
  assert.equal(ethicsScore([],{rows,covered:true,holdings:{status:'no-stocks'}}).insider.n,11);
  assert.equal(ethicsScore([],{rows,covered:true,holdings:{status:'managed'}}).insider.n,11,'an unknown status is ignored');
  // Every trade in the trust: no deduction, and the index says why.
  const all=ethicsScore([],{rows:tradeChecks(trades(INSIDER.minTrades+2).map(t=>({...t,inTrust:true})),['Technology']).rows,covered:true,holdings:{status:'blind-trust'}});
  assert.equal(all.insider.index,0);assert.equal(all.insider.why,HOLDINGS['blind-trust']);assert.equal(all.insiderCost,0);assert.equal(all.dodger.index,null);
  // No trades and no individual stocks: labeled, not rewarded.
  const ns=ethicsScore([],{rows:[],covered:true,holdings:{status:'no-stocks'}});
  assert.equal(ns.insider.why,'No individual stocks');assert.equal(ns.pct,100);
  assert.equal(ethicsScore([],{rows:[],covered:false,why:'No trading data',holdings:{status:'no-stocks'}}).insider.why,'No trading data','not in Congress: unchanged');
});

test('a no-stocks status with stock trades after it began is sent back for review',()=>{
  const h={status:'no-stocks',since:'2021'};
  assert.equal(stockTradesSince(h,[{traded:'2020-05-01',asset:'stock'},{traded:'2022-01-03',asset:'stock'},{traded:'2023-01-03',asset:'fund'}]).length,1);
  assert.equal(stockTradesSince({status:'blind-trust',since:'2021'},[{traded:'2022-01-03'}]).length,0);
  const data={members:[{id:'a',name:'A',holdings:h,trades:[{traded:'2024-02-02',asset:'stock'}]},{id:'b',name:'B'}],cands:[]};
  const rep=holdingsReport(data,{b:{rows:[{year:2025,url:'u',assets:[{name:'Vanguard',code:'MF'}]}]}});
  assert.deepEqual(rep.map(r=>[r.id,r.result]),[['a','differs'],['b','lead']]);assert.equal(rep[1].report.url,'u');
});

test('the reviewed statuses on file are cited, and show on the Ethics index without changing a grade',()=>{
  const ppl=[...D.members,...D.cands],held=ppl.filter(p=>p.holdings);
  assert.deepEqual(held.map(p=>[p.id,p.holdings.status]).sort(),[['hinson','no-stocks'],['ossoff','blind-trust']]);
  for(const p of held){assert.ok(HOLDINGS[p.holdings.status]);assert.match(p.holdings.src.u,/^https:\/\//);assert.ok(p.holdings.note&&p.holdings.since);}
  const sc=makeScorer(D);
  assert.equal(sc.ethics(ppl.find(p=>p.id==='ossoff')).insider.why,'Holdings in a qualified blind trust');
  assert.equal(sc.ethics(ppl.find(p=>p.id==='hinson')).insider.why,'No individual stocks');
  // No grade moves: without the statuses, the same percentages.
  for(const p of held){const {holdings,...rest}=p;assert.equal(sc.ethics(p).pct,sc.ethics(rest).pct,p.id);}
});
