import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {compare,personScores,buildEntry} from '../scripts/scores-monthly.mjs';
import {makeScorer} from '../public/scoring.js';
const read=async f=>JSON.parse(await fs.readFile(new URL('../'+f,import.meta.url),'utf8'));
const research=await read('public/research.json');

test('each change in the monthly log says what moved and why',()=>{
  const was={a:{promises:{pct:67,kept:2,half:0,broken:1,counted:3},ethics:{pct:100,finding:0,open:0,closed:0,allegation:0,late:0,conflict:0},pvp:{pct:null,people:0,profit:0,actions:0}}};
  const now={a:{promises:{pct:67,kept:2,half:0,broken:1,counted:3},ethics:{pct:85,finding:0,open:1,closed:0,allegation:0,late:0,conflict:0},pvp:{pct:null,people:1,profit:0,actions:1}},
    b:{promises:{pct:null,kept:0,half:0,broken:0,counted:0},ethics:{pct:100,finding:0,open:0,closed:0,allegation:0,late:0,conflict:0},pvp:{pct:null,people:0,profit:0,actions:0}}};
  const c=compare(was,now);
  assert.deepEqual(c.find(x=>x.id==='a'&&x.grade==='ethics'),{id:'a',grade:'ethics',from:100,to:85,why:'+1 open investigation'});
  assert.equal(c.find(x=>x.id==='a'&&x.grade==='pvp').why,'+1 action for working people');
  assert.ok(!c.some(x=>x.id==='a'&&x.grade==='promises'),'an unchanged grade is not logged');
  assert.deepEqual(c.filter(x=>x.id==='b').map(x=>x.grade),['ethics'],'a new person is logged only where graded');
  assert.equal(compare({x:was.a},{}).at(-1).why,'No longer profiled');
});
test('the Ethics indexes are logged; an older entry without them reads as a rule change, not a broken count',()=>{
  const e=o=>({promises:{pct:null,kept:0,half:0,broken:0,counted:0},pvp:{pct:null,people:0,profit:0,actions:0},ethics:Object.assign({pct:80,finding:1,open:0,closed:0,allegation:0,late:0,conflict:0},o)});
  assert.equal(compare({a:e({})},{a:e({pct:90,legal:10,insider:null,dodger:null})})[0].why,'Rule or weight change');
  assert.equal(compare({a:e({pct:90,legal:10,insider:null,dodger:null})},{a:e({pct:80,legal:20,insider:null,dodger:null})})[0].why,'+10 Legal Trouble Index points');
  assert.equal(compare({a:e({legal:20,insider:null,dodger:null})},{a:e({legal:20,insider:0,dodger:null})}).length,0,'no data and 0 are the same');
});
test('the monthly scores agree with the page, and the committed log is well formed',async()=>{
  const committees=await read('public/committees.json'),sectors=await read('public/committee-sectors.json'),config=await read('data/config.json');
  const scorer=makeScorer(research,committees,sectors.committees);
  const collins=research.members.find(s=>s.id==='collins'),p=personScores(collins,scorer,null);
  assert.equal(p.ethics.pct,scorer.ethics(collins).pct);assert.equal(p.promises.pct,scorer.promises(collins).pct);
  const e=buildEntry(research,committees,sectors,null,config,'2026-11-01');
  assert.equal(Object.keys(e.scores).length,research.members.length+research.cands.length+(research.featured||[]).length);assert.match(e.research,/^[0-9a-f]{12}$/);
  const log=await read('public/score-log.json');
  assert.ok(log.entries.length>=1);
  for(const x of log.entries){assert.match(x.date,/^\d{4}-\d{2}-\d{2}$/);assert.ok(Array.isArray(x.changes));for(const s of Object.values(x.scores))for(const g of ['promises','ethics','pvp'])assert.ok(s[g].pct===null||(s[g].pct>=0&&s[g].pct<=100));}
  assert.deepEqual(log.entries.map(x=>x.date),[...log.entries.map(x=>x.date)].sort(),'newest last');
});
