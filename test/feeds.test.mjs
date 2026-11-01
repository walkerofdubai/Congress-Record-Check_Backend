// Representative responses for every source added with the overhaul, built from each source's published documentation.
// They check what each adapter keeps, what it refuses, and where its key goes. Live responses need your keys.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import zlib from 'node:zlib';
import config from '../data/config.json' with {type:'json'};
import {FEEDS,billsInText,committeeCode,isOrg,normalizeHouseApiVote,houseApiURL,namesPerson,namesCampaign} from '../src/feeds.mjs';
import {requestSource,missingKey,cleanURL,unzipFile,HOSTS,fetchPage} from '../src/sources.mjs';
import {mergeTrades,mergeStateBills,mergeNews,committeeDiff,stateBillKey} from '../src/merge.mjs';
import {initialize,runRefresh,getProfile,getStatus,statement,addJob} from '../src/refresh.mjs';
import {openDatabase} from '../scripts/sqlite.mjs';
import {feedSignature} from '../src/refresh.mjs';
const migration=await fs.readFile(new URL('../migrations/0001_initial.sql',import.meta.url),'utf8');
const json=o=>new Response(JSON.stringify(o),{headers:{'content-type':'application/json'}});
const person=id=>config.people.find(p=>p.id===id);
// Runs one adapter through all its pages against canned responses keyed by a URL pattern.
async function run(kind,subject,args,routes,env={}){
  const calls=[];
  const e={CONGRESS_API_KEY:'ck',FEC_API_KEY:'fk',GOVINFO_API_KEY:'gk',VOTESMART_API_KEY:'vk',OPENSTATES_API_KEY:'ok',LEGISCAN_API_KEY:'lk',EULERPOOL_API_KEY:'ek',FMP_API_KEY:'mk',
    COURTLISTENER_API_TOKEN:'ct',GOOGLE_API_KEY:'yk',NYT_API_KEY:'nk',REGULATIONS_API_KEY:'rk',SAM_API_KEY:'sk',SEC_USER_AGENT:'Test Person test@example.com',...env,
    fetch:async(u,init)=>{calls.push({url:String(u),init});for(const[re,body]of routes)if(re.test(String(u)))return typeof body==='function'?body(String(u),init):body instanceof Response?body.clone():json(body);return new Response('missing route',{status:404});}};
  const job={kind,subject,args:JSON.stringify(args),cursor:null,started_at:new Date().toISOString()};const rows=[];
  for(let i=0;i<50;i++){const r=await FEEDS[kind].page(job,args,e,config);rows.push(...r.rows);if(!r.next)break;job.cursor=r.next;}
  return {rows,snapshot:FEEDS[kind].summarize(rows,args,job,config),calls};
}

test('every approved host sends its key the documented way, and saved links never carry one',async()=>{
  const seen=[];const env={OPENSTATES_API_KEY:'os',COURTLISTENER_API_TOKEN:'cl',NYT_API_KEY:'ny',fetch:async(u,init)=>{seen.push({u:String(u),h:init.headers});return json({});}};
  await requestSource('https://v3.openstates.org/people?x=1',env);await requestSource('https://www.courtlistener.com/api/rest/v4/search/',env);await requestSource('https://api.nytimes.com/svc/x',env);
  assert.equal(seen[0].h['X-API-KEY'],'os');assert.ok(!seen[0].u.includes('os'));
  assert.equal(seen[1].h.Authorization,'Token cl');assert.match(seen[2].u,/api-key=ny/);
  await assert.rejects(requestSource('https://data.sec.gov/submissions/CIK0000320193.json',{fetch:async()=>json({})}),/SEC contact line/);
  assert.equal(missingKey('www.bargo.ai',{}),null,'Bargo works without a key at a lower limit');
  assert.equal(missingKey('api.govinfo.gov',{CONGRESS_API_KEY:'x'}),null,'GovInfo accepts the Congress.gov key');
  assert.equal(missingKey('api.eulerpool.com',{}),'Eulerpool');
  assert.equal(cleanURL('https://api.govinfo.gov/x?offsetMark=a&api_key=secret'),'https://api.govinfo.gov/x?offsetMark=a');
  for(const kind of Object.keys(FEEDS))assert.ok(HOSTS[FEEDS[kind].host],kind+' uses an approved host');
  await assert.rejects(requestSource('https://evil.example/x',env),/Unapproved/);
});

