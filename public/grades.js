// The four A-F grades on the home page cards. Shared by the page, the monthly scoring script and the tests; the
// Methodology page and Scores/00_POLITICAL_SCORECARD_METHODOLOGY.md state the same rules.
// A grade is shown only with enough evidence; otherwise the card says "Not graded", never a zero.
// Values the methodology still lists under "Open decisions" are marked (placeholder).
export const MIN_CHECKS=3, MIN_MATCH_ISSUES=3, MIN_PVP_ACTIONS=3;
// Ethics (placeholders): a case's status points (ETHICS_COST) times its kind (CASE_KIND), halved when its latest status
// change is more than 10 years old (CASE_AGE); open cases always count in full. The trading indexes each cost a tenth of
// their value (INDEX_COST), so trading can cost at most 20 points. Trade reports are due 45 days after a trade (STOCK Act).
export const ETHICS_COST={finding:20,open:15,closed:5,allegation:0};
export const CASE_KIND={criminal:1.5,ethics:1,technical:0.5};
export const CASE_AGE={years:10,factor:0.5};
export const INDEX_COST=0.1, LATE_DAYS=45;
// Insider Trading Index parts and limits: the weights, the fewest reviewed trades for a score, the single-stock trades a
// year that count as 100, and how close to a related vote a trade is flagged (days).
export const INSIDER={weights:{conflicts:0.4,nearVotes:0.25,donors:0.2,activity:0.15},minTrades:5,activityCeiling:50,nearDays:30};
// Stock Disclosure Dodger Index parts and the fewest required filings (trade reports and annual disclosures) for a score.
export const DODGER={weights:{trades:0.7,annual:0.3},minFilings:3};
// Rule 1: actions count more than words. A statement counts only on an issue with no recorded action.
export const WEIGHT={action:1,statement:0.5};
export const ACTION_TYPES=new Set(['senate_vote','house_vote','vote','state_vote','sponsored','cosponsored','official_act']);

export function letter(pct){return pct>=90?'A':pct>=80?'B':pct>=70?'C':pct>=60?'D':'F';}

// One ID per bill, so a vote and a sponsorship on the same bill can be matched: "H.R. 1319 (117th Congress)" -> "117-hr-1319".
// Amendments (SAMDT, HAMDT) are keyed like bills ("117-samdt-1858"), so a vote on one is scored on its own, not as the bill.
const BILL_TYPES=new Set(['HR','S','HJRES','SJRES','HCONRES','SCONRES','HRES','SRES','SAMDT','HAMDT']);
export function billKey(congress,measure){
  const m=String(measure||'').toUpperCase().replace(/[.\s]/g,'').match(/^([A-Z]+)(\d+)$/);
  if(!m||!BILL_TYPES.has(m[1])||!(+congress>0))return null;
  return `${+congress}-${m[1].toLowerCase()}-${+m[2]}`;
}
export function billKeyFromText(text){
  const m=String(text||'').match(/^((?:H|S)\.?\s?(?:J\.?\s?Res|Con\.?\s?Res|Res|R|Amdt)?\.?)\s*(\d+)\s*\((\d+)(?:st|nd|rd|th) Congress\)/i);
  return m?billKey(m[3],m[1]+m[2]):null;
}
const isVote=t=>/vote$/.test(t||'')||t==='vote';
// Sponsoring a bill and then voting on it counts once; if both exist, the vote is the one counted ("the vote wins").
export function oneCreditPerBill(items){
  const out=[], at=new Map();
  for(const e of items){
    const key=e.credit||e.bill;if(!key){out.push(e);continue;}
    if(!at.has(key)){at.set(key,out.length);out.push(e);continue;}
    const i=at.get(key);if(creditRank(e)>creditRank(out[i]))out[i]=e;
  }
  return out;
}
// Which action wins when one person has several on the same bill: a vote, then a sponsorship, cosponsorship, signature
// or order, then a public statement.
const creditRank=e=>isVote(e.kind||e.type)?2:(e.kind||e.type)==='statement'?0:1;

