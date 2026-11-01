// Executive-branch stock trades (the President, Vice President, cabinet and senior appointees), from Disclosed Capitol's
// open dataset (https://github.com/disclosedcapitol/executive-branch-trades, CC BY 4.0, no key). It is parsed from the
// officials' public OGE Form 278e (annual) and 278-T (periodic transaction) reports.
//   node scripts/build-exec-trades.mjs              download the current files
//   node scripts/build-exec-trades.mjs --dir <dir>  use a copy already downloaded (data/executive_trades.json, README.md)
// Writes public/exec-trades.json: for each profiled person in the dataset (matched by first and last name), counts by
// year, kind of asset and amount, the reports the trades came from, and the latest trades. A row repeated with the same
// date, asset, type and amount (the same trade listed on two reports) counts once, and a trade whose date doesn't fit its
// report (see MISDATED) is counted but left out of the charts and the late count. Nothing here is scored.
import fs from 'node:fs/promises';
import {pathToFileURL} from 'node:url';

const BASE='https://raw.githubusercontent.com/disclosedcapitol/executive-branch-trades/main/';
const root=new URL('../',import.meta.url);
export const DATASET='https://github.com/disclosedcapitol/executive-branch-trades';
export const CREDIT='Data: Disclosed Capitol, executive-branch-trades';
// The outer deadline for a 278-T: 45 days after the trade (30 days after being notified of it).
export const DEADLINE=45;
// A trade dated more than this many days before the periodic report that lists it doesn't fit the report: the dataset
// read some dates wrong (a bond's maturity date taken for the trade date, giving trades from 2008 on a 2026 report).
export const MISDATED=400;
const RECENT=150;

// OGE's value ranges. Anything else in the dataset (a few typed ranges such as "$500,001 - $500,000") is "Other ranges".
const RANGES=[[1001,15000],[15001,50000],[50001,100000],[100001,250000],[250001,500000],[500001,1000000],[1000001,5000000],[5000001,25000000],[25000001,50000000],[50000001,null]];
const dollars=n=>'$'+n.toLocaleString('en-US');
export const rangeLabel=([lo,hi])=>hi==null?`Over ${dollars(lo-1)}`:`${dollars(lo)} - ${dollars(hi)}`;
export function parseRange(text){
  const n=[...String(text||'').matchAll(/\$\s*([\d,]+)/g)].map(m=>Number(m[1].replace(/,/g,'')));
  if(/^\s*over\b/i.test(text)&&n.length===1)return {low:n[0]+1,high:null};
  return n.length===2&&n[0]<=n[1]?{low:n[0],high:n[1]}:null;
}
export function rangeOf(text){
  const r=parseRange(text),hit=r&&RANGES.find(([lo,hi])=>lo===r.low&&hi===r.high);
  return hit?rangeLabel(hit):'Other ranges';
}

// The dataset's ticker column holds a real ticker, an asset-class bucket for instruments without one, or N/A. A few
// values are words the parser picked up from the description ("THE", "DELAWARE"); those count as no ticker.
const BUCKETS={BOND:'bond',MUNI:'muni',TREAS:'treasury',FUND:'fund',ETF:'fund',LP:'partnership',TRUST:'partnership',OPTION:'option',CRYPTO:'other'};
const NOT_TICKERS=new Set(['N/A','THE','CASH','DELAWARE','MD','NEW','DEL','BERMUDA','REIT']);
export const KINDS={ticker:'Listed with a ticker',named:'Named, no ticker (mostly company stocks)',bond:'Corporate and other bonds',muni:'Municipal bonds',treasury:'Treasuries',fund:'Funds and ETFs',partnership:'Partnerships and trusts',option:'Options',other:'Other'};
const bondLike=/\d+(\.\d+)?\s*%.*\b(DUE|NTS?|NOTES?|BONDS?|MTN|DEB)\b|\b(DUE|NTS?|NOTES?|BONDS?|MTN|DEB)\b.*\d+(\.\d+)?\s*%/i;
export function assetKind(r){
  const t=String(r.ticker||'').trim().toUpperCase();
  if(BUCKETS[t])return BUCKETS[t];
  if(t&&!NOT_TICKERS.has(t))return 'ticker';
  return bondLike.test(r.asset_description||'')?'bond':'named';
}
const tradeType=t=>/^buy|purchase/i.test(t)?'buy':/^sell|^sale/i.test(t)?'sell':'other';
const days=(from,to)=>Math.round((Date.parse(to)-Date.parse(from))/864e5);
const key=r=>[r.transaction_date,String(r.asset_description||'').trim().toUpperCase(),tradeType(r.transaction_type),r.amount_range].join('|');
const periodic=r=>String(r.filing_type||'').split(';').includes('278-T')&&!!r.filing_date;
export const misdated=r=>periodic(r)&&days(r.transaction_date,r.filing_date)>MISDATED;
// Of the copies of one trade, keep the one tied to a report, a periodic report over an annual one, and the earliest.
const better=(a,b)=>(!!b.filing_date-!!a.filing_date)||(periodic(b)-periodic(a))||String(a.filing_date).localeCompare(String(b.filing_date));

