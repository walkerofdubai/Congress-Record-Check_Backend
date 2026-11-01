// Money pledges (step 7): a statement on the Promises tab tagged with research.json "pledge": {kind, since?, refunded?}
// is checked again against the records on file each time the page loads. The check is shown under the reviewed verdict
// and never replaces it: the Promise score still counts the reviewed verdict only. When the records point the other way
// from the review (the review says kept but money arrived or they voted against a ban, or the review says contradicted but
// the records show it kept), the check is flagged for the next review (npm run review:pledges).
//   corporate-pac       refuse corporate PAC money: PACs the FEC records as sponsored by a corporation (public/pac-types.js)
//   single-issue-pac    refuse single-issue and ideological PAC money: PACs in this app's "ideological, single-issue and
//                       advocacy" sector, plus donors' gifts a group bundled through its PAC (research.json "bundled")
//   stock-trading       back a ban on members' stock trading  ┐ research.json billIndex entries tagged "reform": their
//   lobbying            back a lobbying ban for former members├ sponsors and cosponsors (npm run bills:cosponsors), the
//   citizens-united     back overturning Citizens United      ┘ person's own sponsored bills, and their votes
// Money counts by FEC report: a report that starts on or after the pledge date is "after"; one that ends before it is
// "before"; the report covering the pledge date can't be split, so it is shown apart and decides nothing.
import {billKey,billKeyFromText} from './grades.js';
import {pacTypeOf} from './pac-types.js';

export const PLEDGE_KINDS={
  'corporate-pac':{label:'Refuse corporate PAC money',money:true},
  'single-issue-pac':{label:'Refuse single-issue and ideological PAC money',money:true},
  'stock-trading':{label:'Ban members\' stock trading'},
  'lobbying':{label:'Ban lobbying by former members of Congress'},
  'citizens-united':{label:'Overturn Citizens United'}};
export const OUTCOMES={
  kept:'Kept, by the records on file',
  'not-kept':'Money on file after the pledge',
  mixed:'Backed one, voted against another',
  against:'Voted against one, backed none on file',
  waiting:'Can\'t be checked yet',
  none:'Nothing on file to check it against'};
// PAC kinds listed beside a corporate-PAC check but not counted against it (a trade association's PAC is funded by its
// member companies' employees, not a company's).
export const BESIDE_CORPORATE=['trade','membership','cooperative'];
// Sectors this app assigns from a PAC's name that can't be a company's PAC, for PACs with no FEC type on file.
const NOT_COMPANY=new Set(['lead','labor','ideo','tribal']);
const norm=v=>String(v||'').toLowerCase().replace(/&/g,' and ').replace(/[^a-z0-9 ]/g,' ').replace(/\s+/g,' ').trim();
const cents=n=>Math.round(n*100)/100;
// The dates a set of reports covers: {start, end, n}, or null when there are none.
const span=fs=>fs.length?{start:fs.map(f=>f.start).sort()[0],end:fs.map(f=>f.end).sort().at(-1),n:fs.length}:null;

// Where a report falls against the pledge date (YYYY-MM-DD; null means the whole record on file counts).
export function reportTiming(filing,since){
  if(!since)return 'after';
  if(!filing?.start||!filing?.end)return 'during';
  return filing.start>=since?'after':filing.end<since?'before':'during';
}
// The pledge's start: its own "since" when set (null: the whole record), otherwise the day it was said.
export const pledgeSince=x=>x.pledge&&'since' in x.pledge?x.pledge.since:(/^\d{4}-\d{2}-\d{2}$/.test(x.said?.date||'')?x.said.date:null);

function moneyCheck(data,s,x){
  const kind=x.pledge.kind,since=pledgeSince(x),typed=Array.isArray(data.pacIds),pac=s.pac||{};
  const refunded=new Set((x.pledge.refunded||[]).map(r=>norm(r.pac)));
  const buckets={counted:{after:[],during:[],before:[]},beside:{after:[],during:[]},unknown:{after:[],during:[]},refunded:[]};
  for(const [i,amt,cat,fi] of pac.rows||[]){
    const name=(data.pacNames||[])[i],f=(pac.filings||[])[fi],when=reportTiming(f,since),t=pacTypeOf(data,i);
    const row={name,amount:amt||0,report:f?.report||null,start:f?.start||null,end:f?.end||null,url:f?.url||null,type:t?.label||null};
    if(refunded.has(norm(name))){buckets.refunded.push(row);continue;}
    if(kind==='corporate-pac'){
      if(t?.kind==='corporate')buckets.counted[when].push(row);
      else if(t&&BESIDE_CORPORATE.includes(t.kind)){if(when!=='before')buckets.beside[when].push(row);}
      else if(!t&&!NOT_COMPANY.has(cat)){if(when!=='before')buckets.unknown[when].push(row);}
    }else if(cat==='ideo')buckets.counted[when].push(row);
  }
  const sum=l=>cents(l.reduce((t,r)=>t+r.amount,0));
  // Gifts a group forwarded from its donors (single-issue pledges): dated by month when the bundled run saved months.
  const bundled=[];
  if(kind==='single-issue-pac')for(const [g,v] of Object.entries(data.bundled?.people?.[s.id]||{})){
    const org=(data.groupPos||[]).find(x=>x.key===g)?.org||g;
    if(v.byMonth){const by={after:0,during:0,before:0};for(const [m,a] of Object.entries(v.byMonth)){const w=!since?'after':m>since.slice(0,7)?'after':m<since.slice(0,7)?'before':'during';by[w]+=a;}
      for(const w of ['after','during','before'])if(by[w]>0)bundled.push({org,when:w,amount:cents(by[w]),src:v.src});}
    else if(v.routed>0)bundled.push({org,when:since?'undated':'after',amount:v.routed,src:v.src});
  }
  const after=sum(buckets.counted.after)+bundled.filter(b=>b.when==='after').reduce((t,b)=>t+b.amount,0);
  let outcome;
  if(!(pac.rows||[]).length&&!bundled.length)outcome='none';
  else if(after>0)outcome='not-kept';
  // A PAC after the pledge with no FEC type on file could be a company's, so the check waits for the PAC types.
  else if(kind==='corporate-pac'&&buckets.unknown.after.length)outcome='waiting';
  else outcome='kept';
  return {kind,since,typed,outcome,after:cents(after),counted:buckets.counted,beside:buckets.beside,unknown:buckets.unknown,refunded:buckets.refunded,bundled,
    totals:{after:sum(buckets.counted.after),during:sum(buckets.counted.during),before:sum(buckets.counted.before),beside:sum([...buckets.beside.after,...buckets.beside.during]),unknown:sum([...buckets.unknown.after,...buckets.unknown.during])},
    reports:(pac.filings||[]).length,span:span((pac.filings||[]).filter(f=>reportTiming(f,since)==='after'))};
}

