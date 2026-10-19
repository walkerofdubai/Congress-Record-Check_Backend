import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {XMLParser} from 'fast-xml-parser';
import {fecNext,normalizeCampaign,normalizeTransaction,normalizeVote,requestSource,summarizeTransactions} from '../src/sources.mjs';
import {addJob,runRefresh,statement,getProfile} from '../src/refresh.mjs';
import worker from '../src/worker.mjs';
import {openDatabase} from '../scripts/sqlite.mjs';
const migration=await fs.readFile(new URL('../migrations/0001_initial.sql',import.meta.url),'utf8');
const args={committee:'C00314575',candidate:'S6ME00159',cycle:2026};
const campaign=(receipts=1000)=>({committee_id:args.committee,cycle:2026,coverage_start_date:'2025-01-01',coverage_end_date:'2026-06-30',receipts,last_cash_on_hand_end_period:200,last_debts_owed_by_committee:0,disbursements:800});
const pac=(id,amount=100)=>({sub_id:id,committee_id:args.committee,transaction_id:'T'+id,contribution_receipt_amount:amount,contribution_receipt_date:'2026-02-01',contributor_name:'Example PAC',file_number:1234});
const response=obj=>new Response(JSON.stringify(obj),{headers:{'content-type':'application/json'}});
function database(){const db=openDatabase(':memory:');db.exec(migration);db.exec("INSERT INTO metadata VALUES ('initialized','test fixture')");return db;}

