// Money from individual donors, split by the size of each gift, from the FEC's own size groups (its "by size" totals
// for the campaign committee, schedules/schedule_a/by_size). Shared by the refresh (src/feeds.mjs), which builds the
// breakdown, and the pages, which draw it. Shown only; no grade or index uses it.

// The FEC's five size groups, by each contribution's amount (not a donor's total).
export const SIZE_BRACKETS=[
  {size:0,label:'$200 and under',short:'Small'},
  {size:200,label:'$200.01 – $499.99',short:'Medium'},
  {size:500,label:'$500 – $999.99',short:'Large'},
  {size:1000,label:'$1,000 – $1,999.99',short:'Extra large'},
  {size:2000,label:'$2,000 and over',short:'Largest'}];
const num=v=>v==null||v===''||!Number.isFinite(Number(v))?null:Number(v);
const cents=n=>Math.round(n*100)/100;

// bySize: the FEC's rows for the committee and cycle ({size, total, count}). totals: the committee's totals for the same
// cycle (individual_itemized_contributions, individual_unitemized_contributions, coverage dates).
// The FEC's "$200 and under" group can already hold the gifts reported only as a total (unitemized); if its five groups
// add up closer to itemized + unitemized than to itemized alone, the unitemized gifts are taken as included rather than
// added a second time. Itemized gifts the FEC hasn't sorted by size yet (a newly filed report) are shown on their own.
export function donorSizes(bySize,totals={}){
  const by=new Map();
  for(const r of bySize||[]){
    const k=Number(r.size);if(!SIZE_BRACKETS.some(b=>b.size===k))continue;
    const o=by.get(k)||{total:0,count:0};o.total+=num(r.total)||0;o.count+=num(r.count)||0;by.set(k,o);
  }
  const sorted=SIZE_BRACKETS.reduce((t,b)=>t+(by.get(b.size)?.total||0),0);
  const itemized=num(totals.individual_itemized_contributions),unitemized=num(totals.individual_unitemized_contributions);
  const included=itemized!=null&&unitemized!=null&&unitemized>0&&Math.abs(sorted-(itemized+unitemized))<Math.abs(sorted-itemized);
  const addUnitemized=!included&&unitemized!=null?unitemized:0;
  const expected=itemized==null?null:itemized+(included?unitemized:0);
  const notSorted=expected==null?0:Math.max(0,cents(expected-sorted));
  const brackets=SIZE_BRACKETS.map(b=>{const o=by.get(b.size)||{total:0,count:0};
    return {...b,total:cents(o.total+(b.size===0?addUnitemized:0)),count:o.count,unitemized:b.size===0&&unitemized!=null?unitemized:null};});
  const total=cents(brackets.reduce((t,b)=>t+b.total,0)+notSorted);
  return {brackets,notSorted,total,unitemized,unitemizedIncluded:included,itemized,
    start:totals.coverage_start_date?String(totals.coverage_start_date).slice(0,10):null,end:totals.coverage_end_date?String(totals.coverage_end_date).slice(0,10):null};
}

// The share of the individual-donor total, as a whole percentage ('<1%' for a sliver).
export const sizeShare=(v,total)=>{if(!(total>0))return '0%';const p=v/total*100;return v>0&&p<0.5?'<1%':Math.round(p)+'%';};
// The parts to draw, in size order, with the not-yet-sorted remainder last; empty parts are left out.
export const sizeParts=x=>[...x.brackets.map((b,i)=>({key:'sz'+(i+1),label:b.label,short:b.short,total:b.total,count:b.count})),
  ...(x.notSorted>0?[{key:'szn',label:'Not sorted by size yet',short:'Not sorted yet',total:x.notSorted,count:null}]:[])].filter(p=>p.total>0);
