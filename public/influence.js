// The Money & Influence Analysis: shown beside the grades, never inside them. It shows timing and alignment, not proof
// that money caused a decision. Shared by the page, the monthly scoring script and the tests. Values the methodology
// still lists under "Open decisions" are marked (placeholder).
export const TOP_DONORS=20, SWING=0.5, WINDOW_MONTHS=6; // (placeholder) top 20 donors, a 50% change, a 6-month window

// Donor alignment for the tree map and the outside-spending chart: unions and small-dollar donors are People-aligned,
// corporate PACs and industry groups Profit-aligned, and everything else (party, leadership, ideological) Other.
export const ALIGN_LABEL={people:'People-aligned',profit:'Profit-aligned',other:'Other'};
const OTHER_CATS=new Set(['lead','ideo','tribal','other','party']);
export const categoryAlign=cat=>cat==='labor'?'people':!cat||OTHER_CATS.has(cat)?'other':'profit';

// Outside spenders have no industry code, so the app assigns a sector from the committee's name (placeholder until
// reviewed), the same way PAC sectors are assigned. Party committees are their own group; any name that matches no
// rule counts as ideological, single-issue or candidate-aligned.
const SPENDER_RULES=[
  ['labor',/afl-?cio|\bseiu\b|service employees|afscme|state,? county (&|and) municipal|teamsters|\bibew\b|\buaw\b|machinists|carpenters|laborers'? international|nurses united|federation of teachers|education association|theatrical stage employees|sponsored by labor|league of labor voters|working america|workers union|employees union/i],
  ['finance',/credit unions?|bankers|financial services|securities|fairshake|crypto|blockchain/i],
  ['realestate',/realtors?|home ?builders|builders and contractors|construction/i],
  ['manuf',/chemistry council|manufacturers/i],
  ['oil',/petroleum|oil (and|&) gas|natural gas|\bcoal\b|mining/i],
  ['utility',/electric (cooperative|power)|utilities|nuclear energy/i],
  ['pharma',/pharmaceutical|\bphrma\b|biotechnology/i],
  ['insur',/insurance|insurers/i],
  ['health',/medical association|hospital association|physicians/i],
  ['tech',/technology association|telecommunications|broadband|wireless association/i],
  ['biz',/chamber of commerce|business roundtable|federation of independent business/i],
];
export function spenderSector(name,cls){
  if(cls==='party')return 'party';
  for(const [cat,re] of SPENDER_RULES)if(re.test(name||''))return cat;
  return 'ideo';
}
export const SECTOR_LABEL_EXTRA={party:'Party committees',ideo:'Ideological, single-issue & candidate-aligned groups'};

// Outside spending for and against, by sector. cms: [[committeeIndex, for, against, ...]]; committee(i) -> [id, name, cls].
export function outsideBySector(cms,committee){
  const sum={for:{},against:{}};
  for(const [ci,f,a] of cms||[]){const [,name,cls]=committee(ci),cat=spenderSector(name,cls);
    if(f>0)sum.for[cat]=(sum.for[cat]||0)+f;if(a>0)sum.against[cat]=(sum.against[cat]||0)+a;}
  const side=o=>Object.entries(o).map(([cat,amount])=>({cat,amount,align:categoryAlign(cat)})).sort((x,y)=>ALIGN_ORDER[x.align]-ALIGN_ORDER[y.align]||y.amount-x.amount);
  return {for:side(sum.for),against:side(sum.against)};
}
const ALIGN_ORDER={people:0,profit:1,other:2};

// Top donors for the tree map: the largest PAC donors (summed across filings) and small-dollar donors as one tile.
// pacRows: [[nameIndex, amount, category, filing]]; names: index -> PAC name.
export function topDonors(pacRows,names,smallDollar,n=TOP_DONORS){
  const by=new Map();
  for(const [ni,amt,cat] of pacRows||[]){const o=by.get(ni)||{label:names[ni]||'Unnamed PAC',value:0,cat};o.value+=amt;by.set(ni,o);}
  const pacs=[...by.values()].filter(o=>o.value>0).sort((a,b)=>b.value-a.value);
  const tiles=pacs.slice(0,smallDollar>0?n-1:n).map(o=>({...o,align:categoryAlign(o.cat)}));
  if(smallDollar>0)tiles.push({label:'Small-dollar donors ($200 or less)',value:smallDollar,cat:'small',align:'people'});
  return {tiles:tiles.sort((a,b)=>b.value-a.value),rest:Math.max(0,pacs.length-(smallDollar>0?n-1:n)),restAmount:pacs.slice(smallDollar>0?n-1:n).reduce((t,o)=>t+o.value,0)};
}

// Vote Donor Alignment: of the votes on bills a donor took a public position on (scorecards, key-vote letters), the
// share that went the donor's way. Only groups that gave to the campaign count; missed votes count for nothing.
export function voteDonorAlignment(funders){
  const rows=(funders||[]).filter(f=>f.pac>0||f.routed>0).map(f=>{const c=(f.compared||[]).filter(x=>x.match===true||x.match===false);return {org:f.org,key:f.key,n:c.length,same:c.filter(x=>x.match).length};}).filter(r=>r.n);
  const n=rows.reduce((t,r)=>t+r.n,0),same=rows.reduce((t,r)=>t+r.same,0);
  return {pct:n?Math.round(same/n*100):null,n,same,rows};
}

// Donor Loyalty Index 🤝: how much more often they vote the way their funders wanted than the rest of their party does on
// the same votes. For each funder that gave to the campaign or spent for them and took public positions on votes they cast
// (scorecards, key-vote letters): their rate of voting its way, minus their party's rate on those votes from each roll
// call's party totals (their own vote left out), in points. Funders are weighted by the money each gave, bundled (donors'
// gifts forwarded through its PAC) or spent for them, but no funder counts more than all the others put together (at
// most half the weight), so one big funder with a vote or two can't decide the index on its own.
// Only the part above the party average counts, up to the ceiling. An independent is compared with the party they caucus
// with (both sitting independents caucus with the Democrats). tallies: {voteId: {R:{Yea,Nay}, D:{...}, I:{...}}}.
export const DONOR_LOYALTY={ceiling:25,minVotes:5}; // (placeholder) 25 points above the party average scores 100
const yesNo=v=>({yea:'Yea',aye:'Yea',yes:'Yea',guilty:'Yea',nay:'Nay',no:'Nay','not guilty':'Nay'})[String(v??'').trim().toLowerCase()]||null;
export function donorLoyalty(funders,party,tallies){
  const P=party==='I'?'D':party,rows=[];let positions=0;
  for(const f of funders||[]){
    const money=(f.pac||0)+(f.routed||0)+(f.for||0);if(!(money>0))continue;
    const votes=[];
    for(const c of f.compared||[]){
      if(c.match!==true&&c.match!==false)continue;positions++;
      const t=tallies?.[c.voteId]?.[P],wanted=yesNo(c.wanted);if(!t||!wanted)continue;
      const other=wanted==='Yea'?'Nay':'Yea',own=party===P?yesNo(c.cast):null;
      const w=(t[wanted]||0)-(own===wanted?1:0),o=(t[other]||0)-(own===other?1:0);
      if(w+o>0)votes.push({voteId:c.voteId,match:c.match,party:w/(w+o)});
    }
    if(!votes.length)continue;
    const same=votes.filter(v=>v.match).length,rate=same/votes.length,partyRate=votes.reduce((t,v)=>t+v.party,0)/votes.length;
    rows.push({org:f.org,key:f.key,money,n:votes.length,same,rate:Math.round(rate*100),partyRate:Math.round(partyRate*100),diff:Math.round((rate-partyRate)*1000)/10});
  }
  rows.sort((a,b)=>b.money-a.money);
  const n=rows.reduce((t,r)=>t+r.n,0),total=rows.reduce((t,r)=>t+r.money,0);
  for(const r of rows)r.weight=rows.length>1?Math.min(r.money,total-r.money):r.money;
  const wsum=rows.reduce((t,r)=>t+r.weight,0);for(const r of rows)r.share=Math.round(r.weight/wsum*100);
  if(!rows.length)return {index:null,why:!positions?'No funder took a position on their votes':!tallies?'Party totals not loaded':'No party totals for these votes',n:0,diff:null,rows};
  const diff=Math.round(rows.reduce((t,r)=>t+r.diff*r.weight,0)/wsum*10)/10;
  if(n<DONOR_LOYALTY.minVotes)return {index:null,why:'Not enough data',n,diff,rows};
  return {index:Math.round(Math.min(100,Math.max(0,diff)/DONOR_LOYALTY.ceiling*100)),why:null,n,diff,rows};
}

// The business funders for the Corporation Compromised Index 🏢 (public/grades.js): business lobbies, industries' trade
// associations, and the free-market groups the index's design names (Americans for Prosperity, Club for Growth). Keys of
// research.json groupPos.
export const BUSINESS_FUNDERS=['chamber','nfib','afp','cfg','aba','mba','icba','nar','phrma','aha','acu','fairshake'];
// Donor Loyalty for the business funders only, weighted by the money they gave or bundled to the campaign (not by what they
// spent on their own, which the candidate can't control).
export function businessLoyalty(funders,party,tallies){
  const set=new Set(BUSINESS_FUNDERS);
  return donorLoyalty((funders||[]).filter(f=>set.has(f.key)).map(f=>({...f,for:0})),party,tallies);
}

// Months: "2026-03" arithmetic.
export const addMonths=(m,k)=>{let y=+m.slice(0,4),mo=+m.slice(5,7)-1+k;y+=Math.floor(mo/12);mo=((mo%12)+12)%12;return `${y}-${String(mo+1).padStart(2,'0')}`;};
const sumMonths=(series,from,to)=>Object.entries(series).reduce((t,[m,v])=>m>=from&&m<=to?t+v:t,0);
// Timing flags (for review, never scored): around each decision, the donor's money in the 6 months before is compared
// with the decision month and the 5 after. A rise of 50% or more after a decision the donor wanted, or a drop of 50% or
// more after one it opposed, is flagged. A window that runs past the data is not judged.
// series: {"2026-03": amount}; decisions: [{date, match, label}]; through: last month with data.
export function timingFlags(org,series,decisions,through){
  const out=[];
  for(const d of decisions||[]){
    if(d.match!==true&&d.match!==false)continue;
    const m=d.date.slice(0,7),from=addMonths(m,-WINDOW_MONTHS),to=addMonths(m,WINDOW_MONTHS-1);
    if(to>through)continue;
    const before=sumMonths(series,from,addMonths(m,-1)),after=sumMonths(series,m,to);
    if(d.match&&after>0&&after>=before*(1+SWING))out.push({org,kind:'rose',decision:d,before,after,from,to});
    else if(!d.match&&before>0&&after<=before*(1-SWING))out.push({org,kind:'dropped',decision:d,before,after,from,to});
  }
  return out;
}
// A position change on an issue after a 50% shift in donations from a donor that took positions on that issue.
// changes: [{date, issue, label}]; issues: the issues the donor took positions on.
export function positionChangeFlags(org,series,issues,changes,through){
  const out=[];
  for(const c of changes||[]){
    if(!issues.has(c.issue))continue;
    const m=c.date.slice(0,7),from=addMonths(m,-2*WINDOW_MONTHS),mid=addMonths(m,-WINDOW_MONTHS);
    if(addMonths(m,-1)>through)continue;
    const earlier=sumMonths(series,from,addMonths(mid,-1)),recent=sumMonths(series,mid,addMonths(m,-1));
    if((earlier>0||recent>0)&&Math.abs(recent-earlier)>=Math.max(earlier,1)*SWING)out.push({org,kind:'changed',decision:c,before:earlier,after:recent,from,to:addMonths(m,-1)});
  }
  return out;
}
// Stock in a donor: a reviewed trade in a company whose name matches a donor organization that also took positions on
// bills the politician acted on.
export const corp=v=>String(v||'').toLowerCase().replace(/\b(inc|corp|corporation|co|company|plc|ltd|llc|holdings|group|class [a-z]|common stock)\b\.?/g,'').replace(/[^a-z0-9]/g,'');
// Trades in a donor's own company: [{org, trade}]. donors: [{org}].
export function tradesInDonors(trades,donors){
  const out=[];
  for(const t of trades||[]){const c=corp(t.company||t.asset);if(c.length<3)continue;
    for(const d of donors)if(corp(d.org)===c||(corp(d.org).startsWith(c)&&c.length>=5))out.push({org:d.org,donor:d,trade:t});}
  return out;
}
// The stock timing flag: a trade in a donor that also had a stake in their decisions (took a public position on a vote,
// positions > 0, or lobbied on a bill they acted on, stake: true).
export function stockFlags(trades,donors){
  return tradesInDonors(trades,donors.filter(d=>d.positions>0||d.stake)).map(({org,trade:t})=>({org,kind:'stock',decision:{date:t.traded,label:`${t.type||'Trade'} of ${t.company||t.asset}`},trade:t}));
}
