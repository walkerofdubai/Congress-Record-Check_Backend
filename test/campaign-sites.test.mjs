import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chooseCampaignSite,diffPlatform,platformSections} from '../src/sources.mjs';
import {addJob,getProfile,initialize,runRefresh,statement} from '../src/refresh.mjs';
import {openDatabase} from '../scripts/sqlite.mjs';
const migration=await fs.readFile(new URL('../migrations/0001_initial.sql',import.meta.url),'utf8');
const collins={name:'Susan M. Collins',chamber:'S',state:'ME'};
const result=(url,title,content='')=>({url,title,content});
const issues=`# Susan Collins for Senate

## Lowering health care costs
Susan has fought to lower prescription drug prices for Maine families, and she will keep working to cap insulin costs for every patient who needs it.

## Donate
Chip in today to help us win this race and keep Maine strong for years to come with your support.

## Protecting Social Security
She opposes any cut to Social Security benefits and supports [strengthening the trust fund](https://example.com/x) for current and future retirees in Maine.`;

test('a campaign site needs the surname in its domain, campaign evidence and a clear lead',()=>{
  const clear=chooseCampaignSite([result('https://en.wikipedia.org/wiki/Susan_Collins','Susan Collins - Wikipedia','Susan Collins'),result('https://www.collins.senate.gov/','Senator Susan Collins'),
    result('https://www.susancollins.com/','Susan Collins for Senate','Donate and volunteer for Susan Collins'),result('https://www.susancollins.com/issues','Issues','Susan Collins on the issues')],collins);
  assert.equal(clear.site,'https://susancollins.com/');assert.equal(clear.confidence,'high');
  assert.ok(!clear.candidates.some(c=>/wikipedia|senate\.gov/.test(c.host)),'reference and official sites are never candidates');
  const ambiguous=chooseCampaignSite([result('https://collinsforsenate.com/','Collins for Senate','Donate to Collins'),result('https://collinsformaine.com/','Collins for Maine','Volunteer with Collins')],collins);
  assert.equal(ambiguous.site,null);assert.equal(ambiguous.confidence,'low');assert.equal(ambiguous.candidates.length,2);
  assert.equal(chooseCampaignSite([result('https://www.mainepolitics.com/race','Maine Senate race','Collins leads in a poll')],collins).site,null);
});
test('platform pages split into one statement per heading, without navigation or fundraising blocks',()=>{
  const s=platformSections('https://susancollins.com/issues',issues);
  assert.deepEqual(s.map(x=>x.heading),['Lowering health care costs','Protecting Social Security']);
  assert.match(s[1].text,/supports strengthening the trust fund for/);assert.equal(s[1].text.includes('example.com'),false);
});
test('a new capture reports added, changed and removed statements',()=>{
  const before=platformSections('https://susancollins.com/issues',issues);
  const after=platformSections('https://susancollins.com/issues',issues.replace('cap insulin costs','lower insulin costs').replace(/## Protecting Social Security[\s\S]*$/,'## Securing the border\n'+'She supports hiring more border agents and funding new technology at ports of entry across the country. '.repeat(2)));
  const d=diffPlatform({sections:before,checkedThrough:'2026-10-01'},after);
  assert.equal(d.added,1);assert.equal(d.changed,1);assert.deepEqual(d.removed.map(r=>r.heading),['Protecting Social Security']);
  assert.equal(diffPlatform(null,after).first,true);
});
function database(){const db=openDatabase(':memory:');db.exec(migration);db.exec("INSERT INTO metadata VALUES ('initialized','test fixture')");return db;}
// initialize() keeps a site job for every configured person; park all but the jobs under test.
async function focus(db,...ids){await initialize(db);await statement(db,`UPDATE jobs SET next_due=? WHERE id NOT IN (${ids.map(()=>'?').join(',')})`,Number.MAX_SAFE_INTEGER,...ids).run();}
const snapshot=async(db,id)=>JSON.parse((await statement(db,'SELECT payload FROM snapshots WHERE job_id=?',id).first())?.payload||'null');
test('search then crawl: the key stays in a header, the platform is published, and an empty crawl keeps it',async()=>{
  const db=database();const calls=[];let crawl={results:[{url:'https://www.susancollins.com/issues',raw_content:issues},{url:'https://other.com/a',raw_content:issues}],usage:{credits:3}};
  const env={DB:db,TAVILY_API_KEY:'tvly-secret',fetch:async(url,init)=>{const u=new URL(url);calls.push({path:u.pathname,auth:init.headers.Authorization,url:u.href,body:JSON.parse(init.body)});
    if(u.pathname==='/search')return new Response(JSON.stringify({results:[result('https://www.susancollins.com/','Susan Collins for Senate','Donate to Susan Collins')]}));
    return new Response(JSON.stringify(crawl));}};
  await focus(db,'campaign-site:collins');await runRefresh(env,{steps:1});
  await focus(db,'platform:collins');await runRefresh(env,{steps:1});
  assert.deepEqual(calls.map(c=>c.path),['/search','/crawl']);
  assert.ok(calls.every(c=>c.auth==='Bearer tvly-secret'&&!c.url.includes('tvly-secret')));
  assert.equal(calls.at(-1).body.url,'https://susancollins.com/');assert.equal(calls.at(-1).body.allow_external,false);
  let p=(await getProfile(env,'collins')).sections;
  assert.equal(p['campaign-site'].site,'https://susancollins.com/');assert.equal(p.platform.sections.length,2);assert.equal(p.platform.pages.length,1,'pages from other hosts are dropped');
  assert.equal(p.platform.changes.first,true);assert.equal(p.platform.credits,3);
  const saved=(await statement(db,'SELECT payload FROM snapshots').all()).results.map(r=>r.payload).join('');assert.equal(saved.includes('tvly-secret'),false);
  crawl={results:[],usage:{credits:1}};await focus(db,'platform:collins');await statement(db,"UPDATE jobs SET next_due=0 WHERE id='platform:collins'").run();await runRefresh(env,{steps:1});
  p=(await getProfile(env,'collins')).sections;assert.equal(p.platform.sections.length,2);
  assert.match((await statement(db,"SELECT error FROM jobs WHERE id='platform:collins'").first()).error,/no pages/);db.close();
});
test('a campaignSite set by hand skips the search; without a key nothing is called',async()=>{
  const db=database();let paths=[];const env={DB:db,TAVILY_API_KEY:'k',fetch:async url=>{paths.push(new URL(url).pathname);return new Response(JSON.stringify({results:[{url:'https://hand.example/issues',raw_content:issues}]}));}};
  // A person outside data/config.json, so the hand-set site is not reset to the configured one.
  await addJob(db,'campaign-site:hand','campaign-site','hand',{name:'Pat Hand',chamber:'H',state:'ME',override:'https://hand.example/'});
  await focus(db,'campaign-site:hand');await runRefresh({...env,fetch:async()=>{throw new Error('should not fetch');},TAVILY_API_KEY:undefined},{steps:2});
  assert.equal((await statement(db,"SELECT status FROM jobs WHERE id='campaign-site:hand'").first()).status,'blocked');
  // Adding the key releases every blocked Tavily job; release them first so only this one is due.
  await statement(db,"UPDATE jobs SET status='pending',error=NULL WHERE status='blocked'").run();
  await focus(db,'campaign-site:hand');await runRefresh(env,{steps:1});await focus(db,'platform:hand');await runRefresh(env,{steps:1});
  assert.deepEqual(paths,['/crawl']);
  assert.equal((await snapshot(db,'campaign-site:hand')).confidence,'confirmed');assert.equal((await snapshot(db,'platform:hand')).sections.length,2);db.close();
});
test('when Tavily credits run out, all Tavily jobs pause for a day and other sources continue',async()=>{
  const db=database();await statement(db,'DELETE FROM jobs').run();
  for(const id of ['a','b'])await addJob(db,`campaign-site:${id}`,'campaign-site',id,{...collins,override:null});
  await addJob(db,'campaign:collins','campaign','collins',{committee:'C00314575',cycle:2026});
  const started=Date.now();let tavily=0;
  await runRefresh({DB:db,TAVILY_API_KEY:'k',FEC_API_KEY:'f',fetch:async url=>{if(new URL(url).hostname==='api.tavily.com'){tavily++;return new Response('limit',{status:432});}
    return new Response(JSON.stringify({results:[{committee_id:'C00314575',cycle:2026,coverage_start_date:'2025-01-01',coverage_end_date:'2026-06-30',receipts:1}],pagination:{}}));}},{steps:8});
  assert.equal(tavily,1);
  const jobs=(await statement(db,"SELECT next_due FROM jobs WHERE kind='campaign-site'").all()).results;assert.ok(jobs.every(j=>j.next_due>=started+86400000-1000));
  assert.equal((await statement(db,"SELECT status FROM jobs WHERE id='campaign:collins'").first()).status,'ready');db.close();
});
