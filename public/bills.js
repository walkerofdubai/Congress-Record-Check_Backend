// The Bills page's list (research.json "billIndex"): every bill behind a saved roll call or on file for Workers > Profit,
// one entry per bill family (a bill, its versions in other Congresses and its companion measures), with the saved votes on
// it and every group position on file for it. Kept apart from app.js so the tests can check it against the research.
import {BILL_GROUPS} from './grades.js';
import {voteBill} from './scoring.js';
import {GROUP_ABOUT} from './orgs.js';

// Groups that took sides on bills but have no funder record here (research.json groupPos).
export const EXTRA_GROUPS={
  aclu:{org:'ACLU',about:'Civil-liberties advocacy group. It scores members of Congress on the votes it lobbies on.'}};

// A group's name, whether it has PACs on file, and what those PACs and its outside spending put into the campaigns on
// this site (from each person's funders, research.json funderPos).
export function groupInfo(data,key){
  const gp=(data.groupPos||[]).find(g=>g.key===key);
  let pac=0,routed=0,out=0;const people=new Set();
  for(const p of [...(data.members||[]),...(data.cands||[]),...(data.featured||[])])for(const f of p.funderPos||[]){
    if(f.key!==key)continue;const a=(f.pac||0),r=(f.routed||0),b=(f.for||0)+(f.against||0);pac+=a;routed+=r;out+=b;if(a+r+b>0)people.add(p.id);}
  const pacs=gp?new Set([...(gp.committees||[]),...(gp.fecIds||[]).map(f=>f.name)]).size||(gp.pacMatch||[]).length:0;
  return {key,org:gp?.org||BILL_GROUPS[key]?.org||EXTRA_GROUPS[key]?.org||key,about:GROUP_ABOUT[key]||EXTRA_GROUPS[key]?.about||null,
    pacs,pac,routed,out,people:people.size};
}

const BASIS_FROM={key_vote_alert:'key vote',scorecard:'scorecard',statement:'statement'};
// Why a group's wanted vote on a roll call is counted, in a sentence.
function whyOf(q,chamber){
  const yn=q.wanted==='Yea'?'yes':'no';
  if(q.basis==='key_vote_alert')return `Key-vote letter: urged a ${yn} vote in the ${chamber}.`;
  if(q.basis==='scorecard')return `Scorecard: counted a ${yn} vote in the ${chamber} as the right one.`;
  return `${String(q.scoredAs||'Public statement').replace(/\.$/,'')}. Counted as wanting a ${yn} vote in the ${chamber}.`;
}
// Each group's wanted vote on each saved roll call (research.json groupPos positions: scorecards, key-vote letters and
// statements), in the groups' order.
function wantedByVote(data){
  const by=new Map();
  for(const g of data.groupPos||[])for(const q of g.positions||[]){
    if(q.wanted!=='Yea'&&q.wanted!=='Nay')continue;
    const m=by.get(q.voteId)||by.set(q.voteId,new Map()).get(q.voteId);if(!m.has(g.key))m.set(g.key,q);}
  return by;
}

