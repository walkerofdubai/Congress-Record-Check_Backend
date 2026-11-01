import test from 'node:test';
import assert from 'node:assert/strict';
import {assignIds,senatorEntry,senateFecId,addSenators} from '../scripts/build-senate.mjs';

const sen=(bioguide,first,last,state,extra={})=>({id:{bioguide,lis:'S'+bioguide.slice(1),fec:extra.fec||[]},name:{first,last,official_full:`${first} ${last}`},
  terms:[...(extra.house?[{type:'rep',start:'2011-01-05',end:'2013-01-03',state,party:'Democrat'}]:[]),{type:'sen',start:extra.start||'2019-01-03',end:extra.end||'2031-01-03',state,class:1,party:extra.party||'Republican',url:`https://www.${last.toLowerCase()}.senate.gov`}]});

test('profile IDs are letters only, with initials when a last name is shared or already taken',()=>{
  const ids=assignIds([sen('S1','Rick','Scott','FL'),sen('S2','Tim','Scott','SC'),sen('V1','Chris','Van Hollen','MD'),sen('L1','Ben Ray','Luján','NM'),sen('M1','Chris','Murphy','CT')],['murphy']);
  assert.deepEqual([...ids.values()],['rscott','tscott','vanhollen','lujan','cmurphy']);
});

test('a directory entry has the party, the next election and the first Senate term',()=>{
  const e=senatorEntry(sen('K1','Angus','King','ME',{party:'Independent',start:'2013-01-03',end:'2031-01-03',house:true}),'king',false);
  assert.deepEqual([e.party,e.nextElection,e.since,e.stateName,e.class],['I',2030,'2013-01-03','Maine',1]);
  assert.equal(senateFecId(sen('C1','Susan','Collins','ME',{fec:['H4ME01001','S6ME00159','S6NH00001']})),'S6ME00159');
});

test('senators without a profile are added once, and profiled ones link to their profile',()=>{
  const current=[sen('C001035','Susan','Collins','ME'),sen('K1','Angus','King','ME',{fec:['S2ME00109']}),{...sen('R1','Rep','House','ME'),terms:[{type:'rep',start:'2025-01-03',end:'2027-01-03',state:'ME'}]}];
  const config={people:[{id:'collins',bioguide:'C001035'}]},research={members:[{id:'collins',bioguide:'C001035'}],cands:[]};
  const a=addSenators(current,config,research);
  assert.equal(a.added,1);assert.deepEqual(a.senators.map(s=>[s.id,s.profiled]),[['collins',true],['king',false]]);
  assert.deepEqual(config.people[1],{id:'king',name:'Angus King',short:'King',bioguide:'K1',lis:'S1',fecCand:'S2ME00109',fecCmte:null,chamber:'S',state:'ME',race:null,basic:true});
  assert.equal(addSenators(current,config,research).added,0,'running it again adds no one twice');
});