const TYPE_LABEL={hr:'H.R.',s:'S.',hjres:'H.J.Res.',sjres:'S.J.Res.'},TYPE_PATH={hr:'house-bill',s:'senate-bill',hjres:'house-joint-resolution',sjres:'senate-joint-resolution'};
const billLabel=k=>{const [,t,n]=k.split('-');return `${TYPE_LABEL[t]||t.toUpperCase()} ${n}`;};
export const billUrl=k=>{const [c,t,n]=k.split('-');return `https://www.congress.gov/bill/${c}th-congress/${TYPE_PATH[t]||t}/${n}`;};
export const voteUrl=v=>v.roll!=null?`https://clerk.house.gov/Votes/${v.year}${v.roll}`:`https://www.senate.gov/legislative/LIS/roll_call_votes/vote${v.congress}${v.session}/vote_${v.congress}_${v.session}_${String(v.number).padStart(5,'0')}.htm`;

function billCheck(data,s,x){
  const kind=x.pledge.kind,entries=(data.billIndex||[]).filter(b=>(b.reform||[]).includes(kind)),actions=[];
  const votes=[...(data.votes||[]),...(data.hvotes||[])];
  for(const b of entries){
    const keys=new Set([b.id,...(b.versions||[])]),seen=new Set();
    for(const r of b.cosponsors||[])if(r.person===s.id){const k=r.bill||b.id;seen.add(k);
      actions.push({bill:b.id,title:b.title,way:'for',what:r.sponsor?'Sponsored':'Cosponsored',measure:billLabel(k),date:r.date||null,src:{t:`${billLabel(k)} on Congress.gov`,u:billUrl(k)}});}
    for(const sb of s.bills||[]){const k=billKey(sb.congress,sb.num);if(k&&keys.has(k)&&!seen.has(k)){seen.add(k);
      actions.push({bill:b.id,title:b.title,way:'for',what:'Sponsored',measure:billLabel(k),date:null,src:{t:`${billLabel(k)} on Congress.gov`,u:billUrl(k)}});}}
    for(const v of votes){const k=billKeyFromText(v.bill?.measure),pos=v.pos?.[s.id];
      if(!k||!keys.has(k)||(pos!=='Yea'&&pos!=='Nay'))continue;
      actions.push({bill:b.id,title:b.title,way:pos==='Yea'?'for':'against',what:`Voted ${pos}${v.question?` (${v.question})`:''}`,measure:billLabel(k),date:v.date||null,
        src:{t:v.roll!=null?`House roll call ${v.roll}, ${v.year}`:`Senate roll call ${v.number}, ${v.congress}th Congress`,u:voteUrl(v)}});}
  }
  const forBills=new Set(actions.filter(a=>a.way==='for').map(a=>a.bill)),againstBills=new Set(actions.filter(a=>a.way==='against').map(a=>a.bill));
  const outcome=forBills.size&&againstBills.size?'mixed':forBills.size?'kept':againstBills.size?'against':'none';
  actions.sort((a,b)=>String(b.date||'').localeCompare(String(a.date||'')));
  return {kind,outcome,actions,bills:entries.map(b=>({id:b.id,title:b.title})),forBills:forBills.size,againstBills:againstBills.size};
}

// The records on file for one tagged statement, or null when it isn't a pledge.
export function pledgeCheck(data,s,x){
  if(!x?.pledge||!PLEDGE_KINDS[x.pledge.kind])return null;
  const r=PLEDGE_KINDS[x.pledge.kind].money?moneyCheck(data,s,x):billCheck(data,s,x);
  r.label=PLEDGE_KINDS[r.kind].label;r.outcomeLabel=OUTCOMES[r.outcome];
  r.conflict=conflictWith(x.assessment,r.outcome);
  return r;
}
// Only a direct conflict with the reviewed verdict is flagged. Partly consistent, changed, ambiguous and outcome verdicts
// are judgment calls the records can't settle.
export function conflictWith(assessment,outcome){
  return (assessment==='consistent'&&(outcome==='not-kept'||outcome==='against'))||(assessment==='contradiction'&&outcome==='kept');
}
// Every pledge on file: [{person, statement, check}].
export function allPledges(data){
  const out=[];
  for(const s of [...(data.members||[]),...(data.cands||[]),...(data.featured||[])])
    for(const x of s.statements||[]){const check=pledgeCheck(data,s,x);if(check)out.push({person:s,statement:x,check});}
  return out;
}
