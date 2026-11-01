// Which way a Yea or a Nay leans, from the issue sides marked "liberal" in research.json (issues[].liberalSide).
// Shared by the page and the tests. A bill is marked only when its coded issues all point the same way.
import {ACTION_TYPES,WEIGHT,oneCreditPerBill} from './grades.js';
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

// Position by issue: for each category, where a person's record sits between the liberal and conservative sides. It uses
// the evidence Your match uses: votes, sponsorships and official acts (one credit per bill), or, for an issue with no
// recorded action, statements at half weight (Rule 1). Issues without a liberal side (tariffs, Ukraine aid, war powers,
// Jan. 6, infrastructure) are not placed. Context only: it never counts toward a grade.
// Categories with no issue tracked yet are listed so the gap is visible; add an issue's id to place it.
export const POSITION_CATEGORIES=[
  ['Immigration',['immigration']],
  ['Taxes and government spending',['taxes','infra']],
  ['Civil liberties',[]],
  ['Environment and energy',['climate']],
  ['Health care',['health']],
  ['Abortion and reproductive rights',['abortion']],
  ['Guns',['guns']],
  ['Workers and wages',['labor']],
  ['Trade and tariffs',['tariffs']],
  ['Foreign policy and defense',['ukraine','warpowers']],
  ['Voting and elections',['voting','jan6']],
  ['Education',['vouchers']],
  ['Criminal justice and policing',[]],
  ['LGBTQ rights',['civil']],
  ['Housing',[]],
  ['Social Security and Medicare',[]],
];
// The fewest actions or statements a category needs before it gets a bar (a placeholder; see the methodology).
export const MIN_POSITION_ITEMS=1;

// status: 'placed' (lean from -100, all conservative, to +100, all liberal), 'none' (no record yet), 'unsided' (its
// issues don't split along liberal and conservative lines) or 'untracked' (no issue tracked yet).
export function positionByCategory(issues,evidence){
  const byId=new Map((issues||[]).map(i=>[i.id,i]));
  return POSITION_CATEGORIES.map(([label,ids])=>{
    const tracked=ids.filter(id=>byId.has(id)).map(id=>byId.get(id)),sided=tracked.filter(i=>i.liberalSide);
    if(!tracked.length)return {label,status:'untracked',issues:[]};
    if(!sided.length)return {label,status:'unsided',issues:tracked};
    let lib=0,con=0,record=0,stated=0,libItems=0,conItems=0;
    for(const i of sided){
      const ev=(evidence||{})[i.id]||[],rec=oneCreditPerBill(ev.filter(e=>ACTION_TYPES.has(e.type)));
      const basis=rec.length?rec:ev.filter(e=>e.type==='stated'),w=rec.length?WEIGHT.action:WEIGHT.statement;
      for(const e of basis){
        if(e.side===i.liberalSide){lib+=w;libItems++;}else if(e.side){con+=w;conItems++;}else continue;
        if(rec.length)record++;else stated++;
      }
    }
    const n=record+stated;
    if(n<MIN_POSITION_ITEMS)return {label,status:'none',issues:sided,n};
    return {label,status:'placed',issues:sided,lib:libItems,con:conItems,n,record,stated,lean:Math.round((lib-con)/(lib+con)*100)};
  });
}

// A senator's or representative's place in their chamber from Voteview's DW-NOMINATE pool ([score, party, name,
// bioguide] for each current member), in the shape the profiles use: lo is the share of the rest of the chamber more
// liberal, plo the share of their party (an independent is compared with the Democrats they caucus with).
export function poolIdeo(pool,bioguide,party){
  const me=(pool||[]).find(p=>p[3]===bioguide);if(!me)return null;
  const others=pool.filter(p=>p!==me),side=party==='R'?['R']:party==='I'?['D','I']:['D'],group=others.filter(p=>side.includes(p[1]));
  const pct=(list)=>list.length?Math.round(list.filter(p=>p[0]<me[0]).length/list.length*1000)/10:0;
  return {dim1:me[0],lo:pct(others),plo:pct(group),n:others.length,np:group.length};
}
