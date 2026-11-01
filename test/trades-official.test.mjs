// The official trade-report readers: the House Clerk's PDFs and the Senate eFD site. Responses are built from the
// reports' published formats; the live sites aren't reachable from the tests, so the first live run confirms them.
import test from 'node:test';
import assert from 'node:assert/strict';
import zlib from 'node:zlib';
import config from '../data/config.json' with {type:'json'};
import {FEEDS,housePtrTrades,efdTrades} from '../src/feeds.mjs';
import {requestSource,hostRule,addCookies,cookieHeader} from '../src/sources.mjs';
import {mergeTrades} from '../src/merge.mjs';
import {pdfText} from '../src/pdf.mjs';

// A small PDF: Helvetica (no ToUnicode), a two-byte font with a ToUnicode table (stored in an object stream when
// objStm is set), and one compressed content stream.
function makePdf(content,{objStm=false}={}){
  const cmapText=`/CIDInit /ProcSet findresource begin 12 dict begin begincmap
1 begincodespacerange <0000> <FFFF> endcodespacerange
2 beginbfchar <0048> <0048> <0049> <0069> endbfchar
1 beginbfrange <0050> <0052> <0041> endbfrange
endcmap CMapName currentdict /CMap defineresource pop end end`;
  const deflated=zlib.deflateSync(Buffer.from(content,'latin1')),parts=[],push=x=>parts.push(typeof x==='string'?Buffer.from(x,'latin1'):x);
  const helv='<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',cid='<< /Type /Font /Subtype /Type0 /BaseFont /X /Encoding /Identity-H /ToUnicode 7 0 R >>';
  push('%PDF-1.5\n1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj\n');
  push('3 0 obj << /Type /Page /Parent 2 0 R /Resources << /Font << /F1 4 0 R /F2 6 0 R >> >> /Contents 5 0 R >> endobj\n');
  if(!objStm)push(`4 0 obj ${helv} endobj\n6 0 obj ${cid} endobj\n`);
  else{const head=`4 0 6 ${helv.length+1} `,z=zlib.deflateSync(Buffer.from(head+helv+' '+cid,'latin1'));push(`8 0 obj << /Type /ObjStm /N 2 /First ${head.length} /Filter /FlateDecode /Length ${z.length} >> stream\n`);push(z);push('\nendstream endobj\n');}
  push(`5 0 obj << /Length ${deflated.length} /Filter /FlateDecode >> stream\n`);push(deflated);push('\nendstream endobj\n');
  push(`7 0 obj << /Length ${cmapText.length} >> stream\n${cmapText}\nendstream endobj\ntrailer << /Root 1 0 R >>\n%%EOF`);
  return new Uint8Array(Buffer.concat(parts));
}
const PTR_CONTENT=`BT /F1 9 Tf 40 720 Td (Periodic Transaction Report) Tj 0 -14 Td (ID Owner Asset Transaction Type Date Notification Date Amount Cap. Gains > $200?) Tj
0 -14 Td (SP Microsoft Corporation - Common) Tj ( P 03/15/2026 03/16/2026 $1,001 -) Tj 0 -12 Td [(Stock ) -50 (\\(MSFT\\) [ST])] TJ ( $15,000) Tj
0 -12 Td (F S: New) Tj 0 -14 Td (JT Apple Inc. - Common Stock \\(AAPL\\) [ST] S \\(partial\\) 03/20/2026 03/22/2026 $15,001 - $50,000) Tj ET`;

test('PDF text: compressed streams, kerning, ToUnicode fonts and object streams; a scanned page gives nothing',async()=>{
  const c='BT /F1 10 Tf 50 700 Td (Hello) Tj 0 -12 Td [(W) -50 (orld)] TJ 0 -12 Td /F2 10 Tf <00480049> Tj [<0050> -300 <00510052>] TJ ET';
  for(const objStm of [false,true])assert.equal(await pdfText(makePdf(c,{objStm})),'Hello\nWorld\nHiA BC',objStm?'fonts in an object stream':'plain objects');
  assert.equal(await pdfText(new TextEncoder().encode('%PDF-1.4\n1 0 obj << /Type /XObject /Subtype /Image /Length 2 >> stream\nxx\nendstream endobj')),'');
  assert.equal(await pdfText(new TextEncoder().encode('<html>not a pdf</html>')),'');
});

