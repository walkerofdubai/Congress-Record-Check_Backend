// Bundled ("earmarked") donations: individual donors' gifts that a group collected and forwarded to a campaign through
// its PAC, for each funder group that does this (research.json groupPos[].conduits: AIPAC, Club for Growth, EMILY's
// List, J Street and the Senate Conservatives Fund). They are the donors' own money, which the FEC counts as individual
// contributions, so they aren't in the PAC contributions on file; the group decided where they went.
//
// From the FEC (FEC_API_KEY in .dev.vars): each conduit's disbursements to each profiled person's campaign committee
// (Schedule B, by recipient committee) in the cycles their PAC reports cover. A row that says "earmark" is a forwarded
// gift; the rest are the PAC's own checks, already in the PAC rows. Conduits report forwarded gifts either as one line
// for the total with each gift listed below it as a memo entry, or as memo entries only: the total line is used when
// there is one, so nothing counts twice. ActBlue and WinRed, which forward gifts for any campaign that uses them, are not
// conduits here.
//
// Writes research.json "bundled": {asOf, conduits: {group: [committee ID]}, people: {person: {group: {routed, n, direct,
// byMonth, cycles, src}}}}; scripts/build-funders.mjs adds "routed" to each person's funders from it. Rerun build-funders
// after.
//   npm run funders:bundled             look up and rewrite public/research.json
//   npm run funders:bundled -- --check  list what it found, without writing
import fs from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {requestSource,fecNext} from '../src/sources.mjs';
import {cyclesOf} from './build-pac-types.mjs';

const EARMARK=/earmark/i;
const isMemo=r=>r.memo_code==='X'||r.memoed_subtotal===true||r.memoed_subtotal==='true';
const cents=n=>Math.round(n*100)/100;
// One conduit's disbursements to one campaign: the forwarded (earmarked) total, how many gifts, the PAC's own checks, and
// the forwarded total by month (YYYY-MM, from the disbursement date), which the money-pledge checks date against a pledge.
export function conduitTotals(rows){
  let lines=0,memos=0,nLines=0,nMemos=0,direct=0;const lineMonths={},memoMonths={};
  const add=(by,r,amt)=>{const m=String(r.disbursement_date||'').slice(0,7);if(/^\d{4}-\d{2}$/.test(m))by[m]=cents((by[m]||0)+amt);};
  for(const r of rows||[]){
    const amt=Number(r.disbursement_amount)||0,earmark=EARMARK.test(`${r.disbursement_description||''} ${r.memo_text||''}`);
    if(earmark){if(isMemo(r)){memos+=amt;nMemos++;add(memoMonths,r,amt);}else{lines+=amt;nLines++;add(lineMonths,r,amt);}}
    else if(!isMemo(r))direct+=amt;
  }
  const byMonth=nLines?lineMonths:memoMonths;
  return {routed:cents(nLines?lines:memos),n:nMemos||nLines,direct:cents(direct),byMonth:Object.fromEntries(Object.entries(byMonth).sort())};
}
export const conduitURL=(conduit,cmte,cycle)=>`https://api.open.fec.gov/v1/schedules/schedule_b/?committee_id=${conduit}&recipient_committee_id=${cmte}&two_year_transaction_period=${cycle}&per_page=100&sort=-disbursement_date`;
export const conduitLink=(conduit,cmte,cycle)=>`https://www.fec.gov/data/disbursements/?data_type=processed&committee_id=${conduit}&recipient_committee_id=${cmte}&two_year_transaction_period=${cycle}`;
const people=data=>[...(data.members||[]),...(data.cands||[]),...(data.featured||[])];

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const env=process.env;
  if(!env.FEC_API_KEY){console.error('Set FEC_API_KEY in .dev.vars first (see README, "Connect official data sources").');process.exit(1);}
  const file=new URL('../public/research.json',import.meta.url),data=JSON.parse(await fs.readFile(file,'utf8'));
  const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  // Each request is tried up to three times (the FEC turns away bursts and sometimes times out), with a pause between.
  const get=async u=>{for(let k=0;;k++){await sleep(250);try{return await requestSource(u,env);}catch(e){if(k>=2)throw e;await sleep(2000*3**k);}}};
  const before=data.bundled?.people||{},kept=[];
  const groups=(data.groupPos||[]).filter(g=>g.conduits?.length),out={};
  for(const p of people(data)){
    if(!p.fecCmte)continue;
    const cycles=cyclesOf(p).length?cyclesOf(p):[2026];
    for(const g of groups){
      const rows=[];let failed=null;
      for(const conduit of g.conduits){for(const cycle of cycles){
        try{let url=conduitURL(conduit,p.fecCmte,cycle);for(let page=0;url&&page<80;page++){const d=await get(url);rows.push(...(d.results||[]).filter(r=>r.recipient_committee_id==null||r.recipient_committee_id===p.fecCmte));url=fecNext(url,d);}}
        catch(e){failed=e.message;break;}
      }if(failed)break;}
      // A read that failed partway would save a partial total (or none), so the earlier saved total is kept instead.
      if(failed){const prev=before[p.id]?.[g.key];kept.push(`${p.id} · ${g.org}: ${failed}${prev?` (kept the earlier $${Math.round(prev.routed).toLocaleString()})`:' (none saved before)'}`);if(prev)(out[p.id]||={})[g.key]=prev;continue;}
      const t=conduitTotals(rows);
      if(t.routed>0)(out[p.id]||={})[g.key]={...t,cycles,src:conduitLink(g.conduits[0],p.fecCmte,cycles.at(-1))};
    }
    const mine=out[p.id];if(mine)console.log(`${p.id}: ${Object.entries(mine).map(([k,v])=>`${k} $${Math.round(v.routed).toLocaleString()} bundled (${v.n} gifts)`).join(', ')}`);
  }
  // A check against the one total researched by hand (Booker through AIPAC's PAC, from Sludge's reading of the filings).
  const hand=people(data).find(p=>p.id==='booker')?.conduit?.rows?.find(r=>r.id==='C00797670');
  if(hand)console.log(`\nCheck: Booker through AIPAC PAC, researched by hand $${hand.amount.toLocaleString()} for ${hand.period}; found $${Math.round(out.booker?.aipac?.routed||0).toLocaleString()} for the whole cycle.`);
  if(kept.length)console.log(`\n${kept.length} read${kept.length===1?'':'s'} failed after three tries, so the earlier totals were kept:\n  ${kept.join('\n  ')}\nRun it again later to fill them in.`);
  if(!process.argv.includes('--check')){
    data.bundled={asOf:new Date().toISOString().slice(0,10),conduits:Object.fromEntries(groups.map(g=>[g.key,g.conduits])),people:out};
    await fs.writeFile(file,JSON.stringify(data,null,2));
    console.log('\nWrote "bundled" to public/research.json. Now run node scripts/build-funders.mjs, review the changes, and commit.');
  }
}
