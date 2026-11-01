// Bundled ("earmarked") gifts: donors' own gifts a group forwards to a campaign through its PAC (scripts/build-bundled.mjs),
// added to each person's funders as "routed" (scripts/build-funders.mjs) and counted in the money-weighted indexes.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {conduitTotals,conduitURL,conduitLink} from '../scripts/build-bundled.mjs';
import {personFunders,funderChanges} from '../scripts/build-funders.mjs';
import {donorLoyalty,voteDonorAlignment} from '../public/influence.js';
import {groupInfo} from '../public/bills.js';
const D=JSON.parse(await fs.readFile(new URL('../public/research.json',import.meta.url),'utf8'));

test('forwarded gifts are counted once, whether reported as one total line or as memo entries only',()=>{
  // A total line with each gift listed below it as a memo entry: the line counts, the memos don't add to it.
  const a=conduitTotals([{disbursement_amount:3000,disbursement_description:'EARMARKED CONTRIBUTIONS FORWARDED',disbursement_date:'2026-04-02T00:00:00'},
    {disbursement_amount:1000,disbursement_description:'EARMARKED CONTRIBUTION',memo_code:'X',disbursement_date:'2026-03-30'},{disbursement_amount:2000,memo_text:'Earmarked for candidate',memo_code:'X',disbursement_date:'2026-04-01'},
    {disbursement_amount:5000,disbursement_description:'CONTRIBUTION',disbursement_date:'2026-01-15'}]);
  assert.deepEqual(a,{routed:3000,n:2,direct:5000,byMonth:{'2026-04':3000}},'the PAC\'s own $5,000 check is kept apart, and the months follow the line counted');
  // Memo entries only.
  const b=conduitTotals([{disbursement_amount:250,disbursement_description:'Earmarked',memoed_subtotal:true,disbursement_date:'2025-02-03'},{disbursement_amount:750,disbursement_description:'earmarked',memo_code:'X',disbursement_date:'2025-03-01'},
    {disbursement_amount:-250,disbursement_description:'Earmarked refund',memo_code:'X',disbursement_date:'2025-03-20'}]);
  assert.deepEqual(b,{routed:750,n:3,direct:0,byMonth:{'2025-02':250,'2025-03':500}},'a refund comes off, in its own month');
  assert.deepEqual(conduitTotals([]),{routed:0,n:0,direct:0,byMonth:{}});
  // A memo entry that isn't an earmark is neither bundled nor a check.
  assert.deepEqual(conduitTotals([{disbursement_amount:99,memo_code:'X',disbursement_description:'IN-KIND'}]),{routed:0,n:0,direct:0,byMonth:{}});
  const u=new URL(conduitURL('C00797670','C00540500',2026));
  assert.equal(u.pathname,'/v1/schedules/schedule_b/');assert.equal(u.searchParams.get('recipient_committee_id'),'C00540500');assert.equal(u.searchParams.get('two_year_transaction_period'),'2026');
  assert.match(conduitLink('C00797670','C00540500',2026),/^https:\/\/www\.fec\.gov\/data\/disbursements\/\?/);
});

test('the groups that bundle are marked, with their PACs\' committee IDs',()=>{
  const c=Object.fromEntries(D.groupPos.filter(g=>g.conduits).map(g=>[g.key,g.conduits]));
  assert.deepEqual(Object.keys(c).sort(),['aipac','cfg','emily','jstreet','scf']);
  for(const ids of Object.values(c))for(const id of ids)assert.match(id,/^C\d{8}$/);
  assert.ok(!JSON.stringify(c).includes('C00401224')&&!JSON.stringify(c).includes('C00694323'),'ActBlue and WinRed are not conduits here');
});

test('bundled gifts add a funder entry of their own, kept apart from PAC checks, and count in the money-weighted indexes',()=>{
  const p=[...D.members,...D.cands].find(x=>x.id==='booker');
  const data={...D,bundled:{asOf:'2026-11-01',conduits:{aipac:['C00797670']},people:{booker:{aipac:{routed:900000,n:850,direct:5000,cycles:[2026],src:'https://www.fec.gov/data/disbursements/'}}}}};
  const F=personFunders(data,p),a=F.find(f=>f.key==='aipac');
  assert.ok(a,'an AIPAC entry from bundled gifts');assert.equal(a.routed,900000);assert.equal(a.routedN,850);
  assert.equal(F[0].key,'aipac','largest money first, bundled gifts included');
  assert.equal(a.routedBy,undefined,'read from the FEC');
  // No FEC reading for the group: the total researched by hand from the filings stands, less the PAC's own check in it.
  const h=personFunders({...D,bundled:{people:{}}},p).find(f=>f.key==='aipac');
  assert.equal(h.routed,707803-5000);assert.equal(h.routedBy,'hand');assert.match(h.routedPeriod,/2025/);
  assert.equal(personFunders({...D,bundled:{people:{}}},{...p,conduit:{status:'not_measured',rows:[]}}).find(f=>f.key==='aipac')?.routed,undefined,'nothing read, nothing researched: no routed amount');
  assert.ok(funderChanges({...data,members:[],cands:[{...p}],featured:[]}).some(l=>/AIPAC.*routed \$\d+ → \$900000|\+ AIPAC.*bundled \$900000/.test(l)));
  // The indexes weight each funder by money: bundled gifts count; a funder with only bundled gifts is a donor.
  const f=[{org:'Group',key:'g',pac:0,routed:1000,for:0,against:0,compared:[{voteId:'v1',wanted:'Yea',cast:'Yea',match:true}]}];
  assert.equal(voteDonorAlignment(f).n,1);
  const dl=donorLoyalty(f,'D',{v1:{D:{Yea:10,Nay:10}}});assert.equal(dl.rows[0].money,1000);
});

test('the Bills page adds up bundled gifts apart from PAC checks and outside spending',()=>{
  const p=[...D.members,...D.cands].find(x=>x.id==='booker');
  const data={...D,members:D.members.map(m=>m.id==='booker'?{...m,funderPos:[{key:'aipac',org:'AIPAC',pac:5000,routed:900000,for:0,against:0,compared:[]}]}:m),
    cands:D.cands.map(m=>m.id==='booker'?{...m,funderPos:[{key:'aipac',org:'AIPAC',pac:5000,routed:900000,for:0,against:0,compared:[]}]}:m)};
  assert.ok(p);const g=groupInfo(data,'aipac');assert.ok(g.routed>=900000);assert.ok(g.people>=1);
  assert.ok(groupInfo(D,'aipac').routed>0,'the bundled gifts on file');
});
