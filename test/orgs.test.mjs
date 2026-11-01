import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {makeOrgs,GROUP_ABOUT,EMPLOYER_ABOUT} from '../public/orgs.js';
const data=JSON.parse(await fs.readFile(new URL('../public/research.json',import.meta.url),'utf8'));
const orgs=makeOrgs(data);

test('every group whose positions are collected has a description',()=>{
  for(const g of data.groupPos)assert.ok(GROUP_ABOUT[g.key],g.key);
  assert.equal(orgs.about(data.groupPos[0].org),GROUP_ABOUT[data.groupPos[0].key]);
});
test('outside spenders: the researched note first, then what kind of committee it is',()=>{
  const noted=data.ie.cm.find(c=>c[3]&&c[2]==='super_pac');
  const a=orgs.spender(noted);assert.ok(a.startsWith(noted[3]));assert.match(a,/Super PAC/);
  const party=data.ie.cm.find(c=>c[2]==='party');assert.match(orgs.spender(party),/Party committee/);
  assert.match(orgs.about('Nrsc'),/Republican Party's committee for Senate races/);
});
test('PACs: built from the assigned sector and stated orientation; employers say they are employees\' giving',()=>{
  const i=Object.keys(data.pacOrient).map(Number).find(n=>data.members.some(s=>s.pac.rows.some(r=>r[0]===n)));
  assert.match(orgs.pac(i),new RegExp(`Orientation: ${data.pacOrient[i].replace(/[()]/g,'\\$&')}`));
  const labor=data.members.flatMap(s=>s.pac.rows).find(r=>r[2]==='labor');
  assert.match(orgs.pac(labor[0]),/labor union.*People-aligned/);
  assert.equal(orgs.about('Anything Inc','employer'),EMPLOYER_ABOUT);
  assert.equal(orgs.about('A name found nowhere'),null,'no description is made up for an unknown name');
});