test('Congress.gov: sponsored bills leave out a senator\'s sponsored amendments',async()=>{
  const d={sponsoredLegislation:[{congress:119,type:'S',number:'7',title:'A bill',introducedDate:'2026-01-05',latestAction:{text:'Referred',actionDate:'2026-01-05'}},
    {amendmentNumber:'101',congress:119,type:'SAMDT',introducedDate:'2026-02-02'},{amendmentNumber:'102',congress:119,introducedDate:'2026-02-03'}],pagination:{count:3}};
  const job={kind:'legislation',args:JSON.stringify({bioguide:'C001035',congress:119,cycle:2026}),cursor:null,started_at:new Date().toISOString()};
  const r=await fetchPage(job,{CONGRESS_API_KEY:'ck',fetch:async()=>json(d)},config);
  assert.deepEqual(r.rows.map(x=>x.id),['119-S-7']);
});
test('Congress.gov: cosponsored bills, House votes, bill details, CRS reports and committee meetings',async()=>{
  const co=await run('cosponsored','collins',{bioguide:'C001035',congress:119,cycle:2026},[[/cosponsored-legislation/,{cosponsoredLegislation:[{congress:119,type:'S',number:'12',title:'A bill',introducedDate:'2026-02-01',latestAction:{text:'Referred',actionDate:'2026-02-01'}},{congress:118,type:'HR',number:'1',title:'Last Congress',introducedDate:'2024-01-01'},{congress:113,type:'S',number:'9',title:'Before 2015',introducedDate:'2013-02-01'},
    {amendmentNumber:'2360',congress:119,type:'SAMDT',introducedDate:'2026-03-01',latestAction:{text:'Submitted',actionDate:'2026-03-01'}}],pagination:{count:3}}]]);
  const cob=co.rows.filter(r=>r.measure);
  assert.deepEqual(cob.map(r=>r.bill),['119-s-12','118-hr-1'],'a cosponsored Senate amendment is left out, not a failed page; bills before the 114th Congress (2015-16) too');
  assert.match(co.calls[0].url,/api_key=ck/);assert.match(co.calls[0].url,/fromDateTime=2016-01-01/,'the first run reads back to historyFrom');
  assert.equal(co.snapshot.since,2016);assert.deepEqual(co.snapshot.bills,['119-s-12','118-hr-1']);assert.deepEqual(co.snapshot.byCongress,{119:1,118:1});
  const people=[{id:'perry',bioguide:'P000605'}];
  const v=normalizeHouseApiVote({houseRollCallVoteMemberVotes:{congress:119,sessionNumber:2,rollCallNumber:17,startDate:'2026-01-13T15:00:00-05:00',voteQuestion:'On Passage',result:'Passed',legislationType:'HR',legislationNumber:'55',results:[{bioguideID:'P000605',voteCast:'Aye'}]}},{chamber:'H',year:2026,number:17},people);
  assert.equal(v.positions.perry,'Aye');assert.equal(v.bill,'119-hr-55');assert.equal(houseApiURL({year:2026,number:17}),'https://api.congress.gov/v3/house-vote/119/2/17/members?format=json');
  assert.throws(()=>normalizeHouseApiVote({houseRollCallVoteMemberVotes:{congress:119,rollCallNumber:18,results:[{}]}},{year:2026,number:17},people),/identity/);
  const b=await run('bill','117-hr-5376',{bill:'117-hr-5376'},[
    [/summaries/,{summaries:[{actionDate:'2021-11-19',actionDesc:'Passed House',text:'<p>Old</p>',updateDate:'2021-11-20'},{actionDate:'2022-08-16',actionDesc:'Public Law',text:'<p>This act <b>reduces</b> drug prices.</p>',updateDate:'2022-08-20'}]}],
    [/amendments/,{amendments:[{type:'SAMDT',number:'5194',purpose:'In the nature of a substitute.'}]}],
    [/bill\/117\/hr\/5376\?/,{bill:{congress:117,type:'HR',number:'5376',title:'Inflation Reduction Act of 2022',introducedDate:'2021-09-27',cboCostEstimates:[{title:'Estimated budgetary effects',pubDate:'2022-08-03T00:00:00Z',url:'https://www.cbo.gov/publication/58366',description:'<p>Reduces deficits</p>'}],latestAction:{text:'Became Public Law No: 117-169.',actionDate:'2022-08-16'}}}]]);
  assert.equal(b.snapshot.title,'Inflation Reduction Act of 2022');assert.equal(b.snapshot.summary,'This act reduces drug prices.');assert.equal(b.snapshot.cbo[0].url,'https://www.cbo.gov/publication/58366');assert.equal(b.snapshot.amendments,1);
  await assert.rejects(run('bill','117-hr-1',{bill:'117-hr-1'},[[/bill\/117\/hr\/1\?/,{bill:{congress:117,type:'HR',number:'2',title:'x'}}]]),/identity/);
  const crs=await run('crs','CRS',{days:60},[[/crsreport\?/,{CRSReports:[{id:'R47202',title:'Tax Provisions in the Inflation Reduction Act'}]}],[/crsreport\/R47202/,{CRSReport:{id:'R47202',title:'Tax Provisions',publishDate:'2022-08-10T00:00:00Z',relatedMaterials:[{congress:117,type:'HR',number:5376}],formats:[{format:'PDF',url:'https://www.congress.gov/crs_external_products/R/PDF/R47202/R47202.pdf'}]}}]]);
  assert.deepEqual(Object.keys(crs.snapshot.byBill),['117-hr-5376']);
  const m=await run('meeting','115538',{chamber:'house',congress:119,event:'115538'},[[/committee-meeting/,{committeeMeeting:{eventId:115538,title:'Hearing on drug prices',date:'2026-03-24T13:00:00Z',chamber:'House',committees:[{systemCode:'hsif14'},{systemCode:'hsif00'}],witnesses:[{name:'A. Witness',organization:'Example Co.'}],hearingTranscript:[{jacketNumber:59876,url:'https://api.congress.gov/v3/hearing/119/house/59876'}],witnessDocuments:[{documentType:'Witness Statement',url:'https://www.congress.gov/119/meeting/house/115538/witnesses/x.pdf'}],meetingDocuments:[{documentType:'Support Document',url:'http://insecure.example/doc.pdf'}]}}]]);
  const row=m.rows[0];assert.deepEqual(row.committees,['HSIF14','HSIF']);assert.equal(row.documents.length,1,'non-https documents are dropped');
  assert.deepEqual(row.transcripts,['59876'],'the transcript it points to, by jacket number');
  for(const id of row.people)assert.ok((await import('../public/committees.json',{with:{type:'json'}})).default.people[id].some(c=>c.id.startsWith('HSIF')));
});

