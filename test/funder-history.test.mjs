import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {classify,context,aggregate,isoDate,isGeneral,IE_BEFORE} from '../scripts/build-funder-history.mjs';
const data=JSON.parse(await fs.readFile(new URL('../public/research.json',import.meta.url),'utf8'));
const hist=JSON.parse(await fs.readFile(new URL('../public/funder-history.json',import.meta.url),'utf8'));
const ctx=context(data);
// A pas2 line: CMTE_ID|AMNDT|RPT|PGI|IMAGE|TP|ENTITY|NAME|CITY|ST|ZIP|EMPLOYER|OCC|DATE|AMT|OTHER_ID|CAND_ID|TRAN|FILE|MEMO|MEMO_TEXT|SUB
const line=o=>[o.cm||'C00489799','N','M10',o.pgi||'G2020','1','24A','ORG','X','','','','','',o.dt||'10012020',String(o.amt??1000),o.other||'',o.cand||'S6ME00159','T1','1',o.memo||'','',''].map((v,i)=>i===5?(o.tp||'24A'):v).join('|');
test('outside spending against a candidate in a general election is kept, by month',()=>{
  assert.deepEqual(classify(line({}),ctx),{group:'ppaf',person:'collins',kind:'a',date:'2020-10-01',amount:1000});
  assert.equal(classify(line({tp:'24E'}),ctx).kind,'f');
});
test('memo lines, primaries, unknown committees and other candidates are dropped',()=>{
  assert.equal(classify(line({memo:'X'}),ctx),null);
  assert.equal(classify(line({pgi:'P2020'}),ctx),null);
  assert.equal(classify(line({cm:'C99999999'}),ctx),null);
  assert.equal(classify(line({cand:'S0XX00000'}),ctx),null);
});
test('a general runoff (Nov-Feb) counts; a primary runoff (May-Aug) does not',()=>{
  assert.equal(isGeneral('R2020','2020-12-15'),true);
  assert.equal(isGeneral('R2026','2026-06-10'),false);
  assert.equal(classify(line({pgi:'R2020',dt:'12152020',cand:'S8GA00180',cm:'C00741710'}),ctx).person,'ossoff');
});
test('outside spending from 2025 on is left to the reviewed data; contributions are kept for every year',()=>{
  assert.equal(classify(line({dt:'03012025'}),ctx),null);
  const c=classify(line({tp:'24K',dt:'03012025',cm:'C00082040',cand:'H2NY17162'}),ctx);
  assert.equal(c.kind,'c');assert.equal(c.person,'lawler');
});
test("a candidate's earlier campaign for another office is matched by their past FEC ID",()=>{
  const c=classify(line({tp:'24K',dt:'06012022',cm:'C00082040',cand:'H0IA01174'}),ctx);
  assert.equal(c&&c.person,'hinson');
});
test('dates: malformed values are rejected',()=>{
  assert.equal(isoDate('10012020'),'2020-10-01');
  assert.equal(isoDate('13012020'),'');assert.equal(isoDate('01452020'),'');
  assert.equal(isoDate(''),'');assert.equal(isoDate('2020'),'');
});
test('monthly aggregation adds amounts and counts per month, in order',()=>{
  const out=aggregate([{group:'g',person:'p',kind:'c',date:'2020-02-03',amount:5},{group:'g',person:'p',kind:'c',date:'2020-01-09',amount:2},{group:'g',person:'p',kind:'c',date:'2020-02-20',amount:1}]);
  assert.deepEqual(out.p.g.c,[['2020-01',2,1],['2020-02',6,2]]);
});
test('the published history file is well formed, and holds no outside spending from 2025 on',()=>{
  const keys=new Set(data.groupPos.map(g=>g.key)), ids=new Set(data.members.concat(data.cands).map(p=>p.id));
  for(const [p,gs] of Object.entries(hist.people)){
    assert.ok(ids.has(p),p);
    for(const [g,v] of Object.entries(gs)){
      assert.ok(keys.has(g),g);
      for(const k of ['c','f','a'])for(const [m,amt,n] of v[k]){
        assert.match(m,/^\d{4}-\d{2}$/);assert.ok(Number.isFinite(amt)&&n>0);
        if(k!=='c')assert.ok(m<IE_BEFORE.slice(0,7),`${p}/${g}: outside spending in ${m}`);
      }
    }
  }
});
test('every group has FEC committee IDs',()=>{
  for(const g of data.groupPos){assert.ok(g.fecIds.length>0,g.key);g.fecIds.forEach(f=>assert.match(f.id,/^C\d{8}$/));}
});