// Your match: per issue, the share of the record that matches the visitor's side, weighted by the importance they gave it.
// choices: [{id, side, w}]; evidence: {issueId: [{type, side, bill?}]}. Issues with no evidence are left out; an issue
// backed only by statements counts at half its importance. A grade needs evidence on 3 issues and half the importance.
export function matchScore(choices,evidence){
  let totW=0,covW=0,effW=0,num=0,nCov=0;const rows=[];
  for(const c of choices){
    totW+=c.w;
    const ev=(evidence||{})[c.id]||[], rec=oneCreditPerBill(ev.filter(e=>ACTION_TYPES.has(e.type))), st=ev.filter(e=>e.type==='stated');
    const basis=rec.length?rec:st;
    if(!basis.length){rows.push({id:c.id,status:'none',rec,st});continue;}
    const match=basis.filter(e=>e.side===c.side).length, agree=match/basis.length, iw=rec.length?c.w:c.w*WEIGHT.statement;
    covW+=c.w;effW+=iw;num+=iw*agree;nCov++;
    rows.push({id:c.id,status:rec.length?'record':'stated',match,n:basis.length,agree,iw,rec,st,stMatch:st.filter(e=>e.side===c.side).length});
  }
  const need=Math.min(MIN_MATCH_ISSUES,choices.length), enough=choices.length>0&&nCov>=need&&totW>0&&covW/totW>=0.5;
  return {score:enough?Math.round(num/effW*100):null,covW,totW,effW,nCov,nChosen:choices.length,need,rows,num};
}

// Promises delivered: each counted check is 1 if the record supports it, 1/2 if partly supported or the position changed,
// 0 if contradicted (including a promise left unacted at the end of the term, recorded as a contradiction with `unacted`).
// Left out: ambiguous and outcome checks, promises with no related bill yet ("pending"), and vague goals (`vague: true`).
const COUNTED=new Set(['consistent','partial','changed','contradiction']);
// trackers: published promise-tracker tallies (PolitiFact's Trump-O-Meter and MAGA-Meter, for a president), counted like
// checked statements: Promise Kept 1, Compromise ½, Promise Broken 0. Stalled and In the Works wait, like a promise with
// no related bill yet. [{counts:{kept, compromise, broken, stalled, inTheWorks}}]
export function promiseScore(statements,trackers){
  const list=(statements||[]).filter(x=>!x.vague), c={};
  for(const x of list)c[x.assessment]=(c[x.assessment]||0)+1;
  let kept=c.consistent||0, half=(c.partial||0)+(c.changed||0), broken=c.contradiction||0, waiting=0, rated=0;
  for(const t of trackers||[]){const n=t.counts||{};kept+=n.kept||0;half+=n.compromise||0;broken+=n.broken||0;
    const w=(n.stalled||0)+(n.inTheWorks||0);waiting+=w;rated+=(n.kept||0)+(n.compromise||0)+(n.broken||0)+w;}
  const clear=kept+half+broken;
  return {pct:clear>=MIN_CHECKS?Math.round((kept+half/2)/clear*100):null,kept,half,broken,clear,total:list.length+rated,
    notCounted:list.filter(x=>!COUNTED.has(x.assessment)).length+waiting,vague:(statements||[]).length-list.length,
    unacted:list.filter(x=>x.assessment==='contradiction'&&x.unacted).length,promises:list.filter(x=>x.promise).length+rated};
}

// Stock trading: which reviewed trades were disclosed late (or not at all) and which were individual stocks in a sector
// the member's committees oversee. trades: [{traded, filed, sector, asset}]; overseen: sector names.
const DAY=86400000;
export function tradeChecks(trades,overseen){
  const sectors=new Set(overseen||[]);let late=0,conflict=0;
  const rows=(trades||[]).map(t=>{
    const days=t.filed&&t.traded?Math.round((Date.parse(t.filed)-Date.parse(t.traded))/DAY):null;
    const isLate=!!t.missing||(days!=null&&days>LATE_DAYS);
    const isConflict=(t.asset||'stock')==='stock'&&!!t.sector&&sectors.has(t.sector);
    if(isLate)late++;if(isConflict)conflict++;
    return Object.assign({},t,{days,late:isLate,conflict:isConflict});
  });
  return {rows,late,conflict};
}

