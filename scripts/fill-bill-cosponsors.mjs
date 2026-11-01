// Who sponsored and cosponsored each Workers > Profit bill on file (public/research.json "bills"), among the people the
// site profiles, from Congress.gov (CONGRESS_API_KEY in .dev.vars). It reads each bill and each of its versions, plus
// any bill Congress.gov lists as identical (a Senate companion), and writes them to the bill's "cosponsors" list:
// [{person, bill, sponsor?, date}]. A cosponsorship later withdrawn is left out. The list is rebuilt on each run.
// It does the same for the bills on the Bills page that count in Your match (research.json "billIndex" entries with an
// "issue", such as the stock-trading, lobbying and Citizens United bills), and the bills the money-pledge checks read
// ("reform", such as the Stop Insider Trading Act).
//   npm run bills:cosponsors
// Run it after adding a bill, review the changes, and commit public/research.json.
import fs from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {requestSource} from '../src/sources.mjs';

const BILL=/^(\d+)-(hr|s|hjres|sjres|hconres|sconres|hres|sres)-(\d+)$/;
const keyOf=(congress,type,number)=>`${Number(congress)}-${String(type).toLowerCase()}-${Number(number)}`;

// The records for one bill on file. read: {billKey: {sponsor: bioguide, cosponsors: [{bioguideId, sponsorshipDate,
// sponsorshipWithdrawnDate}]}}; people: Map bioguide -> person ID.
export function cosponsorRecords(read,people){
  const out=[];
  for(const [bill,x] of Object.entries(read)){
    const s=people.get(x.sponsor);if(s)out.push({person:s,bill,sponsor:true,date:x.introduced||null});
    for(const c of x.cosponsors||[]){const p=people.get(c.bioguideId);if(p&&!c.sponsorshipWithdrawnDate)out.push({person:p,bill,date:c.sponsorshipDate||null});}
  }
  const seen=new Set();
  return out.filter(r=>{const k=r.person+'|'+r.bill;if(seen.has(k))return false;seen.add(k);return true;})
    .sort((a,b)=>a.person.localeCompare(b.person)||a.bill.localeCompare(b.bill));
}
// Bills Congress.gov lists as identical to this one, in the same Congress.
export const identical=(related,congress)=>(related||[]).filter(r=>Number(r.congress)===Number(congress)&&(r.relationshipDetails||[]).some(d=>/identical/i.test(d.type||'')))
  .map(r=>keyOf(r.congress,r.type,r.number));

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const file=new URL('../public/research.json',import.meta.url),research=JSON.parse(await fs.readFile(file,'utf8'));
  const people=new Map([...research.members,...research.cands,...(research.featured||[])].filter(p=>p.bioguide).map(p=>[p.bioguide,p.id]));
  const env=process.env,wait=()=>new Promise(r=>setTimeout(r,200));
  const get=async path=>{await wait();return requestSource(`https://api.congress.gov/v3/bill/${path}${path.includes('?')?'&':'?'}format=json`,env);};
  const list=async(path,field)=>{const rows=[];for(let offset=0;;offset+=250){const d=await get(`${path}?limit=250&offset=${offset}`);const page=d[field]||[];rows.push(...page);if(page.length<250)return rows;}};
  let total=0;
  for(const b of [...research.bills,...(research.billIndex||[]).filter(x=>x.issue||x.reform?.length)]){
    const keys=[b.id,...(b.versions||[])].filter(k=>BILL.test(k)),read={},queue=[...keys];
    try{
      while(queue.length){
        const key=queue.shift();if(read[key])continue;const [,c,t,n]=key.match(BILL),path=`${c}/${t}/${n}`;
        const d=(await get(path)).bill;if(!d||Number(d.congress)!==Number(c)||String(d.number)!==n)throw new Error(`${key}: Congress.gov returned a different bill`);
        read[key]={sponsor:(d.sponsors||[])[0]?.bioguideId||null,introduced:d.introducedDate||null,cosponsors:await list(`${path}/cosponsors`,'cosponsors')};
        for(const k of identical(await list(`${path}/relatedbills`,'relatedBills'),c))if(!read[k]&&!queue.includes(k))queue.push(k);
      }
    }catch(e){console.warn(`${b.id}: ${e.message}; its list is unchanged.`);continue;}
    const recs=cosponsorRecords(read,people);
    if(recs.length)b.cosponsors=recs;else delete b.cosponsors;
    total+=recs.length;
    console.log(`${b.id}: ${Object.keys(read).join(', ')} · ${recs.length} profiled sponsor${recs.length===1?'':'s'} and cosponsors${recs.length?`: ${[...new Set(recs.map(r=>r.person))].join(', ')}`:''}`);
  }
  await fs.writeFile(file,JSON.stringify(research,null,2));
  console.log(`${total} sponsorships and cosponsorships recorded in public/research.json. Review the changes, then commit.`);
}
