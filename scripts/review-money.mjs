// Checkpoint before publishing the money updates (steps 1-4): what changed in each person's funders, and in the two
// indexes that move with them (Donor Loyalty and Vote Donor Alignment, on the Money & Influence tab; neither is a grade),
// between the last committed public/research.json and the one on disk. Run it after the scripts that fill the money in
// (npm run pacs:types, npm run funders:bundled, node scripts/build-funders.mjs) and before committing.
//   npm run review:money                   compare with the last commit
//   npm run review:money -- --against=<file>   compare with another copy of research.json
import fs from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {donorLoyalty,voteDonorAlignment} from '../public/influence.js';
import {pacKindTotals} from '../public/pac-types.js';

const people=d=>[...(d.members||[]),...(d.cands||[]),...(d.featured||[])];
const money=f=>(f.pac||0)+(f.routed||0)+(f.for||0)+(f.against||0);
const $=n=>'$'+Math.round(n||0).toLocaleString('en-US');
// One person's two indexes and funder money, as the Money & Influence tab figures them.
export function indexes(p,tallies){
  const dl=p.office?null:donorLoyalty(p.funderPos||[],p.party,tallies),va=voteDonorAlignment(p.funderPos||[]);
  return {loyalty:dl?.index??null,loyaltyWhy:dl?.why||null,diff:dl?.diff??null,alignment:va.pct,alignN:va.n,
    funders:new Map((p.funderPos||[]).map(f=>[f.key,f]))};
}
// The lines of the report: for each person whose funders or indexes changed, what changed.
export function review(before,after,tallies){
  const old=new Map(people(before).map(p=>[p.id,p])),lines=[];let changed=0;
  for(const p of people(after)){
    const o=old.get(p.id);if(!o)continue;
    const a=indexes(o,tallies),b=indexes(p,tallies),out=[];
    const show=(v,why)=>v==null?(why||'none'):String(v);
    if(a.loyalty!==b.loyalty||a.diff!==b.diff)out.push(`Donor Loyalty ${show(a.loyalty,a.loyaltyWhy)} → ${show(b.loyalty,b.loyaltyWhy)}${b.diff!=null?` (${b.diff>0?'+':''}${b.diff} vs. party)`:''}`);
    if(a.alignment!==b.alignment||a.alignN!==b.alignN)out.push(`Vote Donor Alignment ${a.alignment??'none'}% of ${a.alignN} → ${b.alignment??'none'}% of ${b.alignN}`);
    for(const [k,f] of b.funders){const g=a.funders.get(k);
      if(!g)out.push(`+ ${f.org}: ${$(money(f))}${f.routed?` (${$(f.routed)} bundled)`:''}`);
      else if(money(g)!==money(f))out.push(`${f.org}: ${$(money(g))} → ${$(money(f))}${(f.routed||0)!==(g.routed||0)?` (bundled ${$(g.routed)} → ${$(f.routed)})`:''}`);}
    for(const [k,g] of a.funders)if(!b.funders.has(k))out.push(`− ${g.org}`);
    if(out.length){changed++;lines.push(`${p.name} (${p.id})`,...out.map(l=>'  '+l));}
  }
  const sum=(d,f)=>people(d).reduce((t,p)=>t+(p.funderPos||[]).reduce((u,x)=>u+f(x),0),0);
  const head=[`People with changes: ${changed} of ${people(after).length}`,
    `Bundled gifts on file: ${$(sum(before,f=>f.routed||0))} → ${$(sum(after,f=>f.routed||0))}`,
    `Funder entries: ${sum(before,()=>1)} → ${sum(after,()=>1)}`];
  if(after.pacIds){const all=people(after).flatMap(p=>p.pac?.rows||[]),k=pacKindTotals(after,all),tot=k.reduce((t,x)=>t+x.total,0),known=k.filter(x=>x.kind!=='unknown').reduce((t,x)=>t+x.total,0);
    head.push(`PAC money matched to an FEC type: ${Math.round(known/tot*100)}% (${k.filter(x=>x.kind!=='unknown').map(x=>`${x.label} ${$(x.total)}`).join(', ')})`);}
  return [...head,'',...lines];
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const root=new URL('..',import.meta.url),against=process.argv.find(a=>a.startsWith('--against='))?.split('=')[1];
  const after=JSON.parse(await fs.readFile(new URL('public/research.json',root),'utf8'));
  const before=JSON.parse(against?await fs.readFile(against,'utf8'):execFileSync('git',['show','HEAD:public/research.json'],{cwd:root,maxBuffer:1<<28}).toString());
  const tallies=JSON.parse(await fs.readFile(new URL('public/vote-party.json',root),'utf8')).votes;
  console.log(review(before,after,tallies).join('\n'));
  console.log('\nIf this looks right, commit public/research.json (see .04_UPDATES_&_FIXES_IN_NEED.md, "Checkpoint").');
}
