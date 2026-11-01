// The money pledges on file (step 7): each statement tagged "pledge" in public/research.json, its reviewed verdict, and
// what the records on file show now (public/pledges.js). Lines marked "REVIEW" are where the records directly conflict
// with the reviewed verdict; the verdict changes only after a person reviews it. Nothing is written.
//   npm run review:pledges
import fs from 'node:fs/promises';
import {allPledges} from '../public/pledges.js';

const data=JSON.parse(await fs.readFile(new URL('../public/research.json',import.meta.url),'utf8'));
const $=n=>`$${Math.round(n).toLocaleString()}`;
const list=allPledges(data);
if(!Array.isArray(data.pacIds))console.log('PAC types aren\'t saved yet (npm run pacs:types), so the corporate-PAC pledges wait.\n');
for(const {person:p,statement:x,check:c} of list){
  console.log(`${c.conflict?'REVIEW ':''}${p.name} · ${c.label} (said ${x.said.date}): reviewed "${x.assessment}", records: ${c.outcomeLabel}`);
  if(c.totals){
    const parts=[`${c.since?"after the pledge":"in the reports on file"} ${$(c.after)}`];
    if(c.totals.during)parts.push(`in the report covering the pledge date ${$(c.totals.during)}`);
    if(c.totals.beside)parts.push(`trade and membership PACs (not counted) ${$(c.totals.beside)}`);
    if(c.totals.unknown)parts.push(`PACs with no FEC type ${$(c.totals.unknown)}`);
    for(const b of c.bundled)parts.push(`bundled through ${b.org} (${b.when}) ${$(b.amount)}`);
    console.log(`    ${parts.join('; ')}`);
    for(const r of c.counted.after.slice(0,5))console.log(`    - ${r.name}: ${$(r.amount)} (${r.report})`);
  }else for(const a of c.actions)console.log(`    - ${a.way==='for'?'for':'AGAINST'}: ${a.what} ${a.measure}${a.date?` (${a.date})`:''}`);
}
const flagged=list.filter(x=>x.check.conflict).length;
console.log(`\n${list.length} pledges; ${flagged} where the records conflict with the reviewed verdict${flagged?' (marked REVIEW)':''}.`);