test('GovInfo: Record issues become day jobs, and speeches are matched to members by Bioguide ID',async()=>{
  const idx=await run('crec-index','Congress',{collection:'CREC',days:14},[[/collections\/CREC/,{packages:[{packageId:'CREC-2026-10-01',dateIssued:'2026-10-01'},{packageId:'FR-2026-10-01'}]}]]);
  assert.deepEqual(idx.snapshot.packages,['CREC-2026-10-01']);
  const day=await run('crec-day','CREC-2026-10-01',{pkg:'CREC-2026-10-01'},[
    [/granules\?/,{granules:[{granuleId:'CREC-2026-10-01-pt1-PgS100',granuleClass:'SENATE'},{granuleId:'CREC-2026-10-01-pt1-PgD1',granuleClass:'DAILYDIGEST'},{granuleId:'CREC-2026-10-01-pt1-PgH5',granuleClass:'HOUSE'}]}],
    [/PgS100\/summary/,{granuleId:'CREC-2026-10-01-pt1-PgS100',title:'HEALTH CARE',dateIssued:'2026-10-01',granuleClass:'SENATE',members:[{bioGuideId:'C001035',role:'SPEAKING'},{bioGuideId:'X000000',role:'SPEAKING'}]}],
    [/PgH5\/summary/,{granuleId:'CREC-2026-10-01-pt1-PgH5',title:'TAXES',members:[{bioGuideId:'Z999999'}]}]]);
  assert.equal(day.calls.length,3,'the Daily Digest is skipped');assert.deepEqual(Object.keys(day.snapshot.byPerson),['collins']);
  const h=await run('hearing','CHRG-119hhrg59876',{pkg:'CHRG-119hhrg59876'},[[/CHRG-119hhrg59876\/summary/,{packageId:'CHRG-119hhrg59876',title:'HEARING ON DRUG PRICES',dateIssued:'2026-09-01',heldDates:['2026-03-24'],committees:[{committeeName:'Energy and Commerce'}],members:[{bioGuideId:'C001035'}]}]]);
  assert.deepEqual([h.rows[0].date,h.rows[0].held],['2026-09-01','2026-03-24'],'published months after the day it was held');
});

test('Vote Smart, Bluesky, Wayback, fact-checks, YouTube and news',async()=>{
  const vs=await run('votesmart','collins',{candidate:'379'},[[/Rating\.getCandidateRating/,{candidateRating:{rating:[{ratingId:1,ratingName:'League of Conservation Voters',rating:'63',timespan:'2024'}]}}],[/Npat\.getNpat/,{npat:{passed:'N'}}]]);
  assert.equal(vs.snapshot.ratings[0].group,'League of Conservation Voters');assert.equal(vs.snapshot.npat.took,'no');assert.match(vs.calls[0].url,/key=vk/);
  const bs=await run('bluesky','x',{handles:['someone.bsky.social']},[[/getAuthorFeed/,{feed:[{post:{uri:'at://did:plc:a/app.bsky.feed.post/3k',author:{handle:'someone.bsky.social'},record:{text:'Hello',createdAt:'2026-10-01T00:00:00Z',embed:{external:{uri:'https://www.collins.senate.gov/newsroom/press/release-1'}},facets:[{features:[{uri:'http://insecure.example/x'}]}]}}},{post:{uri:'at://x/y/z',author:{handle:'other.bsky.social'},record:{text:'Repost'}}}]}]]);
  assert.equal(bs.rows.length,1);assert.equal(bs.rows[0].url,'https://bsky.app/profile/someone.bsky.social/post/3k');
  assert.deepEqual(bs.rows[0].links,['https://www.collins.senate.gov/newsroom/press/release-1'],'links in the post are kept, https only');
  const wb=await run('wayback','talarico',{site:'https://jamestalarico.com',from:2025},[[/cdx/,[['timestamp','original','statuscode','digest'],['20250301120000','https://jamestalarico.com/','200','AAA'],['20260101120000','https://jamestalarico.com/','200','BBB']]]]);
  assert.equal(wb.snapshot.count,2);assert.equal(wb.snapshot.first,'2025-03-01');
  await assert.rejects(run('wayback','x',{site:'https://a.com',from:2025},[[/cdx/,[['other']]]]),/columns/);
  const fc=await run('factcheck','collins',{name:'Susan M. Collins'},[[/claims:search/,{claims:[{text:'Susan Collins said X',claimant:'Susan Collins',claimReview:[{url:'https://www.politifact.com/x',publisher:{name:'PolitiFact'},textualRating:'False',reviewDate:'2026-05-01T00:00:00Z'}]},{text:'Unrelated',claimant:'Someone Else',claimReview:[{url:'https://example.org/y'}]}]}]]);
  assert.equal(fc.rows.length,1);assert.equal(fc.rows[0].rating,'False');
  const yt=await run('youtube','collins',{channel:'UC6GYaBx5kT2r4PN8KENxC-w'},[[/playlistItems/,u=>{assert.match(u,/playlistId=UU6GYaBx5kT2r4PN8KENxC-w/);return json({items:[{snippet:{title:'Floor speech',publishedAt:'2026-09-01T00:00:00Z',resourceId:{videoId:'abc123'}}}]});}]]);
  assert.equal(yt.rows[0].url,'https://www.youtube.com/watch?v=abc123');
  const g=await run('news-gdelt','collins',{name:'Susan M. Collins'},[[/gdeltproject/,{articles:[{url:'https://www.example.com/a?utm=1',title:'Collins votes',seendate:'20261020T143000Z',domain:'example.com'}]}]]);
  assert.equal(g.rows[0].date,'2026-10-20');
  await assert.rejects(run('news-gdelt','collins',{name:'x'},[[/gdeltproject/,new Response('Your query was too short')]]),/GDELT returned an error/);
  const n=await run('news-nyt','collins',{name:'Susan M. Collins'},[[/nytimes/,u=>json({status:'OK',response:{docs:/begin_date=20260101&end_date=20261231/.test(u)?[{web_url:'https://example.com/a',headline:{main:'Times story'},pub_date:'2026-10-21T00:00:00Z'}]:[]}})]]);
  assert.equal(n.calls.length,new Date().getUTCFullYear()-2016+1,'one search for each year back to 2016');
  const merged=mergeNews(g.rows,n.snapshot.rows);assert.equal(merged.length,1);assert.deepEqual(merged[0].sources,['GDELT','New York Times']);assert.equal(merged[0].date,'2026-10-20');
});

