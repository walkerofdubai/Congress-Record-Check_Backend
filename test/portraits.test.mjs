import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const root=new URL('../public/',import.meta.url);
const data=JSON.parse(await fs.readFile(new URL('research.json',root),'utf8'));
const index=JSON.parse(await fs.readFile(new URL('portraits/index.json',root),'utf8'));
const ids=new Set(data.members.concat(data.cands).map(s=>s.id));
test('every portrait belongs to a profiled person, exists as a WebP, and says where it came from',async()=>{
  for(const [id,p] of Object.entries(index.people)){
    assert.ok(ids.has(id),id+' is not in research.json');
    assert.equal(p.file,`portraits/${id}.webp`);
    const b=await fs.readFile(new URL(p.file,root));
    assert.equal(b.toString('latin1',0,4)+b.toString('latin1',8,12),'RIFFWEBP',id+' is not a WebP');
    assert.ok(p.credit&&p.credit.length>10,id+' needs a credit');
    if(p.src)assert.match(p.src,/^https:\/\//,id+' has a bad source link');
  }
});
test('no stray portrait files',async()=>{
  for(const f of await fs.readdir(new URL('portraits/',root)))if(f!=='index.json')assert.ok(index.people[f.replace(/\.webp$/,'')],f+' is not listed in index.json');
});