// One official's rows (as listed in the dataset) summarized for the site.
export function summarize(rows){
  const groups=new Map();
  for(const r of rows){const k=key(r);(groups.get(k)||groups.set(k,[]).get(k)).push(r);}
  const all=[...groups.values()].map(g=>g.sort(better)[0]),trades=all.filter(t=>!misdated(t));
  const count=(list,f)=>{const m=new Map();for(const x of list){const k=f(x);m.set(k,(m.get(k)||0)+1);}return m;};
  const byYear=new Map();
  for(const t of trades){const y=t.transaction_date.slice(0,4),e=byYear.get(y)||byYear.set(y,{year:y,buy:0,sell:0,other:0}).get(y);e[tradeType(t.transaction_type)]++;}
  const order=[...RANGES.map(rangeLabel),'Other ranges'];
  const onPeriodic=trades.filter(periodic);
  let low=0,high=0,open=0;
  for(const t of trades){const r=parseRange(t.amount_range);if(!r)continue;low+=r.low;if(r.high==null)open++;else high+=r.high;}
  // The reports the rows were listed on, by date and form: how many reports (two filed the same day can't always be told
  // apart), how many rows they list, how many of those are misdated, and the dates of the rest.
  const reports=new Map();
  for(const r of rows.filter(r=>r.filing_date)){const k=r.filing_date+'|'+r.filing_type,e=reports.get(k)||reports.set(k,{filed:r.filing_date,form:r.filing_type||null,count:0,ids:new Set(),listed:0,misdated:0,from:null,to:null}).get(k);
    e.listed++;for(const id of String(r.source_filing_id||'').split(';').filter(Boolean))e.ids.add(id);
    if(misdated(r)){e.misdated++;continue;}
    if(!e.from||r.transaction_date<e.from)e.from=r.transaction_date;if(!e.to||r.transaction_date>e.to)e.to=r.transaction_date;}
  for(const e of reports.values()){e.count=Math.max(1,e.ids.size);delete e.ids;}
  const dates=trades.map(t=>t.transaction_date).sort(),filed=trades.map(t=>t.filing_date).filter(Boolean).sort();
  const types=count(trades,t=>tradeType(t.transaction_type));
  return {
    name:rows[0].filer_name,profile:rows[0].disclosedcapitol_url||null,
    rows:rows.length,trades:all.length,repeats:rows.length-all.length,misdated:all.length-trades.length,
    buys:types.get('buy')||0,sells:types.get('sell')||0,other:types.get('other')||0,
    linked:trades.filter(t=>t.filing_date).length,first:dates[0],last:dates.at(-1),lastFiled:filed.at(-1)||null,
    late:{n:onPeriodic.filter(t=>days(t.transaction_date,t.filing_date)>DEADLINE).length,of:onPeriodic.length},
    value:{low,high,open},
    byYear:[...byYear.values()].sort((a,b)=>a.year.localeCompare(b.year)),
    byKind:[...count(trades,assetKind)].map(([kind,n])=>({kind,label:KINDS[kind],n})).sort((a,b)=>b.n-a.n),
    byAmount:[...count(trades,t=>rangeOf(t.amount_range))].map(([label,n])=>({label,n})).sort((a,b)=>order.indexOf(a.label)-order.indexOf(b.label)),
    reports:[...reports.values()].sort((a,b)=>a.filed.localeCompare(b.filed)||String(a.form).localeCompare(String(b.form))),
    recent:trades.sort((a,b)=>b.transaction_date.localeCompare(a.transaction_date)||String(a.asset_description).localeCompare(String(b.asset_description))).slice(0,RECENT).map(t=>{
      const kind=assetKind(t);
      return {traded:t.transaction_date,filed:t.filing_date||null,form:t.filing_type||null,days:t.filing_date?days(t.transaction_date,t.filing_date):null,
        type:tradeType(t.transaction_type),asset:String(t.asset_description||'').trim(),ticker:kind==='ticker'?t.ticker:null,kind,amount:t.amount_range};
    }),
  };
}

