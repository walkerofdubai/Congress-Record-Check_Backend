// Each PAC's FEC committee ID and type, for the PAC contributions on file (public/research.json "pacNames"), from the
// FEC (FEC_API_KEY in .dev.vars):
//   1. For each person's campaign committee, the FEC's processed PAC contributions (Schedule A, line 11C) in the cycles
//      their reports cover give each contributor's name as filed and its FEC committee ID. The saved names are matched
//      to those (FEC filings cut names off at about 40 characters, so a saved name also matches a longer name it
//      starts; a name that could be two committees is left unmatched).
//   2. Names still unmatched are looked up in the FEC's committee names, and kept only on one exact match.
//   3. Each committee's registration (committee type, designation, sponsoring organization's type) is read in batches
//      of 100 from the FEC's committee list.
// Writes pacIds (parallel to pacNames: the committee ID, or null), pacCommittees ({id: [name, type, designation,
// organization type]}) and pacTypesAsOf; public/pac-types.js turns those into the kinds shown on the site. A name the
// run can't match keeps the ID an earlier run found. Shown only; no grade uses it.
//   npm run pacs:types            look up and rewrite public/research.json
//   npm run pacs:types -- --check list what it found, without writing
//   npm run pacs:types -- --names=0   skip step 2 (it makes one request per unmatched name; 300 by default)
import fs from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {requestSource,fecNext} from '../src/sources.mjs';
import {normName} from './build-funders.mjs';
import {pacKindTotals} from '../public/pac-types.js';

const FEC='https://api.open.fec.gov/v1/';
const isId=v=>/^C\d{8}$/.test(String(v||''));
// The election cycles a person's PAC reports cover (an odd year belongs to the cycle ending the next year).
export const cyclesOf=p=>[...new Set((p.pac?.filings||[]).flatMap(f=>[f.start,f.end]).map(d=>Number(String(d||'').slice(0,4))).filter(y=>y>1990).map(y=>y%2?y+1:y))].sort();