// Each index is 0-100, higher meaning more of what its name says, or null with the reason when there isn't enough data.
const pct=(n,d)=>d?n/d*100:0;
const ceiling=(v,max)=>Math.min(100,v/max*100);
// The middle of a disclosed amount range: "$1,001 - $15,000" -> 8000.5. A single amount is itself; unreadable is null.
export function amountMid(text){
  const n=String(text||'').replace(/,/g,'').match(/\$?\s*(\d+(?:\.\d+)?)(?:\s*[-–]\s*\$?\s*(\d+(?:\.\d+)?))?/);
  return n?(Number(n[1])+Number(n[2]??n[1]))/2:null;
}
const caseStatus=e=>e.outcome==='None found'?null:e.status==='finding'?'finding':e.status==='investigation'?(e.stage==='open'?'open':'closed'):e.status==='allegation'?'allegation':null;

// Legal Trouble Index: each case's status points × its kind × its age, totaled, with a ceiling of 100. It keeps its exact
// value (a case can be worth 22.5 or 3.75), and only the Ethics grade is rounded, so the shown math adds up. Each case counts
// once, at its current status; "None found" checks are ignored. asOfYear is the year of the reviewed research.
// stockActCovered: when the person's trades are reviewed, a STOCK Act late-disclosure case counts in the Stock
// Disclosure Dodger Index instead, so the same late report never costs twice.
export function legalTrouble(ethics,{asOfYear=null,stockActCovered=false}={}){
  const rows=[],n={finding:0,open:0,closed:0,allegation:0};
  (ethics||[]).forEach((e,i)=>{
    const status=caseStatus(e);if(!status)return;
    n[status]++;
    const kind=CASE_KIND[e.kind]?e.kind:'ethics';
    const old=status!=='open'&&!!asOfYear&&e.decided!=null&&e.decided<asOfYear-CASE_AGE.years;
    const covered=stockActCovered&&e.type==='STOCK Act';
    const points=covered?0:ETHICS_COST[status]*CASE_KIND[kind]*(old?CASE_AGE.factor:1);
    rows.push({i,status,kind,old,covered,points});
  });
  const total=rows.reduce((t,r)=>t+r.points,0);
  return Object.assign({index:Math.min(100,Math.round(total*100)/100),total,rows},n);
}

// Insider Trading Index, from reviewed trades (tradeChecks rows). covered: false when the disclosures don't cover the
// person (not in Congress), with why saying so. inDonors: how many of the trades were in a donor's company. Late reports are left to the
// Stock Disclosure Dodger Index.
export function insiderTrading(rows,{covered=true,inDonors=0,why='No trading data'}={}){
  rows=rows||[];
  if(!covered)return {index:null,why,n:0,parts:null};
  if(!rows.length)return {index:0,why:'No trades',n:0,parts:null};
  const single=rows.filter(r=>(r.asset||'stock')==='stock');
  // Dollar values are the middle of each disclosed range; if any is missing, each trade counts once instead.
  const dollars=single.map(r=>amountMid(r.amount)),byDollar=dollars.every(v=>v!=null);
  const conflictShare=byDollar?pct(single.reduce((t,r,i)=>t+(r.conflict?dollars[i]:0),0),dollars.reduce((t,v)=>t+v,0)):pct(single.filter(r=>r.conflict).length,single.length);
  const dates=rows.map(r=>Date.parse(r.traded)).filter(Number.isFinite),years=Math.max(1,dates.length?(Math.max(...dates)-Math.min(...dates))/(365.25*DAY):1);
  const parts={conflicts:conflictShare,nearVotes:pct(rows.filter(r=>r.flag||r.nearVote).length,rows.length),donors:pct(Math.min(inDonors,rows.length),rows.length),activity:ceiling(single.length/years,INSIDER.activityCeiling)};
  const W=INSIDER.weights,index=Math.round(Object.keys(W).reduce((t,k)=>t+W[k]*parts[k],0));
  if(rows.length<INSIDER.minTrades)return {index:null,why:'Not enough data',n:rows.length,parts};
  return {index,why:null,n:rows.length,single:single.length,byDollar,parts};
}