// Names compared by first and last word, without accents, suffixes or initials ("Donald J. Trump" is "donald trump").
export function nameKey(name){
  const w=String(name||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/[^a-z\s-]/g,' ').split(/\s+/)
    .filter(x=>x.length>1&&!['jr','sr','ii','iii','iv'].includes(x));
  return w.length>1?`${w[0]} ${w.at(-1)}`:null;
}
// The dataset's officials who have a profile on the site: {filer name: profile id}. A name shared by two profiles is
// left out rather than guessed.
export function matchPeople(filers,profiles){
  const byKey=new Map();
  for(const p of profiles){const k=nameKey(p.name);if(k)byKey.set(k,byKey.has(k)&&byKey.get(k)!==p.id?null:p.id);}
  return Object.fromEntries([...new Set(filers)].map(f=>[f,byKey.get(nameKey(f))]).filter(([,id])=>id));
}
// The date the dataset was last refreshed, from its README's stats table.
export const refreshedFrom=readme=>String(readme||'').match(/Last refreshed\s*\|\s*(\d{4}-\d{2}-\d{2})/)?.[1]||null;

export function build(rows,profiles,{refreshed=null,built=new Date().toISOString().slice(0,10)}={}){
  const match=matchPeople(rows.map(r=>r.filer_name),profiles),people={};
  for(const [filer,id] of Object.entries(match))people[id]=summarize(rows.filter(r=>r.filer_name===filer));
  return {about:'Executive-branch stock trades for profiled people. See scripts/build-exec-trades.mjs.',
    source:DATASET,credit:CREDIT,license:'CC BY 4.0',licenseUrl:'https://creativecommons.org/licenses/by/4.0/',
    changes:'Summarized for this site: a trade listed on more than one report counts once.',
    from:'OGE Form 278e and 278-T reports',deadline:DEADLINE,refreshed,built,people};
}

async function load(from){
  if(from)return [JSON.parse(await fs.readFile(`${from}/data/executive_trades.json`,'utf8')),await fs.readFile(`${from}/README.md`,'utf8').catch(()=>'')];
  const get=async path=>{const r=await fetch(BASE+path,{signal:AbortSignal.timeout(120000)});if(!r.ok)throw new Error(`${path}: HTTP ${r.status}`);return r.text();};
  const [data,readme]=await Promise.all([get('data/executive_trades.json'),get('README.md').catch(()=>'')]);
  return [JSON.parse(data),readme];
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const arg=process.argv.indexOf('--dir'),[rows,readme]=await load(arg>0?process.argv[arg+1]:null);
  if(!Array.isArray(rows)||!rows.length||!('filer_name' in rows[0]))throw new Error('The dataset is missing or in an unexpected format');
  const research=JSON.parse(await fs.readFile(new URL('public/research.json',root),'utf8'));
  const senate=JSON.parse(await fs.readFile(new URL('public/senate.json',root),'utf8').catch(()=>'{"senators":[]}'));
  const profiles=[...research.members,...(research.cands||[]),...(research.featured||[]),...senate.senators].map(p=>({id:p.id,name:p.name}));
  const out=build(rows,profiles,{refreshed:refreshedFrom(readme)});
  await fs.writeFile(new URL('public/exec-trades.json',root),JSON.stringify(out,null,1)+'\n');
  const who=Object.entries(out.people).map(([id,p])=>`${id} (${p.trades} trades)`);
  console.log(`${rows.length} rows from ${new Set(rows.map(r=>r.filer_name)).size} officials; profiled: ${who.join(', ')||'none'}. Wrote public/exec-trades.json.`);
}
