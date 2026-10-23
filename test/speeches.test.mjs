import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {XMLParser} from 'fast-xml-parser';
import {extractTurns,normalizeRecordIssue,normalizeSpeech} from '../src/sources.mjs';
import {getProfile,getStatus,runRefresh,statement} from '../src/refresh.mjs';
import {openDatabase} from '../scripts/sqlite.mjs';
const migration=await fs.readFile(new URL('../migrations/0001_initial.sql',import.meta.url),'utf8');
const people=[{id:'collins',bioguide:'C001035',chamber:'S'},{id:'mcollins',bioguide:'C001129',chamber:'H'}];
const page=body=>`<html><body><pre>
[Congressional Record Volume 172, Number 155 (Wednesday, September 30, 2026)]
[Senate]
[Pages S5238-S5239]
From the Congressional Record Online through the Government Publishing Office [<a href="https://www.gpo.gov">www.gpo.gov</a>]


               EXAMPLE SECTION

${body}
</pre></body></html>`;
const debate=page(`  Ms. COLLINS. Mr. President, rural hospitals need this
funding &amp; support.
  It matters to Maine.

[[Page S5239]]

  The PRESIDING OFFICER. The Senator from Delaware.
  Mr. COONS. Mr. President, I agree.
  Ms. COLLINS. I thank my colleague.`);
const mods=`<mods><relatedItem type="constituent" ID="id-CREC-2026-09-30-pt1-PgS5238"><titleInfo><title>EXAMPLE SECTION</title></titleInfo>
<extension><granuleClass>SENATE</granuleClass><granuleDate>2026-09-30</granuleDate>
<congMember bioGuideId="C001035" role="SPEAKING" chamber="S"><name type="parsed">Ms. COLLINS</name></congMember>
<congMember bioGuideId="C001088" role="SPEAKING" chamber="S"><name type="parsed">Mr. COONS</name></congMember>
<congVote><congMember bioGuideId="C001129" role="VOTED YES"><name type="parsed">Collins</name></congMember></congVote></extension></relatedItem>
<relatedItem type="constituent" ID="id-CREC-2026-09-30-pt1-PgS5240"><titleInfo><title>MORNING BUSINESS</title></titleInfo>
<extension><granuleClass>SENATE</granuleClass><granuleDate>2026-09-30</granuleDate><congMember bioGuideId="C001035" role="SPONSOR"><name type="parsed">Ms. COLLINS</name></congMember></extension></relatedItem></mods>`;

test('a member\'s turns are separated from other speakers, page markers and the presiding officer',()=>{
  const turns=extractTurns(debate,['Ms. COLLINS','Mr. COONS']);
  assert.deepEqual(turns['Ms. COLLINS'],['Mr. President, rural hospitals need this funding & support.','It matters to Maine.','I thank my colleague.']);
  assert.deepEqual(turns['Mr. COONS'],['Mr. President, I agree.']);
});
test('a speaker listed in the metadata but absent from the text is saved as unmatched, not guessed',()=>{
  const s=normalizeSpeech(debate,{package:'CREC-2026-09-30',granule:'CREC-2026-09-30-pt1-PgS5238',date:'2026-09-30',title:'EXAMPLE',chamber:'SENATE',speakers:[{person:'collins',label:'Ms. COLLINS'},{person:'mcollins',label:'Mr. HUSTED'}]});
  assert.equal(s.speakers.collins.paragraphs,3);assert.equal(s.speakers.mcollins.matched,false);assert.equal(s.speakers.mcollins.text,'');
});
test('an unlabeled extension of remarks is credited to its single author',()=>{
  const turns=extractTurns(page('  Mr. Speaker, I rise to honor a constituent.'),['Mr. COLLINS'],{single:true});
  assert.deepEqual(turns['Mr. COLLINS'],['Mr. Speaker, I rise to honor a constituent.']);
});
test('only tracked members in a SPEAKING role select a section; votes and sponsorships do not',()=>{
  const doc=new XMLParser({ignoreAttributes:false,parseTagValue:false}).parse(mods);
  const rows=normalizeRecordIssue(doc,{package:'CREC-2026-09-30',date:'2026-09-30'},people);
  assert.equal(rows.length,1);assert.deepEqual(rows[0].speakers,[{person:'collins',label:'Ms. COLLINS'}]);assert.equal(rows[0].title,'EXAMPLE SECTION');
});
test('discovery, issue and speech jobs chain together, publish once, and never refetch',async()=>{
  const db=openDatabase(':memory:');db.exec(migration);db.exec("INSERT INTO metadata VALUES ('initialized','test fixture')");
  const requests=[];
  const env={DB:db,CONGRESS_API_KEY:'secret-key',fetch:async url=>{const u=new URL(url);requests.push(u.hostname+u.pathname);
    if(u.pathname.startsWith('/collections/CREC/'))return new Response(JSON.stringify({count:1,packages:[{packageId:'CREC-2026-09-30',dateIssued:'2026-09-30',lastModified:'2026-10-01T00:00:00Z'},{packageId:'CREC-2024-12-20',dateIssued:'2024-12-20'}],nextPage:null}));
    if(u.pathname.endsWith('/mods'))return new Response(mods);
    if(u.hostname==='www.govinfo.gov'){assert.equal(u.searchParams.has('api_key'),false);return new Response(debate);}
    return new Response('not found',{status:404});}};
  await runRefresh(env,{steps:8});
  const jobs=Object.fromEntries((await statement(db,"SELECT id,status,next_due,args FROM jobs WHERE kind IN ('crec-index','crec-package','speech')").all()).results.map(j=>[j.id,j]));
  assert.equal(jobs['crec-index'].status,'ready');assert.equal(JSON.parse(jobs['crec-index'].args).since.length,10);
  assert.equal(jobs['crec-package:CREC-2024-12-20'],undefined,'issues before the cycle start are skipped');
  assert.equal(jobs['crec-package:CREC-2026-09-30'].next_due,Number.MAX_SAFE_INTEGER);
  assert.equal(jobs['speech:CREC-2026-09-30-pt1-PgS5238'].next_due,Number.MAX_SAFE_INTEGER);
  const profile=await getProfile(env,'collins');
  assert.equal(profile.speechCount,1);assert.equal(profile.speeches[0].matched,true);assert.match(profile.speeches[0].excerpt,/^Mr\. President, rural hospitals/);
  const status=await getStatus(env);assert.equal(status.jobs.filter(j=>j.kind==='speech').length,1);assert.equal(status.jobs.find(j=>j.kind==='speech').aggregate,true);
  const saved=(await statement(db,'SELECT payload FROM snapshots').all()).results.map(r=>r.payload).join('');assert.equal(saved.includes('secret-key'),false);
  const before=requests.length;await statement(db,"UPDATE jobs SET next_due=0 WHERE kind!='crec-index'").run();
  await statement(db,"UPDATE jobs SET next_due=? WHERE kind IN ('crec-package','speech')",Number.MAX_SAFE_INTEGER).run();await runRefresh(env,{steps:8});
  assert.equal(requests.slice(before).some(r=>r.includes('/mods')||r.startsWith('www.')),false);db.close();
});
test('Record jobs wait for a key and do not block other sources',async()=>{
  const db=openDatabase(':memory:');db.exec(migration);db.exec("INSERT INTO metadata VALUES ('initialized','test fixture')");
  let requests=0;await runRefresh({DB:db,fetch:async()=>{requests++;return new Response('');}},{steps:8});
  assert.equal(requests,0);assert.equal((await statement(db,"SELECT status FROM jobs WHERE id='crec-index'").first()).status,'blocked');db.close();
});