test('state records from Open States and LegiScan merge by state, session year and bill number',async()=>{
  const os=await run('state-openstates','talarico',{state:'tx',name:'James Talarico',openstates:null},[
    [/\/people\?/,{results:[{id:'ocd-person/abc',name:'James Talarico'}],pagination:{max_page:1}}],
    [/\/bills\?/,{results:[{id:'ocd-bill/1',identifier:'HB 1',session:'89',title:'School funding',openstates_url:'https://openstates.org/tx/bills/89/HB1/',latest_action_date:'2025-05-01',sponsorships:[{person:{id:'ocd-person/abc'},primary:true}],votes:[{start_date:'2025-04-01',motion_text:'passage',result:'pass',votes:[{option:'yes',voter:{id:'ocd-person/abc'}}]}]}],pagination:{max_page:1}}]]);
  assert.equal(os.rows[0].role,'sponsor');assert.equal(os.rows[0].votes[0].option,'yes');assert.equal(os.calls[0].init.headers['X-API-KEY'],'ok');
  await assert.rejects(run('state-openstates','x',{state:'tx',name:'Same Name'},[[/\/people\?/,{results:[{id:'ocd-person/1'},{id:'ocd-person/2'}]}]]),/Several Open States people/);
  const ls=await run('state-legiscan','talarico',{state:'TX',first:'James',last:'Talarico',legiscan:null},[
    [/getSessionList/,{status:'OK',sessions:[{session_id:2100,year_start:2025,special:0},{session_id:2000,year_start:2023,special:0}]}],
    [/getSessionPeople/,{status:'OK',sessionpeople:{people:[{people_id:77,first_name:'James',last_name:'Talarico'}]}}],
    [/getSponsoredList/,{status:'OK',sponsoredbills:{sessions:[{session_id:2100,session_name:'89th Legislature',year_start:2025}],bills:[{bill_id:5,session_id:2100,number:'HB1'},{bill_id:6,session_id:2100,number:'HB0042'}]}}]]);
  assert.equal(ls.rows[0].url,'https://legiscan.com/TX/bill/HB1/2025');
  assert.equal(ls.snapshot.person,77,'the LegiScan ID found is saved with the snapshot');
  assert.equal(ls.snapshot.rows.some(r=>r.id==='ls-person'),false);
  // A later check uses the saved ID: one query, no session or people lookups.
  const saved=JSON.stringify({rows:[],person:77}),db={prepare:()=>({bind:()=>({first:async()=>({payload:saved})})})};
  const again=await run('state-legiscan','talarico',{state:'TX',first:'James',last:'Talarico',legiscan:null},[
    [/getSponsoredList&id=77/,{status:'OK',sponsoredbills:{sessions:[{session_id:2100,session_name:'89th Legislature',year_start:2025}],bills:[{bill_id:5,session_id:2100,number:'HB1'}]}}]],{DB:db});
  assert.equal(again.calls.length,1);assert.equal(again.snapshot.person,77);assert.equal(again.snapshot.count,1);
  // A saved ID LegiScan no longer accepts is dropped, and the person is looked up again.
  const stale=await run('state-legiscan','talarico',{state:'TX',first:'James',last:'Talarico',legiscan:null},[
    [/getSponsoredList&id=77/,{status:'ERROR',alert:{message:'Unknown people_id'}}],
    [/getSessionList/,{status:'OK',sessions:[{session_id:2100,year_start:2025,special:0}]}],
    [/getSessionPeople/,{status:'OK',sessionpeople:{people:[{people_id:88,first_name:'James',last_name:'Talarico'}]}}],
    [/getSponsoredList&id=88/,{status:'OK',sponsoredbills:{sessions:[],bills:[]}}]],{DB:db});
  assert.equal(stale.snapshot.person,88);
  const os2={...os.rows[0],year:'2025'};
  const m=mergeStateBills([os2],ls.snapshot.rows);assert.equal(m.length,2);assert.deepEqual(m.find(b=>b.identifier==='HB 1').sources,['Open States','LegiScan']);
  assert.equal(stateBillKey({state:'TX',year:2025,identifier:'HB 0042'}),stateBillKey({state:'TX',session:'2025 Regular',identifier:'HB42'}));
});

