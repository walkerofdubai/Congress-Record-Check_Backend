// Members' press-release feeds, Bluesky accounts and Threads posts: what each source keeps, what it refuses, and which
// addresses it may reach. Responses are built from each source's published formats; live responses need the network.
import test from 'node:test';
import assert from 'node:assert/strict';
import config from '../data/config.json' with {type:'json'};
import {FEEDS,THREADS_TERMS,blueskyHandles,threadsUsers,feedLinks,feedItems} from '../src/feeds.mjs';
import {requestSource,missingKey,cleanURL,hostRule,parseXML} from '../src/sources.mjs';
import {bskyLinks,verifiedMatches} from '../scripts/find-bluesky.mjs';
import {officialOf} from '../scripts/build-ids.mjs';

const json=o=>new Response(JSON.stringify(o),{headers:{'content-type':'application/json'}});
const xml=t=>new Response(t,{headers:{'content-type':'application/rss+xml'}});
async function run(kind,subject,args,routes,env={}){
  const calls=[],e={THREADS_ACCESS_TOKEN:'tt',...env,fetch:async(u,init)=>{calls.push({url:String(u),init});for(const [re,body] of routes)if(re.test(String(u)))return typeof body==='function'?body(String(u),init):body.clone?body.clone():json(body);return new Response('missing',{status:404});}};
  const job={kind,subject,args:JSON.stringify(args),cursor:null,started_at:new Date().toISOString()},rows=[];
  for(let i=0;i<60;i++){const r=await FEEDS[kind].page(job,args,e,config);rows.push(...r.rows);if(!r.next)break;job.cursor=r.next;}
  return {rows,snapshot:FEEDS[kind].summarize(rows,args,job,config),calls};
}
const RSS=`<?xml version="1.0"?><rss version="2.0"><channel><title>Press</title>
  <item><title>Senator Introduces Bill to Lower Drug Costs</title><link>http://www.collins.senate.gov/newsroom/press/drug-costs</link><pubDate>Tue, 14 Oct 2026 15:00:00 GMT</pubDate><description>&lt;p&gt;Washington, D.C. &amp;ndash; Today&lt;/p&gt;</description></item>
  <item><title>Statement on the Budget</title><link>https://www.collins.senate.gov/newsroom/press/budget</link><pubDate>Mon, 06 Oct 2026 12:00:00 GMT</pubDate></item>
</channel></rss>`;

