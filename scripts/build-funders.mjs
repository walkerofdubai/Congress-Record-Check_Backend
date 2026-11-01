// Rebuilds every profiled person's funders (public/research.json "funderPos") from the records already saved:
//   - money: each group's PAC gifts to the campaign (the person's pac.rows, matched by the PAC names in the group's
//     "committees" or "pacMatch") and its outside spending for and against them (out.cms, matched by the FEC IDs in
//     "fecIds");
//   - bundled gifts: donors' own gifts the group collected and forwarded through its PAC ("earmarked"), from
//     research.json "bundled" (scripts/build-bundled.mjs), kept apart as "routed"; when that read finds none for a
//     group, a total researched by hand from the filings (the person's "conduit" rows) is used, marked as such;
//   - positions: each saved roll call the group took a side on (groupPos[].positions), next to the person's vote.
// A person gets an entry for each group that gave to the campaign, bundled gifts to it or spent on the race. Run it after adding a group, a
// group's position, a saved vote or new FEC rows:
//   node scripts/build-funders.mjs           rewrite public/research.json and list what changed
//   node scripts/build-funders.mjs --check   list what would change, without writing
import fs from 'node:fs/promises';
import {pathToFileURL} from 'node:url';

export const normName=s=>String(s||'').toLowerCase().replace(/&/g,' and ').replace(/[^a-z0-9]+/g,' ').trim();
// Whether a PAC name on a filing (FEC names are cut off at about 40 characters) is one of the group's PACs.
export function isGroupPac(name,g){
  const n=normName(name);if(!n)return false;
  if((g.pacMatch||[]).some(re=>new RegExp(re,'i').test(name)))return true;
  return [...(g.committees||[]),...(g.fecIds||[]).map(f=>f.name)].map(normName).some(c=>c===n||(n.length>=12&&c.startsWith(n)));
}
const CAST_YES=/^(Yea|Aye|Yes|Guilty)$/,CAST_NO=/^(Nay|No|Not Guilty)$/;
export const matchOf=(cast,wanted)=>CAST_YES.test(cast)?wanted==='Yea':CAST_NO.test(cast)?wanted==='Nay':null;
const cents=n=>Math.round(n*100)/100;

// One person's entries, money first (largest first), each with the votes compared (newest first).
export function personFunders(data,p){
  const votes=new Map([...(data.votes||[]).map(v=>[v.id,{v,chamber:'Senate'}]),...(data.hvotes||[]).map(v=>[v.id,{v,chamber:'House'}])]);
  const out=[];
  for(const g of data.groupPos||[]){
    const ids=new Set((g.fecIds||[]).map(f=>f.id));let pac=0,pacN=0,fr=0,ag=0;const spenders=[];
    for(const x of p.pac?.rows||[])if(isGroupPac((data.pacNames||[])[x[0]],g)){pac+=x[1]||0;pacN++;}
    for(const x of p.out?.cms||[]){const cm=(data.ie?.cm||[])[x[0]];if(!cm||!ids.has(cm[0]))continue;fr+=x[1]||0;ag+=x[2]||0;if((x[1]||0)+(x[2]||0)&&!spenders.includes(cm[1]))spenders.push(cm[1]);}
    const b=data.bundled?.people?.[p.id]?.[g.key];
    const hand=b?[]:(p.conduit?.status==='measured'?p.conduit.rows||[]:[]).filter(r=>(g.conduits||[]).includes(r.id)&&r.amount>0);
    const routed=b?.routed||hand.reduce((t,r)=>t+r.amount-(r.directIncluded||0),0);
    if(!(pac||fr||ag||routed))continue;
    const compared=[];
    for(const q of g.positions||[]){
      const hit=votes.get(q.voteId),cast=hit?.v.pos?.[p.id];
      if(!hit||!cast||cast==='Not in office')continue;
      compared.push({voteId:q.voteId,short:hit.v.short,date:hit.v.date,chamber:hit.chamber,wanted:q.wanted,cast,match:matchOf(cast,q.wanted),basis:q.basis,scoredAs:q.scoredAs,src:q.src});
    }
    compared.sort((a,b)=>b.date.localeCompare(a.date));
    out.push({key:g.key,org:g.org,status:g.status||'done',pac:cents(pac),pacN,...(routed?{routed:cents(routed),routedN:b?.n||0,...(b?{}:{routedBy:'hand',routedPeriod:hand.map(r=>r.period).join('; ')})}:{}),for:cents(fr),against:cents(ag),spenders,compared,
      agree:compared.filter(c=>c.match===true).length,n:compared.filter(c=>c.match!==null).length});
  }
  const order=new Map((data.groupPos||[]).map((g,i)=>[g.key,i]));
  const money=f=>f.pac+(f.routed||0)+f.for+f.against;
  return out.sort((a,b)=>money(b)-money(a)||order.get(a.key)-order.get(b.key));
}
export const people=data=>[...(data.members||[]),...(data.cands||[]),...(data.featured||[])];

// What changed for each person: groups added or dropped, money that moved, and votes compared.
export function funderChanges(data){
  const lines=[];
  for(const p of people(data)){
    const old=new Map((p.funderPos||[]).map(f=>[f.key,f])),now=new Map(personFunders(data,p).map(f=>[f.key,f]));
    for(const [k,f] of now){const o=old.get(k);
      if(!o)lines.push(`${p.id}: + ${f.org} (gave $${f.pac}${f.routed?`, bundled $${f.routed}`:''}, for $${f.for}, against $${f.against}; ${f.compared.length} votes)`);
      else{const d=['pac','routed','for','against'].filter(x=>(o[x]||0)!==(f[x]||0)).map(x=>`${x} $${o[x]||0} → $${f[x]||0}`);
        if(o.compared?.length!==f.compared.length||o.status!==f.status)d.push(`votes ${o.compared?.length||0} → ${f.compared.length}${o.status!==f.status?`, ${o.status} → ${f.status}`:''}`);
        if(d.length)lines.push(`${p.id}: ${f.org}: ${d.join('; ')}`);}}
    for(const [k,o] of old)if(!now.has(k))lines.push(`${p.id}: − ${o.org}`);
  }
  return lines;
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const file=new URL('../public/research.json',import.meta.url),data=JSON.parse(await fs.readFile(file,'utf8'));
  const lines=funderChanges(data);
  console.log(lines.length?lines.join('\n'):'No changes.');
  if(!process.argv.includes('--check')){
    for(const p of people(data))p.funderPos=personFunders(data,p);
    for(const g of data.groupPos||[])g.nPositions=(g.positions||[]).length;
    await fs.writeFile(file,JSON.stringify(data,null,2));
    console.log(`Rewrote funderPos for ${people(data).length} people. Review the changes, then commit public/research.json.`);
  }
}