test('stock trades from three services merge into one row, matched to the official House filing',async()=>{
  const p=person('perry');
  const bg=await run('trades-bargo','perry',{last:'Perry',first:'Scott',chamber:'H',state:'PA'},[[/bargo/,{trades:[
    {member:'Scott Perry',state:'PA10',ticker:'nvda',asset:'NVIDIA Corp',type:'purchase',amount_low:1001,amount_high:15000,amount_range:'$1,001 - $15,000',transaction_date:'2026-01-05',disclosure_date:'2026-03-02'},
    {member:'Rick Perry',state:'TX',ticker:'XOM',type:'sale',transaction_date:'2026-01-06'}]}]]);
  assert.equal(bg.rows.length,1,'a different Perry from another state is left out');
  const eu=await run('trades-eulerpool','perry',{name:p.name,last:'Perry',first:'Scott',chamber:'H'},[[/eulerpool/,{data:[{politician:'Scott Perry',chamber:'House',ticker:'NVDA',type:'Purchase',amountMin:1001,amountMax:15000,transactionDate:'2026-01-05',disclosureDate:'2026-03-02'}]}]]);
  assert.equal(eu.calls[0].init.headers.Authorization,'Bearer ek');
  const fm=await run('trades-fmp','perry',{last:'Perry',first:'Scott',chamber:'H',state:'PA'},[[/financialmodelingprep/,[{firstName:'Scott',lastName:'Perry',district:'PA10',symbol:'NVDA',type:'Purchase',amount:'$1,001 - $15,000',transactionDate:'2026-01-05',disclosureDate:'2026-03-03',owner:'Spouse',assetDescription:'NVIDIA Corporation'},{firstName:'Scott',lastName:'Perry',district:'PA10',symbol:'AAPL',type:'Sale (Partial)',amount:'$15,001 - $50,000',transactionDate:'2026-02-01',disclosureDate:'2026-02-20'}]]]);
  const filings=[{id:'20031111',ptr:true,filed:'2026-03-02',url:'https://disclosures-clerk.house.gov/public_disc/ptr-pdfs/2026/20031111.pdf'}];
  const t=mergeTrades([bg.rows,eu.rows,fm.rows],filings,{NVDA:{sector:'Technology',industry:'Semiconductors'}});
  assert.equal(t.length,2);const nv=t.find(x=>x.ticker==='NVDA');
  assert.deepEqual(nv.sources,['Bargo','Eulerpool','Financial Modeling Prep']);assert.equal(nv.filed,'2026-03-02');assert.equal(nv.official.doc,'20031111');
  assert.equal(nv.sector,'Technology');assert.equal(nv.owner,'spouse');assert.ok(nv.review.some(r=>/different disclosure dates/.test(r)));
  assert.equal(t.find(x=>x.ticker==='AAPL').type,'sale');
  const odd=mergeTrades([[{...bg.rows[0]}],[{...fm.rows[0],low:15001,high:50000,id:'x#1'}]]);assert.ok(odd.every(x=>x.review.includes('Services disagree on the amount range')));
});

test('the House Clerk disclosure index is read from its ZIP file and matched to House members',async()=>{
  const xml=`<?xml version="1.0"?><FinancialDisclosure><Member><Last>Perry</Last><First>Scott</First><FilingType>P</FilingType><StateDst>PA10</StateDst><Year>2026</Year><FilingDate>3/2/2026</FilingDate><DocID>20031111</DocID></Member><Member><Last>Perry</Last><First>Other</First><FilingType>P</FilingType><StateDst>TX01</StateDst><Year>2026</Year><FilingDate>3/2/2026</FilingDate><DocID>20031112</DocID></Member></FinancialDisclosure>`;
  const data=zlib.deflateRawSync(Buffer.from(xml)),name=Buffer.from('2026FD.xml');
  const local=Buffer.alloc(30);local.writeUInt32LE(0x04034b50,0);local.writeUInt16LE(8,8);local.writeUInt32LE(data.length,18);local.writeUInt32LE(xml.length,22);local.writeUInt16LE(name.length,26);
  const central=Buffer.alloc(46);central.writeUInt32LE(0x02014b50,0);central.writeUInt16LE(8,10);central.writeUInt32LE(data.length,20);central.writeUInt32LE(xml.length,24);central.writeUInt16LE(name.length,28);central.writeUInt32LE(0,42);
  const cdStart=30+name.length+data.length,end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50,0);end.writeUInt16LE(1,8);end.writeUInt16LE(1,10);end.writeUInt32LE(46+name.length,12);end.writeUInt32LE(cdStart,16);
  const zip=Buffer.concat([local,name,data,central,name,end]);
  assert.equal(await unzipFile(new Uint8Array(zip),/^2026FD\.xml$/),xml);
  const r=await run('house-fd','House',{year:2026},[[/2026FD\.zip/,new Response(zip)]]);
  assert.deepEqual(Object.keys(r.snapshot.byPerson),['perry']);assert.equal(r.snapshot.byPerson.perry[0].filed,'2026-03-02');
  assert.equal(r.snapshot.byPerson.perry[0].url,'https://disclosures-clerk.house.gov/public_disc/ptr-pdfs/2026/20031111.pdf');
});