test('members\' official websites are approved sources; look-alike hosts are not',()=>{
  assert.equal(hostRule('www.collins.senate.gov').name,'Official member websites');
  assert.equal(hostRule('kaptur.house.gov').name,'Official member websites');
  assert.equal(hostRule('www.senate.gov').name,'Senate.gov','a host with its own entry keeps its own limit');
  for(const h of ['senate.gov.example.com','collins-senate.gov','evil.com','house.gov'])assert.equal(hostRule(h),null,h);
  assert.equal(missingKey('collins.house.gov',{}),null,'no key needed');
  assert.equal(missingKey('graph.threads.net',{}),'Threads');
});
test('Threads sends its token as access_token, and saved links never keep it',async()=>{
  let seen;await requestSource('https://graph.threads.net/v1.0/keyword_search?q=x',{THREADS_ACCESS_TOKEN:'secret',fetch:async u=>{seen=String(u);return json({data:[]});}});
  assert.match(seen,/access_token=secret/);
  assert.doesNotMatch(cleanURL(seen),/secret/);
});
test('redirects are followed only when asked, only to approved hosts, and never carry a key elsewhere',async()=>{
  const hop=to=>new Response(null,{status:301,headers:{location:to}});
  const env=routes=>({THREADS_ACCESS_TOKEN:'tt',fetch:async u=>routes(String(u))});
  const ok=await requestSource('https://pappas.house.gov/rss.xml',env(u=>u==='https://pappas.house.gov/rss.xml'?hop('/news/rss.xml'):xml(RSS)),{as:'xml',follow:true});
  assert.ok(ok.rss);
  await assert.rejects(requestSource('https://pappas.house.gov/rss.xml',env(()=>hop('https://evil.com/feed')),{as:'xml',follow:true}),/unapproved address/);
  await assert.rejects(requestSource('https://pappas.house.gov/rss.xml',env(()=>hop('http://pappas.house.gov/x')),{as:'xml',follow:true}),/unapproved address/);
  await assert.rejects(requestSource('https://graph.threads.net/v1.0/x',env(()=>hop('https://pappas.house.gov/x')),{follow:true}),/unapproved address/,'a keyed request never follows to another host');
  await assert.rejects(requestSource('https://pappas.house.gov/a',env(u=>hop(u+'a')),{as:'text',follow:true}),/too many times/);
});
test('feed parsing: advertised links (press first), RSS, Atom and RSS 1.0',()=>{
  const html=`<head><link rel="alternate" type="application/rss+xml" title="All news" href="/all.xml"><link rel="stylesheet" href="/a.css">
    <link rel='alternate' type='application/rss+xml' title='Press Releases' href='/rss/feeds/?type=press&amp;cat=2'></head>`;
  assert.deepEqual(feedLinks(html,'https://www.collins.senate.gov/'),['https://www.collins.senate.gov/rss/feeds/?type=press&cat=2','https://www.collins.senate.gov/all.xml']);
  const items=feedItems(parseXML(RSS));
  assert.equal(items.length,2);
  assert.equal(items[0].url,'https://www.collins.senate.gov/newsroom/press/drug-costs','http links are upgraded');
  assert.equal(items[0].date,'2026-10-14');assert.equal(items[0].summary,'Washington, D.C. &ndash; Today');
  const atom=feedItems(parseXML(`<feed xmlns="http://www.w3.org/2005/Atom"><entry><title type="html">Atom item</title><link rel="alternate" href="https://x.house.gov/a"/><updated>2026-09-01T00:00:00Z</updated></entry></feed>`));
  assert.deepEqual([atom[0].title,atom[0].url,atom[0].date],['Atom item','https://x.house.gov/a','2026-09-01']);
  const rdf=feedItems(parseXML(`<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns:dc="http://purl.org/dc/elements/1.1/"><item><title>Old style</title><link>https://y.house.gov/b</link><dc:date>2026-08-01</dc:date></item></rdf:RDF>`));
  assert.equal(rdf[0].date,'2026-08-01');
  assert.equal(feedItems({html:{}}),null,'not a feed');
});
test('press releases: the homepage\'s feed first, then the listed feed, then the usual addresses',async()=>{
  const home=`<link rel="alternate" type="application/rss+xml" title="Press Releases" href="/rss/feeds/?type=press">`;
  const a=await run('press','collins',{site:'https://www.collins.senate.gov',feed:'https://www.collins.senate.gov/public/?a=rss.feed'},[[/type=press/,xml(RSS)],[/senate\.gov\/$/,new Response(home)]]);
  assert.equal(a.rows.length,2);assert.equal(a.snapshot.feed,'https://www.collins.senate.gov/rss/feeds/?type=press');assert.equal(a.calls.length,2);
  // No advertised feed and a dead listed one: falls through to /rss.xml.
  const b=await run('press','perry',{site:'https://perry.house.gov',feed:'https://perry.house.gov/old.xml'},[[/\/rss\.xml$/,xml(RSS)],[/house\.gov\/$/,new Response('<html></html>')]]);
  assert.equal(b.snapshot.feed,'https://perry.house.gov/rss.xml');assert.equal(b.snapshot.count,2);
  // An advertised feed on another site is never fetched.
  const c=await run('press','x',{site:'https://x.house.gov',feed:null},[[/feeds\.example\.com/,xml(RSS)],[/\/feed\/$/,xml(RSS)],[/house\.gov\/$/,new Response('<link rel="alternate" type="application/rss+xml" href="https://feeds.example.com/x">')]]);
  assert.ok(!c.calls.some(x=>/example\.com/.test(x.url)));assert.equal(c.snapshot.feed,'https://x.house.gov/feed/');
  await assert.rejects(run('press','x',{site:'https://x.house.gov',feed:null},[[/house\.gov\/$/,new Response('<html></html>')]]),/No press-release feed/);
  await assert.rejects(run('press','x',{site:'https://x.house.gov',feed:null},[[/./,new Response('',{status:429})]]),/HTTP 429/,'a rate limit stops the job instead of being skipped');
});
test('Bluesky: hand-added accounts, then official and campaign website domains; a domain without an account is listed, not an error',async()=>{
  assert.deepEqual(blueskyHandles({social:{bluesky:['@Someone.bsky.social']},official:{site:'https://www.ossoff.senate.gov'},campaignSite:'https://www.electjon.com/'}),['someone.bsky.social','ossoff.senate.gov','electjon.com']);
  for(const site of ['https://www.facebook.com/SomeCandidate','https://secure.actblue.com/donate/x','https://linktr.ee/x','https://x.com/x'])assert.deepEqual(blueskyHandles({campaignSite:site}),[],'a shared platform\'s domain is not the person\'s: '+site);
  assert.deepEqual(blueskyHandles({campaignSite:'https://vote.ashleyhinson.com'}),['vote.ashleyhinson.com']);
  const r=await run('bluesky','ossoff',{handles:['ossoff.senate.gov','electjon.com']},[[/actor=ossoff/,{feed:[{post:{uri:'at://did:plc:a/app.bsky.feed.post/3k',author:{handle:'ossoff.senate.gov'},record:{text:'Hi',createdAt:'2026-10-01T00:00:00Z'}}}]}],[/actor=electjon/,new Response(JSON.stringify({error:'InvalidRequest',message:'Profile not found'}),{status:400})]]);
  assert.equal(r.snapshot.count,1);assert.deepEqual(r.snapshot.accounts,['ossoff.senate.gov']);assert.deepEqual(r.snapshot.missing,['electjon.com']);
  const jobs=FEEDS.bluesky.jobs(config);
  assert.ok(jobs.some(j=>j.subject==='ossoff'&&j.args.handles.includes('ossoff.senate.gov')),'sitting members get their official domain');
  assert.ok(jobs.length>=40,'everyone with an official or campaign website is checked');
});
test('Threads: one search per issue, only the account\'s own posts, each post listed once with every issue it mentions',async()=>{
  assert.deepEqual(threadsUsers({social:{instagram:'SenSusanCollins'}}),['sensusancollins'],'the Instagram username');
  assert.deepEqual(threadsUsers({social:{instagram:'a',threads:['@b.c']}}),['b.c'],'a hand-added account wins');
  const post={id:'1',text:'Taxes and tariffs',timestamp:'2026-10-02T12:00:00+0000',permalink:'https://www.threads.com/@sensusancollins/post/A',username:'sensusancollins'};
  const r=await run('threads','collins',{users:['sensusancollins']},[[/keyword_search/,u=>{const q=new URL(u).searchParams;
    assert.equal(q.get('author_username'),'sensusancollins');assert.equal(q.get('search_type'),'RECENT');
    return json({data:['taxes','tariffs'].includes(q.get('q'))?[post,{...post,id:'2',username:'someoneelse'}]:[]});}]]);
  assert.equal(r.calls.length,Object.keys(THREADS_TERMS).length);
  assert.equal(r.snapshot.count,1);assert.deepEqual(r.snapshot.rows[0].issues,['taxes','tariffs']);
  assert.ok(FEEDS.threads.jobs(config).length>0,'members with an Instagram account are searched');
});
test('Bluesky account finder: profile links on a page, and verified accounts with the person\'s name',()=>{
  assert.deepEqual(bskyLinks('<a href="https://bsky.app/profile/ossoff.senate.gov">Bluesky</a> <a href="https://bsky.app/profile/did:plc:abc123/post/x">x</a> <a href="https://bsky.app/profile/ossoff.senate.gov">again</a>'),['ossoff.senate.gov','did:plc:abc123']);
  const p={name:'Jon Ossoff'};
  assert.deepEqual(verifiedMatches([{handle:'Ossoff.Senate.gov',displayName:'Sen. Jon Ossoff',verification:{verifiedStatus:'valid'}},{handle:'fake.bsky.social',displayName:'Jon Ossoff',verification:{verifiedStatus:'none'}},{handle:'other.bsky.social',displayName:'Someone Else',verification:{verifiedStatus:'valid'}}],p),['ossoff.senate.gov']);
});
test('official websites come from the member\'s current term, upgraded to https',()=>{
  assert.deepEqual(officialOf({terms:[{url:'http://old.house.gov'},{url:'https://kaptur.house.gov/',rss_url:'http://kaptur.house.gov/index.php?format=feed&amp;type=rss'}]}),{site:'https://kaptur.house.gov',feed:'https://kaptur.house.gov/index.php?format=feed&type=rss'});
  assert.equal(officialOf({terms:[{}]}),null);
  // A few offices' sites start at a path (https://www.boozman.senate.gov/public).
  for(const p of config.people.filter(p=>p.official))assert.match(p.official.site,/^https:\/\/[a-z0-9.-]+\.(senate|house)\.gov(\/[a-z0-9._-]+)*$/i,p.id);
});
