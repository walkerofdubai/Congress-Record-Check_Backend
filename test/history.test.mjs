// History back to config.historyFrom (2016): years and cycles that have ended are read once and kept, newest-first lists
// are read back once a month, catch-up runs follow a few minutes apart, and the Record's archive is read a day at a time.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import config from '../data/config.json' with {type:'json'};
import {FEEDS,crecModsRows,history,ended,yearsFrom,cyclesFrom,SINCE} from '../src/feeds.mjs';
import {parseXML} from '../src/sources.mjs';
import {addJob,runRefresh,statement,getProfile,feedSignature} from '../src/refresh.mjs';
import {openDatabase} from '../scripts/sqlite.mjs';
const migration=await fs.readFile(new URL('../migrations/0001_initial.sql',import.meta.url),'utf8');
const json=o=>new Response(JSON.stringify(o),{headers:{'content-type':'application/json'}});
function fresh(){const db=openDatabase(':memory:');db.exec(migration);db.exec(`INSERT INTO metadata VALUES ('initialized','test'),('feeds','${feedSignature()}')`);return db;}
// Runs the refresh until the job has published (each run gives a source only its share of pages).
async function until(db,id,env,max=30){for(let i=0;i<max;i++){await runRefresh({DB:db,...env},{steps:40});const j=await statement(db,'SELECT status,cursor FROM jobs WHERE id=?',id).first();if(j.status==='ready'&&!j.cursor)return;if(j.status==='error')throw new Error((await statement(db,'SELECT error FROM jobs WHERE id=?',id).first()).error);}throw new Error('job did not finish');}
const snap=async(db,id)=>JSON.parse((await statement(db,'SELECT payload FROM snapshots WHERE job_id=?',id).first()).payload);
const due=async(db,id)=>(await statement(db,'SELECT next_due FROM jobs WHERE id=?',id).first()).next_due;
const now=new Date().getUTCFullYear();

test('history settings: 2016 on, years that ended, election cycles, and lists kept by year',()=>{
  assert.equal(SINCE(config),2016);assert.equal(config.historyFrom,2016);
  assert.deepEqual(yearsFrom(2016,2019),[2016,2017,2018,2019]);
  assert.deepEqual(cyclesFrom(2015,2020),[2016,2018,2020]);
  assert.ok(ended(2024,new Date('2026-01-10')));assert.ok(!ended(2025,new Date('2026-01-10')),'last year stays open until March, for late filings');
  assert.ok(ended(2025,new Date('2026-03-01')));assert.ok(!ended(2026,new Date('2026-12-31')));
  const rows=[...Array.from({length:50},(_,i)=>({id:'a'+i,date:`2017-01-${String(i%28+1).padStart(2,'0')}`})),{id:'b',date:'2026-05-01'}];
  const h=history(rows,40);
  assert.equal(h.count,51);assert.equal(h.rows.length,41);assert.deepEqual(h.byYear,{2017:50,2026:1});assert.equal(h.rows[0].id,'b','newest first');
});