test('FEC seek pagination preserves exact cursor values and rejects a repeated cursor',()=>{
  const url='https://api.open.fec.gov/v1/schedules/schedule_a/?per_page=100';
  const page={results:[{}],pagination:{last_indexes:{last_index:'4010120269999999999',last_contribution_receipt_date:'2026-01-01'}}};
  const next=fecNext(url,page);assert.equal(new URL(next).searchParams.get('last_index'),'4010120269999999999');
  assert.throws(()=>fecNext(next,page),/stopped advancing/);
  assert.equal(fecNext(next,{results:[],pagination:{}}),null);
});
test('FEC numeric identifiers are parsed without precision loss',async()=>{
  const result=await requestSource('https://api.open.fec.gov/v1/test/',{FEC_API_KEY:'test',fetch:async()=>new Response('{"results":[{"sub_id":4010120269999999999}],"pagination":{"last_indexes":{"last_index":4010120269999999999}}}')});
  assert.equal(result.results[0].sub_id,'4010120269999999999');assert.equal(result.pagination.last_indexes.last_index,'4010120269999999999');
});
test('campaign records require the expected identity, cycle, reporting dates and amount',()=>{
  assert.equal(normalizeCampaign(campaign(),args.committee,2026).receipts,1000);
  assert.throws(()=>normalizeCampaign({...campaign(),committee_id:'C00000000'},args.committee,2026),/does not match/);
  assert.throws(()=>normalizeCampaign({...campaign(),coverage_end_date:null},args.committee,2026),/dates/);
  assert.throws(()=>normalizeCampaign({...campaign(),receipts:null},args.committee,2026),/missing/);
});
test('outside spending deduplicates exact repeated transactions and keeps negative corrections',()=>{
  const row={id:'1',transaction:'T1',file:'1',committee:'C00000001',name:'Example',date:'2026-03-01',amount:100,direction:'S',election:'G2026',memo:false};
  const result=summarizeTransactions([row,{...row,id:'2',file:'2'},{...row,id:'3',transaction:'T2',amount:-20},{...row,id:'4',transaction:'T3',amount:50,direction:'O'},{...row,id:'5',transaction:'T4',election:'P2026'},{...row,id:'6',transaction:'T5',memo:true},{...row,id:'7',transaction:'T6',date:'2027-01-01'}],'outside',args,'2026-10-03');
  assert.equal(result.support,80);assert.equal(result.oppose,50);assert.equal(result.total,130);assert.equal(result.count,3);assert.equal(result.excluded.duplicates,1);assert.equal(result.excluded.memo,1);assert.equal(result.excluded.otherElection,1);assert.equal(result.excluded.outOfPeriod,1);
});
test('source failures do not leak API keys or accept redirects to arbitrary hosts',async()=>{
  await assert.rejects(requestSource('https://example.com/?api_key=secret',{FEC_API_KEY:'secret'}),/Unapproved/);
  await assert.rejects(requestSource('https://api.open.fec.gov/v1/test/',{FEC_API_KEY:'secret',fetch:async()=>new Response('secret',{status:429,headers:{'Retry-After':'120'}})}),e=>e.retryAfter===120000&&!e.message.includes('secret'));
});
test('a failed refresh preserves the last successful campaign snapshot',async()=>{
  const db=database();await addJob(db,'campaign:collins','campaign','collins',args);
  const env={DB:db,FEC_API_KEY:'test',fetch:async()=>response({results:[campaign()],pagination:{pages:1,page:1}})};
  await runRefresh(env,{steps:1});let profile=await getProfile(env,'collins');assert.equal(profile.sections.campaign.receipts,1000);
  await statement(db,'UPDATE jobs SET next_due=0').run();env.fetch=async()=>new Response('down',{status:503});
  await runRefresh(env,{steps:1});profile=await getProfile(env,'collins');assert.equal(profile.sections.campaign.receipts,1000);
  const job=await statement(db,'SELECT status,failures,last_success FROM jobs').first();assert.equal(job.status,'error');assert.equal(job.failures,1);assert.ok(job.last_success);db.close();
});
test('multi-page transactions remain unpublished until the final page, then replace rather than append',async()=>{
  const db=database();await addJob(db,'pac:collins','pac','collins',args);let phase=0;
  const env={DB:db,FEC_API_KEY:'test',fetch:async url=>{if(phase===1)return response({results:[pac('3',25)],pagination:{}});return new URL(url).searchParams.has('last_index')?response({results:[],pagination:{}}):response({results:[pac('1',100),pac('2',50)],pagination:{last_indexes:{last_index:'2',last_contribution_receipt_date:'2026-02-01'}}});}};
  await runRefresh(env,{steps:1});assert.equal((await getProfile(env,'collins')).sections.pac,undefined);
  await statement(db,'UPDATE jobs SET next_due=0').run();await runRefresh(env,{steps:1});assert.equal((await getProfile(env,'collins')).sections.pac.total,150);
  phase=1;await statement(db,'UPDATE jobs SET next_due=0').run();await runRefresh(env,{steps:1});assert.equal((await getProfile(env,'collins')).sections.pac.total,25);db.close();
});
test('concurrent refreshers respect the lock',async()=>{
  const db=database();await addJob(db,'campaign:collins','campaign','collins',args);
  await statement(db,"INSERT INTO locks VALUES ('refresh','other',?)",Date.now()+60000).run();
  const result=await runRefresh({DB:db},{steps:1});assert.equal(result.busy,true);db.close();
});
test('manual refresh cannot be triggered cross-origin or on the hosted worker',async()=>{
  const request=new Request('http://localhost:8787/api/refresh',{method:'POST',headers:{Origin:'https://evil.example','X-Requested-With':'CongressRecordCheck'}});
  assert.equal((await worker.fetch(request,{LOCAL_MODE:true},{})).status,403);
  assert.equal((await worker.fetch(request,{LOCAL_MODE:false},{})).status,403);
});
test('House vote mapping uses Bioguide IDs; Senate uses an exact name/state match',()=>{
  const parser=new XMLParser({ignoreAttributes:false,parseTagValue:false});
  const senate=parser.parse('<roll_call_vote><congress>119</congress><session>2</session><vote_number>1</vote_number><vote_date>January 6, 2026, 12:00 PM</vote_date><vote_title>Example vote</vote_title><members><member><last_name>Collins</last_name><state>ME</state><vote_cast>Nay</vote_cast></member><member><last_name>Collins</last_name><state>GA</state><vote_cast>Yea</vote_cast></member></members></roll_call_vote>');
  const people=[{id:'collins',name:'Susan M. Collins',bioguide:'C001035',state:'ME',chamber:'S'}];
  const v=normalizeVote(senate,{chamber:'S',congress:119,session:2,number:1},people);assert.equal(v.positions.collins,'Nay');
  assert.throws(()=>normalizeVote(senate,{chamber:'S',congress:119,session:2,number:2},people),/identity/);
  const house=parser.parse('<rollcall-vote><vote-metadata><rollcall-num>1</rollcall-num><action-date>6-Jan-2026</action-date><vote-question>Passage</vote-question></vote-metadata><vote-data><recorded-vote><legislator name-id="C001035">Another name</legislator><vote>Yea</vote></recorded-vote></vote-data></rollcall-vote>');
  assert.equal(normalizeVote(house,{chamber:'H',year:2026,number:1},people).positions.collins,'Yea');
});
