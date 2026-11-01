// Each PAC's type from its FEC registration (public/pac-types.js), and the lookup that matches the saved PAC names to
// FEC committee IDs (scripts/build-pac-types.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {PAC_KINDS,pacKind,pacTypeOf,pacKindTotals} from '../public/pac-types.js';
import {cyclesOf,matchIds,pickByName,lookupCommittees,settle} from '../scripts/build-pac-types.mjs';
const D=JSON.parse(await fs.readFile(new URL('../public/research.json',import.meta.url),'utf8'));

test('the kind comes from the sponsor first, then the designation, then the committee type',()=>{
  const k=(type,dsgn,org)=>pacKind(['X PAC',type,dsgn,org]);
  assert.equal(k('Q','U','C'),'corporate');assert.equal(k('Q','B','C'),'corporate','a company\'s PAC stays corporate when also a lobbyist PAC');
  assert.equal(k('Q','U','W'),'corporate');assert.equal(k('Q','U','L'),'labor');assert.equal(k('Q','U','T'),'trade');
  assert.equal(k('Q','U','M'),'membership');assert.equal(k('Q','U','V'),'cooperative');
  assert.equal(k('Q','B',null),'lobbyist');assert.equal(k('Q','D','C'),'leadership','a leadership PAC is a leadership PAC whatever its sponsor');
  assert.equal(k('N','U',null),'unconnected');assert.equal(k('O','U',null),'unconnected');
  assert.equal(k('H','P',null),'candidate');assert.equal(k('S','A',null),'candidate');assert.equal(k('Y','U',null),'party');
  assert.equal(k('N','J',null),'joint');assert.equal(k('C','U',null),'other');assert.equal(pacKind(null),null);
  for(const v of Object.values(PAC_KINDS))assert.ok(v.label&&v.about);
});

test('a saved name gets a committee and a kind only when it was matched and looked up',()=>{
  const data={pacNames:['Acme Corp PAC','Steelworkers PAC','Mystery PAC'],pacIds:['C00000001','C00000002',null],
    pacCommittees:{C00000001:['ACME CORPORATION PAC','Q','B','C'],C00000002:['UNITED STEELWORKERS','Q','U','L']}};
  const a=pacTypeOf(data,0);assert.equal(a.kind,'corporate');assert.equal(a.lobbyist,true);assert.equal(a.id,'C00000001');
  assert.equal(pacTypeOf(data,2),null);assert.equal(pacTypeOf({pacNames:['x']},0),null,'nothing looked up yet');
  const t=pacKindTotals(data,[[0,5000],[1,2500],[2,1000],[0,1000]]);
  assert.deepEqual(t.map(x=>[x.kind,x.total,x.n]),[['corporate',6000,2],['labor',2500,1],['unknown',1000,1]],'largest first, the unmatched last');
});

test('names match the FEC\'s records for the same committee, including names cut off at 40 characters',()=>{
  const names=[[0,'Seiu Cope'],[1,'American Federation of State County & M'],[2,'Acme PAC'],[3,'Nobody PAC'],[4,'Twin PAC']];
  const records=[{name:'SEIU COPE',id:'C00004036'},{name:'AMERICAN FEDERATION OF STATE COUNTY & MUNICIPAL EMPLOYEES - P E O P L E',id:'C00011114'},
    {name:'ACME PAC',id:'bad'},{name:'TWIN PAC',id:'C00000011'},{name:'Twin  PAC',id:'C00000012'}];
  const m=matchIds(names,records);
  assert.equal(m.get(0),'C00004036','case and spacing don\'t matter');assert.equal(m.get(1),'C00011114','a cut-off name matches the full one it starts');
  assert.ok(!m.has(2),'an ID that isn\'t an FEC committee ID is ignored');assert.ok(!m.has(3));assert.ok(!m.has(4),'a name that could be two committees stays unmatched');
  assert.equal(pickByName('Seiu Cope',[{id:'C00004036',name:'SEIU COPE'},{id:'C00999999',name:'SEIU COPE OF TEXAS'}]),'C00004036','only the exact name');
  assert.equal(pickByName('Pac',[{id:'C00000001',name:'PAC ONE'}]),null);
  assert.deepEqual(cyclesOf({pac:{filings:[{start:'2025-01-01',end:'2025-03-31'},{start:'2026-04-01',end:'2026-06-30'}]}}),[2026]);
  assert.deepEqual(cyclesOf({pac:{filings:[{start:'2023-01-01',end:'2024-12-31'}]}}),[2024]);
  // Across people, the most common match wins; a name not matched this run keeps the earlier one.
  assert.deepEqual(settle(new Map([[0,['C00000002','C00000001','C00000002']]]),[null,'C00000009'],3),['C00000002','C00000009',null]);
});

test('committee registrations are read 100 to a request and keep the FEC\'s codes',async()=>{
  const ids=Array.from({length:150},(_,i)=>'C'+String(i+1).padStart(8,'0')),calls=[];
  const got=await lookupCommittees([...ids,'bad',ids[0]],async u=>{calls.push(new URL(u));const asked=new URL(u).searchParams.getAll('committee_id');
    return {results:asked.map(id=>({committee_id:id,name:'PAC '+id,committee_type:'Q',designation:'U',organization_type:'C'})).concat([{committee_id:'C99999999',name:'not asked'}])};});
  assert.equal(calls.length,2);assert.equal(calls[0].searchParams.getAll('committee_id').length,100);assert.equal(calls[0].pathname,'/v1/committees/');
  assert.equal(Object.keys(got).length,150,'one per ID asked for, not the extras');assert.deepEqual(got[ids[0]],['PAC C00000001','Q','U','C']);
});

test('saved PAC types, when present, line up with the PAC names',()=>{
  if(!D.pacIds)return;
  assert.equal(D.pacIds.length,D.pacNames.length);
  for(const id of D.pacIds)if(id){assert.match(id,/^C\d{8}$/);assert.ok(D.pacCommittees[id],id);}
  assert.match(D.pacTypesAsOf,/^\d{4}-\d{2}-\d{2}$/);
});