test('the Record\'s daily metadata file: each section\'s speakers by Bioguide ID, the Daily Digest left out',()=>{
  const xml=`<?xml version="1.0" encoding="UTF-8"?>
<mods xmlns="http://www.loc.gov/mods/v3" version="3.3">
  <titleInfo><title>Congressional Record, Volume 163 Issue 207</title></titleInfo>
  <relatedItem type="constituent" ID="id-CREC-2017-12-20-pt1-PgS8100">
    <titleInfo><title>TAX CUTS AND JOBS ACT</title></titleInfo>
    <extension>
      <granuleClass>SENATE</granuleClass>
      <searchTitle>TAX CUTS AND JOBS ACT; Congressional Record Vol. 163, No. 207</searchTitle>
      <congMember authorityId="1" bioGuideId="C001035" chamber="S" congress="115" party="R" role="SPEAKING" state="ME"><name type="parsed">Ms. COLLINS</name></congMember>
      <congMember bioGuideId="X000000" role="SPEAKING"><name type="parsed">Mr. NOBODY</name></congMember>
      <accessId>CREC-2017-12-20-pt1-PgS8100</accessId>
    </extension>
  </relatedItem>
  <relatedItem type="constituent" ID="id-CREC-2017-12-20-pt1-PgD1">
    <titleInfo><title>Daily Digest</title></titleInfo>
    <extension><granuleClass>DAILYDIGEST</granuleClass><congMember bioGuideId="C001035" role="SPEAKING"/><accessId>CREC-2017-12-20-pt1-PgD1</accessId></extension>
  </relatedItem>
  <relatedItem type="constituent" ID="id-CREC-2017-12-20-pt1-PgS8200">
    <titleInfo><title>MORNING BUSINESS</title></titleInfo>
    <extension><granuleClass>SENATE</granuleClass><congMember bioGuideId="C001035" role="PRESIDING"/><accessId>CREC-2017-12-20-pt1-PgS8200</accessId></extension>
  </relatedItem>
  <relatedItem type="constituent" ID="id-CREC-2017-12-20-pt1-PgE1700">
    <extension><granuleClass>EXTENSIONS</granuleClass><searchTitle>HONORING A CONSTITUENT; Congressional Record Vol. 163, No. 207</searchTitle>
      <congMember bioGuideId="P000605" role="SPEAKING"><name type="parsed">Mr. PERRY</name></congMember><accessId>CREC-2017-12-20-pt1-PgE1700</accessId></extension>
  </relatedItem>
</mods>`;
  const bios=new Map(config.people.filter(p=>p.bioguide).map(p=>[p.bioguide,p.id]));
  const rows=crecModsRows(parseXML(xml),'CREC-2017-12-20',bios);
  assert.deepEqual(rows.map(r=>[r.id,r.section,r.people.join(),r.title,r.date]),[
    ['CREC-2017-12-20-pt1-PgS8100','SENATE','collins','TAX CUTS AND JOBS ACT','2017-12-20'],
    ['CREC-2017-12-20-pt1-PgE1700','EXTENSIONS','perry','HONORING A CONSTITUENT','2017-12-20']],'presiding is not speaking; the title falls back to the search title');
  assert.equal(rows[0].url,'https://www.govinfo.gov/app/details/CREC-2017-12-20/CREC-2017-12-20-pt1-PgS8100');
  assert.throws(()=>crecModsRows(parseXML('<mods><titleInfo><title>x</title></titleInfo></mods>'),'CREC-2017-12-20',bios),/metadata missing/);
});

test('archives: every day of the Record and every hearing transcript from 2016 on become jobs, read once',async()=>{
  const db=fresh(),urls=[];
  await addJob(db,'crec-archive','crec-archive','Congress',{collection:'CREC'});
  await addJob(db,'hearing-archive','hearing-archive','Congress',{collection:'CHRG'});
  const env={GOVINFO_API_KEY:'g',fetch:async u=>{urls.push(String(u));
    if(/collection=CREC/.test(u))return json({packages:[{packageId:'CREC-2017-12-20',dateIssued:'2017-12-20'},{packageId:'CRECB-2017-pt1'}]});
    if(/collection=CHRG/.test(u))return json({packages:[{packageId:'CHRG-115shrg28000',dateIssued:'2018-01-05'}]});
    return new Response('missing',{status:404});}};
  await runRefresh({DB:db,...env},{steps:4});
  assert.match(urls.find(u=>/CREC/.test(u)),/^https:\/\/api\.govinfo\.gov\/published\/2016-01-01\/\d{4}-\d{2}-\d{2}\?collection=CREC&/);
  const day=await statement(db,"SELECT args FROM jobs WHERE id='crec-day:CREC-2017-12-20'").first();
  assert.deepEqual(JSON.parse(day.args),{pkg:'CREC-2017-12-20',whole:true},'an archived day is read from its metadata file');
  assert.ok(!(await statement(db,"SELECT id FROM jobs WHERE id LIKE 'crec-day:CRECB%'").first()),'the bound edition is left out');
  assert.ok(await statement(db,"SELECT id FROM jobs WHERE id='hearing:CHRG-115shrg28000'").first());
  assert.equal(FEEDS['crec-day'].every,Number.MAX_SAFE_INTEGER);
  db.close();
});

test('a year that has ended is read once and kept; only the open years are read again',async()=>{
  const db=fresh(),urls=[];
  await addJob(db,'wayback:talarico','wayback','talarico',{site:'https://jamestalarico.com',from:2025});
  const env={fetch:async u=>{urls.push(String(u));const y=new URL(String(u)).searchParams.get('from');
    return json([['timestamp','original','statuscode','digest'],[`${y}0301120000`,'https://jamestalarico.com/','200','D'+y]]);}};
  await until(db,'wayback:talarico',env);
  const years=yearsFrom(2016);
  assert.equal(urls.length,years.length,'one request a year back to 2016');
  let s=await snap(db,'wayback:talarico');
  assert.equal(s.count,years.length);assert.equal(s.first,'2016-03-01');assert.equal(s.byYear['2016'],1);
  urls.length=0;await statement(db,"UPDATE jobs SET next_due=0 WHERE id='wayback:talarico'").run();
  await until(db,'wayback:talarico',env);
  assert.equal(urls.length,years.filter(y=>!ended(y)).length,'the next run reads only the years still open');
  s=await snap(db,'wayback:talarico');assert.equal(s.count,years.length,'the ended years are carried over');
  db.close();
});