test('ethics leads: court records, FEC enforcement and DOJ releases stay leads and must name the person',async()=>{
  const c=await run('courts','collins',{name:'Susan M. Collins'},[[/type=r/,{results:[{caseName:'United States v. Example',docket_id:9,docketNumber:'1:26-cv-1',court:'D. Me.',dateFiled:'2026-02-01',docket_absolute_url:'/docket/9/example/'}]}],[/type=o/,{results:[]}]]);
  assert.equal(c.rows[0].url,'https://www.courtlistener.com/docket/9/example/');assert.equal(c.calls[0].init.headers.Authorization,'Token ct');
  const f=await run('fec-legal','collins',{name:'Susan M. Collins',committee:'C00314575'},[[/legal\/search/,{murs:[{no:'8000',name:'Collins for Senator',respondents:['Collins for Senator'],open_date:'2024-01-01',close_date:'2025-01-01'},{no:'8001',name:'Unrelated PAC',respondents:['Someone']}],admin_fines:[{no:'4000',name:'Other committee',committee_id:'C00314575'}]}]]);
  assert.deepEqual(f.rows.map(r=>r.id),['mur-8000','af-4000']);
  const d=await run('doj','collins',{last:'Collins'},[[/press_releases/,{results:[{uuid:'u1',title:'Statement',body:'Senator Susan Collins announced the plea in case 1:25-cr-00042-ABC',url:'https://www.justice.gov/opa/pr/x',date:'1767225600'},{uuid:'u2',title:'Man named Collins sentenced',body:'John Collins was sentenced',url:'https://www.justice.gov/opa/pr/y'}]}]]);
  assert.equal(d.snapshot.rows.length,1);assert.equal(d.snapshot.rows[0].date,'2026-01-01');assert.deepEqual(d.snapshot.rows[0].dockets,['25-cr-42']);
  assert.ok(namesPerson('Sen. Susan Collins',person('collins')));assert.ok(!namesPerson('Mike Collins',person('collins')));
  assert.ok(namesCampaign('Collins for Senator',person('collins')));assert.ok(namesCampaign('Friends of Susan Collins',person('collins')));assert.ok(!namesCampaign('Collins Aerospace PAC',person('collins')));
});

test('money: donor organizations by employer, monthly totals, lobbying, rule comments, contracts and nonprofits',async()=>{
  const dn=await run('donors','collins',{committee:'C00314575',cycle:2026},[[/by_employer/,{results:[{employer:'RETIRED',total:90000,count:300,committee_id:'C00314575'},{employer:'ACME CORP',total:12000,count:20,committee_id:'C00314575'},{employer:'BIG BANK',total:8000,count:9,committee_id:'C00314575'}]}]]);
  assert.deepEqual(dn.snapshot.orgs.map(o=>o.employer),['ACME CORP','BIG BANK']);
  assert.deepEqual(Object.keys(dn.snapshot.cycles),['2016','2018','2020','2022','2024'],'the earlier cycles back to 2016');assert.ok(!isOrg('Self-Employed'));assert.ok(isOrg('Acme Corp'));
  const mo=await run('donor-months','collins',{committee:'C00314575',cycle:2026,orgs:['ACME CORP']},[[/schedule_a/,u=>{assert.match(u,/contributor_employer=ACME\+CORP|contributor_employer=ACME%20CORP/);if(!/two_year_transaction_period=2026/.test(u))return json({results:[],pagination:{}});return new Response('{"results":[{"sub_id":4010120269999999999,"committee_id":"C00314575","contributor_name":"DOE, JANE","contributor_employer":"Acme Corp","contribution_receipt_date":"2026-03-04","contribution_receipt_amount":500},{"sub_id":2,"committee_id":"C00314575","contributor_employer":"ACME CORP","contribution_receipt_date":"2026-03-20","contribution_receipt_amount":250}],"pagination":{}}');}]]);
  assert.deepEqual(mo.snapshot.months,{'ACME CORP':{'2026-03':750}});
  assert.deepEqual(mo.calls.map(c=>new URL(c.url).searchParams.get('two_year_transaction_period')),['2016','2018','2020','2022','2024','2026'],'each cycle back to 2016');assert.ok(!JSON.stringify(mo.rows).includes('DOE'),'donor names are never kept');
  const lb=await run('lobbying','collins',{orgs:['ACME CORP'],year:2026},[[/lda\.gov/,{results:[{filing_uuid:'f1',filing_year:2026,filing_period_display:'1st Quarter',income:'50000.00',registrant:{name:'K Street LLC'},client:{name:'ACME CORP'},filing_document_url:'https://lda.gov/filings/public/filing/f1/print/',lobbying_activities:[{general_issue_code_display:'Taxation/Internal Revenue Code',description:'H.R. 1, One Big Beautiful Bill Act; S.1234; issues re U.S. 50 rules'}]}]}]]);
  assert.deepEqual(lb.rows[0].bills,['119-hr-1','119-s-1234']);assert.equal(lb.rows[0].amount,50000);
  assert.deepEqual(billsInText('H.J.Res. 7 and H. Con. Res. 14 and S 99',119),['119-hjres-7','119-hconres-14','119-s-99']);
  const rg=await run('regulations','collins',{orgs:['ACME CORP']},[[/regulations\.gov/,{data:[{id:'EPA-HQ-2026-0001-0002',type:'comments',attributes:{title:'Comment from Acme',postedDate:'2026-04-01T00:00:00Z',agencyId:'EPA'}}]}]]);
  assert.equal(rg.rows[0].url,'https://www.regulations.gov/comment/EPA-HQ-2026-0001-0002');
  const sm=await run('sam','collins',{orgs:['ACME CORP','BIG BANK']},[[/legalBusinessName=ACME/,{totalRecords:1,entityData:[{entityRegistration:{ueiSAM:'ABC123DEF456',legalBusinessName:'Acme Corp.'}}]}],[/legalBusinessName=BIG/,{totalRecords:2,entityData:[{entityRegistration:{ueiSAM:'A1',legalBusinessName:'Big Bank NA'}},{entityRegistration:{ueiSAM:'A2',legalBusinessName:'Big Bank Holdings'}}]}]]);
  assert.equal(sm.rows[0].uei,'ABC123DEF456');assert.equal(sm.rows[1].uei,null);assert.match(sm.rows[1].review,/2 possible/);
  const ct=await run('contracts','collins',{orgs:[{org:'ACME CORP',uei:'ABC123DEF456'}],cycle:2026},[[/usaspending/,(u,init)=>{assert.equal(init.method,'POST');assert.deepEqual(JSON.parse(init.body).filters.recipient_search_text,['ABC123DEF456']);return json({results:[{'Award ID':'W91','Award Amount':1250000,'Awarding Agency':'Department of Defense','Start Date':'2025-11-01',generated_internal_id:'CONT_AWD_W91'}]});}]]);
  assert.equal(ct.snapshot.total,1250000);
  const ng=await run('outside-groups','collins',{groups:['Example Action Fund','Some Super PAC']},[[/search\.json\?q=%22Example/,{organizations:[{ein:123456789,name:'Example Action Fund'}]}],[/organizations\/123456789/,{organization:{ein:123456789,name:'Example Action Fund',subsection_code:4},filings_with_data:[{tax_prd_yr:2024,totrevenue:5000000,pdf_url:'https://projects.propublica.org/x.pdf'}]}],[/search\.json\?q=%22Some/,{organizations:[]}]]);
  assert.equal(ng.rows[0].subsection,4);assert.match(ng.rows[1].review,/527/);
});

