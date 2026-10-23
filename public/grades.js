// The four A-F grades on the home page cards. Shared by the page and the tests; the Methodology page states the same rules.
// A grade is shown only with enough evidence; otherwise the card says "Not graded", never a zero.
export const MIN_CHECKS=3, MIN_PVP_VOTES=3;
export const ETHICS_COST={finding:20,open:15,closed:5,allegation:0};

export function letter(pct){return pct>=90?'A':pct>=80?'B':pct>=70?'C':pct>=60?'D':'F';}

// Promises delivered: each checked statement counts 1 if the record supports it, 1/2 if partly or changed over time, 0 if contradicted.
// Ambiguous checks and outcome checks are not counted.
export function promiseScore(statements){
  const c={};for(const x of statements||[])c[x.assessment]=(c[x.assessment]||0)+1;
  const kept=c.consistent||0, half=(c.partial||0)+(c.changed||0), broken=c.contradiction||0, clear=kept+half+broken;
  return {pct:clear>=MIN_CHECKS?Math.round((kept+half/2)/clear*100):null,kept,half,broken,clear,total:(statements||[]).length};
}

// Ethics: starts at 100; each confirmed finding, open investigation and investigation closed without a finding costs points.
// Allegations (complaints no official body acted on) are listed but cost nothing. "None found" checks are ignored.
export function ethicsScore(ethics){
  const n={finding:0,open:0,closed:0,allegation:0};
  for(const e of ethics||[]){
    if(e.outcome==='None found')continue;
    if(e.status==='finding')n.finding++;
    else if(e.status==='investigation')n[e.stage==='open'?'open':'closed']++;
    else if(e.status==='allegation')n.allegation++;
  }
  const cost=n.finding*ETHICS_COST.finding+n.open*ETHICS_COST.open+n.closed*ETHICS_COST.closed+n.allegation*ETHICS_COST.allegation;
  return Object.assign({pct:Math.max(0,100-cost)},n);
}

// People over profit: votes on bills marked by who gains, from a cited nonpartisan distributional analysis (vote.pvp = {yea:'people'|'profit', why, src}).
// A Yea takes the marked side, a Nay the other; a missed vote counts for nothing. Higher is more for working people.
export function pvpScore(votes,personId){
  let people=0,n=0;
  for(const v of votes||[]){
    if(!v.pvp)continue;
    const p=(v.pos||{})[personId];if(p!=='Yea'&&p!=='Nay')continue;
    n++;
    const took=p==='Yea'?v.pvp.yea:(v.pvp.yea==='people'?'profit':'people');
    if(took==='people')people++;
  }
  return {pct:n>=MIN_PVP_VOTES?Math.round(people/n*100):null,people,n};
}

// Outside money: the for-to-against ratio, always that way round. The larger side gets the number and the other is 1
// ("2.1 : 1" more for, "1 : 2.1" more against); "all for" / "all against" when one side is zero; null when both are.
// side says which way it leans ('even' when it reads 1 : 1), for coloring.
// share = for / (for + against) places the ratio on the chart's scale: 1 is all for, 0.5 is 1 : 1, 0 is all against.
export function moneyRatio(f,a,fw='for',aw='against'){
  f=Math.max(0,+f||0);a=Math.max(0,+a||0);
  if(!f&&!a)return null;
  const n=x=>x>=9.95?String(Math.round(x)):String(Math.round(x*10)/10);
  const text=!a?`all ${fw}`:!f?`all ${aw}`:f>=a?`${n(f/a)} : 1`:`1 : ${n(a/f)}`;
  return {share:f/(f+a),text,side:text==='1 : 1'?'even':f>a?'for':'against'};
}