// Stock Disclosure Dodger Index: late or missing trade reports (required), and annual financial disclosures filed after
// their due date. annual: [{year, due, filed}] from the reviewed research; when there are none the trade part counts alone.
export function disclosureDodger(rows,annual=[],{covered=true,why='No trading data'}={}){
  rows=rows||[];annual=annual||[];
  if(!covered)return {index:null,why,n:0,parts:null};
  const lateAnnual=annual.filter(a=>!a.filed||(a.due&&a.filed>a.due)).length;
  const parts={trades:rows.length?pct(rows.filter(r=>r.late).length,rows.length):null,annual:annual.length?pct(lateAnnual,annual.length):null};
  if(parts.trades==null)return {index:null,why:'No trades',n:annual.length,parts};
  if(rows.length+annual.length<DODGER.minFilings)return {index:null,why:'Not enough data',n:rows.length+annual.length,parts};
  const W=DODGER.weights,use=Object.keys(W).filter(k=>parts[k]!=null),w=use.reduce((t,k)=>t+W[k],0);
  return {index:Math.round(use.reduce((t,k)=>t+W[k]*parts[k],0)/w),why:null,n:rows.length+annual.length,late:rows.filter(r=>r.late).length,lateAnnual,parts};
}

// Blind trusts and divestment (step 8), from the reviewed research: holdings {status, since, src, note}.
//   'blind-trust'  a qualified blind trust, certified by the House or Senate ethics committee. The trustee decides and
//                  doesn't tell them, so a trade made inside it (a reviewed trade marked inTrust) isn't theirs and counts in
//                  neither trading index. Trades they report outside it, or made before it, count as usual.
//   'no-stocks'    no individual stocks or stock options: only funds, bonds, cash, retirement plans, real estate or a
//                  private business. It labels the index; earlier stock trades still count.
// Not excused: a managed or "discretionary" account, an adviser who trades without asking, or a trust that isn't a
// qualified blind trust. The member still controls it and must report it, so those trades count in full. No bonus either
// way: the Ethics grade starts at 100 and only loses points.
export const HOLDINGS={'blind-trust':'Holdings in a qualified blind trust','no-stocks':'No individual stocks'};
export function ownTrades(rows,holdings){return holdings?.status==='blind-trust'?(rows||[]).filter(r=>!r.inTrust):(rows||[]);}

// Ethics: 100 − Legal Trouble Index − a tenth of the Insider Trading Index − a tenth of the Stock Disclosure Dodger Index,
// rounded, never below 0. An index without enough data costs nothing. trading: {rows, covered, why, inDonors, annual,
// holdings}.
export function ethicsScore(ethics,trading={},{asOfYear=null}={}){
  const all=trading.rows||[],covered=trading.covered!==false,held=HOLDINGS[trading.holdings?.status]?trading.holdings:null;
  const rows=ownTrades(all,held),inTrust=all.length-rows.length;
  const legal=legalTrouble(ethics,{asOfYear,stockActCovered:covered&&rows.length>0});
  const insider=insiderTrading(rows,{covered,inDonors:Math.min(trading.inDonors||0,rows.length),why:trading.why});
  if(covered&&held&&!rows.length)insider.why=HOLDINGS[held.status];
  const dodger=disclosureDodger(rows,trading.annual,{covered,why:trading.why});
  const insiderCost=(insider.index||0)*INDEX_COST, dodgerCost=(dodger.index||0)*INDEX_COST;
  const raw=100-legal.index-insiderCost-dodgerCost;
  return {pct:Math.max(0,Math.round(raw)),raw,legal,insider,dodger,insiderCost,dodgerCost,holdings:held,inTrust,
    finding:legal.finding,open:legal.open,closed:legal.closed,allegation:legal.allegation,
    late:rows.filter(r=>r.late).length,conflict:rows.filter(r=>r.conflict).length};
}