test('official committee lists and SEC industry codes',async()=>{
  assert.equal(committeeCode('AG00'),'HSAG');assert.equal(committeeCode('AG15'),'HSAG15');assert.equal(committeeCode('IG00'),'HLIG');assert.equal(committeeCode('SSAP00'),'SSAP');assert.equal(committeeCode('hsii24'),'HSII24');
  const h=await run('house-committees','House',{},[[/MemberData/,new Response('<MemberData><members><member><member-info><bioguideID>P000605</bioguideID></member-info><committee-assignments><committee comcode="FA00" rank="5"/><subcommittee subcomcode="FA13" rank="2"/></committee-assignments></member></members></MemberData>')]]);
  assert.deepEqual(h.snapshot.byPerson.perry.map(c=>c.id),['HSFA','HSFA13']);
  assert.deepEqual(committeeDiff([{id:'HSFA'}],[{id:'HSFA'},{id:'HSGO'}]),{added:[],removed:['HSGO']});
  const s=await run('senate-committees','Senate',{},[[/cvc_member_data/,new Response('<senators><senator lis_member_id="S252"><committees><committee code="SSAP00">Appropriations</committee><committee code="SSAP02">Defense</committee></committees></senator></senators>')]]);
  assert.deepEqual(s.snapshot.byPerson.collins.map(c=>c.id),['SSAP','SSAP02']);
});

test('new sources join an existing database once, wait for their keys, and chain their follow-up jobs',async()=>{
  const db=openDatabase(':memory:');db.exec(migration);db.exec("INSERT INTO metadata VALUES ('initialized','old database')");
  await initialize(db);
  const kinds=new Set((await statement(db,'SELECT DISTINCT kind FROM jobs').all()).results.map(r=>r.kind));
  for(const k of ['cosponsored','donors','trades-bargo','courts','news-gdelt','house-fd','crec-index','state-openstates'])assert.ok(kinds.has(k),k);
  assert.equal((await statement(db,"SELECT value FROM metadata WHERE key='feeds'").first()).value,feedSignature());
  const status=await getStatus({DB:db});
  assert.equal(status.jobs.find(j=>j.id==='courts:collins').error,'CourtListener API key needed');
  assert.equal(status.jobs.find(j=>j.id==='trades-bargo:collins').error,null,'Bargo runs without a key');
  // Website updates lists the websites read directly; API updates lists the rest. House roll calls from 2023 on move to
  // the API page once the Congress.gov key is set, since they come from its API then.
  await addJob(db,'vote:H:2024:5','vote','h-2024-5',{chamber:'H',year:2024,number:5});
  await addJob(db,'vote:H:2022:5','vote','h-2022-5',{chamber:'H',year:2022,number:5});
  const site=(s,id)=>s.jobs.find(j=>j.id===id).site,plain=await getStatus({DB:db});
  for(const id of ['house-fd','trades-house:perry','house-committees','vote:H:2024:5','vote:H:2022:5'])assert.equal(site(plain,id),true,id);
  for(const id of ['courts:collins','trades-bargo:collins','donors:collins'])assert.equal(site(plain,id),false,id);
  const keyed=await getStatus({DB:db,CONGRESS_API_KEY:'k'});
  assert.equal(site(keyed,'vote:H:2024:5'),false);assert.equal(site(keyed,'vote:H:2022:5'),true);
  // Finishing the donors job fills in the organizations for the jobs that depend on it.
  await statement(db,"UPDATE jobs SET next_due=? WHERE id!='donors:collins'",Date.now()+DAYMS).run();
  await statement(db,"UPDATE jobs SET next_due=0 WHERE id='donors:collins'").run();
  // One page for each election cycle back to 2016.
  await runRefresh({DB:db,FEC_API_KEY:'k',fetch:async()=>json({results:[{employer:'ACME CORP',total:100,count:1,committee_id:'C00314575'}]})},{steps:6});
  const lob=await statement(db,"SELECT args,next_due FROM jobs WHERE id='lobbying:collins'").first();
  assert.deepEqual(JSON.parse(lob.args).orgs,['ACME CORP']);assert.equal(lob.next_due,0);
  db.close();
});
const DAYMS=86400000;

