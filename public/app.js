import {KV_MIN,leanOfVote,whyNotMarked,sideTaken,keyVoteRows,keyVoteScore} from './lean.js';
(function(){
const $=s=>document.querySelector(s);
const app=$('#app'), tip=$('#tip');
const MEM=DATA.members, CANDS=DATA.cands||[], ALL=MEM.concat(CANDS);
const byId=Object.fromEntries(ALL.map(s=>[s.id,s]));
const icH=s=>s.ideoKind==='house'?'H':s.chamber;
const chipCh=s=>s.senInc?'Senate':s.cand?(s.openSeat?'Senate candidate':(s.chamber==='S'?'Senate challenger':'House challenger')):CH[s.chamber].name;
const CH={S:{name:'Senate',noun:'senator',nouns:'senators',votes:DATA.votes,member:'Senate'},H:{name:'House',noun:'representative',nouns:'representatives',votes:DATA.hvotes,member:'House'}};
const fmt$=n=>{if(n==null)return'—';const a=Math.abs(n);if(a>=1e6)return'$'+(n/1e6).toFixed(a>=1e7?1:2)+'M';if(a>=1e3)return'$'+(n/1e3).toFixed(a>=1e5?0:1)+'K';return'$'+n.toFixed(0)};
const fmtFull=n=>n==null?'—':'$'+Math.round(n).toLocaleString('en-US');
const pct=(a,b)=>b?Math.round(a/b*1000)/10:0;
const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const ASSESS={consistent:['good','Consistent'],contradiction:['crit','Direct contradiction'],partial:['warn','Partly consistent'],unclear:['neutral','Ambiguous or incomplete evidence'],changed:['serious','Changed position'],outcome:['neutral','Outcome check']};
const ICON={good:'✓',crit:'✕',warn:'◐',serious:'↻',neutral:'◇'};
const AICON={consistent:'✓',contradiction:'✕',partial:'◐',unclear:'?',changed:'↻',outcome:'◇'};
const posClass=p=>{p=(p||'').toLowerCase();if(p==='yea'||p==='guilty')return'yea';if(p==='nay'||p==='not guilty')return'nay';return'nv'};
const voteUrl=v=>v.roll!=null?`https://clerk.house.gov/Votes/${v.year}${v.roll}`:`https://www.senate.gov/legislative/LIS/roll_call_votes/vote${v.congress}${v.session}/vote_${v.congress}_${v.session}_${String(v.number).padStart(5,'0')}.htm`;
const partyName=p=>p==='R'?'Republican':p==='D'?'Democrat':'Independent';
const seatLabel=s=>s.chamber==='S'?s.state:s.district;
const REC_SHORT={senator:'Senator',member_of_congress:'House member',former_member_of_congress:'Ex-member of Congress',state_legislator:'State legislator',executive:'Executive office',none:'No elected office'};
const REC_LABEL={senator:'Sitting U.S. senator',member_of_congress:'Sitting U.S. House member',former_member_of_congress:'Former member of Congress',state_legislator:'State legislator',executive:'Executive / appointed office',none:'No prior elected office'};
const fmtDate=d=>{if(!d)return'—';const m=d.match(/^(\d{4})-(\d{2})-(\d{2})$/);if(!m)return d;return new Date(+m[1],+m[2]-1,+m[3]).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})};
const cgUrl=s=>`https://www.congress.gov/member/${s.name.toLowerCase().replace(/-/g,' ').replace(/[^a-z ]/g,'').trim().split(/\s+/).filter(w=>w.length>1).join('-')}/${s.bioguide}`;
const fecCandUrl=id=>`https://www.fec.gov/data/candidate/${id}/?cycle=2026&election_full=true`;
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
    <p class="small" style="margin:8px 0 0;color:var(--ink-2)">Within the party: ${esc(t.within)}. Party unity: votes with the ${s.party==='R'?'Republican':'Democratic'} majority on <b class="num">${i.unity}%</b> of party-line votes${i.partyVotes?` (${i.withParty} of ${i.partyVotes} in the 119th Congress)`:''}.</p>
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
      ${o.multi?'':`<p class="small muted" style="margin:8px 0 0">"For" = spending supporting ${esc(s.short)} or opposing ${esc(rivalsOf(s).map(x=>x.short).join(' or ')||'the opponent')}. "Against" = the reverse.</p>`}
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
  return `<div class="chart"><h3>On the same scale</h3><div class="sub">Three separate amounts, drawn to one scale so their sizes can be compared. They are not added together: the campaign's figure and the outside spending cover different periods, and outside spending never passes through the campaign. Hover a bar for exact amounts.</div>${leg}<div class="hb ch">${body}</div>${compact?'':table}</div>`;
}
function combinedBlock(s){
  const c=s.camp,o=s.out,sm=o.same;
  if(c.missing)return `<div class="chart"><h3>Campaign funds + outside spending</h3><p class="small muted" style="margin:0">Not available: ${esc(s.short)}'s campaign has not filed an FEC financial report yet.</p></div>`;
  if(o.multi||!sm)return `<div class="chart"><h3>Campaign funds + outside spending</h3><p class="small muted" style="margin:0">Not computed for a three-way race, where outside spending against one candidate cannot be credited to a single rival.</p></div>`;
  return `<div class="chart"><h3>Campaign funds + outside spending for ${esc(s.short)}, same period</h3>
    <div class="sub">A combined figure is shown only where both parts cover the same dates: ${period(c.start,sm.end)}.</div>
    <div class="eq"><div><b>${fmtFull(sm.receipts)}</b><span>campaign funds raised</span></div><div class="op">+</div><div><b>${fmtFull(sm.for)}</b><span>outside spending for ${esc(s.short)}, same dates</span></div><div class="op">=</div><div><b>${fmtFull(sm.receipts+sm.for)}</b><span>campaign funds + outside spending</span></div></div>
    <ul class="list small" style="margin-top:10px">
      <li><b>Left out because the dates don't match yet:</b> ${fmtFull(sm.after)} in outside spending for ${esc(s.short)} after ${fmtDate(sm.end)}. Campaign reports covering that period are due Oct. 15, 2026.</li>
      <li><b>Left out by design:</b> outside spending against ${esc(s.short)} (${fmtFull(o.against.total)}), and party coordinated spending, which is reported separately from independent expenditures.</li>
      <li><b>No double counting:</b> PAC and party contributions are already inside campaign funds and are not added again. Independent expenditures are paid by outside groups and never pass through the campaign. Earmarked donations routed through PACs are counted by the FEC as individual contributions, so they are already in campaign funds.</li>
    </ul></div>`;
}
function shareBlock(s){
  return `<div class="note"><b>Super PAC share: withdrawn for now.</b> An earlier version showed a super PAC percentage; it was withdrawn because it divided super PAC spending through Sept. 30, 2026 by campaign receipts through mid-2026, two different periods. It will return only when both parts cover the same dates, using <span class="mono">super PAC spending for the candidate ÷ (campaign funds raised + all outside spending for the candidate)</span>, Jan. 1, 2025 – Sept. 30, 2026, from FEC filings, once the campaigns' Q3 reports (due Oct. 15) are in. It will cover general-election spending only, because primary spending is not in the data used here. The raw figures above are the reliable numbers.</div>`;
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
  const body=o.cms.map(([ci,f,a,rv,ot,n,d0,d1])=>{const m=cmOf(ci);return `<tr><td><a href="https://www.fec.gov/data/committee/${m[0]}/?cycle=2026" target="_blank" rel="noopener">${esc(m[1])}</a><div><span class="tag">${CLS1[m[2]]||m[2]}</span>${m[5]===1?'<span class="tag">only this race</span>':`<span class="tag">${m[5]} races</span>`}</div>${m[3]?`<div class="small" style="color:var(--ink-2);margin-top:4px">${esc(m[3])}${m[4]?` <a href="${esc(m[4])}" target="_blank" rel="noopener">source ↗</a>`:''}</div>`:''}</td>
    <td class="r">${f?fmtFull(f):'—'}</td><td class="r">${a?fmtFull(a):'—'}</td>${multi?`<td class="r">${rv?fmtFull(rv):'—'}</td>`:''}${hasO?`<td class="r">${ot?fmtFull(ot):'—'}</td>`:''}<td class="r">${n}</td><td class="mono small" style="white-space:nowrap">${d0===d1?fmtDate(d0):fmtDate(d0)+' –<br>'+fmtDate(d1)}</td></tr>`}).join('');
  return `<div class="tablewrap"><table>${'<thead>'+head+'</thead>'}<tbody>${body}</tbody></table></div>`;
}
function rowFlags(r){
  const f=r[7]||'', out=[];
  if(f.includes('d'))out.push(flag('Possible repeat','Same committee, candidate, amount, date and description as an item in an earlier filing, but listed as a separate transaction. It may be the same spending reported twice; it is kept because the filings list it separately.'));
  if(f.includes('p'))out.push(flag('Date capped',`Filed ${fmtDate(r[8])} with a dissemination date of Sept. 30 or later; the data set shows such dates as its Sept. 30 cut-off.`));
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
    host.querySelector('#ietb').innerHTML=L.slice(0,st.n).map(({r,role})=>{const m=cmOf(r[1]);return `<tr><td class="mono" style="white-space:nowrap">${fmtDate(r[0])}</td><td>${esc(m[1])}<div class="small muted">${CLS1[m[2]]||''}</div></td><td><span class="chip ${role==='for'?'dfor':role==='against'?'dag':'ghost'}">${r[3]==='S'?'Supports':'Opposes'} ${esc(candName(r[2]))}</span>${rowFlags(r)}</td><td class="small">${esc(IE.purp[r[5]]||'—')}</td><td class="r">${fmtFull(r[4])}</td><td class="small"><a href="https://docquery.fec.gov/cgi-bin/forms/${m[0]}/${esc(r[6])}/" target="_blank" rel="noopener">${esc(r[6])} ↗</a></td></tr>`}).join('')||'<tr><td colspan="6" class="muted">No items match.</td></tr>';
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
  return `<p class="small" style="margin:0 0 8px">Rows from <b>${p.filings.length}</b> reports covering <b>${esc(p.window)}</b>. They add to <b class="num">${fmtFull(p.retrieved)}</b>; the same reports list <b class="num">${fmtFull(p.subtotal)}</b> in PAC contributions, so ${term('coverage',`<b>${p.coverage}% coverage</b>`)}.${!c.missing&&c.pac!=null?` The FEC summary shows <b class="num">${fmtFull(c.pac)}</b> from PACs and other committees for ${period(c.start,c.end)}${notIt>500?`; <b class="num">${fmtFull(notIt)}</b> of it is in reports not itemized here`:''}.`:''}</p>
  ${p.coverage!=null&&p.coverage<95?`<div class="row" style="margin-bottom:8px">${flag('Incomplete rows',`Only ${p.coverage}% of the PAC money in these reports could be read row by row; the missing rows are not shown or guessed.`)}</div>`:''}
  ${over.length?`<div class="note" style="margin-bottom:8px"><b>Check needed:</b> ${over.map(f=>`the ${esc(f.report)} transcription adds to ${fmtFull(f.retrieved-f.subtotal)} more than the report's own subtotal`).join('; ')}, so a row may be duplicated. Compare with the linked report before relying on individual rows.</div>`:''}
  ${p.gap?`<p class="small muted" style="margin:0 0 8px">${esc(p.gap)}</p>`:''}`;
}
function pacSectors(s){
  const p=s.pac;if(!p.byCat.length)return '';
  const max=Math.max(...p.byCat.map(c=>c[1]));
  return `<div class="chart"><h3>Itemized PAC contributions by sector</h3><div class="sub">${fmtFull(p.retrieved)} from ${p.nPacs} committees (${esc(p.window)}). Sectors are assigned by this app from each committee's name and sponsor, not reported by the FEC; committees that could not be identified are left unclassified rather than guessed.</div>
    <div class="bars">${p.byCat.map(([k,v])=>`<div class="r"><div class="lab" title="${esc(DATA.categories[k])}">${esc(DATA.categories[k])}</div><div class="track"><b style="width:${Math.max(1,v/max*100)}%" data-tip="${esc(DATA.categories[k])}: ${fmtFull(v)} (${pct(v,p.retrieved)}%)"></b></div><div class="val">${fmt$(v)}</div></div>`).join('')}</div></div>`;
}
function pacTable(s,host){
  const p=s.pac;if(!p.rows.length){host.innerHTML='';return}
  let st={q:'',k:'amt',dir:-1,n:50};
  host.innerHTML=`<div class="toolbar" style="margin:0 0 10px"><div class="search" style="margin:0"><input id="pq" type="search" placeholder="Filter by committee or sector" aria-label="Filter PAC contributions"></div></div>
    <p class="small" id="psum" style="margin:0 0 8px"></p>
    <div class="tablewrap"><table id="pt"><thead><tr><th><button data-k="name">Contributor (as filed)</button></th><th><button data-k="cat">Sector (assigned)</button></th><th><button data-k="rep">Report and period</button></th><th class="r"><button data-k="amt">Amount</button></th></tr></thead><tbody></tbody></table></div><div id="pmore" style="margin-top:8px"></div>`;
  const R=p.rows.map(r=>({name:DATA.pacNames[r[0]],amt:r[1],cat:DATA.categories[r[2]]||r[2],fi:r[3],rep:p.filings[r[3]].start,orient:(DATA.pacOrient||{})[r[0]]}));
  const draw=()=>{
    const q=st.q.toLowerCase();
    let L=R.filter(x=>!q||(x.name+' '+x.cat).toLowerCase().includes(q));
    L.sort((a,b)=>{const x=a[st.k],y=b[st.k];return (typeof x==='number'?x-y:String(x).localeCompare(String(y)))*st.dir||b.amt-a.amt});
    host.querySelector('#psum').innerHTML=`<b class="num">${L.length.toLocaleString()}</b> contributions · <b class="num">${fmtFull(L.reduce((a,x)=>a+x.amt,0))}</b>. The FEC lists these by report, so each row shows its report period, not an exact date.`;
    host.querySelector('#pt tbody').innerHTML=L.slice(0,st.n).map(x=>{const f=p.filings[x.fi];return `<tr><td>${esc(x.name)}${x.orient?`<div class="small muted">${esc(x.orient)}</div>`:''}</td><td class="small">${esc(x.cat)}</td><td class="small"><a href="${esc(f.url)}" target="_blank" rel="noopener">${esc(f.report)}</a><div class="muted">${fmtDate(f.start)} – ${fmtDate(f.end)}</div></td><td class="r">${fmtFull(x.amt)}</td></tr>`}).join('')||'<tr><td colspan="4" class="muted">No rows match.</td></tr>';
    host.querySelector('#pmore').innerHTML=L.length>st.n?`<button class="more" id="pmb">Show ${Math.min(50,L.length-st.n)} more of ${(L.length-st.n).toLocaleString()} remaining</button>`:'';
    const b=host.querySelector('#pmb');if(b)b.addEventListener('click',()=>{st.n+=50;draw();});
  };
  host.querySelector('#pq').addEventListener('input',e=>{st.q=e.target.value;st.n=50;draw();});
  host.querySelector('#pt thead').addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;const k=b.dataset.k;st=Object.assign(st,st.k===k?{dir:-st.dir}:{k,dir:k==='amt'?-1:1});draw();});
  draw();
}
function topSpenders(s,role,n){
  const idx=role==='for'?1:2;
  return s.out.cms.filter(x=>x[idx]>0).sort((a,b)=>b[idx]-a[idx]).slice(0,n).map(x=>({name:cmOf(x[0])[1],cls:cmOf(x[0])[2],amt:x[idx]}));
}

