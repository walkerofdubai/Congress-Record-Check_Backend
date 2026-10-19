// Which way a Yea or a Nay leans, from the issue sides marked "liberal" in research.json (issues[].liberalSide).
// Shared by the page and the tests. A bill is marked only when its coded issues all point the same way.
export const KV_MIN=3;

// 'liberal' | 'conservative' | null: what a Yea vote on this bill means.
export function leanOfVote(v,issues){
  const sides=(v.codes||[]).map(c=>{const i=issues[c.issue];return i&&i.liberalSide?(c.yea===i.liberalSide?'liberal':'conservative'):null}).filter(Boolean);
  return sides.length&&sides.every(x=>x===sides[0])?sides[0]:null;
}

// Why a bill is not marked, in plain words.
export function whyNotMarked(v,issues){
  const codes=v.codes||[];
  if(!codes.length)return v.excluded||'It is not mapped to an issue.';
  const open=codes.map(c=>issues[c.issue]).find(i=>i&&!i.liberalSide);
  return open?open.leanNote:'Its coded issues point in different directions, so it is not marked.';
}

// The side a person took: a Yea takes the marked side, a Nay takes the other; anything else (absent, not in office) takes none.
export function sideTaken(lean,pos){
  if(pos!=='Yea'&&pos!=='Nay')return null;
  return pos==='Yea'?lean:(lean==='liberal'?'conservative':'liberal');
}

// The marked bills one person voted Yea or Nay on, from a chamber's list of votes.
export function keyVoteRows(votes,personId,issues){
  const rows=[];
  for(const v of votes){
    const lean=leanOfVote(v,issues);if(!lean)continue;
    const pos=(v.pos||{})[personId];const side=sideTaken(lean,pos);if(!side)continue;
    rows.push({v,lean,pos,side});
  }
  return rows;
}

// share = fraction of those marked bills on which they took the conservative side (0 = always liberal side, 1 = always conservative).
export function keyVoteScore(rows){
  const n=rows.length, con=rows.filter(r=>r.side==='conservative').length;
  return {rows,n,con,lib:n-con,share:n?con/n:null,ok:n>=KV_MIN};
}