test('a profile merges each person\'s records from every source',async()=>{
  const db=openDatabase(':memory:');db.exec(migration);db.exec(`INSERT INTO metadata VALUES ('initialized','x'),('feeds','${feedSignature()}')`);
  const put=async(id,kind,subject,payload)=>{await addJob(db,id,kind,subject,{});await statement(db,'INSERT INTO snapshots(job_id,run_id,payload,updated_at) VALUES(?,?,?,?)',id,'r',JSON.stringify(payload),'2026-10-20T00:00:00Z').run();};
  const t={traded:'2026-01-05',ticker:'NVDA',type:'purchase',low:1001,high:15000,disclosed:'2026-03-02',id:'2026-01-05|NVDA|purchase|1001|15000#1'};
  await put('trades-bargo:perry','trades-bargo','perry',{rows:[{...t,source:'Bargo'}]});
  await put('trades-fmp:perry','trades-fmp','perry',{rows:[{...t,source:'Financial Modeling Prep'}]});
  await put('house-fd','house-fd','House',{byPerson:{perry:[{id:'1',ptr:true,filed:'2026-03-02',url:'https://disclosures-clerk.house.gov/x.pdf'}]}});
  await put('sec-sic','sec-sic','SEC',{byTicker:{NVDA:{sector:'Technology'}}});
  await put('crec-day:a','crec-day','a',{byPerson:{perry:[{id:'g1',title:'Speech',date:'2026-10-01'}]}});
  await put('crec-day:b','crec-day','b',{byPerson:{perry:[{id:'g2',title:'Speech 2',date:'2026-10-02'}]}});
  await put('house-committees','house-committees','House',{byPerson:{perry:[{id:'HSFA'}]}});
  const p=await getProfile({DB:db},'perry');
  assert.equal(p.merged.trades.length,1);assert.equal(p.merged.trades[0].sector,'Technology');assert.equal(p.merged.trades[0].official.doc,'1');
  assert.deepEqual(p.sections['crec-day'].rows.map(r=>r.id),['g2','g1']);
  assert.ok(p.merged.committees.removed.length>0,'differences from the reviewed committee list are reported');
  db.close();
});

test('lobbying on a key bill: reports in the two years of its Congress, unions counted by name, and a search that ignored the bill fails',async()=>{
  const filing=(id,client,desc,year)=>({filing_uuid:id,filing_year:year,client:{name:client},registrant:{name:'K Street LLC'},filing_document_url:`https://lda.gov/filings/public/filing/${id}/print/`,lobbying_activities:[{description:desc}]});
  const routes=[[/filing_year=2021/,u=>json({count:2,next:null,results:[filing('a','SERVICE EMPLOYEES INTERNATIONAL UNION','H.R.1319, American Rescue Plan',2021),filing('b','ACME CORP','HR 1319 relief provisions',2021)]})],
    [/filing_year=2022/,json({count:1,next:null,results:[filing('c','Credit Union National Association','H.R. 1319 implementation',2022)]})]];
  const r=await run('bill-lobbying','117-hr-1319',{bill:'117-hr-1319'},routes);
  assert.ok(r.calls.every(c=>new URL(c.url).searchParams.get('filing_specific_lobbying_issues')==='H.R. 1319'));
  assert.deepEqual(r.calls.map(c=>new URL(c.url).searchParams.get('filing_year')),['2021','2022'],'the two years of the 117th Congress');
  assert.deepEqual([r.snapshot.total,r.snapshot.read,r.snapshot.unions,r.snapshot.others],[3,3,1,2]);
  assert.deepEqual(r.snapshot.unionClients,['SERVICE EMPLOYEES INTERNATIONAL UNION'],'a credit union is not a labor union');
  const ignored=[[/lda\.gov/,json({count:900,next:null,results:[...Array(12)].map((_,i)=>filing('x'+i,'ACME CORP','Appropriations generally',2021))})]];
  await assert.rejects(run('bill-lobbying','117-hr-1319',{bill:'117-hr-1319'},ignored),/did not filter/);
});
