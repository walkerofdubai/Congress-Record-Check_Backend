import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {XMLParser} from 'fast-xml-parser';
import {fecNext,normalizeCampaign,normalizeTransaction,normalizeVote,requestSource,summarizeTransactions} from '../src/sources.mjs';
import {addJob,initialize,runRefresh,seedScope,statement,getProfile,getStatus,getCards} from '../src/refresh.mjs';
import worker from '../src/worker.mjs';
import {openDatabase} from '../scripts/sqlite.mjs';
import {feedSignature,voterHashes} from '../src/refresh.mjs';
const migration=await fs.readFile(new URL('../migrations/0001_initial.sql',import.meta.url),'utf8');
const args={committee:'C00314575',candidate:'S6ME00159',cycle:2026};
const campaign=(receipts=1000)=>({committee_id:args.committee,cycle:2026,coverage_start_date:'2025-01-01',coverage_end_date:'2026-06-30',receipts,last_cash_on_hand_end_period:200,last_debts_owed_by_committee:0,disbursements:800});
const pac=(id,amount=100)=>({sub_id:id,committee_id:args.committee,transaction_id:'T'+id,contribution_receipt_amount:amount,contribution_receipt_date:'2026-02-01',contributor_name:'Example PAC',file_number:1234});
const response=obj=>new Response(JSON.stringify(obj),{headers:{'content-type':'application/json'}});
function database(){const db=openDatabase(':memory:');db.exec(migration);db.exec(`INSERT INTO metadata VALUES ('initialized','test fixture'),('feeds','${feedSignature()}')`);return db;}

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
test('a published vote is never scheduled again and does not go stale',async()=>{
  const db=database();const vote={chamber:'H',year:2026,number:1};await addJob(db,'vote:H:2026:1','vote','h-2026-1',vote);
  const xml='<rollcall-vote><vote-metadata><rollcall-num>1</rollcall-num><action-date>6-Jan-2026</action-date><vote-question>Passage</vote-question></vote-metadata><vote-data><recorded-vote><legislator name-id="C001035">Collins</legislator><vote>Yea</vote></recorded-vote></vote-data></rollcall-vote>';
  let requests=0;const env={DB:db,fetch:async()=>{requests++;return new Response(xml);}};
  await runRefresh(env,{steps:1});
  await statement(db,"UPDATE jobs SET last_success='2020-01-01T00:00:00.000Z'").run();await runRefresh(env,{steps:1});assert.equal(requests,1);
  const job=(await getStatus(env)).jobs.find(j=>j.id==='vote:H:2026:1');assert.equal(job.status,'ready');assert.equal(job.stale,false);db.close();
});
test('a new database starts from the bundled seed; a mismatched seed or an existing database is left alone',async()=>{
  const config=JSON.parse(await fs.readFile(new URL('../data/config.json',import.meta.url),'utf8'));
  const checked='2026-10-01T12:00:00.000Z',vote={chamber:'S',congress:117,session:1,number:1};
  const seed={version:1,exportedAt:checked,scope:seedScope(config),voters:voterHashes(),jobs:[
    {id:'campaign:collins',kind:'campaign',subject:'collins',args:{committee:args.committee,cycle:2026},lastSuccess:checked,checkedThrough:'2026-06-30',run:'r1',snapshot:normalizeCampaign(campaign(4321),args.committee,2026)},
    {id:'vote:S:117:1:1',kind:'vote',subject:'117-1-1',args:vote,lastSuccess:checked,checkedThrough:null,run:'r2',snapshot:{id:'117-1-1',chamber:'S',number:1,date:'2021-01-06',positions:{collins:'Yea'}}}]};
  const fresh=()=>{const db=openDatabase(':memory:');db.exec(migration);return db;};
  let db=fresh();await initialize(db,seed);const env={DB:db};
  const profile=await getProfile(env,'collins');assert.equal(profile.sections.campaign.receipts,4321);assert.equal(profile.votes[0].position,'Yea');
  const jobs=Object.fromEntries((await statement(db,'SELECT id,status,next_due FROM jobs').all()).results.map(j=>[j.id,j]));
  assert.equal(jobs['campaign:collins'].status,'ready');assert.equal(jobs['campaign:collins'].next_due,Date.parse(checked)+86400000);
  assert.equal(jobs['vote:S:117:1:1'].next_due,Number.MAX_SAFE_INTEGER);assert.equal(jobs['pac:collins'].status,'pending');
  await initialize(db,{...seed,jobs:[{...seed.jobs[0],snapshot:normalizeCampaign(campaign(1),args.committee,2026)}]});
  assert.equal((await getProfile(env,'collins')).sections.campaign.receipts,4321);db.close();
  db=fresh();await initialize(db,{...seed,scope:{...seed.scope,cycle:2028}});
  assert.equal((await getProfile({DB:db},'collins')).sections.campaign,undefined);db.close();
});
test('concurrent refreshers respect the lock',async()=>{
  const db=database();await addJob(db,'campaign:collins','campaign','collins',args);
  await statement(db,"INSERT INTO locks VALUES ('refresh','other',?)",Date.now()+60000).run();
  const result=await runRefresh({DB:db},{steps:1});assert.equal(result.busy,true);db.close();
});
test('manual refresh cannot be triggered cross-origin or on the hosted worker',async()=>{
  const request=new Request('http://localhost:8787/api/refresh',{method:'POST',headers:{Origin:'https://evil.example','X-Requested-With':'PublicLedger'}});
  assert.equal((await worker.fetch(request,{LOCAL_MODE:true},{})).status,403);
  assert.equal((await worker.fetch(request,{LOCAL_MODE:false},{})).status,403);
});
test('House vote mapping uses Bioguide IDs; Senate uses LIS member IDs, never names',()=>{
  const parser=new XMLParser({ignoreAttributes:false,parseTagValue:false});
  const senate=parser.parse('<roll_call_vote><congress>119</congress><session>2</session><vote_number>1</vote_number><vote_date>January 6, 2026, 12:00 PM</vote_date><vote_title>Example vote</vote_title><members><member><last_name>Collins</last_name><party>R</party><state>ME</state><lis_member_id>S252</lis_member_id><vote_cast>Nay</vote_cast></member><member><last_name>Collins</last_name><party>R</party><state>GA</state><lis_member_id>S999</lis_member_id><vote_cast>Yea</vote_cast></member><member><last_name>King</last_name><party>I</party><state>ME</state><lis_member_id>S363</lis_member_id><vote_cast>Yea</vote_cast></member></members></roll_call_vote>');
  const people=[{id:'collins',name:'Susan M. Collins',bioguide:'C001035',lis:'S252',state:'ME',chamber:'S'},{id:'king',name:'Angus S. King',bioguide:'K000383',lis:null,state:'ME',chamber:'S'}];
  const v=normalizeVote(senate,{chamber:'S',congress:119,session:2,number:1},people);assert.equal(v.positions.collins,'Nay');
  assert.equal(v.positions.king,undefined,'no LIS ID, so no inferred vote even though the surname and state match');
  assert.deepEqual(v.byParty,{R:{Nay:1,Yea:1},I:{Yea:1}},'party totals from every member in the file');
  assert.throws(()=>normalizeVote(senate,{chamber:'S',congress:119,session:2,number:2},people),/identity/);
  const house=parser.parse('<rollcall-vote><vote-metadata><rollcall-num>1</rollcall-num><action-date>6-Jan-2026</action-date><vote-question>Passage</vote-question></vote-metadata><vote-data><recorded-vote><legislator name-id="C001035" party="R">Another name</legislator><vote>Yea</vote></recorded-vote><recorded-vote><legislator name-id="X000001" party="D">Someone</legislator><vote>No</vote></recorded-vote></vote-data></rollcall-vote>');
  const hv=normalizeVote(house,{chamber:'H',year:2026,number:1},people);
  assert.equal(hv.positions.collins,'Yea');assert.deepEqual(hv.byParty,{R:{Yea:1},D:{Nay:1}},'"No" counts as Nay');
});

