import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {matchPeople,buildCommittees} from '../scripts/build-ids.mjs';
import {SECTORS,OTHER_SECTOR,sectorForSic} from '../public/sectors.js';
const read=async f=>JSON.parse(await fs.readFile(new URL('../'+f,import.meta.url),'utf8'));
const config=await read('data/config.json'),committees=await read('public/committees.json'),sectors=await read('public/committee-sectors.json');

test('people are matched by Bioguide ID, or by FEC candidate ID only in the configured state',()=>{
  const leg=[{id:{bioguide:'A000001',fec:['S6ME00001']},terms:[{state:'ME'}]},{id:{bioguide:'B000002',fec:['H6TX00002']},terms:[{state:'TX'}]}];
  const m=matchPeople([{id:'a',bioguide:'A000001'},{id:'b',fecCand:'H6TX00002',state:'TX'},{id:'c',fecCand:'H6TX00002',state:'OK'},{id:'d',fecCand:'S6XX00009',state:'TX'}],leg);
  assert.equal(m.get('a').id.bioguide,'A000001');assert.equal(m.get('b').id.bioguide,'B000002');assert.ok(!m.has('c'));assert.ok(!m.has('d'));
});
test('committee assignments list full committees before their subcommittees',()=>{
  const out=buildCommittees([{thomas_id:'SSAF',type:'senate',name:'Agriculture',subcommittees:[{thomas_id:'13',name:'Rural'}]}],
    {SSAF13:[{bioguide:'A000001',rank:2,party:'minority'}],SSAF:[{bioguide:'A000001',rank:1,party:'minority',title:'Ranking Member'}],SSXX:[{bioguide:'A000001'}]},
    new Map([['a',{id:{bioguide:'A000001'}}]]),119);
  assert.deepEqual(out.people.a.map(c=>c.id),['SSAF','SSAF13']);assert.equal(out.people.a[0].title,'Ranking Member');
  assert.equal(out.committees.SSAF13.parent,'SSAF');assert.ok(!out.committees.SSXX);
});
test('every sitting senator has an LIS ID, and every configured ID is well formed',()=>{
  for(const p of config.people){
    if(p.lis!=null)assert.match(p.lis,/^S\d{3}$/,p.id);
    if(p.bioguide)assert.match(p.bioguide,/^[A-Z]\d{6}$/,p.id);
    if(p.ids?.wikidata)assert.match(p.ids.wikidata,/^Q\d+$/,p.id);
    if(p.campaignSite)assert.match(p.campaignSite,/^https?:\/\//,p.id);
    for(const b of p.social?.bluesky||[])assert.match(b,/^[a-z0-9.-]+\.[a-z]+$/i,p.id);
  }
  for(const id of ['collins','sullivan','marshall','ossoff','booker','hickenlooper','husted','ricketts'])assert.ok(config.people.find(p=>p.id===id).lis,id);
});
test('committee files agree: every assignment and sector key names a known committee and sector',()=>{
  const ids=new Set(config.people.map(p=>p.id)),names=new Set(SECTORS.map(s=>s.id));
  for(const [pid,list] of Object.entries(committees.people)){assert.ok(ids.has(pid),pid);for(const c of list)assert.ok(committees.committees[c.id],c.id);}
  for(const [cid,c] of Object.entries(sectors.committees)){
    assert.match(cid,/^[HSJ][A-Z]{3}$/,cid+' must be a full committee');
    for(const s of c.sectors)assert.ok(names.has(s),`${cid}: unknown sector ${s}`);assert.ok(c.why,cid);
  }
});
test('company industry codes map to one sector, narrower ranges first',()=>{
  assert.equal(sectorForSic(2834),'Health & Pharma');   // pharmaceutical preparations
  assert.equal(sectorForSic(6324),'Health & Pharma');   // hospital and medical service plans, inside finance
  assert.equal(sectorForSic(6798),'Real Estate & Construction'); // REITs, inside finance
  assert.equal(sectorForSic(6022),'Finance & Insurance');
  assert.equal(sectorForSic(3674),'Technology');        // semiconductors
  assert.equal(sectorForSic(3721),'Defense & Aerospace');
  assert.equal(sectorForSic(1311),'Energy');
  assert.equal(sectorForSic(9995),OTHER_SECTOR);assert.equal(sectorForSic(''),null);
});
