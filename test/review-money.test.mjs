// The checkpoint review (scripts/review-money.mjs): what changed in each person's funders and in Donor Loyalty and Vote
// Donor Alignment between two copies of research.json.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {review,indexes} from '../scripts/review-money.mjs';
import {personFunders} from '../scripts/build-funders.mjs';
const D=JSON.parse(await fs.readFile(new URL('../public/research.json',import.meta.url),'utf8'));
const tallies=JSON.parse(await fs.readFile(new URL('../public/vote-party.json',import.meta.url),'utf8')).votes;

test('no change, nothing listed',()=>{
  const r=review(D,D,tallies);assert.match(r[0],/^People with changes: 0 of /);assert.equal(r.filter(l=>l.startsWith('  ')).length,0);
});

test('bundled gifts show as new money, with the indexes before and after',()=>{
  // Before: nothing bundled for Booker (no FEC reading, no hand research); after: $900,000 through AIPAC's PAC.
  const before=structuredClone(D);before.bundled={asOf:'2026-11-01',conduits:{aipac:['C00797670']},people:{}};
  for(const p of [...before.members,...before.cands])if(p.id==='booker'){p.conduit={status:'not_measured',rows:[]};p.funderPos=personFunders(before,p);}
  const after=structuredClone(before);after.bundled.people={booker:{aipac:{routed:900000,n:850,direct:5000,cycles:[2026],src:'https://www.fec.gov/'}}};
  for(const p of [...after.members,...after.cands])if(p.id==='booker')p.funderPos=personFunders(after,p);
  const r=review(before,after,tallies),text=r.join('\n');
  assert.match(r[0],/^People with changes: 1 of /);
  assert.match(text,/Booker \(booker\)/);assert.ok(!/Donor Loyalty/.test(text)||/Donor Loyalty (\d+|[A-Z][a-z ]+) → \d+/.test(text),"an index line, when the index moves, shows before and after");assert.match(text,/AIPAC[^\n]*\$905,000 \(\$900,000 bundled\)|AIPAC[^\n]*→ \$905,000 \(bundled \$0 → \$900,000\)/);
  assert.match(r[1],/Bundled gifts on file: \$[\d,]+ → \$[\d,]+/);
  const b=[...after.members,...after.cands].find(p=>p.id==='booker'),x=indexes(b,tallies);
  assert.ok(x.funders.get('aipac').routed===900000);
});
