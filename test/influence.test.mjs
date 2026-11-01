import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {categoryAlign,spenderSector,outsideBySector,topDonors,voteDonorAlignment,donorLoyalty,DONOR_LOYALTY,timingFlags,positionChangeFlags,stockFlags,tradesInDonors,addMonths,TOP_DONORS} from '../public/influence.js';
const research=JSON.parse(await fs.readFile(new URL('../public/research.json',import.meta.url),'utf8'));

test('donor alignment: unions and small donors are People, industry is Profit, the rest Other',()=>{
  assert.equal(categoryAlign('labor'),'people');assert.equal(categoryAlign('pharma'),'profit');assert.equal(categoryAlign('biz'),'profit');
  for(const c of ['lead','ideo','party','tribal','other',undefined])assert.equal(categoryAlign(c),'other');
  for(const c of Object.keys(research.categories))assert.ok(['people','profit','other'].includes(categoryAlign(c)),c);
});
test('outside spenders get a sector from their name, and credit unions are not labor unions',()=>{
  assert.equal(spenderSector('SEIU COPE (Service Employees International Union Committee On Political Education)','super_pac'),'labor');
  assert.equal(spenderSector('Americas Credit Unions','other'),'finance');
  assert.equal(spenderSector('Associated Builders and Contractors, Inc. Political Action Committee (ABC PAC)','other'),'realestate');
  assert.equal(spenderSector('Senate Leadership Fund','super_pac'),'ideo');
  assert.equal(spenderSector('Maine Democratic Party','party'),'party');
  const cm=[['C1','AFSCME Working Families Fund','super_pac'],['C2','Dscc','party'],['C3','American Chemistry Council Inc','other']];
  const by=outsideBySector([[0,100,0],[1,50,25],[2,0,300]],i=>cm[i]);
  assert.deepEqual(by.for.map(x=>[x.cat,x.align]),[['labor','people'],['party','other']]);
  assert.deepEqual(by.against.map(x=>x.cat),['manuf','party']);
});
test('top donors sum each PAC across filings and add small-dollar donors as one People tile',()=>{
  const t=topDonors([[0,1000,'labor',0],[0,500,'labor',1],[1,2000,'pharma',0],[2,10,'lead',0]],['Union PAC','Drug PAC','Leader PAC'],5000,3);
  assert.deepEqual(t.tiles.map(x=>[x.label,x.value,x.align]),[['Small-dollar donors ($200 or less)',5000,'people'],['Drug PAC',2000,'profit'],['Union PAC',1500,'people']]);
  assert.equal(t.rest,1);assert.equal(t.restAmount,10);assert.equal(TOP_DONORS,20);
});
test('Vote Donor Alignment counts only donors that gave, and only votes cast',()=>{
  const v=voteDonorAlignment([{org:'A',pac:100,compared:[{match:true},{match:false},{match:null}]},{org:'B',pac:0,compared:[{match:true}]},{org:'C',pac:50,compared:[{match:true}]}]);
  assert.equal(v.n,3);assert.equal(v.same,2);assert.equal(v.pct,67);assert.deepEqual(v.rows.map(r=>r.org),['A','C']);
  assert.equal(voteDonorAlignment([]).pct,null);
});
test('timing flags: a 50% rise after a vote the donor wanted, a 50% drop after one it opposed, never past the data',()=>{
  assert.equal(addMonths('2025-11',3),'2026-02');assert.equal(addMonths('2025-02',-3),'2024-11');
  const series={'2025-01':1000,'2025-07':2000,'2025-08':500};
  const f=timingFlags('Org',series,[{date:'2025-07-15',match:true,label:'Vote'}],'2026-06');
  assert.equal(f.length,1);assert.equal(f[0].kind,'rose');assert.equal(f[0].before,1000);assert.equal(f[0].after,2500);assert.equal(f[0].from,'2025-01');assert.equal(f[0].to,'2025-12');
  assert.equal(timingFlags('Org',{'2025-03':1000,'2025-08':400},[{date:'2025-07-01',match:false}],'2026-06')[0].kind,'dropped');
  assert.equal(timingFlags('Org',{'2025-03':1000,'2025-08':600},[{date:'2025-07-01',match:false}],'2026-06').length,0,'a 40% drop is not flagged');
  assert.equal(timingFlags('Org',series,[{date:'2025-07-15',match:true}],'2025-10').length,0,'the window runs past the data');
  assert.equal(timingFlags('Org',series,[{date:'2025-07-15',match:null}],'2026-06').length,0,'a missed vote is not a decision');
});
test('position-change and stock flags',()=>{
  const p=positionChangeFlags('Org',{'2024-03':100,'2024-09':900},new Set(['health']),[{date:'2025-02-01',issue:'health'},{date:'2025-02-01',issue:'guns'}],'2026-01');
  assert.equal(p.length,1);assert.equal(p[0].kind,'changed');
  const s=stockFlags([{company:'Pfizer Inc.',traded:'2026-01-05',type:'purchase'},{company:'Apple Inc',traded:'2026-01-06'}],[{org:'Pfizer',positions:2},{org:'Apple',positions:0}]);
  assert.deepEqual(s.map(x=>x.org),['Pfizer']);
  const trades=[{asset:'Lockheed Martin Corporation - Common Stock',traded:'2026-02-01'},{company:'Microsoft Corp',traded:'2026-02-02'}];
  assert.deepEqual(tradesInDonors(trades,[{org:'Lockheed Martin'},{org:'Boeing'}]).map(x=>x.org),['Lockheed Martin'],'a trade in any donor is listed');
  assert.deepEqual(stockFlags(trades,[{org:'Lockheed Martin',stake:false},{org:'Microsoft',stake:true}]).map(x=>x.org),['Microsoft'],'a donor that lobbied on their bills makes it a flag');
});

