import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const data=JSON.parse(await fs.readFile(new URL('../public/research.json',import.meta.url),'utf8'));
const people=data.members.concat(data.cands||[]);
test('every ethics item that is shown on the Overview has a valid status tag',()=>{
  for(const p of people)for(const e of p.ethics){
    if(e.outcome==='None found')continue;
    assert.ok(['allegation','investigation','finding'].includes(e.status),`${p.id}: "${e.title}" needs status allegation, investigation or finding`);
  }
});
test('campaign money sources add up to total receipts, so the Overview bar is a complete split',()=>{
  for(const p of people){
    const c=p.camp;if(c.missing)continue;
    const parts=(c.itemized||0)+(c.unitemized||0)+(c.pac||0)+(c.party||0)+(c.self||0)+(c.transfers||0)+Math.max(0,c.other||0);
    assert.ok(Math.abs(parts-c.receipts)<=1,`${p.id}: sources add to ${parts}, receipts are ${c.receipts}`);
    assert.ok(c.itemized!=null&&c.unitemized!=null,`${p.id}: small/large donor split missing`);
  }
});
test('every statement check has an assessment the tally knows how to group',()=>{
  const known=new Set(['consistent','partial','changed','contradiction','unclear','outcome']);
  for(const p of people)for(const x of p.statements)assert.ok(known.has(x.assessment),`${p.id}: ${x.topic} has assessment ${x.assessment}`);
});
test('ideology chart: scored people sit on the dim1 scale and the chamber pools exist',()=>{
  assert.ok(data.pools.S.length>0&&data.pools.H.length>0);
  for(const p of people)if(p.ideo){assert.ok(Math.abs(p.ideo.dim1)<=1.05,`${p.id}: dim1 ${p.ideo.dim1}`);}
});
// ---- key votes marked liberal or conservative ----
const {KV_MIN,leanOfVote,whyNotMarked,keyVoteRows,keyVoteScore}=await import('../public/lean.js');
const issues=Object.fromEntries(data.issues.map(i=>[i.id,i]));
const allVotes=data.votes.concat(data.hvotes);
test('every issue says which side is liberal, or why it is not marked',()=>{
  for(const i of data.issues){
    assert.ok(['A','B',null].includes(i.liberalSide),`${i.id}: liberalSide must be A, B or null`);
    if(i.liberalSide===null)assert.ok(i.leanNote&&i.leanNote.length>20,`${i.id}: an unmarked issue needs a leanNote`);
  }
});
test('no bill is coded to issues that point in opposite directions',()=>{
  for(const v of allVotes){
    const sides=(v.codes||[]).filter(c=>issues[c.issue]?.liberalSide).map(c=>c.yea===issues[c.issue].liberalSide?'liberal':'conservative');
    assert.ok(new Set(sides).size<=1,`${v.id}: mixed directions ${sides}`);
  }
});
test('well-known bills are marked the way the party-line debate runs',()=>{
  const lean=id=>leanOfVote(allVotes.find(v=>v.id===id),issues);
  assert.equal(lean('117-2-170'),'liberal');       // Women's Health Protection Act
  assert.equal(lean('117-2-325'),'liberal');       // Inflation Reduction Act
  assert.equal(lean('h-119-2-011'),'liberal');     // ACA tax credit extension
  assert.equal(lean('119-1-7'),'conservative');    // Laken Riley Act (Senate)
  assert.equal(lean('h-119-1-102'),'conservative');// SAVE Act
  assert.equal(lean('119-1-372'),'conservative');  // One Big Beautiful Bill Act
  assert.equal(lean('119-1-598'),null);            // Canada tariffs: not a liberal vs conservative question
  assert.equal(lean('117-2-134'),null);            // a Supreme Court nomination
});
test('every unmarked bill can say why it is not marked',()=>{
  for(const v of allVotes)if(!leanOfVote(v,issues))assert.ok(whyNotMarked(v,issues).length>20,v.id);
});
test('a Nay takes the opposite side, and absences count for nothing',()=>{
  const v={id:'t',codes:[{issue:'abortion',yea:'A'}],pos:{a:'Yea',b:'Nay',c:'Not Voting',d:'Not in office'}};
  const rows=id=>keyVoteRows([v],id,issues);
  assert.equal(rows('a')[0].side,'liberal');
  assert.equal(rows('b')[0].side,'conservative');
  assert.equal(rows('c').length,0);assert.equal(rows('d').length,0);
});
test('key-vote scores line up with party: nearly every scored Republican sits right of every scored Democrat in the same chamber',()=>{
  for(const [chamber,votes] of [['S',data.votes],['H',data.hvotes]]){
    const scored=people.filter(p=>((p.ideoKind==='house')?'H':p.chamber)===chamber).map(p=>({p,k:keyVoteScore(keyVoteRows(votes,p.id,issues))})).filter(x=>x.k.n>=KV_MIN);
    const rep=scored.filter(x=>x.p.party==='R').map(x=>x.k.share), dem=scored.filter(x=>x.p.party==='D').map(x=>x.k.share);
    assert.ok(rep.length>=3&&dem.length>=3,`${chamber}: too few scored people`);
    const mean=a=>a.reduce((x,y)=>x+y,0)/a.length;
    assert.ok(mean(rep)-mean(dem)>0.4,`${chamber}: Republican mean ${mean(rep)} vs Democrat mean ${mean(dem)}`);
  }
});
