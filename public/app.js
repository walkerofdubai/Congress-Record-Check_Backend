import {KV_MIN,leanOfVote,whyNotMarked,sideTaken,keyVoteRows,keyVoteScore,positionByCategory,poolIdeo} from './lean.js';
import {MIN_CHECKS,MIN_PVP_ACTIONS,ETHICS_COST,CASE_KIND,CASE_AGE,INDEX_COST,LATE_DAYS,WEIGHT,ACTION_TYPES,letter,billKey,matchScore,promiseScore,moneyRatio,GAINS_STEPS,ACCESS_STEPS,BILL_GROUPS,BILL_STATUS,HOLDINGS,CORP_COMPROMISED,INSIDER,DODGER} from './grades.js';
import {makeScorer,voteBill} from './scoring.js';
import {money,hoverTips,tableView,legend,rankBars,stackRows,divergingRows,leanRows,categoryBars,drawScatter,drawDelay,drawTradeTimeline,drawCaseTimeline,drawTreemap,drawMonthly,sectorSpendBars} from './charts.js';
import {makeOrgs,SMALL_DOLLAR_ABOUT,EMPLOYER_ABOUT} from './orgs.js';
import {billFamilies,groupInfo,issueEvidence} from './bills.js';
import {sizeParts,sizeShare} from './donor-sizes.js';
import {pacTypeOf,pacKindTotals} from './pac-types.js';
import {rangeText} from './net-worth.js';
import {pledgeCheck} from './pledges.js';
import {holdingsLead} from './holdings.js';
import {ALIGN_LABEL,SECTOR_LABEL_EXTRA,TOP_DONORS,WINDOW_MONTHS,SWING,categoryAlign,outsideBySector,topDonors,voteDonorAlignment,donorLoyalty,DONOR_LOYALTY,timingFlags,positionChangeFlags,stockFlags,tradesInDonors,corp,addMonths} from './influence.js';
(function(){
const $=s=>document.querySelector(s);
const app=$('#app'), tip=$('#tip');
const MEM=DATA.members, CANDS=DATA.cands||[], ALL=MEM.concat(CANDS);
// Featured profiles (the president) get a card at the top of the home page and a full profile, but stay out of the
// filters, races, comparisons and score pages, which cover the 2026 ballot.
const FEATURED=DATA.featured||[];
const byId=Object.fromEntries(ALL.concat(FEATURED).map(s=>[s.id,s]));
// Every sitting senator (public/senate.json, from scripts/build-senate.mjs). Those without a reviewed profile get a basic
// one: their place in the Senate, their committees and the records the daily refresh collects, without grades.
const SENATE=(window.SENATE||[]).map(x=>({...x,chamber:'S',ideo:poolIdeo(DATA.pools?.S,x.bioguide,x.party)}));
const BASIC=Object.fromEntries(SENATE.filter(x=>!byId[x.id]).map(x=>[x.id,Object.assign(x,{basic:true,evidence:{},statements:[],ethics:[],bills:[]})]));
const BASIC_LIST=Object.values(BASIC);
// One ID per bill ("117-hr-1319"), so a vote and a sponsorship on the same bill count once.
const VOTE_BY_ID=new Map(DATA.votes.concat(DATA.hvotes).map(v=>[v.id,v]));
for(const s of ALL.concat(FEATURED))for(const ev of Object.values(s.evidence||{}))for(const e of ev){
  if(e.bill)continue;
  const v=VOTE_BY_ID.get(e.ref);if(v){e.bill=voteBill(v);continue;}
  const m=/:bill:(\d+)$/.exec(e.ref||''), b=m&&(s.bills||[])[+m[1]];if(b)e.bill=billKey(b.congress,b.num);
}
// Sponsorships and cosponsorships of the bills on the Bills page that count in Your match (public/bills.js).
for(const [id,list] of issueEvidence(DATA))for(const {issue,entry} of list){const s=byId[id];if(!s)continue;const ev=(s.evidence||={})[issue]||=[];if(!ev.some(e=>e.bill===entry.bill))ev.push(entry);}
// The reviewed grades come from public/scoring.js, shared with the monthly recalculation. Committee assignments
// (public/committees.json) and the sectors each committee oversees (public/committee-sectors.json) feed the Ethics
// committee-conflict check.
const COMMITTEES=window.COMMITTEES||{committees:{},people:{}}, COMMITTEE_SECTORS=window.COMMITTEE_SECTORS||{};
const SCORER=makeScorer(DATA,COMMITTEES,COMMITTEE_SECTORS,window.VOTE_PARTY);
const PVP_MARKS=SCORER.marks, PVP_BILLS=SCORER.bills, committeesOf=SCORER.committeesOf, fullCommittee=SCORER.fullCommittee, overseenSectors=SCORER.overseen;
const personPvp=SCORER.pvp, personTrading=SCORER.trading, personEthics=SCORER.ethics;
const icH=s=>s.ideoKind==='house'?'H':s.chamber;
const chipCh=s=>s.office?CH[s.chamber].member:s.senInc?'Senate':s.cand?(s.openSeat?'Senate candidate':(s.chamber==='S'?'Senate challenger':'House challenger')):CH[s.chamber].name;
const CH={S:{name:'Senate',noun:'senator',nouns:'senators',votes:DATA.votes,member:'Senate'},H:{name:'House',noun:'representative',nouns:'representatives',votes:DATA.hvotes,member:'House'},P:{name:'Presidency',noun:'president',nouns:'presidents',votes:[],member:'President'}};
const fmt$=n=>{if(n==null)return'—';const a=Math.abs(n);if(a>=1e6)return'$'+(n/1e6).toFixed(a>=1e7?1:2)+'M';if(a>=1e3)return'$'+(n/1e3).toFixed(a>=1e5?0:1)+'K';return'$'+n.toFixed(0)};
const fmtFull=n=>n==null?'—':'$'+Math.round(n).toLocaleString('en-US');
const pct=(a,b)=>b?Math.round(a/b*1000)/10:0;
const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const ASSESS={pending:['neutral','No related bill yet'],consistent:['good','Consistent'],contradiction:['crit','Direct contradiction'],partial:['warn','Partly consistent'],unclear:['neutral','Ambiguous or incomplete evidence'],changed:['serious','Changed position'],outcome:['neutral','Outcome check']};
const ICON={good:'✓',crit:'✕',warn:'◐',serious:'↻',neutral:'◇'};
const AICON={pending:'…',consistent:'✓',contradiction:'✕',partial:'◐',unclear:'?',changed:'↻',outcome:'◇'};
const posClass=p=>{p=(p||'').toLowerCase();if(p==='yea'||p==='guilty')return'yea';if(p==='nay'||p==='not guilty')return'nay';return'nv'};
const voteUrl=v=>v.roll!=null?`https://clerk.house.gov/Votes/${v.year}${v.roll}`:`https://www.senate.gov/legislative/LIS/roll_call_votes/vote${v.congress}${v.session}/vote_${v.congress}_${v.session}_${String(v.number).padStart(5,'0')}.htm`;
const partyName=p=>p==='R'?'Republican':p==='D'?'Democrat':'Independent';
const seatLabel=s=>s.chamber==='H'?s.district:s.state;
const REC_SHORT={senator:'Senator',member_of_congress:'House member',former_member_of_congress:'Ex-member of Congress',state_legislator:'State legislator',executive:'Executive office',none:'No elected office'};
const REC_LABEL={senator:'Sitting U.S. senator',member_of_congress:'Sitting U.S. House member',former_member_of_congress:'Former member of Congress',state_legislator:'State legislator',executive:'Executive / appointed office',none:'No prior elected office'};
const fmtDate=d=>{if(!d)return'—';const m=d.match(/^(\d{4})-(\d{2})-(\d{2})$/);if(!m)return d;return new Date(+m[1],+m[2]-1,+m[3]).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})};
const cgUrl=s=>`https://www.congress.gov/member/${s.name.toLowerCase().replace(/-/g,' ').replace(/[^a-z ]/g,'').trim().split(/\s+/).filter(w=>w.length>1).join('-')}/${s.bioguide}`;
const fecCandUrl=id=>id[0]==='P'?`https://www.fec.gov/data/candidate/${id}/`:`https://www.fec.gov/data/candidate/${id}/?cycle=2026&election_full=true`;
const fecCmteUrl=id=>`https://www.fec.gov/data/committee/${id}/?cycle=2026`;
const fecIeUrl=id=>`https://www.fec.gov/data/independent-expenditures/?data_type=processed&cycle=2026&candidate_id=${id}`;
let resizers=[];
window.addEventListener('resize',()=>{clearTimeout(window.__rz);window.__rz=setTimeout(()=>resizers.forEach(f=>f()),120)});

// ---------- ideology helpers ----------
function ideoText(s){
  const i=s.ideo;
  if(!i){
    if(s.ideoKind==='former_text'){const m=(s.ideoNote||'').match(/more (conservative|liberal) than \d+% of the \d+\w* (House|Senate)/i);const ph=m?m[0]:'scored by Voteview';return {head:'In Congress: '+ph,within:'',short:'Voteview: '+ph}}
    if(s.ideoKind==='state'&&s.stateIdeology)return {head:s.stateIdeology.text,within:'',short:s.stateIdeology.text};
    if(s.ideoKind==='former_noscore')return {head:'Former member of Congress',within:'',short:'Ideology score not retrieved'};
    if(hasStateLeg(s))return {head:'No comparable ideology score',within:'',short:(s.recordType==='state_legislator'?'State legislator':'Former state legislator')+' (no comparable score)'};
    return {head:'No legislative voting record',within:'',short:'No legislative voting record'};
  }
  const ch=CH[icH(s)].name, grp=s.party==='R'?(ch+' Republicans'):(ch+' Democrats');
  const hi=Math.round((100-i.lo)*10)/10, phi=Math.round((100-i.plo)*10)/10;
  const head=s.party==='R'?`More conservative than ${i.lo}% of the ${ch}`:`More liberal than ${hi}% of the ${ch}`;
  let within;
  if(s.party==='R') within=i.plo>=50?`more conservative than ${i.plo}% of ${grp}`:(i.plo===0?`the most moderate of ${i.np+1} ${grp} scored`:`more moderate than ${phi}% of ${grp}`);
  else within=phi>=50?`more liberal than ${phi}% of ${grp}`:(phi===0?`the most moderate of ${i.np+1} ${grp} scored`:`more moderate than ${i.plo}% of ${grp}`);
  const short=s.party==='R'?`More conservative than ${Math.round(i.lo)}% of ${ch}`:`More liberal than ${Math.round(hi)}% of ${ch}`;
  return {head,within,short};
}
const hasStateLeg=s=>s.recordType==='state_legislator'||!!(s.stateLeg&&s.stateLeg.length);
function noIdeoBlock(s){
  const t=ideoText(s);
  let body;
  if(s.ideoKind==='former_text') body=`<p style="margin:8px 0 0">${esc(s.short)} served in Congress (see offices held above). Voteview's own summary: <b>${esc((s.ideoNote||'').replace(/^.*?It says: /,'').replace(/^Voteview: /,''))}</b> <a href="${esc((s.ideoSrc||{}).u||'#')}" target="_blank" rel="noopener">Voteview ↗</a></p><p class="small muted" style="margin:6px 0 0">That comparison is with colleagues in that Congress, not today's, so it is not placed on the current-chamber chart used for sitting members.</p>`;
  else if(s.ideoKind==='state') body=`<p style="margin:8px 0 0">${esc(s.stateIdeology.text)} <a href="${esc(s.stateIdeology.src.u)}" target="_blank" rel="noopener">${esc(s.stateIdeology.src.t)} ↗</a></p><p class="small muted" style="margin:6px 0 0">A state-legislature ranking, not comparable with congressional DW-NOMINATE scores.</p>`;
  else if(s.ideoKind==='former_noscore') body=`<p style="margin:8px 0 0">${esc(s.short)} served in Congress, but Voteview's page did not show an ideology score or comparison for ${esc(s.short)} when this release was built, so no percentile is shown. ${esc(s.short)}'s congressional votes are listed below. ${s.ideoSrc?`<a href="${esc(s.ideoSrc.u)}" target="_blank" rel="noopener">Voteview record ↗</a>`:''}</p>`;
  else if(hasStateLeg(s)) body=`<p style="margin:8px 0 0">${esc(s.short)}'s legislative votes were cast in a state legislature, which has no published score comparable with congressional DW-NOMINATE. The record below lists ${s.recordType==='state_legislator'?esc(s.short)+"'s recorded votes and bills on major issues":'major official actions'+(s.recordType==='executive'?' in executive office':'')} instead.</p>`;
  else body=`<p style="margin:8px 0 0">${esc(s.short)} has not served in a legislature, so there is no roll-call record to score. The record below lists ${esc(s.short)}'s documented official actions and public commitments instead.</p>`;
  return `<div class="chart"><div class="kicker">Voting ideology</div><div class="big" style="margin-top:4px">${esc(t.head)}</div>${body}</div>`;
}
function ideoBlock(s,id){
  if(!s.ideo)return noIdeoBlock(s);
  const t=ideoText(s), i=s.ideo, C=icH(s);
  return `<div class="chart">
    <div class="ideo-head"><div><div class="kicker">Voting ideology · DW-NOMINATE</div><div class="big" style="margin-top:4px">${esc(t.head)}</div></div>
    <div class="mono muted">Score ${i.dim1>0?'+':''}${i.dim1.toFixed(3)} on a −1 (liberal) to +1 (conservative) scale</div></div>
    <p class="small" style="margin:8px 0 0;color:var(--ink-2)">Within the party: ${esc(t.within)}.${i.unity!=null?` Party unity: votes with the ${s.party==='R'?'Republican':'Democratic'} majority on <b class="num">${i.unity}%</b> of party-line votes${i.partyVotes?` (${i.withParty} of ${i.partyVotes} in the 119th Congress)`:''}.`:''}</p>
    <div class="ideo" id="${id}" style="margin-top:10px"></div>
    <div class="legend"><span><i style="background:var(--dem)"></i>Democrats</span><span><i style="background:var(--rep)"></i>Republicans</span>${C==='S'?'<span><i style="background:var(--muted)"></i>Independents</span>':''}<span><i style="background:var(--ink);border-radius:50%"></i>${esc(s.short)}</span></div>
    <div class="sub" style="margin:8px 0 0">${s.ideoKind==='house'?esc(s.short)+' is a sitting House member, so the comparison is with the current House. ':''}Each dot is one current ${CH[C].noun} with at least 100 scored votes (${i.n+1} in all). Hover a dot for the name. Source: Voteview DW-NOMINATE first dimension, which scores a member's whole career of roll-call votes. <a href="https://voteview.com/person/${esc(i.icpsr)}" target="_blank" rel="noopener">Voteview record ↗</a></div>
  </div>`;
}
function drawIdeo(el,s){
  if(!el||!s.ideo)return;
  const C=icH(s), pts=DATA.pools[C];
  const W=Math.max(280,el.clientWidth), small=W<520;
  const diam=C==='S'?(small?7:10):(small?4.4:6);
  const mL=10,mR=10,x0=-1.0,x1=1.05;
  const X=v=>mL+(Math.max(x0,Math.min(x1,v))-x0)/(x1-x0)*(W-mL-mR);
  const nb=Math.floor((W-mL-mR)/diam);
  const bins={};
  const order=pts.map((p,i)=>i).sort((a,b)=>pts[a][0]-pts[b][0]);
  const pos=new Array(pts.length);
  let maxS=0;
  order.forEach(i=>{const b=Math.min(nb-1,Math.floor((X(pts[i][0])-mL)/diam));const k=bins[b]||0;bins[b]=k+1;pos[i]=[mL+(b+.5)*diam,k];if(k+1>maxS)maxS=k+1;});
  const top=34, plotH=maxS*diam, base=top+plotH, H=base+64;
  const meIdx=pts.findIndex(p=>(s.bioguide&&p[3]===s.bioguide)||p[2]===s.name);
  const med=code=>{const v=pts.filter(p=>p[1]===code).map(p=>p[0]).sort((a,b)=>a-b);return v.length?v[Math.floor(v.length/2)]:null};
  const dM=med('D'), rM=med('R');
  let g='';
  pts.forEach((p,i)=>{if(i===meIdx)return;const [cx,k]=pos[i];g+=`<circle class="${p[1]==='R'?'r':p[1]==='D'?'d':'i'}" cx="${cx.toFixed(1)}" cy="${(base-(k+.5)*diam).toFixed(1)}" r="${(diam/2-.6).toFixed(2)}" data-i="${i}"></circle>`;});
  const mx=X(s.ideo.dim1);
  let me='';
  if(meIdx>=0){const [cx,k]=pos[meIdx];const cy=base-(k+.5)*diam;
    me=`<line class="guide" x1="${cx}" x2="${cx}" y1="${top-8}" y2="${cy-diam/2-2}"></line><circle class="me ${s.party==='R'?'r':'d'}" cx="${cx}" cy="${cy}" r="${Math.max(4.5,diam/2+1.5)}" data-i="${meIdx}"></circle>`;
    const anchor=cx<W*.18?'start':cx>W*.82?'end':'middle';
    me+=`<text class="me-lab" x="${cx}" y="${top-14}" text-anchor="${anchor}">${esc(s.short)} ${s.ideo.dim1>0?'+':''}${s.ideo.dim1.toFixed(2)}</text>`;}
  let ax=`<line class="axis" x1="${mL}" x2="${W-mR}" y1="${base+2}" y2="${base+2}"></line>`;
  [-1,-.5,0,.5,1].forEach(v=>{ax+=`<line class="axis" x1="${X(v)}" x2="${X(v)}" y1="${base+2}" y2="${base+7}"></line><text class="tick" x="${X(v)}" y="${base+19}" text-anchor="${v===-1?'start':v===1?'end':'middle'}">${v>0?'+':''}${v}</text>`;});
  const medMark=(v,lab,cls)=>v==null?'':`<path d="M${X(v)-5},${base+33} L${X(v)+5},${base+33} L${X(v)},${base+26} Z" class="${cls}" style="fill:var(${cls==='d'?'--dem':'--rep'})"></path><text class="med" x="${X(v)}" y="${base+46}" text-anchor="middle">${lab} ${v>0?'+':''}${v.toFixed(2)}</text>`;
  ax+=medMark(dM,small?'D median':'Democratic median','d')+medMark(rM,small?'R median':'Republican median','r');
  ax+=`<text class="cap" x="${mL}" y="${base+62}">← More liberal</text><text class="cap" x="${W-mR}" y="${base+62}" text-anchor="end">More conservative →</text>`;
  el.innerHTML=`<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${esc(s.name)}'s DW-NOMINATE score ${s.ideo.dim1.toFixed(3)} among ${pts.length} ${CH[C].nouns}; ${esc(ideoText(s).head)}">${g}${ax}${me}</svg>`;
  const svg=el.querySelector('svg');
  svg.addEventListener('mousemove',e=>{const c=e.target.closest('circle[data-i]');if(!c){tip.classList.remove('show');return}const p=pts[+c.dataset.i];tip.textContent=`${p[2]} (${p[1]}) · ${p[0]>0?'+':''}${p[0].toFixed(3)}`;tip.classList.add('show');tip.style.left=Math.min(e.clientX+12,window.innerWidth-270)+'px';tip.style.top=(e.clientY+14)+'px';});
  svg.addEventListener('mouseleave',()=>tip.classList.remove('show'));
}
function mountIdeo(id,s){const f=()=>drawIdeo(document.getElementById(id),s);f();resizers.push(f);}

// ---------- funding (stage 3): campaign funds and outside spending are never added together ----------
const IE=DATA.ie, CLS=['super_pac','other','party'];
const CLSN={super_pac:'Super PACs',other:'Other outside groups',party:'Party committees'};
const CLS1={super_pac:'super PAC',other:'other outside group',party:'party committee'};
const CLSL={super_pac:'super PACs',other:'other outside groups',party:'party committees'};
const CLSV={super_pac:'--s2',other:'--s3',party:'--s4'};
const GLOSS={
  ie:'Independent expenditure: ads, mail or canvassing that support or oppose a candidate, paid for by a group that may not coordinate with the campaign. It is not money the campaign raised or controls.',
  superpac:'Super PAC: a committee that can raise unlimited sums and spend them independently. It cannot give money to a campaign directly.',
  receipts:'Campaign funds raised: everything the candidate\'s own campaign committee reported taking in (FEC "total receipts"): contributions, transfers, loans and other receipts.',
  pac:'PAC contribution: a check from a political action committee to the campaign, capped at $5,000 per election. It is part of campaign funds.',
  transfers:'Transfers: money passed on from joint fundraising committees, mostly individual contributions raised together with party committees.',
  earmarked:'Earmarked contribution: an individual\'s donation that a PAC collects and forwards. The FEC counts it as an individual contribution to the campaign.',
  party:'Party committees can make independent expenditures too. They are reported separately from the party\'s direct contributions.',
  coverage:'Coverage: the share of the PAC money a report lists that could be read row by row for this release.'
};
const term=(k,t)=>`<span class="term" tabindex="0" data-tip="${esc(GLOSS[k])}">${t}</span>`;
const period=(a,b)=>`${fmtDate(a)} – ${fmtDate(b)}`;
const shortPer=(b)=>'through '+fmtDate(b);
const cmOf=i=>IE.cm[i];
// An organization's name with its one-line description (public/orgs.js) shown on hover, tap or focus; inner replaces the
// plain name, for a name that is also a link.
const ORGS=makeOrgs(DATA);
const orgName=(name,about,inner)=>about?`<span class="org" data-tip="${esc(`${name}: ${about}`)}">${inner??esc(name)}</span>`:(inner??esc(name));
const candName=id=>IE.cands[id]||id;
const flag=(t,why)=>`<span class="flag" ${why?`data-tip="${esc(why)}" tabindex="0"`:''}>${t}</span>`;
function raceOf(s){return DATA.races.find(r=>r.keys.includes(s.id))}
function rivalsOf(s){const r=raceOf(s);return r?r.keys.filter(k=>k!==s.id).map(k=>byId[k]):[]}
function campFlags(s){
  const c=s.camp, f=[];
  if(c.missing)return [flag('No FEC report yet',c.note)];
  if(c.selfShare>20)f.push(flag(`${c.selfShare}% self-funded`,`Candidate loans and contributions: ${fmtFull(c.self)} of ${fmtFull(c.receipts)} in receipts.`));
  return f;
}
function outFlags(s){
  const o=s.out, f=[];
  if(o.incomplete.length)f.push(flag('Incomplete data',o.incomplete.join(' ')));
  if(o.multi)f.push(flag('Three-way race','Spending against one candidate cannot be credited to a single rival, so only spending aimed at this candidate is summarized.'));
  return f;
}
// headline numbers ---------------------------------------------------------
function campLine(s){return s.camp.missing?'<span class="muted">not yet reported</span>':`${fmt$(s.camp.receipts)} <span class="small muted">${shortPer(s.camp.end)}</span>`}
const forLabel=s=>s.out.multi?'Supporting '+s.short:'For '+s.short;
const agLabel=s=>s.out.multi?'Opposing '+s.short:'Against '+s.short;
function fundingPanels(s){
  const c=s.camp,o=s.out;
  const comp=c.missing?'':`<ul class="kvl">
      <li><span>From individuals</span><b>${fmt$(c.indiv)}</b></li>
      <li><span>${term('pac','From PACs')}</span><b>${fmt$(c.pac)}</b></li>
      <li><span>${term('transfers','Transfers from joint fundraising')}</span><b>${fmt$(c.transfers)}</b></li>
      <li><span>From party committees</span><b>${fmt$(c.party)}</b></li>
      ${c.self?`<li><span>Candidate's own loans and contributions</span><b>${fmt$(c.self)}</b></li>`:''}
      <li><span>Other receipts</span><b>${fmt$(Math.max(0,c.other))}</b></li>
    </ul>`;
  const byCls=(x)=>CLS.filter(k=>x[k]).map(k=>`<li><span><i class="sw" style="background:var(${CLSV[k]})"></i>${CLSN[k]}</span><b>${fmt$(x[k])}</b></li>`).join('')||'<li><span class="muted">None reported</span></li>';
  return `<div class="fpanels">
    <section class="fpanel camp">
      <div class="kicker">${term('receipts','Campaign funds raised')}</div>
      <div class="fbig">${c.missing?'—':fmt$(c.receipts)}</div>
      <div class="fper">${c.missing?'No FEC financial report filed yet':`${period(c.start,c.end)} · FEC committee summary`}</div>
      <div class="row" style="margin-top:6px">${campFlags(s).join('')}</div>
      ${c.missing?`<p class="small" style="margin-top:8px">${esc(c.note)}</p>`:comp}
      ${c.missing?'':`<p class="small muted" style="margin:8px 0 0">Cash on hand ${fmt$(c.cash)} on ${fmtDate(c.end)}${c.debts?` · debts ${fmt$(c.debts)}`:''}${c.src?` · <a href="${esc(c.src)}" target="_blank" rel="noopener">FEC ↗</a>`:''}</p>`}
    </section>
    <section class="fpanel out">
      <div class="kicker">Outside spending · ${term('ie','independent expenditures')}</div>
      <div class="fsplit">
        <div><div class="fl">${esc(forLabel(s))}</div><div class="fbig">${fmt$(o.for.total)}</div><ul class="kvl">${byCls(o.for)}</ul></div>
        <div><div class="fl">${esc(agLabel(s))}</div><div class="fbig">${fmt$(o.against.total)}</div><ul class="kvl">${byCls(o.against)}</ul></div>
      </div>
      <div class="fper">${period(o.start,o.end)} · general election only · <b>not money raised by the campaign</b></div>
      <div class="row" style="margin-top:6px">${outFlags(s).join('')}</div>
      ${o.multi?'':`<p class="small muted" style="margin:8px 0 0"><b>"For":</b> spending supporting ${esc(s.short)} or opposing ${esc(rivalsOf(s).map(x=>x.short).join(' or ')||'the opponent')}. <b>"Against":</b> the reverse.</p>`}
    </section>
  </div>`;
}
// same-scale bars (not summed) ------------------------------------------------
function hbar(parts,max,label){
  const tot=parts.reduce((a,p)=>a+Math.max(0,p[0]),0);
  if(!(tot>0))return '<div class="trk"></div>';
  return `<div class="trk"><div class="stk" style="width:${Math.max(.4,tot/max*100)}%">${parts.filter(p=>p[0]>0).map(([v,col,t])=>`<i style="flex:${v};background:var(${col})" data-tip="${esc(label)} · ${esc(t)}: ${fmtFull(v)}"></i>`).join('')}</div></div>`;
}
function scaleChart(s,compact){
  const c=s.camp,o=s.out;
  const rows=[
    ['Campaign funds raised',c.missing?'No FEC report yet':period(c.start,c.end),c.missing?null:[[c.receipts,'--s1','Campaign funds raised']],c.missing?null:c.receipts],
    ['Outside spending '+(o.multi?'supporting ':'for ')+s.short,period(o.start,o.end),CLS.map(k=>[o.for[k],CLSV[k],CLSN[k]]),o.for.total],
    ['Outside spending '+(o.multi?'opposing ':'against ')+s.short,period(o.start,o.end),CLS.map(k=>[o.against[k],CLSV[k],CLSN[k]]),o.against.total]];
  const max=Math.max(1,...rows.map(r=>r[3]||0));
  const leg=`<div class="legend" style="margin:0 0 10px"><span><i style="background:var(--s1)"></i>Campaign funds</span>${CLS.map(k=>`<span><i style="background:var(${CLSV[k]})"></i>${CLSN[k]} (outside)</span>`).join('')}</div>`;
  const body=rows.map(([l,p,parts,v])=>`<div class="r"><div class="lab"><b>${esc(l)}</b><small>${esc(p)}</small></div>${parts?hbar(parts,max,l):'<div class="trk"><div class="nm">not yet reported</div></div>'}<div class="val">${v==null?'—':fmt$(v)}</div></div>`).join('');
  const table=`<details class="tv"><summary>Show as a table</summary><div class="tablewrap"><table><thead><tr><th>Measure</th><th>Period</th><th class="r">Amount</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${esc(r[0])}</td><td class="small">${esc(r[1])}</td><td class="r">${r[3]==null?'—':fmtFull(r[3])}</td></tr>`).join('')}</tbody></table></div></details>`;
  return `<div class="chart"><h3>On the same scale</h3><div class="sub">Three separate amounts on one scale, so you can compare their sizes. <b>Not added together:</b> they cover different dates, and outside spending never passes through the campaign. Hover a bar for exact amounts.</div>${leg}<div class="hb ch">${body}</div>${compact?'':table}</div>`;
}
function combinedBlock(s){
  const c=s.camp,o=s.out,sm=o.same;
  if(c.missing)return `<div class="chart"><h3>Campaign funds + outside spending</h3><p class="small muted" style="margin:0"><b>Not available:</b> ${esc(s.short)}'s campaign has not filed an FEC financial report yet.</p></div>`;
  if(o.multi||!sm)return `<div class="chart"><h3>Campaign funds + outside spending</h3><p class="small muted" style="margin:0"><b>Not computed:</b> in a three-way race, spending against one candidate can't be credited to a single rival.</p></div>`;
  return `<div class="chart"><h3>Campaign funds + outside spending for ${esc(s.short)}, same period</h3>
    <div class="sub"><b>Same dates:</b> ${period(c.start,sm.end)}. A combined figure is shown only when both parts cover the same dates.</div>
    <div class="eq"><div><b>${fmtFull(sm.receipts)}</b><span>campaign funds raised</span></div><div class="op">+</div><div><b>${fmtFull(sm.for)}</b><span>outside spending for ${esc(s.short)}, same dates</span></div><div class="op">=</div><div><b>${fmtFull(sm.receipts+sm.for)}</b><span>campaign funds + outside spending</span></div></div>
    <ul class="list small" style="margin-top:10px">
      <li><b>Left out because the dates don't match yet:</b> ${fmtFull(sm.after)} in outside spending for ${esc(s.short)} after ${fmtDate(sm.end)}. Campaign reports for that period are due Oct. 15, 2026.</li>
      <li><b>Left out by design:</b> outside spending against ${esc(s.short)} (${fmtFull(o.against.total)}). Also party coordinated spending, which is reported separately.</li>
      <li><b>No double counting:</b> PAC and party contributions are already in campaign funds, so they are not added again. Outside groups pay for independent expenditures, which never pass through the campaign. The FEC counts earmarked donations routed through PACs as individual contributions, so they are already in campaign funds.</li>
    </ul></div>`;
}
function shareBlock(s){
  return `<div class="note"><b>Super PAC share: withdrawn for now.</b>${points([['Why','An earlier version divided super PAC spending through Sept. 30, 2026 by campaign receipts through mid-2026. Those are two different periods.'],['When it returns','Once the campaigns\' Q3 reports (due Oct. 15) are in, so both parts cover Jan. 1, 2025 – Sept. 30, 2026.'],['Formula','<span class="mono">super PAC spending for the candidate ÷ (campaign funds raised + all outside spending for the candidate)</span>, from FEC filings.'],['Covers','General-election spending only. Primary spending is not in the data used here.'],['Use instead','The raw figures above. They are the reliable numbers.']],'small')}</div>`;
}
// outside-spending inspector ---------------------------------------------------
function ieRole(s,r){
  const me=s.fecCand, riv=rivalsOf(s).map(x=>x.fecCand);
  if(r[2]===me)return r[3]==='S'?'for':'against';
  if(riv.includes(r[2]))return s.out.multi?'rival':(r[3]==='O'?'for':'against');
  return 'other';
}
const ROLE_N={for:'For',against:'Against',rival:'Aimed at a rival',other:'Other candidate'};
function ieCommitteeTable(s){
  const o=s.out, multi=o.multi, hasO=o.others.length;
  if(!o.cms.length)return `<p class="small muted">No general-election independent expenditures were reported in this race through ${fmtDate(o.end)}.</p>`;
  const head=`<tr><th>Committee</th><th class="r">${esc(forLabel(s))}</th><th class="r">${esc(agLabel(s))}</th>${multi?'<th class="r">Aimed at rivals</th>':''}${hasO?'<th class="r">Other candidates</th>':''}<th class="r">Items</th><th>Dates</th></tr>`;
  const body=o.cms.map(([ci,f,a,rv,ot,n,d0,d1])=>{const m=cmOf(ci);return `<tr><td>${orgName(m[1],ORGS.spender(m),`<a href="https://www.fec.gov/data/committee/${m[0]}/?cycle=2026" target="_blank" rel="noopener">${esc(m[1])}</a>`)}<div><span class="tag">${CLS1[m[2]]||m[2]}</span>${m[5]===1?'<span class="tag">only this race</span>':`<span class="tag">${m[5]} races</span>`}</div>${m[3]?`<div class="small" style="color:var(--ink-2);margin-top:4px">${esc(m[3])}${m[4]?` <a href="${esc(m[4])}" target="_blank" rel="noopener">source ↗</a>`:''}</div>`:''}</td>
    <td class="r">${f?fmtFull(f):'—'}</td><td class="r">${a?fmtFull(a):'—'}</td>${multi?`<td class="r">${rv?fmtFull(rv):'—'}</td>`:''}${hasO?`<td class="r">${ot?fmtFull(ot):'—'}</td>`:''}<td class="r">${n}</td><td class="mono small" style="white-space:nowrap">${d0===d1?fmtDate(d0):fmtDate(d0)+' –<br>'+fmtDate(d1)}</td></tr>`}).join('');
  return `<div class="tablewrap"><table>${'<thead>'+head+'</thead>'}<tbody>${body}</tbody></table></div>`;
}
function rowFlags(r){
  const f=r[7]||'', out=[];
  if(f.includes('d'))out.push(flag('Possible repeat','Same committee, candidate, amount, date and description as an item in an earlier filing, but listed as a separate transaction. It may be the same spending reported twice. It is kept because the filings list it separately.'));
  if(f.includes('p'))out.push(flag('Date capped',`Filed ${fmtDate(r[8])} with a date of Sept. 30 or later. The data set shows such dates as its Sept. 30 cut-off.`));
  if(f.includes('u'))out.push(flag('Designation uncertain','The filing does not clearly mark this as general-election spending.'));
  return out.length?`<div class="row" style="margin-top:4px;gap:4px">${out.join('')}</div>`:'';
}
function ieItems(s,host){
  const rows=(IE.rows[s.race]||[]).map(r=>({r,role:ieRole(s,r)}));
  if(!rows.length){host.innerHTML='';return}
  const roles=['for','against'].concat(s.out.multi?['rival']:[]).concat(rows.some(x=>x.role==='other')?['other']:[]);
  const cms=[...new Set(rows.map(x=>x.r[1]))].sort((a,b)=>cmOf(a)[1].localeCompare(cmOf(b)[1]));
  let st={role:'',cm:'',n:50,sort:'date'};
  host.innerHTML=`<div class="filters" id="ief"><button class="active" data-r="">All</button>${roles.map(k=>`<button data-r="${k}">${k==='for'?esc(forLabel(s)):k==='against'?esc(agLabel(s)):ROLE_N[k]}</button>`).join('')}</div>
    <div class="toolbar" style="margin:0 0 10px"><label class="small muted">Committee <select id="iec"><option value="">All committees</option>${cms.map(i=>`<option value="${i}">${esc(cmOf(i)[1])}</option>`).join('')}</select></label>
    <label class="small muted">Sort <select id="ies"><option value="date">Newest first</option><option value="amt">Largest first</option></select></label></div>
    <p class="small" id="iesum" style="margin:0 0 8px"></p>
    <div class="tablewrap"><table><thead><tr><th>Date</th><th>Committee</th><th>Aimed at</th><th>Description (as filed)</th><th class="r">Amount</th><th>Filing</th></tr></thead><tbody id="ietb"></tbody></table></div>
    <div id="iemore" style="margin-top:8px"></div>`;
  const draw=()=>{
    let L=rows.filter(x=>(!st.role||x.role===st.role)&&(st.cm===''||x.r[1]===+st.cm));
    L=L.slice().sort(st.sort==='amt'?(a,b)=>b.r[4]-a.r[4]:(a,b)=>b.r[0].localeCompare(a.r[0])||b.r[4]-a.r[4]);
    const tot=L.reduce((a,x)=>a+x.r[4],0);
    host.querySelector('#iesum').innerHTML=`<b class="num">${L.length.toLocaleString()}</b> items · <b class="num">${fmtFull(tot)}</b>${L.some(x=>x.r[4]<0)?' · negative amounts are corrections filed by the committee':''}`;
    host.querySelector('#ietb').innerHTML=L.slice(0,st.n).map(({r,role})=>{const m=cmOf(r[1]);return `<tr><td class="mono" style="white-space:nowrap">${fmtDate(r[0])}</td><td>${orgName(m[1],ORGS.spender(m))}<div class="small muted">${CLS1[m[2]]||''}</div></td><td><span class="chip ${role==='for'?'dfor':role==='against'?'dag':'ghost'}">${r[3]==='S'?'Supports':'Opposes'} ${esc(candName(r[2]))}</span>${rowFlags(r)}</td><td class="small">${esc(IE.purp[r[5]]||'—')}</td><td class="r">${fmtFull(r[4])}</td><td class="small"><a href="https://docquery.fec.gov/cgi-bin/forms/${m[0]}/${esc(r[6])}/" target="_blank" rel="noopener">${esc(r[6])} ↗</a></td></tr>`}).join('')||'<tr><td colspan="6" class="muted">No items match.</td></tr>';
    hoverTips(host.querySelector('#ietb'));
    host.querySelector('#iemore').innerHTML=L.length>st.n?`<button class="more" id="iemb">Show ${Math.min(50,L.length-st.n)} more of ${(L.length-st.n).toLocaleString()} remaining</button>`:'';
    const b=host.querySelector('#iemb');if(b)b.addEventListener('click',()=>{st.n+=50;draw();});
  };
  host.querySelector('#ief').addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;host.querySelector('#ief .active').classList.remove('active');b.classList.add('active');st.role=b.dataset.r;st.n=50;draw();});
  host.querySelector('#iec').addEventListener('change',e=>{st.cm=e.target.value;st.n=50;draw();});
  host.querySelector('#ies').addEventListener('change',e=>{st.sort=e.target.value;draw();});
  draw();
}
// PAC contributions inspector -------------------------------------------------
function pacCoverage(s){
  const p=s.pac,c=s.camp;
  if(!p.filings.length)return `<div class="note">${c.missing?'No FEC reports have been filed yet, so there are no itemized PAC contributions to show.':`No PAC contribution rows were itemized for ${esc(s.short)}${c.pac?` (the FEC summary shows ${fmtFull(c.pac)} from PACs and other committees in 2025–26)`:''}.`}</div>`;
  const notIt=(c.pac||0)-p.subtotal;
  const over=p.filings.filter(f=>f.over);
  return `<div style="margin:0 0 8px">${points([['Reports read',`${p.filings.length}, covering ${esc(p.window)}.`],['Rows add to',`<span class="num">${fmtFull(p.retrieved)}</span>, of <span class="num">${fmtFull(p.subtotal)}</span> in PAC contributions listed in those reports (${term('coverage',`${p.coverage}% coverage`)}).`],!c.missing&&c.pac!=null&&['FEC summary',`<span class="num">${fmtFull(c.pac)}</span> from PACs and other committees, ${period(c.start,c.end)}.${notIt>500?` <span class="num">${fmtFull(notIt)}</span> of it is in reports not itemized here.`:''}`]],'small')}</div>
  ${p.coverage!=null&&p.coverage<95?`<div class="row" style="margin-bottom:8px">${flag('Incomplete rows',`Only ${p.coverage}% of the PAC money in these reports could be read row by row. The missing rows are not shown or guessed.`)}</div>`:''}
  ${over.length?`<div class="note" style="margin-bottom:8px"><b>Check needed:</b> ${over.map(f=>`the ${esc(f.report)} transcription adds to ${fmtFull(f.retrieved-f.subtotal)} more than the report's own subtotal`).join('; ')}, so a row may be duplicated. Compare with the linked report before relying on individual rows.</div>`:''}
  ${p.gap?`<p class="small muted" style="margin:0 0 8px">${esc(p.gap)}</p>`:''}`;
}
function pacSectors(s){
  const p=s.pac;if(!p.byCat.length)return '';
  const tiles=pacSectorTiles(s),sum=k=>tiles.filter(x=>x.align===k).reduce((n,x)=>n+x.value,0);
  return `<div class="chart"><h3>Itemized PAC contributions by sector</h3><div class="sub">${points([['Tile size',`The amount from each sector: ${fmtFull(p.retrieved)} from ${p.nPacs} committees (${esc(p.window)}).`],['Sectors','Assigned by this app from each committee\'s name and sponsor, not by the FEC. Committees that can\'t be identified are left unclassified, not guessed.']],'small')}</div>
    <div class="cx-plot" id="pac-tm"></div>${legend([['var(--s1)',`People-aligned ${fmt$(sum('people'))}`],['var(--s5)',`Profit-aligned ${fmt$(sum('profit'))}`],['var(--cx-other)',`Other ${fmt$(sum('other'))}`]])}
    ${tableView(['Sector','Amount','Share','Alignment'],tiles.map(x=>[esc(x.label),fmtFull(x.value),pct(x.value,p.retrieved)+'%',x.alignLabel]))}</div>`;
}
// The same itemized PAC money by the type the FEC records for each committee (public/pac-types.js), once
// scripts/build-pac-types.mjs has looked them up.
function pacKinds(s){
  const p=s.pac;if(!p.rows.length||!DATA.pacIds)return '';
  const k=pacKindTotals(DATA,p.rows),max=Math.max(1,...k.map(x=>x.total)),known=k.filter(x=>x.kind!=='unknown').reduce((t,x)=>t+x.total,0);
  return `<div class="chart"><h3>Itemized PAC contributions by FEC type</h3><div class="sub">${points([['Type','From each committee\'s own FEC registration: who sponsors it (a company, union, trade or membership group), or that it is a leadership, party or candidate committee. Not assigned by this app.'],
      ['Matched',`${pct(known,p.retrieved)}% of the ${fmtFull(p.retrieved)}, by each committee's FEC ID (looked up ${esc(fmtDate(DATA.pacTypesAsOf))}).`],['Not graded','Shown only; no grade uses it.']],'small')}</div>
    <div class="cx-rows">${k.map(x=>`<div class="cx-row"><div class="cx-who">${esc(x.label)}</div><div class="cx-track"><i class="cx-bar" style="width:${Math.max(1,x.total/max*100)}%;background:${x.kind==='unknown'?'var(--cx-other)':'var(--s1)'}" data-tip="${esc(`${x.label}: ${fmtFull(x.total)}, ${x.n} contribution${x.n===1?'':'s'}`)}"></i></div><div class="cx-val"><b>${pct(x.total,p.retrieved)}%</b> <span class="muted">${fmt$(x.total)}</span></div></div>`).join('')}</div>
    ${tableView(['FEC type','Amount','Share','Contributions'],k.map(x=>[esc(x.label),fmtFull(x.total),pct(x.total,p.retrieved)+'%',String(x.n)]))}</div>`;
}
const pacSectorTiles=s=>s.pac.byCat.map(([k,v])=>{const align=categoryAlign(k);return {label:DATA.categories[k]||k,value:v,align,alignLabel:ALIGN_LABEL[align],about:`${pct(v,s.pac.retrieved)}% of the itemized PAC money`};});
function mountPacSectors(s){if(!s.pac?.byCat?.length)return;const tiles=pacSectorTiles(s),f=()=>drawTreemap(document.getElementById('pac-tm'),tiles);f();resizers.push(f);}
function pacTable(s,host){
  const p=s.pac;if(!p.rows.length){host.innerHTML='';return}
  let st={q:'',k:'amt',dir:-1,n:50};
  host.innerHTML=`<div class="toolbar" style="margin:0 0 10px"><div class="search" style="margin:0"><input id="pq" type="search" placeholder="Filter by committee, sector or FEC type" aria-label="Filter PAC contributions"></div></div>
    <p class="small" id="psum" style="margin:0 0 8px"></p>
    <div class="tablewrap"><table id="pt"><thead><tr><th><button data-k="name">Contributor (as filed)</button></th><th><button data-k="cat">Sector (assigned)</button></th><th><button data-k="type">FEC type</button></th><th><button data-k="rep">Report and period</button></th><th class="r"><button data-k="amt">Amount</button></th></tr></thead><tbody></tbody></table></div><div id="pmore" style="margin-top:8px"></div>`;
  const R=p.rows.map(r=>{const t=pacTypeOf(DATA,r[0]);return {name:DATA.pacNames[r[0]],about:ORGS.pac(r[0]),amt:r[1],cat:DATA.categories[r[2]]||r[2],fi:r[3],rep:p.filings[r[3]].start,orient:(DATA.pacOrient||{})[r[0]],
    t,type:t?t.label:DATA.pacIds?'Not matched':'Not looked up yet'};});
  const draw=()=>{
    const q=st.q.toLowerCase();
    let L=R.filter(x=>!q||(x.name+' '+x.cat+' '+x.type).toLowerCase().includes(q));
    L.sort((a,b)=>{const x=a[st.k],y=b[st.k];return (typeof x==='number'?x-y:String(x).localeCompare(String(y)))*st.dir||b.amt-a.amt});
    host.querySelector('#psum').innerHTML=`<b class="num">${L.length.toLocaleString()}</b> contributions · <b class="num">${fmtFull(L.reduce((a,x)=>a+x.amt,0))}</b>. The FEC lists these by report, so each row shows its report period, not an exact date.`;
    host.querySelector('#pt tbody').innerHTML=L.slice(0,st.n).map(x=>{const f=p.filings[x.fi];return `<tr><td>${orgName(x.name,x.about)}${x.orient?`<div class="small muted">${esc(x.orient)}</div>`:''}</td><td class="small">${esc(x.cat)}</td><td class="small">${x.t?`<span class="org" data-tip="${esc(`${x.t.label}: ${x.t.about} FEC ID ${x.t.id}.`)}">${esc(x.t.label)}</span>${x.t.lobbyist?'<div class="muted">also a lobbyist PAC</div>':''}`:`<span class="muted">${esc(x.type)}</span>`}</td><td class="small"><a href="${esc(f.url)}" target="_blank" rel="noopener">${esc(f.report)}</a><div class="muted">${fmtDate(f.start)} – ${fmtDate(f.end)}</div></td><td class="r">${fmtFull(x.amt)}</td></tr>`}).join('')||'<tr><td colspan="4" class="muted">No rows match.</td></tr>';
    hoverTips(host.querySelector('#pt tbody'));
    host.querySelector('#pmore').innerHTML=L.length>st.n?`<button class="more" id="pmb">Show ${Math.min(50,L.length-st.n)} more of ${(L.length-st.n).toLocaleString()} remaining</button>`:'';
    const b=host.querySelector('#pmb');if(b)b.addEventListener('click',()=>{st.n+=50;draw();});
  };
  host.querySelector('#pq').addEventListener('input',e=>{st.q=e.target.value;st.n=50;draw();});
  host.querySelector('#pt thead').addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;const k=b.dataset.k;st=Object.assign(st,st.k===k?{dir:-st.dir}:{k,dir:k==='amt'?-1:1});draw();});
  draw();
}
function topSpenders(s,role,n){
  const idx=role==='for'?1:2;
  return s.out.cms.filter(x=>x[idx]>0).sort((a,b)=>b[idx]-a[idx]).slice(0,n).map(x=>({name:cmOf(x[0])[1],cls:cmOf(x[0])[2],about:ORGS.spender(cmOf(x[0])),amt:x[idx]}));
}

// ---------- routing ----------
let homeCh='', cmpCh='S';
// Older profile links (#id-record, #id-funding, ...) still work: each opens the tab that now holds that content, and the spot on it.
const TAB_ALIAS={record:['match','m-record'],align:['match'],statements:['promises'],funding:['finance'],superpacs:['finance','f-out'],latest:['finance','live-records'],bills:['match','live-records'],funders:['pvp','rec-funders'],money:['pvp','rec-money']};
function route(){
  resizers=[];tip.classList.remove('show');
  const h=(location.hash||'#home').slice(1);
  const m=h.match(/^([a-zA-Z0-9]+)(?:-([a-z]+))?$/)||[];
  document.querySelectorAll('#nav a').forEach(a=>a.classList.toggle('active',a.dataset.route===m[1]||(a.dataset.route==='home'&&!!byId[m[1]])||(a.dataset.route==='senate'&&!!BASIC[m[1]])));
  if(!h||m[1]==='home'){homeCh=m[2]==='senate'?'S':m[2]==='house'?'H':m[2]==='candidates'?'C':homeCh;renderHome();}
  else if(m[1]==='updates'){window.RecordLive.dashboard(app);}
  else if(m[1]==='websites'){window.RecordLive.sites(app);}
  else if(m[1]==='races'){renderRaces();}
  else if(m[1]==='bills'){renderBills(m[2]||'all');}
  else if(m[1]==='senate'){renderSenate();}
  else if(m[1]==='compare'){if(m[2])cmpCh=m[2]==='house'?'H':'S';renderCompare();}
  else if(m[1]==='method'){renderMethod();if(m[2]){const t=document.getElementById('method-'+m[2]);if(t)setTimeout(()=>t.scrollIntoView({block:'start'}),0);}}
  else if(m[1]==='scores'){renderScores(m[2]||'match');}
  else if(m[1]==='align'){renderAlign();}
  else if(byId[m[1]]){const [tb,foc]=TAB_ALIAS[m[2]]||[m[2]||'overview'];renderProfile(byId[m[1]],tb,foc||null);}
  else if(BASIC[m[1]]){const [tb,foc]=TAB_ALIAS[m[2]]||[m[2]||'overview'];renderBasic(BASIC[m[1]],tb,foc||null);}
  else if(m[2]==='latest'){window.RecordLive.standalone(app,m[1]);}
  else renderHome();
  window.scrollTo({top:0});
}
window.addEventListener('hashchange',route);

// ---------- home cards: who they are, four A-F grades, campaign and outside money, outside money by month ----------
// Descriptions are written short: a one-line question, then bullet points with a bold label before each colon.
// points([[label, text], ...]) renders them; a falsy item is skipped.
const points=(items,cls='')=>`<ul class="pts${cls?' '+cls:''}">${items.filter(Boolean).map(([l,t])=>`<li><b>${l}:</b> ${t}</li>`).join('')}</ul>`;
// The four grades: the question each answers and how it is figured. Shown as bullets on the pages, and joined into one
// line for the grade tiles' hover text.
const GRADE={
  match:{q:'How closely does their record match the positions you picked?',pts:[
    ['What counts','Their votes, bills and official acts on each issue you picked in My alignment.'],
    ['Statements','An issue backed only by speeches or statements counts half as much.'],
    ['Your choices','Saved only in this browser.'],
    ['Not graded','Until there is evidence on at least 3 of your issues.']]},
  prom:{q:'Did they do what they said they would?',pts:[
    ['Kept','1 point. The record supports the promise.'],
    ['Partly kept or changed','½ point.'],
    ['Broken','0 points, including a promise never acted on by the end of the term.'],
    ['Left out','Unclear checks, promises with no related bill yet, and vague goals.'],
    ['For a president',"PolitiFact's ratings count the same way: Promise Kept 1, Compromise ½, Promise Broken 0."],
    ['Not graded',`Until there are at least ${MIN_CHECKS} counted checks.`]]},
  eth:{q:'Have they gotten into legal or ethical trouble?',pts:[
    ['Starting score','Everyone starts at 100.'],
    ['Legal Trouble Index 🚨',`Minus all of it. Each case: ${ETHICS_COST.finding} for a confirmed finding, ${ETHICS_COST.open} for an open investigation, ${ETHICS_COST.closed} for one closed without a finding. Criminal cases count × ${CASE_KIND.criminal}, technical ones × ${CASE_KIND.technical}, and a case decided over ${CASE_AGE.years} years ago × ${CASE_AGE.factor}.`],
    ['Insider Trading Index 📈','Minus a tenth of it. Stock trades in industries their committees oversee, near related votes, or in donors\' companies.'],
    ['Stock Disclosure Dodger Index 🙈',`Minus a tenth of it. Trade reports filed after the ${LATE_DAYS}-day deadline, or never.`],
    ['Not counted','Accusations no official body has acted on. They are listed, but cost nothing.']]},
  pvp:{q:'Does their record help working people or the wealthy?',pts:[
    ['High grade','Their record helped working and middle-class families more.'],
    ['Low grade','Their record helped the wealthy and corporations more.'],
    ['What counts','Their votes on, and sponsorships of, scored bills.'],
    ['Bill scores','Each bill is scored from −100 (fully corporate-backed) to +100 (fully worker-backed): half from a nonpartisan study of who gains, half from which side worker and business groups took.'],
    ['How votes count',"A yes vote takes the bill's side and a no vote the other side, counted by the bill's strength: a yes on a +60 bill adds 0.6 to the working-people side."],
    ['Bills that didn\'t pass','Count too: sponsoring or cosponsoring one counts like a yes vote, and a cited public statement for or against it counts half as much. A bill counts once across its versions in different Congresses.'],
    ['Corporation Compromised Index 🏢','A quarter of the grade: 100 minus the index, which measures how much of their campaign money comes from businesses\' PACs and how much more often they vote with business funders than their party does. The other three quarters are the bills.'],
    ['For a president','Signing a bill counts like a yes. A veto counts like a no.'],
    ['Not graded',`Until they have at least ${MIN_PVP_ACTIONS} of these.`]]},
};
const GRADE_TIP=Object.fromEntries(Object.entries(GRADE).map(([k,g])=>[k,`${g.q} ${g.pts.map(([l,t])=>`${l}: ${t}`).join(' ')}`]));
const gradeRule=k=>`<p class="gh-q">${GRADE[k].q}</p>${points(GRADE[k].pts,'small')}`;
const initials=n=>{const w=n.replace(/\b(Jr|Sr|III|II)\b\.?/g,'').split(/\s+/).filter(x=>/^[A-Z][a-z'-]/.test(x));return ((w[0]||'?')[0]+(w.length>1?w[w.length-1][0]:'')).toUpperCase()};
// Portrait: a cut-out photo standing in a party-colored circle, head rising above its top edge (public/portraits/,
// built by scripts/build-portraits.py). Without a photo, or if it fails to load, the same circle shows initials.
const PORTRAITS=window.PORTRAITS||{};
function portrait(s){
  const p=PORTRAITS[s.id], ini=initials(s.name);
  return p?`<div class="hc-pv ${s.party}" data-ini="${ini}"><img src="/${esc(p.file)}" alt="" width="88" height="104" loading="lazy" decoding="async"></div>`
    :`<div class="hc-pv ${s.party} ini" aria-hidden="true"><span>${ini}</span></div>`;
}
document.addEventListener('error',e=>{
  const pv=e.target.tagName==='IMG'&&e.target.parentNode.classList.contains('hc-pv')?e.target.parentNode:null;if(!pv)return;
  const span=document.createElement('span');span.textContent=pv.dataset.ini;pv.replaceChildren(span);pv.classList.add('ini');pv.setAttribute('aria-hidden','true');
},true);
function gradeTile(label,pct,detail,tip,extra='',href=''){
  const g=pct==null?null:letter(pct), t=href?'a':'div';
  return `<${t} class="hc-gt"${href?` href="${href}"`:''} title="${esc(tip)}"><div class="hc-gl">${label}</div><div class="hc-gv">${g?`<b class="gr-${g}">${g}</b><span>${pct}%</span>`:'<span class="hc-ng">Not graded</span>'}</div>${extra}<div class="hc-gd">${detail}</div></${t}>`;
}
// With links, each tile opens that grade's tab on the profile (not on the home cards, which are links themselves).
function reportCard(s,links){
  const m=scoreFor(s), pr=SCORER.promises(s), e=personEthics(s), v=personPvp(s), h=k=>links?`#${s.id}-${k}`:'';
  const md=!m.nChosen?'Choose issues in My alignment':m.score==null?`evidence on ${m.nCov} of ${m.nChosen} issues`:`${m.nCov} of your ${m.nChosen} issues`;
  const bar=pr.pct!=null?`<div class="hc-seg" aria-hidden="true">${pr.kept?`<i style="flex:${pr.kept};background:var(--good)"></i>`:''}${pr.half?`<i style="flex:${pr.half};background:var(--warn)"></i>`:''}${pr.broken?`<i style="flex:${pr.broken};background:var(--crit)"></i>`:''}</div>`:'';
  const pd=pr.pct!=null?`${pr.kept} of ${pr.clear} kept`:pr.total?`${pr.clear} of ${MIN_CHECKS} clear checks`:'no checks yet';
  const ed=[e.finding&&`${e.finding} finding${e.finding>1?'s':''}`,e.open&&`${e.open} open inquir${e.open>1?'ies':'y'}`,e.closed&&`${e.closed} closed inquir${e.closed>1?'ies':'y'}`,e.allegation&&`${e.allegation} allegation${e.allegation>1?'s':''}`,e.late&&`${e.late} late report${e.late>1?'s':''}`,e.conflict&&`${e.conflict} conflict trade${e.conflict>1?'s':''}`].filter(Boolean).join(' · ')||'none located';
  const vd=v.pct!=null?`${v.nPeople} of ${v.n} actions for working people`:v.n?`${v.n} of ${MIN_PVP_ACTIONS} scored actions`:PVP_MARKS.size?'no scored actions yet':'no bills scored yet';
  return `<div class="hc-rc">${gradeTile('Your match',m.score,md,GRADE_TIP.match,'',h('match'))}${gradeTile('Promises delivered',pr.pct,pd,GRADE_TIP.prom,bar,h('promises'))}${gradeTile('Ethics',e.pct,ed,GRADE_TIP.eth,'',h('ethics'))}${gradeTile('Workers > Profit',v.pct,vd,GRADE_TIP.pvp,'',h('pvp'))}</div>`;
}
// Promises, Ethics and Workers > Profit are recalculated monthly after review (public/score-log.json). The tab says
// when, and marks a grade that reviewed edits have changed since; the next monthly run logs it.
function monthlyNote(s,key,pct){
  const last=(window.SCORELOG||[]).at(-1);if(!last)return '';
  const was=last.scores[s.id]?.[key];
  return `<p class="small muted gh-mo">Recalculated monthly; last on ${fmtDate(last.date)}.${was&&was.pct!==pct?` <b>Changed since then</b> (was ${was.pct==null?'not graded':was.pct+'%'}): the next monthly recalculation will log why.`:''} <a href="#method-log">Change log</a></p>`;
}
// The top of each grade tab: the letter and percentage, what it is based on, and the rule.
function gradeHead(title,pct,detail,rule,extra=''){
  const g=pct==null?null:letter(pct);
  return `<div class="gh"><div class="gh-g">${g?`<b class="gr-${g}">${g}</b><span>${pct}%</span>`:'<span class="gh-ng">Not graded</span>'}</div>
    <div class="gh-t"><h2>${title}</h2><div class="gh-d">${detail}</div>${extra}<div class="gh-r">${rule}<p class="small"><a href="#method">How the grades work</a></p></div></div></div>`;
}
function homeMonths(asof=DATA.ie_asof){const end=asof.slice(0,7), out=[];let y=+end.slice(0,4), k=+end.slice(5,7);for(let i=0;i<7;i++){out.unshift(`${y}-${String(k).padStart(2,'0')}`);if(--k<1){k=12;y--;}}return out;}
// Outside money by month: for and against side by side, with the month's for-to-against ratio as a line on its own scale (right).
const RATIO_TICKS=[[1,'all for'],[.75,'3 : 1'],[.5,'1 : 1'],[.25,'1 : 3'],[0,'all against']];
// live, when given, is outside spending from the daily FEC refresh ({end, items:[{date, amount, role}]}) instead of the
// reviewed race data.
function miniOutside(s,bare,live){
  const asof=live?live.end:DATA.ie_asof, months=homeMonths(asof), M=Object.fromEntries(months.map(m=>[m,{f:0,a:0}]));
  const items=live?live.items:(IE.rows[s.race]||[]).map(r=>({date:r[0],amount:r[4],role:ieRole(s,r)}));
  for(const x of items){const mo=x.date.slice(0,7);if(!M[mo])continue;if(x.role==='for')M[mo].f+=x.amount;else if(x.role==='against')M[mo].a+=x.amount;}
  const fw=s.out.multi?'supporting':'for', aw=s.out.multi?'opposing':'against';
  const max=Math.max(0,...months.map(m=>Math.max(M[m].f,M[m].a)));
  const F=months.reduce((t,m)=>t+M[m].f,0), A=months.reduce((t,m)=>t+M[m].a,0), q=moneyRatio(F,A);
  const badge=q?`<span class="hc-ratio" title="${esc(`For-to-against ratio of outside money in the months charted: ${fmtFull(F)} ${fw} ${s.short}, ${fmtFull(A)} ${aw}.`)}">${q.oneSided?`<b class="${q.side}">${q.text[0].toUpperCase()+q.text.slice(1)}</b>`:`For-to-against <b class="${q.side}">${q.text}</b>`}</span>`:'';
  const head=`<div class="hc-mh"><span>${bare?'':'Outside money by month'}${badge}</span><span>${MON[+months[0].slice(5,7)-1]} – <b>${fmtDate(asof)}</b></span></div>`;
  if(!max)return `<div class="hc-mini">${head}<p class="small muted" style="margin:4px 0 0">No outside spending reported in these months.</p></div>`;
  const W=280,top=6,base=96,gw=W/7,bw=14,y=sh=>top+(1-sh)*(base-top);
  let svg=RATIO_TICKS.slice(1,4).map(([sh])=>`<line class="${sh===.5?'hc-g1':'hc-g'}" x1="0" x2="${W}" y1="${y(sh)}" y2="${y(sh)}"></line>`).join('');
  const pts=months.map((m,i)=>{const {f,a}=M[m], x0=i*gw+(gw-2*bw-2)/2, r=moneyRatio(f,a);
    if(f>0){const h=Math.max(1.5,f/max*(base-top));svg+=`<rect class="hc-f" x="${x0.toFixed(1)}" y="${(base-h).toFixed(1)}" width="${bw}" height="${h.toFixed(1)}"></rect>`;}
    if(a>0){const h=Math.max(1.5,a/max*(base-top));svg+=`<rect class="hc-a" x="${(x0+bw+2).toFixed(1)}" y="${(base-h).toFixed(1)}" width="${bw}" height="${h.toFixed(1)}"></rect>`;}
    return r&&{x:(i*gw+gw/2).toFixed(1),y:y(r.share).toFixed(1),m,r};});
  svg+=`<line class="hc-z" x1="0" x2="${W}" y1="${base}" y2="${base}"></line>`;
  // The line breaks over a month with no outside money, since it has no ratio.
  const d=pts.map((p,i)=>p?`${pts[i-1]?'L':'M'}${p.x} ${p.y}`:'').join('');
  if(d)svg+=`<path class="hc-rl-h" d="${d}"></path><path class="hc-rl" d="${d}"></path>`;
  svg+=pts.filter(Boolean).map(p=>`<path class="hc-rd" d="M${p.x} ${p.y}h0"></path>`).join('');
  svg+=months.map((m,i)=>{const {f,a}=M[m],r=pts[i];return `<rect class="hc-hit" x="${(i*gw).toFixed(1)}" y="0" width="${gw.toFixed(1)}" height="100"><title>${esc(`${monLabel(m)}: ${fmt$(f)} ${fw}, ${fmt$(a)} ${aw}${!r?'':r.r.oneSided?` · ${r.r.text}`:` · for-to-against ${r.r.text}`}`)}</title></rect>`}).join('');
  const label=months.map((m,i)=>`${monLabel(m)}: ${fmt$(M[m].f)} ${fw}, ${fmt$(M[m].a)} ${aw}${pts[i]?`, ratio ${pts[i].r.text}`:''}`).join('; ');
  const rax=RATIO_TICKS.map(([sh,t])=>`<span style="top:${y(sh)}%">${t}</span>`).join('');
  return `<div class="hc-mini">${head}<div class="hc-plot"><svg viewBox="0 0 ${W} 100" preserveAspectRatio="none" role="img" aria-label="${esc(`Outside spending by month, with the for-to-against ratio. ${label}`)}">${svg}</svg><div class="hc-rax" aria-hidden="true">${rax}</div></div>
    <div class="hc-mx" aria-hidden="true">${months.map(m=>`<span>${MON[+m.slice(5,7)-1]}</span>`).join('')}</div>
    <div class="hc-ms"><span><i class="sw" style="background:var(--s3)"></i>${fw}</span><span><i class="sw" style="background:var(--s2)"></i>${aw}</span><span><i class="hc-ln"></i>ratio, right scale</span><span>tallest bar ${fmt$(max)}</span></div></div>`;
}
// A titled section of a home card: the grades ("Report Card"), then the money ("Money & Influence Analysis").
const hcHead=(icon,cls,title,sub)=>`<div class="hc-sh"><h4><i class="${cls}" aria-hidden="true">${icon}</i>${title}</h4><p>${sub}</p></div>`;
function homeCard(s){
  const c=s.camp, o=s.out, it=ideoText(s), race=raceOf(s), riv=rivalsOf(s);
  const ideo=s.cand&&!s.ideo&&s.ideoKind!=='former_text'&&s.ideoKind!=='state'?`No voting score · ${REC_LABEL[s.recordType]||it.short}`:it.short;
  const sub=s.cand?`${s.openSeat?'Open seat':s.term} · ${s.since}`:`In the ${CH[s.chamber].name} since ${String(s.since).split(' (')[0]} · ${s.term}`;
  return `<article class="card sen-card hc" tabindex="0" data-id="${s.id}" role="link" aria-label="Open profile of ${esc(s.name)}">
    <div class="hc-top">${portrait(s)}<div class="hc-who">
      <div class="row" style="gap:5px"><span class="chip ${s.party}">${s.party} · ${esc(seatLabel(s))}</span><span class="chip ch">${chipCh(s)}</span></div>
      <div class="name">${esc(s.name)}</div><div class="hc-sub">${esc(sub)}</div></div></div>
    <div class="hc-ideo">${esc(ideo)}</div>
    ${hcHead('✓','rc','Report Card','Four A–F grades from the documented record and your own answers')}
    ${reportCard(s)}
    ${hcHead('$','mi','Money &amp; Influence Analysis','Who pays for the campaign, and who spends for and against it')}
    <div class="hc-money">
      <div class="hc-mt">${c.missing?'<b class="hc-na">Not yet reported</b><span>Campaign funds raised</span><small>no FEC report filed yet</small>':`<b>${fmt$(c.receipts)}</b><span>Campaign funds raised</span><small>${shortPer(c.end)}</small>`}</div>
      <div class="hc-mt"><b class="hc-two"><i class="sw" style="background:var(--s3)"></i>${fmt$(o.for.total)} <em>${o.multi?'supporting':'for'}</em><br><i class="sw" style="background:var(--s2)"></i>${fmt$(o.against.total)} <em>${o.multi?'opposing':'against'}</em></b><span>Outside money</span><small>${shortPer(o.end)}</small></div>
    </div>
    ${miniOutside(s)}
    <div class="hc-ft"><span>${race?esc(race.label):''}</span><span class="hc-vs">${riv.length?'vs. '+esc(riv.map(x=>x.short).join(', ')):'No profiled opponent'}</span></div>
  </article>`;
}
// The featured card (the president): the same Report Card and Money & Influence Analysis as the others. Not being on the
// 2026 ballot, there is no reviewed race money, so the money comes from the daily FEC refresh of the committee that
// still files (filled in by fillFeatured).
function featuredCard(s){
  return `<article class="card sen-card hc hc-feat" tabindex="0" data-id="${s.id}" role="link" aria-label="Open profile of ${esc(s.name)}">
    <div class="hc-top">${portrait(s)}<div class="hc-who">
      <div class="row" style="gap:5px"><span class="chip ${s.party}">${s.party} · ${esc(seatLabel(s))}</span><span class="chip ch">${chipCh(s)}</span></div>
      <div class="name">${esc(s.name)}</div><div class="hc-sub">${esc(s.term)}</div></div></div>
    <div class="hc-ideo">${esc(REC_SHORT[s.recordType]||'')} · ${esc(s.seat)}</div>
    ${hcHead('✓','rc','Report Card','Four A–F grades from the documented record and your own answers')}
    ${reportCard(s)}
    ${hcHead('$','mi','Money &amp; Influence Analysis',`Money raised by ${esc(s.cmteName||'the campaign committee')}, and outside spending for and against ${esc(s.short)}, from the daily FEC refresh`)}
    <div class="hc-live" data-live="${s.id}">${featuredMoney(s,null)}</div>
    <div class="hc-ft"><span>Not on the 2026 ballot</span><span class="hc-vs">Open profile →</span></div>
  </article>`;
}
// p is the person's refreshed records (/api/profile), null while loading, or false when the refresh is unreachable.
function featuredMoney(s,p){
  const c=p&&p.sections.campaign, o=p&&p.sections.outside;
  const wait=p===null?'Loading…':p===false?'Refresh unavailable':'Waiting for the FEC refresh';
  const camp=c?`<b>${fmt$(c.receipts)}</b><span>Campaign funds raised</span><small>${shortPer(c.end)}</small>`:`<b class="hc-na">${wait}</b><span>Campaign funds raised</span><small>${esc(s.fecCmte)}, 2025–26</small>`;
  const out=o?`<b class="hc-two"><i class="sw" style="background:var(--s3)"></i>${fmt$(o.support)} <em>for</em><br><i class="sw" style="background:var(--s2)"></i>${fmt$(o.oppose)} <em>against</em></b><span>Outside money</span><small>${shortPer(o.through)}</small>`:`<b class="hc-na">${wait}</b><span>Outside money</span><small>2025–26</small>`;
  const mini=o?miniOutside(s,false,{end:o.through,items:(o.rows||[]).map(r=>({date:r.date,amount:r.amount,role:r.direction==='S'?'for':'against'}))})
    :`<div class="hc-mini"><div class="hc-mh"><span>Outside money by month</span></div><p class="small muted" style="margin:4px 0 0">${p===false?'The refreshed FEC records are unavailable right now.':p===null?'Loading the refreshed FEC records…':'Fills in from the daily FEC refresh.'}</p></div>`;
  return `<div class="hc-money"><div class="hc-mt">${camp}</div><div class="hc-mt">${out}</div></div>${mini}`;
}
async function fillFeatured(){
  for(const el of document.querySelectorAll('.hc-live[data-live]')){
    const s=byId[el.dataset.live];let p=false;
    try{const r=await fetch('/api/profile?id='+encodeURIComponent(s.id),{cache:'no-store'});if(r.ok)p=await r.json();}catch{}
    if(el.isConnected)el.innerHTML=featuredMoney(s,p&&p.sections?p:false);
  }
}
const gradeHow=()=>`<section class="hc-how" aria-labelledby="hc-how-h"><h2 id="hc-how-h" style="font-size:1.05rem">How the grades work</h2>
  <div class="hc-howg">
    <div><h3>Your match</h3>${gradeRule('match')}</div>
    <div><h3>Promises delivered</h3>${gradeRule('prom')}</div>
    <div><h3>Ethics</h3>${gradeRule('eth')}</div>
    <div><h3>Workers > Profit</h3>${gradeRule('pvp')}</div>
    <div><h3>Grade scale</h3>${points([['A','90–100'],['B','80–89'],['C','70–79'],['D','60–69'],['F','Below 60'],['Not graded','Too little evidence yet. It never means zero.']],'small')}<p class="small"><a href="#method">Full rules</a></p></div>
  </div></section>`;
let homeSort='';

// ---------- home ----------
function renderHome(){
  const nS=ALL.filter(s=>s.chamber==='S'&&(!s.cand||s.senInc)).length, nH=MEM.filter(s=>s.chamber==='H').length, nC=CANDS.filter(s=>!s.senInc).length, nComp=DATA.races.filter(r=>r.chamber==='S'&&r.competitive).length;
  app.innerHTML=`
  <section class="hero${FEATURED.length?' hero-feat':''}">
    <div class="hero-text">
    <div class="asof">Research snapshot · ${esc(DATA.asof)}</div>
    <h1 style="margin-top:8px">What they said. What they did. Who paid for it.</h1>
    <p class="lede">Report cards for the candidates in ${DATA.races.length} key 2026 races, built from official records.</p>
    ${points([
      ['Who is covered',`${nS} senators and ${nH} House members on the November 3, 2026 ballot, their ${CANDS.filter(c=>!c.openSeat&&!c.senInc).length} opponents, and ${CANDS.filter(c=>c.openSeat).length} nominees for ${DATA.races.filter(r=>r.open).length} open Senate seats. That includes all ${nComp} Senate races rated competitive by Cook, Inside Elections or Sabato.`],
      ['Where it comes from','FEC filings, roll-call votes, state legislative records, ethics findings and court records. Every entry links to its source.'],
      ['What each profile shows',"Their record, the money their campaign raised, outside groups' spending for and against them (kept separate), and their statements checked against their actions."],
      ['Grades','Four grades from A to F. "Not graded" means there is not enough evidence yet, never a zero.'],
      SENATE.length&&['Every senator',`<a href="#senate">All ${SENATE.length} sitting senators</a>, with a basic profile for each one not in these races.`]],'lede-pts')}
    </div>
    ${FEATURED.length?`<aside class="hero-side" aria-label="Featured profile">${FEATURED.map(featuredCard).join('')}</aside>`:''}
    <div class="toolbar">
      <div class="seg" id="chs" role="group" aria-label="Chamber"><button data-c="" class="${homeCh===''?'active':''}">All ${ALL.length+BASIC_LIST.length}</button><button data-c="S" class="${homeCh==='S'?'active':''}">Senators</button><button data-c="H" class="${homeCh==='H'?'active':''}">House</button><button data-c="C" class="${homeCh==='C'?'active':''}">Challengers & candidates</button></div>
      <div class="search"><input id="q" type="search" placeholder="Search by name, state or district" aria-label="Search members"></div>
      <label class="small muted">Sort <select id="hsort" aria-label="Sort candidates"><option value="">Default</option><option value="out">Most outside money</option><option value="camp">Most campaign money</option><option value="name">Name</option></select></label>
    </div>
  </section>
  <div class="grid hc-grid" id="cards"></div>
  ${gradeHow()}
  <section class="section">
    <div class="cols">
      <div class="card"><h3>Head-to-head races</h3><p class="small" style="margin-top:6px">Each candidate next to their 2026 opponents: money raised, cash on hand, and outside spending for and against each side.</p><a class="cta" href="#races">See the ${DATA.races.length} races</a></div>
      <div class="card"><h3>Compare the record</h3><p class="small" style="margin-top:6px">How Senate and House members voted on major bills since 2021, with their ideology and money side by side.</p><a class="cta" href="#compare">Open the comparison</a></div>
      <div class="card"><h3>How the numbers work</h3><p class="small" style="margin-top:6px">Every rule, every source and every known gap, in one place.</p><a class="cta" href="#method">Read the methodology</a></div>
    </div>
  </section>`;
  const cards=$('#cards');
  const draw=q=>{
    q=(q||'').trim().toLowerCase();
    const list=ALL.concat(BASIC_LIST).filter(s=>(!homeCh||(homeCh==='C'?(s.cand&&!s.senInc):((!s.cand||s.senInc)&&s.chamber===homeCh)))&&(!q||[s.name,s.state,s.stateName,s.district||'',s.cand?(s.openSeat?'senate candidate open seat':'challenger '+(s.chamber==='S'?'senate':'house')):s.chamber==='S'?'senate senator':'house representative',partyName(s.party)].join(' ').toLowerCase().includes(q)));
    // Basic profiles have no reviewed money, so they sort after everyone with it.
    const key={out:s=>s.basic?1:-(s.out.for.total+s.out.against.total),camp:s=>s.basic||s.camp.missing?1:-s.camp.receipts,name:s=>s.short+' '+s.name}[homeSort];
    if(key)list.sort((x,y)=>{const a=key(x),b=key(y);return typeof a==='number'?a-b:String(a).localeCompare(String(b))});
    cards.innerHTML=list.map(s=>s.basic?basicCard(s):homeCard(s)).join('')||`<p class="muted">No one matches that search. This release covers ${ALL.length} people in ${DATA.races.length} races; the methodology page explains how they were chosen.</p>`;
  };
  draw('');fillBasic(cards);
  $('#q').addEventListener('input',e=>{draw(e.target.value);fillBasic(cards);});
  const hs=$('#hsort');hs.value=homeSort;hs.addEventListener('change',e=>{homeSort=e.target.value;draw($('#q').value);fillBasic(cards);});
  $('#chs').addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;homeCh=b.dataset.c;$('#chs .active').classList.remove('active');b.classList.add('active');draw($('#q').value);fillBasic(cards);});
  fillFeatured();
  for(const host of [cards,$('.hero-side')].filter(Boolean)){
    host.addEventListener('click',e=>{const c=e.target.closest('.sen-card');if(c)location.hash=c.dataset.id;});
    host.addEventListener('keydown',e=>{const c=e.target.closest('.sen-card');if(c&&(e.key==='Enter'||e.key===' ')){e.preventDefault();location.hash=c.dataset.id;}});
  }
}

// ---------- profile ----------
// Overview, then one tab per home-card grade, then the money.
const TABS=[['overview','Overview'],['match','Your match'],['promises','Promises Delivered'],['ethics','Ethics'],['pvp','Workers > Profit'],['finance','Money &amp; Influence']];
const tabsFor=s=>TABS;
const PANES={overview:(...a)=>paneOverview(...a),match:(...a)=>paneMatch(...a),promises:(...a)=>panePromises(...a),ethics:(...a)=>paneEthics(...a),pvp:(...a)=>panePvp(...a),finance:(...a)=>paneFinance(...a),sources:(...a)=>paneSources(...a)};
function renderProfile(s,tab,focus){
  if(!PANES[tab])tab='overview';
  app.innerHTML=`
  <header class="phead">
    <div class="top"><div>
      <div class="row"><span class="chip ch">${chipCh(s)}</span><span class="chip ${s.party}">${partyName(s.party)} · ${esc(s.stateName)}${s.chamber==='H'?' · '+esc(s.district):''}</span><span class="chip ghost">${esc(s.term)}</span></div>
      <h1 style="margin-top:8px">${esc(s.name)}</h1>
      ${s.cand?`<p class="small" style="margin:8px 0 0;color:var(--ink-2);max-width:80ch">${esc(s.status)}${s.statusSrc?` <a href="${esc(s.statusSrc.u)}" target="_blank" rel="noopener">${esc(s.statusSrc.t)} ↗</a>`:''}</p>${s.background?`<p class="small muted" style="margin:4px 0 0;max-width:80ch">${esc(s.background)}</p>`:''}`:''}
    </div></div>
    <div class="meta">
      <div><span>${s.office?'In office':s.cand?'Current or most recent role':'In the '+CH[s.chamber].name+' since'}</span>${esc(s.since)}</div>
      ${s.office?`<div><span>2026 ballot</span>${esc(s.seat)}</div>`:`<div><span>2026 ${s.cand?'opponents':'opponent'}</span>${esc(s.opponent)} · <a href="#races">race view</a></div>`}
      <div class="roles"><span>${s.cand?'Offices held':'Committees / roles'}</span>${esc(s.roles||'None')}</div>
      <div><span>Identifiers</span><span class="mono" style="display:inline;color:var(--ink-2);text-transform:none;letter-spacing:0;font-size:.82rem">FEC ${esc(s.fecCand)}${s.office&&s.fecCmte?' · committee '+esc(s.fecCmte):''}${s.bioguide?' · Bioguide '+esc(s.bioguide):''}</span></div>
    </div>
    <div class="links row">
      <a href="${fecCandUrl(s.fecCand)}" target="_blank" rel="noopener">FEC candidate summary ↗</a>
      ${s.bioguide?`<a href="${cgUrl(s)}" target="_blank" rel="noopener">Congress.gov member page ↗</a>`:''}
      ${s.site?`<a href="${esc(s.site)}" target="_blank" rel="noopener">${s.cand&&!s.office?'Campaign site':'Official site'} ↗</a>`:''}
      <a href="#${s.id}-sources">All sources for this profile →</a>
    </div>
  </header>
  <div class="tabs"><div class="wrap" style="padding-inline:0" id="tabs">${tabsFor(s).map(([k,l])=>`<button data-tab="${k}" class="${k===tab?'active':''}">${l}</button>`).join('')}</div></div>
  <section class="section" id="pane"></section>`;
  $('#tabs').addEventListener('click',e=>{const b=e.target.closest('button');if(b){location.hash=`${s.id}-${b.dataset.tab}`;}});
  const pane=$('#pane');
  PANES[tab](s,pane,focus);
  if(focus){const t=document.getElementById(focus);if(t)setTimeout(()=>t.scrollIntoView({block:'start'}),50);}
  const act=$('#tabs .active');if(act)act.scrollIntoView({block:'nearest',inline:'center'});
}
// ---------- The Senate: every sitting senator, with a full profile (reviewed research) or a basic one ----------
const monthYear=d=>{const m=/^(\d{4})-(\d{2})/.exec(d||'');return m?new Date(+m[1],+m[2]-1,1).toLocaleDateString('en-US',{month:'long',year:'numeric'}):'—';};
const fecCycleUrl=(id,cycle)=>`https://www.fec.gov/data/candidate/${id}/?cycle=${cycle}&election_full=true`;
let senQ='',senParty='',senYear='',senSort='state';
function renderSenate(){
  const full=SENATE.filter(x=>byId[x.id]).length,info=window.SENATE_INFO||{};
  const years=[...new Set(SENATE.map(x=>x.nextElection))].sort();
  app.innerHTML=`<section class="section">
    <div class="kicker">${info.congress?info.congress+'th Congress':'U.S. Senate'}</div><h1>The Senate</h1>
    <p class="intro">All ${SENATE.length} sitting senators.</p>
    ${points([['Full profiles',`${full} senators on the 2026 ballot in the races this site covers: grades, campaign money, outside spending and statement checks.`],
      ['Basic profiles',`The other ${SENATE.length-full}: their place in the Senate, their committees, and the records the daily refresh collects (votes, bills, statements, stock trades and campaign money). No grades until their research is reviewed.`],
      ['Ideology','Voteview DW-NOMINATE, from every roll call they have cast, the same as on the full profiles.'],
      info.source&&['Source',`<a href="${esc(info.source)}" target="_blank" rel="noopener">congress-legislators</a>, checked ${fmtDate(info.checked)}.`]])}
    <div class="toolbar">
      <div class="seg" id="sen-party" role="group" aria-label="Party">${[['','All'],['D','Democrats'],['R','Republicans'],['I','Independents']].map(([k,l])=>`<button data-p="${k}" class="${senParty===k?'active':''}">${l}</button>`).join('')}</div>
      <div class="search"><input id="sen-q" type="search" placeholder="Search by name or state" aria-label="Search senators" value="${esc(senQ)}"></div>
      <label class="small muted">Next election <select id="sen-year" aria-label="Next election"><option value="">Any</option>${years.map(y=>`<option value="${y}" ${String(y)===senYear?'selected':''}>${y}</option>`).join('')}</select></label>
      <label class="small muted">Sort <select id="sen-sort" aria-label="Sort senators">${[['state','State'],['name','Name'],['lib','Most liberal first'],['con','Most conservative first']].map(([k,l])=>`<option value="${k}" ${senSort===k?'selected':''}>${l}</option>`).join('')}</select></label>
    </div>
    <p class="small" id="sen-n" style="margin:10px 0 8px"></p>
    <div class="tablewrap"><table><thead><tr><th>Senator</th><th>State</th><th>Party</th><th>Next election</th><th>Ideology</th><th>Profile</th></tr></thead><tbody id="sen-rows"></tbody></table></div>
  </section>`;
  const score=x=>x.ideo?x.ideo.dim1:null;
  const draw=()=>{
    const q=senQ.toLowerCase();
    const L=SENATE.filter(x=>(!senParty||x.party===senParty)&&(!senYear||String(x.nextElection)===senYear)&&(!q||`${x.name} ${x.stateName} ${x.state}`.toLowerCase().includes(q)));
    const by={state:(a,b)=>a.stateName.localeCompare(b.stateName)||a.short.localeCompare(b.short),name:(a,b)=>a.short.localeCompare(b.short)||a.name.localeCompare(b.name),
      lib:(a,b)=>(score(a)??9)-(score(b)??9),con:(a,b)=>(score(b)??-9)-(score(a)??-9)}[senSort];
    L.sort(by);
    $('#sen-n').innerHTML=`<b class="num">${L.length}</b> of ${SENATE.length} senators`;
    $('#sen-rows').innerHTML=L.map(x=>`<tr><td><a href="#${esc(x.id)}">${esc(x.name)}</a></td><td>${esc(x.stateName)}</td><td><span class="chip ${esc(x.party)}">${partyName(x.party)}</span></td>
      <td>${x.nextElection}${x.nextElection===2026?' <span class="chip warn">On the 2026 ballot</span>':''}</td>
      <td>${x.ideo?`<span class="mono">${x.ideo.dim1>0?'+':''}${x.ideo.dim1.toFixed(2)}</span><div class="small muted">${esc(ideoText(x).short)}</div>`:'<span class="small muted">No score yet</span>'}</td>
      <td>${byId[x.id]?'<span class="chip good">Full</span>':'<span class="chip ghost">Basic</span>'}</td></tr>`).join('')||'<tr><td colspan="6">No senators match.</td></tr>';
  };
  $('#sen-party').addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;senParty=b.dataset.p;$('#sen-party .active').classList.remove('active');b.classList.add('active');draw();});
  $('#sen-q').addEventListener('input',e=>{senQ=e.target.value;draw();});
  $('#sen-year').addEventListener('change',e=>{senYear=e.target.value;draw();});
  $('#sen-sort').addEventListener('change',e=>{senSort=e.target.value;draw();});
  draw();
}
// Basic profiles: senators without reviewed research. They use the same header, tabs and cards as the full profiles;
// every grade stays "Not graded" until the research is reviewed, and each tab shows the records the daily refresh
// collects. Election boxes say whether the seat is on the 2026 ballot.
const offBallot=s=>s.nextElection!==2026;
const ballotLine=s=>offBallot(s)?'Not running for election in 2026':'Seat up in 2026 · race not covered here';
const BASIC_GRADE={match:'No reviewed record of their votes and statements on the site\'s issues yet.',prom:'No statements checked against the record yet.',
  eth:'No cases reviewed yet. Leads from official records are on the Ethics tab.',pvp:'No scored votes or sponsorships reviewed yet.'};
function basicReport(s,links){
  const h=k=>links?`#${s.id}-${k}`:'',d='Research not reviewed yet';
  return `<div class="hc-rc">${gradeTile('Your match',null,d,GRADE_TIP.match,'',h('match'))}${gradeTile('Promises delivered',null,d,GRADE_TIP.prom,'',h('promises'))}${gradeTile('Ethics',null,d,GRADE_TIP.eth,'',h('ethics'))}${gradeTile('Workers > Profit',null,d,GRADE_TIP.pvp,'',h('pvp'))}</div>`;
}
// Campaign and outside-money totals for everyone, loaded once (/api/cards) and reused by the cards and profiles.
let cardsData=null,cardsTime=0;
function loadCards(){if(!cardsData||Date.now()-cardsTime>60000){cardsTime=Date.now();cardsData=fetch('/api/cards',{cache:'no-store'}).then(r=>r.ok?r.json():null).then(d=>d?.people||null).catch(()=>null);}return cardsData;}
// c: this person's totals, undefined while loading, or null when the refresh is unreachable.
function basicMoney(s,c,{mini:withMini=true}={}){
  const wait=c===undefined?'Loading…':c===null?'Refresh unavailable':'Waiting for the FEC refresh',k=c?.campaign,o=c?.outside;
  const camp=k&&k.receipts!=null?`<b>${fmt$(k.receipts)}</b><span>Campaign funds raised</span><small>${shortPer(k.end)}</small>`:`<b class="hc-na">${wait}</b><span>Campaign funds raised</span><small>${s.fecCand?'from the daily FEC refresh':'no FEC candidate ID listed'}</small>`;
  const out=offBallot(s)?`<b class="hc-na">Not running for election in 2026</b><span>Outside money</span><small>no 2026 race</small>`
    :o?`<b class="hc-two"><i class="sw" style="background:var(--s3)"></i>${fmt$(o.support)} <em>for</em><br><i class="sw" style="background:var(--s2)"></i>${fmt$(o.oppose)} <em>against</em></b><span>Outside money</span><small>${shortPer(o.through)}</small>`
    :`<b class="hc-na">${wait}</b><span>Outside money</span><small>from the daily FEC refresh</small>`;
  const mini=!withMini?'':`<div class="hc-mini"><div class="hc-mh"><span>Outside money by month</span><span></span></div><p class="small muted" style="margin:4px 0 0">${offBallot(s)?`Not running for election in 2026. ${esc(s.short)}'s seat is next on the ballot in ${s.nextElection}.`:'Seat up in 2026, in a race this site doesn\'t cover in depth. Outside spending shows on the profile once refreshed.'}</p></div>`;
  return `<div class="hc-money"><div class="hc-mt">${camp}</div><div class="hc-mt">${out}</div></div>${mini}`;
}
function basicCard(s){
  return `<article class="card sen-card hc" tabindex="0" data-id="${s.id}" role="link" aria-label="Open profile of ${esc(s.name)}">
    <div class="hc-top">${portrait(s)}<div class="hc-who">
      <div class="row" style="gap:5px"><span class="chip ${s.party}">${s.party} · ${esc(s.state)}</span><span class="chip ch">Senate</span></div>
      <div class="name">${esc(s.name)}</div><div class="hc-sub">${esc(`In the Senate since ${String(s.since).slice(0,4)} · Next election ${s.nextElection}`)}</div></div></div>
    <div class="hc-ideo">${esc(s.ideo?ideoText(s).short:'No voting score yet')}</div>
    ${hcHead('✓','rc','Report Card','Four A–F grades from the documented record and your own answers')}
    ${basicReport(s)}
    ${hcHead('$','mi','Money &amp; Influence Analysis','Campaign money from the daily FEC refresh, and outside spending for and against them')}
    <div class="hc-live" data-basic="${s.id}">${basicMoney(s,undefined)}</div>
    <div class="hc-ft"><span>${esc(ballotLine(s))}</span><span class="hc-vs">Basic profile →</span></div>
  </article>`;
}
async function fillBasic(root=document){
  const els=[...root.querySelectorAll('.hc-live[data-basic]')];if(!els.length)return;
  const all=await loadCards();
  for(const el of els)if(el.isConnected){const s=BASIC[el.dataset.basic];el.innerHTML=basicMoney(s,all?(all[s.id]||{}):null,{mini:el.dataset.mini!=='0'});}
}
// The records each tab adds from the daily refresh (public/live.js), the same groups the full profiles' tabs show.
const BASIC_LIVE={match:['legislation','cosponsored','crs','committees','votes'],promises:['crec-day','hearings','statements','factcheck','news'],
  ethics:['netWorth','trades','legal'],pvp:['donorOrgs'],finance:['campaign','campaign-history','donor-sizes','pac','outside','donorOrgs','outside-groups']};
const BASIC_INTRO='These update on their own from official sources. Nothing here has been reviewed yet, so none of it counts toward a grade.';
function renderBasic(s,tab,focus){
  if(!PANES[tab]||tab==='sources')tab='overview';
  const cmte=[...new Set(committeesOf(s).map(c=>fullCommittee(c.id)))].map(id=>(COMMITTEES.committees[id]||{}).name).filter(Boolean);
  app.innerHTML=`
  <header class="phead">
    <div class="top"><div>
      <div class="row"><span class="chip ch">Senate</span><span class="chip ${esc(s.party)}">${partyName(s.party)} · ${esc(s.stateName)}</span><span class="chip ghost">Term ends ${fmtDate(s.termEnd)}</span><span class="chip ghost">Basic profile</span></div>
      <h1 style="margin-top:8px">${esc(s.name)}</h1>
      <p class="small" style="margin:8px 0 0;color:var(--ink-2);max-width:80ch">${esc(s.short)} isn't in the 2026 races this site covers in depth, so there's no reviewed research yet and every grade reads "Not graded". The tabs show their official records from the daily refresh.</p>
    </div></div>
    <div class="meta">
      <div><span>In the Senate since</span>${esc(monthYear(s.since))}</div>
      <div><span>2026 ballot</span>${esc(ballotLine(s))}${offBallot(s)?` · next election ${s.nextElection}`:''}</div>
      <div class="roles"><span>Committees / roles</span>${esc(cmte.join('; ')||'None listed')}</div>
      <div><span>Identifiers</span><span class="mono" style="display:inline;color:var(--ink-2);text-transform:none;letter-spacing:0;font-size:.82rem">${s.fecCand?'FEC '+esc(s.fecCand)+' · ':''}Bioguide ${esc(s.bioguide)}${s.lis?' · LIS '+esc(s.lis):''}</span></div>
    </div>
    <div class="links row">
      ${s.fecCand?`<a href="${fecCycleUrl(s.fecCand,s.nextElection)}" target="_blank" rel="noopener">FEC candidate summary ↗</a>`:''}
      <a href="${cgUrl(s)}" target="_blank" rel="noopener">Congress.gov member page ↗</a>
      ${s.site?`<a href="${esc(s.site)}" target="_blank" rel="noopener">Official site ↗</a>`:''}
      <a href="#senate">All senators →</a>
    </div>
  </header>
  <div class="tabs"><div class="wrap" style="padding-inline:0" id="tabs">${TABS.map(([k,l])=>`<button data-tab="${k}" class="${k===tab?'active':''}">${l}</button>`).join('')}</div></div>
  <section class="section" id="pane" data-basic="1"></section>`;
  $('#tabs').addEventListener('click',e=>{const b=e.target.closest('button');if(b)location.hash=`${s.id}-${b.dataset.tab}`;});
  const pane=$('#pane'),person={id:s.id,name:s.name,chamber:'S',bioguide:s.bioguide};
  const live=()=>{const host=pane.querySelector('#live-records');if(host)window.RecordLive.profile(person,host,BASIC_LIVE[tab],{intro:BASIC_INTRO});};
  const head=(title,k)=>gradeHead(title,null,BASIC_GRADE[k],gradeRule(k));
  if(tab==='overview'){
    pane.innerHTML=`
    <h2>At a glance</h2>
    <p class="intro">Their four grades and the main facts at a glance. The grades stay "Not graded" until their research is reviewed.</p>
    <div class="ov-grades">${basicReport(s,true)}</div>
    <div class="ov-grid">
      ${ovCard(offBallot(s)?'Not on the ballot':'2026 ballot',offBallot(s)?'Not running for election in 2026':'Seat up in 2026',`Class ${s.class} · term ends ${fmtDate(s.termEnd)}`,`<div class="big">${offBallot(s)?`Next election ${s.nextElection}`:'Race not covered here'}</div>${points([offBallot(s)?['No 2026 race','No opponent, race rating or 2026 outside spending to show.']:['Not covered in depth','This seat is on the 2026 ballot, but the race isn\'t one of the races this site profiles.'],['Still tracked','Their votes, bills, statements, stock trades and campaign money, from the daily refresh.']],'small')}`,'')}
      ${ovCard('Campaign money','Campaign funds raised','From the daily FEC refresh',`<div class="hc-live" data-basic="${s.id}" data-mini="0">${basicMoney(s,undefined,{mini:false})}</div>`,`<a href="#${s.id}-finance">Money &amp; Influence →</a>`)}
      ${ovIdeo(s)}
      ${ovCard('Your issues','How they compare with your choices','Issue by issue, never a single score',`<div class="big">Not graded</div><p class="small" style="margin:6px 0 0;color:var(--ink-2)">${BASIC_GRADE.match}</p>`,`<a href="#${s.id}-match">Their votes and bills →</a>`)}
      ${ovCard('Words and actions','Do their words match their actions?','Checked statements','<div class="big">No statements checked</div>',`<a href="#${s.id}-promises">Their statements →</a>`)}
      ${ovCard('Ethics','Ethics record','Reviewed cases','<div class="big">Not reviewed yet</div><p class="small" style="margin:6px 0 0;color:var(--ink-2)">Court records, FEC enforcement records and DOJ press releases are listed as leads, not scored.</p>',`<a href="#${s.id}-ethics">Ethics leads →</a>`)}
    </div>
    <div class="cols" style="margin-top:14px">
      <div class="card"><h3>Term in office</h3><p class="small" style="margin-top:8px">In the Senate since ${esc(monthYear(s.since))}.</p><p class="small" style="margin-top:6px">Class ${s.class}. Current term ends ${fmtDate(s.termEnd)}. ${esc(ballotLine(s))}.</p><p style="margin-top:10px"><a href="#senate">All senators →</a></p></div>
      <div class="card"><h3>Votes &amp; bills</h3><p class="small" style="margin-top:8px">Their sponsored and cosponsored bills, committee seats and roll-call votes, from the daily refresh.</p><p style="margin-top:10px"><a href="#${s.id}-match">The record behind the match →</a></p></div>
    </div>`;
    mountStrip('ovstrip',s);mountKV('ovkv',s);fillBasic(pane);
  }else if(tab==='match'){
    pane.innerHTML=`${head('Your match','match')}
    <h2 id="m-record" style="margin-top:34px">The record behind the match</h2>
    <div id="rec-ideo">${s.ideo?ideoBlock(s,'ideo-b'):`<div class="chart"><div class="kicker">Voting ideology</div><p style="margin:8px 0 0">No DW-NOMINATE score yet. Voteview scores a senator once they have cast enough roll-call votes.</p></div>`}</div>
    ${committeeBlock(s)}<section id="live-records" style="margin-top:28px"></section>`;
    if(s.ideo)mountIdeo('ideo-b',s);live();
  }else if(tab==='promises'){pane.innerHTML=`${head('Promises delivered','prom')}<section id="live-records" style="margin-top:28px"></section>`;live();}
  else if(tab==='ethics'){pane.innerHTML=`${head('Ethics','eth')}<section id="live-records" style="margin-top:28px"></section>`;live();}
  else if(tab==='pvp'){pane.innerHTML=`${head('Workers > Profit','pvp')}<section id="live-records" style="margin-top:28px"></section>`;live();}
  else{
    pane.innerHTML=`<h2>Money &amp; Influence</h2><p class="intro">Who pays for ${esc(s.short)}'s campaign, from the daily FEC refresh. Never part of a grade.</p>
    <div class="cols" style="margin-bottom:14px">
      <div class="card"><h3>Campaign money</h3><div class="hc-live" data-basic="${s.id}" data-mini="0">${basicMoney(s,undefined,{mini:false})}</div></div>
      <div class="card"><h3>Outside spending</h3><p class="small" style="margin-top:8px"><b>${esc(ballotLine(s))}.</b> ${offBallot(s)?`Outside groups spend for and against candidates in a race, and ${esc(s.short)} has no 2026 race. The seat is next on the ballot in ${s.nextElection}.`:'Any outside spending for or against them is listed below once the FEC refresh reads it.'}</p></div>
    </div>
    <section id="live-records"></section>`;
    fillBasic(pane);live();
  }
  bindTips(pane);
  if(focus){const t=document.getElementById(focus);if(t)setTimeout(()=>t.scrollIntoView({block:'start'}),50);}
  const act=$('#tabs .active');if(act)act.scrollIntoView({block:'nearest',inline:'center'});
}
function tiles(items){return `<div class="tiles">${items.map(t=>`<div class="tile"><div class="l">${t[0]}</div><div class="v">${t[1]}</div><div class="d">${t[2]||''}</div></div>`).join('')}</div>`}
const statedVotes=s=>CH[icH(s)].votes.filter(v=>s.id in v.pos&&!/not in office/i.test(v.pos[s.id])).length;

// ---------- overview: five quick visuals and a short ethics list ----------
const ovPct=(v,t)=>{const p=v/t*100;return p<0.5?'<1%':Math.round(p)+'%'};
function ovCard(kicker,title,sub,body,foot,cls){
  return `<section class="chart ov-card ${cls||''}"><div class="kicker">${kicker}</div><h3>${title}</h3><p class="sub">${sub}</p>${body}${foot?`<p class="ov-foot small muted">${foot}</p>`:''}</section>`;
}
// 1. where the campaign's money comes from: one bar, parts of FEC total receipts (none counted twice)
function ovMoney(s,here){
  const c=s.camp, T='Where the campaign’s money comes from';
  if(c.missing)return ovCard('Campaign money',T,'Share of campaign funds raised, by source',`<div class="note"><b>No FEC financial report yet.</b> ${esc(c.note)}</div>`,`<a href="${fecCandUrl(s.fecCand)}" target="_blank" rel="noopener">FEC candidate page ↗</a>`,'ov-wide');
  const split=c.itemized!=null&&c.unitemized!=null;
  const defs=[
    ...(split?[['Small donors','gifts of $200 or less','--s1',c.unitemized],['Larger individual donors','gifts over $200','--s2',c.itemized]]:[['Individual donors','size split not available','--s1',c.indiv]]),
    ['PACs','political action committees','--s3',c.pac],
    ['Party committees','','--s4',c.party],
    ['Candidate’s own money and loans','','--s5',c.self],
    ['Joint fundraising and other','transfers and other receipts','--muted',(c.transfers||0)+Math.max(0,c.other||0)],
  ];
  const segs=defs.map(([l,d,col,v])=>({l,d,col,v:Math.max(0,v||0)})).filter(x=>x.v>0);
  const tot=segs.reduce((a,x)=>a+x.v,0)||1;
  const top=segs.slice().sort((a,b)=>b.v-a.v)[0];
  const rows=[...(split?[['Individuals, $200 or less',c.unitemized],['Individuals, over $200',c.itemized]]:[['Individuals',c.indiv]]),['PACs and other committees',c.pac],['Joint fundraising transfers',c.transfers],['Party committees',c.party],['Candidate’s own loans and contributions',c.self],['Other receipts',c.other==null?null:Math.max(0,c.other)]].filter(r=>r[1]!=null);
  const body=`<div class="big" style="font-size:1.15rem">Largest source: ${esc(top.l.toLowerCase())}, ${ovPct(top.v,tot)}</div>
    <div class="ov-stack" role="group" aria-label="Campaign funds raised, by source">${segs.map(x=>`<i style="flex:${x.v};background:var(${x.col})" data-tip="${esc(x.l)}: ${fmtFull(x.v)} (${ovPct(x.v,tot)})"></i>`).join('')}</div>
    <ul class="ov-legend">${segs.map(x=>`<li><i style="background:var(${x.col})"></i><span>${esc(x.l)}${x.d?`<small class="muted">${esc(x.d)}</small>`:''}</span><b>${ovPct(x.v,tot)}</b><span class="v">${fmt$(x.v)}</span></li>`).join('')}</ul>
    <details class="tv"><summary>Show as a table</summary><div class="tablewrap"><table><thead><tr><th>Source</th><th class="r">Amount</th><th class="r">Share</th></tr></thead><tbody>${rows.map(([l,v])=>`<tr><td>${esc(l)}</td><td class="r">${fmtFull(v)}</td><td class="r">${v>0?ovPct(v,c.receipts):'0%'}</td></tr>`).join('')}</tbody></table></div></details>`;
  return ovCard('Campaign money',T,`Share of the ${fmtFull(c.receipts)} the campaign raised, ${period(c.start,c.end)}`,body+`<div class="ov-sizes" data-sizes="${esc(s.id)}" hidden></div>`,`FEC two-year committee summary · <a href="${esc(c.src)}" target="_blank" rel="noopener">source ↗</a>${here?'':` · <a href="#${s.id}-finance">Money &amp; Influence details →</a>`}`,'ov-wide');
}
// The money card's second bar: individual donors' money by gift size, from the daily FEC refresh (public/donor-sizes.js).
// Left out when the update service is offline; says so while the first refresh is still to come.
async function fillSizes(root){
  for(const el of root.querySelectorAll('.ov-sizes[data-sizes]')){
    const s=byId[el.dataset.sizes];if(!s)continue;
    let x;try{x=await window.RecordLive.section(s.id,'donor-sizes');}catch{continue;}
    if(!el.isConnected)continue;el.hidden=false;
    const head=`<h4 class="ov-subhead">Individual donors, by gift size</h4>`;
    const parts=x?sizeParts(x):[];
    if(!parts.length){el.innerHTML=`${head}<p class="small muted" style="margin:4px 0 0">${x?'No gifts from individuals reported for this cycle yet.':'Appears after the FEC gift-size refresh runs.'}</p>`;continue;}
    const share=k=>sizeShare(x.brackets[k].total,x.total);
    el.innerHTML=`${head}<p class="small muted" style="margin:2px 0 0">Share of the ${fmtFull(x.total)} individuals gave${x.start?`, ${period(x.start,x.end)}`:''}. Each gift counts by its own amount, so "$200 and under" also holds smaller gifts from donors who gave more in all, and can be larger than "Small donors" above. <a href="${esc(x.source)}" target="_blank" rel="noopener">FEC ↗</a></p>
      <div class="big" style="font-size:1rem;margin-top:6px">Of individuals' money: $200 and under ${share(0)} · $2,000 and over ${share(4)}</div>
      <div class="ov-stack" role="group" aria-label="Individual donors' money by gift size">${parts.map(p=>`<i style="flex:${p.total};background:var(--${p.key})" data-tip="${esc(p.label)}: ${fmtFull(p.total)} (${sizeShare(p.total,x.total)})"></i>`).join('')}</div>
      <ul class="ov-legend">${parts.map(p=>`<li><i style="background:var(--${p.key})"></i><span>${esc(p.label)}</span><b>${sizeShare(p.total,x.total)}</b><span class="v">${fmt$(p.total)}</span></li>`).join('')}</ul>
      <details class="tv"><summary>Show gift sizes as a table</summary><div class="tablewrap"><table><thead><tr><th>Gift size</th><th class="r">Amount</th><th class="r">Share</th></tr></thead><tbody>${parts.map(p=>`<tr><td>${esc(p.label)}</td><td class="r">${fmtFull(p.total)}</td><td class="r">${sizeShare(p.total,x.total)}</td></tr>`).join('')}</tbody></table></div></details>`;
    bindTips(el);
  }
}
// 2. outside money for and against: two bars on one scale, top groups named under each
function ovOutside(s,here){
  const o=s.out, f=o.for.total, a=o.against.total, T='Outside money for and against';
  const sub=`Spending by outside groups, ${period(o.start,o.end)}`;
  const foot=`<b>Not campaign money:</b> outside groups spend this on their own, and it is never added to the campaign's total.${o.multi?'':` <b>"For":</b> spending that supports ${esc(s.short)} or attacks their opponent.`} ${here?'Every group and filing is listed below.':`<a href="#${s.id}-finance">Every group and filing →</a>`}`;
  if(!(f>0)&&!(a>0))return ovCard('Outside money',T,sub,`<div class="note">No outside spending for or against ${esc(s.short)} was reported through ${fmtDate(o.end)}.</div>`,foot);
  const max=Math.max(f,a,1);
  const col=(label,amt,list,cls)=>`<div class="ov-col"><div class="ov-amt">${fmt$(amt)}</div>
    <div class="ov-plot">${amt>0?`<i class="${cls}" style="height:${Math.max(2,amt/max*100).toFixed(1)}%" data-tip="${esc(label)}: ${fmtFull(amt)}"></i>`:''}</div>
    <div class="ov-collab">${esc(label)}</div>
    ${list.length?`<ul class="ov-top">${list.map(x=>`<li><span>${orgName(x.name,x.about)}<small class="muted">${CLS1[x.cls]||''}</small></span><b>${fmt$(x.amt)}</b></li>`).join('')}</ul>`:'<p class="small muted" style="margin:6px 0 0">No groups reported</p>'}</div>`;
  const body=`<div class="ov-pair">${col(forLabel(s),f,topSpenders(s,'for',3),'for')}${col(agLabel(s),a,topSpenders(s,'against',3),'ag')}</div>${o.incomplete.length?`<p class="small" style="margin:10px 0 0">${flag('Incomplete data',o.incomplete.join(' '))}</p>`:''}`;
  return ovCard('Outside money',T,sub,body,foot);
}
// 3. issue by issue against the viewer's own choices; no evidence is left blank, never scored as a mismatch
function ovAlign(s){
  const r=scoreFor(s), T='How they compare with your choices';
  if(!r.nChosen)return ovCard('Your issues',T,'Issue by issue, never a single score',`<p class="small" style="margin:0 0 6px">Pick your positions on up to ${ISS.length} issues in My alignment to see where ${esc(s.short)}'s record matches you.</p>${points([['Evidence available',esc(evidenceMix(s))]],'small')}<a class="cta" href="#align" style="margin-top:10px">Choose my issues</a>`,'');
  const kind=x=>x.status==='none'?'none':x.agree===1?'match':x.agree===0?'differ':'mixed';
  const SYM={match:'✓',differ:'✕',mixed:'◐',none:''};
  const rows=r.rows.map(x=>({x,k:kind(x)}));
  const n=k=>rows.filter(y=>y.k===k).length;
  const txt=({x,k})=>{
    if(k==='none')return 'No evidence';
    const lead=k==='match'?'Matches you':k==='differ'?'Doesn’t match':`Mixed: ${x.match} of ${x.n} match`;
    return lead+(x.status==='stated'?' <span class="muted">(stated position only)</span>':'');
  };
  const body=`<div class="row" style="margin-bottom:6px"><span class="chip good">✓ ${n('match')} match</span><span class="chip crit">✕ ${n('differ')} differ</span>${n('mixed')?`<span class="chip warn">◐ ${n('mixed')} mixed</span>`:''}<span class="chip ghost">${n('none')} no evidence</span></div>
    <ul class="ov-iss">${rows.map(y=>`<li class="${y.k}"><span class="ov-mk ${y.k}" aria-hidden="true">${SYM[y.k]}</span><span>${esc(y.x.i.label)}</span><span class="r">${txt(y)}</span></li>`).join('')}</ul>`;
  return ovCard('Your issues',T,`Your ${r.nChosen} chosen issue${r.nChosen===1?'':'s'}. An issue with no evidence is left blank, not counted as a mismatch.`,body,`Not a rating of the candidate. <a href="#${s.id}-match">Evidence for every issue →</a>`);
}
// ---------- key-vote ideology: bills marked liberal or conservative, scored from how each person voted ----------
const kvCache=new Map();
const kvScore=s=>{if(!kvCache.has(s.id))kvCache.set(s.id,keyVoteScore(keyVoteRows(CH[icH(s)].votes,s.id,ISSBY)));return kvCache.get(s.id)};
function kvTotals(C){
  let lib=0,con=0;
  CH[C].votes.forEach(v=>{const l=leanOfVote(v,ISSBY);if(l==='liberal')lib++;else if(l==='conservative')con++;});
  return {lib,con,n:lib+con};
}
const kvSide=side=>`<span class="chip ${side==='liberal'?'D':'R'}">Voted ${side==='liberal'?'Liberal':'Conservative'} Side</span>`;
// A Yea/Nay row's mark, for the vote lists: what a Yea means, or that the bill is not marked and why.
function leanTag(v){
  const l=leanOfVote(v,ISSBY);
  return l?`<span class="chip ${l==='liberal'?'D':'R'}" title="This bill is marked ${l}: a Yea takes the ${l} side and a Nay takes the other.">A Yea is the ${l} side</span>`:`<span class="chip ghost" title="${esc(whyNotMarked(v,ISSBY))}">Not marked liberal or conservative</span>`;
}
// A person's vote on a bill, always plain black text; the side taken is shown separately in the "Side taken" chip.
function voteText(v,pos){
  const l=v?leanOfVote(v,ISSBY):null, side=l?sideTaken(l,pos):null;
  const tip=side?`${pos}: voted the ${side} side on a bill marked ${l}`:l?`${pos}: no side taken`:`${pos}: bill not marked liberal or conservative`;
  return `<span class="vt" title="${esc(tip)}">${esc(pos)}</span>`;
}
const vtLegend=()=>points([['Reading a vote',"A yes vote takes the bill's marked side, liberal or conservative. A no vote takes the other side."],['Side taken','The column that says which side each vote was on.'],['Unmarked bills','Bills not marked liberal or conservative have no side.']],'small vtkey');
function kvBlock(s,id,full){
  const kv=kvScore(s), C=icH(s), tot=kvTotals(C), noun=CH[C].noun, T='Key votes marked liberal or conservative';
  const head=`<div class="kicker">${T}</div>`;
  if(!CH[C].votes.length)return `${head}<p class="small" style="margin:6px 0 0;color:var(--ink-2)">${esc(s.short)} casts no roll-call votes in this office, so there is no key-vote position.</p>`;
  if(!kv.n)return `${head}<p class="small" style="margin:6px 0 0;color:var(--ink-2)">${esc(s.short)} has no Yea or Nay on the ${tot.n} bills marked in the ${CH[C].name} set, so there is no key-vote position.</p>`;
  const rows=kv.rows.slice().sort((a,b)=>b.v.date.localeCompare(a.v.date));
  const table=`<details class="tv" ${full?'open':''}><summary>${full?'The marked bills':'Show the marked bills'} (${kv.n})</summary>${vtLegend()}<div class="tablewrap"><table><thead><tr><th>Date</th><th>Bill</th><th>Vote</th><th>Side taken</th><th>How it is marked</th></tr></thead><tbody>${rows.map(r=>`<tr><td class="mono" style="white-space:nowrap">${fmtDate(r.v.date)}</td><td><a href="${voteUrl(r.v)}" target="_blank" rel="noopener">${esc(r.v.short)}</a></td><td>${voteText(r.v,r.pos)}</td><td>${kvSide(r.side)}</td><td class="small">A Yea is the ${r.lean} side</td></tr>`).join('')}</tbody></table></div></details>`;
  if(!kv.ok)return `${head}<p class="small" style="margin:6px 0 0;color:var(--ink-2)">${esc(s.short)} voted on only ${kv.n} of the ${tot.n} marked ${CH[C].name} bills. At least ${KV_MIN} are needed for a position, so none is shown.</p>${table}`;
  const pool=ALL.filter(p=>icH(p)===C&&kvScore(p).ok);
  const unmarked=full?CH[C].votes.filter(v=>!leanOfVote(v,ISSBY)):[];
  const why=unmarked.length?`<details class="tv"><summary>The other ${unmarked.length} ${CH[C].name} bills, not marked, and why</summary><ul class="list small" style="margin-top:8px">${unmarked.map(v=>`<li><b>${esc(v.short)}</b> <span class="muted">${esc(whyNotMarked(v,ISSBY))}</span></li>`).join('')}</ul></details>`:'';
  return `${head}<div class="big" style="margin-top:4px">Conservative side on ${kv.con} of ${kv.n} marked bills</div>
    <p class="small muted" style="margin:4px 0 6px">Liberal side on ${kv.lib} of ${kv.n}. A missed vote is not counted.</p>
    <div class="ideo" id="${id}"></div>
    ${points([['Each dot',`One profiled ${noun} with at least ${KV_MIN} marked votes (${pool.length} in all).`],['Bills marked',`${tot.n} in the ${CH[C].name} set. A yes vote is the liberal side on ${tot.lib} and the conservative side on ${tot.con}.`],['Compare within',`The ${CH[C].name} only, since each chamber votes on different bills.`],['Not the career score','This counts selected votes only.']],'small')}
    ${table}${why}`;
}
function drawKV(el,s){
  if(!el)return;
  const me=kvScore(s);if(!me.ok)return;
  const C=icH(s), pool=ALL.filter(p=>icH(p)===C&&kvScore(p).ok).sort((a,b)=>kvScore(a).share-kvScore(b).share);
  const W=Math.max(280,el.clientWidth), small=W<520, d=small?9:11, mL=16, mR=16;
  const X=v=>mL+v*(W-mL-mR), nb=Math.floor((W-mL-mR)/d), bins={};
  let maxS=0;
  const placed=pool.map(p=>{const b=Math.min(nb-1,Math.floor((X(kvScore(p).share)-mL)/d));const k=bins[b]||0;bins[b]=k+1;if(k+1>maxS)maxS=k+1;return [p,mL+(b+.5)*d,k]});
  const top=38, base=top+maxS*d, H=base+50;
  let g='',mine='';
  placed.forEach(([p,cx,k])=>{
    const k2=kvScore(p), cy=base-(k+.5)*d, cls=p.party==='R'?'r':p.party==='D'?'d':'i';
    const tip=`${p.name} (${p.party}) · conservative side on ${k2.con} of ${k2.n}`;
    if(p.id===s.id){
      const anchor=cx<W*.18?'start':cx>W*.82?'end':'middle';
      mine=`<line class="guide" style="stroke-dasharray:none" x1="${cx}" x2="${cx}" y1="${top-8}" y2="${cy-d/2-2}"></line><circle class="me ${cls}" cx="${cx}" cy="${cy}" r="${d/2+1.5}" data-tip="${esc(tip)}"></circle><text class="me-lab" x="${cx}" y="${top-14}" text-anchor="${anchor}">${esc(s.short)} · ${k2.con} of ${k2.n}</text>`;
    } else g+=`<circle class="${cls}" cx="${cx}" cy="${cy}" r="${d/2-.6}" data-tip="${esc(tip)}"></circle>`;
  });
  let ax=`<line class="axis" x1="${mL}" x2="${W-mR}" y1="${base+2}" y2="${base+2}"></line>`;
  [[0,'0%','start'],[.5,'50%','middle'],[1,'100%','end']].forEach(([v,l,a])=>{ax+=`<line class="axis" x1="${X(v)}" x2="${X(v)}" y1="${base+2}" y2="${base+7}"></line><text class="tick" x="${X(v)}" y="${base+19}" text-anchor="${a}">${l}</text>`;});
  ax+=`<text class="cap" x="${mL}" y="${base+40}">← Liberal side every time</text><text class="cap" x="${W-mR}" y="${base+40}" text-anchor="end">Conservative side every time →</text>`;
  el.innerHTML=`<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${esc(s.name)} took the conservative side on ${me.con} of ${me.n} bills marked liberal or conservative, among ${pool.length} ${CH[C].nouns}">${ax}${g}${mine}</svg>`;
  bindTips(el);
}
function mountKV(id,s){const f=()=>drawKV(document.getElementById(id),s);f();resizers.push(f);}

// 4. one line from most liberal to most conservative, the candidate among faint dots for the whole chamber
function ovIdeo(s){
  const it=ideoText(s), T='Where they sit politically', kv=kvScore(s);
  if(!s.ideo&&!kv.ok){
    const few=kv.n?` ${esc(s.short)} voted on only ${kv.n} bill${kv.n===1?'':'s'} marked liberal or conservative, too few for a position.`:'';
    return ovCard('Politics',T,'Needs a congressional voting record',`<div class="big">No voting score</div><p class="small" style="margin:6px 0 0;color:var(--ink-2)">${esc(it.short)}. A position is shown only where there is a congressional voting record, and is never guessed.${few}</p>`,`<a href="#${s.id}-record">Record and votes →</a>`,'ov-wide');
  }
  const C=icH(s);
  const career=s.ideo?`<div class="kicker">Whole career, Voteview</div><div class="big" style="margin-top:4px">${esc(it.head)}</div><div class="ideo ov-strip" id="ovstrip"></div>${points([['Each faint dot',`One current ${CH[C].noun} (${DATA.pools[C].length} in all).`],['Score',`${s.ideo.dim1>0?'+':''}${s.ideo.dim1.toFixed(3)}, on a scale from −1 (most liberal) to +1 (most conservative), from Voteview's DW-NOMINATE.`]],'small')}`:'';
  const keyv=kv.ok?`<div class="${s.ideo?'ov-sep':''}">${kvBlock(s,'ovkv',false)}</div>`:'';
  return ovCard('Politics',T,kv.ok&&s.ideo?'Two views: the whole career, and the bills marked liberal or conservative':kv.ok?'From the bills marked liberal or conservative':'Whole career',career+keyv,`<a href="#${s.id}-record">Full chart with names and every vote →</a> · <a href="#method">How bills are marked</a>`,'ov-wide');
}
function drawStrip(el,s){
  if(!el||!s.ideo)return;
  const C=icH(s), pts=DATA.pools[C];
  const W=Math.max(260,el.clientWidth), mL=12, mR=12, x0=-1, x1=1.05, lineY=48, H=96;
  const X=v=>mL+(Math.max(x0,Math.min(x1,v))-x0)/(x1-x0)*(W-mL-mR);
  const meIdx=pts.findIndex(p=>(s.bioguide&&p[3]===s.bioguide)||p[2]===s.name);
  let g='';
  pts.forEach((p,i)=>{if(i===meIdx)return;g+=`<circle class="f ${p[1]==='R'?'r':p[1]==='D'?'d':'i'}" cx="${X(p[0]).toFixed(1)}" cy="${(lineY+((i*37)%9-4)*1.5).toFixed(1)}" r="3.2"></circle>`;});
  const mx=X(s.ideo.dim1), score=(s.ideo.dim1>0?'+':'')+s.ideo.dim1.toFixed(2);
  const anchor=mx<W*.18?'start':mx>W*.82?'end':'middle';
  const me=`<line class="guide" style="stroke-dasharray:none" x1="${mx}" x2="${mx}" y1="${lineY-30}" y2="${lineY-8}"></line><circle class="me ${s.party==='R'?'r':'d'}" cx="${mx}" cy="${lineY}" r="6.5" data-tip="${esc(s.name)} · ${score}"></circle><text class="me-lab" x="${mx}" y="${lineY-36}" text-anchor="${anchor}">${esc(s.short)} ${score}</text>`;
  const ax=`<line class="axis" x1="${mL}" x2="${W-mR}" y1="${lineY}" y2="${lineY}"></line><text class="cap" x="${mL}" y="${H-6}">← More liberal</text><text class="cap" x="${W-mR}" y="${H-6}" text-anchor="end">More conservative →</text>`;
  el.innerHTML=`<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${esc(s.name)}'s DW-NOMINATE score ${s.ideo.dim1.toFixed(3)} among ${pts.length} ${CH[C].nouns}; ${esc(ideoText(s).head)}">${ax}${g}${me}</svg>`;
  bindTips(el);
}
function mountStrip(id,s){const f=()=>drawStrip(document.getElementById(id),s);f();resizers.push(f);}
// 5. do their words match their actions: a tally of checked statements that always shows how many were checked
const WORD_GROUPS=[
  ['Record supports it','good','✓',['consistent'],true],
  ['Partly supported, or changed over time','warn','◐',['partial','changed'],true],
  ['Record contradicts it','crit','✕',['contradiction'],true],
  ['Unclear, or later events matter','neutral','◇',['unclear','outcome'],false],
];
function ovWords(s){
  const T='Do their words match their actions?', N=s.statements.length;
  if(!N)return ovCard('Words and actions',T,'Checked statements',`<div class="big">No statements checked</div>`,'');
  const groups=WORD_GROUPS.map(([label,cls,icon,keys,always])=>({label,cls,icon,always,items:s.statements.filter(x=>keys.includes(x.assessment))}));
  const body=`<div class="big">${N} statement${N===1?'':'s'} checked</div>
    <div class="ov-tiles" role="group" aria-label="${N} checked statements, grouped by result">${groups.map(g=>g.items.map(x=>`<i class="${g.cls}" data-tip="${esc(x.topic)}: ${esc(g.label.toLowerCase())}">${g.icon}</i>`).join('')).join('')}</div>
    <ul class="ov-tally">${groups.filter(g=>g.always||g.items.length).map(g=>`<li><span class="chip ${g.cls}">${g.icon}</span><span>${g.label}</span><b class="num">${g.items.length}</b></li>`).join('')}</ul>
    <details class="tv"><summary>Show the statements</summary><ul class="list small" style="margin-top:8px">${groups.map(g=>g.items.map(x=>`<li>${esc(x.topic)} <span class="muted">· ${esc(g.label.toLowerCase())}</span></li>`).join('')).join('')}</ul></details>`;
  return ovCard('Words and actions',T,`Only the statements that were checked, not everything ${esc(s.short)} has said.`,body,`<a href="#${s.id}-promises">Read the checks →</a>`);
}
// ethics: a short text list, never a chart, because an allegation, an investigation and a confirmed finding are very different things
const ETH_TAG={finding:['Confirmed finding','crit'],investigation:['Investigation','warn'],allegation:['Allegation','neutral']};
function ovEthicsCard(s){
  const items=s.ethics.filter(e=>e.outcome!=='None found');
  const order=Object.keys(ETH_TAG), rank=e=>{const i=order.indexOf(e.status);return i<0?order.length:i};
  const list=items.map((e,i)=>[e,i]).sort((a,b)=>rank(a[0])-rank(b[0])||a[1]-b[1]).map(x=>x[0]);
  const body=list.length?`<ul class="ov-eths">${list.map(e=>{const [lab,cls]=ETH_TAG[e.status]||[e.type,'ghost'];return `<li class="ov-eth"><span class="chip ${cls}">${esc(lab)}</span><b>${esc(e.title)}</b> <span class="mono muted">${esc(e.date)}</span><div class="small muted ov-clamp" style="margin-top:4px">${esc(e.outcome)}</div></li>`}).join('')}</ul>
    ${points([['Allegation','A complaint or report with no official finding.'],['Investigation',`A formal inquiry, lawsuit or case, still open or ended without a finding against ${esc(s.short)}.`],['Confirmed finding',`A court, agency or ethics body found a violation or issued a penalty, or ${esc(s.short)} admitted it.`]],'small')}`
    :`<p class="small" style="margin:8px 0 0">No documented violations, penalties or findings located in the sources checked.</p>`;
  return ovCard('Ethics','Ethics & compliance',`${list.length?`${list.length} item${list.length===1?'':'s'}, most certain first`:'Sources checked'}`,body,`<a href="#${s.id}-ethics">Details, sources and the grade →</a>`,'ov-top-align');
}
// The ethics card, with a line for the net-worth range from the member's latest annual disclosure (filled from the refresh).
function ovEthics(s){
  const card=ovEthicsCard(s),at=card.lastIndexOf('</section>');
  return at<0?card:card.slice(0,at)+`<div class="ov-networth" data-networth="${esc(s.id)}" hidden></div>`+card.slice(at);
}
async function fillNetWorth(root){
  for(const el of root.querySelectorAll('.ov-networth[data-networth]')){
    let x;try{x=await window.RecordLive.netWorth(el.dataset.networth);}catch{continue;}
    if(!x||!el.isConnected)continue;el.hidden=false;
    const lead=holdingsLead(x),held=lead?(lead.status==='stocks'?` It lists ${lead.stocks} individual stock${lead.stocks===1?'':'s'} or option${lead.stocks===1?'':'s'}.`:lead.status==='blind-trust'?' It lists a qualified blind trust.':' It lists no individual stocks.'):'';
    el.innerHTML=`<p class="small" style="margin:10px 0 0"><b>Net worth:</b> ${x.unreadable?'the latest annual report was filed on paper; not read':`${esc(rangeText(x,fmt$))}, from their ${esc(x.year||'')} annual disclosure (every value on it is a range)`}.${held} <a href="#${esc(el.dataset.networth)}-ethics">Details</a> · <a href="${esc(x.url)}" target="_blank" rel="noopener">report ↗</a></p>`;
  }
}

// In place of the campaign and outside-money cards for someone in office who is not on the 2026 ballot.
function ovOffice(s){
  return ovCard('Not on the ballot','No 2026 race to show',esc(s.term),`<div class="big">${esc(s.seat)}</div>${points([['Nothing to compare','No 2026 campaign totals, outside spending or opponents.'],['Left out of','The filters, races, comparisons and score pages.'],['Grades','From the official acts and the ethics record.'],['Campaign committee',`${esc(s.cmteName||'The 2024 committee')} (${esc(s.fecCmte)}) still files with the FEC. Its latest totals are on the Money &amp; Influence tab.`]],'small')}`,`<a href="${fecCmteUrl(s.fecCmte)}" target="_blank" rel="noopener">FEC committee page ↗</a> · <a href="#${s.id}-finance">Money &amp; Influence →</a>`);
}
function paneOverview(s,pane){
  const race=raceOf(s), riv=rivalsOf(s);
  pane.innerHTML=`
  <h2>At a glance</h2>
  <p class="intro">Their four grades and the main facts at a glance. Click a grade, or use the tabs above, to see the evidence behind it.</p>
  <div class="ov-grades">${reportCard(s,true)}</div>
  <div class="ov-grid">
    ${s.office?ovOffice(s):ovMoney(s)+ovOutside(s)}
    ${ovAlign(s)}
    ${ovIdeo(s)}
    ${ovWords(s)}
    ${ovEthics(s)}
  </div>
  <div class="cols" style="margin-top:14px">
    ${s.office?`<div class="card"><h3>Term in office</h3><p class="small" style="margin-top:8px">${esc(s.since)}.</p><p class="small" style="margin-top:6px">${esc(s.term)}. ${esc(s.seat)}.</p><p style="margin-top:10px"><a href="#${s.id}-ethics">Ethics record →</a></p></div>`:`<div class="card"><h3>2026 race</h3>
      ${riv.length?`<ul class="list small" style="margin-top:8px">${riv.map(x=>`<li><a href="#${x.id}">${esc(x.name)}</a> (${x.party}${x.id===s.incumbent?', incumbent':''}): campaign funds ${campLine(x)}; outside spending for ${fmt$(x.out.for.total)}</li>`).join('')}</ul>`:'<p class="small muted">No profiled opponent.</p>'}
      ${race&&race.note?`<p class="small muted" style="margin-top:6px">${esc(race.note)}</p>`:''}
      <p style="margin-top:10px"><a href="#races">Side-by-side race view →</a></p></div>`}
    <div class="card"><h3>${s.cand?'Record':'Votes & bills'}</h3>
      ${s.cand?`<p class="small" style="margin-top:8px">${esc(REC_LABEL[s.recordType]||'')}. ${s.record.length} documented ${s.recordType==='state_legislator'?'votes and bills':s.recordType==='executive'?'official actions':'items'}${s.ideoKind==='house'?`, plus positions on ${statedVotes(s)} key House roll calls`:''}.</p><ul class="list small">${s.record.slice(0,3).map(r=>`<li>${esc(r.title)}</li>`).join('')}</ul>`:`<p class="small" style="margin-top:8px">Positions on ${statedVotes(s)} key ${CH[s.chamber].name} roll calls. ${s.sponsoredCount?`<b class="num">${s.sponsoredCount.toLocaleString()}</b> measures sponsored over a congressional career.`:''} ${s.bills.length} notable sponsored bills listed.</p>`}
      <p style="margin-top:10px"><a href="#${s.id}-record">The record behind your match →</a></p></div>
  </div>`;
  mountStrip('ovstrip',s);
  mountKV('ovkv',s);
  bindTips(pane);fillSizes(pane);fillNetWorth(pane);
}

function conduitBlock(s){
  const c=s.conduit||{status:'not_measured',rows:[],aipacDirect:[]};
  const direct=c.aipacDirect||[];
  const dsum=direct.reduce((a,b)=>a+b.amount,0);
  const head=`<h3 style="margin:22px 0 6px">${term('earmarked','Money routed through PACs on donors\' behalf')}</h3>
  <div style="margin-bottom:10px">${points([['PAC limit','A PAC can give a candidate at most $5,000 per election from its own account.'],['Conduits','Some groups also collect checks from their members and forward them ("earmarked" contributions).'],['Where it shows','The FEC counts that money as individual contributions. It is already in campaign funds raised, but not in the PAC table above, even though the group directed it.']],'small')}</div>`;
  let body='';
  if(c.status==='measured'){
    body=`<div class="tablewrap"><table><thead><tr><th>Conduit</th><th>Period</th><th class="r">Amount</th></tr></thead><tbody>${c.rows.map(r=>`<tr><td>${orgName(r.conduit,ORGS.about(r.conduit),`<a href="${fecCmteUrl(r.id)}" target="_blank" rel="noopener">${esc(r.conduit)}</a>`)}<div class="small" style="color:var(--ink-2);margin-top:4px">${esc(r.detail)}</div><div class="small" style="margin-top:4px">${r.srcs.map(x=>`<a href="${esc(x.u)}" target="_blank" rel="noopener">${esc(x.t)} ↗</a>`).join(' · ')}</div></td><td class="mono" style="white-space:nowrap">${esc(r.period)}</td><td class="r"><b>${fmtFull(r.amount)}</b></td></tr>`).join('')}</tbody></table></div>`;
  } else if(c.status==='present'){
    body=`<div class="note"><b>Earmarked money found, total not yet tallied.</b> ${esc(c.note)}</div>`;
  } else if(!DATA.bundled){
    body=`<div class="note"><b>Not measured for ${esc(s.short)}.</b> Earmarked totals come from each conduit's own FEC reports, which run to tens of thousands of rows. They could not be read accurately for this release, so no partial total is shown. This does not mean ${esc(s.short)} received none.</div>`;
  }
  let note=c.status==='measured'&&c.note?`<p class="small" style="margin-top:8px;color:var(--ink-2)">${esc(c.note)} ${c.noteSrc?`<a href="${esc(c.noteSrc.u)}" target="_blank" rel="noopener">${esc(c.noteSrc.t)} ↗</a>`:''}</p>`:(c.status==='present'&&c.noteSrc?`<p class="small" style="margin-top:6px"><a href="${esc(c.noteSrc.u)}" target="_blank" rel="noopener">${esc(c.noteSrc.t)} ↗</a></p>`:'');
  // The groups whose bundled gifts are read for everyone (research.json "bundled", scripts/build-bundled.mjs), first.
  const B=DATA.bundled,mine=Object.entries(B?.people?.[s.id]||{}).sort((a,b)=>b[1].routed-a[1].routed);
  if(B){
    const names=Object.keys(B.conduits||{}).map(k=>(GPBY[k]||{}).org||k);
    const hand=c.status==='measured'||c.status==='present';
    const auto=mine.length?`<div class="tablewrap"><table><thead><tr><th>Group</th><th>Cycle</th><th class="r">Gifts forwarded</th><th class="r">Amount</th></tr></thead><tbody>${mine.map(([k,v])=>`<tr><td>${orgName((GPBY[k]||{}).org||k,ORGS.group(k))}<div class="small"><a href="${esc(v.src)}" target="_blank" rel="noopener">FEC: what its PAC forwarded ↗</a>${v.direct?` · its PAC's own checks, ${fmtFull(v.direct)}, are in the PAC table above`:''}</div></td><td class="small">${esc(bundledCycle(s.id,k))}</td><td class="r">${v.n?v.n.toLocaleString():'—'}</td><td class="r"><b class="num">${fmtFull(v.routed)}</b></td></tr>`).join('')}</tbody></table></div>`
      :hand?'':`<div class="note">None of the groups tracked here (${esc(names.join(', '))}) forwarded donors' gifts to ${esc(s.short)}'s campaign, in the FEC's processed records as of ${esc(fmtDate(B.asOf))}.</div>`;
    const read=`From each group's PAC's own FEC reports, read ${esc(fmtDate(B.asOf))}. ActBlue and WinRed, which forward gifts for any campaign that uses them, aren't counted.`;
    if(!mine.length&&hand)body=`${body}${note}<p class="small muted" style="margin:6px 0 0">The automatic reading of every campaign's bundled gifts (from each group's PAC's own FEC reports, ${esc(fmtDate(B.asOf))}) found none for ${esc(s.short)}, so the figure researched by hand above stands.</p>`;
    else body=`${auto}<p class="small muted" style="margin:6px 0 0">${read}</p>${hand?`<details style="margin-top:8px"><summary>Researched by hand</summary>${body}${note}</details>`:''}`;
    note='';
  }
  const dl=s.pac.filings.length?(direct.length?`<p class="small" style="margin-top:8px"><b>Direct checks from AIPAC's PAC (${esc(s.pac.window)}):</b> <span class="num">${fmtFull(dsum)}</span>. ${direct.map(d=>`${esc(d.report)} ${fmtFull(d.amount)}`).join('; ')}. These are in the PAC table above.</p>`:`<p class="small muted" style="margin-top:8px">No direct check from AIPAC's PAC appears in the reports itemized here (${esc(s.pac.window)}).</p>`):'';
  return head+body+note+dl;
}

// ---------- Money & Influence tab: where the campaign's money comes from, outside money, and every filing behind them ----------
function paneFinance(s,pane){
  if(s.office)return paneFinanceOffice(s,pane);
  const c=s.camp, o=s.out;
  pane.innerHTML=`
  <h2>Money &amp; Influence</h2>
  <p class="intro">Two kinds of money, kept apart. Every figure shows its dates.</p>${points([['Campaign funds',`What ${esc(s.short)}'s own committee raised and reported to the FEC.`],['Outside spending','Money other groups spent on the race on their own. The campaign never receives it.']])}
  <nav class="jump small"><a href="#f-analysis">Money &amp; Influence Analysis</a><a href="#f-glance">At a glance</a><a href="#f-sum">Summary</a><a href="#f-camp">Campaign funds</a><a href="#f-pac">PAC contributions</a><a href="#f-out">Outside spending</a><a href="#f-items">Every item</a><a href="#f-comb">Combined view</a><a href="#live-records">Latest filings</a></nav>
  ${analysisBlock(s)}
  <div class="ov-grid" id="f-glance" style="margin-top:22px">${ovMoney(s,true)}${ovOutside(s,true)}${ovCard('Outside money','Outside money by month',`For and against ${esc(s.short)}, the last seven months`,miniOutside(s,true),`The badge is the for-to-against ratio for these months. <a href="#method">How it is figured</a>`)}</div>
  <div id="f-sum" style="margin-top:14px">${fundingPanels(s)}</div>
  ${scaleChart(s,false)}
  ${shareBlock(s)}
  <h2 id="f-camp" style="margin-top:28px">Campaign funds raised</h2>
  ${c.missing?`<div class="note"><b>No FEC financial report yet.</b> ${esc(c.note)} <a href="${fecCandUrl(s.fecCand)}" target="_blank" rel="noopener">FEC candidate page ↗</a></div>`:`
  <p class="small muted" style="margin:4px 0 0">${esc(c.cmte||'Campaign committee')} (${esc(c.cmteId)}) · FEC two-year summary, ${period(c.start,c.end)} · <a href="${esc(c.src)}" target="_blank" rel="noopener">source ↗</a></p>
  ${tiles([
    ['Campaign funds raised',fmt$(c.receipts),period(c.start,c.end)],
    ['Small donors',fmt$(c.unitemized),c.unitemized==null?'not broken out':`${pct(c.unitemized,c.receipts)}% of campaign funds (gifts of $200 or less)`],
    [term('pac','From PACs'),fmt$(c.pac),`${pct(c.pac,c.receipts)}% of campaign funds`],
    ['Spent · cash on hand',c.disbursements==null?fmt$(c.cash):`${fmt$(c.disbursements)} · ${fmt$(c.cash)}`,`cash on ${fmtDate(c.end)}${c.debts?` · debts ${fmt$(c.debts)}`:''}`],
  ])}
  ${c.selfShare>20?`<div class="note" style="margin-bottom:12px"><b>Mostly self-funded so far.</b> ${fmtFull(c.self)} (${c.selfShare}%) of ${esc(s.short)}'s campaign funds are the candidate's own loans or contributions${c.debts?`; the committee reports ${fmtFull(c.debts)} in debts`:''}.</div>`:''}
  ${c.itemized==null?'<p class="small muted" style="margin:8px 0 0">The itemized/unitemized split is not available for this committee.</p>':''}`}
  <h2 id="f-pac" style="margin-top:28px">${term('pac','PAC contributions to the campaign')}</h2>
  <p class="small muted" style="margin:4px 0 10px">Part of campaign funds raised. Each row is one contribution, as listed on FEC Schedule A, line 11C.</p>
  ${pacCoverage(s)}
  ${pacSectors(s)}
  ${pacKinds(s)}
  <div id="pachost"></div>
  ${conduitBlock(s)}
  <h2 id="f-out" style="margin-top:28px">Outside spending (${term('ie','independent expenditures')})</h2>
  <p class="small" style="margin:4px 0 0;color:var(--ink-2);max-width:78ch">Spending by ${term('superpac','super PACs')}, other outside groups and party committees that support or oppose a candidate without working with the campaign.</p>
  <div style="margin:0 0 10px">${points([['Covers',`General-election spending only, ${period(o.start,o.end)}.`],['Source',`${esc(IE.source)} <a href="${fecIeUrl(s.fecCand)}" target="_blank" rel="noopener">FEC independent expenditures for ${esc(s.short)} ↗</a>`],o.excludedPre.n&&['Left out, filed late',`${fmtFull(o.excludedPre.amount)} in ${o.excludedPre.n} items dated before 2025. This is 2024-election spending.`],o.dupRemoved.n&&['Left out, filed twice',`${fmtFull(o.dupRemoved.amount)} in ${o.dupRemoved.n} items identical in every field, including the transaction ID. The latest filing is kept.`],o.uncertain&&['Marked',`${o.uncertain} items whose election type is unclear.`]],'small')}</div>
  ${o.incomplete.map(t=>`<div class="note" style="margin-bottom:10px"><b>Incomplete data:</b> ${esc(t)}</div>`).join('')}
  ${o.possibleRepeat?`<div class="note" style="margin-bottom:10px"><b>Possible repeats:</b> ${fmtFull(o.possibleRepeat)} of the totals above is in items that match another filing in every detail except the transaction ID. They may be the same spending reported twice, so the totals may be up to that much too high. They are marked "Possible repeat" in the item list.</div>`:''}
  ${o.pinned?`<p class="small muted" style="margin:0 0 10px"><b>Date capped:</b> ${o.pinned} items were filed ahead with a date of Sept. 30 or later. They are dated Sept. 30 here.</p>`:''}
  ${o.others.length?`<div class="note" style="margin-bottom:10px"><b>Spending on other candidates in this race:</b> listed separately, and not counted for or against ${esc(s.short)}. ${o.others.map(x=>`${esc(candName(x.cand))} (${x.O?fmtFull(x.O)+' opposing':''}${x.O&&x.S?', ':''}${x.S?fmtFull(x.S)+' supporting':''})`).join('; ')}.</div>`:''}
  ${o.multi&&o.rivals.length?`<div class="note" style="margin-bottom:10px"><b>Aimed at ${esc(s.short)}'s rivals (not credited to ${esc(s.short)}):</b> ${o.rivals.map(x=>`${esc(candName(x.cand))}: ${fmtFull(x.S)} supporting, ${fmtFull(x.O)} opposing`).join('; ')}.</div>`:''}
  <p class="small" style="margin:0 0 8px"><a href="#${s.id}-funders">How these groups' own published positions compare with ${esc(s.short)}'s votes →</a></p>
  ${outsideSectorBlock(s)}
  <h3 style="margin:14px 0 8px">By committee</h3>
  ${ieCommitteeTable(s)}
  <h3 id="f-items" style="margin:22px 0 8px">Every item</h3>
  <p class="small muted" style="margin:0 0 8px">Each outside-spending item as filed, with the date it went out and its FEC filing.</p>
  <div id="iehost"></div>
  <div id="f-comb" style="margin-top:22px">${combinedBlock(s)}</div>
  <section id="live-records" style="margin-top:28px"></section>`;
  mountPacSectors(s);pacTable(s,$('#pachost'));
  ieItems(s,$('#iehost'));
  mountAnalysis(s);hoverTips(pane);
  window.RecordLive.profile(s,$('#live-records'),['campaign','campaign-history','donor-sizes','pac','outside','donorOrgs','outside-groups']);fillSizes(pane);
  pane.querySelectorAll('.jump a').forEach(a=>a.addEventListener('click',e=>{e.preventDefault();const t=document.getElementById(a.getAttribute('href').slice(1));if(t)t.scrollIntoView({behavior:'smooth',block:'start'});}));
  bindTips(pane);
}

// Someone in office who is not on the 2026 ballot: no 2026 campaign or outside money, so the analysis and the refreshed
// FEC, lobbying and contract records for the committee that still files.
function paneFinanceOffice(s,pane){
  pane.innerHTML=`
  <h2>Money &amp; Influence</h2>
  <p class="intro">${esc(s.short)} is not on the 2026 ballot.</p>${points([['Not shown','2025–26 campaign totals and outside spending. There is no race to compare.'],['Still filing',`${esc(s.cmteName||'The 2024 committee')} (${esc(s.fecCmte)}) still files with the FEC. Its totals, PAC contributions and donors by employer are under Latest official records, from the daily refresh.`]])}
  <p class="small" style="margin:0 0 6px"><a href="${fecCandUrl(s.fecCand)}" target="_blank" rel="noopener">FEC candidate page ↗</a> · <a href="${fecCmteUrl(s.fecCmte)}" target="_blank" rel="noopener">FEC committee page ↗</a></p>
  ${analysisBlock(s)}
  <section id="live-records" style="margin-top:28px"></section>`;
  mountAnalysis(s);hoverTips(pane);
  window.RecordLive.profile(s,$('#live-records'),['campaign','campaign-history','donor-sizes','pac','outside','donorOrgs','outside-groups']);
  bindTips(pane);
}

// ---------- records (stage 5): congressional, state legislative and other records kept in separate, labeled sections ----------
const realVotes=(s,V)=>V.filter(v=>s.id in v.pos&&!/not in office/i.test(v.pos[s.id]));
function evidenceOf(s){
  const sv=realVotes(s,DATA.votes).length, hv=realVotes(s,DATA.hvotes).length, st=s.stateRecord?s.stateRecord.items.length:0;
  let kind,label;
  if(!s.cand||s.recordType==='senator'||s.ideoKind==='house'){
    const ch=(!s.cand&&s.chamber==='H')||s.ideoKind==='house'?'House':'Senate', n=ch==='House'?hv:sv;
    kind='us';label=`U.S. ${ch} votes (${n} key roll calls) and a career ideology score`;
  } else if(s.recordType==='former_member_of_congress'){kind='former';label=`Former member of Congress: ${s.record.length} documented votes or bills${sv?`, plus ${sv} key Senate roll calls`:''}`;}
  else if(s.recordType==='state_legislator'){kind='state';label=`State legislature: ${s.record.length} documented votes or bills`;}
  else if(s.recordType==='executive'){kind='exec';label=`Executive office: ${s.record.length} official actions (no legislative votes in that office)`;}
  else {kind='none';label=`No voting record: ${s.record.length} documented public actions`;}
  if(st&&s.recordType!=='state_legislator')label+=`; earlier state legislative service: ${st} documented item${st===1?'':'s'}`;
  else if(s.stateRecord&&!st&&s.recordType!=='state_legislator')label+='; earlier state legislative service (no votes could be sourced)';
  return {kind,label};
}
function evidenceNote(list){
  const k=[...new Set(list.map(s=>evidenceOf(s).kind))];
  if(k.length<2)return '';
  const N={us:'U.S. congressional votes',former:'a past congressional record',state:'state legislative votes',exec:'official actions in executive office',none:'documented public actions without a voting record'};
  return `Different kinds of evidence. ${list.map(s=>`${esc(s.short)}'s record is ${N[evidenceOf(s).kind]}`).join('; ')}. These records can't be compared directly, and fewer items doesn't mean a better or worse record.`;
}
function senateVoteList(s){
  const V=DATA.votes.filter(v=>s.id in v.pos);
  const n=realVotes(s,DATA.votes).length;
  if(!n)return '';
  return `<h3 style="margin-top:26px">Key U.S. Senate votes</h3><p class="small muted" style="margin:4px 0 8px">The same ${V.length} roll calls shown for the other senators, each linked to the official tally. ${esc(s.short)} cast ${n} of them${V.length>n?`; "Not in office" marks votes cast when ${esc(s.short)} was not a senator`:''}.</p>
  <div>${V.slice().sort((x,y)=>y.date.localeCompare(x.date)).map(v=>{const p=v.pos[s.id]||'—';return `<div class="vote"><div class="d">${v.date}</div><div><div class="t"><a href="${voteUrl(v)}" target="_blank" rel="noopener">${esc(v.short)}</a></div><div class="s">${esc(v.issue)} · ${esc(v.result)}</div><div class="s muted">${esc(v.area)}</div></div><div class="pos"><span class="chip ${posClass(p)}">${esc(p)}</span></div></div>`}).join('')}</div>`;
}
function stateRecordBlock(s){
  const r=s.stateRecord;
  if(!r){
    if(s.recordType==='state_legislator')return '';
    return '';
  }
  const kindN={vote:'Recorded vote',authored:'Bill authored',sponsored:'Bill sponsored',cosponsored:'Co-sponsored',leadership:'Leadership post'};
  return `<section class="recsec state">
    <div class="kicker">State legislative record · not a congressional record</div>
    <h3 style="margin-top:4px">State legislative record</h3>
    <ul class="list small" style="margin:6px 0 10px">${r.service.map(x=>`<li><b>${esc(x.chamber)}</b>${x.district?`, District ${esc(x.district)}`:''}, ${esc(x.start)}–${esc(x.end)}${x.roles?` (${esc(x.roles)})`:''} ${x.src?`<a href="${esc(x.src.u)}" target="_blank" rel="noopener">source ↗</a>`:''}</li>`).join('')}</ul>
    ${r.stateIdeology?`<p class="small" style="margin:0 0 10px"><b>Published ranking:</b> ${esc(r.stateIdeology.text)} <a href="${esc(r.stateIdeology.src.u)}" target="_blank" rel="noopener">${esc(r.stateIdeology.src.t)} ↗</a> <span class="muted">(state-legislature ranking; not comparable with congressional scores)</span></p>`:''}
    ${r.items.length?r.items.map(it=>`<div class="vote"><div class="d">${esc(it.date||'')}</div><div><div class="t">${esc(it.title)}</div><div class="s">${esc(it.summary||'')}</div>${it.result?`<div class="s"><b>Result:</b> ${esc(it.result)}</div>`:''}<div class="s muted">${esc(kindN[it.kind]||it.kind)}${it.session?' · '+esc(it.session):''} · ${esc(it.area||'')}${it.areaWhy?` <span class="term" tabindex="0" data-tip="Why this policy area: ${esc(it.areaWhy)}">why this area?</span>`:''}${it.src?` · <a href="${esc(it.src.u)}" target="_blank" rel="noopener">${esc(it.src.t)} ↗</a>`:''}</div></div><div class="pos"><span class="chip ${posClass(it.position)}">${esc(it.position||'')}</span></div></div>`).join(''):`<div class="note">No recorded votes or bills from this service could be sourced for this release.</div>`}
    ${r.searched?`<p class="small muted" style="margin-top:8px"><b>What was searched:</b> ${esc(r.searched)}</p>`:''}
  </section>`;
}
function recordHeading(s){
  return {state_legislator:'State legislative record',executive:'Record in executive office',member_of_congress:'Bills sponsored in Congress',senator:'Bills sponsored in the Senate',former_member_of_congress:'Record in Congress',none:'Other documented record (no voting record)'}[s.recordType]||'Documented record';
}
function recordKicker(s){
  return {state_legislator:'State legislative record · not a congressional record',executive:'Executive or appointed office · not a voting record',member_of_congress:'Congressional record',senator:'Congressional record',former_member_of_congress:'Congressional record (past service)',none:'Documented actions and commitments · no voting record'}[s.recordType]||'';
}
// ---------- voter alignment (stage 7): a comparison with the viewer's own choices, never a quality rating ----------
const ISS=DATA.issues, ISSBY=Object.fromEntries(ISS.map(i=>[i.id,i]));
const RECT=ACTION_TYPES;
const TYPEL=DATA.typeLabel;
const WLAB={1:'Low',2:'Medium',3:'High'};
const ALKEY='crc-align-v1';
let PROF=(()=>{try{const v=JSON.parse(localStorage.getItem(ALKEY)||'null');if(v&&v.issues)return v}catch(e){}return {issues:{}}})();
function saveProf(){try{localStorage.setItem(ALKEY,JSON.stringify(PROF))}catch(e){}}
const chosenIssues=()=>ISS.filter(i=>PROF.issues[i.id]&&PROF.issues[i.id].side&&PROF.issues[i.id].w>0);
// Example starting points: labeled by their content only. Every choice can be changed.
const EXAMPLES=[
  {name:'Health coverage, abortion access, climate',set:{health:['A',3],abortion:['A',3],climate:['A',2],labor:['A',1],tariffs:['B',1]}},
  {name:'Lower taxes, immigration enforcement, gun rights',set:{taxes:['B',3],immigration:['A',3],guns:['B',2],voting:['A',2],vouchers:['A',1]}},
  {name:'Ukraine aid, war-powers limits, ending Canada tariffs',set:{ukraine:['A',3],warpowers:['A',2],tariffs:['B',2],jan6:['A',1],infra:['A',1]}},
];
function scoreFor(s){
  const ch=chosenIssues();
  const r=matchScore(ch.map(i=>({id:i.id,side:PROF.issues[i.id].side,w:PROF.issues[i.id].w})),s.evidence);
  r.rows.forEach((x,k)=>{x.i=ch[k];x.pr=PROF.issues[ch[k].id];});
  return r;
}
function scoreBadge(r){
  if(!r.nChosen)return '<span class="muted">Set your priorities</span>';
  if(r.score==null)return `<span class="chip ghost" data-tip="Evidence covers ${r.nCov} of your ${r.nChosen} issues (${Math.round(r.covW/r.totW*100)||0}% of your weight). A score needs at least ${r.need} issues and half your weight.">Insufficient data</span>`;
  return `<span class="alscore"><b>${r.score}%</b> match</span>`;
}
function evidenceMix(s){
  const c={};Object.values(s.evidence||{}).flat().forEach(e=>{const k=RECT.has(e.type)?(e.type==='senate_vote'||e.type==='house_vote'||e.type==='vote'?'votes':e.type==='state_vote'?'state votes':e.type==='sponsored'?'bills sponsored':e.type==='cosponsored'?'bills cosponsored':'official actions'):'statements';c[k]=(c[k]||0)+1});
  return Object.entries(c).map(([k,n])=>`${n} ${k}`).join(', ')||'no coded evidence';
}
function sideLabel(i,side){return side==='A'?ISSBY[i].A:ISSBY[i].B}
function builderHTML(){
  return `<div class="albuild">
    <div class="row" style="margin-bottom:10px"><span class="small muted">Start from an example (you can change every choice):</span>${EXAMPLES.map((x,k)=>`<button class="pill" data-ex="${k}">${esc(x.name)}</button>`).join('')}<button class="pill ghostb" data-ex="clear">Clear all</button></div>
    ${ISS.map(i=>{const pr=PROF.issues[i.id]||{};return `<div class="alrow" data-i="${i.id}">
      <div class="alq"><b>${esc(i.label)}</b><small>${esc(i.q)}</small></div>
      <div class="seg alside" role="group" aria-label="${esc(i.label)}: your position"><button data-s="A" class="${pr.side==='A'?'active':''}">${esc(i.A)}</button><button data-s="B" class="${pr.side==='B'?'active':''}">${esc(i.B)}</button><button data-s="" class="${!pr.side?'active':''}">Skip</button></div>
      <label class="alw small">Importance <select data-w aria-label="${esc(i.label)}: importance">${[1,2,3].map(w=>`<option value="${w}" ${(pr.w||2)===w?'selected':''}>${WLAB[w]}</option>`).join('')}</select></label>
    </div>`}).join('')}
  </div>`;
}
function bindBuilder(root,onChange){
  root.querySelectorAll('.alrow').forEach(r=>{
    const id=r.dataset.i;
    r.querySelector('.alside').addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;const w=+r.querySelector('select').value;if(b.dataset.s)PROF.issues[id]={side:b.dataset.s,w};else delete PROF.issues[id];r.querySelectorAll('.alside button').forEach(x=>x.classList.toggle('active',x===b));saveProf();onChange();});
    r.querySelector('select').addEventListener('change',e=>{if(PROF.issues[id]){PROF.issues[id].w=+e.target.value;saveProf();onChange();}});
  });
  root.querySelectorAll('[data-ex]').forEach(b=>b.addEventListener('click',()=>{const k=b.dataset.ex;PROF={issues:{}};if(k!=='clear')Object.entries(EXAMPLES[+k].set).forEach(([i,[s,w]])=>PROF.issues[i]={side:s,w});saveProf();onChange(true);}));
}
const ALNOTE=`<div class="note small" style="margin:10px 0">${points([['What this is','A comparison between the positions <i>you</i> pick and each candidate\'s documented record.'],['What it is not','A rating of how good a candidate is. It covers only issues with documented evidence.'],['Evidence used','Recorded votes, bills and official acts come first. Stated positions are used only for an issue with no recorded action, and they are labeled.'],['When a score shows','Evidence must cover at least three of your issues and half of your total importance. Otherwise you see "Insufficient data", never a zero.']])}<p style="margin:6px 0 0"><a href="#method">How it is calculated</a></p></div>`;
// ---------- My alignment: a five-point quiz over the issue list. Each answer is saved as a side and an importance:
// strongly agree/disagree = importance 3, agree/disagree = 2, neutral = answered but not counted. ----------
const AL_GROUPS=[['econ','Economy & health','$'],['rights','Rights & social','♥'],['imm','Immigration & elections','⛨'],['foreign','Foreign policy','◍'],['env','Environment','❦'],['gov','Ethics & money in politics','⚖']];
const AL_GBY=Object.fromEntries(AL_GROUPS.map(g=>[g[0],g]));
// mixed order for "All questions": one from each category in turn
const AL_ORDER=(()=>{const by=AL_GROUPS.map(([g])=>ISS.filter(i=>i.group===g)),out=[];for(let k=0;out.length<ISS.length&&k<ISS.length;k++)by.forEach(l=>{if(l[k])out.push(l[k])});ISS.forEach(i=>{if(!out.includes(i))out.push(i)});return out})();
const AL_OPTS=[['B',3,'Strongly disagree'],['B',2,'Disagree'],['',0,'Neutral'],['A',2,'Agree'],['A',3,'Strongly agree']];
const AL_PAGE=5;
let alView={g:'',page:0};
const alPick=id=>{const p=PROF.issues[id];if(!p)return -1;if(p.neutral)return 2;if(p.side==='B')return p.w>=3?0:1;if(p.side==='A')return p.w>=3?4:3;return -1};
const alAnswered=()=>ISS.filter(i=>alPick(i.id)>=0).length;
const AL_VOTES=Object.fromEntries(ISS.map(i=>[i.id,DATA.votes.map(v=>['Senate',v]).concat(DATA.hvotes.map(v=>['House',v])).filter(([,v])=>(v.codes||[]).some(c=>c.issue===i.id)).sort((a,b)=>b[1].date.localeCompare(a[1].date))]));
function alTied(i){
  const V=AL_VOTES[i.id];
  if(!V.length)return 'No key congressional vote on this yet; compared with state records, official actions and statements where they exist.';
  return 'Compared with: '+V.slice(0,2).map(([c,v])=>`${esc(v.short)} (${c}, ${v.date.slice(0,4)})`).join(' · ')+(V.length>2?` · ${V.length-2} more`:'');
}
function alCard(i){
  const [g,label,icon]=AL_GBY[i.group]||['econ','Other','•'], n=AL_ORDER.indexOf(i)+1, k=alPick(i.id);
  return `<article class="al-q" data-i="${i.id}"><div class="al-qh"><span class="al-ic al-${g}" aria-hidden="true">${icon}</span><span class="al-tag al-${g}">${label}</span><span class="al-qn">Question ${n} of ${ISS.length}</span></div>
    <h3 id="alq-${i.id}">${esc(i.statement||i.A)}</h3><p class="al-tied">${alTied(i)}</p>
    <div class="al-opts" role="radiogroup" aria-labelledby="alq-${i.id}">${AL_OPTS.map((o,j)=>`<button type="button" role="radio" aria-checked="${k===j}" data-k="${j}" class="${k===j?'on':''}"><span class="al-r" aria-hidden="true"></span>${o[2]}</button>`).join('')}</div></article>`;
}
function alList(){return alView.g?AL_ORDER.filter(i=>i.group===alView.g):AL_ORDER.slice(alView.page*AL_PAGE,alView.page*AL_PAGE+AL_PAGE);}
// "Your matches so far": the closest records to your answers, or flipped to the furthest ("mismatches").
let alLiveMode='match', alLiveCh='';
function alLive(){
  const mis=alLiveMode==='mismatch', chName={S:'Senate',H:'House'}[alLiveCh]||'', title=`Your ${chName?chName+' ':''}${mis?'mismatches':'matches'} so far`;
  const sw=`<div class="seg al-seg" role="group" aria-label="Show matches or mismatches"><button type="button" data-m="match" class="${mis?'':'active'}" aria-pressed="${!mis}">Top matches</button><button type="button" data-m="mismatch" class="${mis?'active':''}" aria-pressed="${mis}">Top mismatches</button></div>`;
  const sw2=`<div class="seg al-seg" role="group" aria-label="Which races">${[['','All'],['S','Senate'],['H','House']].map(([c,l])=>`<button type="button" data-c="${c}" class="${alLiveCh===c?'active':''}" aria-pressed="${alLiveCh===c}">${l}</button>`).join('')}</div>`;
  const counted=chosenIssues().length;
  if(!counted)return `<h4>${title}</h4>${sw}${sw2}<p class="small muted" style="margin:0">Answer a few questions${alAnswered()?' (Neutral answers are not counted)':''} to see how every candidate compares.</p>`;
  const rows=ALL.filter(s=>!alLiveCh||s.chamber===alLiveCh).map(s=>({s,r:scoreFor(s)})), graded=rows.filter(x=>x.r.score!=null);
  // matches are records at 50% or more of your answers, mismatches below 50%, so neither list borrows from the other
  const pool=graded.filter(x=>mis?x.r.score<50:x.r.score>=50).sort((a,b)=>(mis?a.r.score-b.r.score:b.r.score-a.r.score)||a.s.name.localeCompare(b.s.name));
  const list=pool.slice(0,6).map(({s,r})=>{const L=letter(r.score);return `<a class="al-lr" href="#${s.id}-match"><span class="chip ${s.party}">${s.party}</span><span class="al-ln">${esc(s.name)}<small>${esc(seatLabel(s))} ${s.chamber==='S'?'Senate':'House'}</small></span><b class="gr-${L}">${L}</b><span class="al-lp">${r.score}%</span></a>`}).join('');
  const where=chName?` in ${chName} races`:'';
  const empty=!graded.length?`No one${where} has enough evidence on your issues yet.`:mis?`No one${where} is below 50% on your answers yet.`:`No one${where} reaches 50% on your answers yet.`;
  return `<h4>${title}</h4>${sw}${sw2}${list||`<p class="small muted" style="margin:0">${empty}</p>`}
    <p class="al-foot">${pool.length?`${mis?'Lowest':'Top'} ${Math.min(6,pool.length)} of ${pool.length} ${mis?'below 50%, furthest from your answers first':'at 50% or more'} · `:''}${graded.length} graded${where}, ${rows.length-graded.length} not graded yet.${chName?` ${chName} races include challengers${DATA.races.some(r=>r.chamber===alLiveCh&&r.open)?' and nominees for open seats':''}.`:''} Based on your ${counted} answer${counted===1?'':'s'} that ${counted===1?"isn't":"aren't"} Neutral. A grade needs evidence on 3 of your issues. <button type="button" class="al-link" id="al-all">See every candidate ↓</button></p>`;
}
function alResults(){
  const ch=chosenIssues();
  if(!ch.length)return '<div class="note">Answer at least one question (other than Neutral) to see how every candidate compares, race by race.</div>';
  return `<p class="small muted" style="margin:0 0 6px">Results for ${ch.length} issue${ch.length===1?'':'s'}. Open a candidate for the issue-by-issue breakdown and every piece of evidence.</p>`+DATA.races.map(r=>{const C=r.keys.map(k=>byId[k]);return `<article class="race"><div class="rh"><h3>${esc(r.label)}</h3><span class="small muted">${r.open?'Open seat':'Incumbent running'}</span></div>
    <div class="tablewrap"><table><thead><tr><th>Candidate</th><th>Compared with your choices</th><th>Evidence used</th></tr></thead><tbody>${C.map(s=>{const sc=scoreFor(s);return `<tr><td><a href="#${s.id}-match"><b>${esc(s.name)}</b></a> <span class="chip ${s.party}">${s.party}</span></td><td>${sc.score==null?scoreBadge(sc):`<span class="alscore"><b class="gr-${letter(sc.score)}">${letter(sc.score)}</b> <b>${sc.score}%</b> match</span>`}<div class="small muted">${sc.nCov} of ${sc.nChosen} of your issues have evidence</div></td><td class="small">${esc(evidenceOf(s).label)}<div class="muted">${esc(evidenceMix(s))}</div></td></tr>`}).join('')}</tbody></table></div>
    ${evidenceNote(C)?`<p class="small" style="margin:6px 0 0;color:var(--ink-2)"><b>Comparing records:</b> ${evidenceNote(C)}</p>`:''}</article>`}).join('');
}
function renderAlign(){
  const pages=Math.ceil(ISS.length/AL_PAGE);
  app.innerHTML=`
  <section class="al-hero">
    <svg class="al-dome" width="300" height="172" viewBox="0 0 330 190" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M165 10v22M158 32h14M150 60c0-14 7-26 15-28 8 2 15 14 15 28"/><path d="M118 96c0-24 21-40 47-40s47 16 47 40"/><path d="M108 96h114v10H108zM112 106v34M124 106v34M136 106v34M148 106v34M160 106v34M172 106v34M184 106v34M196 106v34M208 106v34M218 106v34"/><path d="M30 140h270v10H30zM40 150v30M290 150v30M30 180h270"/><path d="M60 150v30M80 150v30M100 150v30M230 150v30M250 150v30M270 150v30"/><path d="M95 140V122h140v18"/></svg>
    <h1>My <em>alignment</em></h1>
    <p class="al-lede">Say how strongly you agree or disagree with each statement. There are no right or wrong answers. Your answers are compared with every candidate's real votes, bills and statements, issue by issue.</p>
    <div class="al-feats">
      <div><span class="al-fi" aria-hidden="true">▤</span><div><b>${ISS.length} issues, tied to real votes</b><small>Each question lists the roll calls behind it</small></div></div>
      <div><span class="al-fi" aria-hidden="true">🔒</span><div><b>Your answers stay with you</b><small>Saved only in this browser</small></div></div>
      <div><span class="al-fi" aria-hidden="true">⚖</span><div><b>Not a rating of candidates</b><small>Same questions and rules for everyone</small></div></div>
    </div>
  </section>
  <div class="al-wrap">
    <nav class="al-cats" id="al-cats" aria-label="Question categories"></nav>
    <div class="al-main">
      <div class="al-top"><b id="al-pos"></b><span id="al-pct"></span></div>
      <div class="al-prog" aria-hidden="true"><i id="al-bar"></i></div>
      <div id="al-qs"></div>
      <div class="al-nav"><button type="button" class="al-btn" id="al-prev">← Previous</button><span class="small muted">Answer as many as you like; results update as you go</span><button type="button" class="al-btn p" id="al-next">Next →</button></div>
      <div class="al-ex"><span class="small muted">Or start from an example (you can change every answer):</span>${EXAMPLES.map((x,k)=>`<button class="pill" data-ex="${k}">${esc(x.name)}</button>`).join('')}<button class="pill ghostb" data-ex="clear">Clear all</button></div>
    </div>
    <aside class="al-box al-live" id="al-live" aria-live="polite"></aside>
    <aside class="al-box al-keep"><h4>💡 Keep in mind</h4>${points([['Strongly','Counts three times as much as a plain agree or disagree.'],['Neutral','Skips the issue. It never counts against anyone.'],['A match','Compares a record with your views. It is not a rating of the candidate.']])}</aside>
  </div>
  <section class="section" id="al-results" style="padding-top:8px"><h2>Every candidate, race by race</h2>${ALNOTE}<div id="alr"></div></section>`;
  const drawCats=()=>{$('#al-cats').innerHTML=[['','All questions','☰',ISS.length]].concat(AL_GROUPS.map(([g,l,ic])=>[g,l,ic,ISS.filter(i=>i.group===g).length])).map(([g,l,ic,n])=>{const done=(g?ISS.filter(i=>i.group===g):ISS).filter(i=>alPick(i.id)>=0).length;return `<button type="button" class="al-cat${alView.g===g?' on':''}" data-g="${g}" aria-pressed="${alView.g===g}"><span class="al-ic${g?' al-'+g:''}" aria-hidden="true">${ic}</span><span class="al-cl">${l}</span><span class="al-cn" title="${done} of ${n} answered">${n}</span></button>`}).join('');};
  const drawTop=()=>{const L=alList(),a=alAnswered();
    $('#al-pos').textContent=alView.g?`${AL_GBY[alView.g][1]} · ${L.length} question${L.length===1?'':'s'}`:`Questions ${alView.page*AL_PAGE+1}–${alView.page*AL_PAGE+L.length} of ${ISS.length}`;
    $('#al-pct').textContent=`${a} of ${ISS.length} answered · ${Math.round(a/ISS.length*100)}% complete`;
    $('#al-bar').style.width=(a/ISS.length*100)+'%';
    const gi=AL_GROUPS.findIndex(g=>g[0]===alView.g);
    $('#al-prev').disabled=alView.g?false:alView.page===0;
    $('#al-next').textContent=alView.g?(gi<AL_GROUPS.length-1?`Next: ${AL_GROUPS[gi+1][1]} →`:'See my results ↓'):(alView.page<pages-1?'Next →':'See my results ↓');};
  const drawQs=()=>{$('#al-qs').innerHTML=alList().map(alCard).join('');};
  const drawBox=focus=>{$('#al-live').innerHTML=alLive();const b=$('#al-all');if(b)b.addEventListener('click',()=>$('#al-results').scrollIntoView({behavior:'smooth'}));if(focus){const f=$(`#al-live ${focus}`);if(f)f.focus();}};
  const drawLive=()=>{drawBox();$('#alr').innerHTML=alResults();bindTips(app);};
  $('#al-live').addEventListener('click',e=>{const m=e.target.closest('button[data-m]'),c=e.target.closest('button[data-c]');
    if(m&&m.dataset.m!==alLiveMode){alLiveMode=m.dataset.m;drawBox(`[data-m="${alLiveMode}"]`);}
    else if(c&&c.dataset.c!==alLiveCh){alLiveCh=c.dataset.c;drawBox(`[data-c="${alLiveCh}"]`);}});
  const all=()=>{drawCats();drawTop();drawQs();drawLive();};
  $('#al-qs').addEventListener('click',e=>{
    const b=e.target.closest('button[data-k]');if(!b)return;
    const id=b.closest('.al-q').dataset.i, k=+b.dataset.k, was=alPick(id);
    if(was===k)delete PROF.issues[id];
    else{const [side,w]=AL_OPTS[k];PROF.issues[id]=side?{side,w}:{side:'',w:0,neutral:true};}
    saveProf();
    b.closest('.al-opts').querySelectorAll('button').forEach(x=>{const on=+x.dataset.k===alPick(id);x.classList.toggle('on',on);x.setAttribute('aria-checked',on);});
    drawCats();drawTop();drawLive();
  });
  $('#al-cats').addEventListener('click',e=>{const b=e.target.closest('button[data-g]');if(!b)return;alView={g:b.dataset.g,page:0};all();});
  const go=d=>{
    if(alView.g){const gi=AL_GROUPS.findIndex(g=>g[0]===alView.g)+d;if(gi<0){alView={g:'',page:0};}else if(gi>=AL_GROUPS.length){$('#al-results').scrollIntoView({behavior:'smooth'});return}else alView.g=AL_GROUPS[gi][0];}
    else{const p=alView.page+d;if(p>=pages){$('#al-results').scrollIntoView({behavior:'smooth'});return}alView.page=Math.max(0,p);}
    all();$('.al-main').scrollIntoView({behavior:'smooth',block:'start'});
  };
  $('#al-prev').addEventListener('click',()=>go(-1));
  $('#al-next').addEventListener('click',()=>go(1));
  app.querySelectorAll('[data-ex]').forEach(b=>b.addEventListener('click',()=>{const k=b.dataset.ex;PROF={issues:{}};if(k!=='clear')Object.entries(EXAMPLES[+k].set).forEach(([i,[s,w]])=>PROF.issues[i]={side:s,w});saveProf();all();}));
  all();
}
function evRow(e,want){
  const m=want?(e.side===want):null;
  return `<li class="evi"><span class="mk ${m===null?'':m?'yes':'no'}" aria-label="${m===null?'':m?'matches your choice':'differs from your choice'}">${m===null?'·':m?'✓':'✕'}</span>
    <div><div><span class="chip ghost">${esc(TYPEL[e.type]||e.type)}</span> <b>${esc(e.title)}</b> <span class="mono muted">${esc(e.date||'date not given')}</span></div>
    <div class="small">${e.pos?`<b>Position:</b> ${esc(e.pos)} → `:''}counts toward "${esc(sideLabel(e.issue||'',e.side))}"</div>
    <div class="small muted">${e.yea?`<b>What the measure does:</b> ${esc(e.why)} A Yea counts toward "${esc(sideLabel(e.issue,e.yea))}".`:`<b>Why:</b> ${esc(e.why)}`} ${e.src&&e.src.u?`<a href="${esc(e.src.u)}" target="_blank" rel="noopener">${esc(e.src.t||'source')} ↗</a>`:''}</div></div></li>`;
}
// ---------- Your match tab: the comparison with your choices, then the record it is drawn from ----------
function paneMatch(s,pane){
  pane.innerHTML='<div id="m-al"></div><div id="m-rec"></div>';
  recordInto(s,pane.querySelector('#m-rec'));
  alignInto(s,pane.querySelector('#m-al'));
}
function alignInto(s,host){
  const draw=()=>{
    const r=scoreFor(s);
    const ev=s.evidence||{};
    const all=ISS.filter(i=>(ev[i.id]||[]).length);
    const md=!r.nChosen?'You have not chosen any positions yet.':r.score==null?`Evidence on ${r.nCov} of your ${r.nChosen} issues, too few for a grade.`:`Based on ${r.nCov} of your ${r.nChosen} issues.`;
    host.innerHTML=`${gradeHead('Your match',r.score,md,gradeRule('match'))}
    <p class="intro">How ${esc(s.short)}'s record compares with the positions you pick below. <b>Evidence available:</b> ${esc(evidenceOf(s).label)}.</p>
    ${ALNOTE}
    <div class="chart"><div class="kicker">How the match is calculated</div>
      ${r.nChosen?(r.score==null?points([['Evidence found',`${r.nCov} of your ${r.nChosen} issues (${Math.round(r.covW/r.totW*100)||0}% of your total importance).`],['Needed for a score',`At least ${r.need} issue${r.need===1?'':'s'} with evidence, and at least half of your total importance.`]],'small'):points([['How it works',`For each issue, the share of ${esc(s.short)}'s items that match your side, times the issue's importance. An issue backed only by statements counts at half its importance.`],['The math',`${r.rows.filter(x=>x.status!=='none').map(x=>`${esc(x.i.label)} ${x.match}/${x.n} × ${+x.iw.toFixed(2)}${x.status==='stated'?' (statements only)':''}`).join(' + ')} = ${(r.num).toFixed(2)}. Divided by the importance counted, ${+r.effW.toFixed(2)}, that gives <b>${r.score}%</b>.`],['Counted once','A sponsorship and a vote on the same bill.'],r.nChosen>r.nCov&&['Left out',`${r.nChosen-r.nCov} issue${r.nChosen-r.nCov===1?'':'s'} without evidence. They are not scored as zero.`]],'small')):`<p class="small" style="margin:6px 0 0">Choose positions below, or on the <a href="#align">My alignment</a> page.</p>`}
    </div>
    ${r.nChosen?`<h3 style="margin-top:18px">Issue by issue</h3>${r.rows.map(x=>`<div class="alissue">
      <div class="row" style="justify-content:space-between"><div><b>${esc(x.i.label)}</b> <span class="small muted">· you: ${esc(sideLabel(x.i.id,x.pr.side))} · importance ${WLAB[x.pr.w]}</span></div>
      <div>${x.status==='none'?'<span class="chip ghost">Insufficient data</span>':`<span class="chip ${x.agree>=.5?'dfor':'dag'}">${x.match} of ${x.n} ${x.status==='record'?'recorded actions':'statements'} match</span>`}</div></div>
      ${x.status==='stated'?'<p class="small" style="margin:4px 0 0;color:var(--warn)"><b>Statements only:</b> no recorded vote, bill or official action on this issue. It counts at half its importance.</p>':''}
      ${x.status==='record'&&x.st.length?`<p class="small muted" style="margin:4px 0 0"><b>Stated positions:</b> ${x.stMatch} of ${x.st.length} match. Shown but not scored, because recorded actions exist.</p>`:''}
      ${(x.rec.concat(x.st)).length?`<ul class="evl">${x.rec.concat(x.st).map(e=>evRow(Object.assign({issue:x.i.id},e),x.pr.side)).join('')}</ul>`:`<p class="small muted" style="margin:4px 0 0">No vote, bill, official action or statement on this issue was found for ${esc(s.short)}.${(s.notVoted||{})[x.i.id]?' <b>Did not vote on:</b> '+s.notVoted[x.i.id].map(n=>esc(n.title)).join('; ')+'.':''}</p>`}
    </div>`).join('')}`:''}
    <details class="tv" ${r.nChosen?'':'open'}><summary>${r.nChosen?'Change your choices':'Choose your positions'}</summary><div id="alb2" style="margin-top:10px">${builderHTML()}</div></details>
    ${all.length?`<h3 style="margin-top:22px">All coded evidence for ${esc(s.short)}</h3><p class="small muted">Every item used for the match, by issue. Shown whatever you picked.</p>${all.map(i=>`<div class="alissue"><b>${esc(i.label)}</b><ul class="evl">${ev[i.id].map(e=>evRow(Object.assign({issue:i.id},e),null)).join('')}</ul></div>`).join('')}`:`<div class="note" style="margin-top:16px">No action or statement by ${esc(s.short)} fits the issue list, so there is nothing to compare. ${s.recordType==='none'||s.recordType==='executive'?esc(s.short)+' has no legislative voting record.':''}</div>`}`;
    bindBuilder(host.querySelector('#alb2'),rebuild=>{draw();});
    bindTips(host);
  };
  draw();
}

// ---------- legislative record tab (votes with bill details, state record, other record, money & votes, ethics) ----------
function billDetails(v){
  const b=v.bill||{};
  const codes=(v.codes||[]).map(c=>`<li><b>${esc(ISSBY[c.issue].label)}</b>: a Yea counts toward "${esc(sideLabel(c.issue,c.yea))}". ${esc(c.why)}</li>`).join('');
  return `<details class="bd"><summary>Bill details and why it is filed under this issue</summary>
    <dl class="kvd small">
      <dt>Measure</dt><dd>${esc(b.measure||'')}${b.popularTitle?` (${esc(b.popularTitle)})`:''}</dd>
      ${b.officialTitle?`<dt>Official title</dt><dd>${esc(b.officialTitle)}</dd>`:''}
      ${b.introduced?`<dt>Introduced</dt><dd>${fmtDate(b.introduced)}</dd>`:''}
      <dt>What it does</dt><dd>${esc(b.summary||'')} ${b.summarySrc?`<a href="${esc(b.summarySrc.u)}" target="_blank" rel="noopener">${esc(b.summarySrc.t)} ↗</a>`:''}</dd>
      ${(b.provisions||[]).length?`<dt>Key provisions</dt><dd><ul class="list">${b.provisions.map(p=>`<li>${esc(p.fact)} <a href="${esc(p.src.u)}" target="_blank" rel="noopener">source ↗</a></li>`).join('')}</ul></dd>`:''}
      <dt>Recorded vote</dt><dd>${fmtDate(v.date)} · ${esc(b.voteQuestion||v.question)} · ${esc(v.result)} · <a href="${voteUrl(v)}" target="_blank" rel="noopener">official tally ↗</a></dd>
      <dt>Policy area</dt><dd>${esc(v.area)}</dd>
      <dt>Alignment issue</dt><dd>${codes?`<ul class="list">${codes}</ul>`:`Not used for voter alignment: ${esc(v.excluded||'')}`}</dd>
    </dl></details>`;
}
function keyVotesBlock(s,V,label,id){
  if(!V.length)return '';
  const areas=[...new Set(V.map(v=>v.area))].sort();
  const html=`<section class="recsec" id="${id}"><div class="kicker">Congressional record</div><h3 style="margin-top:4px">${esc(label)}</h3>
    <p class="small muted" style="margin:4px 0 8px">${V.length} important roll-call votes picked by this app, newest first. Open "Bill details" to see what the bill does, the result, and why it is filed under its issue.</p>${vtLegend()}
    <div class="filters" data-vf><button class="active" data-a="">All areas</button>${areas.map(a=>`<button data-a="${esc(a)}">${esc(a)}</button>`).join('')}</div><div data-vl></div></section>`;
  return html;
}
// ---------- funders' and spenders' own published positions vs. the candidate's votes ----------
const GP=DATA.groupPos||[], GPBY=Object.fromEntries(GP.map(g=>[g.key,g]));
// ---------- money and votes over time: one group's money to or about a candidate, month by month, on the same axis as its key votes ----------
const MON=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const monLabel=m=>`${MON[+m.slice(5,7)-1]} ${m.slice(0,4)}`;
const nextMon=m=>{let y=+m.slice(0,4),k=+m.slice(5,7)+1;if(k>12){k=1;y++;}return `${y}-${String(k).padStart(2,'0')}`};
// Months from the group: contributions from the FEC bulk file (all years); outside spending naming the candidate from the bulk
// file before 2025 and from the reviewed 2025-26 data (the same rows as the totals above) after.
function fundSeries(s,g){
  const H=window.FUNDHIST;if(!H)return null;
  const grp=(DATA.groupPos.find(x=>x.key===g.key)||{}).fecIds||[], ids=new Set(grp.map(f=>f.id));
  const M=new Map(), add=(m,k,v)=>{const o=M.get(m)||{c:0,f:0,a:0};o[k]+=v;M.set(m,o);};
  const h=(H.people[s.id]||{})[g.key]||{c:[],f:[],a:[]};
  for(const k of ['c','f','a'])h[k].forEach(([m,v])=>add(m,k,v));
  (IE.rows[s.race]||[]).forEach(r=>{if(r[0]<H.ieBefore||r[2]!==s.fecCand||!ids.has(cmOf(r[1])[0]))return;add(r[0].slice(0,7),r[3]==='S'?'f':'a',r[4]);});
  const votes=g.compared.map((c,i)=>({c,i})).sort((a,b)=>a.c.date.localeCompare(b.c.date)).map((x,k)=>Object.assign({n:k+1},x));
  let end=DATA.ie_asof.slice(0,7);
  votes.forEach(v=>{if(v.c.date.slice(0,7)>end)end=v.c.date.slice(0,7)});
  const months=[];for(let m=H.start.slice(0,7);m<=end;m=nextMon(m))months.push(m);
  const tot={c:0,f:0,a:0};M.forEach(o=>{tot.c+=o.c;tot.f+=o.f;tot.a+=o.a;});
  // A group added after the file was last built has no months yet (older files don't list their groups).
  const built=H.groups?H.groups.includes(g.key):Object.values(H.people).some(p=>p[g.key]);
  return {M,months,votes,tot,committees:grp.map(f=>f.name),H,built};
}
const voteNum=(g,i)=>1+g.compared.map((c,k)=>[c.date,k]).sort((a,b)=>a[0].localeCompare(b[0])||a[1]-b[1]).findIndex(x=>x[1]===i);
function fundTimeline(s,g,id){
  const d=fundSeries(s,g);if(!d)return '';
  if(!d.built)return `<div class="ftl-wrap"><div class="kicker" style="margin-top:14px">Money and votes over time</div><p class="small muted" style="margin:4px 0 0">The month-by-month figures for ${esc(g.org)} aren't built yet. They are added the next time the funder timelines are rebuilt from the FEC's bulk files.</p></div>`;
  const {tot,M,votes,H}=d, none=!(tot.c||tot.f||tot.a);
  const rows=d.months.filter(m=>M.has(m)||votes.some(v=>v.c.date.slice(0,7)===m));
  const vt=v=>`#${v.n} ${esc(v.c.short)}: ${v.c.match===null?'did not vote':v.c.match?'✓ same as the group':'✕ opposite of the group'}`;
  return `<div class="ftl-wrap"><div class="kicker" style="margin-top:14px">Money and votes over time</div>
    <p class="small" style="margin:4px 0 6px">${none?(g.for||g.against?`None of ${esc(g.org)}'s outside spending above names ${esc(s.short)} in a general-election FEC item (it was about an opponent, or in a primary), so only the votes are shown.`:`No money from ${esc(g.org)} to or about ${esc(s.short)} appears in the FEC data for ${fmtDate(H.start)} – ${fmtDate(DATA.ie_asof)}; only the votes are shown.`):`<b>${fmtDate(H.start)} – ${fmtDate(DATA.ie_asof)}:</b> contributions to the campaign <b class="num">${fmtFull(tot.c)}</b> · outside spending for ${esc(s.short)} <b class="num">${fmtFull(tot.f)}</b> · against ${esc(s.short)} <b class="num">${fmtFull(tot.a)}</b>.`}</p>
    <div class="legend" style="margin:0 0 6px"><span><i style="background:var(--s1)"></i>Contributions to ${esc(s.short)}'s campaign</span><span><i style="background:var(--s3)"></i>Outside spending for ${esc(s.short)}</span><span><i style="background:var(--s2)"></i>Outside spending against ${esc(s.short)} (below the line)</span><span><i class="ftl-key same"></i>Voted the way ${esc(g.org)} wanted</span><span><i class="ftl-key opp"></i>Voted the opposite way</span></div>
    <div class="ftl" id="${id}" data-person="${esc(s.id)}" data-group="${esc(g.key)}"></div>
    ${points([['Each bar','One month.'],['Above the line',`Money for ${esc(s.short)}: checks to the campaign from the group's PACs, and outside ads or mail supporting ${esc(s.short)}.`],['Below the line',`Outside spending against ${esc(s.short)}. This is money spent to defeat ${esc(s.short)}, not money ${esc(s.short)} received.`],['Numbered circles','The votes in the table above, on their dates.'],['Committees counted',esc(d.committees.join(', '))],['Sources',`FEC bulk data for contributions (through ${fmtDate(H.contribThrough)}) and for outside spending before 2025. From 2025 on, outside spending is the same data as the totals above.`],['Not shown',`Primary spending. Only general-election items that name ${esc(s.short)} count here, so this can be lower than the totals above, which also count spending on opponents.`],['Correlation, not cause','Money arriving near a vote does not show that it changed the vote.']],'small')}
    <details class="tv"><summary>Show as a table</summary><div class="tablewrap"><table><thead><tr><th>Month</th><th class="r">Contributions</th><th class="r">Outside for</th><th class="r">Outside against</th><th>Votes that month</th></tr></thead><tbody>${rows.map(m=>{const o=M.get(m)||{c:0,f:0,a:0};return `<tr><td class="mono" style="white-space:nowrap">${monLabel(m)}</td><td class="r">${o.c?fmtFull(o.c):'—'}</td><td class="r">${o.f?fmtFull(o.f):'—'}</td><td class="r">${o.a?fmtFull(o.a):'—'}</td><td class="small">${votes.filter(v=>v.c.date.slice(0,7)===m).map(vt).join('<br>')}</td></tr>`}).join('')||'<tr><td colspan="5" class="muted">No months with money or votes.</td></tr>'}</tbody></table></div></details></div>`;
}
function drawFundTL(el){
  if(!el)return;
  const s=byId[el.dataset.person], g=(s.funderPos||[]).find(x=>x.key===el.dataset.group), d=s&&g&&fundSeries(s,g);if(!d||!d.built)return;
  const {M,months,votes}=d, n=months.length;
  const W=Math.max(300,el.clientWidth), small=W<560, mL=small?42:54, mR=8, top=20;
  const mw=(W-mL-mR)/n, X=i=>mL+i*mw;
  const xDate=iso=>{const i=months.indexOf(iso.slice(0,7));const dim=new Date(+iso.slice(0,4),+iso.slice(5,7),0).getDate();return X(Math.max(0,i)+(+iso.slice(8,10)-.5)/dim)};
  let up=0,down=0;M.forEach(o=>{up=Math.max(up,o.c+o.f);down=Math.max(down,o.a)});
  const P=small?110:140, total=up+down||1, upH=up||down?P*up/total:P/2, base=top+upH, k=P/total;
  const plotBottom=top+P, axisY=plotBottom+(down?0:2);
  let svg='';
  // election days (first Tuesday after the first Monday in November, even years)
  for(let y=+months[0].slice(0,4);y<=+months[n-1].slice(0,4);y++){if(y%2)continue;const m=`${y}-11`,i=months.indexOf(m);if(i<0)continue;const x=X(i);svg+=`<rect class="ftl-elec" x="${x}" y="${top}" width="${Math.max(2,mw)}" height="${P}"></rect>${small?'':`<text class="ftl-small" x="${x+mw/2}" y="${top-6}" text-anchor="middle">${y} election</text>`}`;}
  // data end shading
  const endI=months.indexOf(DATA.ie_asof.slice(0,7));if(endI>=0&&endI<n-1)svg+=`<rect class="ftl-nodata" x="${X(endI+1)}" y="${top}" width="${X(n)-X(endI+1)}" height="${P}"></rect>`;
  svg+='@@GUIDES@@';
  // bars and hover columns
  const bw=Math.max(1,mw-(mw>4?1:0));
  months.forEach((m,i)=>{
    const o=M.get(m);if(!o)return;
    const x=X(i);
    const hc=o.c*k, hf=o.f*k, ha=o.a*k;
    if(hc>0)svg+=`<rect class="ftl-c" x="${x}" y="${base-Math.max(2,hc)}" width="${bw}" height="${Math.max(2,hc)}"></rect>`;
    if(hf>0)svg+=`<rect class="ftl-f" x="${x}" y="${base-(hc>0?Math.max(2,hc)+1:0)-Math.max(2,hf)}" width="${bw}" height="${Math.max(2,hf)}"></rect>`;
    if(ha>0)svg+=`<rect class="ftl-a" x="${x}" y="${base}" width="${bw}" height="${Math.max(2,ha)}"></rect>`;
    const tip=`${monLabel(m)} · contributions ${fmtFull(o.c)} · outside for ${fmtFull(o.f)} · outside against ${fmtFull(o.a)}`;
    svg+=`<rect class="ftl-hit" x="${x}" y="${top}" width="${Math.max(mw,1)}" height="${P}" data-tip="${esc(tip)}"></rect>`;
  });
  // value scale: the line, and the largest month in each direction
  svg+=`<line class="ftl-base" x1="${mL}" x2="${W-mR}" y1="${base}" y2="${base}"></line>`;
  svg+=`<text class="ftl-y" x="${mL-6}" y="${base+4}" text-anchor="end">$0</text>`;
  if(up)svg+=`<text class="ftl-y" x="${mL-6}" y="${top+9}" text-anchor="end">${fmt$(up)}</text><line class="ftl-grid" x1="${mL}" x2="${W-mR}" y1="${top}" y2="${top}"></line>`;
  if(down)svg+=`<text class="ftl-y" x="${mL-6}" y="${plotBottom}" text-anchor="end">−${fmt$(down)}</text><line class="ftl-grid" x1="${mL}" x2="${W-mR}" y1="${plotBottom}" y2="${plotBottom}"></line>`;
  // years
  const yAx=axisY+14;
  months.forEach((m,i)=>{if(m.endsWith('-01')){const x=X(i);svg+=`<line class="ftl-tick" x1="${x}" x2="${x}" y1="${axisY}" y2="${axisY+4}"></line>`;if(!small||(+m.slice(0,4))%2===0)svg+=`<text class="ftl-small" x="${x}" y="${yAx}" text-anchor="middle">${m.slice(0,4)}</text>`;}});
  // votes: numbered circles on their dates, stacked when they would overlap
  const r=small?8:9, laneTop=yAx+10, rows=[];
  const placed=votes.map(v=>{const x=xDate(v.c.date);let row=0;while((rows[row]||[]).some(px=>Math.abs(px-x)<r*2+2))row++;(rows[row]=rows[row]||[]).push(x);return {v,x,row};});
  const laneH=(rows.length||1)*(r*2+6);
  let guides='';placed.forEach(({v,x})=>{guides+=`<line class="ftl-guide ${v.c.match===null?'nv':v.c.match?'same':'opp'}" x1="${x}" x2="${x}" y1="${top}" y2="${laneTop}"></line>`;});
  placed.forEach(({v,x,row})=>{
    const cy=laneTop+r+row*(r*2+6), cls=v.c.match===null?'nv':v.c.match?'same':'opp';
    const tip=`#${v.n} ${fmtDate(v.c.date)} · ${v.c.short} · ${g.org} wanted ${v.c.wanted}, ${s.short} voted ${v.c.cast}${v.c.match===null?'':v.c.match?' (same)':' (opposite)'}`;
    svg+=`<g class="ftl-vote ${cls}" data-tip="${esc(tip)}"><circle cx="${x}" cy="${cy}" r="${r}"></circle><text x="${x}" y="${cy+4}" text-anchor="middle">${v.n}</text></g>`;
  });
  svg=svg.replace('@@GUIDES@@',guides);
  const H=laneTop+laneH+4;
  el.innerHTML=`<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${esc(g.org)}'s money to or about ${esc(s.name)} by month since ${monLabel(months[0])}, with ${votes.length} key votes on the same time axis. The table below the chart lists every month.">${svg}</svg>`;
  bindTips(el);
}
function mountFundTL(root){root.querySelectorAll('.ftl').forEach(el=>{const f=()=>drawFundTL(document.getElementById(el.id));f();resizers.push(f);});}

// The cycles a group's bundled gifts to a person were read for (research.json "bundled"), as "2025–26 cycle".
const bundledCycle=(id,key)=>{const c=DATA.bundled?.people?.[id]?.[key]?.cycles||[];return c.length?`${c[0]-1}–${String(c.at(-1)).slice(2)} cycle`:'this cycle';};
function fundersBlock(s){
  const F=s.funderPos||[];
  const noVotes=!realVotes(s,DATA.votes).length&&!realVotes(s,DATA.hvotes).length;
  const head=`<section class="recsec" id="rec-funders"><div class="kicker">Funding and legislative activity, side by side</div><h3 style="margin-top:4px">What ${esc(s.short)}'s funders and spenders wanted, and how ${esc(s.short)} voted</h3>
    <div class="note small" style="margin:6px 0 12px">${points([['Which groups',`Groups that gave to ${esc(s.short)}'s campaign, bundled their donors' gifts to it, or spent on the race, <i>and</i> take public positions on bills (scorecards, "key vote" letters or statements).`],['Bundled','Donors\' own gifts a group collected and forwarded through its PAC ("earmarked"). The FEC counts them as individual contributions, not the PAC\'s, so they are shown apart from its PAC checks.'],['What is shown',`Each key vote the group took a side on, next to ${esc(s.short)}'s recorded vote, with a link to the source: the group's own page, or a news report of its campaign.`],['Correlation, not cause','A match shows agreement, not that money changed the vote. Groups mostly back people who already vote their way, and spend against people who don\'t.'],['Groups covered',`Only the ${GP.length} groups whose public positions this app collects${GP.some(g=>g.status!=='done')?` (${GP.filter(g=>g.status!=='done').length} still being researched)`:''}. Other spenders, including the big party-aligned super PACs, are not compared.`]])}</div>`;
  if(!F.length)return head+`<p class="small muted">None of the ${GP.length} groups whose positions this app collects gave to ${esc(s.short)}'s campaign or spent on this race.</p></section>`;
  const money=g=>[g.pac?`gave <b class="num">${fmtFull(g.pac)}</b> to the campaign (${g.pacN} contribution${g.pacN>1?'s':''}, ${esc(s.pac.window)})`:'',
    g.routed?`${term('earmarked','bundled')} <b class="num">${fmtFull(g.routed)}</b> of its donors' own gifts to the campaign${g.routedN?` (${g.routedN.toLocaleString()} gift${g.routedN>1?'s':''})`:''}, ${g.routedBy==='hand'?`${esc(g.routedPeriod)}, researched by hand from the filings`:esc(bundledCycle(s.id,g.key))}`:'',g.for?`spent <b class="num">${fmtFull(g.for)}</b> ${s.out.multi?'supporting':'for'} ${esc(s.short)}`:'',g.against?`spent <b class="num">${fmtFull(g.against)}</b> ${s.out.multi?'opposing':'against'} ${esc(s.short)}`:''].filter(Boolean).join('; ');
  const body=F.map(g=>{
    const meta=GPBY[g.key]||{};
    let res;
    if(g.status==='pending')res=`<p class="small" style="margin:6px 0 0">${flag('Research not finished','This group\'s published positions are not collected yet. They will be added in the next update.')} Its positions on these votes are not shown yet.</p>`;
    else if(noVotes)res=`<p class="small muted" style="margin:6px 0 0">${esc(s.short)} cast none of the key votes, so there is nothing to compare.</p>`;
    else if(!g.compared.length)res=`<p class="small muted" style="margin:6px 0 0">No published position by ${esc(g.org)} was found on the key votes ${esc(s.short)} cast.</p>`;
    else res=`<p class="small" style="margin:6px 0 4px"><b>${esc(s.short)} voted the way ${esc(g.org)} wanted on ${g.agree} of ${g.n} key votes it scored or took a public position on.</b></p>
      <div class="tablewrap"><table><thead><tr><th>#</th><th>Vote</th><th>${esc(g.org)} wanted</th><th>${esc(s.short)} voted</th><th>Same?</th><th>Group's own source</th></tr></thead><tbody>${g.compared.map((c,ci)=>{const v=(DATA.votes.concat(DATA.hvotes)).find(x=>x.id===c.voteId);return `<tr><td><span class="ftl-num ${c.match===null?'nv':c.match?'same':'opp'}">${voteNum(g,ci)}</span></td><td><a href="${voteUrl(v)}" target="_blank" rel="noopener">${esc(c.short)}</a><div class="small muted">${esc(c.chamber)} · ${fmtDate(c.date)}</div></td><td><span class="chip ${posClass(c.wanted)}">${esc(c.wanted)}</span></td><td><span class="chip ${posClass(c.cast)}">${esc(c.cast)}</span></td><td>${c.match===null?'<span class="muted">did not vote</span>':c.match?'<b style="color:var(--good)">✓ Same</b>':'<b style="color:var(--crit)">✕ Opposite</b>'}</td><td class="small">${c.basis==='scorecard'?'Scored in its scorecard':c.basis==='key_vote_alert'?'Key-vote letter before the vote':'Public statement'}: <a href="${esc(c.src.u)}" target="_blank" rel="noopener">${esc(c.src.t)} ↗</a></td></tr>`}).join('')}</tbody></table></div>${fundTimeline(s,g,'ftl-'+g.key)}`;
    return `<div class="mv"><h4>${orgName(g.org,ORGS.group(g.key))}</h4><p class="small" style="margin:0">${money(g)}${g.spenders.length?` <span class="muted">(${esc(g.spenders.join(', '))})</span>`:''}</p>${res}</div>`;}).join('');
  return head+body+`<p class="small muted" style="margin-top:10px"><b>Groups researched:</b> ${GP.map(g=>esc(g.org)+(g.status==='pending'?' (in progress)':'')).join(', ')}. <a href="#method">How positions were collected</a>.</p></section>`;
}

function moneyVotesBlock(s){
  const A=s.assoc||{}, keys=ISS.map(i=>i.id).filter(k=>A[k]);
  const head=`<section class="recsec" id="rec-money"><div class="kicker">Funding and legislative activity, by issue</div><h3 style="margin-top:4px">Money and votes by issue</h3>
    <div class="note small" style="margin:6px 0 12px">${points([['How to read this',`For each issue, ${esc(s.short)}'s recorded actions sit next to the groups tied to that issue. Look for patterns yourself.`],['Groups shown','PACs that gave to the campaign, and outside groups that spent on the race. Each is tied to the issue by its sector, documented stance or name.'],['Why a group is linked','Hover or tap the dotted label next to it.'],['Correlation, not cause','This does not show that any money changed a vote. Groups often back candidates who already agree with them, and both can follow party lines.']])}</div>`;
  if(!keys.length)return head+`<p class="small muted">No issue-linked groups or coded actions were found for ${esc(s.short)}.</p></section>`;
  const body=keys.map(k=>{const a=A[k], ev=((s.evidence||{})[k]||[]).filter(e=>RECT.has(e.type)), st=((s.evidence||{})[k]||[]).filter(e=>e.type==='stated');
    return `<div class="mv"><h4>${esc(ISSBY[k].label)}</h4><div class="mvgrid">
      <div><div class="kicker">${esc(s.short)}'s recorded actions</div>${ev.length?`<ul class="list small">${ev.map(e=>`<li><b>${esc(e.title)}</b> (${esc(e.date||'')}): ${esc(e.pos||'')} → "${esc(sideLabel(k,e.side))}" <span class="muted">${esc(TYPEL[e.type])}</span></li>`).join('')}</ul>`:`<p class="small muted">No recorded vote, bill or official action on this issue${st.length?` (${st.length} stated position${st.length>1?'s':''} on the Your match tab)`:''}.</p>`}</div>
      <div><div class="kicker">Groups with a stake in this issue</div>
        ${a.pac.length?`<p class="small" style="margin:4px 0 2px"><b>PAC contributions to the campaign</b> (${esc(s.pac.window)}): ${fmtFull(a.pacTotal)} from ${a.pac.length+a.pacMore} PAC${a.pac.length+a.pacMore>1?'s':''}</p>${(()=>{const li=g=>`<li>${esc(g.name)}: <b class="num">${fmtFull(g.amount)}</b> <span class="muted">(${g.n} × ${g.reports.map(fi=>esc(s.pac.filings[fi].report)).join(', ')})</span> <span class="term small" tabindex="0" data-tip="${esc(g.why)}">${esc(g.whyShort)}</span></li>`;return `<ul class="list small">${a.pac.slice(0,5).map(li).join('')}</ul>${a.pac.length>5?`<details class="tv"><summary>${a.pac.length-5} more</summary><ul class="list small">${a.pac.slice(5).map(li).join('')}</ul></details>`:''}`})()}${a.pacMore?`<p class="small muted">and ${a.pacMore} more in the PAC table on the Money &amp; Influence tab.</p>`:''}`:'<p class="small muted" style="margin:4px 0">No issue-linked PAC contributions in the itemized reports.</p>'}
        ${a.out.length?`<p class="small" style="margin:8px 0 2px"><b>Outside spending on the race</b> (${period(s.out.start,s.out.end)}):</p><ul class="list small">${a.out.map(o=>{const m=cmOf(o.ci);return `<li>${orgName(m[1],ORGS.spender(m))} (${CLS1[m[2]]}): ${o.for?`<b class="num">${fmtFull(o.for)}</b> ${s.out.multi?'supporting':'for'} ${esc(s.short)}`:''}${o.for&&o.against?'; ':''}${o.against?`<b class="num">${fmtFull(o.against)}</b> ${s.out.multi?'opposing':'against'}`:''}, ${fmtDate(o.first)}${o.last!==o.first?' – '+fmtDate(o.last):''} <span class="term small" tabindex="0" data-tip="${esc(o.why)}">${esc(o.whyShort)}</span></li>`}).join('')}</ul>`:''}
      </div></div></div>`}).join('');
  return head+body+'</section>';
}
// Points with up to two decimals (a case can be worth 22.5 or 3.75), and an index or deduction to one decimal.
const fmtPts=v=>String(Math.round(v*100)/100), fmt1=v=>String(Math.round(v*10)/10);
const KIND_LABEL={criminal:'criminal',ethics:'ethics or civil',technical:'technical'};
// r: the entry's row in the Legal Trouble Index (its status, kind, age and points).
function ethTag(e,r){
  if(e.outcome==='None found')return '<span class="chip good">Nothing found</span>';
  const [lab,cls]=ETH_TAG[e.status]||[e.type,'ghost'], stage=e.status==='investigation'?(e.stage==='open'?' · open':' · closed, no finding'):'';
  const chip=`<span class="chip ${cls}">${esc(lab+stage)}</span>`;
  if(!r)return chip;
  if(r.covered)return chip+'<span class="eth-cost">Counted in the Stock Disclosure Dodger Index 🙈</span>';
  if(!r.points)return chip+'<span class="eth-cost">no points</span>';
  const how=[ETHICS_COST[r.status],r.kind!=='ethics'&&`× ${CASE_KIND[r.kind]} ${KIND_LABEL[r.kind]}`,r.old&&`× ${CASE_AGE.factor} over ${CASE_AGE.years} years old`].filter(Boolean);
  return chip+`<span class="eth-cost">−${fmtPts(r.points)} points${how.length>1?` <span class="eth-how">(${how.join(' ')})</span>`:''}</span>`;
}
// An index as a card in a row: its name, value and description, with a boxed "How it's calculated" right under the
// description, using the person's own numbers where there are any.
const ixCard=({icon='',name,value,about,how,label='How it\'s calculated'})=>`<div class="cx-stat ix-card"><span>${icon?icon+' ':''}${name}</span><b>${value}</b><small>${about}</small>${how?`<div class="ix-how"><div class="ix-h">${label}</div>${how}</div>`:''}</div>`;
const ixN=v=>v==null?'—':String(Math.round(v));
// The grade's three parts, each with what it costs.
function ethIndexes(s,e){
  const cost=(x,c,whole)=>x.index==null?`${esc(x.why)}: costs nothing`:!c?(x.why?`${esc(x.why)}: costs nothing`:'Costs nothing'):whole?`Costs all ${fmtPts(c)} points`:`Costs a tenth: ${fmt1(c)} points`;
  const cases=e.legal.rows.filter(r=>r.points).length;
  // Legal Trouble: each case's status points × kind × age, added up.
  const lr=e.legal.rows.filter(r=>r.points),term=r=>`${ETHICS_COST[r.status]}${r.kind!=='ethics'?` × ${CASE_KIND[r.kind]}`:''}${r.old?` × ${CASE_AGE.factor}`:''}`;
  const legalHow=`Each case: status points (${ETHICS_COST.finding} confirmed finding, ${ETHICS_COST.open} open, ${ETHICS_COST.closed} closed without a finding) × kind (criminal × ${CASE_KIND.criminal}, technical × ${CASE_KIND.technical}) × age (× ${CASE_AGE.factor} after ${CASE_AGE.years} years), added up, at most 100.`
    +(lr.length?`<div class="ix-f">${lr.slice(0,5).map(term).join(' + ')}${lr.length>5?` + ${lr.length-5} more`:''} = <b>${fmtPts(e.legal.total)}</b>${e.legal.total>100?', capped at <b>100</b>':''}</div>`:`<div class="ix-f">No case with points = <b>0</b></div>`)
    +`<div class="ix-f">Off the Ethics grade: all of it.</div>`;
  // Insider Trading: four weighted shares of their reviewed trades.
  const IW=INSIDER.weights,ip=e.insider.parts;
  const insiderHow=`${IW.conflicts} × committee conflicts (dollar share of single-stock trades in sectors their committees oversee) + ${IW.nearVotes} × share near related votes + ${IW.donors} × share in donors' companies + ${IW.activity} × single-stock activity (${INSIDER.activityCeiling} trades a year scores 100). Needs ${INSIDER.minTrades} reviewed trades.`
    +(ip?`<div class="ix-f">${IW.conflicts} × ${ixN(ip.conflicts)} + ${IW.nearVotes} × ${ixN(ip.nearVotes)} + ${IW.donors} × ${ixN(ip.donors)} + ${IW.activity} × ${ixN(ip.activity)} = <b>${e.insider.index??ixN(IW.conflicts*ip.conflicts+IW.nearVotes*ip.nearVotes+IW.donors*ip.donors+IW.activity*ip.activity)}</b>${e.insider.index==null?` (${e.insider.n} of ${INSIDER.minTrades} trades, so not counted)`:''}</div>`:`<div class="ix-f">${esc(e.insider.why||'No trades')} = <b>${e.insider.index??'—'}</b></div>`)
    +`<div class="ix-f">Off the Ethics grade: a tenth (${INDEX_COST} × the index).</div>`;
  // Stock Disclosure Dodger: late or missing trade reports, and late annual reports.
  const DW=DODGER.weights,dp=e.dodger.parts;
  const dodgerHow=`${DW.trades} × share of trades reported after ${LATE_DAYS} days or never + ${DW.annual} × share of the last 3 years' annual reports filed late. Without annual reports on file, the trade part counts alone. Needs ${DODGER.minFilings} filings.`
    +(e.dodger.index!=null?`<div class="ix-f">${dp.annual!=null?`${DW.trades} × ${ixN(dp.trades)} + ${DW.annual} × ${ixN(dp.annual)}`:`trade reports alone: ${ixN(dp.trades)}`} = <b>${e.dodger.index}</b></div>`:`<div class="ix-f">${esc(e.dodger.why||'No trades')} = <b>—</b></div>`)
    +`<div class="ix-f">Off the Ethics grade: a tenth (${INDEX_COST} × the index).</div>`;
  return `<section class="recsec" id="eth-indexes"><div class="kicker">The grade's three parts</div><h3 style="margin-top:4px">Ethics indexes</h3>
  <div class="cx-stats ix-row">${ixCard({icon:'🚨',name:'Legal Trouble Index',value:e.legal.index==null?'—':fmtPts(e.legal.index),about:`${cost(e.legal,e.legal.index,true)}. ${cases?`${cases} case${cases===1?'':'s'} with points.`:'No case with points.'}`,how:legalHow})}${ixCard({icon:'📈',name:'Insider Trading Index',value:e.insider.index==null?'—':fmtPts(e.insider.index),about:`${cost(e.insider,e.insiderCost,false)}. Trades that overlap with their committees, votes or donors.`,how:insiderHow})}${ixCard({icon:'🙈',name:'Stock Disclosure Dodger Index',value:e.dodger.index==null?'—':fmtPts(e.dodger.index),about:`${cost(e.dodger,e.dodgerCost,false)}. Trade reports filed late or never.`,how:dodgerHow})}</div>
  <div style="margin:8px 0 0">${points([['How a case counts',`Its status points × its kind × its age. Status: ${ETHICS_COST.finding} for a confirmed finding, ${ETHICS_COST.open} for an open investigation, ${ETHICS_COST.closed} for one closed without a finding, 0 for an allegation.`],['Kind',`Criminal × ${CASE_KIND.criminal}, ethics or civil × ${CASE_KIND.ethics}, technical × ${CASE_KIND.technical} (such as an FEC fine for a late report).`],['Age',`× ${CASE_AGE.factor} when it was decided more than ${CASE_AGE.years} years ago. Open cases always count in full.`],['Trading',`The two trading indexes cost a tenth of their value each, so trading can cost at most ${Math.round(2*100*INDEX_COST)} points.`]],'small')}</div></section>`;
}
function ethicsHTML(s){
  const rowOf=new Map(personEthics(s).legal.rows.map(r=>[s.ethics[r.i],r]));
  const rank=e=>e.outcome==='None found'?9:e.status==='finding'?0:e.status==='investigation'?(e.stage==='open'?1:2):e.status==='allegation'?3:4;
  const list=s.ethics.map((e,i)=>[e,i]).sort((x,y)=>rank(x[0])-rank(y[0])||x[1]-y[1]).map(x=>x[0]);
  return `<section class="recsec" id="rec-ethics"><div class="kicker">Ethics & legal compliance</div><h3 style="margin-top:4px">Every entry, most serious first</h3>
  <p class="small muted" style="margin:4px 0 0">Findings, penalties, investigations and disclosure checks. Each is tied to an official record or a credible report.</p>
  <div style="margin:0 0 10px">${points([['Allegation','A complaint or report with no official finding.'],['Investigation',`A formal inquiry, lawsuit or proceeding. It is still open, or it closed without a finding against ${esc(s.short)}.`],['Confirmed finding',`A court, agency or ethics body found a violation or set a penalty, or ${esc(s.short)} admitted it.`],['Nothing found','The sources checked turned up nothing. That does not mean nothing exists.'],['Points','What each entry costs in the Legal Trouble Index 🚨.']],'small')}</div>
  ${list.map(e=>`<article class="eth"><div class="head">${ethTag(e,rowOf.get(e))}<span class="chip ghost">${esc(e.type)}</span><span class="mono muted">${esc(e.date)}</span></div><h3>${esc(e.title)}</h3><p style="margin-top:8px">${esc(e.summary)}</p><div class="outcome"><b>Outcome:</b> ${esc(e.outcome)}</div><ul class="srcs">${e.sources.map(x=>`<li><a href="${esc(x.u)}" target="_blank" rel="noopener">${esc(x.t)} ↗</a></li>`).join('')}</ul></article>`).join('')}
  ${s.ethicsSearched&&s.ethics.some(e=>e.outcome!=='None found')?`<p class="small muted" style="margin-top:12px"><b>Also checked:</b> ${esc(s.ethicsSearched)}</p>`:''}</section>`;
}
// Stock trading: reviewed trades, each checked for a late or missing disclosure and for a committee conflict.
const TRADE_OWNER={self:'Self',spouse:'Spouse',child:'Dependent child',joint:'Joint'};
// A president's trades, from the OGE reports compiled in Disclosed Capitol's open dataset (public/exec-trades.json,
// written by scripts/build-exec-trades.mjs, CC BY 4.0, so the credit line always shows). Listed, never scored.
const EXEC=window.EXEC_TRADES||null;
const TRADE_TYPE={buy:'Buy',sell:'Sell',other:'Other'};
function presidentTradesHTML(s){
  const x=EXEC?.people?.[s.id];
  if(!x)return `<p class="small muted" style="margin:4px 0 0"><b>Not loaded:</b> a president reports trades on OGE Form 278e and 278-T reports. They couldn't be loaded right now.</p>`;
  const n=v=>Number(v||0).toLocaleString('en-US'),pct=(a,b)=>b?Math.round(a/b*100):0,ext=(u,t)=>`<a href="${esc(u)}" target="_blank" rel="noopener">${esc(t)} ↗</a>`;
  const bars=(rows,label,key,color)=>stackRows(rows.map(r=>({label:r[label],parts:{[key]:r.n},value:r.n,display:n(r.n)})),[{key,label:'Trades',color}]);
  const years=x.byYear.map(y=>({label:y.year,parts:{buy:y.buy,sell:y.sell,other:y.other},value:y.buy+y.sell+y.other,display:n(y.buy+y.sell+y.other)}));
  const late=x.late.of?pct(x.late.n,x.late.of):null, shown=x.recent.slice(0,25), more=x.recent.slice(25);
  const row=t=>`<tr><td class="mono" style="white-space:nowrap">${esc(t.traded)}</td><td class="mono" style="white-space:nowrap">${t.filed?`${esc(t.filed)}${t.days!=null?`<div class="small muted">${n(t.days)} days</div>`:''}`:'<span class="muted">Not linked</span>'}</td><td>${esc(t.asset)}${t.ticker?` <span class="mono muted">${esc(t.ticker)}</span>`:''}</td><td>${TRADE_TYPE[t.type]||esc(t.type)}</td><td class="r" style="white-space:nowrap">${esc(t.amount)}</td><td>${esc(t.form||'—')}</td></tr>`;
  const table=list=>`<div class="tablewrap"><table><thead><tr><th>Traded</th><th>Reported</th><th>Asset</th><th>Type</th><th class="r">Amount</th><th>Form</th></tr></thead><tbody>${list.map(row).join('')}</tbody></table></div>`;
  return `<p class="small" style="margin:4px 0 8px">From ${esc(s.short)}'s own OGE reports: a Form 278-T for trades, and the yearly Form 278e. <b>Listed, not scored.</b></p>
  <div style="margin:0 0 8px">${points([['Not scored','How to score a president\'s trades is still an open decision. The committee-conflict rule for members of Congress has no direct match for a president, so the Ethics grade above doesn\'t count them.'],
    ['Amounts','Reports give ranges, not exact amounts.'],
    ['Counted once',`${n(x.repeats)} rows repeat a trade with the same date, asset, type and amount, often because it was listed on two reports. So ${n(x.rows)} rows are ${n(x.trades)} trades. Two identical trades in separate accounts on the same day would also count once.`],
    x.misdated&&['Dates that don\'t fit',`${n(x.misdated)} trades are dated more than a year before the report that lists them, so the date was likely misread (some are bonds whose due date was taken for the trade date). They're left out of the charts and the late count.`],
    ['Deadline',`A 278-T is due within ${EXEC.deadline} days of a trade at the latest.`]],'small')}</div>
  <div class="cx-stats">
    <div class="cx-stat"><span>Trades</span><b>${n(x.trades)}</b><small>${n(x.buys)} buys and ${n(x.sells)} sells, ${fmtDate(x.first)} to ${fmtDate(x.last)}</small></div>
    <div class="cx-stat"><span>Value traded</span><b>${money(x.value.low)}–${money(x.value.high)}</b><small>Buys and sells added together, from the disclosed ranges</small></div>
    <div class="cx-stat"><span>Linked to a report</span><b>${pct(x.linked,x.trades-x.misdated)}%</b><small>${n(x.linked)} trades. The dataset has no report date for the rest, so when they were reported can't be shown</small></div>
    <div class="cx-stat"><span>Reported after ${EXEC.deadline} days</span><b>${late==null?'—':late+'%'}</b><small>${late==null?'No 278-T trades with a report date':`${n(x.late.n)} of the ${n(x.late.of)} trades on a dated 278-T. A lead, not a finding: extensions and late fees aren't in the data`}</small></div></div>
  <div class="chart"><h3>Trades by year</h3><div class="sub">${points([['Each bar','Buys and sells in the year the trade was made.'],['Left out',`Trades whose date doesn't fit their report.`]],'small')}</div>
    ${stackRows(years,[{key:'buy',label:'Buys',color:'var(--s1)'},{key:'sell',label:'Sells',color:'var(--s2)'},{key:'other',label:'Other',color:'var(--cx-other)'}])}${legend([['var(--s1)','Buys'],['var(--s2)','Sells']])}
    ${tableView(['Year','Count','Buys','Sells'],x.byYear.map(y=>[esc(y.year),n(y.buy+y.sell+y.other),n(y.buy),n(y.sell)]))}</div>
  <div class="chart"><h3>What was traded</h3><div class="sub">${points([['Kind of asset','From the ticker the dataset gives. Most trades list a company by name with no ticker, so those are grouped together.']],'small')}</div>${bars(x.byKind,'label','kind','var(--s3)')}</div>
  <div class="chart"><h3>Trades by amount</h3><div class="sub">${points([['Ranges','The value range each report gives. "Other ranges" are ranges that aren\'t one of OGE\'s, likely typed or read wrong.']],'small')}</div>${bars(x.byAmount,'label','amount','var(--s4)')}</div>
  <div class="chart"><h3>The reports</h3><div class="sub">${points([['Each row','The reports the dataset ties trades to, by date. Two filed the same day are counted together.'],['Rows listed','As listed in the dataset, so a trade listed twice counts twice here.']],'small')}</div>
    <div class="tablewrap"><table><thead><tr><th>Date</th><th>Form</th><th class="r">Reports</th><th class="r">Rows listed</th><th>Trades made</th></tr></thead><tbody>${x.reports.map(r=>`<tr><td class="mono" style="white-space:nowrap">${esc(r.filed)}</td><td>${esc(r.form||'Not given')}</td><td class="r">${r.count}</td><td class="r">${n(r.listed)}${r.misdated?`<div class="small muted">${n(r.misdated)} misdated</div>`:''}</td><td class="mono small" style="white-space:nowrap">${r.from?`${esc(r.from)} to ${esc(r.to)}`:'—'}</td></tr>`).join('')}</tbody></table></div></div>
  <div class="chart"><h3>Latest trades</h3><div class="sub">${points([['Order','Newest trade first.'],['Reported','The date on the report, and how many days after the trade. "Not linked" when the dataset has no report for it.']],'small')}</div>
    ${table(shown)}${more.length?`<details class="tv"><summary>Show ${more.length} more</summary>${table(more)}</details>`:''}
    <p class="small muted" style="margin:8px 0 0">The full list: ${ext(x.profile||EXEC.source,`${s.short} on Disclosed Capitol`)}</p></div>
  <p class="small muted" style="margin:12px 0 0"><b>Source:</b> ${ext(EXEC.source,EXEC.credit)}, under ${ext(EXEC.licenseUrl,EXEC.license)}, from ${esc(EXEC.from)}. ${esc(EXEC.changes)} Dataset refreshed ${fmtDate(EXEC.refreshed)}.</p>`;
}
// How they hold investments (step 8), from the reviewed research: a qualified blind trust or no individual stocks.
function holdingsLine(s){
  const h=s.holdings;if(!h||!HOLDINGS[h.status])return '';
  const src=[h.src,h.also].filter(Boolean).map(x=>`<a href="${esc(x.u)}" target="_blank" rel="noopener">${esc(x.t)} ↗</a>`).join(' · ');
  const rule=h.status==='blind-trust'?'An independent trustee decides what to buy and sell and doesn\'t tell them, so trades made inside the trust don\'t count in the trading indexes. Trades they report outside it, or made before it, count as usual.'
    :'Trades in funds don\'t count as conflicts or single-stock activity. Stock trades from before they sold count as usual.';
  return `<div class="note small" style="margin:6px 0 10px">${points([[esc(HOLDINGS[h.status]),`Since ${esc(h.since)}. ${esc(h.note||'')} ${src}`],['What it changes',rule],['What doesn\'t count','A managed or "discretionary" account, an adviser who trades without asking, or a trust that isn\'t a qualified blind trust. Those trades are still theirs to report, and count in full.'],['No bonus','The Ethics grade starts at 100 and only loses points.']],'small')}</div>`;
}
function tradingHTML(s){
  const t=personTrading(s), sec=overseenSectors(s);
  const head=`<section class="recsec" id="eth-trades"><div class="kicker">Stock trading</div><h3 style="margin-top:4px">Stock trades</h3>`;
  if(s.office)return head+presidentTradesHTML(s)+'</section>';
  if(!s.bioguide)return head+`<p class="small muted" style="margin:4px 0 0"><b>No trading data:</b> these reports cover members of Congress only. State rules vary.</p></section>`;
  if(!t.rows.length)return head+holdingsLine(s)+`<p class="small muted" style="margin:4px 0 0">No reviewed stock trades for ${esc(s.short)} yet. New trades from official reports show under Latest official records below. They count toward the grade only after review.</p></section>`;
  const e=personEthics(s),ip=e.insider.parts,dp=e.dodger.parts,n=v=>`${Math.round(v)}%`;
  return head+holdingsLine(s)+`<div style="margin:0 0 8px">${e.inTrust?`<p class="small" style="margin:0 0 6px"><b>Left out:</b> ${e.inTrust} trade${e.inTrust===1?'':'s'} made inside the qualified blind trust.</p>`:''}${points([['Insider Trading Index 📈',`${e.insider.index??'—'}${e.insider.why?` (${esc(e.insider.why)})`:''}. Committee conflicts ${n(ip.conflicts)} of the dollars in single stocks, near related votes ${n(ip.nearVotes)}, in donors' companies ${n(ip.donors)}, single-stock activity ${Math.round(ip.activity)}.`],['Stock Disclosure Dodger Index 🙈',`${e.dodger.index??'—'}${e.dodger.why?` (${esc(e.dodger.why)})`:''}. Trade reports late or missing: ${n(dp.trades)}${dp.annual!=null?`; annual disclosures late: ${n(dp.annual)}`:'; annual disclosures are not on file yet'}.`],['Filing deadline',`Trade reports are due within ${LATE_DAYS} days of a trade.`],['Their committees oversee',sec.length?esc(sec.join(', ')):'Not recorded yet, so no trade counts as a conflict.'],['Family trades','Spouse and dependent-child trades are included and labeled.'],['Returns','Not scored.']],'small')}</div>
  ${tradeChartsBlock(t.rows,sec,'eth-tr')}
  <div class="tablewrap"><table><thead><tr><th>Traded</th><th>Filed</th><th>Company</th><th>Type</th><th class="r">Amount</th><th>Owner</th><th>Checks</th></tr></thead><tbody>${t.rows.map(r=>`<tr><td class="mono">${esc(r.traded||'')}</td><td class="mono">${r.missing?'<b style="color:var(--crit)">not filed</b>':esc(r.filed||'')}${r.days!=null?`<div class="small muted">${r.days} days</div>`:''}</td><td>${esc(r.company||'')}${r.ticker?` <span class="mono muted">${esc(r.ticker)}</span>`:''}${r.sector?`<div class="small muted">${esc(r.sector)}</div>`:''}</td><td>${esc(r.type||'')}</td><td class="r">${esc(r.amount||'')}</td><td>${esc(TRADE_OWNER[r.owner]||r.owner||'')}</td><td>${r.late?'<span class="chip crit">Late</span> ':''}${r.conflict?'<span class="chip warn">Committee conflict</span>':''}${r.flag||r.nearVote?` <span class="chip ghost" title="${esc(r.flag||'')}">Near a related vote</span>`:''}${r.src?` <a class="small" href="${esc(r.src.u)}" target="_blank" rel="noopener">filing ↗</a>`:''}</td></tr>`).join('')}</tbody></table></div></section>`;
}
function paneEthics(s,pane){
  const e=personEthics(s);
  const terms=[[e.finding,'confirmed finding','confirmed findings'],[e.open,'open investigation','open investigations'],[e.closed,'investigation closed without a finding','investigations closed without a finding']].filter(t=>t[0]);
  const trade=[e.late&&`${e.late} late or missing disclosure${e.late>1?'s':''}`,e.conflict&&`${e.conflict} committee-conflict trade${e.conflict>1?'s':''}`].filter(Boolean);
  const detail=(terms.length||trade.length)?terms.map(([n,one,many])=>`${n} ${n>1?many:one}`).concat(trade).join(' · ')+(e.allegation?` · ${e.allegation} allegation${e.allegation>1?'s':''} (not scored)`:''):`No confirmed findings, investigations or trading problems in the sources checked${e.allegation?`; ${e.allegation} allegation${e.allegation>1?'s are':' is'} listed but not scored`:''}.`;
  const parts=[e.legal.index&&`${fmtPts(e.legal.index)} (Legal Trouble 🚨${e.legal.total>100?', capped at 100':''})`,e.insiderCost&&`${fmt1(e.insiderCost)} (a tenth of Insider Trading 📈 ${e.insider.index})`,e.dodgerCost&&`${fmt1(e.dodgerCost)} (a tenth of Stock Disclosure Dodger 🙈 ${e.dodger.index})`].filter(Boolean);
  const total=fmtPts(e.raw);
  const math=parts.length?`<p class="small gh-m"><b>How it was calculated:</b> 100 − ${parts.join(' − ')} = ${e.raw<0?`${total}, shown as <b>0%</b>`:+total===e.pct?`<b>${e.pct}%</b>`:`${total}, rounded to <b>${e.pct}%</b>`}.</p>`:'';
  pane.innerHTML=`${gradeHead('Ethics',e.pct,detail,gradeRule('eth'),math+monthlyNote(s,'ethics',e.pct))}${ethIndexes(s,e)}${ethicsHTML(s)}${caseTimelineBlock(s)}${tradingHTML(s)}<section id="live-records" style="margin-top:28px"></section>`;
  mountCaseTimeline(s);mountTradeCharts(s,personTrading(s).rows,'eth-tr');hoverTips(pane);
  window.RecordLive.profile(s,pane.querySelector('#live-records'),['netWorth','trades','legal']);
}

// ---------- Workers > Profit tab: votes on scored bills, then who funds them and how those funders wanted them to vote ----------
const PVP_SIDE={people:'Working people',profit:'The wealthy and corporations'};
const billUrl=k=>{const eo=/^eo-(\d+)$/.exec(k||'');if(eo)return `https://www.govinfo.gov/link/cpd/executiveorder/${eo[1]}`;const m=/^(\d+)-([a-z]+)-(\d+)$/.exec(k||'');if(!m)return null;const T={hr:'house-bill',s:'senate-bill',hjres:'house-joint-resolution',sjres:'senate-joint-resolution',hconres:'house-concurrent-resolution',sconres:'senate-concurrent-resolution',hres:'house-resolution',sres:'senate-resolution'},A={samdt:'senate-amendment',hamdt:'house-amendment'};return A[m[2]]?`https://www.congress.gov/amendment/${m[1]}th-congress/${A[m[2]]}/${m[3]}`:`https://www.congress.gov/bill/${m[1]}th-congress/${T[m[2]]}/${m[3]}`;};
const billLabel=k=>{const eo=/^eo-(\d+)$/.exec(k||'');if(eo)return `Executive Order ${eo[1]}`;const m=/^(\d+)-([a-z]+)-(\d+)$/.exec(k||'');if(!m)return k;const L={hr:'H.R.',s:'S.',hjres:'H.J.Res.',sjres:'S.J.Res.',hconres:'H.Con.Res.',sconres:'S.Con.Res.',hres:'H.Res.',sres:'S.Res.',samdt:'S.Amdt.',hamdt:'H.Amdt.'};return `${L[m[2]]} ${m[3]} (${m[1]}th Congress)`;};
const PVP_DID={vote:p=>`Voted ${p}`,sponsored:()=>'Sponsored',cosponsored:()=>'Cosponsored',signed:()=>'Signed into law',vetoed:()=>'Vetoed',order:()=>'Issued the order',statement:p=>`Said they ${p==='support'?'support':'oppose'} it`};
// Workers > Profit bill scores (grades.js billScore): the badge, a short reason, and the full list of bills on file.
const POS_WORD={support:'supported',oppose:'opposed'};
const signed=n=>n==null?'—':`${n>0?'+':n<0?'−':''}${Math.abs(n)}`;
const srcLink=x=>x?.src?` <a href="${esc(x.src.u)}" target="_blank" rel="noopener">${esc(x.src.t)} ↗</a>`:'';
const billScoreBadge=b=>b.status==='scored'?`<b class="${b.score>0?'gr-A':'gr-F'}">${signed(b.score)}</b>`:`<span class="muted">Not scored</span>`;
const sidesText=b=>(b.sides||[]).map(p=>`${esc(BILL_GROUPS[p.group]?.org||p.group)} ${POS_WORD[p.pos]}`).join(', ');
function billWhyShort(b){
  return [(b.gains||b.access)&&`<b>Who gains (${signed(b.gainsPart)}):</b> ${[b.gains&&`${esc(b.gains.by)}: ${esc(GAINS_STEPS[b.gains.step].toLowerCase())}`,b.access&&`access (${esc(b.access.by)}): ${esc(ACCESS_STEPS[b.access.step].toLowerCase())}`].filter(Boolean).join('; ')}.`,
    b.sides?.length&&`<b>Who took a side (${signed(b.sidesPart)}):</b> ${sidesText(b)}.`].filter(Boolean).join(' ');
}
function billsBlock(bills){
  if(!bills.length)return '';
  const order=b=>b.status==='scored'?0:b.status==='disputed'?1:2;
  const rows=bills.slice().sort((a,b)=>order(a)-order(b)||Math.abs(b.score||0)-Math.abs(a.score||0)||a.title.localeCompare(b.title));
  const n=bills.filter(b=>b.status==='scored').length;
  return `<div class="chart" id="pvp-bills"><h3>Every bill on file</h3><div class="sub">${n} of ${bills.length} bills are scored, from −100 (fully corporate-backed) to +100 (fully worker-backed). Half the score is who gains, from a nonpartisan study; half is which side worker and business groups took. <a href="#method">How bills are scored</a></div>
    <div class="tablewrap"><table><thead><tr><th>Bill</th><th class="r">Score</th><th>Who gains</th><th>Who took a side</th><th>Also on record (not scored)</th></tr></thead><tbody>${rows.map(b=>{const u=billUrl(b.id);
      const who=[...new Set((b.cosponsors||[]).map(c=>c.person))].map(id=>byId[id]?`<a href="#${id}-pvp">${esc(byId[id].short||byId[id].name)}</a>`:'').filter(Boolean);
      return `<tr><td>${u?`<a href="${u}" target="_blank" rel="noopener">${esc(b.title)}</a>`:esc(b.title)}<div class="small muted">${esc(billLabel(b.id))}${b.versions?.length?`; also ${b.versions.map(k=>esc(billLabel(k))).join(', ')}`:''}</div>${who.length?`<div class="small"><b>Sponsors and cosponsors here:</b> ${who.join(', ')}</div>`:''}${b.stated?.length?`<div class="small"><b>Said so publicly</b> (half a vote each)${['support','oppose'].map(pos=>{const l=b.stated.filter(st=>st.pos===pos).map(st=>`${byId[st.person]?`<a href="#${st.person}-pvp">${esc(byId[st.person].short||byId[st.person].name)}</a>`:esc(st.person)}${st.src?` <a href="${esc(st.src.u)}" target="_blank" rel="noopener" title="${esc(st.src.t)}">↗</a>`:''}`);return l.length?` · <b>${pos==='support'?'for':'against'}:</b> ${l.join(', ')}`:'';}).join('')}</div>`:''}</td>
      <td class="r">${billScoreBadge(b)}${b.status!=='scored'?`<div class="small muted">${esc(BILL_STATUS[b.status]||'')}</div>`:''}</td>
      <td class="small">${b.gains||b.access?`<b>${signed(b.gainsPart)}</b>${b.gains?`<div><b>Money (${signed(b.moneyPart)}):</b> ${esc(GAINS_STEPS[b.gains.step])}. ${esc(b.gains.why)}${srcLink(b.gains)}</div>`:''}${b.access?`<div><b>Access (${signed(b.accessPart)}):</b> ${esc(ACCESS_STEPS[b.access.step])}. ${esc(b.access.why)}${srcLink(b.access)}</div>`:''}`:'<span class="muted">No who-gains study on file.</span>'}</td>
      <td class="small">${b.sides?.length?`<b>${signed(b.sidesPart)}</b><ul class="list">${b.sides.map(p=>`<li><b>${esc(BILL_GROUPS[p.group]?.org||p.group)} ${POS_WORD[p.pos]}</b> (${BILL_GROUPS[p.group]?.side==='worker'?'worker side':'business side'}${p.date?', '+esc(p.date):''}). ${esc(p.why)}${srcLink(p)}</li>`).join('')}</ul>`:'<span class="muted">No group positions on file.</span>'}</td>
      <td class="small"><div data-lob="${esc(b.id)}"><span class="muted">Lobbying: checking…</span></div>${b.context?.cbo?`<div><b>CBO:</b> ${esc(b.context.cbo.why)}${srcLink(b.context.cbo)}</div>`:''}${b.context?.note?`<div><b>Note:</b> ${esc(b.context.note.why)}${srcLink(b.context.note)}</div>`:''}${b.context?.whiteHouse?`<div><b>White House:</b> ${esc(POS_WORD[b.context.whiteHouse.pos]||b.context.whiteHouse.pos)}. ${esc(b.context.whiteHouse.why||'')}${srcLink(b.context.whiteHouse)}</div>`:''}</td></tr>`;}).join('')}</tbody></table></div>
    <p class="small muted"><b>Bills that didn't pass</b> count too: sponsoring or cosponsoring one counts like a yes vote, a cited public statement counts half, and a bill counts once across its versions. Cosponsors come from Congress.gov. <b>Lobbying</b> comes from LDA.gov reports that name the bill, in the two years of its Congress. A report says a client lobbied on the bill, not which side it was on, so it's shown here and never scored. Unions are counted by the client's name.</p></div>`;
}
// Fills each bill's lobbying line from the daily refresh (/api/bills), or says the update service isn't running.
async function mountBillLobbying(host){
  const els=[...host.querySelectorAll('[data-lob]')];if(!els.length)return;
  let lob=null;try{const r=await fetch('/api/bills',{cache:'no-cache'});if(r.ok)lob=(await r.json()).lobbying||{};}catch{}
  const yrs=id=>{const c=Number(id.split('-')[0]),y=1787+2*c;return `${y}–${String(y+1).slice(2)}`;};
  for(const el of els){const x=lob?.[el.dataset.lob],id=el.dataset.lob;
    el.innerHTML=!lob?'<span class="muted">Lobbying counts need the update service running.</span>':!x?'<span class="muted">Lobbying: not checked yet.</span>'
      :`<b>Lobbying (${yrs(id)}):</b> ${x.total.toLocaleString()} report${x.total===1?'':'s'} name it.${x.read?` Of the ${x.read} read, ${x.unions} ${x.unions===1?'was':'were'} filed for unions and ${x.others} for companies and other groups.`:''}${x.unionClients?.length?` Unions: ${esc(x.unionClients.slice(0,4).join(', '))}.`:''}`;}
}
// The Corporation Compromised Index 🏢 on the Workers > Profit tab: its parts, what each is built from, and what's missing.
const CCI_PART={pacShare:'Business PACs\' share of funds raised',employees:'Donor companies\' employees',businessVotes:'Votes with business funders',lobbiedBills:'Profit side on lobbied bills'};
function cciBlock(s,v){
  const c=v.cci;if(!c||s.office)return '';
  const C=CORP_COMPROMISED,m=c.money,bv=c.votes,wt=k=>c.weights?.[k]!=null?`${Math.round(c.weights[k]*100)}% of the index`:'Not counted yet';
  if(c.index==null)return `<div class="chart"><h3>Corporation Compromised Index 🏢</h3><p class="small muted">${esc(c.why)}, so it isn't counted.</p></div>`;
  const W=C.weights,pc=k=>Math.round(c.parts[k]);
  // The index itself: the parts on file, reweighted.
  const indexHow=`${Math.round(W.pacShare*100)}% PAC share + ${Math.round(W.employees*100)}% employees + ${Math.round(W.businessVotes*100)}% business-funder votes + ${Math.round(W.lobbiedBills*100)}% lobbied bills. A part without data drops out and the rest are reweighted.<div class="ix-f">${c.used.map(k=>`${(c.weights[k]).toFixed(2).replace(/0$/,'')} × ${pc(k)}`).join(' + ')} = <b>${c.index}</b></div><div class="ix-f">In this grade: 0.25 × (100 − ${c.index}) = ${fmt1(0.25*(100-c.index))} of 25 points.</div>`;
  const pacHow=m?(m.pacTotal?`Business PACs' money ÷ funds raised; ${C.pacCeiling}% or more scores 100. Business PACs: companies', trade associations' and cooperatives' (by FEC type, or by name until matched).<div class="ix-f">${fmtFull(m.rowsBusiness)} ÷ ${fmtFull(m.rowsTotal)} (business share of the itemized PAC money) × ${fmtFull(m.pacTotal)} (the cycle's PAC total) = ${fmtFull(Math.round(m.businessPac))}</div><div class="ix-f">${fmtFull(Math.round(m.businessPac))} ÷ ${fmtFull(m.receipts)} = ${fmt1(c.share)}%; ${fmt1(c.share)} ÷ ${C.pacCeiling} × 100 = <b>${pc('pacShare')}</b>${c.share>C.pacCeiling?' (capped)':''}</div>`
    :`Business PACs' money ÷ funds raised; ${C.pacCeiling}% or more scores 100.<div class="ix-f">No PAC money in ${fmtFull(m.receipts)} raised = <b>0</b></div>`):'';
  const voteHow=`Their rate of voting the way business funders that gave to the campaign wanted − their party's rate on the same votes, averaged by money given. ${C.voteCeiling} points above scores 100; at or below the party scores 0. Needs 5 compared votes.`
    +(c.parts.businessVotes!=null?`<div class="ix-f">${fmt1(bv.diff)} ÷ ${C.voteCeiling} × 100 = <b>${c.parts.businessVotes}</b>${bv.diff>C.voteCeiling?' (capped)':bv.diff<=0?' (at or below the party: 0)':''} · ${bv.n} votes</div>`:`<div class="ix-f">${bv?.rows?.length?`${bv.n} of 5 compared votes`:'No business funder took a side on their votes'}: not counted</div>`);
  return `<div class="chart"><h3>Corporation Compromised Index 🏢</h3><div class="sub">How much of their campaign money comes from businesses' PACs, and how much more often they vote with business funders than their party does. Higher means more. It is a quarter of this grade, as 100 minus the index.</div>
    <div class="cx-stats ix-row">
      ${ixCard({icon:'🏢',name:'Corporation Compromised Index',value:c.index,about:`From ${c.used.length} of its 4 parts. Higher means more reliance on, and siding with, business money.`,how:indexHow})}
      ${ixCard({name:CCI_PART.pacShare,value:c.parts.pacShare==null?'—':pc('pacShare'),about:`${c.share!=null?`${fmt1(c.share)}% of the money raised${m?.start?`, ${period(m.start,m.end)}`:''}`:'No campaign money on file'}. ${wt('pacShare')}.`,how:pacHow})}
      ${ixCard({name:CCI_PART.businessVotes,value:c.parts.businessVotes??'—',about:`${c.parts.businessVotes!=null?`${bv.diff>=0?fmt1(bv.diff)+' points more':fmt1(-bv.diff)+' points less'} often than their party, on ${bv.n} votes`:'Not counted'}. ${wt('businessVotes')}.`,how:voteHow})}
      ${ixCard({name:CCI_PART.employees,value:'—',about:'Not counted yet: the top donor organizations\' employee giving comes from the daily refresh and isn\'t reviewed.',how:`Giving by employees of the companies among their top 20 donor organizations ÷ funds raised; ${C.employeeCeiling}% or more scores 100.`})}
      ${ixCard({name:CCI_PART.lobbiedBills,value:'—',about:'Not counted yet: lobbying on each bill comes from the refresh and isn\'t reviewed.',how:`Of the Workers > Profit bills a top donor organization lobbied on, the share where they took the Profit side. Needs ${C.minLobbied} such bills.`})}
    </div>
    ${points([['Business funders','The Chamber of Commerce, NFIB, Americans for Prosperity, Club for Growth, and industries\' associations (bankers, mortgage bankers, community banks, Realtors, drug makers, hospitals, credit unions, the crypto industry\'s Fairshake).'],['Left out','Outside spending, which candidates can\'t control.']],'small')}</div>`;
}
function panePvp(s,pane){
  const v=personPvp(s);
  const detail=v.pct!=null?`${v.nPeople} of ${v.n} scored actions delivered more for working people; ${v.nProfit} more for the wealthy and corporations.`:!PVP_MARKS.size?'No bills have been scored yet, so no one has this grade.':v.n?`${v.n} of the ${MIN_PVP_ACTIONS} scored actions a grade needs.`:`None of ${esc(s.short)}'s recorded ${s.office?'bill signings, vetoes or executive orders':'votes or sponsorships'} is on a scored bill yet.`;
  const billMath=`working-people points ÷ all points = ${v.people} ÷ (${v.people} + ${v.profit}) = ${v.billsPct}%`;
  const math=v.pct==null?'':v.blended?`<p class="small gh-m"><b>How it was calculated:</b> the bills, ${billMath}, count three quarters; 100 minus the Corporation Compromised Index 🏢 (${v.cci.index}) counts one quarter: 0.75 × ${v.billsPct} + 0.25 × ${100-v.cci.index} = ${fmt1(v.raw)}, rounded to <b>${v.pct}%</b>. Each ${s.office?'signing, veto or order':'vote or sponsorship'} counts its bill's strength (a +75 bill counts 0.75), and a bill counts once.</p>`
    :`<p class="small gh-m"><b>How it was calculated:</b> ${billMath.replace(/ = (\d+)%$/,' = <b>$1%</b>')}. Each ${s.office?'signing, veto or order':'vote or sponsorship'} counts its bill's strength (a +75 bill counts 0.75), and a bill counts once.${v.cci?.why?` The Corporation Compromised Index 🏢 isn't counted: ${esc(v.cci.why.toLowerCase())}.`:''}</p>`;
  const table=v.scored.length?`<div class="tablewrap"><table><thead><tr><th>Bill</th><th>${esc(s.short)}</th><th class="r">Bill score</th><th>Delivered more for</th><th class="r">Points</th><th>Why the bill scores this way</th></tr></thead><tbody>${v.scored.map(a=>{const mk=PVP_MARKS.get(a.bill)||{},u=billUrl(a.bill);return `<tr><td>${u?`<a href="${u}" target="_blank" rel="noopener">${esc(mk.title||billLabel(a.bill))}</a>`:esc(mk.title||a.bill)}<div class="small muted">${esc(billLabel(a.bill))}</div></td><td>${esc(PVP_DID[a.kind](a.pos))}${a.kind==='statement'&&a.ref?` <a href="${esc(a.ref)}" target="_blank" rel="noopener">source ↗</a>`:''}${a.via&&a.via!==a.bill?`<div class="small muted">${esc(billLabel(a.via))}</div>`:''}</td><td class="r">${billScoreBadge(mk)}</td><td><b class="${a.took==='people'?'gr-A':'gr-F'}">${PVP_SIDE[a.took]}</b></td><td class="r">${a.points}</td><td class="small">${billWhyShort(mk)}</td></tr>`}).join('')}</tbody></table></div><p class="small muted">Every bill on file, with all its evidence and who lobbied on it: <a href="#scores-pvp">Workers > Profit scores</a>.</p>`
    :`<div class="note">${PVP_MARKS.size?`${esc(s.short)} has no recorded ${s.office?'signing, veto or executive order':'vote or sponsorship'} on any of the ${PVP_MARKS.size} scored bill${PVP_MARKS.size===1?'':'s'}.`:`<b>No bills are scored yet.</b>${points([['When a bill counts','Once a nonpartisan study of who gains from it is cited, or worker and business groups took opposite sides on it.'],['What will show here','Each scored vote and sponsorship, the side it took, and the evidence behind the bill.']])}`}</div>`;
  pane.innerHTML=`${gradeHead('Workers > Profit',v.pct,detail,gradeRule('pvp'),math+monthlyNote(s,'pvp',v.pct))}
  <div class="chart"><h3>Who the record delivered more for</h3><div class="sub"><b>Right of 50%:</b> leans toward working people. <b>Left:</b> leans toward the wealthy and corporations. <a href="#scores-pvp">Everyone on one chart</a></div>
    ${divergingRows([{label:s.name,sub:`${v.people} points for working people · ${v.profit} for the wealthy and corporations`,value:v.pct,cls:v.pct==null?'':'gr-'+letter(v.pct),note:v.pct==null?`${v.n} of ${MIN_PVP_ACTIONS} scored actions`:`${v.n} scored actions`}])}</div>
  ${cciBlock(s,v)}
  <h3 style="margin:18px 0 8px">${s.office?'Scored bills signed or vetoed, and executive orders':'Scored votes and sponsorships'}</h3>${table}
  ${s.office?`<h2 style="margin-top:30px">Their funders and their votes</h2>
  <p class="intro">Not shown for ${esc(s.short)}.</p>${points([['What it covers','Who pays for each 2026 campaign, next to the votes the candidate cast.'],['Why not here',`${esc(s.short)} is not on the 2026 ballot and casts no roll-call votes.`],['FEC records',`The committee that still files is on the <a href="#${s.id}-finance">Money &amp; Influence tab</a>.`]])}`:`${donorTreemapBlock(s)}
  <h2 style="margin-top:30px">Their funders and their votes</h2>
  <p class="intro">Who pays for ${esc(s.short)}'s campaign or spends on the race, and how those groups wanted ${esc(s.short)} to vote. Shown side by side so you can look for patterns yourself.</p>
  ${fundersBlock(s)}
  ${moneyVotesBlock(s)}`}`;
  mountFundTL(pane);mountTreemap(s);hoverTips(pane);
  bindTips(pane);
}

// The votes, bills and actions behind the match, kept in separate, labeled sections by kind of record.
// Committee seats, full committees first with their subcommittees beneath, and the sectors each one oversees.
function committeeBlock(s){
  const list=committeesOf(s), info=id=>COMMITTEES.committees[id]||{name:id};if(!list.length)return '';
  const full=[...new Set(list.map(c=>fullCommittee(c.id)))], seat=id=>list.find(c=>c.id===id);
  return `<section class="recsec" id="rec-cmte"><div class="kicker">Committee assignments</div><h3 style="margin-top:4px">Committees in the ${COMMITTEES.congress}th Congress</h3>
  <div style="margin:0 0 8px">${points([['Source',`The <a href="${esc(COMMITTEES.source)}" target="_blank" rel="noopener">congress-legislators</a> project, checked ${fmtDate(COMMITTEES.checked)}.`],['Colored tags','The sectors each committee oversees.'],['Why it matters','A stock trade in one of these sectors counts as a committee conflict on the Ethics tab. The sector list is a draft under review.']],'small')}</div>
  <ul class="list small cmte">${full.map(id=>{const c=seat(id),i=info(id),sec=(COMMITTEE_SECTORS[id]||{}).sectors||[],subs=list.filter(x=>x.id!==id&&fullCommittee(x.id)===id);
    return `<li>${i.url?`<a href="${esc(i.url)}" target="_blank" rel="noopener">${esc(i.name)} ↗</a>`:esc(i.name)}${c&&c.title?` <span class="chip ghost">${esc(c.title)}</span>`:''}${c?'':' <span class="small muted">(subcommittee seat only)</span>'}${sec.map(x=>` <span class="chip warn">${esc(x)}</span>`).join('')}${subs.length?`<div class="muted">Subcommittees: ${subs.map(x=>esc(info(x.id).name)+(x.title?` (${esc(x.title)})`:'')).join('; ')}</div>`:''}</li>`;}).join('')}</ul></section>`;
}
// Position by issue: where the record sits between liberal and conservative in each category (public/lean.js).
// Context only, never part of a grade.
function positionBlock(s){
  const cats=positionByCategory(ISS,s.evidence),shown=cats.filter(c=>c.status==='placed'||c.status==='none');
  const names=st=>cats.filter(c=>c.status===st).map(c=>c.label);
  const kind=c=>c.record?(c.stated?'actions and statements':c.n===1?'action':'actions'):c.n===1?'statement':'statements';
  const value=c=>c.lean===0?'Even':`${Math.max(c.lib,c.con)} of ${c.n}`,side=c=>c.lean===0?`${c.lib} each side`:c.lean>0?'liberal':'conservative';
  // The issues behind each category, unless the only one has the category's own name.
  const sub=c=>{const t=c.issues.map(i=>i.label).join(' · ');return t.toLowerCase()===c.label.toLowerCase()?'':t;};
  const rows=shown.map(c=>c.status==='none'?{label:c.label,sub:sub(c),lean:null,empty:'No record yet'}:
    {label:c.label,sub:sub(c),lean:c.lean,value:value(c),note:side(c),light:!c.record,
      tip:`${c.label}: of ${c.n} ${kind(c)}, ${c.lib} on the liberal side and ${c.con} on the conservative side${c.record?'':' (statements only, counted at half)'}`});
  if(!shown.some(c=>c.status==='placed'))return `<section class="recsec" id="rec-pos"><div class="kicker">Issue by issue</div><h3 style="margin-top:4px">Position by issue</h3><p class="small muted">No votes, bills or statements on the tracked issues yet for ${esc(s.short)}.</p></section>`;
  return `<section class="recsec" id="rec-pos"><div class="kicker">Issue by issue</div><h3 style="margin-top:4px">Position by issue</h3>
    ${points([['How to read it','A bar to the left means more of the record is on the liberal side of that issue, and to the right the conservative side. The longer the bar, the more consistent the record. A short bar near the center means a mixed record.'],['Based on','Votes, sponsored bills and official acts on each issue, one credit per bill. Statements count at half, and only where there is no recorded action (paler bars).'],['Context only','Never part of a grade. Which side of each issue counts as liberal is listed on the <a href="#method">Methodology</a> page.']],'small')}
    ${leanRows(rows)}
    ${points([names('unsided').length&&['Not on the scale',`${esc(names('unsided').join(', '))}. Their issues split both parties, so they aren't marked liberal or conservative.`],names('untracked').length&&['Not tracked yet',esc(names('untracked').join(', '))+'.']],'small')}
    ${tableView(['Category','Liberal side','Conservative side','Based on'],shown.map(c=>[esc(c.label),c.status==='placed'?c.lib:'—',c.status==='placed'?c.con:'—',c.status==='placed'?`${c.n} ${kind(c)}`:'No record yet']))}</section>`;
}
function recordInto(s,host){
  const inc=!s.cand;
  const SV=inc?(s.chamber==='S'?DATA.votes:[]):(s.senateVotes?DATA.votes.filter(v=>s.id in v.pos):[]);
  const HV=inc?(s.chamber==='H'?DATA.hvotes:[]):(s.ideoKind==='house'?DATA.hvotes.filter(v=>s.id in v.pos):[]);
  const ev=evidenceOf(s);
  const jump=[['rec-ideo','Ideology'],['rec-pos','Position by issue'],SV.length&&['rec-sv','Senate votes'],HV.length&&['rec-hv','House votes'],inc&&['rec-bills','Sponsored bills'],!inc&&['rec-other',recordHeading(s)],committeesOf(s).length&&['rec-cmte','Committees'],s.stateRecord&&['rec-state','State legislative record'],['live-records','Latest official records']].filter(Boolean);
  host.innerHTML=`
  <h2 id="m-record" style="margin-top:34px">The record behind the match</h2>
  <p class="intro">${inc?`${esc(s.short)}'s positions on consequential ${CH[s.chamber].name} roll calls, sponsored bills`:esc(REC_LABEL[s.recordType]||'')+'. '+esc({member_of_congress:'Positions on key House roll calls and notable sponsored bills',senator:'Positions on key Senate roll calls and notable sponsored bills',former_member_of_congress:'Votes and bills from '+s.short+"'s time in Congress",state_legislator:'Recorded votes and bills from '+s.short+"'s time in a state legislature",executive:'No legislative votes in executive office; major official actions are listed instead',none:'No legislative voting record; documented public actions and commitments are listed instead'}[s.recordType]||'')}${hasStateLeg(s)&&s.recordType!=='state_legislator'?', a separate state legislative record':''}. Your picks are compared with these. Each item links to its source.</p>
  <div class="note" style="margin-bottom:12px"><b>Evidence available:</b> ${esc(ev.label)}.</div>
  <nav class="jump small">${jump.map(([k,l])=>`<a href="#${k}">${esc(l)}</a>`).join('')}</nav>
  <div id="rec-ideo">${ideoBlock(s,'ideo2')}<div class="chart">${kvBlock(s,'kv2',true)}</div></div>
  ${positionBlock(s)}
  ${keyVotesBlock(s,SV,'Key U.S. Senate votes','rec-sv')}
  ${keyVotesBlock(s,HV,'Key U.S. House votes','rec-hv')}
  ${inc?`<section class="recsec" id="rec-bills"><div class="kicker">Congressional record</div><h3 style="margin-top:4px">Sponsored legislation</h3><p class="small" style="margin:6px 0 10px">${s.sponsoredCount?`<b class="num">${s.sponsoredCount.toLocaleString()}</b> bills, resolutions and amendments sponsored. ${esc(s.sponsoredNote)}`:esc(s.sponsoredNote)} <a href="${cgUrl(s)}" target="_blank" rel="noopener">Full list on Congress.gov ↗</a></p>
    <div class="tablewrap"><table><thead><tr><th>Measure</th><th>Title</th><th>Policy area</th><th>Introduced</th></tr></thead><tbody>${s.bills.map(b=>`<tr><td class="mono" style="white-space:nowrap"><a href="${esc(b.url)}" target="_blank" rel="noopener">${esc(b.num)}</a></td><td>${esc(b.title)}</td><td class="small">${esc(b.area)}</td><td class="mono">${esc(b.date)}</td></tr>`).join('')}</tbody></table></div></section>`:
  `<section class="recsec" id="rec-other"><div class="kicker">${esc(recordKicker(s))}</div><h3 style="margin-top:4px">${esc(recordHeading(s))}</h3>
    <div>${s.record.map(r=>`<div class="vote"><div class="d">${esc(r.date||'')}</div><div><div class="t">${esc(r.title)}</div><div class="s">${esc(r.detail)}</div><div class="s muted">${esc(r.area||'')}${r.src?` · <a href="${esc(r.src.u)}" target="_blank" rel="noopener">${esc(r.src.t)} ↗</a>`:''}${(r.more||[]).map(m=>` · <a href="${esc(m.u)}" target="_blank" rel="noopener">${esc(m.t)} ↗</a>`).join('')}</div></div><div class="pos"><span class="chip ${posClass(r.position)}">${esc(r.position||'')}</span></div></div>`).join('')}</div></section>`}
  ${committeeBlock(s)}
  <div id="rec-state">${stateRecordBlock(s)}</div>
  <section id="live-records" style="margin-top:28px"></section>`;
  mountIdeo('ideo2',s);
  mountKV('kv2',s);
  host.querySelectorAll('#rec-sv,#rec-hv').forEach(sec=>{const V=sec.id==='rec-sv'?SV:HV;const f=sec.querySelector('[data-vf]'),L=sec.querySelector('[data-vl]');
    const draw=a=>{L.innerHTML=V.filter(v=>!a||v.area===a).slice().sort((x,y)=>y.date.localeCompare(x.date)).map(v=>{const p=v.pos[s.id]||'—';return `<div class="vote"><div class="d">${v.date}</div><div><div class="t"><a href="${voteUrl(v)}" target="_blank" rel="noopener">${esc(v.short)}</a></div><div class="s">${esc(v.issue)} · ${esc(v.result)}</div><div class="s muted">${esc(v.area)}</div><div class="s" style="margin:4px 0">${leanTag(v)}</div>${billDetails(v)}</div><div class="pos">${voteText(v,p)}</div></div>`}).join('');};
    draw('');f.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;f.querySelector('.active').classList.remove('active');b.classList.add('active');draw(b.dataset.a);});});
  host.querySelectorAll('.jump a').forEach(a=>a.addEventListener('click',e=>{e.preventDefault();const t=document.getElementById(a.getAttribute('href').slice(1));if(t)t.scrollIntoView({behavior:'smooth',block:'start'});}));
  bindTips(host);
  window.RecordLive.profile(s,host.querySelector('#live-records'),['legislation','cosponsored','crs','official-acts','stateBills','committees','votes']);
}

// ---------- Promises Delivered tab: the grade, then every statement check behind it ----------
// For a president: PolitiFact's promise trackers, each tally as a bar, with sourced examples of each rating.
const PF_RATING={kept:['good','✓','Promise Kept'],compromise:['warn','◐','Compromise'],broken:['crit','✕','Promise Broken'],stalled:['neutral','…','Stalled'],inTheWorks:['neutral','…','In the Works']};
function trackerBlock(s){
  const T=s.promiseTrackers||[];if(!T.length)return '';
  const seg=(n,col)=>n?`<i style="flex:${n};background:${col}"></i>`:'';
  return `<h2 id="p-trackers" style="margin-top:6px">PolitiFact promise trackers</h2>
  <p class="intro">${esc(s.short)}'s promise grade uses PolitiFact's own ratings.</p>${points([['What PolitiFact checks',`Each campaign promise against what happened, including the executive orders and bills ${esc(s.short)} signed or vetoed.`],['How each rating counts','Promise Kept 1, Compromise ½, Promise Broken 0. The same as the checks on other profiles.'],['Not counted yet','Stalled and In the Works. They wait for a final rating.']])}
  ${T.map(t=>{const c=t.counts,rated=(c.kept||0)+(c.compromise||0)+(c.broken||0),waiting=(c.stalled||0)+(c.inTheWorks||0);
    return `<div class="chart pf-tracker"><h3>${esc(t.name)} <span class="muted" style="font-weight:600">· ${esc(t.term)}</span></h3>
    <div class="sub">${esc(t.rater)} · ratings ${t.final?'':'as of '}${esc(t.asOf)} · <a href="${esc(t.url)}" target="_blank" rel="noopener">Every promise on PolitiFact ↗</a></div>
    <div class="hc-seg pf-bar" role="img" aria-label="${esc(`${t.name}: ${c.kept||0} kept, ${c.compromise||0} compromise, ${c.broken||0} broken${waiting?`, ${waiting} stalled or in the works`:''}`)}">${seg(c.kept,'var(--good)')}${seg(c.compromise,'var(--warn)')}${seg(c.broken,'var(--crit)')}${seg(c.stalled,'var(--muted)')}${seg(c.inTheWorks,'var(--line-2)')}</div>
    <ul class="pf-tally">${['kept','compromise','broken','stalled','inTheWorks'].filter(k=>c[k]!=null).map(k=>{const [cls,ic,lab]=PF_RATING[k];return `<li><span class="chip ${cls}">${ic} ${lab}</span><b class="num">${c[k]}</b></li>`}).join('')}</ul>
    <p class="small muted" style="margin:6px 0 0">${esc(t.about)} <b>Counted here:</b> ${rated} with a final rating${waiting?`; ${waiting} not counted yet`:''}.</p>
    ${t.examples?.length?`<h4 style="margin:14px 0 6px">Examples</h4><ul class="pf-ex">${t.examples.map(x=>{const [cls,ic,lab]=PF_RATING[x.rating];return `<li><span class="chip ${cls}">${ic} ${lab}</span><div><b>${esc(x.title)}</b><div class="small" style="color:var(--ink-2);margin-top:2px">${esc(x.did)}</div><div class="small" style="margin-top:2px">${x.action?`<a href="${esc(x.action.u)}" target="_blank" rel="noopener">${esc(x.action.t)} ↗</a> · `:''}<a href="${esc(x.url)}" target="_blank" rel="noopener">${esc(x.urlT||'PolitiFact rating')} ↗</a></div></div></li>`}).join('')}</ul><p class="small muted" style="margin:6px 0 0">A sample of the ratings. The tally above counts all ${rated+waiting} promises.</p>`:''}
    <p class="small" style="margin:8px 0 0"><b>Source:</b> <a href="${esc(t.src.u)}" target="_blank" rel="noopener">${esc(t.src.t)} ↗</a>${t.also?` · <a href="${esc(t.also.u)}" target="_blank" rel="noopener">${esc(t.also.t)} ↗</a>`:''}</p></div>`}).join('')}`;
}
// Under a money pledge (a statement tagged "pledge"): what the records on file show now (public/pledges.js). Shown only;
// the reviewed verdict above it is the one the Promise score counts.
const PLEDGE_CHIP={kept:['good','✓'],'not-kept':['crit','✕'],mixed:['warn','◐'],against:['warn','◐'],waiting:['neutral','…'],none:['neutral','…']};
function pledgeBlock(s,x){
  const c=pledgeCheck(DATA,s,x);if(!c)return '';
  const [cls,icon]=PLEDGE_CHIP[c.outcome];
  // Only the reports on file are read, so "after the pledge" names the dates they cover.
  const when=c.span?`in the ${c.span.n} report${c.span.n===1?'':'s'} on file${c.since?' after the pledge':''} (${period(c.span.start,c.span.end)})`:c.since?`in the reports on file after ${fmtDate(c.since)}`:'in the reports on file';
  const pacList=rows=>{const top=rows.slice().sort((a,b)=>b.amount-a.amount);
    return `<ul class="list small" style="margin:4px 0 0">${top.slice(0,6).map(r=>`<li>${orgName(r.name,ORGS.about(r.name,'pac'))}: ${fmtFull(r.amount)}${r.report?` (${r.url?`<a href="${esc(r.url)}" target="_blank" rel="noopener">${esc(r.report)} ↗</a>`:esc(r.report)})`:''}</li>`).join('')}${top.length>6?`<li>${top.length-6} more, on the Money &amp; Influence tab</li>`:''}</ul>`;};
  let body;
  if(c.totals){
    const corp=c.kind==='corporate-pac',n=c.counted.after.length;
    body=points([
      [corp?'Company PACs':'Ideological PACs',`${n?`${fmtFull(c.totals.after)} from ${n} contribution${n===1?'':'s'} ${when}`:`none ${when}`}${corp?'. These are PACs the FEC records as sponsored by a corporation.':'. These are PACs in this app\'s "ideological, single-issue and advocacy" sector, assigned from their names.'}${n?pacList(c.counted.after):''}`],
      c.totals.during?['In the report covering the pledge date',`${fmtFull(c.totals.during)}. A report can't be split by day, so it is shown here and decides nothing.`]:null,
      c.totals.beside?['Trade and membership groups\' PACs',`${fmtFull(c.totals.beside)} ${when}. Listed, not counted: they are funded by a group's members, not by one company.`]:null,
      c.totals.unknown?['No FEC type on file yet',`${fmtFull(c.totals.unknown)} from ${c.unknown.after.length+c.unknown.during.length} contribution${c.unknown.after.length+c.unknown.during.length===1?'':'s'} ${when}. These PACs haven't been matched to their FEC registration yet, so a company's PAC can't be told apart from a trade group's.`]:null,
      ...c.bundled.map(b=>[`Bundled through ${esc(b.org)}`,`${fmtFull(b.amount)} ${b.when==='undated'?'(the months weren\'t saved, so it decides nothing)':b.when==='during'?'in the month of the pledge (decides nothing)':b.when}. <a href="${esc(b.src)}" target="_blank" rel="noopener">FEC ↗</a>`]),
      c.refunded.length?['Returned',c.refunded.map(r=>`${esc(r.name)} ${fmtFull(r.amount)}`).join('; ')+', not counted.']:null,
      ['How it\'s checked',`Each FEC report that starts on or after the pledge date counts${c.since?'':' (here, every report on file, because the statement covers the whole campaign)'}. ${corp?'Only PACs sponsored by a corporation count; leadership PACs, unions and trade groups don\'t.':'Gifts a group bundled from its donors through its PAC count too.'}`]],'small');
  }else{
    const a=c.actions;
    body=a.length?`<ul class="list small" style="margin:4px 0 0">${a.map(r=>`<li><b>${r.way==='for'?'Backed':'Against'}:</b> ${esc(r.what)} ${esc(r.measure)}, ${esc(r.title)}${r.date?` (${fmtDate(r.date)})`:''}. <a href="${esc(r.src.u)}" target="_blank" rel="noopener">${esc(r.src.t)} ↗</a></li>`).join('')}</ul>`
      :`<p class="small" style="margin:4px 0 0">No sponsorship, cosponsorship or vote on the ${c.bills.length} bill${c.bills.length===1?'':'s'} on file for this.</p>`;
    body+=points([['How it\'s checked',`Sponsoring, cosponsoring or voting for one of the bills on the Bills page that would ${c.kind==='stock-trading'?'ban or limit members\' stock trading':c.kind==='lobbying'?'ban lobbying by former members':'overturn Citizens United'} counts as backing it. A vote against one is weighed with the reason given (for example, a section the bill carried on something else), so it is reviewed rather than counted as a broken pledge.`]],'small');
  }
  return `<div class="note small" style="margin-top:12px"><div class="k" style="margin-bottom:6px"><b>Checked against the records on file · ${esc(c.label)}</b> <span class="chip ${cls}">${icon} ${esc(c.outcomeLabel)}</span></div>${body}
    ${c.conflict?`<p class="small" style="margin:8px 0 0"><b>Flagged for review:</b> the records point the other way from the reviewed verdict above. The reviewed verdict is still the one counted until it's checked again.</p>`:''}
    <p class="small muted" style="margin:6px 0 0">Shown only. The verdict above is the reviewed one, and it is the one the grade counts.</p></div>`;
}
function panePromises(s,pane){
  const pr=SCORER.promises(s), out=pr.notCounted, pf=!!(s.promiseTrackers||[]).length;
  const detail=pf&&pr.pct!=null?`${pr.kept} of ${pr.clear} promises with a final PolitiFact rating kept, ${pr.half} compromises, ${pr.broken} broken.`:pr.pct!=null?`${pr.kept} of ${pr.clear} clear checks kept${pr.half?`, ${pr.half} partly kept or changed over time`:''}${pr.broken?`, ${pr.broken} contradicted by the record`:''}.`:pr.total?`${pr.clear} clear check${pr.clear===1?'':'s'} so far; a grade needs ${MIN_CHECKS}.`:'No statements checked yet.';
  const bar=pr.pct!=null?`<div class="hc-seg gh-bar" aria-hidden="true">${pr.kept?`<i style="flex:${pr.kept};background:var(--good)"></i>`:''}${pr.half?`<i style="flex:${pr.half};background:var(--warn)"></i>`:''}${pr.broken?`<i style="flex:${pr.broken};background:var(--crit)"></i>`:''}</div>`:'';
  const math=pf&&pr.pct!=null?`<p class="small gh-m"><b>How it was calculated:</b> (${pr.kept} kept + ${pr.half} × ½ compromise) ÷ ${pr.clear} promises with a final rating = <b>${pr.pct}%</b>.${out?` ${out} Stalled or In the Works ${out===1?'is':'are'} not counted yet.`:''}</p>`
    :pr.pct!=null?`<p class="small gh-m"><b>How it was calculated:</b> (${pr.kept} kept${pr.half?` + ${pr.half} × ½ partly kept or changed`:''}) ÷ ${pr.clear} clear checks = <b>${pr.pct}%</b>.${out?` ${out} ambiguous or outcome check${out===1?' is':'s are'} listed below but not counted.`:''}</p>`:'';
  pane.innerHTML=`
  ${gradeHead('Promises Delivered',pr.pct,detail,gradeRule('prom'),bar+math+monthlyNote(s,'promises',pr.pct))}
  ${trackerBlock(s)}
  ${pf&&!s.statements.length?'':`<p class="intro">Each check pairs something ${esc(s.short)} said or promised with what the record shows. The label rates that match, not whether the policy is good.</p>
  <dl class="legendlist small">
    <div><dt><span class="chip good">✓ Consistent</span></dt><dd>The action matches the statement.</dd></div>
    <div><dt><span class="chip crit">✕ Direct contradiction</span></dt><dd>The record directly conflicts with what was said.</dd></div>
    <div><dt><span class="chip warn">◐ Partly consistent</span></dt><dd>Part of the record matches the statement, and part conflicts with it.</dd></div>
    <div><dt><span class="chip neutral">? Ambiguous or incomplete evidence</span></dt><dd>The statement and the action point different ways, but whether they conflict depends on how you read them. Or the evidence is incomplete.</dd></div>
    <div><dt><span class="chip serious">↻ Changed position</span></dt><dd>A clear or admitted reversal over time.</dd></div>
    <div><dt><span class="chip neutral">◇ Outcome check</span></dt><dd>The action fit the reasons given at the time, but later events bear on it.</dd></div>
    <div><dt><span class="chip neutral">… No related bill yet</span></dt><dd>Nothing has come up to act on yet. Not counted until something does.</dd></div>
  </dl>
  <div style="margin:0 0 10px">${points([['How each check counts','Consistent 1. Partly consistent or changed ½. Contradicted 0.'],['Not acted on',`A promise ${esc(s.short)} could have acted on but didn't by the end of the term is closed as contradicted.`],['Vague goals',`Such as "fight for families." Listed but never scored.${pr.vague?` ${pr.vague} ${pr.vague>1?'are':'is'} listed below.`:''}`]],'small')}</div>
  ${s.statements.map(x=>{const [cls,lab]=ASSESS[x.assessment];return `
  <article class="stmt ${x.assessment}">
    <h3>${esc(x.topic)}${x.promise?' <span class="chip ghost">Promise</span>':''}${x.vague?' <span class="chip ghost">Vague goal · not scored</span>':''}</h3>
    <div class="sd">
      <div><div class="k">What was said</div><div>${esc(x.said.text)}</div><div class="src">${esc(x.said.date)} · <a href="${esc(x.said.src.u)}" target="_blank" rel="noopener">${esc(x.said.src.t)} ↗</a></div></div>
      <div><div class="k">What the record shows</div><div>${esc(x.did.text)}</div><div class="src">${esc(x.did.date)} · <a href="${esc(x.did.src.u)}" target="_blank" rel="noopener">${esc(x.did.src.t)} ↗</a></div></div>
    </div>
    ${x.record?`<div class="small" style="margin-top:10px;color:var(--ink-2)"><b>Context:</b> ${esc(x.record)} ${x.recordSrc?`<a href="${esc(x.recordSrc.u)}" target="_blank" rel="noopener">${esc(x.recordSrc.t)} ↗</a>`:''}</div>`:''}
    ${x.unacted?`<div class="small" style="margin-top:10px;color:var(--ink-2)"><b>Not acted on by the end of the term</b>${x.unacted.date?` (${esc(x.unacted.date)})`:''}: ${esc(x.unacted.reason||'')}</div>`:''}
    <div class="verdict"><span class="chip ${cls}">${AICON[x.assessment]} ${lab}</span><div class="note">${esc(x.note)}</div></div>
    ${pledgeBlock(s,x)}
  </article>`}).join('')}`}
  <section id="live-records" style="margin-top:28px"></section>`;
  window.RecordLive.profile(s,pane.querySelector('#live-records'),['crec-day','hearings','statements','votesmart','wayback','platform','factcheck','news']);
}

function paneSources(s,pane){
  const list=[];
  list.push({t:'FEC candidate financial summary ('+s.fecCand+')',u:fecCandUrl(s.fecCand)});
  list.push({t:'FEC filings, '+s.cmteName+' ('+s.fecCmte+')',u:`https://docquery.fec.gov/cgi-bin/forms/${s.fecCmte}/`});
  list.push({t:'FEC independent expenditures for this candidate',u:fecIeUrl(s.fecCand)});
  if(s.ideo&&s.ideo.icpsr)list.push({t:'Voteview DW-NOMINATE record',u:`https://voteview.com/person/${s.ideo.icpsr}`});
  if(s.ideoSrc)list.push(s.ideoSrc);
  if(s.statusSrc)list.push(s.statusSrc);
  (s.record||[]).forEach(r=>{if(r.src)list.push(r.src)});
  s.out.cms.forEach(x=>{const m=cmOf(x[0]);if(m[4])list.push({t:m[1]+': affiliation source',u:m[4]})});
  s.pac.filings.forEach(f=>list.push({t:'FEC report '+f.report+' ('+f.start+' to '+f.end+'), Schedule A line 11C',u:f.url}));
  if(s.camp.src)list.push({t:'FEC committee summary, 2025–26: '+(s.camp.cmte||s.fecCmte),u:s.camp.src});
  s.statements.forEach(x=>{list.push(x.said.src);list.push(x.did.src);if(x.recordSrc)list.push(x.recordSrc)});
  s.ethics.forEach(e=>e.sources.forEach(x=>list.push(x)));
  s.bills.forEach(b=>list.push({t:b.num+' — '+b.title,u:b.url}));
  if(s.stateRecord){s.stateRecord.service.forEach(x=>{if(x.src)list.push(x.src)});s.stateRecord.items.forEach(x=>{if(x.src)list.push(x.src)});}
  {const r=raceOf(s);if(r&&r.rating&&r.rating.src)list.push(r.rating.src);}
  const seen=new Set();const uniq=list.filter(x=>x&&x.u&&!seen.has(x.u)&&seen.add(x.u));
  pane.innerHTML=`<h2>Sources for this profile</h2><p class="intro">${uniq.length} distinct records and reports. Roll-call votes link to their official tallies from the Your match tab; every independent expenditure links to its FEC filing from the Money &amp; Influence tab.</p><ul class="list">${uniq.map(x=>`<li><a href="${esc(x.u)}" target="_blank" rel="noopener">${esc(x.t)}</a> <span class="small muted mono">${esc(x.u.replace(/^https?:\/\//,'').split('/')[0])}</span></li>`).join('')}</ul>`;
}

// ---------- races ----------
const ratingLine=r=>r.rating&&r.rating.cook?`<div class="rating"><span>Cook: <b>${esc(r.rating.cook)}</b></span><span>Inside Elections: <b>${esc(r.rating.ie)}</b></span><span>Sabato: <b>${esc(r.rating.sabato)}</b></span>${r.rating.note?`<span class="muted">${esc(r.rating.note)}</span>`:''}</div>`:(r.rating&&r.rating.note?`<div class="rating muted">${esc(r.rating.note)}</div>`:'');
function raceCard(r){
  const C=r.keys.map(k=>byId[k]);
  const row=(lab,f)=>`<tr><td class="k">${lab}</td>${C.map(s=>`<td>${f(s)}</td>`).join('')}</tr>`;
  const multi=C.some(s=>s.out.multi);
  return `<article class="race">
    <div class="rh"><h3>${esc(r.label)}${r.competitive&&r.chamber==='S'?' <span class="chip warn" style="vertical-align:middle">Competitive</span>':''}</h3><span class="small muted">${r.open?'Open seat':'Incumbent running'} · outside spending on all candidates: <b class="num">${fmt$(r.ieTotal)}</b></span></div>
    ${ratingLine(r)}
    <div class="tablewrap"><table>
      <thead><tr><th></th>${C.map(s=>`<th>${s.id===r.inc?'Incumbent':(r.open?partyName(s.party):'Challenger')}</th>`).join('')}</tr></thead>
      <tbody>
      ${row('Candidate',s=>`<a href="#${s.id}"><b>${esc(s.name)}</b></a> <span class="chip ${s.party}">${s.party}</span>`)}
      ${row('Record',s=>esc(s.cand?(REC_LABEL[s.recordType]||''):'U.S. '+CH[s.chamber].name)+((s.ideo||s.ideoKind==='former_text'||s.ideoKind==='state'||hasStateLeg(s))?`<div class="small muted">${esc(ideoText(s).short)}</div>`:''))}
      ${row('Evidence available',s=>`<span class="small">${esc(evidenceOf(s).label)}</span> <a class="small" href="#${s.id}-record">record →</a>`)}
      ${row(term('receipts','Campaign funds raised'),s=>s.camp.missing?'<span class="muted">No FEC report yet</span>':`${fmtFull(s.camp.receipts)}<div class="small muted">${period(s.camp.start,s.camp.end)}</div>${s.camp.selfShare>20?`<div>${flag(s.camp.selfShare+'% self-funded','Candidate loans and contributions as a share of campaign funds.')}</div>`:''}`)}
      ${row('Cash on hand',s=>s.camp.missing?'<span class="muted">—</span>':`${fmtFull(s.camp.cash)}<div class="small muted">on ${fmtDate(s.camp.end)}</div>`)}
      ${row(term('ie',multi?'Outside spending supporting':'Outside spending for'),s=>`${fmtFull(s.out.for.total)}<div class="small muted">${CLS.filter(k=>s.out.for[k]).map(k=>CLSL[k]+' '+fmt$(s.out.for[k])).join(' · ')||'none'}</div>`)}
      ${row(term('ie',multi?'Outside spending opposing':'Outside spending against'),s=>`${fmtFull(s.out.against.total)}<div class="small muted">${CLS.filter(k=>s.out.against[k]).map(k=>CLSL[k]+' '+fmt$(s.out.against[k])).join(' · ')||'none'}</div>`)}
      ${row('Largest outside spenders '+(multi?'supporting':'for'),s=>topSpenders(s,'for',3).map(x=>esc(x.name)).join(', ')||'<span class="muted">None</span>')}
      </tbody></table></div>
    <p class="small muted" style="margin:8px 0 0"><b>Kept separate:</b> campaign funds and outside spending. Outside spending never passes through a campaign, and the two cover different dates (outside spending runs through ${fmtDate(DATA.ie_asof)}).</p>
    ${evidenceNote(C)?`<p class="small" style="margin:6px 0 0;color:var(--ink-2)"><b>Comparing records:</b> ${evidenceNote(C)}</p>`:''}
    ${r.note?`<p class="small" style="margin:6px 0 0;color:var(--ink-2)">${esc(r.note)}</p>`:''}
    <p class="small" style="margin:8px 0 0">${C.map(s=>`<a href="${fecCandUrl(s.fecCand)}" target="_blank" rel="noopener">FEC: ${esc(s.short)} ↗</a>`).join(' · ')}</p>
  </article>`;
}
function liteCard(r){
  const N=r.nominees;
  const row=(lab,f)=>`<tr><td class="k">${lab}</td>${N.map(n=>`<td>${f(n)}</td>`).join('')}</tr>`;
  return `<article class="race lite"><div class="rh"><h3>${esc(r.label)} <span class="chip warn" style="vertical-align:middle">Toss-up</span></h3><span class="small muted">Outside spending on all candidates: <b class="num">${fmt$(r.ieTotal)}</b></span></div>
    <div class="rating"><span>Cook: <b>${esc(r.ratings.cook)}</b></span><span>Inside Elections: <b>${esc(r.ratings.ie)}</b></span><span>Sabato: <b>${esc(r.ratings.sabato)}</b></span></div>
    <div class="note small" style="margin:8px 0"><b>Funding only:</b> full profiles (record, statements, ethics, alignment) are not built for this race yet.</div>
    <div class="tablewrap"><table><thead><tr><th></th>${N.map(n=>`<th>${n.incumbent?'Incumbent':partyName(n.party)}</th>`).join('')}</tr></thead><tbody>
    ${row('Nominee',n=>`<b>${esc(n.name)}</b> <span class="chip ${n.party}">${n.party}</span><div class="small muted">${esc(n.basis||'')} ${n.src?`<a href="${esc(n.src.u)}" target="_blank" rel="noopener">source ↗</a>`:''}</div>`)}
    ${row(term('receipts','Campaign funds raised'),n=>n.receipts!=null?`${fmtFull(n.receipts)}<div class="small muted">2025–26, through ${fmtDate(n.through)} (FEC totals via the Follow the Money compilation)</div>`:`<span class="muted">${esc(n.campNote)}</span>`)}
    ${row('Cash on hand',n=>n.cash!=null?`${fmtFull(n.cash)}<div class="small muted">on ${fmtDate(n.through)}</div>`:'<span class="muted">—</span>')}
    ${row(term('ie','Outside spending for'),n=>`${fmtFull(n.out.for.total)}<div class="small muted">${CLS.filter(k=>n.out.for[k]).map(k=>CLSL[k]+' '+fmt$(n.out.for[k])).join(' · ')||'none'}</div>`)}
    ${row(term('ie','Outside spending against'),n=>`${fmtFull(n.out.against.total)}<div class="small muted">${CLS.filter(k=>n.out.against[k]).map(k=>CLSL[k]+' '+fmt$(n.out.against[k])).join(' · ')||'none'}</div>`)}
    </tbody></table></div>
    <p class="small" style="margin:8px 0 0">${N.map(n=>`<a href="${fecCandUrl(n.fecCand)}" target="_blank" rel="noopener">FEC: ${esc(n.name)} ↗</a>`).join(' · ')} · <a href="${fecIeUrl(N[0].fecCand)}" target="_blank" rel="noopener">FEC independent expenditures ↗</a></p>
    ${N.some(n=>n.out.possibleRepeat)?'<p class="small muted" style="margin:6px 0 0">Outside-spending totals include items flagged as possible repeat filings.</p>':''}
  </article>`;
}
function renderRaces(){
  const S=DATA.races.filter(r=>r.chamber==='S'), H=DATA.races.filter(r=>r.chamber==='H');
  app.innerHTML=`
  <section class="hero" style="padding-bottom:10px"><div class="asof">2026 general election · outside spending through ${fmtDate(DATA.ie_asof)}</div><h1 style="margin-top:8px">The races</h1>
  <p class="lede">Every profiled candidate next to their 2026 opponents. Competitive races come first.</p>${points([['Money','Campaign funds and outside spending are separate rows, each with its own dates.'],['Records','Each candidate\'s kind of record is labeled, so like is compared with like.']],'lede-pts')}
  <div class="toolbar"><div class="seg" id="rs"><button data-c="S" class="active">Senate (${S.length})</button><button data-c="H">House (${H.length+DATA.liteRaces.length})</button></div>
  <label class="small muted">Jump to <select id="rj">${S.concat(H).concat(DATA.liteRaces.map(r=>({id:r.id,label:r.label,chamber:'H'}))).map(r=>`<option value="${r.id}">${esc(r.label)}</option>`).join('')}</select></label></div></section>
  <div id="rlist"></div>`;
  const draw=ch=>{const L=DATA.races.filter(r=>r.chamber===ch);
    $('#rlist').innerHTML=ch==='S'?`<h2 style="margin-top:8px">Competitive Senate races</h2><p class="small muted" style="margin:4px 0 0;max-width:80ch">Every race rated Toss-up, Tilt or Lean by at least one forecaster is covered.</p>${points([['Forecasters','The Cook Political Report, Inside Elections and Sabato\'s Crystal Ball.'],['Ratings',`Sept. 17–23, 2026, as compiled on <a href="https://en.wikipedia.org/wiki/2026_United_States_Senate_elections" target="_blank" rel="noopener">Wikipedia</a>.`]],'small')}${L.filter(r=>r.competitive).map(r=>`<div id="r-${r.id}">${raceCard(r)}</div>`).join('')}<h2 style="margin-top:26px">Other Senate races covered</h2>${L.filter(r=>!r.competitive).map(r=>`<div id="r-${r.id}">${raceCard(r)}</div>`).join('')}`
      :`<h2 style="margin-top:8px">House toss-ups with full profiles</h2><p class="small muted" style="margin:4px 0 0;max-width:80ch">Eight of the ${L.length+DATA.liteRaces.length} House races the Cook Political Report rates Toss-up (Sept. 25, 2026). Both nominees have full profiles.</p>${L.map(r=>`<div id="r-${r.id}">${raceCard(r)}</div>`).join('')}
        <h2 style="margin-top:26px">Other House toss-ups: funding only</h2><p class="small muted" style="margin:4px 0 0;max-width:80ch">The other ${DATA.liteRaces.length} Cook toss-ups.</p>${points([['Shown','Verified nominees, campaign funds and outside spending.'],['Not yet researched','Records, statements and ethics. These candidates have no profiles yet.']],'small')}${DATA.liteRaces.map(r=>`<div id="r-${r.id}">${liteCard(r)}</div>`).join('')}`;
    bindTips(app);};
  draw('S');
  $('#rs').addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;$('#rs .active').classList.remove('active');b.classList.add('active');draw(b.dataset.c);});
  $('#rj').addEventListener('change',e=>{const r=DATA.races.find(x=>x.id===e.target.value)||Object.assign({chamber:'H'},DATA.liteRaces.find(x=>x.id===e.target.value));const want=r.chamber;const cur=$('#rs .active').dataset.c;if(cur!==want){$('#rs .active').classList.remove('active');$(`#rs button[data-c="${want}"]`).classList.add('active');draw(want);}document.getElementById('r-'+r.id).scrollIntoView({behavior:'smooth',block:'start'});});
}

// ---------- bills ----------
// Every bill on file (public/bills.js): the bills behind the saved roll calls and the Workers > Profit bills, split into
// those that became law and those that haven't (or were reintroduced), each with the groups that took a side on it.
let billQ='';
const BILL_SEG=[['all','All'],['law','Became law'],['not','Not passed or reintroduced']];
const posDate=d=>!d?'':/^\d{4}-\d{2}-\d{2}$/.test(d)?fmtDate(d):/^\d{4}-\d{2}$/.test(d)?monLabel(d):d;
function billGroupLine(p){
  const g=groupInfo(DATA,p.group),tags=[];
  if(g.pac>0)tags.push(`PACs gave ${fmt$(g.pac)} to campaigns here`);
  if(g.routed>0)tags.push(`Bundled ${fmt$(g.routed)} from its donors here`);
  if(g.out>0)tags.push(`${fmt$(g.out)} in outside spending here`);
  if(!g.pac&&!g.routed&&!g.out)tags.push(g.pacs?'Has PACs; none gave to campaigns here':'Advocacy group; no PAC on file');
  const src=p.src?.u?` <a href="${esc(p.src.u)}" target="_blank" rel="noopener" title="${esc(p.src.t||'Source')}">Source ↗</a>`:'';
  return `<li><b${g.about?` data-tip="${esc(`${g.org}: ${g.about}`)}" class="org"`:''}>${esc(g.org)}</b> ${tags.map(t=>`<span class="tag">${esc(t)}</span>`).join(' ')}<div class="small muted">${esc(p.why||'')}${p.date?` (${esc(posDate(p.date))})`:''}${src}</div></li>`;
}
function billCard(e){
  const u=billUrl(e.id),nums=e.keys.map(billLabel);
  const sup=e.positions.filter(p=>p.pos==='support'),opp=e.positions.filter(p=>p.pos==='oppose');
  const here=[...new Set([...(e.work?.cosponsors||[]),...(e.cosponsors||[])].map(c=>c.person))].filter(id=>byId[id]).map(id=>`<a href="#${id}-${e.issue?'match':'pvp'}">${esc(byId[id].short||byId[id].name)}</a>`);
  const statusSrc=e.statusSrc?` <a href="${esc(e.statusSrc.u)}" target="_blank" rel="noopener" title="${esc(e.statusSrc.t)}">Source ↗</a>`:'';
  const status=e.status==='law'?`<b class="gr-A">Became law</b>: ${esc(e.law)}, signed ${fmtDate(e.date)}.${statusSrc}`:`<b>${e.reintroduced?'Not passed; reintroduced':'Not passed'}</b>: ${esc(e.stage)}${statusSrc}`;
  const tally=v=>{const c={};for(const x of Object.values(v.pos||{}))if(/^(Yea|Nay|Aye|No)$/.test(x))c[x==='Aye'?'Yea':x==='No'?'Nay':x]=(c[x==='Aye'?'Yea':x==='No'?'Nay':x]||0)+1;return c.Yea||c.Nay?` · people on this site: ${c.Yea||0} yes, ${c.Nay||0} no`:'';};
  const votes=e.votes.map(v=>`<li>${esc(v.chamber)}, ${fmtDate(v.date)}: ${esc(v.question||v.bill?.voteQuestion||'Vote')}, <b>${esc(v.result)}</b> <a href="${esc(voteUrl(v))}" target="_blank" rel="noopener">Roll call ↗</a><span class="muted">${tally(v)}</span></li>`)
    .concat((e.steps||[]).map(x=>`<li>${esc(x.text)}${x.src?` <a href="${esc(x.src.u)}" target="_blank" rel="noopener" title="${esc(x.src.t)}">Source ↗</a>`:''}</li>`));
  return `<article class="card bill-card" id="bill-${esc(e.id)}">
    <div class="bill-head"><h3>${u?`<a href="${u}" target="_blank" rel="noopener">${esc(e.title)}</a>`:esc(e.title)}</h3>${e.area?`<span class="tag">${esc(e.area)}</span>`:''}${e.work?`<span class="tag" title="Workers > Profit bill score">Workers > Profit: ${e.work.status==='scored'?signed(e.work.score):'not scored'}</span>`:''}</div>
    <div class="small muted">${nums.map(esc).join(' · ')}</div>
    <p class="small" style="margin:8px 0 0">${status}</p>
    ${e.summary?`<p class="small" style="margin:6px 0 0">${esc(e.summary)}${e.summarySrc?.u?` <a href="${esc(e.summarySrc.u)}" target="_blank" rel="noopener" title="${esc(e.summarySrc.t||'')}">Source ↗</a>`:''}</p>`:''}
    ${e.note?`<p class="small muted" style="margin:6px 0 0">${esc(e.note)}</p>`:''}
    <div class="bill-sides">
      <div><h4 class="gr-A">Supported it (${sup.length})</h4>${sup.length?`<ul class="list small">${sup.map(billGroupLine).join('')}</ul>`:'<p class="small muted">No position on file.</p>'}</div>
      <div><h4 class="gr-F">Opposed it (${opp.length})</h4>${opp.length?`<ul class="list small">${opp.map(billGroupLine).join('')}</ul>`:'<p class="small muted">No position on file.</p>'}</div>
    </div>
    ${votes.length?`<details class="small" style="margin-top:8px"><summary>Votes (${votes.length})</summary><ul class="list">${votes.join('')}</ul></details>`:''}
    ${here.length?`<p class="small" style="margin:6px 0 0"><b>Sponsors and cosponsors on this site:</b> ${here.join(', ')}</p>`:''}
    ${e.issue?`<p class="small muted" style="margin:6px 0 0"><b>Counts in Your match</b> under "${esc(ISSBY[e.issue]?.label||e.issue)}": sponsoring or cosponsoring it counts toward "${esc(ISSBY[e.issue]?.[e.side]||e.side)}".</p>`:''}
    <div class="small" style="margin-top:6px" data-lob="${esc(e.id)}"></div>
  </article>`;
}
function renderBills(seg){
  if(!BILL_SEG.some(([k])=>k===seg))seg='all';
  const F=billFamilies(DATA,PVP_BILLS),law=F.filter(e=>e.status==='law'),not=F.filter(e=>e.status!=='law');
  const groups=new Set(F.flatMap(e=>e.positions.map(p=>p.group)));
  app.innerHTML=`<section class="hero" style="padding-bottom:10px"><div class="asof">${F.length} bills · ${law.length} became law · ${not.length} not passed or reintroduced</div><h1 style="margin-top:8px">Bills</h1>
    <p class="lede">Every bill collected so far: the bills behind the saved roll calls and the bills scored for Workers > Profit, with the groups that supported or opposed each one.</p>
    ${points([['Supported and opposed','Positions from the groups\' own scorecards, key-vote letters and statements, each with its source: '+groups.size+' groups so far, including Heritage Action, the ACLU, the League of Conservation Voters and the Human Rights Campaign.'],['Money','Beside each group, what its PACs gave to the campaigns on this site and what it spent on outside ads, from FEC records. A group with no PAC lobbies but gives no campaign money tracked here.'],['Versions','A bill reintroduced in a later Congress, or its Senate companion, is listed once with all its numbers.'],['Not graded here','This page lists bills. Grades count votes and sponsorships on them as described in the <a href="#method">methodology</a>.']])}
    <div class="toolbar"><div class="seg" id="bill-seg">${BILL_SEG.map(([k,l])=>`<button data-k="${k}" class="${k===seg?'active':''}">${esc(l)} (${k==='all'?F.length:k==='law'?law.length:not.length})</button>`).join('')}</div>
    <div class="search"><input id="bill-q" type="search" placeholder="Search by name, number, topic or group" aria-label="Search bills" value="${esc(billQ)}"></div></div></section>
    <section class="section" style="padding-top:6px" id="bill-list"></section>`;
  const text=e=>[e.title,...e.keys.map(billLabel),e.area,e.summary,...e.positions.map(p=>groupInfo(DATA,p.group).org)].join(' ').toLowerCase();
  const draw=()=>{
    const q=billQ.trim().toLowerCase(),hit=e=>!q||text(e).includes(q);
    const part=(title,sub,list)=>{const L=list.filter(hit);return `<h2 style="margin-top:14px">${esc(title)} <span class="muted small">(${L.length})</span></h2><p class="small muted" style="margin:2px 0 10px">${sub}</p>${L.length?`<div class="bill-grid">${L.map(billCard).join('')}</div>`:'<p class="small muted">None match the search.</p>'}`;};
    $('#bill-list').innerHTML=(seg!=='not'?part('Became law','Signed into law. Newest first.',law):'')+(seg!=='law'?part('Not passed yet, or reintroduced','Passed one chamber, fell short, or never got a vote. Bills reintroduced in later Congresses are marked. Newest action first.',not):'');
    mountBillLobbying($('#bill-list'));bindTips(app);hoverTips(app);
  };
  draw();
  $('#bill-seg').addEventListener('click',ev=>{const b=ev.target.closest('button');if(b)location.hash='#bills'+(b.dataset.k==='all'?'':'-'+b.dataset.k);});
  $('#bill-q').addEventListener('input',ev=>{billQ=ev.target.value;draw();});
}

// ---------- compare ----------
let cmpGrp='all';
function renderCompare(){
  const V=CH[cmpCh].votes, M=MEM.filter(s=>s.chamber===cmpCh).concat(cmpCh==='S'?CANDS.filter(s=>s.senateVotes):[]);
  const areas=[...new Set(V.map(v=>v.area))].sort();
  app.innerHTML=`
  <section class="hero" style="padding-bottom:10px"><div class="asof">Roll calls since 2021 · ideology · money</div><h1 style="margin-top:8px">Compare</h1>
  <p class="lede">Two views of the ${ALL.length} people profiled.</p>${points([['Votes','How the senators and representatives voted on important roll calls. Former members\' votes are included for the years they served.'],['Side by side','Ideology, campaign funds and outside spending for everyone.']],'lede-pts')}
  <div class="toolbar"><div class="seg" id="cs"><button data-c="S" class="${cmpCh==='S'?'active':''}">Senate votes</button><button data-c="H" class="${cmpCh==='H'?'active':''}">House votes</button></div></div></section>
  <div class="filters" id="cf"><button class="active" data-a="">All areas</button>${areas.map(a=>`<button data-a="${esc(a)}">${esc(a)}</button>`).join('')}</div>
  ${vtLegend()}<div class="matrix"><table id="mx"><thead><tr><th>Vote</th>${M.map(s=>`<th class="sen"><a href="#${s.id}">${esc(s.short)}</a><br><span class="chip ${s.party}" style="margin-top:4px">${s.party}-${esc(seatLabel(s))}</span>${s.recordType==='former_member_of_congress'?'<div class="small muted" style="font-weight:400;text-transform:none;letter-spacing:0">former senator</div>':''}</th>`).join('')}</tr></thead><tbody></tbody></table></div>
  <section class="section">
    <h2>Side by side</h2>
    <p class="intro">Click a column to sort.</p>${points([['Money','Campaign funds and outside spending are separate columns, each with its own dates, on one shared scale. They are never added together.'],['Ideology','Percentiles are within each member\'s own chamber. Candidates without a congressional record show their record type.'],['Different evidence','Some people have U.S. votes, some state votes, some no voting record. Ideology cells can\'t be compared across those types.']])}
    <div class="toolbar" style="margin:0 0 10px"><div class="seg" id="cg"><button data-g="all" class="${cmpGrp==='all'?'active':''}">All ${ALL.length}</button><button data-g="S" class="${cmpGrp==='S'?'active':''}">Senate races</button><button data-g="H" class="${cmpGrp==='H'?'active':''}">House races</button></div></div>
    <div class="tablewrap"><table id="side"><thead><tr><th><button data-k="name">Name</button></th><th><button data-k="pctl">Voting record</button></th><th class="r"><button data-k="unity">Party unity</button></th><th><button data-k="rc">Campaign funds raised</button></th><th><button data-k="of">Outside spending for</button></th><th><button data-k="oa">Outside spending against</button></th><th><button data-k="al">Compared with your choices</button></th></tr></thead><tbody></tbody></table></div>
    <div style="margin:8px 0 0">${points([['Campaign funds','FEC two-year summaries, through the date shown for each person (mostly June 30, 2026).'],['Outside spending',`General-election independent expenditures through ${fmtDate(DATA.ie_asof)}.`],['Montana','In the three-way race, the outside-spending columns show only spending aimed directly at that candidate.']],'small')}</div>
  </section>`;
  const draw=a=>{$('#mx tbody').innerHTML=V.filter(v=>!a||v.area===a).slice().sort((x,y)=>y.date.localeCompare(x.date)).map(v=>`<tr><td class="v"><a href="${voteUrl(v)}" target="_blank" rel="noopener"><b>${esc(v.short)}</b></a><div class="s">${v.date} · ${esc(v.result)} · ${esc(v.area)}</div></td>${M.map(s=>{const p=v.pos[s.id]||'—';return `<td class="c">${voteText(v,p)}</td>`}).join('')}</tr>`).join('');};
  draw('');
  $('#cf').addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;$('#cf .active').classList.remove('active');b.classList.add('active');draw(b.dataset.a);});
  $('#cs').addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;location.hash='compare-'+(b.dataset.c==='H'?'house':'senate');});
  const all=ALL.map(s=>{const sc=scoreFor(s);return {s,sc,name:s.name,pctl:s.ideo?s.ideo.lo:-1,unity:s.ideo&&s.ideo.unity!=null?s.ideo.unity:-1,rc:s.camp.missing?-1:s.camp.receipts,of:s.out.for.total,oa:s.out.against.total,al:sc.score==null?-1:sc.score}});
  let sort={k:'rc',dir:-1};
  const cell=(v,max,col,sub)=>v<0?'<span class="muted">No FEC report yet</span>':`<div class="mini"><span class="num" style="min-width:4.6em"><b>${fmt$(v)}</b></span><span class="tr"><b style="width:${Math.max(.5,v/max*100)}%;background:var(${col})"></b></span></div>${sub?`<div class="small muted">${sub}</div>`:''}`;
  const drawS=()=>{
    const rows=all.filter(x=>cmpGrp==='all'||x.s.chamber===cmpGrp);
    const max=Math.max(1,...rows.map(x=>Math.max(x.rc,x.of,x.oa)));
    rows.sort((a,b)=>{const x=a[sort.k],y=b[sort.k];return (typeof x==='number'?x-y:String(x).localeCompare(String(y)))*sort.dir});
    $('#side tbody').innerHTML=rows.map(({s,rc,of,oa,sc})=>`<tr><td><a href="#${s.id}-finance">${esc(s.name)}</a><div class="row" style="margin-top:3px"><span class="chip ${s.party}">${s.party}-${esc(seatLabel(s))}</span><span class="chip ch">${chipCh(s)}</span></div></td><td class="small">${esc(ideoText(s).short)}<div class="muted">${esc(evidenceOf(s).kind==='us'?'U.S. votes':evidenceOf(s).kind==='former'?'past congressional record':evidenceOf(s).kind==='state'?'state legislative record':evidenceOf(s).kind==='exec'?'executive record, no votes':'no voting record')}</div></td><td class="r">${s.ideo&&s.ideo.unity!=null?s.ideo.unity+'%':'—'}</td><td style="min-width:170px">${cell(rc,max,'--s1',s.camp.missing?'':'through '+fmtDate(s.camp.end))}</td><td style="min-width:170px">${cell(of,max,'--neutral',s.out.incomplete.length?'incomplete data':'')}</td><td style="min-width:170px">${cell(oa,max,'--neutral','')}</td><td style="min-width:150px">${scoreBadge(sc)}<div class="small muted">${esc(evidenceMix(s))}</div></td></tr>`).join('');bindTips(app);};
  drawS();
  $('#side thead').addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;const k=b.dataset.k;sort=sort.k===k?{k,dir:-sort.dir}:{k,dir:k==='name'?1:-1};drawS();});
  $('#cg').addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;cmpGrp=b.dataset.g;$('#cg .active').classList.remove('active');b.classList.add('active');drawS();});
}

// ---------- methodology ----------
// ---------- profile charts: Ethics case timeline and trading, Workers > Profit donors, Money & Influence Analysis ----------
const CASE_COLOR={finding:'var(--s1)',open:'var(--s2)',closed:'var(--s3)',allegation:'var(--cx-other)'};
const CASE_LABEL={finding:'Confirmed finding',open:'Open investigation',closed:'Investigation closed without a finding',allegation:'Allegation'};
function caseRows(s){
  return (s.ethics||[]).filter(e=>e.outcome!=='None found'&&['finding','investigation','allegation'].includes(e.status)).map(e=>{
    const y=(String(e.date||'').match(/\b(?:19|20)\d{2}\b/g)||[]).map(Number),k=e.status==='investigation'?(e.stage==='open'?'open':'closed'):e.status;
    return {label:e.title,from:y[0]||null,to:y.length>1?y.at(-1):null,status:k,statusLabel:CASE_LABEL[k],when:e.date};
  });
}
function caseTimelineBlock(s){
  const rows=caseRows(s).filter(r=>r.from);if(!rows.length)return '';
  return `<div class="chart" id="eth-timeline"><h3>Case timeline</h3><div class="sub">Each entry across the years it covers, colored by its current status. When a case changes, its status is updated instead of adding a new entry, so each counts once.</div>
    <div class="cx-plot" id="eth-tl"></div>${legend(Object.keys(CASE_LABEL).filter(k=>rows.some(r=>r.status===k)).map(k=>[CASE_COLOR[k],CASE_LABEL[k]]))}
    ${tableView(['Entry','Status','Dates'],rows.map(r=>[esc(r.label),esc(r.statusLabel),esc(r.when)]))}</div>`;
}
// Trading charts, for reviewed trades (and, on the latest-records card, for trades not reviewed yet).
function tradeChartsBlock(rows,sectors,id){
  if(!rows.length)return '';
  const by={};for(const r of rows)if(r.sector)by[r.sector]=(by[r.sector]||0)+1;
  const cats=Object.entries(by).map(([label,value])=>({label,value,hi:sectors.includes(label)})).sort((a,b)=>b.value-a.value);
  return `<div class="chart"><h3>Days from trade to disclosure</h3><div class="sub">One dot per trade. Reports are due within ${LATE_DAYS} days. Dots past the line were late.</div><div class="cx-plot" id="${id}-delay"></div>${legend([['var(--crit)','Late or never disclosed'],['var(--cx-other)','On time']])}</div>
    ${cats.length?`<div class="chart"><h3>Trades by sector</h3><div class="sub">Sectors their committees oversee are highlighted. A trade in a single company's stock in one of them counts as a committee conflict.</div>${categoryBars(cats,{highlightLabel:'Overseen by their committees',otherLabel:'Other sectors'})}</div>`:''}
    <div class="chart"><h3>Trades and votes</h3><div class="sub"><b>Above the line:</b> buys. <b>Below:</b> sells. <b>Ticks on the line:</b> their key votes. <b>Ringed dot:</b> a trade near a related vote. Once reviewed, it counts in the Insider Trading Index 📈.</div><div class="cx-plot" id="${id}-tl"></div>${legend([['var(--s3)','Buy'],['var(--s2)','Sell'],['var(--ink-2)','Recorded vote']])}</div>`;
}
function personVotes(s){return DATA.votes.concat(DATA.hvotes).filter(v=>v.pos&&/^(Yea|Nay|Aye|No)$/i.test(v.pos[s.id]||'')).map(v=>({date:v.date,label:`${v.short}: voted ${v.pos[s.id]}`}));}
function mountTradeCharts(s,rows,id){
  if(!rows.length||!document.getElementById(id+'-delay'))return;
  const tr=rows.map(r=>({...r,company:r.company||r.asset}));
  const span=tr.map(r=>r.traded).filter(Boolean).sort(),from=addMonths(span[0].slice(0,7),-3),to=addMonths(span.at(-1).slice(0,7),3);
  const ev=personVotes(s).filter(v=>v.date.slice(0,7)>=from&&v.date.slice(0,7)<=to);
  const f=()=>{drawDelay(document.getElementById(id+'-delay'),tr,LATE_DAYS);drawTradeTimeline(document.getElementById(id+'-tl'),tr,ev);};f();resizers.push(f);
}
function mountCaseTimeline(s){const el=document.getElementById('eth-tl');if(!el)return;const rows=caseRows(s).filter(r=>r.from);const f=()=>drawCaseTimeline(document.getElementById('eth-tl'),rows,CASE_COLOR);f();resizers.push(f);}

// Workers > Profit: the person's own diverging bar, and the tree map of their top donors.
const catLabel=c=>c==='small'?'Small-dollar donors':DATA.categories[c]||SECTOR_LABEL_EXTRA[c]||c;
function donorTreemapBlock(s){
  const p=s.pac||{},t=topDonors(p.rows,DATA.pacNames,s.camp&&!s.camp.missing?s.camp.unitemized:0);
  if(!t.tiles.length)return `<div class="chart"><h3>Top donors</h3><p class="small muted">No PAC contributions or small-dollar totals are on file for ${esc(s.short)}'s campaign.</p></div>`;
  const tiles=t.tiles.map(x=>({...x,alignLabel:ALIGN_LABEL[x.align],catLabel:catLabel(x.cat),about:x.cat==='small'?SMALL_DOLLAR_ABOUT:ORGS.about(x.label,'pac')}));
  const sum=k=>tiles.filter(x=>x.align===k).reduce((n,x)=>n+x.value,0);
  return `<div class="chart" id="pvp-donors"><h3>Top ${tiles.length} donors</h3><div class="sub">${points([['Tile size',`The amount given${p.window?` (PAC contributions ${esc(p.window)}; small-dollar donors ${s.camp?period(s.camp.start,s.camp.end):''})`:''}.`],['People-aligned','Unions, plus small-dollar donors as one tile.'],['Profit-aligned','Corporate PACs and industry groups.'],['Other','Leadership, party and ideological committees.'],['Sectors','Assigned by this app from each committee\'s name.'],t.rest&&['Not shown',`${t.rest} smaller PACs (${fmtFull(t.restAmount)}).`]],'small')}</div>
    <div class="cx-plot" id="pvp-tm"></div>${legend([['var(--s1)',`People-aligned ${fmt$(sum('people'))}`],['var(--s5)',`Profit-aligned ${fmt$(sum('profit'))}`],['var(--cx-other)',`Other ${fmt$(sum('other'))}`]])}
    ${tableView(['Donor','Amount','Alignment','Sector'],tiles.map(x=>[orgName(x.label,x.about),fmtFull(x.value),x.alignLabel,esc(x.catLabel)]))}
    <p class="small" style="margin:8px 0 0"><a href="#${s.id}-finance">Outside spending by sector, for and against, on the Money &amp; Influence tab →</a></p></div>`;
}
function mountTreemap(s){const el=document.getElementById('pvp-tm');if(!el)return;const p=s.pac||{},t=topDonors(p.rows,DATA.pacNames,s.camp&&!s.camp.missing?s.camp.unitemized:0);
  const tiles=t.tiles.map(x=>({...x,alignLabel:ALIGN_LABEL[x.align],catLabel:catLabel(x.cat),about:x.cat==='small'?SMALL_DOLLAR_ABOUT:ORGS.about(x.label,'pac')}));const f=()=>drawTreemap(document.getElementById('pvp-tm'),tiles);f();resizers.push(f);}

// Money & Influence Analysis: alignment and timing, from the reviewed research now, and from the daily FEC and LDA.gov
// refresh as it fills in. Never part of a grade.
function influenceData(s){
  const H=window.FUNDHIST,funders=s.funderPos||[],through=H?H.contribThrough.slice(0,7):null;
  const rows=[];
  // Every group whose positions are collected and whose PACs gave to this person, with the votes it took a position on.
  for(const [key,h] of Object.entries(H?.people[s.id]||{})){
    const g=funders.find(f=>f.key===key)||{key,org:(GPBY[key]||{}).org||key,compared:[]};
    const series={};for(const [m,v] of h.c||[])series[m]=(series[m]||0)+v;
    const total=Object.values(series).reduce((t,v)=>t+v,0);if(!total)continue;
    const decisions=(g.compared||[]).map(c=>({date:c.date,match:c.match,label:`${c.short}: ${g.org} wanted ${c.wanted}, ${s.short} voted ${c.cast}`}));
    // A changed-position check tagged with an issue the group took positions on (through the votes it scored).
    const issues=new Set((g.compared||[]).flatMap(c=>(VOTE_BY_ID.get(c.voteId)?.codes||[]).map(x=>x.issue)));
    const changes=(s.statements||[]).filter(x=>x.assessment==='changed'&&x.issue&&/^\d{4}-\d{2}/.test(x.did?.date||'')).map(x=>({date:x.did.date,issue:x.issue,label:`Changed position: ${x.topic}`}));
    const flags=timingFlags(g.org,series,decisions,through).concat(positionChangeFlags(g.org,series,issues,changes,through));
    rows.push({key,label:g.org,series,total,flags,markers:decisions.filter(d=>d.match!==null).map(d=>({date:d.date,kind:d.match?'same':'opp',label:d.label}))});
  }
  rows.sort((a,b)=>b.total-a.total);
  const trades=personTrading(s).rows,stock=stockFlags(trades,funders.map(g=>({org:g.org,positions:(g.compared||[]).length})));
  // Reviewed trades in a charted donor's company, as diamonds on that donor's row.
  const inDonors=tradesInDonors(trades,rows.map(r=>({org:r.label})));
  for(const {org,trade:t} of inDonors)rows.find(r=>r.label===org).markers.push({date:t.traded,kind:'trade',label:`${t.type||'Trade'} of ${t.company||t.asset}${t.owner?` (${t.owner})`:''}`});
  const months=[];if(H)for(let m=H.start.slice(0,7);m<=through;m=addMonths(m,1))months.push(m);
  return {rows:rows.slice(0,8),allFlags:rows.flatMap(r=>r.flags).concat(stock),months,vda:voteDonorAlignment(funders),through,trades,inDonors,stock};
}
// Whose trades the disclosures cover: members of Congress file Periodic Transaction Reports (STOCK Act); a president files
// OGE Form 278-T reports, listed on the Ethics tab but not compared with donors; anyone else has no trading data.
const tradeCoverage=s=>s.office?{ok:false,label:'Not compared with donors',short:'Not compared for a president',why:`A president's trades are listed on the Ethics tab, from OGE reports. They aren't compared with donors here, because the donor data covers the 2026 candidates' committees.`}
  :s.bioguide?{ok:true}:{ok:false,why:'Trade disclosures cover members of Congress only, and state disclosure rules vary.'};
function stockBlock(s,d){
  const cov=tradeCoverage(s),tr=d.trades;
  const body=!cov.ok?`<p class="small muted" style="margin:0"><b>${esc(cov.label||'No trading data')}:</b> ${s.office?`${esc(s.short)}'s trades are listed from OGE reports on the <a href="#${s.id}-ethics">Ethics tab</a>. They aren't compared with donors here, because the donor data covers the 2026 candidates' committees.`:esc(cov.why)}</p>`
    :!tr.length?`<p class="small muted" style="margin:0">No reviewed trades for ${esc(s.short)} yet. The latest reported trades are checked against the top donors below, as leads. A trade counts once it is reviewed.</p>`
    :d.inDonors.length?`<div class="tablewrap"><table><thead><tr><th>Traded</th><th>Company</th><th>Type</th><th>Owner</th><th>Donor</th><th>Flag</th></tr></thead><tbody>${d.inDonors.map(({org,trade:t})=>`<tr><td class="mono" style="white-space:nowrap">${esc(t.traded||'')}</td><td>${esc(t.company||t.asset||'')}</td><td>${esc(t.type||'')}</td><td>${esc(t.owner||'Self')}</td><td>${esc(org)}</td><td>${d.stock.some(f=>f.trade===t)?`<b>${FLAG_TEXT.stock}</b>`:'<span class="muted">Donor took no position on a vote compared here</span>'}</td></tr>`).join('')}</tbody></table></div>`
    :`<p class="small muted" style="margin:0">None of ${esc(s.short)}'s ${tr.length} reviewed trade${tr.length===1?'':'s'} was in a donor's company.</p>`;
  if(!cov.ok)return `<div class="chart" id="f-stock"><h3>Stock holdings and trades</h3>${body}</div>`;
  return `<div class="chart" id="f-stock"><h3>Stock holdings and trades</h3><div class="sub">${points([['What is checked','Trades from official reports, including spouse and dependent-child accounts, against the donors.'],['Timing flag',`A trade in a donor that had a stake in ${esc(s.short)}'s decisions, such as a public position on a vote or lobbying on a bill ${esc(s.short)} acted on.`],['Insider Trading Index 📈',`${(e=>e.index==null?esc(e.why):e.index)(personEthics(s).insider)}. The same number as on the <a href="#${s.id}-ethics">Ethics tab</a>, which shows how it's figured.`],['Graded on Ethics',`Trades count in <a href="#${s.id}-ethics">Ethics</a> through the Insider Trading 📈 and Stock Disclosure Dodger 🙈 indexes, not here.`]],'small')}</div>
    ${body}<div id="f-live-stock"></div></div>`;
}
const H0=()=>window.FUNDHIST?monLabel(window.FUNDHIST.start.slice(0,7)):'2019';
const FLAG_TEXT={rose:'Donations rose',dropped:'Donations dropped',changed:'Position changed after a donation shift',stock:'Held or traded stock in a donor'};
function analysisBlock(s){
  const d=influenceData(s),v=d.vda;
  // Donor Loyalty 🤝: against the rest of their party on the same votes, from the saved votes' party totals
  // (public/vote-party.json, written by scripts/build-vote-party.mjs). A president signs bills rather than voting.
  const dl=s.office?null:donorLoyalty(s.funderPos,s.party,window.VOTE_PARTY),side=s.party==='R'?'Republicans':'Democrats';
  const pts1=x=>`${x>0?'+':x<0?'−':''}${Math.abs(Math.round(x))}`,sg1=x=>`${x>0?'+':x<0?'−':''}${fmt1(Math.abs(x))}`;
  const dlText=!dl?`Not measured for a president, who signs bills rather than voting on them`
    :dl.index!=null?`${pts1(dl.diff)} points vs. other ${side} on ${dl.n} votes, weighted by each funder's money. 100 at ${DONOR_LOYALTY.ceiling} points above`
    :dl.why==='Not enough data'?`Not enough data: ${dl.n} compared vote${dl.n===1?'':'s'}, ${DONOR_LOYALTY.minVotes} needed${dl.diff!=null?` (${pts1(dl.diff)} points vs. other ${side} so far)`:''}`
    :dl.why==='Party totals not loaded'?`The party totals for these votes aren't loaded yet`
    :dl.why==='No funder took a position on their votes'?`No group that gave to the campaign or spent for them took a public side on a vote compared here`:esc(dl.why);
  const flagRows=d.allFlags.map(f=>f.kind==='stock'?`<li><b>${FLAG_TEXT.stock}:</b> ${esc(f.org)} · ${esc(f.decision.label)} on ${fmtDate(f.decision.date)}</li>`
    :`<li><b>${FLAG_TEXT[f.kind]}${f.kind==='rose'?' after a vote it wanted':f.kind==='dropped'?' after a vote it opposed':''}:</b> ${esc(f.org)}, ${fmtFull(f.before)} in the ${WINDOW_MONTHS} months before → ${fmtFull(f.after)} from ${monLabel(f.decision.date.slice(0,7))} through ${monLabel(f.to)}. ${esc(f.decision.label)} (${fmtDate(f.decision.date)}).</li>`);
  return `<section id="f-analysis"><h2 style="margin-top:6px">Money &amp; Influence Analysis</h2>
    <p class="intro">Does the timing of ${esc(s.short)}'s money line up with ${esc(s.short)}'s decisions?</p>${points([['Correlation, not cause','This shows timing and alignment. It does not prove that money caused a decision.'],['Not graded','It sits beside the grades, never inside them.'],['Settings under review',`The top ${TOP_DONORS} donors, a ${SWING*100}% change, and a ${WINDOW_MONTHS}-month window.`]])}
    <div class="cx-stats ix-row">
      ${ixCard({name:'Vote Donor Alignment',value:v.pct==null?'—':v.pct+'%',about:v.n?`${v.same} of ${v.n} votes went the way a donor that took a public position wanted (${v.rows.length} donor${v.rows.length===1?'':'s'})`:'No donor that gave to the campaign took a public position on a vote compared here',
        how:`Votes that went a donor's way ÷ votes where a donor that gave to the campaign, bundled for it or spent for them took a public side (its scorecard or key-vote letter). Missed votes don't count.<div class="ix-f">${v.n?`${v.same} ÷ ${v.n} = <b>${v.pct}%</b>`:'No compared votes = <b>—</b>'}</div>`})}
      ${ixCard({icon:'🤝',name:'Donor Loyalty',value:dl?.index==null?'—':dl.index,about:dlText,
        how:`For each funder: their rate of voting its way − the rest of their party's rate on the same votes. Averaged by each funder's money (no funder over half the weight). Only the part above the party counts; ${DONOR_LOYALTY.ceiling} points above scores 100. Needs ${DONOR_LOYALTY.minVotes} compared votes.${dl?.rows?.length?`<div class="ix-f">${dl.rows.slice(0,3).map(r=>`${esc(r.org)} ${sg1(r.diff)} × ${r.share}%`).join(' + ')}${dl.rows.length>3?` + ${dl.rows.length-3} more`:''} = <b>${sg1(dl.diff)}</b> points</div>${dl.index!=null?`<div class="ix-f">${fmt1(Math.max(0,dl.diff))} ÷ ${DONOR_LOYALTY.ceiling} × 100 = <b>${dl.index}</b>${dl.diff>DONOR_LOYALTY.ceiling?' (capped)':dl.diff<=0?' (at or below the party: 0)':''}</div>`:''}`:''}`})}
      ${ixCard({name:'Speech Donor Alignment',value:'—',about:'Not measured yet. Floor speeches are collected, but must be sorted by issue and side before they can be compared',
        how:`Planned: speeches on an issue a top donor lobbied on that took the donor's side ÷ all such speeches.`})}
      ${ixCard({name:'Timing flags',value:d.allFlags.length,about:`for review, not scored${d.stock.length?`; ${d.stock.length} from stock in a donor`:''}`,label:'How it\'s counted',
        how:`One flag each time, within ${WINDOW_MONTHS} months: a group's donations rose ${SWING*100}% or more after a vote it wanted, or dropped ${SWING*100}% or more after a vote it opposed (compared with the ${WINDOW_MONTHS} months before); they changed position on an issue after a ${SWING*100}% shift in a group's donations; or they held or traded stock in a donor with a stake in their decisions.`})}
      ${ixCard({name:'Stock in donors',value:tradeCoverage(s).ok&&d.trades.length?d.inDonors.length:'—',about:!tradeCoverage(s).ok?esc(tradeCoverage(s).short||'No trading data'):d.trades.length?`of ${d.trades.length} reviewed trade${d.trades.length===1?' was':'s were'} in a donor's company`:'No reviewed trades yet. The latest reports are checked below',label:'How it\'s counted',
        how:`Reviewed trades whose company matches, by name, a PAC that gave to the campaign or a group whose positions are compared. ${tradeCoverage(s).ok&&d.trades.length?`<div class="ix-f">${d.inDonors.length} of ${d.trades.length} trades</div>`:''}`})}</div>
    ${d.rows.length?`<div class="chart"><h3>Donations by month from donors with public positions</h3><div class="sub">${points([['Each row',`Contributions to the campaign from one group's PACs${d.months.length?`, ${monLabel(d.months[0])} – ${monLabel(d.months.at(-1))}`:''}. Each row has its own scale. The largest month is labeled at the right.`],['Triangles',`Votes the group took a side on. Green when ${esc(s.short)} voted its way, red when not.`],['Diamond at the top','A reviewed trade in that group\'s company.'],['Shaded window','A timing flag.'],['Source','FEC bulk data. The groups are the ones whose scorecards or key-vote letters are collected.']],'small')}</div>
      <div class="cx-plot" id="f-months"></div>${legend([['var(--s1)','Monthly contributions'],['var(--good)','Voted the way the donor wanted'],['var(--crit)','Voted the other way'],['var(--s4)','Trade in the donor\'s company'],['var(--warn)','Timing flag window']])}
      ${tableView(['Donor','Total','Votes compared','Flags'],d.rows.map(r=>[esc(r.label),fmtFull(r.total),r.markers.length,r.flags.length]))}</div>`:s.office?`<p class="small muted">The monthly donations from the ${GP.length} groups this app tracks cover the 2026 candidates' committees, not ${esc(s.short)}'s. There is no series to compare.</p>`:`<p class="small muted">None of the ${GP.length} groups this app tracks gave to ${esc(s.short)}'s campaign since ${H0()}, in the FEC data. There is no monthly series to compare yet.</p>`}
    ${flagRows.length?`<div class="chart"><h3>Timing flags</h3><ul class="list small">${flagRows.join('')}</ul></div>`:''}
    ${stockBlock(s,d)}
    ${dl?.rows.length?`<details class="tv"><summary>Donor Loyalty 🤝 by funder</summary>${points([['Each funder','A group that gave to the campaign or spent for them, on the votes where it took a public side.'],['Party\'s way',`How the rest of the ${side} in the chamber voted on the same votes, from the official roll calls (Voteview's copy for Senate votes Senate.gov wouldn't send).`],['The index',`The differences weighted by each funder's money, with no funder counting more than all the others put together (at most half the weight). Only the part above the party counts, and ${DONOR_LOYALTY.ceiling} points above scores 100.`]],'small')}<div class="tablewrap"><table><thead><tr><th>Funder</th><th class="r">Gave, bundled or spent for them</th><th class="r">Weight</th><th class="r">Votes</th><th class="r">Their way</th><th class="r">Party's way</th><th class="r">Difference</th></tr></thead><tbody>${dl.rows.map(r=>`<tr><td>${orgName(r.org,ORGS.about(r.org,'group'))}</td><td class="r">${fmtFull(r.money)}</td><td class="r">${r.share}%</td><td class="r">${r.n}</td><td class="r">${r.rate}%</td><td class="r">${r.partyRate}%</td><td class="r">${pts1(r.diff)}</td></tr>`).join('')}</tbody></table></div></details>`:''}
    ${v.rows.length?`<details class="tv"><summary>Vote Donor Alignment by donor</summary><div class="tablewrap"><table><thead><tr><th>Donor</th><th class="r">Votes its way</th><th class="r">Votes compared</th></tr></thead><tbody>${v.rows.map(r=>`<tr><td>${orgName(r.org,ORGS.about(r.org,'group'))}</td><td class="r">${r.same}</td><td class="r">${r.n}</td></tr>`).join('')}</tbody></table></div></details>`:''}
    <div id="f-live-analysis"></div></section>`;
}
function mountAnalysis(s){
  const el=document.getElementById('f-months');
  if(el){const d=influenceData(s);const rows=d.rows.map(r=>({...r,flags:r.flags.map(f=>({from:f.from,to:f.to,tip:`${FLAG_TEXT[f.kind]}: ${fmtFull(f.before)} before, ${fmtFull(f.after)} after`}))}));
    const f=()=>drawMonthly(document.getElementById('f-months'),rows,d.months,[]);f();resizers.push(f);}
  liveAnalysis(s,document.getElementById('f-live-analysis'));
}
// From the daily refresh: the top donor organizations combining PAC and employee money, and the bills they lobbied on
// that this person acted on.
const orgKey=v=>String(v||'').toLowerCase().replace(/\b(pac|political action committee|employees|of|the|inc|corp|corporation|co|company|llc|federal|fund)\b/g,'').replace(/[^a-z0-9]/g,'');
// The latest disclosed trades (from the refresh, not yet reviewed) in the top donor organizations; a donor that also
// lobbied on a bill this person acted on makes it a timing flag, as leads for review.
function liveStock(s,p,top,stake){
  const el=document.getElementById('f-live-stock');if(!el)return [];
  const trades=p.merged?.trades||[];
  if(!trades.length){el.innerHTML=`<p class="small muted" style="margin:8px 0 0">The latest reported trades fill in from the daily refresh once the keys are set. <b>Sources:</b> the member's own trade reports (House Clerk and Senate eFD), cross-checked with Bargo, Eulerpool and Financial Modeling Prep. <a href="#updates">Update status</a></p>`;return [];}
  if(!top.length){el.innerHTML=`<p class="small muted" style="margin:8px 0 0">${trades.length} reported trade${trades.length===1?' is':'s are'} on file. They are checked against the top donor organizations once the FEC refresh lists them.</p>`;return [];}
  const lobbied=new Set(stake.map(l=>corp(l.org)));
  const hits=tradesInDonors(trades.map(t=>({...t,company:t.asset||t.ticker})),top.map(o=>({org:o.name,stake:lobbied.has(corp(o.name))})));
  el.innerHTML=`<h4 style="margin:12px 0 6px">Latest disclosed trades in top donors (leads, for review)</h4>${hits.length?`<div class="tablewrap"><table><thead><tr><th>Traded</th><th>Asset</th><th>Type</th><th class="r">Amount</th><th>Owner</th><th>Top donor</th><th>Flag</th></tr></thead><tbody>${hits.map(({org,donor,trade:t})=>`<tr><td class="mono" style="white-space:nowrap">${esc(t.traded||'')}</td><td>${esc(t.asset||t.ticker||'')}${t.ticker?` <span class="muted mono">${esc(t.ticker)}</span>`:''}</td><td>${esc(t.type||'')}</td><td class="r">${esc(t.amount||'')}</td><td>${esc(t.owner||'')}</td><td>${esc(org)}</td><td>${donor.stake?`<b>${FLAG_TEXT.stock}</b> (it lobbied on a bill ${esc(s.short)} acted on)`:'<span class="muted">No lobbying on their bills found</span>'}</td></tr>`).join('')}</tbody></table></div>`:`<p class="small muted" style="margin:0">None of the ${trades.length} latest disclosed trades was in one of the top ${top.length} donor organizations.</p>`}`;
  return hits;
}
async function liveAnalysis(s,host){
  if(!host)return;
  try{
    const r=await fetch('/api/profile?id='+encodeURIComponent(s.id),{cache:'no-store'});if(!r.ok)throw 0;const p=await r.json();if(!host.isConnected)return;
    const emp=p.sections.donors?.orgs||[],pac=p.sections.pac?.rows||[],months=p.sections['donor-months']?.months||{},lob=p.sections.lobbying?.rows||[];
    if(!emp.length&&!pac.length){liveStock(s,p,[],[]);host.innerHTML=`<p class="small muted"><b>Coming from the daily refresh:</b> the top ${TOP_DONORS} donor organizations by month (each one's PAC plus its employees), and lobbying on bills ${esc(s.short)} acted on. They fill in from FEC and LDA.gov once the keys are set. <a href="#updates">Update status</a></p>`;return;}
    const orgs=new Map();
    for(const e of emp){const k=orgKey(e.employer);orgs.set(k,{name:e.employer,pac:0,emp:e.total});}
    for(const x of pac){const k=orgKey(x.name);const o=orgs.get(k)||{name:x.name,pac:0,emp:0};o.pac+=x.amount;orgs.set(k,o);}
    const top=[...orgs.values()].map(o=>({...o,total:o.pac+o.emp})).sort((a,b)=>b.total-a.total).slice(0,TOP_DONORS);
    const mine=new Set([...(p.sections.legislation?.rows||[]),...(p.sections.cosponsored?.rows||[])].map(r=>r.bill||String(r.id).toLowerCase()).concat(p.sections.legislation?.bills||[],p.sections.cosponsored?.bills||[]).concat(DATA.votes.concat(DATA.hvotes).filter(v=>v.pos&&s.id in v.pos).map(voteBill)).filter(Boolean));
    const stake=lob.filter(l=>l.bills.some(b=>mine.has(b)));
    const hits=liveStock(s,p,top,stake);
    const mrows=Object.entries(months).map(([org,series])=>({label:org,series,markers:[]})).slice(0,8),ms=[...new Set(mrows.flatMap(r=>Object.keys(r.series)))].sort();
    for(const {org,trade:t} of hits){const row=mrows.find(r=>corp(r.label)===corp(org));if(row)row.markers.push({date:t.traded,kind:'trade',label:`${t.type||'Trade'} of ${t.asset||t.ticker} (disclosed, not yet reviewed)`});}
    const allMonths=[];if(ms.length)for(let m=ms[0];m<=ms.at(-1);m=addMonths(m,1))allMonths.push(m);
    host.innerHTML=`<div class="chart"><h3>Top ${top.length} donor organizations this cycle</h3><div class="sub">Each organization's PAC giving plus its employees' itemized giving, grouped by employer. Donors' names are never shown. From the latest FEC refresh.</div>
      ${rankBars(top.map(o=>({label:o.name,value:Math.round(o.total/top[0].total*100),color:'var(--s1)',display:fmt$(o.total),note:[o.pac&&`PAC ${fmt$(o.pac)}`,o.emp&&`employees ${fmt$(o.emp)}`].filter(Boolean).join(' · '),tip:`${o.name}: ${fmtFull(o.total)}. ${EMPLOYER_ABOUT}`})))}</div>
      ${mrows.length?`<div class="chart"><h3>Top donors' employees by month</h3><div class="cx-plot" id="f-live-months"></div></div>`:''}
      <div class="chart"><h3>Who had a stake</h3><div class="sub">Lobbying reports filed for top donor organizations that name a bill ${esc(s.short)} sponsored, cosponsored or voted on (LDA.gov).</div>${stake.length?`<ul class="list small">${stake.map(l=>`<li>${esc(l.org)} (${esc(l.registrant||'self-filed')}, ${esc(l.period||'')} ${esc(l.year||'')}): ${l.bills.filter(b=>mine.has(b)).map(b=>esc(billLabel(b))).join(', ')}${l.url?` <a href="${esc(l.url)}" target="_blank" rel="noopener">report ↗</a>`:''}</li>`).join('')}</ul>`:'<p class="small muted">No lobbying report from a top donor names one of these bills yet.</p>'}</div>`;
    if(mrows.length){const f=()=>drawMonthly(document.getElementById('f-live-months'),mrows,allMonths,[]);f();resizers.push(f);}
    hoverTips(host);
  }catch{if(host.isConnected)host.innerHTML='<p class="small muted">The refreshed donor and lobbying records are unavailable right now. The analysis above uses the reviewed research.</p>';
    const el=document.getElementById('f-live-stock');if(el)el.innerHTML='<p class="small muted" style="margin:8px 0 0">The latest disclosed trades are unavailable right now.</p>';}
}
// Outside spending for and against, each split by the spenders' sectors and colored People- or Profit-aligned.
function outsideSectorBlock(s){
  const o=s.out;if(!o||!o.cms?.length)return '';
  const by=outsideBySector(o.cms,cmOf),F=by.for.reduce((t,x)=>t+x.amount,0),A=by.against.reduce((t,x)=>t+x.amount,0),q=moneyRatio(F,A);
  const fw=o.multi?'Supporting':'For',aw=o.multi?'Opposing':'Against';
  const cats=[...new Set([...by.for,...by.against].map(x=>x.cat))];
  const amt=(side,c)=>side.find(x=>x.cat===c)?.amount||0;
  return `<div class="chart" id="f-out-sector"><h3>Outside spending by sector</h3><div class="sub">${points([['Each bar',`Split by the spending groups' sectors, ${period(o.start,o.end)}.`],['People-aligned','Unions.'],['Profit-aligned','Industry and corporate groups.'],['Other','Party, ideological and candidate-aligned groups.'],['Sectors','Assigned by this app from each committee\'s name. Under review.']],'small')}</div>
    ${q?`<p class="small" style="margin:0 0 6px"><span class="hc-ratio" style="margin-left:0;font-size:.8rem">${q.oneSided?`<b class="${q.side}">${esc(q.text[0].toUpperCase()+q.text.slice(1))}</b>`:`For-to-against <b class="${q.side}">${esc(q.text)}</b>`}</span></p>`:''}
    ${sectorSpendBars(by,catLabel,{fw,aw})}${legend([['var(--s1)',ALIGN_LABEL.people],['var(--s5)',ALIGN_LABEL.profit],['var(--cx-other)',ALIGN_LABEL.other]])}
    ${tableView(['Sector','Alignment',`Amount ${fw.toLowerCase()}`,`Amount ${aw.toLowerCase()}`],cats.map(c=>[esc(catLabel(c)),ALIGN_LABEL[categoryAlign(c)],fmtFull(amt(by.for,c)),fmtFull(amt(by.against,c))]))}</div>`;
}

// ---------- score pages: each grade ranks everyone; people who are "Not graded" stay as grey rows ----------
const SCORE_PAGES=[['match','Your match'],['promises','Promises delivered'],['ethics','Ethics'],['pvp','Workers > Profit'],['ideology','Ideological position']];
const GRADE_FILL={A:'var(--good)',B:'var(--grade-b)',C:'var(--warn)',D:'var(--serious)',F:'var(--crit)'};
const gradeFill=p=>GRADE_FILL[letter(p)];
const whoSub=s=>`${partyName(s.party)} · ${chipCh(s)} · ${seatLabel(s)}`;
// Points lost on the Ethics grade, by kind, in the palette's fixed order.
const ETH_SEGS=[{key:'finding',label:'Legal Trouble: confirmed findings',color:'var(--s1)'},{key:'open',label:'Legal Trouble: open investigations',color:'var(--s2)'},{key:'closed',label:'Legal Trouble: closed without a finding',color:'var(--s3)'},{key:'insider',label:'Insider Trading (a tenth)',color:'var(--s4)'},{key:'dodger',label:'Stock Disclosure Dodger (a tenth)',color:'var(--s5)'}];
const PROM_SEGS=[{key:'consistent',label:'Supported',color:'var(--good)'},{key:'partial',label:'Partly supported',color:'var(--warn)'},{key:'changed',label:'Changed position',color:'var(--warn)',cls:'cx-hatch'},{key:'contradiction',label:'Contradicted',color:'var(--crit)'}];
// The points each part took off. Legal Trouble is split by status, scaled down when its total is capped at 100.
function ethicsPoints(s){const e=personEthics(s),L=e.legal,k=L.total?L.index/L.total:0,by=st=>Math.round(L.rows.filter(r=>r.status===st).reduce((t,r)=>t+r.points,0)*k*10)/10;
  return {e,parts:{finding:by('finding'),open:by('open'),closed:by('closed'),insider:Math.round(e.insiderCost*10)/10,dodger:Math.round(e.dodgerCost*10)/10}};}
function promiseCounts(s){const c={consistent:0,partial:0,changed:0,contradiction:0};for(const x of s.statements||[])if(!x.vague&&x.assessment in c)c[x.assessment]++;return c;}
function renderScores(sub){
  if(!SCORE_PAGES.some(([k])=>k===sub))sub='match';
  const N=ALL.length,title=SCORE_PAGES.find(([k])=>k===sub)[1];
  const head=`<section class="hero" style="padding-bottom:6px"><div class="asof">Scores · ${N} politicians and candidates</div><h1 style="margin-top:8px">${esc(title)}</h1>
    <p class="lede">Each page ranks everyone on one grade.</p>${points([['Data points','Each bar shows how many are behind the grade.'],['Not graded','People with too little evidence are still listed, not left out.'],['Money & Influence Analysis','Shown on each profile, beside the grades, never inside them.']],'lede-pts')}
    <nav class="sc-tabs" aria-label="Score pages">${SCORE_PAGES.map(([k,l])=>`<a href="#scores-${k}" class="${k===sub?'active':''}">${esc(l)}</a>`).join('')}</nav></section><section class="section" id="sc-body"></section>`;
  app.innerHTML=head;
  const body=$('#sc-body');
  ({match:scoresMatch,promises:scoresPromises,ethics:scoresEthics,pvp:scoresPvp,ideology:scoresIdeology})[sub](body);
  hoverTips(body);bindTips(body);
}
function scoresMatch(host){
  const ch=chosenIssues();
  const rows=ALL.map(s=>({s,r:scoreFor(s)})).sort((a,b)=>(b.r.score??-1)-(a.r.score??-1)||b.r.nCov-a.r.nCov||a.s.name.localeCompare(b.s.name));
  const bars=rankBars(rows.map(({s,r})=>({label:s.name,sub:whoSub(s),href:`#${s.id}-match`,value:r.score,color:r.score==null?null:gradeFill(r.score),cls:r.score==null?'':'gr-'+letter(r.score),display:r.score==null?'':`${letter(r.score)} ${r.score}%`,
    note:!ch.length?'choose your issues':`${r.nCov} of ${r.nChosen} issues`,tip:r.score==null?'':`${s.name}: ${r.score}% match on ${r.nCov} of your ${r.nChosen} issues`})));
  const graded=rows.filter(x=>x.r.score!=null);
  host.innerHTML=`${ch.length?'':`<div class="note" style="margin-bottom:12px"><b>Choose your positions first.</b> This ranking compares each record with the positions you pick in <a href="#align">My alignment</a>, weighted by how important you say each issue is. Your choices stay in this browser.</div>`}
    <div class="chart"><h3>Match with your positions</h3><div class="sub">${ch.length?`${graded.length} of ${ALL.length} have evidence on enough of your ${ch.length} issues for a grade. <b>Bar color:</b> the grade. <b>Note under each value:</b> how many of your issues have evidence.`:'Everyone shows as Not graded until you choose issues.'}</div>${bars}
    ${tableView(['Name','Score','Issues with evidence'],rows.map(({s,r})=>[`<a href="#${s.id}-match">${esc(s.name)}</a>`,r.score==null?'Not graded':`${letter(r.score)} ${r.score}%`,`${r.nCov} of ${r.nChosen}`]))}</div>
    ${ch.length?`<div class="chart"><h3>Issue by issue</h3><div class="sub">For one person: how much of their record matches your side on each issue. Most important issues first.</div>
      <label class="small">Person <select id="sc-person">${rows.map(({s})=>`<option value="${s.id}">${esc(s.name)}</option>`).join('')}</select></label><div id="sc-issues"></div></div>`:''}`;
  const sel=host.querySelector('#sc-person');
  const drawIssues=()=>{const s=byId[sel.value],r=scoreFor(s);const list=r.rows.slice().sort((a,b)=>b.pr.w-a.pr.w);
    host.querySelector('#sc-issues').innerHTML=rankBars(list.map(x=>({label:x.i.label,sub:`you: ${sideLabel(x.i.id,x.pr.side)} · importance ${WLAB[x.pr.w]}`,value:x.status==='none'?null:Math.round(x.agree*100),color:'var(--s1)',
      display:x.status==='none'?'':`${Math.round(x.agree*100)}%`,note:x.status==='none'?'no evidence':`${x.match} of ${x.n} ${x.status==='record'?'actions':'statements'}`,tip:x.status==='none'?'':`${x.i.label}: ${x.match} of ${x.n} match your side`})));
    hoverTips(host);};
  if(sel){sel.addEventListener('change',drawIssues);drawIssues();}
}
function scoresPromises(host){
  const rows=ALL.map(s=>({s,p:SCORER.promises(s),c:promiseCounts(s)})).sort((a,b)=>(b.p.pct??-1)-(a.p.pct??-1)||b.p.clear-a.p.clear||a.s.name.localeCompare(b.s.name));
  const graded=rows.filter(x=>x.p.pct!=null).length;
  host.innerHTML=`<div class="chart"><h3>Promises and stated positions checked against the record</h3><div class="sub">${points([['Raw counts','A grade built on 3 checks looks different from one built on 20.'],['Graded',`${graded} of ${ALL.length} have the ${MIN_CHECKS} counted checks a grade needs.`],['Not counted','Ambiguous checks, outcome checks, promises with no related bill yet, and vague goals.']],'small')}</div>
    ${legend(PROM_SEGS.map(x=>[x.color,x.label,x.cls]))}
    ${stackRows(rows.map(({s,p,c})=>({label:s.name,sub:whoSub(s),href:`#${s.id}-promises`,parts:c,grey:p.pct==null,value:p.pct==null?'Not graded':`${letter(p.pct)} ${p.pct}%`,cls:p.pct==null?'':'gr-'+letter(p.pct),note:`${p.clear} counted check${p.clear===1?'':'s'}`,empty:'No counted checks'})),PROM_SEGS,{unit:''})}
    ${tableView(['Name','Score','Kept','Half','Contradicted','Not counted'],rows.map(({s,p,c})=>[`<a href="#${s.id}-promises">${esc(s.name)}</a>`,p.pct==null?'Not graded':`${letter(p.pct)} ${p.pct}%`,c.consistent,`${c.partial} partly, ${c.changed} changed`,c.contradiction,p.notCounted+p.vague]))}</div>`;
}
function scoresEthics(host){
  const rows=ALL.map(s=>({s,...ethicsPoints(s)}));
  const noCases=rows.filter(({e})=>!e.finding&&!e.open&&!e.closed&&!e.allegation).length;
  const ded=rows.filter(({e})=>e.raw<100).sort((a,b)=>a.e.pct-b.e.pct||a.s.name.localeCompare(b.s.name));
  host.innerHTML=`<div class="cx-stats"><div class="cx-stat"><span>No recorded cases</span><b>${noCases} of ${ALL.length}</b><small>No finding, investigation or allegation in the sources checked</small></div><div class="cx-stat"><span>Lost points</span><b>${ded.length} of ${ALL.length}</b><small>Have at least one deduction</small></div></div>
    <div class="chart"><h3>Points lost, by kind</h3><div class="sub">${points([['Shown','Only people with deductions. Everyone else scores 100%.'],['Legal Trouble Index 🚨',`Costs all of its value, split here by each case's status. A case: ${ETHICS_COST.finding} for a confirmed finding, ${ETHICS_COST.open} open, ${ETHICS_COST.closed} closed without a finding; criminal × ${CASE_KIND.criminal}, technical × ${CASE_KIND.technical}; × ${CASE_AGE.factor} after ${CASE_AGE.years} years.`],['Trading indexes','The Insider Trading 📈 and Stock Disclosure Dodger 🙈 indexes cost a tenth of their value each.']],'small')}</div>
    ${legend(ETH_SEGS.map(x=>[x.color,x.label]))}
    ${ded.length?stackRows(ded.map(({s,e,parts})=>({label:s.name,sub:whoSub(s),href:`#${s.id}-ethics`,parts,value:`${letter(e.pct)} ${e.pct}%`,cls:'gr-'+letter(e.pct),note:`−${100-e.pct} points`})),ETH_SEGS,{unit:' points'}):'<p class="small muted">No one has a deduction.</p>'}
    ${tableView(['Name','Score','Points lost','Legal Trouble','Insider Trading','Stock Disclosure Dodger','Findings','Open','Closed','Allegations (not scored)'],rows.sort((a,b)=>a.e.pct-b.e.pct||a.s.name.localeCompare(b.s.name)).map(({s,e})=>[`<a href="#${s.id}-ethics">${esc(s.name)}</a>`,`${letter(e.pct)} ${e.pct}%`,100-e.pct,e.legal.index,e.insider.index??'—',e.dodger.index??'—',e.finding,e.open,e.closed,e.allegation]))}</div>`;
}
function scoresPvp(host){
  const rows=ALL.map(s=>({s,v:personPvp(s)})).sort((a,b)=>(b.v.pct??-1)-(a.v.pct??-1)||b.v.n-a.v.n||a.s.name.localeCompare(b.s.name));
  const graded=rows.filter(x=>x.v.pct!=null);
  const pts=graded.filter(x=>x.s.ideo).map(({s,v})=>({x:s.ideo.dim1,y:v.pct,cls:s.party,tip:`${s.name}: ${v.pct}% for working people · DW-NOMINATE ${s.ideo.dim1>0?'+':''}${s.ideo.dim1.toFixed(2)}`}));
  host.innerHTML=`${PVP_MARKS.size?'':`<div class="note" style="margin-bottom:12px"><b>No bills are scored yet, so no one has this grade.</b> A bill counts once a nonpartisan study of who gains from it is cited, or worker and business groups took opposite sides on it. Until then everyone is listed as Not graded.</div>`}
    <div class="chart"><h3>Who their record delivered more for</h3><div class="sub"><b>Right of 50%:</b> their grade leans toward working people. <b>Left:</b> toward the wealthy and corporations. <b>The grade:</b> three quarters their scored actions, one quarter 100 minus the Corporation Compromised Index 🏢. ${graded.length} of ${ALL.length} have the ${MIN_PVP_ACTIONS} scored actions a grade needs.</div>
    ${divergingRows(rows.map(({s,v})=>({label:s.name,sub:whoSub(s),href:`#${s.id}-pvp`,value:v.pct,cls:v.pct==null?'':'gr-'+letter(v.pct),note:v.pct==null?`${v.n} of ${MIN_PVP_ACTIONS} actions`:`${v.nPeople} of ${v.n} actions`,tip:v.pct==null?'':`${s.name}: ${v.people} points for working people, ${v.profit} for the wealthy and corporations`})))}
    ${tableView(['Name','Score','Bills','Corporation Compromised 🏢','Actions','People points','Profit points'],rows.map(({s,v})=>[`<a href="#${s.id}-pvp">${esc(s.name)}</a>`,v.pct==null?'Not graded':`${letter(v.pct)} ${v.pct}%`,v.billsPct==null?'—':`${v.billsPct}%`,v.cci?.index??'—',v.n,v.people,v.profit]))}</div>
    ${billsBlock(PVP_BILLS)}
    <div class="chart"><h3>Workers > Profit against ideology</h3><div class="sub">Each graded person with a DW-NOMINATE score. <b>Look for outliers:</b> someone far from others with a similar ideology.</div>
    ${pts.length?`<div class="cx-plot" id="sc-scatter"></div>${legend([['var(--dem)','Democrats'],['var(--rep)','Republicans'],['var(--muted)','Independents']])}`:'<p class="small muted">Nothing to plot until people are graded.</p>'}</div>`;
  if(pts.length){const f=()=>drawScatter(document.getElementById('sc-scatter'),pts,{x:{min:-1,max:1,ticks:[-1,-.5,0,.5,1],left:'More liberal',right:'More conservative',label:'DW-NOMINATE'},y:{min:0,max:100,ticks:[0,25,50,75,100],label:'Workers > Profit'}});f();resizers.push(f);}
  mountBillLobbying(host);
}
function scoresIdeology(host){
  const list=ALL.filter(s=>s.ideo);
  host.innerHTML=`<div class="chart"><h3>Where each sits in the chamber</h3><div class="sub">Voteview's DW-NOMINATE score for the whole chamber, with one person highlighted. ${list.length} of ${ALL.length} have a score. <b>Not graded:</b> it describes a voting pattern, not a better or worse record.</div>
    <label class="small">Person <select id="sc-ideo-p">${list.map(s=>`<option value="${s.id}">${esc(s.name)} (${CH[icH(s)].name})</option>`).join('')}</select></label><div id="sc-ideo-host"></div></div>`;
  const sel=host.querySelector('#sc-ideo-p');
  const draw=()=>{const s=byId[sel.value];resizers=resizers.filter(f=>!f.ideoPage);host.querySelector('#sc-ideo-host').innerHTML=ideoBlock(s,'sc-ideo');const f=()=>drawIdeo(document.getElementById('sc-ideo'),s);f.ideoPage=true;f();resizers.push(f);};
  sel.addEventListener('change',draw);draw();
}

// The latest entries of the monthly change log, newest first.
function methodLog(){
  const L=(window.SCORELOG||[]).slice(-3).reverse();if(!L.length)return '<p class="small muted">No monthly recalculation has been recorded yet.</p>';
  const G={promises:'Promises delivered',ethics:'Ethics',pvp:'Workers > Profit',all:'All grades'},pc=v=>v==null?'Not graded':v+'%';
  return L.map(e=>`<div class="chart"><h3>${fmtDate(e.date)}</h3><div class="sub">Research reviewed ${esc(e.reviewedAt)} · ${esc(e.note||'')}</div>${e.changes.length?`<div class="tablewrap"><table><thead><tr><th>Person</th><th>Grade</th><th>From</th><th>To</th><th>Why</th></tr></thead><tbody>${e.changes.slice(0,60).map(c=>`<tr><td>${byId[c.id]?`<a href="#${c.id}">${esc(byId[c.id].name)}</a>`:esc(c.id)}</td><td>${G[c.grade]||esc(c.grade)}</td><td>${c.from===undefined?'—':pc(c.from)}</td><td>${pc(c.to)}</td><td class="small">${esc(c.why)}</td></tr>`).join('')}</tbody></table></div>${e.changes.length>60?`<p class="small muted">and ${e.changes.length-60} more in the log file.</p>`:''}`:'<p class="small muted">No grade changed.</p>'}</div>`).join('');
}
function renderMethod(sub){
  const sv=DATA.votes.length, hv=DATA.hvotes.length;
  const nRows=Object.values(IE.rows).reduce((a,r)=>a+r.length,0);
  app.innerHTML=`
  <section class="hero" style="padding-bottom:10px"><div class="asof">How this works</div><h1 style="margin-top:8px">Methodology</h1><p class="lede">What is covered, where every number comes from, how figures are calculated, and what is missing.</p></section>
  <section class="section prose">
    <h2>What changed in this version (November 1, 2026)</h2>
    <ul class="list">
      <li><b>Donors by gift size:</b> the Overview's money card has a second bar that splits individual gifts into the FEC's five size groups, from the daily refresh. Shown only.</li>
      <li><b>PAC types:</b> each PAC's type as the FEC records it (corporate, trade association, labor union, leadership PAC and so on) is shown beside the sector this app assigns from its name, once it has been looked up. Shown only.</li>
      <li><b>Bundled donations:</b> what AIPAC's, Club for Growth's, EMILY's List's, J Street's and the Senate Conservatives Fund's PACs forwarded from their donors to each campaign is now read from those PACs' own FEC reports, and shown beside each group's own money (see "Money routed through PACs on donors' behalf" below). It counts as that group's money in Donor Loyalty and Vote Donor Alignment, never in a grade.</li>
      <li><b>Net worth:</b> a range from each sitting member's latest annual financial disclosure, on the Ethics tab and the Overview's ethics card (see "Ethics and compliance" below). Shown only.</li>
      <li><b>Money in politics and congressional ethics:</b> a new Your match issue, the 16th: banning members' stock trading and lobbying after office, and overturning Citizens United. Sponsoring or cosponsoring one of the six bills on it counts as an action.</li>
      <li><b>Donor Loyalty 🤝 cap:</b> no single funder counts for more than all the others put together (at most half the weight), so one large funder with one position on file can't decide the number alone.</li>
      <li><b>Money pledges checked against the records:</b> 12 pledges on the Promises tabs (corporate PAC money, single-issue PAC money and stock-trading bans) now show what the FEC records, the bills' cosponsors and the votes on file say, under the reviewed verdict. Shown only.</li>
      <li><b>Blind trusts and divestment:</b> a qualified blind trust now takes its trustee's trades out of the trading indexes, and "no individual stocks" is shown on the Insider Trading Index. Managed accounts aren't excused. Two statuses are reviewed so far (Ossoff and Hinson), and no grade changed.</li>
      <li><b>Corporation Compromised Index 🏢 in Workers > Profit:</b> a quarter of the grade is now 100 minus the index, which measures business PACs' share of the money raised and votes with business funders beyond the party. Three letter grades changed (Kaptur, Gonzalez and Castor, from A); each Workers > Profit tab shows the math.</li>
      <li><b>No other grade formula changed.</b> Your match changes only for visitors who pick the new issue.</li>
    </ul>
    <details class="tv"><summary>Earlier changes (October 28, 2026)</summary>
    <ul class="list">
      <li><b>Ethics indexes:</b> the Ethics grade is now 100 − the Legal Trouble Index 🚨 − a tenth of the Insider Trading Index 📈 − a tenth of the Stock Disclosure Dodger Index 🙈. A case now counts by its kind (criminal cases more, technical ones less) and its age (half after 10 years). Thirteen grades changed. Each changed grade says so on its Ethics tab, and the next monthly recalculation logs why.</li>
    </ul></details>
    <details class="tv"><summary>Earlier changes (October 24, 2026)</summary>
    <ul class="list">
      <li><b>New scoring rules (Rule 1):</b> votes, sponsorships, cosponsorships and official acts count fully. Statements count half, and only where no action exists. A vote and a sponsorship on the same bill count once. Promises left unacted at the end of a term count as contradicted. Vague goals and promises with no related bill yet are left out. Workers > Profit also counts sponsorships, from a list of marked bills. Ethics adds stock-trading deductions.</li>
      <li><b>Score pages:</b> a Scores menu ranks everyone on each grade. "Not graded" people show as grey rows, with the data behind each grade.</li>
      <li><b>Money &amp; Influence Analysis:</b> on each Money &amp; Influence tab. It has Vote Donor Alignment, Donor Loyalty 🤝, monthly donations with vote markers, and timing flags. From the daily refresh, it adds the top 20 donor organizations and who lobbied on their bills. Outside spending is also split by sector and colored People- or Profit-aligned.</li>
      <li><b>New charts:</b> an Ethics case timeline, trading charts, a Workers > Profit diverging bar and a donor tree map.</li>
      <li><b>More official sources:</b> many now refresh automatically (listed under "What refreshes" below), each with its own free key. Every key that is set is used at once, and a record found in several sources shows once.</li>
      <li><b>Committees and IDs:</b> committee seats and each member's IDs come from congress-legislators. Senate votes now match senators by their official LIS ID, not surname and state.</li>
      <li><b>Monthly recalculation:</b> Promises, Ethics and Workers > Profit are recalculated each month after review, with a change log (below).</li>
      <li><b>Press releases, Bluesky and Threads:</b> members' press releases now come from their official websites, Bluesky accounts are checked at each person's official and campaign website domains, and Threads posts that mention an issue can be collected once Meta approves access. See "What refreshes" below.</li>
    </ul></details>
    <details class="tv"><summary>Earlier changes (October 3, 2026)</summary>
    <ul class="list">
      <li><b>Voter alignment:</b> choose a side and an importance on ${ISS.length} issues ("My alignment" in the top menu, or the Voter alignment tab on any profile). See how each candidate's record compares, issue by issue, with every piece of evidence, its date, its type and the math. Candidates without enough evidence show "Insufficient data".</li>
      <li><b>Money and votes side by side:</b> each Legislative record tab now lists, issue by issue, the candidate's recorded actions next to the PACs and outside groups with a stake in that issue. These are shown as links only.</li>
      <li><b>Bill details:</b> every key vote now opens to the measure's official title, a cited summary, the recorded question and result, and why it is filed under its issue (or why it is not used for alignment).</li>
      <li><b>All 22 House toss-up races</b> (Cook, Sept. 25, 2026) are on the Races page: 8 with full profiles and 14 with verified nominees, campaign funds and outside spending.</li>
      <li><b>Simpler profiles:</b> five tabs (Overview, Funding, Legislative record, Statements vs. actions, Voter alignment). Ethics sits inside the Legislative record tab, and sources are one link away.</li>
      <li><b>Citations:</b> 37 Wikipedia citations were replaced with official, Ballotpedia or news sources. Claims those sources did not support were trimmed, such as unconfirmed primary percentages. Three errors were corrected: Paxton finished second, not first, in the March primary; the 2002 phone-jamming settlement was $135,000; Wess's primary share was 39.57%. One unconfirmed ethics item (Merrin) was removed.</li>
      <li><b>Ohio and Nebraska:</b> added the Ohio special election (Sen. Jon Husted vs. Sherrod Brown) and Nebraska (Sen. Pete Ricketts vs. independent Dan Osborn). Every Senate race rated Toss-up, Tilt or Lean by Cook, Inside Elections or Sabato is now covered, listed first on the Races page with its ratings.</li>
      <li><b>State legislative records:</b> candidates who served in a state legislature have a separate, labeled section with their seats and the votes and bills that could be sourced.</li>
      <li><b>Statement checks:</b> a direct contradiction is now separate from a pairing whose evidence is ambiguous or incomplete. The old "mixed" label is gone.</li>
      <li><b>Kinds of evidence:</b> race and comparison views say what kind of evidence each record rests on, and flag when candidates are compared on different kinds.</li>
      <li><b>Money kept apart:</b> campaign funds and outside spending are shown separately everywhere. The old "all PAC and super PAC money" total, which added outside spending to PAC checks the campaign received, was withdrawn.</li>
      <li><b>Super PAC percentage withdrawn:</b> it divided outside spending through Sept. 30 by campaign receipts through mid-2026. See "Super PAC share" below.</li>
      <li><b>Senators' headline figures:</b> now cover 2025–26, the same two years as everyone else, not their six-year Senate cycle.</li>
      <li><b>For or against:</b> outside spending now counts for or against a candidate only when it names that candidate or their current opponent. $6.86 million spent opposing Graham Platner, who withdrew from the Maine race, had been counted as help for Sen. Collins. It is now listed separately.</li>
      <li><b>Late and repeated filings:</b> spending dated before 2025 (2024-election ads filed late) is left out; it had added about $330,000, mostly to three House races. Seven items filed twice with the same transaction ID ($243,601, mostly in Alaska) now count once.</li>
      <li><b>Every item can be checked:</b> each independent expenditure (${nRows.toLocaleString()} items) and each itemized PAC contribution is on the Funding tab, with dates or report periods and links to the FEC filings.</li>
    </ul></details>
    <h2>The Overview page</h2>
    <p>Each profile opens on its Overview: the four grades, five small visuals and a short ethics list. Each reads in a few seconds, and each card links to a deeper tab.</p>
    <ul class="list">
      <li><b>Where the campaign's money comes from:</b> one bar splitting the FEC two-year total receipts into groups. The groups are small donors (gifts of $200 or less, the FEC's "unitemized" contributions), larger donors (over $200), PACs and other committees, party committees, the candidate's own money and loans, and joint-fundraising transfers and other receipts. They add up to total receipts, so nothing is left out or counted twice. A campaign with no FEC report yet shows a note instead.
        <ul class="list">
          <li><b>Second bar, by gift size:</b> individuals' money in the FEC's five size groups ($200 and under, $200.01–$499.99, $500–$999.99, $1,000–$1,999.99, $2,000 and over), from the daily refresh. Each gift counts by its own amount, so "$200 and under" also holds small gifts from donors who gave more in all, and can be larger than "small donors" in the first bar. Shown only, never in a grade.</li>
        </ul></li>
      <li><b>Outside money for and against:</b> two bars on one scale, with the three largest spenders named under each. They use the same totals as the Money &amp; Influence tab (see Outside spending below). This is never added to campaign money.</li>
      <li><b>How they compare with your choices:</b> one row per issue you chose in My alignment. No single percentage is shown. Until you choose issues, the card just invites you to.
        <ul class="list">
          <li><b>Check mark:</b> every recorded item on the issue matches your side.</li>
          <li><b>Cross:</b> none does.</li>
          <li><b>Half mark:</b> the record is split.</li>
          <li><b>Empty dashed circle:</b> no evidence. It never counts as a mismatch.</li>
        </ul></li>
      <li><b>Where they sit politically:</b> their DW-NOMINATE score as a dot among faint dots for every current member of their chamber. People with no congressional voting record show "No voting score". Below it, a second chart shows how they voted on bills marked liberal or conservative (see below).</li>
      <li><b>Do their words match their actions?:</b> counts of the checked statements the record supports, contradicts, partly supports or shows changed, and those that are unclear. It always says how many were checked, because a few checks are not a full picture.</li>
      <li><b>Ethics:</b> a text list, not a chart, because very different things should not look alike. Each item has one tag, taken from its own sources, and its outcome. The full entry with sources is on the Ethics tab.
        <ul class="list">
          <li><b>Allegation:</b> a complaint or report with no official finding.</li>
          <li><b>Investigation:</b> a formal inquiry, lawsuit or proceeding. It may be pending, closed, or ended without a finding against the person.</li>
          <li><b>Confirmed finding:</b> a court, agency or ethics body found a violation or set a penalty, or the person admitted it.</li>
          <li><b>Net worth:</b> for a sitting member, a range from their latest annual financial disclosure, under the list (see Ethics and compliance below).</li>
        </ul></li>
    </ul>
    <h2>Profile pages</h2>
    <p>Each profile has six tabs. The four in the middle are the home-page grades. Each grade tab opens with its letter, its percentage and the math, then the evidence. Old links to earlier tabs still work.</p>
    <ul class="list">
      <li><b>Overview:</b> the four grades, where the campaign's money comes from, outside money, how the record compares with your choices, where they sit politically, whether their words match their actions, and a short ethics list.</li>
      <li><b>Your match:</b> the comparison with your positions, issue by issue, with every piece of evidence. Then the record behind it: the career ideology score, key Senate or House votes with bill details, sponsored bills or other actions, any state legislative record, and the latest official bills and roll calls.</li>
      <li><b>Promises Delivered:</b> every statement check, pairing what was said with what the record shows. Then the latest official records: floor speeches, hearings, press releases, Vote Smart positions and ratings, fact-checks, videos, Bluesky and Threads posts, campaign-site snapshots and news.</li>
      <li><b>Ethics:</b> every ethics entry, most serious first, tagged with what it is and what it costs the grade. Then a case timeline, reviewed stock trades with charts, and the latest trades and leads from court records, FEC enforcement records and DOJ press releases. Leads are kept apart from scored cases.</li>
      <li><b>Workers > Profit:</b> a diverging bar, votes and sponsorships on bills scored by who gains, a tree map of the top 20 donors, how funders wanted the candidate to vote, and money and votes by issue. These show agreement, not that money changed a vote.</li>
      <li><b>Money &amp; Influence:</b> the Money &amp; Influence Analysis (below), where the campaign's money comes from, outside money for and against (also by month), campaign funds raised, cash on hand, every PAC contribution, money routed through PACs, every outside-spending group and item, the combined view, and the latest official filings.</li>
    </ul>
    <h2 id="m-grades">Grades on the home page</h2>
    <ul class="list">
      <li><b>Scale:</b> A is 90–100, B 80–89, C 70–79, D 60–69 and F below 60, after rounding to a whole percentage.</li>
      <li><b>Not graded:</b> shown when there isn't enough evidence. It is never a zero.</li>
      <li><b>Where the rules live:</b> one file, <span class="mono">public/grades.js</span>. The inputs are the same records shown on each profile.</li>
      <li><b>Full methodology:</b> with worked examples and open decisions, in <span class="mono">Scores/00_POLITICAL_SCORECARD_METHODOLOGY.md</span>.</li>
    </ul>
    <h3>Rule 1: actions count more than words</h3>
    <ul class="list">
      <li><b>Actions:</b> sponsoring or cosponsoring a bill, voting on it, or an official act (for officials who don't vote in Congress) each weigh ${WEIGHT.action}.</li>
      <li><b>Statements:</b> a speech or statement weighs ${WEIGHT.statement}. It is used only on an issue with no recorded action.</li>
      <li><b>One bill, one count:</b> sponsoring a bill and then voting on it counts once. If the two differ, the vote counts.</li>
      <li><b>Sides:</b> a Yea or a sponsorship takes the bill's marked side, and a Nay the other. Missed votes are not counted.</li>
      <li><b>State officials:</b> someone who never held federal office but held a state office is scored on that state record.</li>
    </ul>
    <h3>The four grades</h3>
    <ul class="list">
      <li><b>Your match:</b> how well the record matches the positions you chose in My alignment (see Voter alignment below).
        <ul class="list">
          <li><b>Each issue:</b> the share of the record on your side, weighted by how important you said the issue is. An issue backed only by statements counts at half its importance.</li>
          <li><b>Left out:</b> issues with no evidence.</li>
          <li><b>Needed:</b> evidence on at least 3 of your issues and half of your total importance.</li>
          <li><b>Private:</b> it uses only your own choices, saved in your browser.</li>
        </ul></li>
      <li><b>Promises delivered:</b> from the checks on each Promises Delivered tab. Each pairs a specific promise or stated position with what the record shows.
        <ul class="list">
          <li><b>Counts:</b> 1 if the record supports it, ½ if partly supported or the position changed, 0 if contradicted.</li>
          <li><b>Not acted on:</b> a promise the person could have acted on but didn't by the end of the term is closed as contradicted.</li>
          <li><b>Left out:</b> ambiguous checks, outcome checks, promises with no related bill yet, and vague goals such as "fight for families."</li>
          <li><b>Needed:</b> ${MIN_CHECKS} counted checks. True campaign promises are labeled "Promise".</li>
          <li><b>For a president:</b> PolitiFact's promise trackers are used instead (the Trump-O-Meter and MAGA-Meter for Donald Trump). Promise Kept counts 1, Compromise ½ and Promise Broken 0. Stalled and In the Works wait for a final rating.</li>
          <li><b>Money pledges:</b> a pledge to refuse corporate PAC money or single-issue PAC money, or to back a ban on members' stock trading, a lobbying ban for former members or overturning Citizens United, is checked again against the records on file each time the page loads. Company PACs come from the FEC's PAC types, counted from the first report that starts on or after the pledge (trade-association PACs are listed, not counted). Bans come from the bills' sponsors, cosponsors and votes. The result is shown under the reviewed verdict and never replaces it; where the records point the other way, the check is flagged for the next review.</li>
        </ul></li>
      <li><b>Ethics:</b> 100 − Legal Trouble Index − a tenth of the Insider Trading Index − a tenth of the Stock Disclosure Dodger Index, rounded. It never goes below 0, and an index without enough data costs nothing.
        <ul class="list">
          <li><b>Legal Trouble Index 🚨:</b> each case's status points × its kind × its age, totaled, with a ceiling of 100. Each case counts once, at its current status, and one matter is one case.</li>
          <li><b>Status points:</b> ${ETHICS_COST.finding} for a confirmed finding, ${ETHICS_COST.open} for an open investigation (including one with no public resolution), ${ETHICS_COST.closed} for one closed without a finding (an acquittal, dismissal, decision not to charge, ruling in the person's favor, or settlement without admission). Allegations, which no official body acted on, cost nothing.</li>
          <li><b>Kind:</b> criminal × ${CASE_KIND.criminal} (indictments, convictions, guilty pleas), ethics or civil × ${CASE_KIND.ethics}, technical × ${CASE_KIND.technical} (such as an FEC fine for a late report, or a late stock disclosure).</li>
          <li><b>Age:</b> × ${CASE_AGE.factor} when the case was decided more than ${CASE_AGE.years} years before the reviewed research. Open cases always count in full.</li>
          <li><b>Insider Trading Index 📈:</b> committee conflicts 40% (the dollar share of single-stock trades in sectors their committees oversee, using the middle of each disclosed range), trades near related votes 25%, trades in donors' companies 20%, and single-stock activity 15% (trades a year, with 50 counting as 100). It needs 5 reviewed trades; no trades scores 0.</li>
          <li><b>Blind trusts and divestment:</b> a qualified blind trust, certified by the House or Senate ethics committee, takes the trades its trustee makes out of both trading indexes, because the member neither chooses nor sees them. Trades they report outside it, or made before it, count as usual. Holding no individual stocks labels the index. A managed or "discretionary" account, an adviser who trades without asking, a spouse's account, or a trust that isn't a qualified blind trust is not excused: those trades count in full. Neither adds points; the grade starts at 100. Each status is reviewed and cited; the latest annual report only suggests one.</li>
          <li><b>Stock Disclosure Dodger Index 🙈:</b> trade reports filed after the ${LATE_DAYS}-day deadline or never 70%, and annual financial disclosures filed late 30%. It needs 3 required filings. A STOCK Act late-disclosure case moves here from the Legal Trouble Index once the person's trades are reviewed, so a late report never costs twice.</li>
          <li><b>Who counts:</b> spouse and dependent-child trades count and are labeled. A president's trades are listed on the Ethics tab, from OGE reports, but not scored. Other people not in Congress show "No trading data". Only reviewed trades count; new reports are listed for review first. Returns are never scored.</li>
        </ul></li>
      <li><b>Workers > Profit:</b> whether the record did more for working people or for the wealthy and corporations.
        <ul class="list">
          <li><b>Bill scores:</b> each bill is scored from −100 (fully corporate-backed) to +100 (fully worker-backed), from two equal parts.
            <ul class="list">
              <li><b>Who gains (50%):</b> a cited nonpartisan study (the Congressional Budget Office, the Joint Committee on Taxation, the Tax Policy Center or the Penn Wharton Budget Model), placed on one of five steps: ${Object.entries(GAINS_STEPS).sort((a,b)=>b[0]-a[0]).map(([k,t])=>`${Number(k)>0?'+':''}${k} ${esc(t.toLowerCase())}`).join('; ')}.</li>
              <li><b>Access counts as who gains too:</b> when a cited estimate shows a bill expands or cuts access to a basic need, mainly for lower- and middle-income households (health coverage, public schools, child care, food assistance, housing, or services like clean water and low-income broadband): +100 for a clear expansion, −100 for a clear cut, ±50 for a smaller or mixed change. With both money and access, their average is used. Access doesn't count for bills that fund the whole government, or for public money that mainly goes to companies.</li>
              <li><b>Who took a side (50%):</b> worker groups (${Object.values(BILL_GROUPS).filter(g=>g.side==='worker'&&!g.tax).map(g=>esc(g.org)).join(', ')}) count +100 for supporting a bill and −100 for opposing it. Business groups (${Object.values(BILL_GROUPS).filter(g=>g.side==='business'&&!g.tax).map(g=>esc(g.org)).join(', ')}) count the other way, so a business group opposing a bill counts toward workers. On tax bills, ITEP counts with the worker groups and the Tax Foundation with the business groups; on construction-pay measures, North America's Building Trades Unions and Associated Builders and Contractors do the same. Each side's groups are averaged, then the two sides. If both sides support a bill, it lands near 0.</li>
              <li><b>When they disagree:</b> if who gains and who took a side point opposite ways, the bill is Disputed: it's shown, but not scored. With only one part on file, that part decides, but a bill marked from groups' positions alone needs a worker group and a business group on opposite sides.</li>
              <li><b>Shown, not scored:</b> lobbying reports naming the bill (LDA.gov), split into unions and other clients, since a report doesn't say which side the client was on; CBO estimates that don't say who gains by income; and the White House's position, which follows the president's party.</li>
            </ul></li>
          <li><b>Bills that didn't pass:</b> count the same way. Sponsoring or cosponsoring one counts like a yes vote (cosponsors from Congress.gov). A cited public statement that names the bill counts half a vote, and a later vote or cosponsorship replaces it. Not cosponsoring counts for nothing. A bill counts once across its versions in different Congresses, with the latest vote winning.</li>
          <li><b>Counting:</b> each vote or sponsorship on a scored bill counts the bill's strength (its score ÷ 100) for the side it took, once per bill. A yes on a +75 bill adds 0.75 to the working-people side; a no adds 0.75 to the other side. The score is working-people points ÷ all points.</li>
          <li><b>For a president:</b> signing a marked bill or issuing a marked executive order counts for its side. A veto counts for the other side.</li>
          <li><b>Corporation Compromised Index 🏢 (a quarter of the grade):</b> the grade is 0.75 × the bills' score + 0.25 × (100 − the index). The index (0–100) has four parts. Business PACs' share of the money they raised: ${CORP_COMPROMISED.weights.pacShare*100}%, with ${CORP_COMPROMISED.pacCeiling}% of funds scoring 100. A business PAC is one the FEC records as sponsored by a corporation, trade association or cooperative, or by its sector when it isn't matched to its FEC record yet. Votes with business funders that gave to the campaign, compared with their party: ${CORP_COMPROMISED.weights.businessVotes*100}%, with ${CORP_COMPROMISED.voteCeiling} points above the party scoring 100, from 5 compared votes. Donor companies' employees' giving: ${CORP_COMPROMISED.weights.employees*100}%. The Profit side on bills their top donors lobbied on: ${CORP_COMPROMISED.weights.lobbiedBills*100}%. The last two aren't counted until their data is reviewed, and a part without data drops out, so the others are reweighted. Outside spending is left out. Without the index (no campaign money on file, or a president), the bills count alone.</li>
          <li><b>Needed:</b> ${MIN_PVP_ACTIONS} scored actions. ${PVP_MARKS.size?`${PVP_MARKS.size} bill${PVP_MARKS.size===1?' is':'s are'} marked so far.`:'<b>No bills are marked yet</b>, so no one is graded.'}</li>
        </ul></li>
    </ul>
    <h3>Outside money by month (on each card)</h3>
    <ul class="list">
      <li><b>What it shows:</b> outside money for the candidate (green) and against them (orange) for the last seven months, side by side. It covers general-election independent expenditures, not money given to the campaign.</li>
      <li><b>The line:</b> each month's for-to-against ratio, read on the right-hand scale. The scale runs from "all for" at the top, through 1 : 1, to "all against" at the bottom. The line is placed by the share spent for the candidate (3 : 1 is 75%, 1 : 3 is 25%). It breaks over a month with no outside money.</li>
      <li><b>Reading a ratio:</b> always for-to-against. "2.1 : 1" means $2.10 was spent for the candidate for every $1 against. "1 : 2.1" is the reverse.</li>
      <li><b>The badge:</b> the same ratio for all seven months. Green when more was spent for, orange when more was spent against, uncolored at 1 : 1. With nothing against, it reads "No opposing spending" (or "No supporting spending" for the reverse).</li>
      <li><b>Exact amounts:</b> hover over a month or the badge. Races with more than two candidates say "supporting" and "opposing".</li>
    </ul>
    <h2 id="method-scores">Score pages</h2>
    <p>The Scores menu has one page per grade, plus ideological position. Each ranks all ${ALL.length} people. Every chart shows how many data points are behind each grade. "Not graded" people show as grey rows instead of being left out. Gauges, pie charts and radar charts are not used.</p>
    <ul class="list">
      <li><b>Your match:</b> ranked bars colored by grade, and an issue-by-issue breakdown for one person, most important issues first.</li>
      <li><b>Promises delivered:</b> one stacked bar per person in raw counts (supported, partly supported, changed position, contradicted). A grade built on 3 checks looks different from one built on 20.</li>
      <li><b>Ethics:</b> stacked bars of points lost by kind, for people with deductions, and how many have no recorded cases.</li>
      <li><b>Workers > Profit:</b> bars centered at 50%, and a chart of Workers > Profit against DW-NOMINATE to spot outliers.</li>
      <li><b>Ideological position:</b> the whole chamber on the DW-NOMINATE scale, with one person highlighted.</li>
    </ul>
    <h2 id="method-influence">Money &amp; Influence Analysis</h2>
    <ul class="list">
      <li><b>Where it shows:</b> on each Money &amp; Influence tab, beside the grades, never inside them.</li>
      <li><b>Correlation, not cause:</b> it shows timing and alignment. It does not prove that money caused a decision.</li>
      <li><b>Settings under review:</b> the top ${TOP_DONORS} donors, a ${SWING*100}% change, and a ${WINDOW_MONTHS}-month window.</li>
    </ul>
    <h3>What it measures</h3>
    <ul class="list">
      <li><b>Vote Donor Alignment:</b> votes on bills where a donor group took a public position (in its scorecard or key-vote letter). It is the share that went the group's way. Missed votes are not counted.</li>
      <li><b>Donor Loyalty 🤝:</b> how much more often they vote the way their funders wanted than the rest of their party does on the same votes. For each group that gave to the campaign or spent for them, their rate of voting its way minus the party's rate, from the official roll calls' party totals with their own vote left out (Voteview's copy of a Senate vote when Senate.gov won't send it, kept only when its totals match the recorded result). The groups are weighted by the money each gave, bundled from its donors or spent for them, but no group counts for more than all the others put together (at most half the weight), so one large funder with a single position on file can't decide the number alone. Only the part above the party counts: ${DONOR_LOYALTY.ceiling} points above scores 100. It needs ${DONOR_LOYALTY.minVotes} compared votes. Independents are compared with the party they caucus with.</li>
      <li><b>Speech Donor Alignment:</b> not measured yet. Floor speeches arrive from the Congressional Record, but must first be sorted by issue and side.</li>
      <li><b>Donations by month:</b> each group's PAC giving to the campaign by month (FEC bulk data since ${H0()}), with the votes it took a side on marked under its row.</li>
      <li><b>Top donor organizations:</b> from the daily FEC refresh, the top ${TOP_DONORS} organizations, each combining its PAC with its employees' itemized giving, grouped by employer. Donors' names are never shown, as FEC rules on reusing contributor information require.</li>
      <li><b>Timing flags (for review, not scored):</b>
        <ul class="list">
          <li>Donations rose ${SWING*100}% or more in the ${WINDOW_MONTHS} months after a vote the group wanted, compared with the ${WINDOW_MONTHS} months before.</li>
          <li>Donations dropped ${SWING*100}% or more after a vote it opposed.</li>
          <li>A position change on an issue followed a ${SWING*100}% shift in donations from a group that took positions on it.</li>
          <li>The person held or traded stock in a group that donated and took positions on bills they acted on.</li>
          <li>A window that runs past the data is not judged.</li>
        </ul></li>
      <li><b>Who had a stake:</b> lobbying reports (LDA.gov) for top donor organizations that name a bill the person sponsored, cosponsored or voted on. Also listed, as context: foreign-agent registrations (FARA), comments on federal rules (Regulations.gov) and federal contracts (USAspending, matched through SAM.gov company IDs).</li>
      <li><b>Outside spending by sector:</b> money spent for and against, each bar split by the groups' sectors. Outside spending is a plain number, not a grade, because the person cannot legally coordinate with these groups.
        <ul class="list">
          <li><b>People-aligned:</b> unions.</li>
          <li><b>Profit-aligned:</b> industry and corporate groups.</li>
          <li><b>Other:</b> party, ideological and candidate-aligned groups.</li>
          <li><b>Sectors:</b> outside spenders have no industry code, so this app assigns one from the committee's name, as for PACs. Under review.</li>
        </ul></li>
      <li><b>Top donors tree map (Workers > Profit tab):</b> tile size is the amount given. Unions and small-dollar donors (one tile) are People-aligned. Corporate PACs and industry groups are Profit-aligned. Leadership, party and ideological committees are Other.</li>
    </ul>
    <h2 id="method-sources">What refreshes, and how sources are merged</h2>
    <ul class="list">
      <li><b>Grades:</b> based on the reviewed research.</li>
      <li><b>Latest official records:</b> official sources refresh daily (weekly for court records, LegiScan and committee meetings). They show under "Latest official records" on each tab.</li>
      <li><b>Nothing new changes a grade by itself:</b> new votes, bills, speeches, trades, filings and leads are listed for review. A grade changes only after the reviewed research is updated and the monthly recalculation runs.</li>
      <li><b>Merging:</b> where several sources cover the same thing, each record shows once.
        <ul class="list">
          <li><b>Stock trades:</b> read from the members' own reports: House members' PDFs from the House Clerk, and senators' reports from the Senate eFD site. Bargo, Eulerpool and Financial Modeling Prep are a cross-check, matched by member, company, date, buy or sell and amount range. The official report's date wins, a trade only a service reports goes to review, and a report filed on paper is listed to check by hand.</li>
          <li><b>Hearings:</b> a Congress.gov committee meeting and its GovInfo transcript are one hearing, matched by the transcript's number or the same title on the day it was held. The meeting gives the witnesses and documents, the transcript the text and who attended.</li>
          <li><b>Legal leads:</b> a CourtListener docket and opinion in the same case are one case, and a DOJ press release that cites its docket number joins it. FEC enforcement records are listed alongside. Nothing is joined on a name or date alone.</li>
          <li><b>Statements:</b> the same message as a press release, a Bluesky or Threads post, or a YouTube video shows once, when a post links to the release or repeats most of its words within 3 days.</li>
          <li><b>Top donor organizations:</b> for each organization whose employees gave the most, what LDA.gov (lobbying), FARA, Regulations.gov, SAM.gov and USAspending found for the same name, in one row.</li>
          <li><b>The president's trades:</b> from the president's OGE Form 278e and 278-T reports, as compiled in <a href="https://github.com/disclosedcapitol/executive-branch-trades" target="_blank" rel="noopener">Disclosed Capitol's executive-branch-trades dataset ↗</a> (CC BY 4.0) and imported by hand. A trade listed on two reports shows once. Listed on the Ethics tab, not scored.</li>
          <li><b>State bills:</b> Open States and LegiScan, by state, session year and bill number.</li>
          <li><b>News:</b> GDELT and the New York Times, by link.</li>
        </ul></li>
      <li><b>Disagreements:</b> flagged for review.</li>
      <li><b>Posts and press releases:</b> listed as statements, never as actions.
        <ul class="list">
          <li><b>Press releases:</b> from the RSS feed on each member's official website. They often carry the same message as the office's posts on X and Facebook.</li>
          <li><b>Bluesky:</b> each person's official and campaign website domains are checked as handles, since only a domain's owner can use one. Other accounts are added only when they are linked from those websites or carry Bluesky's verified badge with the person's name (<span class="mono">npm run social:bluesky</span>).</li>
          <li><b>Threads:</b> each account is searched for the site's ${ISS.length} issues, so only posts that mention one are collected. It needs Meta's approval to search other people's posts. A Threads account uses its Instagram username.</li>
          <li><b>Not collected:</b> X and Facebook, which have no free way to read other people's posts.</li>
        </ul></li>
      <li><b>Leads:</b> court records, FEC enforcement records, DOJ press releases and news. A lead becomes a scored case only after its status is confirmed from an official record. <a href="#updates">See every source and its status</a>.</li>
    </ul>
    <h2 id="method-log">Monthly recalculation and change log</h2>
    <ul class="list">
      <li><b>What is recalculated:</b> Promises delivered, Ethics and Workers > Profit, once a month after the month's review.</li>
      <li><b>How:</b> <span class="mono">npm run scores:monthly</span> records every change, and why, in <span class="mono">public/score-log.json</span>.</li>
      <li><b>Not logged:</b> Your match, since it depends on your own choices.</li>
      <li><b>On each grade tab:</b> when it was last recalculated, and a note if reviewed edits have changed the grade since.</li>
    </ul>
    ${methodLog()}
    <h2>Key votes marked liberal or conservative</h2>
    <ul class="list">
      <li><b>How a side is marked:</b> each key vote is checked against the issues it is coded to. Where an issue is a clear liberal-versus-conservative question in U.S. politics today, one side is marked liberal and the other conservative (listed below).</li>
      <li><b>All issues must agree:</b> a bill is marked only if every issue it is coded to points the same way.</li>
      <li><b>Left unmarked:</b> bills on unmarked issues, bipartisan deals, nominations and stopgap funding bills. Each shows its reason on the Your match tab.</li>
      <li><b>A judgment call:</b> kept in one place (<span class="mono">liberalSide</span> on each issue in <span class="mono">research.json</span>), so it can be reviewed and changed.</li>
    </ul>
    <ul class="list">${ISS.map(i=>i.liberalSide?`<li><b>${esc(i.label)}:</b> liberal side = "${esc(i[i.liberalSide])}"; conservative side = "${esc(i[i.liberalSide==='A'?'B':'A'])}".</li>`:`<li><b>${esc(i.label)}:</b> not marked. ${esc(i.leanNote)}</li>`).join('')}</ul>
    <ul class="list">
      <li><b>Counting:</b> only marked bills the person voted on count. A Yea takes the bill's marked side, and a Nay takes the other. Missed votes, and bills from before the person took office, are not counted.</li>
      <li><b>Minimum:</b> a position shows only with at least ${KV_MIN} such votes. The chart places the person by the share of those votes on the conservative side.</li>
      <li><b>Not an ideology score:</b> this counts a small, selected set of important votes. It can be compared only within a chamber, because the House and Senate sets differ. Don't confuse it with the DW-NOMINATE career score, which uses every roll call.</li>
      <li><b>Vote text:</b> always plain black. The "Side taken" column says whether each vote was on the liberal or conservative side.</li>
    </ul>
    <h2>Position by issue</h2>
    <ul class="list">
      <li><b>What it shows:</b> on the Your match tab, a bar for each issue category, toward the liberal or the conservative side, by how much of the person's record on it is on each side. Context only, never part of a grade.</li>
      <li><b>Evidence:</b> the same as Your match: votes, sponsored bills and official acts, one credit per bill. Statements count at half, and only for an issue with no recorded action.</li>
      <li><b>Sides:</b> each issue's liberal side, listed above. Issues that aren't marked (trade, foreign policy, Jan. 6, infrastructure) aren't placed.</li>
      <li><b>Categories:</b> immigration, taxes and spending, civil liberties, environment, health care, abortion, guns, workers, trade, foreign policy, voting, education, criminal justice, LGBTQ rights, housing, and Social Security and Medicare. Civil liberties, criminal justice, housing, and Social Security and Medicare have no tracked issue yet.</li>
      <li><b>Minimum:</b> one action or statement for now. A thin record shows its count beside the bar.</li>
    </ul>
    <h2>Portraits</h2>
    <ul class="list">
      <li><b>Sources:</b> for people who served in Congress, usually their official congressional portrait, a public-domain U.S. government photo, from the <a href="https://github.com/unitedstates/images" target="_blank" rel="noopener">unitedstates/images</a> project. Photos of the other candidates, and of Sens. Cory Booker and Jon Husted, were supplied by the site's editor for use here.</li>
      <li><b>Same size for everyone:</b> the background is removed automatically, and each face is scaled and placed the same way. One person is shown about 15% smaller so a wide-brimmed hat fits the frame.</li>
      <li><b>Clothing:</b> where a photo was cropped tightly, the clothing is extended into the bottom of the circle.</li>
      <li><b>Older photos:</b> former members' official photos date from their time in Congress, which for some was years ago.</li>
      <li><b>Missing photo:</b> every profiled person has one now. If one fails to load, the card shows their initials.</li>
    </ul>
    <h2>Who is covered</h2>
    <ul class="list">
      <li><b>Senate incumbents:</b> six senators on the November 3, 2026 ballot, three Republicans and three Democrats, as a bipartisan mix of competitive and safe seats. Two senators first picked were replaced because they won't be on the ballot: Sen. Lindsey Graham (R-SC) died in July 2026, and Sen. Markwayne Mullin (R-OK) left the Senate for an administration post.</li>
      <li><b>House:</b> the Cook Political Report rates 22 House races Toss-up (Sept. 25, 2026). Eight have full profiles of both nominees, four seats held by each party. The other 14 are on the Races page with funding only: their nominees (verified from results or news reports), campaign funds and outside spending. Their records, statements and ethics are not researched yet.</li>
      <li><b>Challengers and open seats:</b> every opponent of those incumbents, and both major-party nominees in each open Senate race (plus independent Seth Bodnar in Montana). Nominees were confirmed from primary and runoff results.</li>
      <li><b>Every other senator:</b> a basic profile for each sitting senator not in these races (see the <a href="#senate">Senate</a> page): their place in the Senate, their committees, and the records the daily refresh collects. No grades until their research is reviewed. The list comes from the congress-legislators project.</li>
      <li><b>Ohio and Nebraska:</b> Sen. Jon Husted (appointed in January 2025) and Sen. Pete Ricketts are profiled with their opponents, Sherrod Brown and independent Dan Osborn. No Democrat is on the Nebraska ballot: the nominee withdrew in July 2026 and the state party named no replacement.</li>
    </ul>
    <h2>Competitive races</h2>
    <ul class="list">
      <li><b>Senate:</b> a race is competitive when at least one forecaster rates it Toss-up, Tilt or Lean. The forecasters are the Cook Political Report (Sept. 23), Inside Elections (Sept. 17) and Sabato's Crystal Ball (Sept. 22, 2026), as compiled in Wikipedia's ratings table.</li>
      <li><b>The ten races:</b> Alaska, Georgia, Iowa, Kansas, Maine, Michigan, New Hampshire, North Carolina, Ohio and Texas. All are covered.</li>
      <li><b>Nebraska:</b> rated Likely Republican by all three, but Toss-up or Lean by some other forecasters. It is included.</li>
      <li><b>House:</b> chosen from Cook's toss-up list at the time of research. The ratings have not been re-checked.</li>
    </ul>
    <h2>Campaign funds raised</h2>
    <ul class="list">
      <li><b>Source:</b> the FEC's two-year summary (2025–26) for each campaign's main committee, through its latest report, usually June 30, 2026.</li>
      <li><b>What it includes:</b> the FEC's total receipts. That is individual gifts, PAC and party contributions, transfers from joint fundraising committees, the candidate's own loans and contributions, and other receipts.</li>
      <li><b>Self-funding:</b> noted when the candidate's own money is more than 20% of the total.</li>
      <li><b>Cash on hand and debts:</b> as of the same date.</li>
      <li><b>Next reports:</b> third-quarter reports, through Sept. 30, are due October 15, 2026.</li>
    </ul>
    <h2>PAC contributions</h2>
    <ul class="list">
      <li><b>Part of campaign funds:</b> each row is one contribution itemized on FEC Schedule A, line 11C.</li>
      <li><b>Reports used:</b> 2025–26 reports for senators, and January–June 2026 reports for everyone else.</li>
      <li><b>Dates:</b> the FEC lists contributions by report, so each row shows its report and period, not an exact date.</li>
      <li><b>Transcription:</b> rows were copied from the FEC's report viewer. Where some couldn't be read, the profile shows the share covered and doesn't estimate the rest.</li>
      <li><b>Sectors:</b> assigned by this app from each committee's name and sponsor, not by the FEC. Committees that can't be identified are left unclassified.</li>
      <li><b>FEC type:</b> each PAC's type as the FEC records it from the committee's own registration: corporate, trade association, membership group, cooperative, labor union, lobbyist, leadership PAC, nonconnected, another candidate's committee, party or joint fundraiser. Each name on file is matched to its FEC committee ID first; a name that could be two committees is left unmatched. Shown in the PAC table, a by-type chart and each PAC's description once the lookup has been run (<code>npm run pacs:types</code>). Shown only, never in a grade.</li>
      <li><b>Orientation:</b> shown only where a group's political purpose is documented.</li>
    </ul>
    <h2>Outside spending (independent expenditures)</h2>
    <p>An independent expenditure is spending on ads, mail or canvassing that supports or opposes a candidate. A group that may not coordinate with the campaign pays for it. It is never money the campaign raised.</p>
    <ul class="list">
      <li><b>Data:</b> ${esc(IE.source)} Items run from January 1, 2025 to ${fmtDate(IE.asof)}, by the date they went out. Three filings were spot-checked against FEC images.</li>
      <li><b>For a candidate:</b> items supporting them, plus items opposing their current opponent.</li>
      <li><b>Against:</b> items opposing them, plus items supporting the opponent.</li>
      <li><b>Anyone else:</b> items naming someone else (a primary candidate, or a nominee who withdrew) are listed separately and counted for no one.</li>
      <li><b>Three-way races (Montana):</b> spending against one candidate can't be credited to a single rival. Profiles count only spending aimed directly at that candidate, and list spending aimed at rivals separately.</li>
      <li><b>Who paid:</b> super PACs, other outside groups (nonprofits and traditional PACs) and party committees. Party coordinated spending is a different category and is not included.</li>
      <li><b>Negative amounts:</b> corrections filed by the spender. They are kept so totals match the filings.</li>
      <li><b>Filed twice:</b> an item in two filings that are identical in every field, including its transaction ID, counts once, from the latest filing.</li>
      <li><b>Possible repeats:</b> items identical except for the transaction ID are kept, because the filings list them separately. They are flagged, and their total is stated on the profile.</li>
      <li><b>Date capped:</b> notices filed in advance with a date after the cut-off show as Sept. 30.</li>
      <li><b>Split costs:</b> when one ad both supports a candidate and opposes the opponent, both lines count toward "for" the same candidate, so the split doesn't change the totals. If a spender reported the full cost on both lines, the totals would be too high. This app adds lines as filed and can't check the split without the filing images.</li>
      <li><b>Not included:</b> spending on third-party and independent candidates, which is missing from the compiled data, so Montana (Seth Bodnar) is marked incomplete. Primary-election spending is also not included.</li>
    </ul>
    <h2>Combined view</h2>
    <ul class="list">
      <li><b>When it shows:</b> only where both parts cover the same dates. That is campaign funds through the latest report, plus outside spending for the candidate on or before that day.</li>
      <li><b>Shown separately:</b> outside spending after that date, and spending against the candidate.</li>
      <li><b>No double counting:</b> PAC and party contributions are already in campaign funds. Independent expenditures never pass through the campaign. The FEC records earmarked donations routed through PACs as individual contributions.</li>
    </ul>
    <h2>Super PAC share</h2>
    <ul class="list">
      <li><b>Withdrawn for now:</b> the earlier figure divided super PAC spending through Sept. 30 by campaign receipts through mid-2026. Those are two different periods, and most general-election spending came after June.</li>
      <li><b>Planned replacement:</b> <b>super PAC spending for the candidate ÷ (campaign funds raised + all outside spending for the candidate)</b>, both covering January 1, 2025 to September 30, 2026. It will be computed once third-quarter reports are filed (due October 15).</li>
      <li><b>Limits:</b> labeled general-election only. Not shown for three-way races or races marked incomplete.</li>
      <li><b>Dropped:</b> the earlier Low/Moderate/High bands, which were never validated.</li>
    </ul>
    <h2>Money routed through PACs on donors' behalf</h2>
    <ul class="list">
      <li><b>How it works:</b> some groups bundle their members' donations. Members give through the group's PAC, which forwards each gift to the candidate as an "earmarked" contribution.</li>
      <li><b>Why it's hidden:</b> the FEC treats this as individual money, so it doesn't show in a PAC breakdown even when a group directed it. It is already in campaign funds raised, so it is never added to them.</li>
      <li><b>Groups read for everyone:</b> AIPAC, Club for Growth, EMILY's List, J Street and the Senate Conservatives Fund. For each profiled campaign, what each group's PAC forwarded is read from the PAC's own FEC reports (its disbursements to that campaign marked "earmark"), for the cycles its PAC reports cover. A group that reports a total line with each gift listed below it is counted from the total line, so nothing counts twice. The PAC's own checks stay in the PAC table.</li>
      <li><b>Left out:</b> ActBlue and WinRed, which forward gifts for any campaign that uses them, so the campaign, not a group, chose them.</li>
      <li><b>Researched by hand:</b> where the FEC reading misses a total found in the filings by a reporter, the hand-researched total is used and labeled. Sen. Booker: $707,803 through AIPAC's PAC from January to September 2025, as tallied from FEC filings by Sludge; $5,000 of it was the PAC's own check, so $702,803 counts as bundled.</li>
      <li><b>Where it counts:</b> beside each group's own money in the funder list, a table on the Money &amp; Influence tab and a tag on the Bills page. It counts as that group's money in Donor Loyalty 🤝 and Vote Donor Alignment, never in a grade.</li>
      <li><b>Anyone else:</b> no row means none of these groups forwarded gifts to that campaign in the FEC's processed records as of the date shown. Other groups that bundle aren't read yet.</li>
    </ul>
    <h2>Voting ideology (liberal–conservative %)</h2>
    <ul class="list">
      <li><b>Score:</b> Voteview's DW-NOMINATE first-dimension score, from every roll call a member has cast. −1 is most liberal and +1 most conservative.</li>
      <li><b>Source:</b> the Open Chambers mirror of Voteview data (built September 30, 2026), spot-checked against Voteview.</li>
      <li><b>Percentile:</b> compared with the other current members of the same chamber who have at least 100 scored votes (${DATA.pools.S.length} senators, ${DATA.pools.H.length} representatives).</li>
      <li><b>Party unity:</b> the share of party-line votes cast with the party majority in the 119th Congress.</li>
      <li><b>State legislators:</b> no published state score is comparable, so they show their record instead.</li>
    </ul>
    <h2>Records for candidates who are not in Congress</h2>
    <p>Each candidate's record comes from the office they actually held, in clearly labeled sections:</p>
    <ul class="list">
      <li><b>Congressional record:</b> U.S. roll-call votes and sponsored bills.</li>
      <li><b>State legislative record:</b> seats held, recorded votes, bills authored or sponsored, and leadership posts.</li>
      <li><b>Record in executive office:</b> major official acts with their outcomes.</li>
      <li><b>Other documented record:</b> for candidates who never held office, public actions and platform commitments.</li>
      <li><b>No inferred votes:</b> a state vote is shown only where a source shows that person's own vote.</li>
      <li><b>Gaps:</b> many state journals from before about 2010 are not online, so several state records are short or empty. Each section says what was searched.</li>
      <li><b>Filing:</b> each state item notes why it is filed under its policy area.</li>
      <li><b>Comparisons:</b> flagged when candidates' records are different kinds of evidence, because those can't be compared directly.</li>
    </ul>
    <h2>Legislative record</h2>
    <ul class="list">
      <li><b>Senate:</b> ${sv} roll calls from the 117th–119th Congresses, from the Senate's official vote records.</li>
      <li><b>House:</b> ${hv} roll calls from 2021–2026, from the House Clerk's records (via the Open Chambers mirror for 2025–26, checked against the Clerk for sampled votes).</li>
      <li><b>Picked by this app:</b> to cover major issues of the period. Each opens to the measure's official title, a cited summary, the question and result, and whether it is used for voter alignment, and why.</li>
    </ul>
    <h2>Statements vs. actions</h2>
    <p>Each check pairs a dated, sourced statement with a dated, sourced action. The label rates that pairing, not whether the policy is good. Checks were picked for being important and verifiable, not as a sample of everything a candidate has said.</p>
    <ul class="list">
      <li><b>Consistent:</b> the action matches the statement.</li>
      <li><b>Direct contradiction:</b> the record directly conflicts with what was said, such as a claimed amount the official record shows was not reached.</li>
      <li><b>Partly consistent:</b> part of the record matches the statement, and part conflicts with it.</li>
      <li><b>Ambiguous or incomplete evidence:</b> the statement and action point different ways, but whether they conflict depends on how you read them (different bills, different stated reasons). Or the record is incomplete, for example because of absences.</li>
      <li><b>Changed position:</b> a clear or admitted reversal.</li>
      <li><b>Outcome check:</b> the action fit the reasons given at the time, but later events bear on it.</li>
    </ul>
    <h2>Ethics and compliance</h2>
    <ul class="list">
      <li><b>Covered:</b> findings by ethics bodies, enforcement actions, reported STOCK Act late disclosures, complaints and referrals (with their documented outcome), and investigations that ended without charges.</li>
      <li><b>Sources:</b> a partisan outlet is never the only source.</li>
      <li><b>"None found":</b> the listed searches turned up nothing. That does not mean nothing exists.</li>
      <li><b>Net worth:</b> for each sitting member, from their latest annual financial disclosure (an amendment over the original), read weekly: House reports from the House Clerk's disclosure index, senators' from Senate eFD. The forms give every value as a range, so net worth is a range too: the lowest is every asset at the bottom of its range minus every debt at the top of its, and the highest is the reverse. A range with no upper limit ("Over $50,000,000") shows as "or more". A home and its mortgage aren't on the form unless the home earns income, so neither is counted. Candidates who never served aren't covered yet. Shown only, never in a grade.</li>
    </ul>
    <h2>Voter alignment</h2>
    <ul class="list">
      <li><b>Issues:</b> ${ISS.length} issues, each with two sides written neutrally: ${ISS.map(i=>esc(i.label)).join('; ')}. The list covers only issues where records could be documented, so many topics voters care about are left out.</li>
      <li><b>Answering:</b> on My alignment, each issue is one statement. Agreeing takes the issue's first side, and disagreeing the second.</li>
      <li><b>Importance:</b> strongly agree or disagree counts as high (3). Agree or disagree counts as medium (2). Neutral is recorded but left out of every score.</li>
      <li><b>Same answers everywhere:</b> each question lists the key votes it is compared with. Your answers are also used on each Your match tab and in the home-page "Your match" grade.</li>
      <li><b>Evidence from votes:</b> a key vote is assigned to an issue only when the measure's content makes the direction clear, with the reason shown under "Bill details". Nominations, stopgap spending bills, bundled packages and lopsided votes are not used; each shows why. When a member voted more than once on a bill, only the final vote counts.</li>
      <li><b>Other evidence:</b> state votes, sponsored bills, official actions and statements are coded only when the item's own words make the side clear, and each shows the reason. Coding was proposed item by item, then reviewed. Two items coded from a bill title alone were removed. No vote is inferred, and absences never count.</li>
      <li><b>Score per issue:</b> the share of recorded actions (votes, bills, official actions) on your side. Stated positions are used only for an issue with no recorded action, and are labeled.</li>
      <li><b>Overall figure:</b> Σ (importance × agreement) ÷ Σ importance of covered issues. Issues without evidence are left out, not scored as zero.</li>
      <li><b>When it shows:</b> evidence must cover at least three of your issues (or all of them, if you chose fewer than three) and half of your total importance. Otherwise you see "Insufficient data".</li>
      <li><b>Keep in mind:</b> it compares a record with your choices. It is not a rating of the candidate. Candidates with more votes on record have more chances to differ from you.</li>
      <li><b>Your choices:</b> stored only in your browser. The example starting points are labeled by their content, and every choice can be changed.</li>
    </ul>
    <h2>Money and votes side by side</h2>
    <p>For each issue, the Workers > Profit tab lists the candidate's recorded actions next to groups linked to that issue.</p>
    <ul class="list">
      <li><b>How groups are linked:</b> by their documented stance or description (for example, a gun-rights or environmental group), by their name, or by the sector this app assigned to a PAC (for example, oil and gas for climate and energy). The reason is shown.</li>
      <li><b>Amounts:</b> PAC contributions to the campaign in the itemized reports, and outside spending for or against the candidate, with dates.</li>
      <li><b>Correlation, not cause:</b> this is a link to explore, not evidence that money changed a vote. Groups often back candidates who already agree with them.</li>
    </ul>
    <h2>Funders' own positions vs. votes</h2>
    <ul class="list">
      <li><b>Which groups:</b> those that gave to a campaign or spent on a race, and publish congressional scorecards or "key vote" letters.</li>
      <li><b>What is recorded:</b> which way the group wanted each key vote to go, from its own scorecard or letter (or, as a second choice, a news report quoting it). The candidate's recorded vote is shown beside it.</li>
      <li><b>Exact match only:</b> a position is recorded only for the same roll call (or, for a public letter, the same bill at the same stage). Nothing is inferred from a group's general mission.</li>
      <li><b>Left out:</b> two positions whose exact roll call couldn't be confirmed from a page that was read (AFL-CIO on the March 2025 stopgap bill; NFIB on the Senate's 2025 budget-bill vote).</li>
      <li><b>Groups researched:</b> ${GP.map(g=>esc(g.org)+' ('+g.nPositions+' positions'+(g.status==='pending'?', research in progress':'')+')').join('; ')}.</li>
      <li><b>Matching money:</b> groups are matched to money by the names of the committees they control.</li>
      <li><b>Not researched:</b> party-aligned super PACs, which make most of the outside spending in these races.</li>
      <li><b>Correlation, not cause:</b> agreeing with a funder's positions is not evidence that money changed a vote.</li>
    </ul>
    <h3>Money and votes over time</h3>
    <p>Under each comparison, a timeline shows the group's money to or about the candidate by month since ${H0()}. The compared votes are numbered circles on the same time axis.</p>
    <ul class="list">
      <li><b>Above the line:</b> contributions to the campaign from the group's PACs, and independent expenditures supporting the candidate.</li>
      <li><b>Below the line:</b> independent expenditures opposing the candidate. This is money spent to defeat them, not money they received.</li>
      <li><b>Committees:</b> listed under each chart, including the group's own connected PAC where the FEC committee file names the group.</li>
      <li><b>Contributions:</b> direct and in-kind, from the FEC bulk file of committee contributions to candidates (2020–2026 cycles), by transaction date. They include earlier campaigns for another office (for example, a House member now running for the Senate), matched by FEC candidate ID. Memo lines are left out.</li>
      <li><b>Outside spending:</b> before 2025, from the same bulk file. From January 2025, from the outside-spending data used everywhere else on this site, because the bulk file misses the latest 24- and 48-hour notices.</li>
      <li><b>What counts:</b> only general-election items that name the candidate directly, including runoffs after a general election (such as Georgia's in January 2021). Primary spending and spending about an opponent are not shown, so a chart's total can be lower than the totals above it.</li>
      <li><b>Correlation, not cause:</b> money arriving before or after a vote does not show that it changed the vote. Groups mostly fund people who already vote their way, and spend most in the months before an election.</li>
    </ul>
    <h2>Glossary</h2>
    <dl class="kvd">
      <dt>Campaign funds raised</dt><dd>${esc(GLOSS.receipts)}</dd>
      <dt>Independent expenditure</dt><dd>${esc(GLOSS.ie)}</dd>
      <dt>Outside spending</dt><dd>All independent expenditures by super PACs, other outside groups and party committees. "For" a candidate means supporting them or opposing their opponent.</dd>
      <dt>Super PAC</dt><dd>${esc(GLOSS.superpac)}</dd>
      <dt>PAC contribution</dt><dd>${esc(GLOSS.pac)}</dd>
      <dt>Joint fundraising transfer</dt><dd>${esc(GLOSS.transfers)}</dd>
      <dt>Earmarked contribution</dt><dd>${esc(GLOSS.earmarked)}</dd>
      <dt>Roll call</dt><dd>A recorded vote. Each member's position is listed by name in the official record.</dd>
      <dt>Cloture</dt><dd>A Senate vote to end debate. It usually needs 60 votes. A vote for cloture is a vote to move a measure forward.</dd>
      <dt>DW-NOMINATE</dt><dd>A political-science score of where a member of Congress sits on a left–right scale, estimated from all their roll-call votes.</dd>
      <dt>Insufficient data</dt><dd>Shown instead of an alignment figure when the evidence covers too few of your chosen issues.</dd>
    </dl>
    <h2>Automatic refresh checks</h2>
    <ul class="list">
      <li><b>Before publishing:</b> the update service checks source IDs, required fields, amounts, page-by-page fetching, and vote identities.</li>
      <li><b>If an update fails:</b> the previous published records are kept.</li>
      <li><b>Reviewed research:</b> stays the imported snapshot. It is not fact-checked or reclassified automatically.</li>
      <li><b>History and coverage:</b> on the <a href="#updates">API updates</a> and <a href="#websites">Website updates</a> pages.</li>
    </ul>
    <h2>Known gaps</h2>
    <ul class="list">
      <li><b>Dates:</b> campaign funds run through each campaign's latest report (mostly June 30, 2026). Outside spending runs through ${fmtDate(IE.asof)}.</li>
      <li><b>No report yet:</b> Troy Jackson (D-ME) has not filed a financial report.</li>
      <li><b>Missing PAC rows:</b> two of Sen. Collins' reports (Year-End 2025 and Pre-Primary 2026) could not be retrieved, so those PAC rows are incomplete. Several other candidates' rows are a few short of their reports' totals; each profile shows its coverage.</li>
      <li><b>Possible duplicate:</b> one of Sen. Marshall's reports (April 2025) transcribed to $5,000 more than the report's subtotal. It is flagged on Marshall's profile.</li>
      <li><b>Earmarked totals:</b> read for five groups that bundle (see above). Other groups' bundling isn't read yet, and the FEC reading can miss gifts a conduit reported in an unusual way, as it did for Sen. Booker.</li>
      <li><b>Net worth:</b> only for sitting members, and a paper-filed report can't be read.</li>
      <li><b>House toss-ups:</b> 14 of the 22 are shown with funding only. Their candidates have no record, statement or ethics research yet.</li>
      <li><b>Issue list:</b> covers ${ISS.length} issues that could be documented. Candidates whose records are mostly on other topics (for example, Texas education bills) have little coded evidence. Several candidates without a voting record show "Insufficient data".</li>
      <li><b>Primary results:</b> some 2026 primary percentages could not be confirmed against certified results and were removed from status lines.</li>
      <li><b>State records:</b> thin where old journals are offline. None could be sourced for Chris Pappas or Juliana Stratton, and only a leadership post for Mary Peltola and Mariannette Miller-Meeks.</li>
      <li><b>Independent candidates:</b> outside spending on Dan Osborn (Nebraska) and Seth Bodnar (Montana) is missing from the compiled data, so those races are marked incomplete.</li>
      <li><b>Sherrod Brown's ideology score:</b> Voteview's page did not show a numeric score, so none is displayed.</li>
    </ul>
    <h2>Independence</h2>
    <p>Built from public records. No ties to any campaign, party or PAC. Nothing here is a voting recommendation.</p>
  </section>`;
}

// ---------- tooltips ----------
function bindTips(root){
  root.querySelectorAll('[data-tip]').forEach(el=>{
    el.addEventListener('mouseenter',()=>{tip.textContent=el.dataset.tip;tip.classList.add('show');});
    el.addEventListener('mousemove',e=>{const x=Math.max(10,Math.min(e.clientX+12,window.innerWidth-310));tip.style.left=x+'px';tip.style.top=(e.clientY+14)+'px';});
    el.addEventListener('mouseleave',()=>tip.classList.remove('show'));
    el.setAttribute('tabindex','0');el.setAttribute('aria-label',el.dataset.tip);
    el.addEventListener('focus',()=>{const r=el.getBoundingClientRect();tip.textContent=el.dataset.tip;tip.style.left=Math.max(10,Math.min(r.left,window.innerWidth-310))+'px';tip.style.top=(r.bottom+6)+'px';tip.classList.add('show')});
    el.addEventListener('blur',()=>tip.classList.remove('show'));
  });
}
route();
})();