test('Donor Loyalty: their rate of voting a funder\'s way minus their party\'s, weighted by money, above the party only',()=>{
  // Party totals per vote (made up). On v1 and v2 their party mostly voted Yea, on v3 mostly Nay.
  const tallies={v1:{R:{Yea:40,Nay:10},D:{Nay:47}},v2:{R:{Yea:45,Nay:5}},v3:{R:{Yea:10,Nay:40}},v4:{R:{Yea:25,Nay:25}},v5:{R:{Yea:30,Nay:20}}};
  const c=(voteId,wanted,cast)=>({voteId,wanted,cast,match:wanted===cast});
  const big={org:'Big Group',key:'big',pac:90000,for:10000,compared:[c('v1','Yea','Yea'),c('v2','Yea','Yea'),c('v3','Yea','Yea'),c('v4','Yea','Yea')]};
  const small={org:'Small Group',key:'small',pac:25000,compared:[c('v5','Nay','Yea')]};
  const spentAgainst={org:'Opponent',key:'opp',pac:0,for:0,against:5e5,compared:[c('v1','Nay','Yea')]};
  const r=donorLoyalty([big,small,spentAgainst],'R',tallies);
  // Big: 4 of 4 its way. Party (without them): v1 39/49, v2 44/49, v3 9/49, v4 24/49, about 59%. So about +41 points.
  const b=r.rows.find(x=>x.key==='big');assert.deepEqual([b.n,b.same,b.rate,b.partyRate],[4,4,100,59]);
  assert.ok(Math.abs(b.diff-40.8)<0.2,String(b.diff));
  // Small: 0 of 1 its way, party 20/49 Nay (their own Yea left out), about −41 points.
  const sm=r.rows.find(x=>x.key==='small');assert.equal(sm.rate,0);assert.equal(sm.partyRate,41);
  assert.equal(r.rows.length,2,'a group that only spent against them carries no weight');
  // Weighted by money, but Big's $100,000 can't count more than all the others put together ($25,000): the two count
  // equally, so +40.8 and −40.8 cancel out.
  assert.equal(b.weight,25000);assert.equal(sm.weight,25000);assert.deepEqual([b.share,sm.share],[50,50]);
  assert.equal(r.n,5);assert.ok(Math.abs(r.diff)<0.3,String(r.diff));assert.equal(r.index,0);
  // With no funder over half, the weights are the money: (40.8×100,000 + −40.8×25,000 + 0×80,000) ÷ 205,000 ≈ +14.9.
  const third={org:'Third',key:'third',pac:80000,compared:[c('v4','Yea','Yea')]};
  const r3=donorLoyalty([big,small,third],'R',tallies),t3=r3.rows.find(x=>x.key==='third');
  assert.equal(r3.rows.find(x=>x.key==='big').weight,100000,'not capped: $100,000 is less than the others\' $105,000');
  const want=(b.diff*100000+sm.diff*25000+t3.diff*80000)/205000;assert.ok(Math.abs(r3.diff-want)<0.1,`${r3.diff} vs ${want}`);
});

test('Donor Loyalty: below the party scores 0, too few votes is not enough data, and the reasons for no number',()=>{
  const tallies={v1:{R:{Yea:10,Nay:40}},v2:{R:{Yea:10,Nay:40}},v3:{R:{Yea:10,Nay:40}},v4:{R:{Yea:10,Nay:40}},v5:{R:{Yea:10,Nay:40}},v6:{D:{Yea:45,Nay:2}}};
  const f=(ids,match)=>({org:'G',key:'g',pac:1000,compared:ids.map(voteId=>({voteId,wanted:'Yea',cast:match?'Yea':'Nay',match}))});
  const below=donorLoyalty([f(['v1','v2','v3','v4','v5'],false)],'R',tallies);
  assert.ok(below.diff<0);assert.equal(below.index,0,'only the part above the party average counts');
  assert.equal(donorLoyalty([f(['v1','v2'],true)],'R',tallies).why,'Not enough data');
  assert.equal(donorLoyalty([f(['v1'],true)],'R',null).why,'Party totals not loaded');
  assert.equal(donorLoyalty([f(['v9'],true)],'R',tallies).why,'No party totals for these votes');
  assert.equal(donorLoyalty([],'R',tallies).why,'No funder took a position on their votes');
  // An independent is compared with the Democrats, and their own vote isn't in the Democrats' totals.
  const ind=donorLoyalty([{org:'G',key:'g',pac:1,compared:[{voteId:'v6',wanted:'Yea',cast:'Yea',match:true}]}],'I',tallies);
  assert.equal(ind.rows[0].partyRate,96,'45 of 47 Democrats, nobody left out');
});