// ---------- routing ----------
let homeCh='', cmpCh='S';
function route(){
  resizers=[];tip.classList.remove('show');
  const h=(location.hash||'#home').slice(1);
  const m=h.match(/^([a-zA-Z0-9]+)(?:-([a-z]+))?$/)||[];
  document.querySelectorAll('#nav a').forEach(a=>a.classList.toggle('active',a.dataset.route===m[1]||(a.dataset.route==='home'&&!!byId[m[1]])));
  if(!h||m[1]==='home'){homeCh=m[2]==='senate'?'S':m[2]==='house'?'H':m[2]==='candidates'?'C':homeCh;renderHome();}
  else if(m[1]==='updates'){window.RecordLive.dashboard(app);}
  else if(m[1]==='races'){renderRaces();}
  else if(m[1]==='compare'){if(m[2])cmpCh=m[2]==='house'?'H':'S';renderCompare();}
  else if(m[1]==='method'){renderMethod();}
  else if(m[1]==='align'){renderAlign();}
  else if(byId[m[1]]){const FOC={ethics:'rec-ethics',funders:'rec-funders',money:'rec-money'};const tb=m[2]==='superpacs'?'funding':FOC[m[2]]?'record':(m[2]||'overview');renderProfile(byId[m[1]],tb,FOC[m[2]]||null);}
  else if(m[2]==='latest'){window.RecordLive.standalone(app,m[1]);}
  else renderHome();
  window.scrollTo({top:0});
}
window.addEventListener('hashchange',route);

// ---------- home ----------
function renderHome(){
  const nS=ALL.filter(s=>s.chamber==='S'&&(!s.cand||s.senInc)).length, nH=MEM.filter(s=>s.chamber==='H').length, nC=CANDS.filter(s=>!s.senInc).length, nComp=DATA.races.filter(r=>r.chamber==='S'&&r.competitive).length;
  app.innerHTML=`
  <section class="hero">
    <div class="asof">Research snapshot · ${esc(DATA.asof)}</div>
    <h1 style="margin-top:8px">What they said. What they did. Who paid for it.</h1>
    <p class="lede">${nS} senators and ${nH} House members on the November 3, 2026 ballot, their ${CANDS.filter(c=>!c.openSeat&&!c.senInc).length} opponents, and ${CANDS.filter(c=>c.openSeat).length} nominees for ${DATA.races.filter(r=>r.open).length} open Senate seats: ${DATA.races.length} races, including all ${nComp} Senate races rated competitive by Cook, Inside Elections or Sabato. Profiled from official records: FEC filings, roll-call votes, state legislative records, ethics findings and court records. Every profile shows the voting or official record, the money the campaign raised, outside groups' spending for and against the candidate (kept separate), and statements checked against actions. Every entry links to its source.</p>
    <div class="toolbar">
      <div class="seg" id="chs" role="group" aria-label="Chamber"><button data-c="" class="${homeCh===''?'active':''}">All ${ALL.length}</button><button data-c="S" class="${homeCh==='S'?'active':''}">Senators</button><button data-c="H" class="${homeCh==='H'?'active':''}">House</button><button data-c="C" class="${homeCh==='C'?'active':''}">Challengers & candidates</button></div>
      <div class="search"><input id="q" type="search" placeholder="Search by name, state or district" aria-label="Search members"></div>
    </div>
  </section>
  <div class="grid" id="cards"></div>
  <section class="section">
    <div class="cols">
      <div class="card"><h3>Head-to-head races</h3><p class="small" style="margin-top:6px">Each candidate next to their 2026 opponents: campaign funds, cash on hand, and outside groups' spending for and against each side, shown separately.</p><a class="cta" href="#races">See the ${DATA.races.length} races</a></div>
      <div class="card"><h3>Compare the record</h3><p class="small" style="margin-top:6px">Senate and House vote matrices on consequential roll calls since 2021, plus ideology, campaign funds and outside spending side by side.</p><a class="cta" href="#compare">Open the comparison</a></div>
      <div class="card"><h3>How the numbers work</h3><p class="small" style="margin-top:6px">Ideology percentiles come from Voteview's DW-NOMINATE scores. Every money figure carries its period and source. The methodology page explains every rule, what changed in this version, and every known gap.</p><a class="cta" href="#method">Read the methodology</a></div>
    </div>
  </section>`;
  const cards=$('#cards');
  const draw=q=>{
    q=(q||'').trim().toLowerCase();
    const list=ALL.filter(s=>(!homeCh||(homeCh==='C'?(s.cand&&!s.senInc):((!s.cand||s.senInc)&&s.chamber===homeCh)))&&(!q||[s.name,s.state,s.stateName,s.district||'',s.cand?(s.openSeat?'senate candidate open seat':'challenger '+(s.chamber==='S'?'senate':'house')):s.chamber==='S'?'senate senator':'house representative',partyName(s.party)].join(' ').toLowerCase().includes(q)));
    cards.innerHTML=list.map(s=>{
      const cons=s.statements.filter(x=>x.assessment==='consistent').length;
      const it=ideoText(s);
      return `<article class="card sen-card" tabindex="0" data-id="${s.id}" role="link" aria-label="Open profile of ${esc(s.name)}">
        <div class="row"><span class="chip ch">${chipCh(s)}</span><span class="chip ${s.party}">${partyName(s.party)} · ${esc(seatLabel(s))}</span><span class="chip ghost">${esc(s.cand?(s.openSeat?'Open seat':s.term):s.term)}</span></div>
        <div class="name">${esc(s.name)}</div>
        <div class="facts">
          <div><span>${s.cand&&!s.ideo?'Record':'Voting record'}</span><b>${esc(s.cand&&!s.ideo&&s.ideoKind!=='former_text'&&s.ideoKind!=='state'?(REC_LABEL[s.recordType]||it.short):it.short)}</b></div>
          <div><span>Campaign funds raised</span><b>${s.camp.missing?'Not yet reported':fmt$(s.camp.receipts)}</b><small>${s.camp.missing?'no FEC report filed':shortPer(s.camp.end)}</small></div>
          <div><span>Outside spending ${s.out.multi?'supp. / opp.':'for / against'}</span><b>${fmt$(s.out.for.total)} / ${fmt$(s.out.against.total)}</b><small>${shortPer(s.out.end)}</small></div>
          <div><span>Statement checks</span><b>${s.statements.length} (${cons} consistent)</b></div>
        </div>
        <div class="small muted">${s.cand?esc(s.since):`In the ${CH[s.chamber].name} since ${esc(String(s.since).split(' (')[0])} · ${esc(s.roles.split(';')[0])}`}</div>
      </article>`;}).join('')||`<p class="muted">No one matches that search. This release covers ${ALL.length} people in ${DATA.races.length} races; the methodology page explains how they were chosen.</p>`;
  };
  draw('');
  $('#q').addEventListener('input',e=>draw(e.target.value));
  $('#chs').addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;homeCh=b.dataset.c;$('#chs .active').classList.remove('active');b.classList.add('active');draw($('#q').value);});
  cards.addEventListener('click',e=>{const c=e.target.closest('.sen-card');if(c)location.hash=c.dataset.id;});
  cards.addEventListener('keydown',e=>{const c=e.target.closest('.sen-card');if(c&&(e.key==='Enter'||e.key===' ')){e.preventDefault();location.hash=c.dataset.id;}});
}

