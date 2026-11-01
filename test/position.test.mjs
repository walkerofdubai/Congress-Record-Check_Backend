import test from 'node:test';
import assert from 'node:assert/strict';
import {positionByCategory,POSITION_CATEGORIES} from '../public/lean.js';

const issues=[
  {id:'taxes',liberalSide:'A'},{id:'infra',liberalSide:null},{id:'immigration',liberalSide:'B'},
  {id:'tariffs',liberalSide:null},{id:'voting',liberalSide:'B'},{id:'jan6',liberalSide:null},{id:'guns',liberalSide:'A'},
];
const cat=(rows,label)=>rows.find(r=>r.label===label);

test('each category is placed from the record, with one credit per bill and unmarked issues left out',()=>{
  const rows=positionByCategory(issues,{
    taxes:[{type:'senate_vote',side:'A',bill:'b1'},{type:'sponsored',side:'A',bill:'b1'},{type:'senate_vote',side:'B',bill:'b2'},{type:'stated',side:'B'}],
    infra:[{type:'senate_vote',side:'A'}],
    immigration:[{type:'house_vote',side:'A'},{type:'house_vote',side:'A'}],
    voting:[{type:'house_vote',side:'B'},{type:'house_vote',side:'A'}],
  });
  assert.equal(rows.length,POSITION_CATEGORIES.length);
  // The vote and the sponsorship on b1 count once; the statement is ignored because there is a record.
  assert.deepEqual(['lib','con','n','lean'].map(k=>cat(rows,'Taxes and government spending')[k]),[1,1,2,0]);
  assert.equal(cat(rows,'Immigration').lean,-100,'both votes on the conservative side');
  assert.equal(cat(rows,'Voting and elections').lean,0);
  assert.equal(cat(rows,'Trade and tariffs').status,'unsided');
  assert.equal(cat(rows,'Housing').status,'untracked');
  assert.equal(cat(rows,'Guns').status,'none');
});

test('statements count at half, and only for an issue with no recorded action',()=>{
  const two=[{id:'taxes',liberalSide:'A'},{id:'infra',liberalSide:'A'}];
  const rows=positionByCategory(two,{taxes:[{type:'senate_vote',side:'B'}],infra:[{type:'stated',side:'A'},{type:'stated',side:'A'}]});
  const t=cat(rows,'Taxes and government spending');
  // Weighted: liberal 2 × 0.5 = 1, conservative 1 × 1 = 1, so even; the counts stay whole.
  assert.deepEqual([t.lib,t.con,t.record,t.stated,t.lean],[2,1,1,2,0]);
  const only=cat(positionByCategory(issues,{guns:[{type:'stated',side:'A'}]}),'Guns');
  assert.deepEqual([only.lean,only.record,only.stated],[100,0,1]);
});

test('a place in the chamber from the Voteview pool matches the reviewed profiles',async()=>{
  const {poolIdeo}=await import('../public/lean.js');
  const {default:d}=await import('../public/research.json',{with:{type:'json'}});
  for(const s of d.members.filter(m=>m.chamber==='S')){
    const i=poolIdeo(d.pools.S,s.bioguide,s.party);
    assert.deepEqual([i.dim1,i.lo,i.plo,i.n,i.np],[s.ideo.dim1,s.ideo.lo,s.ideo.plo,s.ideo.n,s.ideo.np],s.id);
  }
  assert.equal(poolIdeo(d.pools.S,'NOPE','D'),null);
});
