// Each person's three reviewed grades (Promises delivered, Ethics, Workers > Profit) from the reviewed research, the
// committee lists, the committee sectors and the roll calls' party totals. The page and the monthly recalculation (scripts/scores-monthly.mjs) both
// use this, so they always agree. Your match is not here: it depends on each visitor's own choices.
import {billKey,billKeyFromText,promiseScore,tradeChecks,ethicsScore,pvpScore,pvpActions,billScore,ownTrades,corporationCompromised,workersOverProfit} from './grades.js';
import {tradesInDonors,businessLoyalty} from './influence.js';
import {pacTypeOf} from './pac-types.js';

export const voteBill=v=>billKeyFromText((v.bill||{}).measure);
// A president's record entries on bills and orders ({bill: "119-hr-1" or "eo-14251", position: "Signed" or "Vetoed"}).
export function executiveActions(s){
  return (s.record||[]).map((r,i)=>r.bill&&/^(Signed|Vetoed)/.test(r.position||'')?{bill:r.bill,kind:r.position==='Vetoed'?'vetoed':/^eo-/.test(r.bill)?'order':'signed',ref:`${s.id}:rec:${i}`}:null).filter(Boolean);
}
// Business PACs for the Corporation Compromised Index: the FEC's sponsor type when matched, otherwise this app's sector.
const BUSINESS_KINDS=new Set(['corporate','trade','cooperative']),NOT_BUSINESS_SECTOR=new Set(['lead','labor','ideo','tribal','other']);
// tallies: each saved roll call's party totals (public/vote-party.json "votes"), for the business-funder votes part.
export function makeScorer(data,committees={committees:{},people:{}},sectors={},tallies=null){
  const votes=data.votes.concat(data.hvotes);
  // Workers > Profit: every bill on file (research.json "bills") with its score, and the scored ones (marks), which each
  // person's votes and sponsorships count on.
  const bills=(data.bills||[]).map(b=>Object.assign({},b,billScore(b)));
  // Each scored bill under its own key and every version's (the same bill in other Congresses, or its Senate companion).
  const marks=new Map(bills.filter(b=>b.status==='scored').flatMap(b=>[b.id,...(b.versions||[])].map(k=>[k,b])));
  // Cosponsorships recorded on each bill (scripts/fill-bill-cosponsors.mjs) and cited public statements, by person.
  const onBills=(field,f)=>{const m=new Map();for(const b of bills)for(const r of b[field]||[])(m.get(r.person)||m.set(r.person,[]).get(r.person)).push(f(r,b));return m;};
  const billSpons=onBills('cosponsors',(r,b)=>({bill:b.id,via:r.bill,kind:r.sponsor?'sponsored':'cosponsored'}));
  const billStated=onBills('stated',(r,b)=>({bill:b.id,pos:r.pos,ref:r.src?.u}));
  // A subcommittee seat counts under its full committee.
  const committeesOf=s=>committees.people[s.id]||[];
  const fullCommittee=id=>(committees.committees[id]||{}).parent||id;
  const overseen=s=>[...new Set(committeesOf(s).flatMap(c=>(sectors[fullCommittee(c.id)]||{}).sectors||[]))];
  // The disclosures scored cover members of Congress (Periodic Transaction Reports). A president's OGE 278-T trades are
  // listed on the Ethics tab (public/exec-trades.json) but not scored: how to score them is still an open decision.
  // Anyone else has no trading data.
  const coveredBy=s=>!!s.bioguide&&!s.office;
  const uncovered=s=>s.office?'Not scored for a president':undefined;
  // Donors: the PACs that gave to the campaign and the groups whose positions are compared, matched to traded companies.
  const donorsOf=s=>[...(s.pac?.rows||[]).map(r=>({org:(data.pacNames||[])[r[0]]})),...(s.funderPos||[]).map(g=>({org:g.org}))].filter(d=>d.org);
  const trading=s=>{const t=tradeChecks(s.trades,overseen(s));
    const own=ownTrades(t.rows,s.holdings);
    return Object.assign(t,{covered:coveredBy(s),why:uncovered(s),annual:s.annualDisclosures||[],holdings:s.holdings||null,inDonors:new Set(tradesInDonors(own,donorsOf(s)).map(x=>x.trade)).size});};
  // Cases are aged against the date of the reviewed research ("asof"), so the page and the monthly log agree.
  const asOfYear=Number(String(data.asof||'').match(/\b(19|20)\d{2}\b/)?.[0])||null;
  // The PACs on file (itemized, in the reports listed on the Funding tab) give the business share of PAC money; it is
  // applied to the cycle's PAC total (the FEC summary), so PAC money and campaign funds cover the same dates.
  const businessMoney=s=>{
    const rows=s.pac?.rows||[],c=s.camp;if(!c||!(c.receipts>0))return null;
    if(!(c.pac>0))return {businessPac:0,receipts:c.receipts,pacTotal:0,rowsTotal:0,rowsBusiness:0,typed:0};
    let total=0,business=0,typed=0;
    for(const [i,amt,cat] of rows){const t=pacTypeOf(data,i);total+=amt||0;if(t)typed+=amt||0;if(t?BUSINESS_KINDS.has(t.kind):!NOT_BUSINESS_SECTOR.has(cat))business+=amt||0;}
    if(!(total>0))return null;
    return {businessPac:business/total*c.pac,receipts:c.receipts,pacTotal:c.pac,rowsTotal:total,rowsBusiness:business,typed,start:c.start,end:c.end};
  };
  const cci=s=>{
    if(s.office)return {index:null,why:'Not scored for a president',parts:null,used:[]};
    const m=businessMoney(s),votes=s.funderPos?.length?businessLoyalty(s.funderPos,s.party,tallies):null;
    return Object.assign(corporationCompromised({businessPac:m?.businessPac??null,receipts:m?.receipts??null,businessVotes:votes}),{money:m,votes});
  };
  return {
    bills,marks,committeesOf,fullCommittee,overseen,trading,asOfYear,cci,
    promises:s=>promiseScore(s.statements,s.promiseTrackers),
    ethics:s=>ethicsScore(s.ethics,trading(s),{asOfYear}),
    pvp(s){
      // Newest first, so when two versions of a bill were voted on, the latest vote is the one counted.
      const v=votes.filter(v=>v.pos&&s.id in v.pos).sort((x,y)=>String(y.date).localeCompare(String(x.date))).map(v=>({bill:voteBill(v),pos:v.pos[s.id],ref:v.id}));
      const spons=(s.bills||[]).map((b,i)=>({bill:billKey(b.congress,b.num),kind:'sponsored',ref:`${s.id}:bill:${i}`}))
        .concat((s.cosponsored||[]).map(b=>({bill:b.bill||billKey(b.congress,b.num),kind:'cosponsored'})))
        .concat(executiveActions(s)).concat(billSpons.get(s.id)||[]);
      // The grade: 75% these actions on scored bills + 25% (100 − the Corporation Compromised Index), once both exist.
      return workersOverProfit(pvpScore(pvpActions(marks,v,spons,billStated.get(s.id)||[])),cci(s));
    },
  };
}