// ---------- Corporation Compromised Index 🏢 (step 9) ----------
// How much of their campaign money comes from businesses' PACs, and how much more often they side with business funders
// than their own party does. 0-100, higher meaning more. Four parts; a part without data drops out and the others are
// reweighted, but the PAC share is required (no campaign money on file: no index).
//   pacShare (35%)       business PACs' money ÷ campaign funds raised; 20% scores 100. A business PAC is one the FEC
//                        records as sponsored by a corporation, a trade association or a cooperative (public/pac-types.js);
//                        one not matched to its FEC record counts by the sector this app assigns from its name.
//   employees (10%)      giving by employees of the companies among their top 20 donor organizations ÷ campaign funds
//                        raised; 10% scores 100. Not in the reviewed research yet, so it drops out.
//   businessVotes (35%)  on votes where a business funder that gave to the campaign took a public side, how much more often
//                        they voted its way than their party did (Donor Loyalty's method, PAC and bundled money only); 25
//                        points above the party scores 100. Needs 5 compared votes.
//   lobbiedBills (20%)   of the Workers > Profit bills a top donor organization lobbied on, the share where they took the
//                        Profit side; needs 3. Not in the reviewed research yet, so it drops out.
// Outside spending is left out: candidates can't control it.
// In the Workers > Profit grade: 75% the bills + 25% (100 − this index), once both exist.
export const CORP_COMPROMISED={weights:{pacShare:0.35,employees:0.10,businessVotes:0.35,lobbiedBills:0.20},pacCeiling:20,employeeCeiling:10,voteCeiling:25,minLobbied:3,inGrade:0.25};
// businessPac and receipts: dollars over the same period; employees: dollars or null; businessVotes: Donor Loyalty's
// result for the business funders ({index, diff, n}); lobbied: {profit, n} or null.
export function corporationCompromised({businessPac=null,receipts=null,employees=null,businessVotes=null,lobbied=null}={}){
  const C=CORP_COMPROMISED,parts={pacShare:null,employees:null,businessVotes:null,lobbiedBills:null};
  const share=businessPac!=null&&receipts>0?businessPac/receipts*100:null;
  if(share!=null)parts.pacShare=ceiling(share,C.pacCeiling);
  if(employees!=null&&receipts>0)parts.employees=ceiling(employees/receipts*100,C.employeeCeiling);
  if(businessVotes?.index!=null)parts.businessVotes=businessVotes.index;
  if(lobbied&&lobbied.n>=C.minLobbied)parts.lobbiedBills=pct(lobbied.profit,lobbied.n);
  if(parts.pacShare==null)return {index:null,why:'No campaign money on file',parts,used:[],share:null};
  const used=Object.keys(C.weights).filter(k=>parts[k]!=null),w=used.reduce((t,k)=>t+C.weights[k],0);
  const raw=used.reduce((t,k)=>t+C.weights[k]*parts[k],0)/w;
  return {index:Math.round(raw),raw,why:null,parts,used,weights:Object.fromEntries(used.map(k=>[k,C.weights[k]/w])),share:Math.round(share*100)/100};
}
// The Workers > Profit grade: the bills' score (pvpScore) blended with the index when both exist; otherwise the bills
// alone (an index without data costs nothing, as on Ethics). billsPct keeps the bills' own score.
export function workersOverProfit(v,cci){
  const C=CORP_COMPROMISED,bills=v?.pct??null,on=bills!=null&&cci?.index!=null;
  const raw=on?(1-C.inGrade)*bills+C.inGrade*(100-cci.index):bills;
  return Object.assign({},v,{billsPct:bills,cci:cci||null,blended:on,raw,pct:raw==null?null:Math.round(raw)});
}