// Saved names [[index, name]] matched to the FEC's records [{name, id}] for the same committee: index -> committee ID.
export function matchIds(names,records){
  const byName=new Map();
  for(const r of records){const n=normName(r.name);if(!n||!isId(r.id))continue;(byName.get(n)||byName.set(n,new Set()).get(n)).add(r.id);}
  const out=new Map();
  for(const [i,name] of names){
    const n=normName(name);if(!n)continue;
    let ids=byName.get(n);
    if(!ids&&n.length>=12){ids=new Set();for(const [k,v] of byName)if(k.startsWith(n))for(const id of v)ids.add(id);}
    if(ids?.size===1)out.set(i,[...ids][0]);
  }
  return out;
}
// The one committee in the FEC's name search [{id, name}] whose name is the saved name (or starts with a cut-off one).
export function pickByName(name,results){
  const n=normName(name);if(!n)return null;
  const hits=(results||[]).filter(r=>isId(r.id)&&(normName(r.name)===n||(n.length>=30&&normName(r.name).startsWith(n))));
  const ids=[...new Set(hits.map(r=>r.id))];
  return ids.length===1?ids[0]:null;
}
// Committee registrations for the IDs, 100 to a request: {id: [name, committee type, designation, organization type]}.
export async function lookupCommittees(ids,get){
  const list=[...new Set(ids.filter(isId))].sort(),out={};
  for(let k=0;k<list.length;k+=100){
    const u=new URL(FEC+'committees/');for(const id of list.slice(k,k+100))u.searchParams.append('committee_id',id);u.searchParams.set('per_page','100');
    const d=await get(u.href);
    for(const c of d.results||[])if(list.includes(c.committee_id))out[c.committee_id]=[c.name||null,c.committee_type||null,c.designation||null,c.organization_type||null];
  }
  return out;
}
// The most common ID each name was matched to across people (votes: index -> [id, ...]).
export function settle(votes,previous=[],n){
  const ids=Array.from({length:n},(_,i)=>previous[i]??null);
  for(const [i,list] of votes){const c=new Map();for(const id of list)c.set(id,(c.get(id)||0)+1);ids[i]=[...c].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0]))[0][0];}
  return ids;
}
const people=data=>[...(data.members||[]),...(data.cands||[]),...(data.featured||[])];

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const env=process.env;
  if(!env.FEC_API_KEY){console.error('Set FEC_API_KEY in .dev.vars first (see README, "Connect official data sources").');process.exit(1);}
  const file=new URL('../public/research.json',import.meta.url),data=JSON.parse(await fs.readFile(file,'utf8'));
  const nameLimit=Number((process.argv.find(a=>a.startsWith('--names='))||'--names=300').split('=')[1]);
  const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  // Each request is tried up to three times (the FEC turns away bursts and sometimes times out), with a pause between.
  const get=async u=>{for(let k=0;;k++){await sleep(250);try{return await requestSource(u,env);}catch(e){if(k>=2)throw e;await sleep(2000*3**k);}}};
  const failed=[];
  const votes=new Map(),vote=(i,id)=>(votes.get(i)||votes.set(i,[]).get(i)).push(id);
  // 1. The FEC's processed PAC contributions to each campaign committee.
  for(const p of people(data)){
    if(!p.fecCmte||!p.pac?.rows?.length)continue;
    const names=[...new Set(p.pac.rows.map(r=>r[0]))].map(i=>[i,data.pacNames[i]]),records=[];
    try{
      for(const cycle of cyclesOf(p)){
        let url=`${FEC}schedules/schedule_a/?committee_id=${p.fecCmte}&two_year_transaction_period=${cycle}&line_number=F3-11C&per_page=100&sort=-contribution_receipt_date`;
        for(let page=0;url&&page<60;page++){const d=await get(url);records.push(...(d.results||[]).map(r=>({name:r.contributor_name,id:r.contributor_id})));url=fecNext(url,d);}
      }
    }catch(e){
      // A read that failed partway is not used: a name could look like one committee only because the rest of the
      // records weren't read. Its names keep the IDs an earlier run found.
      failed.push(`${p.id}: ${e.message}`);console.log(`${p.id}: ${e.message}; its PAC names keep their earlier IDs`);continue;
    }
    const m=matchIds(names,records);for(const [i,id] of m)vote(i,id);
    console.log(`${p.id}: ${m.size} of ${names.length} PAC names matched (${records.length} FEC records)`);
  }
  // 2. The FEC's committee-name search for the names still unmatched, largest amounts first.
  const amount=new Map();for(const p of people(data))for(const [i,a] of p.pac?.rows||[])amount.set(i,(amount.get(i)||0)+(a||0));
  const left=[...amount.keys()].filter(i=>!votes.has(i)).sort((a,b)=>amount.get(b)-amount.get(a));
  let searched=0,found=0;
  for(const i of left.slice(0,nameLimit)){
    try{const d=await get(`${FEC}names/committees/?q=${encodeURIComponent(data.pacNames[i])}`);searched++;const id=pickByName(data.pacNames[i],d.results);if(id){vote(i,id);found++;}}
    catch(e){console.log(`Name search stopped: ${e.message}`);break;}
  }
  if(left.length)console.log(`Name search: ${found} of ${searched} looked up matched${left.length>searched?`; ${left.length-searched} not looked up (raise --names)`:''}.`);
  // 3. Each committee's registration.
  const ids=settle(votes,data.pacIds||[],data.pacNames.length);
  const committees=await lookupCommittees(ids.filter(Boolean),get);
  const kept=ids.map(id=>id&&committees[id]?id:null);
  const total=[...amount.values()].reduce((t,a)=>t+a,0),matched=[...amount].filter(([i])=>kept[i]).reduce((t,[,a])=>t+a,0);
  console.log(`\nMatched ${[...amount.keys()].filter(i=>kept[i]).length} of ${amount.size} PAC names, covering $${Math.round(matched).toLocaleString()} of $${Math.round(total).toLocaleString()} (${Math.round(matched/total*100)}%).`);
  const all=people(data).flatMap(p=>p.pac?.rows||[]),view={pacIds:kept,pacCommittees:committees};
  for(const k of pacKindTotals(view,all))console.log(`  ${k.label}: $${Math.round(k.total).toLocaleString()} (${k.n} contributions)`);
  if(failed.length)console.log(`\n${failed.length} campaign${failed.length===1?'':'s'} couldn't be read after three tries; run it again later to match their PACs:\n  ${failed.join('\n  ')}`);
  const missing=[...amount].filter(([i])=>!kept[i]).sort((a,b)=>b[1]-a[1]).slice(0,15);
  if(missing.length)console.log(`\nLargest unmatched:\n${missing.map(([i,a])=>`  ${data.pacNames[i]}: $${Math.round(a).toLocaleString()}`).join('\n')}`);
  if(!process.argv.includes('--check')){
    data.pacIds=kept;data.pacCommittees=Object.fromEntries(Object.entries(committees).filter(([id])=>kept.includes(id)));data.pacTypesAsOf=new Date().toISOString().slice(0,10);
    await fs.writeFile(file,JSON.stringify(data,null,2));
    console.log('\nWrote pacIds and pacCommittees to public/research.json. Review the changes, then commit it.');
  }
}