test('a newest-first list is read back to 2016 once, then only its newest page with the rest carried over',async()=>{
  const db=fresh();let calls=[];
  await addJob(db,'youtube:collins','youtube','collins',{channel:'UC6GYaBx5kT2r4PN8KENxC-w'});
  const page=(token,items,next)=>json({items:items.map(([id,date])=>({snippet:{title:id,publishedAt:date+'T00:00:00Z',resourceId:{videoId:id}}})),nextPageToken:next});
  let env={GOOGLE_API_KEY:'y',fetch:async u=>{u=String(u);calls.push(u);
    return /pageToken=p2/.test(u)?page('p2',[['old2017','2017-04-01'],['old2015','2015-06-01']],'p3'):page(null,[['new2026','2026-09-01']],'p2');}};
  await until(db,'youtube:collins',env);
  assert.equal(calls.length,2,'stops once a page reaches before 2016');
  let s=await snap(db,'youtube:collins');assert.deepEqual(s.rows.map(r=>r.id),['new2026','old2017','old2015']);
  calls=[];await statement(db,"UPDATE jobs SET next_due=0 WHERE id='youtube:collins'").run();
  env={...env,fetch:async u=>{calls.push(String(u));return page(null,[['newer','2026-10-20']],'p2');}};
  await until(db,'youtube:collins',env);
  assert.equal(calls.length,1,'the next run reads only the newest page');
  s=await snap(db,'youtube:collins');assert.deepEqual(s.rows.map(r=>r.id),['newer','new2026','old2017','old2015']);
  db.close();
});

test('CRS reports back to 2016: a report already read is kept, and later runs list only recent updates',async()=>{
  const db=fresh();let calls=[],listed=[{id:'R1'},{id:'R2'}];
  await addJob(db,'crs','crs','CRS',{});
  const env={CONGRESS_API_KEY:'c',fetch:async u=>{u=String(u);calls.push(u);
    if(/crsreport\?/.test(u))return json({CRSReports:listed});
    const id=/crsreport\/(\w+)/.exec(u)[1];
    return json({CRSReport:{id,title:'Report '+id,publishDate:'2017-05-01T00:00:00Z',relatedMaterials:id==='R2'?[{congress:115,type:'HR',number:1}]:[]}});}};
  await until(db,'crs',env);
  assert.match(calls[0],/fromDateTime=2016-01-01/);
  let s=await snap(db,'crs');assert.equal(s.count,2);assert.deepEqual(Object.keys(s.byBill),['115-hr-1']);assert.equal(s.more,false);
  calls=[];listed=[{id:'R3'},{id:'R1'},{id:'R2'}];await statement(db,"UPDATE jobs SET next_due=0 WHERE id='crs'").run();
  await until(db,'crs',env);
  assert.doesNotMatch(calls[0],/fromDateTime=2016-01-01/,'once complete, only reports updated since the last run');
  assert.deepEqual(calls.filter(u=>/crsreport\/R/.test(u)).map(u=>/crsreport\/(\w+)/.exec(u)[1]),['R3'],'only the new report is read');
  s=await snap(db,'crs');assert.equal(s.count,3);
  assert.ok(await due(db,'crs')>Date.now()+6*86400000,'checked weekly');
  db.close();
});