// ---------- Workers > Profit bill scores ----------
// Each bill is scored from −100 (fully corporate-backed) to +100 (fully worker-backed), from two equal parts:
//   Who gains (50%): a cited nonpartisan analysis (CBO, JCT, the Tax Policy Center or the Penn Wharton Budget Model),
//     placed on one of five steps by a fixed rule. Two kinds count: money (who comes out ahead, GAINS_STEPS) and access
//     to a basic need (ACCESS_STEPS: health coverage, public schools, child care, food assistance, housing, or services
//     like clean water and low-income broadband). With both, their average is used. Access doesn't count for bills
//     that fund the whole government, or for public money that mainly goes to companies (that's the money side).
//   Who took a side (50%): each worker group that supports the bill counts +100 and each that opposes it −100; business
//     groups count the other way (a business group opposing a bill counts toward workers). Each side's groups are averaged,
//     then the two sides are averaged, so a side with more groups on file doesn't outweigh the other. When both sides
//     support a bill it lands near 0.
// Both parts present: their average, unless they point opposite ways; then the bill is "Disputed", shown but not scored.
// One part only: that part decides. A bill marked from groups' positions alone needs a worker group and a business group
// on opposite sides. Lobbying reports and the White House's position are shown with the bill but never scored: a
// lobbying report doesn't say which side the client was on, and the White House follows the president's party.
export const BILL_GROUPS={
  aflcio:{org:'AFL-CIO',side:'worker'},epi:{org:'Economic Policy Institute',side:'worker'},nelp:{org:'National Employment Law Project',side:'worker'},
  itep:{org:'Institute on Taxation and Economic Policy (ITEP)',side:'worker',tax:true},
  chamber:{org:'U.S. Chamber of Commerce',side:'business'},nfib:{org:'NFIB',side:'business'},nam:{org:'National Association of Manufacturers',side:'business'},
  taxfoundation:{org:'Tax Foundation',side:'business',tax:true},
  // Construction pay and prevailing-wage measures (bills marked "construction"), one from each side.
  nabtu:{org:"North America's Building Trades Unions",side:'worker',construction:true},abc:{org:'Associated Builders and Contractors',side:'business',construction:true}};
export const GAINS_STEPS={
  '100':'Lower-income households come out ahead while the top pays more',
  '50':'Tilts toward lower-income households: they gain more, or pay less, as a share of income than the top',
  '0':'About even across incomes',
  '-50':'Tilts toward the top: it gains more, as a share of income, than lower-income households',
  '-100':'Lower-income households lose while the top gains'};
export const ACCESS_STEPS={
  '100':'Clearly expands access to a basic need, mainly for lower- and middle-income households',
  '50':'Expands that access somewhat, or with tradeoffs',
  '0':'About no change in access',
  '-50':'Cuts that access somewhat, or with tradeoffs',
  '-100':'Clearly cuts access to a basic need for lower- and middle-income households'};
const SIDE_SIGN={worker:1,business:-1},STEP=x=>[100,50,0,-50,-100].includes(x?.step)?x.step:null;
export function billScore(b){
  const money=STEP(b?.gains),access=STEP(b?.access),halves=[money,access].filter(v=>v!=null);
  const gains=halves.length?halves.reduce((t,v)=>t+v,0)/halves.length:null;
  const stance=side=>{const ps=(b?.sides||[]).filter(p=>BILL_GROUPS[p.group]?.side===side&&(p.pos==='support'||p.pos==='oppose')&&(!BILL_GROUPS[p.group].tax||b.tax)&&(!BILL_GROUPS[p.group].construction||b.construction));
    return ps.length?ps.reduce((t,p)=>t+(p.pos==='support'?100:-100)*SIDE_SIGN[side],0)/ps.length:null;};
  const worker=stance('worker'),business=stance('business'),both=[worker,business].filter(v=>v!=null);
  const sides=both.length?both.reduce((t,v)=>t+v,0)/both.length:null;
  let score=null,status;
  if(gains!=null&&sides!=null){if(gains*sides<0)status='disputed';else score=Math.round((gains+sides)/2);}
  else if(gains!=null)score=gains;
  else if(sides!=null){if(worker!=null&&business!=null)score=Math.round(sides);else status='one-side';}
  else status='none';
  if(score===0)status='even';else if(score!=null)status='scored';
  // gainsPart and sidesPart: the two halves, each from −100 to +100 (null when missing); gainsPart is the average of
  // moneyPart and accessPart.
  return {score,gainsPart:gains==null?null:Math.round(gains),moneyPart:money,accessPart:access,sidesPart:sides==null?null:Math.round(sides),worker,business,status,
    side:status==='scored'?(score>0?'people':'profit'):null,weight:status==='scored'?Math.abs(score)/100:0};
}
// Why a bill isn't scored, in a few words.
export const BILL_STATUS={disputed:'Disputed: who gains and who took a side point opposite ways',even:'Even: no clear side',
  'one-side':'Needs a position from the other side, or a who-gains study',none:'No evidence on file yet'};

