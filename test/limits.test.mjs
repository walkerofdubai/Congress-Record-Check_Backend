import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {openDatabase} from '../scripts/sqlite.mjs';
import {addJob,runRefresh,statement} from '../src/refresh.mjs';
const migration=await fs.readFile(new URL('../migrations/0001_initial.sql',import.meta.url),'utf8');
test('a rate limit pauses all jobs using the same API key',async()=>{
  const db=openDatabase(':memory:');db.exec(migration);db.exec("INSERT INTO metadata VALUES ('initialized','test fixture')");
  for(const id of ['a','b'])await addJob(db,`campaign:${id}`,'campaign',id,{committee:'C00314575',cycle:2026});
  let requests=0;const started=Date.now();
  await runRefresh({DB:db,FEC_API_KEY:'test',fetch:async()=>{requests++;return new Response('rate limited',{status:429,headers:{'Retry-After':'120'}});}},{steps:8});
  assert.equal(requests,1);
  const jobs=(await statement(db,'SELECT next_due FROM jobs').all()).results;
  assert.ok(jobs.every(j=>j.next_due>=started+120000));db.close();
});
