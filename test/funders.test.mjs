// Each person's funders (research.json funderPos) are rebuilt by scripts/build-funders.mjs from the saved FEC rows and the
// groups' positions (groupPos[].positions). These tests check the matching rules and that the saved file is up to date.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {isGroupPac,matchOf,normName,personFunders,funderChanges,people} from '../scripts/build-funders.mjs';
const D=JSON.parse(await fs.readFile(new URL('../public/research.json',import.meta.url),'utf8'));
const G=k=>D.groupPos.find(g=>g.key===k);

test('PAC names match a group by its committee names, cut-off FEC names, or its name patterns',()=>{
  assert.equal(normName('AFSCME & Co.'),'afscme and co');
  const afscme=G('afscme');
  assert.ok(isGroupPac('American Federation of State County & M',afscme),'a name cut off by the FEC still matches');
  assert.ok(isGroupPac('American Federation of State, County and Municipal Employees',afscme),'"&" and "and" are the same');
  assert.ok(!isGroupPac('American',afscme),'too short a prefix does not match');
  assert.ok(isGroupPac('Seiu Cope',G('seiu')),'a short name matches by pattern');
  const aft=G('aft');
  assert.ok(isGroupPac('American Federation of Teachers, AFL-CIO',aft));
  assert.ok(!isGroupPac('American Federation of Teachers Staff U',aft),'the AFT staff union is not the AFT');
  assert.ok(!isGroupPac('Transportation Trades Department Afl-ci',G('aflcio')),'an AFL-CIO department is not the AFL-CIO');
  assert.ok(!isGroupPac('',afscme));
});

test('a vote matches when the cast vote is the one the group wanted; no vote is not compared',()=>{
  assert.equal(matchOf('Yea','Yea'),true);assert.equal(matchOf('Aye','Yea'),true);assert.equal(matchOf('No','Yea'),false);
  assert.equal(matchOf('Nay','Nay'),true);assert.equal(matchOf('Not Voting','Nay'),null);assert.equal(matchOf('Present','Yea'),null);
});

test('every group position is on a saved roll call, with a wanted vote, a kind of source and a link',()=>{
  const votes=new Set([...D.votes,...D.hvotes].map(v=>v.id)),keys=new Set();
  for(const g of D.groupPos){
    assert.ok(!keys.has(g.key),`${g.key} listed twice`);keys.add(g.key);
    assert.ok(['done','pending'].includes(g.status),g.key);
    assert.equal(g.nPositions,g.positions.length,`${g.key} count`);
    if(g.status==='done'&&!g.positions.length)assert.ok(g.notFound,`${g.key} says why it has no positions`);
    for(const re of g.pacMatch||[])new RegExp(re,'i');
    const seen=new Set();
    for(const q of g.positions){
      assert.ok(votes.has(q.voteId),`${g.key}: ${q.voteId} is not saved`);assert.ok(!seen.has(q.voteId),`${g.key}: ${q.voteId} twice`);seen.add(q.voteId);
      assert.ok(['Yea','Nay'].includes(q.wanted),`${g.key} ${q.voteId}`);
      assert.ok(['key_vote_alert','scorecard','statement'].includes(q.basis),`${g.key} ${q.voteId} basis`);
      assert.ok(q.scoredAs,`${g.key} ${q.voteId}`);assert.match(q.src?.u||'',/^https:\/\//,`${g.key} ${q.voteId} needs a source`);assert.ok(q.src.t);
    }
  }
});

test('the saved funders match a rebuild (run node scripts/build-funders.mjs after changing the groups or the money)',()=>{
  assert.deepEqual(funderChanges(D),[]);
  for(const p of people(D))assert.deepEqual(p.funderPos||[],personFunders(D,p),p.id);
});

test('each funder entry: money adds up, votes are the group\'s positions next to the person\'s vote',()=>{
  const byVote=new Map([...D.votes,...D.hvotes].map(v=>[v.id,v]));
  for(const p of people(D))for(const f of p.funderPos||[]){
    assert.ok(f.pac+(f.routed||0)+f.for+f.against>0,`${p.id} ${f.key} has no money`);
    const g=G(f.key);assert.ok(g,f.key);
    for(const c of f.compared){
      const q=g.positions.find(x=>x.voteId===c.voteId);assert.ok(q,`${p.id} ${f.key} ${c.voteId}`);
      assert.equal(c.wanted,q.wanted);assert.equal(c.cast,byVote.get(c.voteId).pos[p.id]);
    }
    assert.equal(f.n,f.compared.filter(c=>c.match!==null).length);assert.equal(f.agree,f.compared.filter(c=>c.match).length);
  }
  // Heritage Action's money is its super PAC's outside spending.
  assert.ok(people(D).some(p=>(p.funderPos||[]).some(f=>f.key==='heritage'&&f.for+f.against>0&&f.spenders.includes('The Sentinel Action Fund'))));
});