// Workers > Profit: actions on scored bills. actions: [{bill, kind: 'vote'|'sponsored'|'cosponsored'|'statement'|...,
// pos?, mark: 'people'|'profit', weight, credit?}]. A Yea, a sponsorship or a statement of support takes the bill's side;
// a Nay or a statement of opposition the other; missed votes count for nothing. One credit per bill, across all its
// versions (credit is the bill on file): a vote wins over a sponsorship, which wins over a statement. Each action counts
// the bill's strength (its score ÷ 100), so a Yea on a +60 bill adds 0.6 to the working-people side and a Nay adds 0.6
// to the other side. A statement counts half that (Rule 1's statement weight).
const pts2=n=>Math.round(n*100)/100;
export function pvpScore(actions){
  let people=0,profit=0,nPeople=0,nProfit=0;const scored=[];
  for(const a of oneCreditPerBill((actions||[]).filter(a=>(a.mark==='people'||a.mark==='profit')&&a.weight>0))){
    let took;
    if(a.kind==='vote'){if(a.pos!=='Yea'&&a.pos!=='Nay')continue;took=a.pos==='Yea'?a.mark:(a.mark==='people'?'profit':'people');}
    // A president's veto takes the other side of the bill, like a Nay; signing a bill or issuing an order takes its side.
    else if(a.kind==='vetoed')took=a.mark==='people'?'profit':'people';
    else if(a.kind==='statement'){if(a.pos!=='support'&&a.pos!=='oppose')continue;took=a.pos==='support'?a.mark:(a.mark==='people'?'profit':'people');}
    else took=a.mark;
    const w=a.weight*(a.kind==='statement'?WEIGHT.statement:WEIGHT.action);
    if(took==='people'){people+=w;nPeople++;}else{profit+=w;nProfit++;}
    scored.push(Object.assign({},a,{took,points:pts2(w)}));
  }
  const n=scored.length;
  return {pct:n>=MIN_PVP_ACTIONS?Math.round(people/(people+profit)*100):null,people:pts2(people),profit:pts2(profit),nPeople,nProfit,n,scored};
}
// The actions one person took on scored bills: their recorded votes, the bills they sponsored or cosponsored (or, for a
// president, signed or vetoed, and executive orders, keyed "eo-14251"), and their cited public statements on bills.
// marks: Map billKey (the bill on file and each of its versions) -> bill with its billScore ({id, side, weight, ...});
// votes: [{bill, pos}]; sponsorships: [{bill, kind, via?}]; statements: [{bill, pos: 'support'|'oppose', ref}].
export function pvpActions(marks,votes,sponsorships,statements){
  const out=[],mk=(bill,m)=>({bill,credit:m.id||bill,mark:m.side,weight:m.weight,score:m.score});
  for(const v of votes||[]){const m=v.bill&&marks.get(v.bill);if(m)out.push({...mk(v.bill,m),kind:'vote',pos:v.pos,ref:v.ref});}
  for(const sp of sponsorships||[]){const m=sp.bill&&marks.get(sp.bill);if(m)out.push({...mk(sp.bill,m),kind:sp.kind||'sponsored',ref:sp.ref,via:sp.via});}
  for(const st of statements||[]){const m=st.bill&&marks.get(st.bill);if(m)out.push({...mk(st.bill,m),kind:'statement',pos:st.pos,ref:st.ref});}
  return out;
}

// Outside money: the for-to-against ratio, always that way round. The larger side gets the number and the other is 1
// ("2.1 : 1" more for, "1 : 2.1" more against); "no opposing spending" / "no supporting spending" when one side is zero;
// null when both are. side says which way it leans ('even' when it reads 1 : 1), for coloring.
// share = for / (for + against) places the ratio on the chart's scale: 1 is all for, 0.5 is 1 : 1, 0 is all against.
export function moneyRatio(f,a){
  f=Math.max(0,+f||0);a=Math.max(0,+a||0);
  if(!f&&!a)return null;
  const n=x=>x>=9.95?String(Math.round(x)):String(Math.round(x*10)/10);
  const text=!a?'no opposing spending':!f?'no supporting spending':f>=a?`${n(f/a)} : 1`:`1 : ${n(a/f)}`;
  return {share:f/(f+a),text,side:text==='1 : 1'?'even':f>a?'for':'against',oneSided:!a||!f};
}