test('adding a senator reads the Senate roll calls already read once more, so their positions are filled in',async()=>{
  const db=openDatabase(':memory:');db.exec(migration);await initialize(db);
  await statement(db,"UPDATE jobs SET status='ready',last_success='2026-10-01T00:00:00Z',next_due=? WHERE kind='vote'",Date.now()+864e5).run();
  const senateVote=(await statement(db,"SELECT id FROM jobs WHERE id LIKE 'vote:S:%' LIMIT 1").first()).id,houseVote=(await statement(db,"SELECT id FROM jobs WHERE id LIKE 'vote:H:%' LIMIT 1").first())?.id;
  const {default:config}=await import('../data/config.json',{with:{type:'json'}});
  config.people.push({id:'newsenator',name:'New Senator',short:'Senator',bioguide:'N000001',lis:'S999',chamber:'S',state:'ME',ids:{},social:{bluesky:[],threads:[]},inOffice:true,official:null});
  try{
    await initialize(db);
    assert.equal((await statement(db,'SELECT status FROM jobs WHERE id=?',senateVote).first()).status,'pending');
    if(houseVote)assert.equal((await statement(db,'SELECT status FROM jobs WHERE id=?',houseVote).first()).status,'ready','House roll calls are not read again for a senator');
    assert.ok(await statement(db,"SELECT id FROM jobs WHERE id='legislation:newsenator'").first(),'the new senator gets their own jobs');
    await statement(db,"UPDATE jobs SET status='ready' WHERE kind='vote'").run();await initialize(db);
    assert.equal((await statement(db,'SELECT status FROM jobs WHERE id=?',senateVote).first()).status,'ready','only once');
  }finally{config.people.pop();}
  db.close();
});

test('the home cards get everyone\'s campaign and outside-money totals in one request',async()=>{
  const db=database();
  await addJob(db,'campaign:murkowski','campaign','murkowski',args);await addJob(db,'outside:murkowski','outside','murkowski',args);
  const snap=(id,payload)=>statement(db,'INSERT INTO snapshots(job_id,run_id,payload,updated_at) VALUES(?,?,?,?)',id,'r',JSON.stringify(payload),'2026-10-01').run();
  await snap('campaign:murkowski',{receipts:1234,cash:50,start:'2025-01-01',end:'2026-09-30',rows:[]});
  await snap('outside:murkowski',{support:10,oppose:20,through:'2026-10-20',rows:[{amount:10}]});
  const {people}=await getCards({DB:db});
  assert.deepEqual(people.murkowski,{campaign:{receipts:1234,cash:50,start:'2025-01-01',end:'2026-09-30'},outside:{support:10,oppose:20,through:'2026-10-20'}});
  const res=await worker.fetch(new Request('http://x/api/cards'),{DB:db},{});assert.equal(res.status,200);
  db.close();
});