test('a backlog of trade reports is read 80 at a time, and the next batch runs minutes later',async()=>{
  const db=fresh();
  await addJob(db,'house-fd','house-fd','House',{year:2026});
  const filings=Array.from({length:81},(_,i)=>({id:String(90000+i),people:['perry'],ptr:true,filed:`2017-0${1+i%9}-10`,url:`https://disclosures-clerk.house.gov/public_disc/ptr-pdfs/2017/${90000+i}.pdf`}));
  await statement(db,"UPDATE jobs SET status='ready',published_run='r0',next_due=? WHERE id='house-fd'",Date.now()+86400000).run();
  await statement(db,'INSERT INTO snapshots(job_id,run_id,payload,updated_at) VALUES(?,?,?,?)','house-fd','r0',JSON.stringify({byPerson:{perry:filings}}),new Date().toISOString()).run();
  await addJob(db,'trades-house:perry','trades-house','perry',{});
  let opened=0;const env={fetch:async()=>{opened++;return new Response(new TextEncoder().encode('%PDF-1.4\nscanned'));}};
  await until(db,'trades-house:perry',env);
  let s=await snap(db,'trades-house:perry');
  assert.equal(opened,80);assert.equal(s.unread.length,80);assert.equal(s.more,true);assert.equal(s.backlog,1);
  const next=await due(db,'trades-house:perry');assert.ok(next<Date.now()+11*60_000&&next>Date.now()+5*60_000,'the next batch is due in about ten minutes');
  await statement(db,"UPDATE jobs SET next_due=0 WHERE id='trades-house:perry'").run();
  await until(db,'trades-house:perry',env);
  s=await snap(db,'trades-house:perry');assert.equal(opened,81,'only the report left is read');assert.equal(s.unread.length,81);assert.equal(s.more,undefined);
  db.close();
});

test('campaign money by cycle, lobbying by year and organization, and contracts from fiscal 2016',async()=>{
  const db=fresh(),urls=[];
  await addJob(db,'campaign-history:collins','campaign-history','collins',{committee:'C00314575'});
  const t=(cycle,extra={})=>({committee_id:'C00314575',cycle,coverage_start_date:`${cycle-1}-01-01T00:00:00`,coverage_end_date:`${cycle}-12-31T00:00:00`,receipts:1000*cycle,individual_contributions:5,other_political_committee_contributions:7,disbursements:9,last_cash_on_hand_end_period:3,...extra});
  await until(db,'campaign-history:collins',{FEC_API_KEY:'f',fetch:async u=>{urls.push(String(u));return json({results:[t(2026),t(2020,{coverage_end_date:null}),t(2016),t(2014)],pagination:{}});}});
  assert.doesNotMatch(urls[0],/cycle=/,'one request covers every cycle');
  assert.deepEqual((await snap(db,'campaign-history:collins')).cycles.map(c=>c.cycle),[2026,2016],'2014 is before 2016, and a cycle whose dates don\'t check out is left out');
  // Lobbying: each year back to 2016 for each organization.
  const lb=FEEDS.lobbying,job={id:'lobbying:x',cursor:null},seen=[];
  for(let i=0;i<40;i++){const r=await lb.page(job,{orgs:['ACME CORP','BIG BANK'],year:2026},{fetch:async u=>{seen.push(new URL(String(u)).searchParams.get('filing_year')+' '+new URL(String(u)).searchParams.get('client_name'));return json({results:[]});}},config);if(!r.next)break;job.cursor=r.next;}
  assert.equal(seen.length,yearsFrom(2016).length*2);assert.equal(seen[0],`${now} ACME CORP`,'newest year first');assert.equal(seen.at(-1),'2016 BIG BANK');
  // Contracts: from October 2015, the start of fiscal year 2016.
  let body;await FEEDS.contracts.page({cursor:null},{orgs:[{org:'ACME',uei:'U1'}],cycle:2026},{fetch:async(u,init)=>{body=JSON.parse(init.body);return json({results:[]});}},config);
  assert.deepEqual(body.filters.time_period,[{start_date:'2015-10-01',end_date:'2026-09-30'}]);
  db.close();
});

test('a profile reads only the days of the Record that name the person, and keeps 40 speeches a year',async()=>{
  const db=fresh();
  const put=async(id,kind,subject,payload)=>{await addJob(db,id,kind,subject,{});await statement(db,'INSERT INTO snapshots(job_id,run_id,payload,updated_at) VALUES(?,?,?,?)',id,'r',JSON.stringify(payload),'2026-10-20T00:00:00Z').run();};
  for(let i=0;i<45;i++)await put(`crec-day:d${i}`,'crec-day',`d${i}`,{byPerson:{collins:[{id:`g${i}`,title:'Speech',date:`2017-03-${String(i%28+1).padStart(2,'0')}`}]}});
  await put('crec-day:other','crec-day','other',{byPerson:{perry:[{id:'p1',title:'Not hers',date:'2026-01-01'}]}});
  const p=await getProfile({DB:db},'collins');
  assert.equal(p.sections['crec-day'].count,45);assert.equal(p.sections['crec-day'].rows.length,40);assert.deepEqual(p.sections['crec-day'].byYear,{2017:45});
  assert.ok(!p.sections['crec-day'].rows.some(r=>r.id==='p1'));
  db.close();
});