// The families, with their votes (newest first) and positions. scored: the Workers > Profit bills with their scores.
export function billFamilies(data,scored=data.bills||[]){
  const keyOf=new Map(),out=[];
  for(const b of data.billIndex||[]){
    const work=scored.find(x=>x.id===b.id)||null;
    const keys=[...new Set([b.id,...(b.versions||[]),...(work?.versions||[])])];
    const e={...b,keys,work,votes:[],positions:[]};out.push(e);
    for(const k of keys)if(!keyOf.has(k))keyOf.set(k,e);
  }
  for(const [list,chamber] of [[data.votes||[],'Senate'],[data.hvotes||[],'House']])for(const v of list){
    const k=voteBill(v),e=k&&keyOf.get(k);if(e)e.votes.push({...v,chamber,billKey:k});}
  const wanted=wantedByVote(data);
  for(const e of out){
    e.votes.sort((a,b)=>String(b.date).localeCompare(String(a.date)));
    // The researched positions first, then the Workers > Profit sides, then each group's positions on the saved votes
    // (newest vote first); one per group.
    const seen=new Set(),add=p=>{if(seen.has(p.group))return;seen.add(p.group);e.positions.push(p);};
    for(const p of e.groups||[])add({...p,from:'research'});
    for(const p of e.work?.sides||[])add({...p,from:'bill'});
    for(const v of e.votes)for(const [group,q] of wanted.get(v.id)||[])add({group,pos:q.wanted==='Yea'?'support':'oppose',date:v.date,src:q.src||null,from:BASIS_FROM[q.basis]||'statement',vote:v.id,why:whyOf(q,v.chamber)});
    e.when=e.status==='law'?e.date:(e.votes[0]?.date||e.date||'');
    e.area=e.area||e.votes[0]?.area||null;
    e.summary=e.summary||e.votes.find(v=>v.bill?.summary)?.bill.summary||null;
    e.summarySrc=e.summarySrc||e.votes.find(v=>v.bill?.summary)?.bill.summarySrc||null;
  }
  return out.sort((a,b)=>String(b.when).localeCompare(String(a.when)));
}

// Saved roll calls on bills that aren't in the list (the tests keep this empty). Nominations, objections and impeachment
// articles aren't bills.
export function unlisted(data){
  const keys=new Set(billFamilies(data).flatMap(e=>e.keys));
  return [...(data.votes||[]),...(data.hvotes||[])].map(v=>[v.id,voteBill(v)]).filter(([,k])=>k&&!/-[hs]res-/.test(k)&&!keys.has(k));
}

// Evidence for Your match from the bills on this list that count there (entries with an "issue" and a "side"): each
// profiled sponsor or cosponsor (their "cosponsors", from scripts/fill-bill-cosponsors.mjs) gets one action on that
// issue, toward the bill's side. Returns Map person -> [{issue, entry}], entries in the shape of research.json evidence.
const TYPE_LABEL={hr:'H.R.',s:'S.',hjres:'H.J.Res.',sjres:'S.J.Res.',hres:'H.Res.',sres:'S.Res.',hconres:'H.Con.Res.',sconres:'S.Con.Res.'};
const TYPE_PATH={hr:'house-bill',s:'senate-bill',hjres:'house-joint-resolution',sjres:'senate-joint-resolution',hres:'house-resolution',sres:'senate-resolution',hconres:'house-concurrent-resolution',sconres:'senate-concurrent-resolution'};
export function issueEvidence(data){
  const issues=new Set((data.issues||[]).map(i=>i.id)),out=new Map();
  for(const b of data.billIndex||[]){
    if(!b.issue||!issues.has(b.issue)||!['A','B'].includes(b.side))continue;
    // One entry per person and bill: the current version when they sponsored or cosponsored it, otherwise the latest
    // earlier version (a bill counts once across its versions in different Congresses).
    const rows=[...(b.cosponsors||[])].sort((x,y)=>((y.bill||b.id)===b.id)-((x.bill||b.id)===b.id)||String(y.date||'').localeCompare(String(x.date||''))),seen=new Set();
    for(const r of rows){
      if(seen.has(r.person))continue;seen.add(r.person);
      const [c,t,n]=String(r.bill||b.id).split('-'),label=`${TYPE_LABEL[t]||t.toUpperCase()} ${n}`;
      const entry={type:r.sponsor?'sponsored':'cosponsored',ref:`${b.id}:${r.person}`,bill:b.id,title:`${label}: ${b.title}`,date:r.date||null,
        pos:r.sponsor?'Sponsored':'Cosponsored',side:b.side,why:b.why,src:{t:`${label} on Congress.gov`,u:`https://www.congress.gov/bill/${c}th-congress/${TYPE_PATH[t]}/${n}`}};
      (out.get(r.person)||out.set(r.person,[]).get(r.person)).push({issue:b.issue,entry});
    }
  }
  return out;
}