// ---------- profile ----------
const TABS=[['overview','Overview'],['latest','Latest records'],['funding','Funding'],['record','Legislative record'],['statements','Statements vs. actions'],['align','Voter alignment']];
const tabsFor=s=>TABS;
function renderProfile(s,tab,focus){
  app.innerHTML=`
  <header class="phead">
    <div class="top"><div>
      <div class="row"><span class="chip ch">${chipCh(s)}</span><span class="chip ${s.party}">${partyName(s.party)} · ${esc(s.stateName)}${s.chamber==='H'?' · '+esc(s.district):''}</span><span class="chip ghost">${esc(s.term)}</span></div>
      <h1 style="margin-top:8px">${esc(s.name)}</h1>
      ${s.cand?`<p class="small" style="margin:8px 0 0;color:var(--ink-2);max-width:80ch">${esc(s.status)}${s.statusSrc?` <a href="${esc(s.statusSrc.u)}" target="_blank" rel="noopener">${esc(s.statusSrc.t)} ↗</a>`:''}</p>${s.background?`<p class="small muted" style="margin:4px 0 0;max-width:80ch">${esc(s.background)}</p>`:''}`:''}
    </div></div>
    <div class="meta">
      <div><span>${s.cand?'Current or most recent role':'In the '+CH[s.chamber].name+' since'}</span>${esc(s.since)}</div>
      <div><span>2026 ${s.cand?'opponents':'opponent'}</span>${esc(s.opponent)} · <a href="#races">race view</a></div>
      <div class="roles"><span>${s.cand?'Offices held':'Committees / roles'}</span>${esc(s.roles||'None')}</div>
      <div><span>Identifiers</span><span class="mono" style="display:inline;color:var(--ink-2);text-transform:none;letter-spacing:0;font-size:.82rem">FEC ${esc(s.fecCand)}${s.bioguide?' · Bioguide '+esc(s.bioguide):''}</span></div>
    </div>
    <div class="links row">
      <a href="${fecCandUrl(s.fecCand)}" target="_blank" rel="noopener">FEC candidate summary ↗</a>
      ${s.bioguide?`<a href="${cgUrl(s)}" target="_blank" rel="noopener">Congress.gov member page ↗</a>`:''}
      ${s.site?`<a href="${esc(s.site)}" target="_blank" rel="noopener">${s.cand?'Campaign site':'Official site'} ↗</a>`:''}
      <a href="#${s.id}-sources">All sources for this profile →</a>
    </div>
  </header>
  <div class="tabs"><div class="wrap" style="padding-inline:0" id="tabs">${tabsFor(s).map(([k,l])=>`<button data-tab="${k}" class="${k===tab?'active':''}">${l}</button>`).join('')}</div></div>
  <section class="section" id="pane"></section>`;
  $('#tabs').addEventListener('click',e=>{const b=e.target.closest('button');if(b){location.hash=`${s.id}-${b.dataset.tab}`;}});
  const pane=$('#pane');
  ({latest:(s,p)=>window.RecordLive.profile(s,p),overview:paneOverview,funding:paneFunding,record:paneRecord,statements:paneStatements,align:paneAlign,sources:paneSources}[tab]||paneOverview)(s,pane,focus);
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
function ovMoney(s){
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
  return ovCard('Campaign money',T,`Share of the ${fmtFull(c.receipts)} the campaign raised, ${period(c.start,c.end)}`,body,`FEC two-year committee summary · <a href="${esc(c.src)}" target="_blank" rel="noopener">source ↗</a> · <a href="#${s.id}-funding">Funding details →</a>`,'ov-wide');
}
// 2. outside money for and against: two bars on one scale, top groups named under each
function ovOutside(s){
  const o=s.out, f=o.for.total, a=o.against.total, T='Outside money for and against';
  const sub=`Spending by outside groups, ${period(o.start,o.end)}`;
  const foot=`Not money the campaign raised, and never added to it. ${o.multi?'':`“For” counts spending that supports ${esc(s.short)} or opposes the opponent. `}<a href="#${s.id}-funding">Every group and filing →</a>`;
  if(!(f>0)&&!(a>0))return ovCard('Outside money',T,sub,`<div class="note">No outside spending for or against ${esc(s.short)} was reported through ${fmtDate(o.end)}.</div>`,foot);
  const max=Math.max(f,a,1);
  const col=(label,amt,list,cls)=>`<div class="ov-col"><div class="ov-amt">${fmt$(amt)}</div>
    <div class="ov-plot">${amt>0?`<i class="${cls}" style="height:${Math.max(2,amt/max*100).toFixed(1)}%" data-tip="${esc(label)}: ${fmtFull(amt)}"></i>`:''}</div>
    <div class="ov-collab">${esc(label)}</div>
    ${list.length?`<ul class="ov-top">${list.map(x=>`<li><span>${esc(x.name)}<small class="muted">${CLS1[x.cls]||''}</small></span><b>${fmt$(x.amt)}</b></li>`).join('')}</ul>`:'<p class="small muted" style="margin:6px 0 0">No groups reported</p>'}</div>`;
  const body=`<div class="ov-pair">${col(forLabel(s),f,topSpenders(s,'for',3),'for')}${col(agLabel(s),a,topSpenders(s,'against',3),'ag')}</div>${o.incomplete.length?`<p class="small" style="margin:10px 0 0">${flag('Incomplete data',o.incomplete.join(' '))}</p>`:''}`;
  return ovCard('Outside money',T,sub,body,foot);
}
// 3. issue by issue against the viewer's own choices; no evidence is left blank, never scored as a mismatch
function ovAlign(s){
  const r=scoreFor(s), T='How they compare with your choices';
  if(!r.nChosen)return ovCard('Your issues',T,'Issue by issue, never a single score',`<p class="small" style="margin:0 0 10px">Pick your positions on up to ${ISS.length} issues in My alignment and this shows where ${esc(s.short)}’s documented record matches you, differs, or has no evidence. Evidence available: ${esc(evidenceMix(s))}.</p><a class="cta" href="#align">Choose my issues</a>`,'');
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
  return ovCard('Your issues',T,`Your ${r.nChosen} chosen issue${r.nChosen===1?'':'s'}. Blank means no evidence, which is not counted as a mismatch.`,body,`Not a rating of the candidate. <a href="#${s.id}-align">Evidence for every issue →</a>`);
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
const vtLegend=()=>`<p class="small muted vtkey" style="margin:4px 0 8px"><b>Reading a vote:</b> on a bill marked liberal or conservative, a Yea takes the marked side and a Nay takes the other. The "Side taken" column says which side each vote was on. Bills not marked liberal or conservative have no side.</p>`;
function kvBlock(s,id,full){
  const kv=kvScore(s), C=icH(s), tot=kvTotals(C), noun=CH[C].noun, T='Key votes marked liberal or conservative';
  const head=`<div class="kicker">${T}</div>`;
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
    <p class="small muted" style="margin:6px 0 0">Each dot is one profiled ${noun} with at least ${KV_MIN} marked votes (${pool.length}). Of the ${tot.n} bills marked in the ${CH[C].name} set, a Yea is the liberal side on ${tot.lib} and the conservative side on ${tot.con}, so positions can be compared only within the ${CH[C].name}. This is a count of selected votes, not the career score above.</p>
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
  const career=s.ideo?`<div class="kicker">Whole career, Voteview</div><div class="big" style="margin-top:4px">${esc(it.head)}</div><div class="ideo ov-strip" id="ovstrip"></div><p class="small muted" style="margin:6px 0 0">Each faint dot is one current ${CH[C].noun} (${DATA.pools[C].length} in all). DW-NOMINATE score ${s.ideo.dim1>0?'+':''}${s.ideo.dim1.toFixed(3)} on a −1 (liberal) to +1 (conservative) scale.</p>`:'';
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
  return ovCard('Words and actions',T,`Only the statements that were checked, not everything ${esc(s.short)} has said.`,body,`<a href="#${s.id}-statements">Read the checks →</a>`);
}
// ethics: a short text list, never a chart, because an allegation, an investigation and a confirmed finding are very different things
const ETH_TAG={finding:['Confirmed finding','crit'],investigation:['Investigation','warn'],allegation:['Allegation','neutral']};
function ovEthics(s){
  const items=s.ethics.filter(e=>e.outcome!=='None found');
  const order=Object.keys(ETH_TAG), rank=e=>{const i=order.indexOf(e.status);return i<0?order.length:i};
  const list=items.map((e,i)=>[e,i]).sort((a,b)=>rank(a[0])-rank(b[0])||a[1]-b[1]).map(x=>x[0]);
  const body=list.length?`<ul class="ov-eths">${list.map(e=>{const [lab,cls]=ETH_TAG[e.status]||[e.type,'ghost'];return `<li class="ov-eth"><span class="chip ${cls}">${esc(lab)}</span><b>${esc(e.title)}</b> <span class="mono muted">${esc(e.date)}</span><div class="small muted ov-clamp" style="margin-top:4px">${esc(e.outcome)}</div></li>`}).join('')}</ul>
    <p class="small muted" style="margin:10px 0 0"><b>Allegation:</b> a complaint or report with no official finding. <b>Investigation:</b> a formal inquiry, lawsuit or proceeding, whether pending, closed or ended without a finding against ${esc(s.short)}. <b>Confirmed finding:</b> a court, agency or ethics body found a violation or imposed a penalty, or ${esc(s.short)} admitted it.</p>`
    :`<p class="small" style="margin:8px 0 0">No documented violations, penalties or findings located in the sources checked.</p>`;
  return ovCard('Ethics','Ethics & compliance',`${list.length?`${list.length} item${list.length===1?'':'s'}, most certain first`:'Sources checked'}`,body,`<a href="#${s.id}-ethics">Details and sources →</a>`,'ov-top-align');
}

function paneOverview(s,pane){
  const race=raceOf(s), riv=rivalsOf(s);
  pane.innerHTML=`
  <h2>At a glance</h2>
  <p class="intro">Five quick visuals and a short ethics list, each with its period. Details and sources are in the tabs above.</p>
  <div class="ov-grid">
    ${ovMoney(s)}
    ${ovOutside(s)}
    ${ovAlign(s)}
    ${ovIdeo(s)}
    ${ovWords(s)}
    ${ovEthics(s)}
  </div>
  <div class="cols" style="margin-top:14px">
    <div class="card"><h3>2026 race</h3>
      ${riv.length?`<ul class="list small" style="margin-top:8px">${riv.map(x=>`<li><a href="#${x.id}">${esc(x.name)}</a> (${x.party}${x.id===s.incumbent?', incumbent':''}): campaign funds ${campLine(x)}; outside spending for ${fmt$(x.out.for.total)}</li>`).join('')}</ul>`:'<p class="small muted">No profiled opponent.</p>'}
      ${race&&race.note?`<p class="small muted" style="margin-top:6px">${esc(race.note)}</p>`:''}
      <p style="margin-top:10px"><a href="#races">Side-by-side race view →</a></p></div>
    <div class="card"><h3>${s.cand?'Record':'Votes & bills'}</h3>
      ${s.cand?`<p class="small" style="margin-top:8px">${esc(REC_LABEL[s.recordType]||'')}. ${s.record.length} documented ${s.recordType==='state_legislator'?'votes and bills':s.recordType==='executive'?'official actions':'items'}${s.ideoKind==='house'?`, plus positions on ${statedVotes(s)} key House roll calls`:''}.</p><ul class="list small">${s.record.slice(0,3).map(r=>`<li>${esc(r.title)}</li>`).join('')}</ul>`:`<p class="small" style="margin-top:8px">Positions on ${statedVotes(s)} key ${CH[s.chamber].name} roll calls. ${s.sponsoredCount?`<b class="num">${s.sponsoredCount.toLocaleString()}</b> measures sponsored over a congressional career.`:''} ${s.bills.length} notable sponsored bills listed.</p>`}
      <p style="margin-top:10px"><a href="#${s.id}-record">Legislative record, money and votes →</a></p></div>
  </div>`;
  mountStrip('ovstrip',s);
  mountKV('ovkv',s);
  bindTips(pane);
}

function conduitBlock(s){
  const c=s.conduit||{status:'not_measured',rows:[],aipacDirect:[]};
  const direct=c.aipacDirect||[];
  const dsum=direct.reduce((a,b)=>a+b.amount,0);
  const head=`<h3 style="margin:22px 0 6px">${term('earmarked','Money routed through PACs on donors\' behalf')}</h3>
  <p class="small" style="color:var(--ink-2);max-width:72ch;margin-bottom:10px">A PAC can give a candidate at most $5,000 per election from its own account, but some groups also act as a conduit: their members write checks that the PAC collects and forwards ("earmarked" contributions). The FEC records that money as individual contributions, so it is already inside campaign funds raised, but it does not appear in the PAC contributions table above even though the group directed it.</p>`;
  let body='';
  if(c.status==='measured'){
    body=`<div class="tablewrap"><table><thead><tr><th>Conduit</th><th>Period</th><th class="r">Amount</th></tr></thead><tbody>${c.rows.map(r=>`<tr><td><a href="${fecCmteUrl(r.id)}" target="_blank" rel="noopener">${esc(r.conduit)}</a><div class="small" style="color:var(--ink-2);margin-top:4px">${esc(r.detail)}</div><div class="small" style="margin-top:4px">${r.srcs.map(x=>`<a href="${esc(x.u)}" target="_blank" rel="noopener">${esc(x.t)} ↗</a>`).join(' · ')}</div></td><td class="mono" style="white-space:nowrap">${esc(r.period)}</td><td class="r"><b>${fmtFull(r.amount)}</b></td></tr>`).join('')}</tbody></table></div>`;
  } else if(c.status==='present'){
    body=`<div class="note"><b>Earmarked money found, total not yet tallied.</b> ${esc(c.note)}</div>`;
  } else {
    body=`<div class="note"><b>Not measured for ${esc(s.short)}.</b> Earmarked totals come from each conduit's own FEC reports, which run to tens of thousands of rows and could not be read accurately for this release, so no total is shown rather than a partial one. This is not a finding that ${esc(s.short)} received none.</div>`;
  }
  const note=c.status==='measured'&&c.note?`<p class="small" style="margin-top:8px;color:var(--ink-2)">${esc(c.note)} ${c.noteSrc?`<a href="${esc(c.noteSrc.u)}" target="_blank" rel="noopener">${esc(c.noteSrc.t)} ↗</a>`:''}</p>`:(c.status==='present'&&c.noteSrc?`<p class="small" style="margin-top:6px"><a href="${esc(c.noteSrc.u)}" target="_blank" rel="noopener">${esc(c.noteSrc.t)} ↗</a></p>`:'');
  const dl=s.pac.filings.length?(direct.length?`<p class="small" style="margin-top:8px">Direct checks from AIPAC's PAC in the reports itemized here (${esc(s.pac.window)}): <b class="num">${fmtFull(dsum)}</b> — ${direct.map(d=>`${esc(d.report)} ${fmtFull(d.amount)}`).join('; ')}. These are in the PAC contributions table above.</p>`:`<p class="small muted" style="margin-top:8px">No direct check from AIPAC's PAC appears in the reports itemized here (${esc(s.pac.window)}).</p>`):'';
  return head+body+note+dl;
}

function paneFunding(s,pane){
  const c=s.camp, o=s.out;
  const other=c.missing?0:Math.max(0,c.other);
  const comp=c.missing?[]:[['Individuals, itemized (over $200)',c.itemized],['Individuals, unitemized ($200 or less)',c.unitemized],['PACs and other committees',c.pac],['Transfers from joint fundraising',c.transfers],['Party committees',c.party],["Candidate's own loans and contributions",c.self||0],['Other receipts',other]].filter(x=>x[1]!=null);
  pane.innerHTML=`
  <h2>Funding</h2>
  <p class="intro">Two different kinds of money, kept apart. <b>Campaign funds</b> are what ${esc(s.short)}'s own committee raised and reported to the FEC. <b>Outside spending</b> is money other groups spent on the race on their own, which the campaign never receives. Every figure shows its period.</p>
  <nav class="jump small"><a href="#f-sum">Summary</a><a href="#f-camp">Campaign funds</a><a href="#f-pac">PAC contributions</a><a href="#f-out">Outside spending</a><a href="#f-items">Every item</a><a href="#f-comb">Combined view</a></nav>
  <div id="f-sum">${fundingPanels(s)}</div>
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
  <div class="chart"><h3>Where campaign funds came from</h3><div class="sub">Parts of the ${fmtFull(c.receipts)} the campaign raised, ${period(c.start,c.end)}. Hover a bar for the exact amount.</div>
    <div class="bars">${comp.filter(x=>x[1]>0).map(([l,v])=>`<div class="r"><div class="lab" title="${esc(l)}">${esc(l)}</div><div class="track"><b style="width:${Math.max(1,v/c.receipts*100)}%" data-tip="${esc(l)}: ${fmtFull(v)} (${pct(v,c.receipts)}%)"></b></div><div class="val">${fmt$(v)} · ${pct(v,c.receipts)}%</div></div>`).join('')}</div>
    ${c.itemized==null?'<p class="small muted" style="margin:8px 0 0">The itemized/unitemized split is not available for this committee.</p>':''}
  </div>`}
  <h2 id="f-pac" style="margin-top:28px">${term('pac','PAC contributions to the campaign')}</h2>
  <p class="small muted" style="margin:4px 0 10px">Part of campaign funds raised. Each row is one contribution as itemized on FEC Schedule A, line 11C.</p>
  ${pacCoverage(s)}
  ${pacSectors(s)}
  <div id="pachost"></div>
  ${conduitBlock(s)}
  <h2 id="f-out" style="margin-top:28px">Outside spending (${term('ie','independent expenditures')})</h2>
  <p class="small" style="margin:4px 0 10px;color:var(--ink-2);max-width:78ch">Spending by ${term('superpac','super PACs')}, other outside groups and party committees that support or oppose a candidate without coordinating with the campaign. General-election spending only, ${period(o.start,o.end)}. Source: ${esc(IE.source)}${o.excludedPre.n?` Excluded: ${fmtFull(o.excludedPre.amount)} in ${o.excludedPre.n} items dated before 2025 (2024-election spending filed late).`:''}${o.dupRemoved.n?` Excluded: ${fmtFull(o.dupRemoved.amount)} in ${o.dupRemoved.n} items that were the same transaction filed twice (identical in every field, including the transaction ID); the latest filing is kept.`:''}${o.uncertain?` ${o.uncertain} items have an uncertain election designation and are marked.`:''} <a href="${fecIeUrl(s.fecCand)}" target="_blank" rel="noopener">FEC independent expenditures for ${esc(s.short)} ↗</a></p>
  ${o.incomplete.map(t=>`<div class="note" style="margin-bottom:10px"><b>Incomplete data.</b> ${esc(t)}</div>`).join('')}
  ${o.possibleRepeat?`<div class="note" style="margin-bottom:10px"><b>Possible repeats:</b> the totals above include ${fmtFull(o.possibleRepeat)} in items that match an item in another filing in every detail except the transaction ID. They may be the same spending reported twice, so the totals may be overstated by up to that amount. They are marked "Possible repeat" in the item list.</div>`:''}
  ${o.pinned?`<p class="small muted" style="margin:0 0 10px">${o.pinned} items were filed in advance with a dissemination date of Sept. 30 or later; they are dated Sept. 30 here and marked "Date capped".</p>`:''}
  ${o.others.length?`<div class="note" style="margin-bottom:10px"><b>Spending on other candidates in this race</b> is listed separately and not counted for or against ${esc(s.short)}: ${o.others.map(x=>`${esc(candName(x.cand))} (${x.O?fmtFull(x.O)+' opposing':''}${x.O&&x.S?', ':''}${x.S?fmtFull(x.S)+' supporting':''})`).join('; ')}.</div>`:''}
  ${o.multi&&o.rivals.length?`<div class="note" style="margin-bottom:10px"><b>Aimed at ${esc(s.short)}'s rivals</b> (not credited to ${esc(s.short)}): ${o.rivals.map(x=>`${esc(candName(x.cand))}: ${fmtFull(x.S)} supporting, ${fmtFull(x.O)} opposing`).join('; ')}.</div>`:''}
  <p class="small" style="margin:0 0 8px"><a href="#${s.id}-funders">How these groups' own published positions compare with ${esc(s.short)}'s votes →</a></p>
  <h3 style="margin:14px 0 8px">By committee</h3>
  ${ieCommitteeTable(s)}
  <h3 id="f-items" style="margin:22px 0 8px">Every item</h3>
  <p class="small muted" style="margin:0 0 8px">Each independent expenditure as reported, with its dissemination date and FEC filing.</p>
  <div id="iehost"></div>
  <div id="f-comb" style="margin-top:22px">${combinedBlock(s)}</div>`;
  pacTable(s,$('#pachost'));
  ieItems(s,$('#iehost'));
  pane.querySelectorAll('.jump a').forEach(a=>a.addEventListener('click',e=>{e.preventDefault();const t=document.getElementById(a.getAttribute('href').slice(1));if(t)t.scrollIntoView({behavior:'smooth',block:'start'});}));
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
  return `Different kinds of evidence: ${list.map(s=>`${esc(s.short)}'s record is ${N[evidenceOf(s).kind]}`).join('; ')}. The records are not directly comparable, and fewer items does not mean a better or worse record.`;
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
const RECT=new Set(['senate_vote','house_vote','vote','state_vote','sponsored','official_act']);
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
  const ch=chosenIssues();let totW=0,covW=0,num=0,nCov=0;const rows=[];
  for(const i of ch){
    const pr=PROF.issues[i.id],w=pr.w;totW+=w;
    const ev=(s.evidence||{})[i.id]||[], rec=ev.filter(e=>RECT.has(e.type)), st=ev.filter(e=>e.type==='stated');
    const basis=rec.length?rec:st;
    if(!basis.length){rows.push({i,pr,status:'none',rec,st});continue}
    const match=basis.filter(e=>e.side===pr.side).length, agree=match/basis.length;
    covW+=w;nCov++;num+=w*agree;
    rows.push({i,pr,status:rec.length?'record':'stated',match,n:basis.length,agree,rec,st,stMatch:st.filter(e=>e.side===pr.side).length});
  }
  const need=Math.min(3,ch.length), enough=ch.length>0&&nCov>=need&&totW>0&&covW/totW>=0.5;
  return {score:enough?Math.round(num/covW*100):null,covW,totW,nCov,nChosen:ch.length,need,rows,num};
}
function scoreBadge(r){
  if(!r.nChosen)return '<span class="muted">Set your priorities</span>';
  if(r.score==null)return `<span class="chip ghost" data-tip="Evidence covers ${r.nCov} of your ${r.nChosen} issues (${Math.round(r.covW/r.totW*100)||0}% of your weight). A score needs at least ${r.need} issues and half your weight.">Insufficient data</span>`;
  return `<span class="alscore"><b>${r.score}%</b> match</span>`;
}
function evidenceMix(s){
  const c={};Object.values(s.evidence||{}).flat().forEach(e=>{const k=RECT.has(e.type)?(e.type==='senate_vote'||e.type==='house_vote'||e.type==='vote'?'votes':e.type==='state_vote'?'state votes':e.type==='sponsored'?'bills sponsored':'official actions'):'statements';c[k]=(c[k]||0)+1});
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
const ALNOTE=`<div class="note small" style="margin:10px 0"><b>What this is:</b> a comparison between the positions <i>you</i> choose and each candidate's documented record. It is not a rating of candidate quality, and the issue list covers only what could be documented. Recorded actions (votes, bills, official acts) are used where they exist; stated positions are used only for an issue with no recorded action, and are labeled. A score appears only when evidence covers at least three of your issues and half of your total importance; otherwise the candidate shows "Insufficient data", never a neutral or zero score. <a href="#method">How it is calculated</a>.</div>`;
function renderAlign(){
  app.innerHTML=`
  <section class="hero" style="padding-bottom:10px"><div class="asof">Your choices · saved only in this browser</div><h1 style="margin-top:8px">My alignment</h1>
  <p class="lede">Pick a side on the issues you care about and how much each matters. Every candidate is then compared with your choices, issue by issue, using their documented votes, bills, official actions and statements.</p></section>
  ${ALNOTE}
  <div class="alwrap"><div id="alb">${builderHTML()}</div><div id="alr"></div></div>`;
  const draw=()=>{
    const ch=chosenIssues();
    if(!ch.length){$('#alr').innerHTML='<div class="note">Choose a side on at least one issue to see how candidates compare.</div>';return}
    const sec=DATA.races.map(r=>{const C=r.keys.map(k=>byId[k]);return `<article class="race"><div class="rh"><h3>${esc(r.label)}</h3><span class="small muted">${r.open?'Open seat':'Incumbent running'}</span></div>
      <div class="tablewrap"><table><thead><tr><th>Candidate</th><th>Compared with your choices</th><th>Evidence used</th></tr></thead><tbody>${C.map(s=>{const sc=scoreFor(s);return `<tr><td><a href="#${s.id}-align"><b>${esc(s.name)}</b></a> <span class="chip ${s.party}">${s.party}</span></td><td>${scoreBadge(sc)}<div class="small muted">${sc.nCov} of ${sc.nChosen} of your issues have evidence</div></td><td class="small">${esc(evidenceOf(s).label)}<div class="muted">${esc(evidenceMix(s))}</div></td></tr>`}).join('')}</tbody></table></div>
      ${evidenceNote(C)?`<p class="small" style="margin:6px 0 0;color:var(--ink-2)"><b>Comparing records:</b> ${evidenceNote(C)}</p>`:''}</article>`}).join('');
    $('#alr').innerHTML=`<p class="small muted" style="margin:0 0 6px">Results for ${ch.length} chosen issue${ch.length===1?'':'s'}. Open a candidate for the issue-by-issue breakdown and every piece of evidence.</p>${sec}`;
    bindTips(app);
  };
  const onCh=rebuild=>{if(rebuild){$('#alb').innerHTML=builderHTML();bindBuilder($('#alb'),onCh)}draw();};
  bindBuilder($('#alb'),onCh);
  draw();
}
function evRow(e,want){
  const m=want?(e.side===want):null;
  return `<li class="evi"><span class="mk ${m===null?'':m?'yes':'no'}" aria-label="${m===null?'':m?'matches your choice':'differs from your choice'}">${m===null?'·':m?'✓':'✕'}</span>
    <div><div><span class="chip ghost">${esc(TYPEL[e.type]||e.type)}</span> <b>${esc(e.title)}</b> <span class="mono muted">${esc(e.date||'date not given')}</span></div>
    <div class="small">${e.pos?`Position: <b>${esc(e.pos)}</b> → `:''}counts toward "${esc(sideLabel(e.issue||'',e.side))}"</div>
    <div class="small muted">${e.yea?`What the measure does: ${esc(e.why)} A Yea counts toward "${esc(sideLabel(e.issue,e.yea))}".`:`Why: ${esc(e.why)}`} ${e.src&&e.src.u?`<a href="${esc(e.src.u)}" target="_blank" rel="noopener">${esc(e.src.t||'source')} ↗</a>`:''}</div></div></li>`;
}
function paneAlign(s,pane){
  const draw=()=>{
    const r=scoreFor(s);
    const ev=s.evidence||{};
    const all=ISS.filter(i=>(ev[i.id]||[]).length);
    pane.innerHTML=`<h2>Voter alignment</h2>
    <p class="intro">How ${esc(s.short)}'s documented record compares with the positions you choose below. ${esc(evidenceOf(s).label)}.</p>
    ${ALNOTE}
    <div class="chart"><div class="kicker">Compared with your choices</div>
      <div class="big" style="margin-top:4px">${r.nChosen?(r.score==null?'Insufficient data':`${r.score}% match`):'No choices yet'}</div>
      ${r.nChosen?`<p class="small" style="margin:6px 0 0">${r.score==null?`Evidence covers ${r.nCov} of your ${r.nChosen} issues (${Math.round(r.covW/r.totW*100)||0}% of your total importance). A score needs at least ${r.need} issue${r.need===1?'':'s'} with evidence and at least half of your total importance.`:`<b>How it was calculated:</b> for each of your issues with evidence, the share of ${esc(s.short)}'s items that match your side, weighted by importance: ${r.rows.filter(x=>x.status!=='none').map(x=>`${esc(x.i.label)} ${x.match}/${x.n} × ${x.pr.w}`).join(' + ')} = ${(r.num).toFixed(2)}, divided by the covered importance ${r.covW} = <b>${r.score}%</b>. Issues without evidence (${r.nChosen-r.nCov}) are left out rather than scored as zero.`}</p>`:`<p class="small" style="margin:6px 0 0">Choose positions below, or on the <a href="#align">My alignment</a> page.</p>`}
    </div>
    ${r.nChosen?`<h3 style="margin-top:18px">Issue by issue</h3>${r.rows.map(x=>`<div class="alissue">
      <div class="row" style="justify-content:space-between"><div><b>${esc(x.i.label)}</b> <span class="small muted">· you: ${esc(sideLabel(x.i.id,x.pr.side))} · importance ${WLAB[x.pr.w]}</span></div>
      <div>${x.status==='none'?'<span class="chip ghost">Insufficient data</span>':`<span class="chip ${x.agree>=.5?'dfor':'dag'}">${x.match} of ${x.n} ${x.status==='record'?'recorded actions':'statements'} match</span>`}</div></div>
      ${x.status==='stated'?'<p class="small" style="margin:4px 0 0;color:var(--warn)">Based on stated positions only: no recorded vote, bill or official action on this issue.</p>':''}
      ${x.status==='record'&&x.st.length?`<p class="small muted" style="margin:4px 0 0">Stated positions on this issue (shown, not scored because recorded actions exist): ${x.stMatch} of ${x.st.length} match.</p>`:''}
      ${(x.rec.concat(x.st)).length?`<ul class="evl">${x.rec.concat(x.st).map(e=>evRow(Object.assign({issue:x.i.id},e),x.pr.side)).join('')}</ul>`:`<p class="small muted" style="margin:4px 0 0">No documented vote, bill, official action or statement on this issue was found for ${esc(s.short)}.${(s.notVoted||{})[x.i.id]?' Did not vote on: '+s.notVoted[x.i.id].map(n=>esc(n.title)).join('; ')+'.':''}</p>`}
    </div>`).join('')}`:''}
    <details class="tv" ${r.nChosen?'':'open'}><summary>${r.nChosen?'Change your choices':'Choose your positions'}</summary><div id="alb2" style="margin-top:10px">${builderHTML()}</div></details>
    ${all.length?`<h3 style="margin-top:22px">All coded evidence for ${esc(s.short)}</h3><p class="small muted">Every item used for alignment, by issue, whatever your choices.</p>${all.map(i=>`<div class="alissue"><b>${esc(i.label)}</b><ul class="evl">${ev[i.id].map(e=>evRow(Object.assign({issue:i.id},e),null)).join('')}</ul></div>`).join('')}`:`<div class="note" style="margin-top:16px">No documented action or statement by ${esc(s.short)} could be coded to the issue list, so no comparison is possible. ${s.recordType==='none'||s.recordType==='executive'?esc(s.short)+' has no legislative voting record.':''}</div>`}`;
    bindBuilder(pane.querySelector('#alb2'),rebuild=>{draw();});
    bindTips(pane);
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
    <p class="small muted" style="margin:4px 0 8px">${V.length} consequential roll calls chosen by this app, newest first. Open "Bill details" for the measure's summary, the recorded result and why it is filed under its issue.</p>${vtLegend()}
    <div class="filters" data-vf><button class="active" data-a="">All areas</button>${areas.map(a=>`<button data-a="${esc(a)}">${esc(a)}</button>`).join('')}</div><div data-vl></div></section>`;
  return html;
}
// ---------- funders' and spenders' own published positions vs. the candidate's votes ----------
const GP=DATA.groupPos||[], GPBY=Object.fromEntries(GP.map(g=>[g.key,g]));
function fundersBlock(s){
  const F=s.funderPos||[];
  const noVotes=!realVotes(s,DATA.votes).length&&!realVotes(s,DATA.hvotes).length;
  const head=`<section class="recsec" id="rec-funders"><div class="kicker">Funding and legislative activity, side by side</div><h3 style="margin-top:4px">What ${esc(s.short)}'s funders and spenders wanted, and how ${esc(s.short)} voted</h3>
    <div class="note small" style="margin:6px 0 12px">For groups that gave to ${esc(s.short)}'s campaign or spent on the race <i>and</i> publish their own positions on bills (congressional scorecards or "key vote" letters), each of the key votes the group took a position on is shown next to ${esc(s.short)}'s recorded vote, with a link to the group's own page. <b>A match shows agreement, not that money influenced the vote</b>: groups mostly fund and support people who already vote their way, and spend against people who don't. Positions are collected for organizations that publish scorecards or key-vote letters (${GP.filter(g=>g.status==='done').length} of ${GP.length} finished so far); other spenders, including the large party-aligned super PACs, are not compared.</div>`;
  if(!F.length)return head+`<p class="small muted">None of the ${GP.length} organizations whose published positions are collected gave to ${esc(s.short)}'s campaign or spent on this race in the data used here.</p></section>`;
  const money=g=>[g.pac?`gave <b class="num">${fmtFull(g.pac)}</b> to the campaign (${g.pacN} contribution${g.pacN>1?'s':''}, ${esc(s.pac.window)})`:'',g.for?`spent <b class="num">${fmtFull(g.for)}</b> ${s.out.multi?'supporting':'for'} ${esc(s.short)}`:'',g.against?`spent <b class="num">${fmtFull(g.against)}</b> ${s.out.multi?'opposing':'against'} ${esc(s.short)}`:''].filter(Boolean).join('; ');
  const body=F.map(g=>{
    const meta=GPBY[g.key]||{};
    let res;
    if(g.status==='pending')res=`<p class="small" style="margin:6px 0 0">${flag('Research not finished','This organization\'s published positions have not been collected yet; they will be added in the next update.')} Its positions on these votes are not shown yet.</p>`;
    else if(noVotes)res=`<p class="small muted" style="margin:6px 0 0">${esc(s.short)} has no recorded congressional votes among the key votes, so there is nothing to compare.</p>`;
    else if(!g.compared.length)res=`<p class="small muted" style="margin:6px 0 0">No published position by ${esc(g.org)} was found on the key votes ${esc(s.short)} cast.</p>`;
    else res=`<p class="small" style="margin:6px 0 4px"><b>${esc(s.short)} voted the way ${esc(g.org)} wanted on ${g.agree} of ${g.n} key votes it scored or took a public position on.</b></p>
      <div class="tablewrap"><table><thead><tr><th>Vote</th><th>${esc(g.org)} wanted</th><th>${esc(s.short)} voted</th><th>Same?</th><th>Group's own source</th></tr></thead><tbody>${g.compared.map(c=>{const v=(DATA.votes.concat(DATA.hvotes)).find(x=>x.id===c.voteId);return `<tr><td><a href="${voteUrl(v)}" target="_blank" rel="noopener">${esc(c.short)}</a><div class="small muted">${esc(c.chamber)} · ${fmtDate(c.date)}</div></td><td><span class="chip ${posClass(c.wanted)}">${esc(c.wanted)}</span></td><td><span class="chip ${posClass(c.cast)}">${esc(c.cast)}</span></td><td>${c.match===null?'<span class="muted">did not vote</span>':c.match?'<b style="color:var(--good)">✓ Same</b>':'<b style="color:var(--crit)">✕ Opposite</b>'}</td><td class="small">${c.basis==='scorecard'?'Scored in its scorecard':'Public position before the vote'}: <a href="${esc(c.src.u)}" target="_blank" rel="noopener">${esc(c.src.t)} ↗</a></td></tr>`}).join('')}</tbody></table></div>`;
    return `<div class="mv"><h4>${esc(g.org)}</h4><p class="small" style="margin:0">${money(g)}${g.spenders.length?` <span class="muted">(${esc(g.spenders.join(', '))})</span>`:''}</p>${res}</div>`;}).join('');
  return head+body+`<p class="small muted" style="margin-top:10px">Organizations researched: ${GP.map(g=>esc(g.org)+(g.status==='pending'?' (in progress)':'')).join(', ')}. <a href="#method">How positions were collected</a>.</p></section>`;
}

function moneyVotesBlock(s){
  const A=s.assoc||{}, keys=ISS.map(i=>i.id).filter(k=>A[k]);
  const head=`<section class="recsec" id="rec-money"><div class="kicker">Funding and legislative activity, by issue</div><h3 style="margin-top:4px">Money and votes by issue</h3>
    <div class="note small" style="margin:6px 0 12px"><b>How to read this:</b> for each issue, ${esc(s.short)}'s recorded actions are shown next to the PACs that gave to the campaign and the outside groups that spent on the race whose sector, documented orientation or name ties them to that issue. Shown together so you can look for patterns yourself. <b>This does not show that any contribution or spending influenced a vote</b>: groups often back candidates who already agree with them, and both can reflect party alignment. Hover or tap the dotted label next to each group to see why it is linked to the issue.</div>`;
  if(!keys.length)return head+`<p class="small muted">No issue-linked groups or coded actions were found for ${esc(s.short)}.</p></section>`;
  const body=keys.map(k=>{const a=A[k], ev=((s.evidence||{})[k]||[]).filter(e=>RECT.has(e.type)), st=((s.evidence||{})[k]||[]).filter(e=>e.type==='stated');
    return `<div class="mv"><h4>${esc(ISSBY[k].label)}</h4><div class="mvgrid">
      <div><div class="kicker">${esc(s.short)}'s recorded actions</div>${ev.length?`<ul class="list small">${ev.map(e=>`<li><b>${esc(e.title)}</b> (${esc(e.date||'')}): ${esc(e.pos||'')} → "${esc(sideLabel(k,e.side))}" <span class="muted">${esc(TYPEL[e.type])}</span></li>`).join('')}</ul>`:`<p class="small muted">No recorded vote, bill or official action on this issue${st.length?` (${st.length} stated position${st.length>1?'s':''} on the Voter alignment tab)`:''}.</p>`}</div>
      <div><div class="kicker">Groups with a stake in this issue</div>
        ${a.pac.length?`<p class="small" style="margin:4px 0 2px"><b>PAC contributions to the campaign</b> (${esc(s.pac.window)}): ${fmtFull(a.pacTotal)} from ${a.pac.length+a.pacMore} PAC${a.pac.length+a.pacMore>1?'s':''}</p>${(()=>{const li=g=>`<li>${esc(g.name)}: <b class="num">${fmtFull(g.amount)}</b> <span class="muted">(${g.n} × ${g.reports.map(fi=>esc(s.pac.filings[fi].report)).join(', ')})</span> <span class="term small" tabindex="0" data-tip="${esc(g.why)}">${esc(g.whyShort)}</span></li>`;return `<ul class="list small">${a.pac.slice(0,5).map(li).join('')}</ul>${a.pac.length>5?`<details class="tv"><summary>${a.pac.length-5} more</summary><ul class="list small">${a.pac.slice(5).map(li).join('')}</ul></details>`:''}`})()}${a.pacMore?`<p class="small muted">and ${a.pacMore} more in the PAC table on the Funding tab.</p>`:''}`:'<p class="small muted" style="margin:4px 0">No issue-linked PAC contributions in the itemized reports.</p>'}
        ${a.out.length?`<p class="small" style="margin:8px 0 2px"><b>Outside spending on the race</b> (${period(s.out.start,s.out.end)}):</p><ul class="list small">${a.out.map(o=>{const m=cmOf(o.ci);return `<li>${esc(m[1])} (${CLS1[m[2]]}): ${o.for?`<b class="num">${fmtFull(o.for)}</b> ${s.out.multi?'supporting':'for'} ${esc(s.short)}`:''}${o.for&&o.against?'; ':''}${o.against?`<b class="num">${fmtFull(o.against)}</b> ${s.out.multi?'opposing':'against'}`:''}, ${fmtDate(o.first)}${o.last!==o.first?' – '+fmtDate(o.last):''} <span class="term small" tabindex="0" data-tip="${esc(o.why)}">${esc(o.whyShort)}</span></li>`}).join('')}</ul>`:''}
      </div></div></div>`}).join('');
  return head+body+'</section>';
}
function ethicsHTML(s){
  return `<section class="recsec" id="rec-ethics"><div class="kicker">Ethics & legal compliance</div><h3 style="margin-top:4px">Ethics & legal compliance</h3>
  <p class="small muted" style="margin:4px 0 8px">Documented findings, penalties, investigations and disclosure checks, each tied to an official record or credible report. An investigation without a finding is labeled as such; "None found" means the sources checked turned up nothing, not that nothing exists.</p>
  ${s.ethics.map(e=>`<article class="eth"><div class="head"><span class="chip ${e.sev}">${esc(e.type)}</span><span class="mono muted">${esc(e.date)}</span></div><h3>${esc(e.title)}</h3><p style="margin-top:8px">${esc(e.summary)}</p><div class="outcome"><b>Outcome:</b> ${esc(e.outcome)}</div><ul class="srcs">${e.sources.map(x=>`<li><a href="${esc(x.u)}" target="_blank" rel="noopener">${esc(x.t)} ↗</a></li>`).join('')}</ul></article>`).join('')}
  ${s.ethicsSearched&&s.ethics.some(e=>e.outcome!=='None found')?`<p class="small muted" style="margin-top:12px"><b>Also checked:</b> ${esc(s.ethicsSearched)}</p>`:''}</section>`;
}
function paneRecord(s,pane,focus){
  const inc=!s.cand;
  const SV=inc?(s.chamber==='S'?DATA.votes:[]):(s.senateVotes?DATA.votes.filter(v=>s.id in v.pos):[]);
  const HV=inc?(s.chamber==='H'?DATA.hvotes:[]):(s.ideoKind==='house'?DATA.hvotes.filter(v=>s.id in v.pos):[]);
  const ev=evidenceOf(s);
  const jump=[['rec-ideo','Ideology'],SV.length&&['rec-sv','Senate votes'],HV.length&&['rec-hv','House votes'],inc&&['rec-bills','Sponsored bills'],!inc&&['rec-other',recordHeading(s)],s.stateRecord&&['rec-state','State legislative record'],['rec-funders','Funders vs. votes'],['rec-money','Money and votes by issue'],['rec-ethics','Ethics']].filter(Boolean);
  pane.innerHTML=`
  <h2>Legislative record</h2>
  <p class="intro">${inc?`${esc(s.short)}'s positions on consequential ${CH[s.chamber].name} roll calls, sponsored bills`:esc(REC_LABEL[s.recordType]||'')+'. '+esc({member_of_congress:'Positions on key House roll calls and notable sponsored bills',senator:'Positions on key Senate roll calls and notable sponsored bills',former_member_of_congress:'Votes and bills from '+s.short+"'s time in Congress",state_legislator:'Recorded votes and bills from '+s.short+"'s time in a state legislature",executive:'No legislative votes in executive office; major official actions are listed instead',none:'No legislative voting record; documented public actions and commitments are listed instead'}[s.recordType]||'')}${hasStateLeg(s)&&s.recordType!=='state_legislator'?', a separate state legislative record':''}, money and votes side by side, and ethics. Each item links to its source.</p>
  <div class="note" style="margin-bottom:12px"><b>Evidence available:</b> ${esc(ev.label)}.</div>
  <nav class="jump small">${jump.map(([k,l])=>`<a href="#${k}">${esc(l)}</a>`).join('')}</nav>
  <div id="rec-ideo">${ideoBlock(s,'ideo2')}<div class="chart">${kvBlock(s,'kv2',true)}</div></div>
  ${keyVotesBlock(s,SV,'Key U.S. Senate votes','rec-sv')}
  ${keyVotesBlock(s,HV,'Key U.S. House votes','rec-hv')}
  ${inc?`<section class="recsec" id="rec-bills"><div class="kicker">Congressional record</div><h3 style="margin-top:4px">Sponsored legislation</h3><p class="small" style="margin:6px 0 10px">${s.sponsoredCount?`<b class="num">${s.sponsoredCount.toLocaleString()}</b> bills, resolutions and amendments sponsored. ${esc(s.sponsoredNote)}`:esc(s.sponsoredNote)} <a href="${cgUrl(s)}" target="_blank" rel="noopener">Full list on Congress.gov ↗</a></p>
    <div class="tablewrap"><table><thead><tr><th>Measure</th><th>Title</th><th>Policy area</th><th>Introduced</th></tr></thead><tbody>${s.bills.map(b=>`<tr><td class="mono" style="white-space:nowrap"><a href="${esc(b.url)}" target="_blank" rel="noopener">${esc(b.num)}</a></td><td>${esc(b.title)}</td><td class="small">${esc(b.area)}</td><td class="mono">${esc(b.date)}</td></tr>`).join('')}</tbody></table></div></section>`:
  `<section class="recsec" id="rec-other"><div class="kicker">${esc(recordKicker(s))}</div><h3 style="margin-top:4px">${esc(recordHeading(s))}</h3>
    <div>${s.record.map(r=>`<div class="vote"><div class="d">${esc(r.date||'')}</div><div><div class="t">${esc(r.title)}</div><div class="s">${esc(r.detail)}</div><div class="s muted">${esc(r.area||'')}${r.src?` · <a href="${esc(r.src.u)}" target="_blank" rel="noopener">${esc(r.src.t)} ↗</a>`:''}${(r.more||[]).map(m=>` · <a href="${esc(m.u)}" target="_blank" rel="noopener">${esc(m.t)} ↗</a>`).join('')}</div></div><div class="pos"><span class="chip ${posClass(r.position)}">${esc(r.position||'')}</span></div></div>`).join('')}</div></section>`}
  <div id="rec-state">${stateRecordBlock(s)}</div>
  ${fundersBlock(s)}
  ${moneyVotesBlock(s)}
  ${ethicsHTML(s)}`;
  mountIdeo('ideo2',s);
  mountKV('kv2',s);
  pane.querySelectorAll('#rec-sv,#rec-hv').forEach(sec=>{const V=sec.id==='rec-sv'?SV:HV;const f=sec.querySelector('[data-vf]'),L=sec.querySelector('[data-vl]');
    const draw=a=>{L.innerHTML=V.filter(v=>!a||v.area===a).slice().sort((x,y)=>y.date.localeCompare(x.date)).map(v=>{const p=v.pos[s.id]||'—';return `<div class="vote"><div class="d">${v.date}</div><div><div class="t"><a href="${voteUrl(v)}" target="_blank" rel="noopener">${esc(v.short)}</a></div><div class="s">${esc(v.issue)} · ${esc(v.result)}</div><div class="s muted">${esc(v.area)}</div><div class="s" style="margin:4px 0">${leanTag(v)}</div>${billDetails(v)}</div><div class="pos">${voteText(v,p)}</div></div>`}).join('');};
    draw('');f.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;f.querySelector('.active').classList.remove('active');b.classList.add('active');draw(b.dataset.a);});});
  pane.querySelectorAll('.jump a').forEach(a=>a.addEventListener('click',e=>{e.preventDefault();const t=document.getElementById(a.getAttribute('href').slice(1));if(t)t.scrollIntoView({behavior:'smooth',block:'start'});}));
  bindTips(pane);
  if(focus){const t=document.getElementById(focus);if(t)setTimeout(()=>t.scrollIntoView({block:'start'}),50);}
}

function paneStatements(s,pane){
  pane.innerHTML=`
  <h2>Statements vs. actions</h2>
  <p class="intro">Each check pairs something ${esc(s.short)} said or pledged with what the record shows. The label describes that pairing, not the merits of the policy.</p>
  <dl class="legendlist small">
    <div><dt><span class="chip good">✓ Consistent</span></dt><dd>The action matches the statement.</dd></div>
    <div><dt><span class="chip crit">✕ Direct contradiction</span></dt><dd>The documented record directly conflicts with what was said.</dd></div>
    <div><dt><span class="chip warn">◐ Partly consistent</span></dt><dd>The record clearly matches part of the statement and clearly conflicts with another part.</dd></div>
    <div><dt><span class="chip neutral">? Ambiguous or incomplete evidence</span></dt><dd>Statement and action point in different directions, but whether they conflict depends on interpretation, or the evidence is incomplete.</dd></div>
    <div><dt><span class="chip serious">↻ Changed position</span></dt><dd>An acknowledged or evident reversal over time.</dd></div>
    <div><dt><span class="chip neutral">◇ Outcome check</span></dt><dd>The action matched the stated reasoning at the time, but later events bear on it.</dd></div>
  </dl>
  ${s.statements.map(x=>{const [cls,lab]=ASSESS[x.assessment];return `
  <article class="stmt ${x.assessment}">
    <h3>${esc(x.topic)}</h3>
    <div class="sd">
      <div><div class="k">What was said</div><div>${esc(x.said.text)}</div><div class="src">${esc(x.said.date)} · <a href="${esc(x.said.src.u)}" target="_blank" rel="noopener">${esc(x.said.src.t)} ↗</a></div></div>
      <div><div class="k">What the record shows</div><div>${esc(x.did.text)}</div><div class="src">${esc(x.did.date)} · <a href="${esc(x.did.src.u)}" target="_blank" rel="noopener">${esc(x.did.src.t)} ↗</a></div></div>
    </div>
    ${x.record?`<div class="small" style="margin-top:10px;color:var(--ink-2)"><b>Context:</b> ${esc(x.record)} ${x.recordSrc?`<a href="${esc(x.recordSrc.u)}" target="_blank" rel="noopener">${esc(x.recordSrc.t)} ↗</a>`:''}</div>`:''}
    <div class="verdict"><span class="chip ${cls}">${AICON[x.assessment]} ${lab}</span><div class="note">${esc(x.note)}</div></div>
  </article>`}).join('')}`;
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
  pane.innerHTML=`<h2>Sources for this profile</h2><p class="intro">${uniq.length} distinct records and reports. Roll-call votes link directly from the ${s.cand?'Record':'Votes & bills'} tab; every independent expenditure links to its FEC filing from the Funding tab.</p><ul class="list">${uniq.map(x=>`<li><a href="${esc(x.u)}" target="_blank" rel="noopener">${esc(x.t)}</a> <span class="small muted mono">${esc(x.u.replace(/^https?:\/\//,'').split('/')[0])}</span></li>`).join('')}</ul>`;
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
    <p class="small muted" style="margin:8px 0 0">Campaign funds and outside spending are separate: outside groups' spending never passes through a campaign, and the two cover different periods (outside spending through ${fmtDate(DATA.ie_asof)}).</p>
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
    <div class="note small" style="margin:8px 0">Funding comparison only: full profiles (record, statements, ethics, alignment) have not been built for this race.</div>
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
  <p class="lede">Every profiled candidate next to their 2026 opponents, competitive races first. Campaign funds and outside spending are separate rows with their own dates, and each candidate's kind of record is labeled so like is compared with like.</p>
  <div class="toolbar"><div class="seg" id="rs"><button data-c="S" class="active">Senate (${S.length})</button><button data-c="H">House (${H.length+DATA.liteRaces.length})</button></div>
  <label class="small muted">Jump to <select id="rj">${S.concat(H).concat(DATA.liteRaces.map(r=>({id:r.id,label:r.label,chamber:'H'}))).map(r=>`<option value="${r.id}">${esc(r.label)}</option>`).join('')}</select></label></div></section>
  <div id="rlist"></div>`;
  const draw=ch=>{const L=DATA.races.filter(r=>r.chamber===ch);
    $('#rlist').innerHTML=ch==='S'?`<h2 style="margin-top:8px">Competitive Senate races</h2><p class="small muted" style="margin:4px 0 0;max-width:80ch">Rated Toss-up, Tilt or Lean by at least one of the Cook Political Report, Inside Elections or Sabato's Crystal Ball (ratings of Sept. 17–23, 2026, as compiled on <a href="https://en.wikipedia.org/wiki/2026_United_States_Senate_elections" target="_blank" rel="noopener">Wikipedia</a>). Every such race is covered.</p>${L.filter(r=>r.competitive).map(r=>`<div id="r-${r.id}">${raceCard(r)}</div>`).join('')}<h2 style="margin-top:26px">Other Senate races covered</h2>${L.filter(r=>!r.competitive).map(r=>`<div id="r-${r.id}">${raceCard(r)}</div>`).join('')}`
      :`<h2 style="margin-top:8px">House toss-ups with full profiles</h2><p class="small muted" style="margin:4px 0 0;max-width:80ch">Eight of the ${L.length+DATA.liteRaces.length} House races the Cook Political Report rates Toss-up (Sept. 25, 2026), with full profiles of both nominees.</p>${L.map(r=>`<div id="r-${r.id}">${raceCard(r)}</div>`).join('')}
        <h2 style="margin-top:26px">Other House toss-ups: funding only</h2><p class="small muted" style="margin:4px 0 0;max-width:80ch">The remaining ${DATA.liteRaces.length} Cook toss-ups, with verified nominees, campaign funds and outside spending. Records, statements and ethics have not been researched for these candidates yet, so they have no profiles.</p>${DATA.liteRaces.map(r=>`<div id="r-${r.id}">${liteCard(r)}</div>`).join('')}`;
    bindTips(app);};
  draw('S');
  $('#rs').addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;$('#rs .active').classList.remove('active');b.classList.add('active');draw(b.dataset.c);});
  $('#rj').addEventListener('change',e=>{const r=DATA.races.find(x=>x.id===e.target.value)||Object.assign({chamber:'H'},DATA.liteRaces.find(x=>x.id===e.target.value));const want=r.chamber;const cur=$('#rs .active').dataset.c;if(cur!==want){$('#rs .active').classList.remove('active');$(`#rs button[data-c="${want}"]`).classList.add('active');draw(want);}document.getElementById('r-'+r.id).scrollIntoView({behavior:'smooth',block:'start'});});
}

// ---------- compare ----------
let cmpGrp='all';
function renderCompare(){
  const V=CH[cmpCh].votes, M=MEM.filter(s=>s.chamber===cmpCh).concat(cmpCh==='S'?CANDS.filter(s=>s.senateVotes):[]);
  const areas=[...new Set(V.map(v=>v.area))].sort();
  app.innerHTML=`
  <section class="hero" style="padding-bottom:10px"><div class="asof">Roll calls since 2021 · ideology · money</div><h1 style="margin-top:8px">Compare</h1>
  <p class="lede">How the senators and representatives profiled here voted on consequential roll calls (former Sen. Sherrod Brown's votes are included for the years he served), then ideology, campaign funds and outside spending side by side for all ${ALL.length} people profiled.</p>
  <div class="toolbar"><div class="seg" id="cs"><button data-c="S" class="${cmpCh==='S'?'active':''}">Senate votes</button><button data-c="H" class="${cmpCh==='H'?'active':''}">House votes</button></div></div></section>
  <div class="filters" id="cf"><button class="active" data-a="">All areas</button>${areas.map(a=>`<button data-a="${esc(a)}">${esc(a)}</button>`).join('')}</div>
  ${vtLegend()}<div class="matrix"><table id="mx"><thead><tr><th>Vote</th>${M.map(s=>`<th class="sen"><a href="#${s.id}">${esc(s.short)}</a><br><span class="chip ${s.party}" style="margin-top:4px">${s.party}-${esc(seatLabel(s))}</span>${s.recordType==='former_member_of_congress'?'<div class="small muted" style="font-weight:400;text-transform:none;letter-spacing:0">former senator</div>':''}</th>`).join('')}</tr></thead><tbody></tbody></table></div>
  <section class="section">
    <h2>Side by side</h2>
    <p class="intro">Campaign funds and outside spending are separate columns with their own periods, drawn on one shared scale; they are never added. Ideology percentiles are within each member's own chamber; candidates without a congressional record show their record type. The kind of evidence differs by person (U.S. votes, state legislative votes or no voting record), so ideology cells are not comparable across those types. Click a column to sort.</p>
    <div class="toolbar" style="margin:0 0 10px"><div class="seg" id="cg"><button data-g="all" class="${cmpGrp==='all'?'active':''}">All ${ALL.length}</button><button data-g="S" class="${cmpGrp==='S'?'active':''}">Senate races</button><button data-g="H" class="${cmpGrp==='H'?'active':''}">House races</button></div></div>
    <div class="tablewrap"><table id="side"><thead><tr><th><button data-k="name">Name</button></th><th><button data-k="pctl">Voting record</button></th><th class="r"><button data-k="unity">Party unity</button></th><th><button data-k="rc">Campaign funds raised</button></th><th><button data-k="of">Outside spending for</button></th><th><button data-k="oa">Outside spending against</button></th><th><button data-k="al">Compared with your choices</button></th></tr></thead><tbody></tbody></table></div>
    <p class="small muted" style="margin:8px 0 0">Campaign funds: FEC two-year summaries, reports through the date shown for each person (mostly June 30, 2026). Outside spending: general-election independent expenditures through ${fmtDate(DATA.ie_asof)}. In Montana's three-way race the outside-spending columns show only spending aimed directly at that candidate.</p>
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
    $('#side tbody').innerHTML=rows.map(({s,rc,of,oa,sc})=>`<tr><td><a href="#${s.id}-funding">${esc(s.name)}</a><div class="row" style="margin-top:3px"><span class="chip ${s.party}">${s.party}-${esc(seatLabel(s))}</span><span class="chip ch">${chipCh(s)}</span></div></td><td class="small">${esc(ideoText(s).short)}<div class="muted">${esc(evidenceOf(s).kind==='us'?'U.S. votes':evidenceOf(s).kind==='former'?'past congressional record':evidenceOf(s).kind==='state'?'state legislative record':evidenceOf(s).kind==='exec'?'executive record, no votes':'no voting record')}</div></td><td class="r">${s.ideo&&s.ideo.unity!=null?s.ideo.unity+'%':'—'}</td><td style="min-width:170px">${cell(rc,max,'--s1',s.camp.missing?'':'through '+fmtDate(s.camp.end))}</td><td style="min-width:170px">${cell(of,max,'--neutral',s.out.incomplete.length?'incomplete data':'')}</td><td style="min-width:170px">${cell(oa,max,'--neutral','')}</td><td style="min-width:150px">${scoreBadge(sc)}<div class="small muted">${esc(evidenceMix(s))}</div></td></tr>`).join('');bindTips(app);};
  drawS();
  $('#side thead').addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;const k=b.dataset.k;sort=sort.k===k?{k,dir:-sort.dir}:{k,dir:k==='name'?1:-1};drawS();});
  $('#cg').addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;cmpGrp=b.dataset.g;$('#cg .active').classList.remove('active');b.classList.add('active');drawS();});
}

// ---------- methodology ----------
function renderMethod(){
  const sv=DATA.votes.length, hv=DATA.hvotes.length;
  const nRows=Object.values(IE.rows).reduce((a,r)=>a+r.length,0);
  app.innerHTML=`
  <section class="hero" style="padding-bottom:10px"><div class="asof">How this works</div><h1 style="margin-top:8px">Methodology</h1><p class="lede">What is covered, where every number comes from, how figures are calculated, and what is missing.</p></section>
  <section class="section prose">
    <h2>What changed in this version (October 3, 2026)</h2>
    <ul class="list">
      <li><b>Voter alignment:</b> choose a side and an importance on ${ISS.length} issues ("My alignment" in the top menu, or the Voter alignment tab on any profile) and see how each candidate's documented record compares, issue by issue, with every piece of evidence, its date, its type (recorded vote, bill, official action or stated position) and the arithmetic. Candidates without enough evidence show "Insufficient data".</li>
      <li><b>Money and votes side by side:</b> each Legislative record tab now lists, issue by issue, the candidate's recorded actions next to the PACs and outside groups with a stake in that issue, described as associations only.</li>
      <li><b>Bill details:</b> every key vote now opens to the measure's official title, a summary from the Congressional Research Service or another cited source, the recorded question and result, and why it is filed under its issue (or why it is not used for alignment).</li>
      <li><b>All 22 House toss-up races</b> (Cook, Sept. 25, 2026) are now on the Races page: 8 with full profiles and 14 with verified nominees, campaign funds and outside spending.</li>
      <li><b>Simpler profiles:</b> five tabs (Overview, Funding, Legislative record, Statements vs. actions, Voter alignment); ethics now sits inside the Legislative record tab, and sources are one link away.</li>
      <li><b>Citations:</b> 37 Wikipedia citations were replaced with official, Ballotpedia or news sources; claims those sources did not support were trimmed (for example, unconfirmed primary percentages), and three errors were corrected (Paxton finished second, not first, in the March primary; the 2002 phone-jamming settlement was $135,000; Wess's primary share was 39.57%). One unconfirmed ethics item (Merrin) was removed.</li>
      <li>Added the Ohio special election (Sen. Jon Husted vs. Sherrod Brown) and Nebraska (Sen. Pete Ricketts vs. independent Dan Osborn). Every Senate race rated Toss-up, Tilt or Lean by Cook, Inside Elections or Sabato is now covered, and the Races page lists those first with their ratings.</li>
      <li>Candidates who served in a state legislature now have a separate, labeled "State legislative record" section, distinct from any congressional or executive record, listing their seats and the votes and bills that could be sourced.</li>
      <li>Statement checks now separate a direct contradiction from a pairing whose evidence is ambiguous or incomplete; the former "mixed" label is gone.</li>
      <li>Race and comparison views now state what kind of evidence each candidate's record rests on, and flag when candidates are compared on different kinds.</li>
      <li>Campaign funds and outside spending are now shown separately everywhere. The earlier "all PAC and super PAC money" total, which added outside groups' spending to PAC checks the campaign received, has been withdrawn.</li>
      <li>The super PAC percentage shown in earlier versions has been withdrawn: it divided outside spending through Sept. 30 by campaign receipts through mid-2026. See "Super PAC share" below.</li>
      <li>Senators' headline figures now cover 2025–26, the same two-year period as everyone else, instead of their six-year Senate cycle.</li>
      <li>Outside spending is now counted for or against a candidate only when it names that candidate or the candidate's current opponent. $6.86 million spent opposing Graham Platner, who withdrew from the Maine race, had been counted as help for Sen. Collins; it is now listed separately.</li>
      <li>Spending dated before 2025 (2024-election ads filed late) is excluded; it had added about $330,000, mostly to three House races. Seven items filed twice with the same transaction ID ($243,601, mostly in Alaska) are now counted once.</li>
      <li>Every independent expenditure (${nRows.toLocaleString()} items) and every itemized PAC contribution can now be inspected on each Funding tab, with dates or report periods and links to the FEC filings.</li>
    </ul>
    <h2>The Overview page</h2>
    <p>Each profile opens on its Overview: five small visuals and a short ethics list, each readable in a few seconds. Everything shown is also on a deeper tab, linked from the card.</p>
    <ul class="list">
      <li><b>Where the campaign's money comes from:</b> one bar splitting the FEC two-year total receipts into small donors (gifts of $200 or less, the FEC's "unitemized" individual contributions), larger individual donors (over $200), PACs and other committees, party committees, the candidate's own contributions and loans, and a last group for joint-fundraising transfers and other receipts. The groups add up to total receipts, so nothing is left out or counted twice. A campaign with no FEC report yet shows a note instead.</li>
      <li><b>Outside money for and against:</b> two bars on one scale, using the same "for" and "against" totals as the Funding tab (see Outside spending below), with the three largest spenders named under each. It is never added to campaign money.</li>
      <li><b>How they compare with your choices:</b> one row per issue you chose in My alignment. A check mark means every recorded item on the issue matches your side, a cross means none does, a half mark means the record is split, and an empty dashed circle means no evidence, which is never counted as a mismatch. No single percentage is shown. Until you choose issues, the card only invites you to.</li>
      <li><b>Where they sit politically:</b> the candidate's DW-NOMINATE score as a dot among faint dots for every current member of their chamber. People with no congressional voting record show "No voting score" and are never placed on the line. Below it, a second chart shows how the candidate voted on the bills marked liberal or conservative (next section).</li>
      <li><b>Do their words match their actions?:</b> the count of checked statements the record supports, those it contradicts, those partly supported or changed over time, and those unclear or affected by later events. It always states how many statements were checked, because a few checks are not a full picture of what someone has said.</li>
      <li><b>Ethics:</b> a text list rather than a chart, because very different things should not look alike. Each item carries one tag, assigned from the entry's own sources. <b>Allegation:</b> a complaint or report with no official finding. <b>Investigation:</b> a formal inquiry, lawsuit or proceeding, whether pending, closed or ended without a finding against the person. <b>Confirmed finding:</b> a court, agency or ethics body found a violation or imposed a penalty, or the person admitted it. The outcome is shown beside each item, and the full entry with sources is in the Legislative record tab.</li>
    </ul>
    <h2>Key votes marked liberal or conservative</h2>
    <p>Each key vote is checked against the issues it is coded to. Where an issue is a clear liberal-versus-conservative policy question in current U.S. politics, one side is marked liberal and the other conservative, as listed below. A bill is marked only if every issue it is coded to points the same way. Bills on unmarked issues, bipartisan deals, nominations and stopgap funding bills are left unmarked, and each unmarked bill shows its reason on the Legislative record tab. The marking is a judgment, kept in one place (<span class="mono">liberalSide</span> on each issue in <span class="mono">research.json</span>) so it can be reviewed and changed.</p>
    <ul class="list">${ISS.map(i=>i.liberalSide?`<li><b>${esc(i.label)}:</b> liberal side = "${esc(i[i.liberalSide])}"; conservative side = "${esc(i[i.liberalSide==='A'?'B':'A'])}".</li>`:`<li><b>${esc(i.label)}:</b> not marked. ${esc(i.leanNote)}</li>`).join('')}</ul>
    <p>A person's key-vote position counts only the marked bills they voted on: a Yea takes the side the bill is marked with and a Nay takes the other. A missed vote, and any bill from before the person took office, is not counted. A position is shown only with at least ${KV_MIN} such votes, and the chart places the person by the share of those votes taken on the conservative side. This counts a small, selected set of consequential votes. It is not a statistical ideology score, it can be compared only within a chamber because the House and Senate sets differ, and it should not be confused with the DW-NOMINATE career score above it, which uses every roll call. Vote text is always plain black; the "Side taken" column says whether each vote was on the liberal or the conservative side.</p>
    <h2>Who is covered</h2>
    <p><b>Senate incumbents:</b> six senators on the November 3, 2026 ballot, three Republicans and three Democrats, chosen as a bipartisan sample of competitive and safe seats. Two senators originally selected were replaced during research because they will not be on the ballot: Sen. Lindsey Graham (R-SC) died in July 2026 and Sen. Markwayne Mullin (R-OK) left the Senate for an administration post.</p>
    <p><b>House:</b> the Cook Political Report rates 22 House races Toss-up (Sept. 25, 2026). Eight have full profiles of both nominees (four seats held by each party). The other 14 are shown on the Races page with their nominees (verified from election results or news reports), campaign funds and outside spending only; their records, statements and ethics have not been researched yet.</p>
    <p><b>Challengers and open seats:</b> every opponent of those 14 incumbents, and both major-party nominees in each open Senate race (plus independent Seth Bodnar in Montana). Nominees were confirmed from primary and runoff results.</p>
    <p><b>Ohio and Nebraska:</b> Sen. Jon Husted (appointed in January 2025) and Sen. Pete Ricketts are profiled alongside their opponents, Sherrod Brown and independent Dan Osborn. No Democrat is on the Nebraska ballot: the Democratic nominee withdrew in July 2026 and the state party declined to name a replacement.</p>
    <h2>Competitive races</h2>
    <p>A Senate race is marked competitive when at least one of the Cook Political Report (Sept. 23), Inside Elections (Sept. 17) or Sabato's Crystal Ball (Sept. 22, 2026) rates it Toss-up, Tilt or Lean, as compiled in Wikipedia's ratings table. That gives ten races: Alaska, Georgia, Iowa, Kansas, Maine, Michigan, New Hampshire, North Carolina, Ohio and Texas; all are covered. Nebraska is rated Likely Republican by all three but Toss-up or Lean by some other forecasters, and is included. House races were chosen from Cook's toss-up list at the time of research; their ratings have not been re-checked.</p>
    <h2>Campaign funds raised</h2>
    <p>Each campaign's figures are the FEC's two-year summary for its principal campaign committee (2025–26), through the end date of its latest report, usually June 30, 2026. "Campaign funds raised" is the FEC's total receipts: individual contributions, PAC and party contributions, transfers from joint fundraising committees, the candidate's own loans and contributions, and other receipts. Where a candidate's own money is more than 20% of the total, the profile says so. Cash on hand and debts are as of the same date. Third-quarter reports, through Sept. 30, are due October 15, 2026.</p>
    <h2>PAC contributions</h2>
    <p>PAC contributions are part of campaign funds. Each row is one contribution itemized on FEC Schedule A, line 11C, in the reports listed on the profile: 2025–26 reports for senators and January–June 2026 reports for everyone else. The FEC lists contributions by report, so each row shows its report and period, not an exact date. Rows were transcribed from the FEC's report viewer; where some could not be read, the profile shows the share covered and does not estimate the rest. Sectors are assigned by this app from each committee's name and sponsor (not reported by the FEC); committees that cannot be identified from the filing are left unclassified. "Orientation" appears only where a group's political purpose is documented.</p>
    <h2>Outside spending (independent expenditures)</h2>
    <p>An independent expenditure is spending on ads, mail or canvassing that supports or opposes a candidate, paid for by a group that may not coordinate with the campaign. It is never money the campaign raised. Data: ${esc(IE.source)} Items run from January 1, 2025 to ${fmtDate(IE.asof)}, by date of dissemination. Three filings were spot-checked against FEC images.</p>
    <ul class="list">
      <li><b>For a candidate</b> = items supporting that candidate plus items opposing the candidate's current opponent. <b>Against</b> = items opposing the candidate plus items supporting the opponent.</li>
      <li>Items naming anyone else (a primary candidate, or a nominee who withdrew) are listed separately and counted for no one.</li>
      <li>Three-way races (Montana): spending against one candidate cannot be credited to a single rival, so profiles summarize only spending aimed directly at that candidate and list spending aimed at rivals separately.</li>
      <li>Spending is split by who paid: super PACs, other outside groups (nonprofits and traditional PACs) and party committees. Party coordinated spending is a different category and is not included.</li>
      <li>Negative amounts are corrections filed by the spender and are kept so totals match the filings.</li>
      <li>An item that appears in two filings identical in every field, including its transaction ID, is the same spending reported twice (an amended or repeated notice) and is counted once, from the latest filing. Items identical except for the transaction ID are kept, because the filings list them as separate transactions, but are flagged "possible repeat" and their total is stated on the profile.</li>
      <li>Some notices are filed in advance with a dissemination date after the data cut-off; the data set shows those as Sept. 30, and they are flagged "date capped".</li>
      <li>When one ad both supports a candidate and opposes the opponent, the spender is supposed to split its cost between two lines; both lines count toward "for" the same candidate, so the split does not change the totals. If a spender instead reported the full cost on both lines, the totals would be overstated; this app adds lines as filed and cannot check the split without the filing images.</li>
      <li>The compiled data leaves out spending on third-party and independent candidates, so the Montana race (Seth Bodnar) is marked incomplete.</li>
      <li>Primary-election spending is not included.</li>
    </ul>
    <h2>Combined view</h2>
    <p>A "campaign funds + outside spending" figure appears only where both parts cover the same dates: campaign funds raised through the campaign's latest report, plus outside spending for the candidate dated on or before that day. Outside spending after that date is shown separately, as is spending against the candidate. Nothing is counted twice: PAC and party contributions are already inside campaign funds, independent expenditures never pass through the campaign, and earmarked donations routed through PACs are recorded by the FEC as individual contributions.</p>
    <h2>Super PAC share</h2>
    <p>Withdrawn for now. The earlier figure divided super PAC spending through Sept. 30 by campaign receipts through mid-2026, two different periods, and most general-election spending came after June. The planned replacement is <b>super PAC spending for the candidate ÷ (campaign funds raised + all outside spending for the candidate)</b>, with both parts covering January 1, 2025 to September 30, 2026, computed once third-quarter campaign reports are filed (due October 15). It will be labeled as general-election only, and it will not be shown for three-way races or races marked incomplete. The earlier Low/Moderate/High bands are dropped because they were never validated.</p>
    <h2>Money routed through PACs on donors' behalf</h2>
    <p>Some groups bundle their members' donations: individuals give through the group's PAC, which forwards each contribution to the candidate as an "earmarked" contribution. The FEC treats this as individual money, so it is invisible in a PAC breakdown even when a group directed it. Totals are shown only where they could be verified: for Sen. Booker, $707,803 routed through AIPAC's PAC from January to September 2025, as tallied from FEC filings by Sludge. For Sen. Collins, AIPAC PAC's August 2026 report shows earmarked contributions forwarded to her campaign, but the total is not yet tallied. Elsewhere the figure is "not measured", which is not a finding that none was received.</p>
    <h2>Voting ideology (liberal–conservative %)</h2>
    <p>Ideology uses Voteview's DW-NOMINATE first-dimension score, estimated from every roll call a member has cast (−1 most liberal, +1 most conservative), taken from the Open Chambers mirror of Voteview data (built September 30, 2026) and spot-checked against Voteview. The percentile compares each member with the other current members of the same chamber who have at least 100 scored votes (${DATA.pools.S.length} senators, ${DATA.pools.H.length} representatives). Party unity is the share of party-line votes cast with the party majority in the 119th Congress. No published state-legislature score is comparable, so state legislators show their record instead.</p>
    <h2>Records for candidates who are not in Congress</h2>
    <p>Each candidate's record comes from the office they actually held, in clearly labeled sections: <b>congressional record</b> (U.S. roll-call votes and sponsored bills), <b>state legislative record</b> (seats held, recorded votes, bills authored or sponsored, leadership posts), <b>record in executive office</b> (major official acts with outcomes) and, for candidates who never held office, <b>other documented record</b> (public actions and platform commitments). A state legislative vote is shown only where a source shows that person's own vote; no vote is inferred. Many state journals from before about 2010 are not online, so several people's state records are short or empty, and each section says what was searched. Each state item notes why it is filed under its policy area. Comparisons flag when candidates' records are different kinds of evidence, because a congressional vote record, a state record and a list of executive actions are not directly comparable.</p>
    <h2>Legislative record</h2>
    <p>Senate: ${sv} roll calls from the 117th–119th Congresses, read from the Senate's official vote records. House: ${hv} roll calls from 2021–2026, positions read from the House Clerk's records (via the Open Chambers mirror for 2025–26, verified against the Clerk for sampled votes). These key votes were selected by this app to cover major issues of the period; each opens to the measure's official title, a cited summary, the recorded question and result, and the reason it is or is not used for voter alignment.</p>
    <h2>Statements vs. actions</h2>
    <p>Each check pairs a dated, sourced statement with a dated, sourced action. <b>Consistent</b>: the action matches the statement. <b>Direct contradiction</b>: the documented record directly conflicts with what was said (for example, a claim of an amount that the official record shows was not reached). <b>Partly consistent</b>: the record clearly matches one part of a statement and clearly conflicts with another. <b>Ambiguous or incomplete evidence</b>: statement and action point in different directions, but whether they conflict depends on interpretation (different bills, different stated reasons) or the record is incomplete (for example, absences). <b>Changed position</b>: an acknowledged or evident reversal. <b>Outcome check</b>: the action matched the reasoning at the time, but later developments bear on it. Labels describe the pairing, not the merits of the policy. Checks were chosen for being consequential and verifiable, not as a representative sample of everything a candidate has said.</p>
    <h2>Ethics and compliance</h2>
    <p>Entries cover findings by ethics bodies, enforcement actions, reported STOCK Act late disclosures, complaints and referrals (with their documented outcome), and investigations that ended without charges. Partisan outlets are not used as the sole source. "None found" means the listed searches turned up nothing, not that nothing exists.</p>
    <h2>Voter alignment</h2>
    <p><b>Issues.</b> ${ISS.length} issues, each with two sides written neutrally: ${ISS.map(i=>esc(i.label)).join('; ')}. The list is limited to issues on which candidates' records could be documented; it leaves out many topics voters care about.</p>
    <p><b>Evidence.</b> (1) Key congressional votes: each is assigned to an issue only when the measure's documented content makes the direction clear, with the reason shown on the vote ("Bill details"). Nominations, stopgap spending bills, bundled packages and lopsided votes are not used; each shows why. When a member voted more than once on the same bill, only the final vote counts. (2) State legislative votes, sponsored bills, official actions and statements from each profile, coded only when the item's own words make the side clear; each coded item shows the reason. Coding was proposed item by item, then reviewed; two items coded from a bill title alone were removed. No vote is inferred, and absences are never counted.</p>
    <p><b>Score.</b> For each issue you choose, the candidate's agreement is the share of their recorded actions (votes, bills, official actions) that match your side. Stated positions are used only for an issue with no recorded action, and are labeled. The overall figure is the importance-weighted average across your issues that have evidence: Σ (importance × agreement) ÷ Σ importance of covered issues. Issues without evidence are left out, not scored as zero. A figure is shown only when evidence covers at least three of your issues (or all of them, if you chose fewer than three) and at least half of your total importance; otherwise the result is "Insufficient data". The figure compares a record with your choices; it is not a rating of the candidate, and candidates with more votes on record have more chances to differ from you.</p>
    <p><b>Your choices</b> are stored only in your browser. The example starting points are labeled by their content, and every choice can be changed.</p>
    <h2>Money and votes side by side</h2>
    <p>For each issue, the Legislative record tab lists the candidate's recorded actions next to groups linked to that issue by one of three documented routes: the group's documented orientation or description (for example, a gun-rights or environmental group); its own name; or the industry sector this app assigned to a PAC (for example, oil and gas for climate and energy), with the reason shown. Amounts are PAC contributions to the campaign in the itemized reports and outside spending for or against the candidate, with dates. This is an association to explore, not evidence that money influenced a vote; groups often support candidates who already agree with them.</p>
    <h2>Funders' own positions vs. votes</h2>
    <p>For organizations that gave to a campaign or spent on a race and that publish congressional scorecards or "key vote" letters, the app records which way the organization wanted each of the key votes to go, from the organization's own scorecard or letter (or, as a second choice, a news report quoting it), and shows the candidate's recorded vote beside it. A position is recorded only for the same roll call (or, for a public letter, the same bill at the same stage); nothing is inferred from an organization's general mission. Two positions were left out because the exact roll call could not be confirmed from a page that was read (AFL-CIO on the March 2025 stopgap bill; NFIB on the Senate's 2025 budget-bill vote). Organizations researched: ${GP.map(g=>esc(g.org)+' ('+g.nPositions+' positions'+(g.status==='pending'?', research in progress':'')+')').join('; ')}. Groups are matched to money by the names of the committees they control. Party-aligned super PACs, which make most of the outside spending in these races, were not researched for bill positions. Agreement with a funder's positions is not evidence that money influenced a vote.</p>
    <h2>Glossary</h2>
    <dl class="kvd">
      <dt>Campaign funds raised</dt><dd>${esc(GLOSS.receipts)}</dd>
      <dt>Independent expenditure</dt><dd>${esc(GLOSS.ie)}</dd>
      <dt>Outside spending</dt><dd>All independent expenditures by super PACs, other outside groups and party committees. "For" a candidate = supporting them or opposing their opponent.</dd>
      <dt>Super PAC</dt><dd>${esc(GLOSS.superpac)}</dd>
      <dt>PAC contribution</dt><dd>${esc(GLOSS.pac)}</dd>
      <dt>Joint fundraising transfer</dt><dd>${esc(GLOSS.transfers)}</dd>
      <dt>Earmarked contribution</dt><dd>${esc(GLOSS.earmarked)}</dd>
      <dt>Roll call</dt><dd>A recorded vote in which each member's position is listed by name in the official record.</dd>
      <dt>Cloture</dt><dd>A Senate vote to end debate, usually needing 60 votes; a vote for cloture is a vote to move a measure forward.</dd>
      <dt>DW-NOMINATE</dt><dd>A political-science score of where a member of Congress sits on a left–right scale, estimated from all their roll-call votes.</dd>
      <dt>Insufficient data</dt><dd>Shown instead of an alignment figure when the documented evidence covers too few of your chosen issues.</dd>
    </dl>
    <h2>Automatic refresh checks</h2><p>The update service checks source identifiers, required fields, amounts, pagination, and vote identities before publishing. It retains the previous published records when an update fails. Reviewed research remains the imported snapshot and is not automatically fact-checked or reclassified. See the Updates page for retrieval history and coverage.</p>
    <h2>Known gaps</h2>
    <ul class="list">
      <li>Campaign funds run through each campaign's latest report (mostly June 30, 2026); outside spending runs through ${fmtDate(IE.asof)}.</li>
      <li>Troy Jackson (D-ME) has not filed a financial report yet.</li>
      <li>Two of Sen. Collins' reports (Year-End 2025 and Pre-Primary 2026) could not be retrieved, so her PAC rows are incomplete. Several other candidates' rows are a few short of their reports' totals; each profile shows its coverage.</li>
      <li>One of Sen. Marshall's reports (April 2025) transcribed to $5,000 more than the report's subtotal; it is flagged on his profile.</li>
      <li>Earmarked (conduit) totals are measured only for Sen. Booker.</li>
      <li>Fourteen of the 22 House toss-ups are shown with funding only; their candidates have no record, statement or ethics research yet.</li>
      <li>The alignment issue list covers ${ISS.length} issues that could be documented; candidates whose records are mostly on other topics (for example, Texas education bills) have little coded evidence, and several candidates without a voting record show "Insufficient data".</li>
      <li>Some 2026 primary percentages could not be confirmed against certified results and were removed from status lines.</li>
      <li>State legislative records are thin where old journals are offline: none could be sourced for Chris Pappas or Juliana Stratton, and only a leadership post for Mary Peltola and Mariannette Miller-Meeks.</li>
      <li>Outside spending on independent candidates Dan Osborn (Nebraska) and Seth Bodnar (Montana) is missing from the compiled data, so those races are marked incomplete.</li>
      <li>Voteview's page for Sherrod Brown did not show his numeric ideology score, so none is displayed.</li>
    </ul>
    <h2>Independence</h2>
    <p>Built from public records with no affiliation to any campaign, party or PAC. Nothing here is a voting recommendation.</p>
  </section>`;
}

// ---------- tooltips ----------
function bindTips(root){
  root.querySelectorAll('[data-tip]').forEach(el=>{
    el.addEventListener('mouseenter',()=>{tip.textContent=el.dataset.tip;tip.classList.add('show');});
    el.addEventListener('mousemove',e=>{const x=Math.min(e.clientX+12,window.innerWidth-270);tip.style.left=x+'px';tip.style.top=(e.clientY+14)+'px';});
    el.addEventListener('mouseleave',()=>tip.classList.remove('show'));
    el.setAttribute('tabindex','0');el.setAttribute('aria-label',el.dataset.tip);
    el.addEventListener('focus',()=>{const r=el.getBoundingClientRect();tip.textContent=el.dataset.tip;tip.style.left=r.left+'px';tip.style.top=(r.bottom+6)+'px';tip.classList.add('show')});
    el.addEventListener('blur',()=>tip.classList.remove('show'));
  });
}
route();
})();