test('House trade report text: each row by its type, dates and amount, with the asset before it or wrapped after it',async()=>{
  const rows=housePtrTrades(await pdfText(makePdf(PTR_CONTENT)));
  assert.deepEqual(rows.map(r=>[r.owner,r.ticker,r.asset,r.assetType,r.type,r.traded,r.low,r.high]),[
    ['spouse','MSFT','Microsoft Corporation - Common Stock','stock','P','2026-03-15',1001,15000],
    ['joint','AAPL','Apple Inc. - Common Stock','stock','S (partial)','2026-03-20',15001,50000]]);
  const more=housePtrTrades(`Vanguard Total Stock Market ETF (VTI) [EF] P 04/01/2026 04/02/2026 $1,001 - $15,000
D: Bought for retirement
DC NVIDIA Corporation - Common Stock E 04/05/2026 04/06/2026 Over $50,000,000
(NVDA) [ST]`);
  assert.deepEqual(more.map(r=>[r.owner,r.ticker,r.assetType,r.type,r.amount]),[['self','VTI','fund','P','$1,001 - $15,000'],['child','NVDA','stock','E','Over $50,000,000']]);
  assert.deepEqual(housePtrTrades('Annual report with no transactions'),[]);
});

const EFD_REPORT=`<html><body><h1>Periodic Transaction Report for 03/02/2026</h1><table class="table"><thead><tr><th>#</th><th>Transaction Date</th><th>Owner</th><th>Ticker</th><th>Asset Name</th><th>Asset Type</th><th>Type</th><th>Amount</th><th>Comment</th></tr></thead>
<tbody><tr><td>1</td><td>02/10/2026</td><td>Spouse</td><td><a href="https://finance.yahoo.com/quote/XOM">XOM</a></td><td>Exxon Mobil Corporation</td><td>Stock</td><td>Sale (Partial)</td><td>$1,001 - $15,000</td><td>--</td></tr>
<tr><td>2</td><td>02/11/2026</td><td>Self</td><td>--</td><td>US Treasury Note <div class="text-muted"><em>Rate/Coupon:</em> 4.25%</div></td><td>Corporate Bond</td><td>Purchase</td><td>$50,001 - $100,000</td><td>--</td></tr></tbody></table></body></html>`;
test('Senate eFD report: the transaction table, found by its headings',()=>{
  assert.deepEqual(efdTrades(EFD_REPORT).map(r=>[r.traded,r.owner,r.ticker,r.asset,r.assetType,r.type,r.low,r.high]),[
    ['2026-02-10','spouse','XOM','Exxon Mobil Corporation','stock','Sale (Partial)',1001,15000],
    ['2026-02-11','self',null,'US Treasury Note Rate/Coupon: 4.25%','bond','Purchase',50001,100000]]);
  assert.throws(()=>efdTrades('<table><thead><tr><th>Transaction Date</th></tr></thead></table>'),/table changed/);
});

test('requests: form posts, cookies, a redirect returned instead of followed, and no credential headers from callers',async()=>{
  assert.equal(hostRule('efdsearch.senate.gov').name,'Senate eFD');
  let seen;const env={fetch:async(u,init)=>{seen={u:String(u),init};return new Response(null,{status:302,headers:{location:'/search/','set-cookie':'sessionid=abc; HttpOnly'}});}};
  const r=await requestSource('https://efdsearch.senate.gov/search/home/',env,{as:'text',form:{a:'1',b:'x y'},headers:{Cookie:'csrftoken=t',Authorization:'nope'},allow:[302],withHeaders:true});
  assert.equal(r.status,302);assert.equal(r.body,null);
  assert.equal(seen.init.method,'POST');assert.equal(seen.init.body,'a=1&b=x+y');assert.equal(seen.init.headers['Content-Type'],'application/x-www-form-urlencoded');
  assert.equal(seen.init.headers.Cookie,'csrftoken=t');assert.equal(seen.init.headers.Authorization,undefined);assert.match(seen.init.headers['User-Agent'],/PublicLedger/);
  assert.equal(seen.init.redirect,'manual');
  assert.equal(cookieHeader(addCookies({csrftoken:'t'},r.headers)),'csrftoken=t; sessionid=abc');
  await assert.rejects(requestSource('https://efdsearch.senate.gov/x',{fetch:async()=>new Response(null,{status:302,headers:{location:'/'}})}),/HTTP 302|redirect|fetch/i,'a redirect not asked for fails');
});

// A stand-in for the database: published snapshots by job ID and kind.
function db(snapshots){
  return {prepare:sql=>({bind:(...a)=>({
    all:async()=>({results:/j\.kind=\?/.test(sql)?snapshots.filter(s=>s.kind===a[0]).map(s=>({payload:JSON.stringify(s.payload)})):[]}),
    first:async()=>{const s=snapshots.find(s=>s.id===a[0]);return s?{payload:JSON.stringify(s.payload)}:null;}})})};
}
async function run(kind,subject,args,env){
  const job={id:`${kind}:${subject}`,kind,subject,args:JSON.stringify(args),cursor:null,started_at:new Date().toISOString()},rows=[];
  for(let i=0;i<40;i++){const r=await FEEDS[kind].page(job,args,env,config);rows.push(...r.rows);if(!r.next)break;job.cursor=r.next;}
  return {rows,snapshot:FEEDS[kind].summarize(rows,args,job,config)};
}

test('House reader: each trade report in the index is read once; a scanned report is listed for review',async()=>{
  const jobs=FEEDS['trades-house'].jobs(config);
  assert.ok(jobs.length&&jobs.every(j=>config.people.find(p=>p.id===j.subject).chamber==='H'),'House members in office');
  const years=FEEDS['house-fd'].jobs(config).map(j=>j.args.year);
  assert.deepEqual([years[0],years.at(-1),years.length],[config.year,2016,config.year-2016+1],'an index for each year back to 2016');
  assert.equal(FEEDS['house-fd'].jobs(config)[0].id,'house-fd','this year\'s keeps its job');
  assert.equal(FEEDS['house-fd'].every({year:2017}),7*86400000,'a year that has ended is checked weekly');
  const filing=(id,filed)=>({id,ptr:true,filed,url:`https://disclosures-clerk.house.gov/public_disc/ptr-pdfs/2026/${id}.pdf`});
  const index={id:'house-fd',kind:'house-fd',payload:{byPerson:{perry:[filing('20031001','2026-03-25'),filing('8220222','2026-02-01'),{id:'10066',ptr:false,filed:'2026-05-15'}]}}};
  const fetched=[];
  const env={DB:db([index]),fetch:async u=>{fetched.push(String(u));return new Response(String(u).includes('20031001')?makePdf(PTR_CONTENT):new TextEncoder().encode('%PDF-1.4\nscanned'));}};
  const a=await run('trades-house','perry',{},env);
  assert.equal(fetched.length,2,'only trade reports are opened');
  assert.equal(a.snapshot.count,2);assert.equal(a.snapshot.reports,2);
  const msft=a.snapshot.rows.find(r=>r.ticker==='MSFT');
  assert.deepEqual([msft.source,msft.disclosed,msft.type,msft.owner,msft.official.doc,msft.official.url],['House Clerk','2026-03-25','purchase','spouse','20031001',filing('20031001').url]);
  assert.match(msft.id,/^20031001:.*#1$/);
  assert.deepEqual(a.snapshot.unread.map(u=>u.doc),['8220222']);
  // The next run reads only a new report, and keeps what it already read.
  const env2={DB:db([index,{id:'trades-house:perry',kind:'trades-house',payload:a.snapshot}]),fetch:async u=>{fetched.push(String(u));return new Response(makePdf(PTR_CONTENT));}};
  index.payload.byPerson.perry.push(filing('20031099','2026-04-02'));fetched.length=0;
  const b=await run('trades-house','perry',{},env2);
  assert.deepEqual(fetched,[filing('20031099').url]);assert.equal(b.snapshot.reports,3);assert.equal(b.snapshot.unread.length,1);
  await assert.rejects(run('trades-house','perry',{},{DB:db([]),fetch:async()=>new Response('')}),/Waiting for the House disclosure index/);
});

test('Senate reader: agrees to the terms, searches the senator\'s trade reports, reads each one, and agrees again when the session ends',async()=>{
  const jobs=FEEDS['trades-senate'].jobs(config);
  assert.ok(jobs.some(j=>j.subject==='collins'&&j.args.last==='Collins'&&j.args.from===config.year-1));
  const link=(kind,id,title)=>`<a href="/search/view/${kind}/${id}/" target="_blank">${title}</a>`;
  const ids=['1a2b3c4d-0000-4000-8000-000000000001','1a2b3c4d-0000-4000-8000-000000000002','1a2b3c4d-0000-4000-8000-000000000003'];
  const calls=[];let expired=true;
  const env={DB:db([]),fetch:async(u,init)=>{
    const url=String(u);calls.push([init.method,url.replace('https://efdsearch.senate.gov',''),init.body||'']);
    if(url.endsWith('/search/home/')&&init.method==='GET')return new Response('<form><input type="hidden" name="csrfmiddlewaretoken" value="tok123"><input type="checkbox" name="prohibition_agreement"></form>',{headers:{'set-cookie':'csrftoken=csrf1; Path=/'}});
    if(url.endsWith('/search/home/'))return new Response(null,{status:302,headers:{location:'/search/','set-cookie':'sessionid=s1; HttpOnly'}});
    if(url.endsWith('/search/report/data/')){
      assert.match(init.body,/report_types=%5B11%5D/);assert.match(init.body,/last_name=Collins/);assert.match(init.body,/submitted_start_date=01%2F01%2F2016/,'reports back to 2016');assert.equal(init.headers['X-CSRFToken'],'csrf1');assert.match(init.headers.Cookie,/sessionid=s1/);
      return Response.json({recordsFiltered:3,data:[['Susan M','Collins','Collins, Susan M. (Senator)',link('ptr',ids[0],'Periodic Transaction Report for 03/02/2026'),'03/05/2026'],
        ['Susan M','Collins','Collins, Susan M. (Senator)',link('paper',ids[1],'Periodic Transaction Report'),'01/20/2026'],['Susan M','Collins','Collins, Susan M. (Senator)',link('ptr',ids[2],'Periodic Transaction Report for 12/01/2025'),'12/10/2025']]});}
    if(url.includes(ids[0])&&expired){expired=false;return new Response(null,{status:302,headers:{location:'/search/home/'}});}
    return new Response(EFD_REPORT);
  }};
  const r=await run('trades-senate','collins',{last:'Collins',first:['Susan'],from:2025},env);
  assert.equal(r.snapshot.count,4,'two trades from each electronic report');
  assert.deepEqual(r.snapshot.unread.map(u=>u.doc),[ids[1]],'the paper report is listed, not fetched');
  assert.ok(!calls.some(c=>c[1].includes(ids[1])));
  assert.equal(calls.filter(c=>c[0]==='POST'&&c[1]==='/search/home/').length,2,'agreed again after the session ended');
  const xom=r.snapshot.rows.find(t=>t.ticker==='XOM'&&t.doc===ids[0]);
  assert.deepEqual([xom.source,xom.disclosed,xom.type,xom.owner],['Senate eFD','2026-03-05','sale','spouse']);
});

test('merge: an official report\'s trade keeps its filing date and link; a trade only a service reports is flagged',()=>{
  const official={id:'d1:2026-02-10|XOM|sale|1001|15000#1',source:'Senate eFD',traded:'2026-02-10',disclosed:'2026-03-05',ticker:'XOM',asset:'Exxon Mobil Corporation',type:'sale',low:1001,high:15000,owner:'spouse',doc:'d1',official:{doc:'d1',filed:'2026-03-05',url:'https://efdsearch.senate.gov/search/view/ptr/d1/'},assetType:'stock'};
  const svc={id:'2026-02-10|XOM|sale|1001|15000#1',source:'Bargo',traded:'2026-02-10',disclosed:'2026-03-07',ticker:'XOM',asset:'EXXON MOBIL',type:'sale',low:1001,high:15000,owner:null};
  const only={id:'2026-04-01|NVDA|purchase|1001|15000#1',source:'Bargo',traded:'2026-04-01',disclosed:'2026-04-20',ticker:'NVDA',type:'purchase',low:1001,high:15000};
  const m=mergeTrades([[official],[svc,only]],[],{},{officialFrom:'2025-01-01'});
  const x=m.find(t=>t.ticker==='XOM');
  assert.deepEqual([x.sources,x.filed,x.asset,x.owner,x.official.url,x.assetType],[['Senate eFD','Bargo'],'2026-03-05','Exxon Mobil Corporation','spouse',official.official.url,'stock']);
  assert.match(x.review.join(),/official report's date is used/);
  assert.match(m.find(t=>t.ticker==='NVDA').review.join(),/Not found in the official reports/);
  assert.deepEqual(mergeTrades([[only]],[],{}).find(t=>t.ticker==='NVDA').review,[],'without official readers there is nothing to check against');
});

test('through the real refresh: the House reader publishes, the profile merges its trades, and a second run reads only new reports',async()=>{
  const fs=await import('node:fs/promises');
  const {openDatabase}=await import('../scripts/sqlite.mjs');
  const {initialize,runRefresh,getProfile,statement}=await import('../src/refresh.mjs');
  const db=openDatabase(':memory:');db.exec(await fs.readFile(new URL('../migrations/0001_initial.sql',import.meta.url),'utf8'));
  await initialize(db);
  const filing=(id,filed)=>({id,ptr:true,filed,url:`https://disclosures-clerk.house.gov/public_disc/ptr-pdfs/2026/${id}.pdf`});
  const index=list=>statement(db,"INSERT INTO snapshots(job_id,run_id,payload,updated_at) VALUES('house-fd','r1',?,?) ON CONFLICT(job_id) DO UPDATE SET payload=excluded.payload",JSON.stringify({byPerson:{perry:list}}),new Date().toISOString()).run();
  const only=async id=>{await statement(db,'UPDATE jobs SET next_due=? WHERE id!=?',Date.now()+86400000,id).run();await statement(db,"UPDATE jobs SET next_due=0,status='pending' WHERE id=?",id).run();};
  const fetched=[],env={DB:db,fetch:async u=>{fetched.push(String(u));return new Response(String(u).includes('8220222')?new TextEncoder().encode('%PDF-1.4\nscanned'):makePdf(PTR_CONTENT));}};
  await index([filing('20031001','2026-03-25'),filing('8220222','2026-02-01')]);
  await only('trades-house:perry');await runRefresh(env,{steps:10});
  const job=await statement(db,"SELECT status,error FROM jobs WHERE id='trades-house:perry'").first();
  assert.equal(job.status,'ready',job.error);assert.equal(fetched.length,2);
  const p=await getProfile({DB:db},'perry');
  assert.deepEqual(p.merged.trades.map(t=>[t.ticker,t.sources.join(),t.filed,t.official.doc]).sort(),[['AAPL','House Clerk','2026-03-25','20031001'],['MSFT','House Clerk','2026-03-25','20031001']]);
  assert.deepEqual(p.merged.tradesUnread.map(u=>u.doc),['8220222']);
  await index([filing('20031001','2026-03-25'),filing('8220222','2026-02-01'),filing('20031099','2026-04-02')]);fetched.length=0;
  await only('trades-house:perry');await runRefresh(env,{steps:10});
  assert.deepEqual(fetched,[filing('20031099').url],'only the new report is downloaded');
  const after=JSON.parse((await statement(db,"SELECT payload FROM snapshots WHERE job_id='trades-house:perry'").first()).payload);
  assert.equal(after.reports,3);assert.equal(after.unread.length,1);
  db.close();
});
