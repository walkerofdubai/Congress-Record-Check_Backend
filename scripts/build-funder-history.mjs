// Builds public/funder-history.json: month-by-month money from each researched group (research.json groupPos[].fecIds)
// to or about each profiled candidate, from the FEC bulk file "Contributions from committees to candidates &
// independent expenditures" (pas2). The page draws it on the same time axis as the group's key votes.
//
//   node scripts/build-funder-history.mjs            downloads the bulk files into .local/fec-bulk/ (about 140 MB)
//   node scripts/build-funder-history.mjs --refresh  downloads them again, for newer FEC data
//   FEC_BULK_BASE=<url> node scripts/...              use a mirror of https://www.fec.gov/files/bulk-downloads
//
// What is kept:
//   contributions  24K/24Z (direct and in-kind) to the candidate's committee, every cycle, memo lines excluded
//   for / against  24E / 24A independent expenditures naming the candidate, before 2025 only; the page uses the reviewed
//                  2025-26 outside-spending data (research.json ie.rows) for later dates, because the bulk file only holds
//                  regular reports and misses the latest 24/48-hour notices. General election and general runoffs only,
//                  as elsewhere on the site; primary spending and spending on opponents are left out.
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';

// Every cycle from 2016 (it starts in January 2015), as the refresh's history does (config.historyFrom).
export const CYCLES=[2016,2018,2020,2022,2024,2026];
export const IE_BEFORE='2025-01-01';
const BASE=process.env.FEC_BULK_BASE||'https://www.fec.gov/files/bulk-downloads';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');

// MMDDYYYY -> YYYY-MM-DD ('' if unusable)
export function isoDate(dt){
  if(!/^\d{8}$/.test(dt||''))return '';
  const m=+dt.slice(0,2), day=+dt.slice(2,4), d=`${dt.slice(4)}-${dt.slice(0,2)}-${dt.slice(2,4)}`;
  return m>=1&&m<=12&&day>=1&&day<=31&&d>='1990-01-01'&&d<='2100-01-01'?d:'';
}
// General election, or a runoff held after a general election (Nov-Feb), as for Georgia's January 2021 Senate runoffs.
export function isGeneral(pgi,date){
  const k=(pgi||'')[0];
  if(k==='G')return true;
  return k==='R'&&['11','12','01','02'].includes(date.slice(5,7));
}
// One pas2 line -> {group, person, kind:'c'|'f'|'a', date, amount} or null.
// ctx.cm2g: committee id -> group key; ctx.cand2p: candidate id -> person id; ctx.cmte2p: candidate committee id -> person id.
export function classify(line,ctx){
  const c=line.split('|');
  if(c.length<22)return null;
  const group=ctx.cm2g.get(c[0]);if(!group)return null;
  if(c[19])return null;                                   // memo line: detail of another entry, not new money
  const date=isoDate(c[13]);if(!date)return null;
  const amount=Number(c[14]);if(!Number.isFinite(amount)||amount===0)return null;
  const person=ctx.cand2p.get(c[16])||ctx.cmte2p.get(c[15]);if(!person)return null;
  const tp=c[5];
  if(tp==='24K'||tp==='24Z')return {group,person,kind:'c',date,amount};
  if(tp==='24E'||tp==='24A'){
    if(date>=IE_BEFORE||!isGeneral(c[3],date))return null;
    return {group,person,kind:tp==='24E'?'f':'a',date,amount};
  }
  return null;
}
export function context(D){
  const cm2g=new Map(), cand2p=new Map(), cmte2p=new Map();
  for(const g of D.groupPos)for(const f of g.fecIds||[])cm2g.set(f.id,g.key);
  for(const s of D.members.concat(D.cands||[])){
    for(const id of [s.fecCand,...(s.fecCandPast||[])])if(id)cand2p.set(id,s.id);
    for(const id of [s.fecCmte,s.camp&&s.camp.cmteId])if(id)cmte2p.set(id,s.id);
  }
  return {cm2g,cand2p,cmte2p};
}
// Monthly totals: people[person][group][kind] = [[YYYY-MM, amount, count], ...]
export function aggregate(items){
  const out={};
  for(const it of items){
    const p=out[it.person]||(out[it.person]={}), g=p[it.group]||(p[it.group]={c:[],f:[],a:[]});
    const m=it.date.slice(0,7), list=g[it.kind];
    const row=list.find(r=>r[0]===m);
    if(row){row[1]+=it.amount;row[2]++;}else list.push([m,it.amount,1]);
  }
  for(const p of Object.values(out))for(const g of Object.values(p))for(const k of ['c','f','a']){g[k].sort((x,y)=>x[0].localeCompare(y[0]));g[k].forEach(r=>{r[1]=Math.round(r[1]*100)/100;});}
  return out;
}

async function download(cycle,dir){
  const name=`pas2${String(cycle).slice(2)}.zip`, file=path.join(dir,name);
  if(process.argv.includes('--refresh')&&fs.existsSync(file))fs.rmSync(file);
  if(!fs.existsSync(file)){
    const r=await fetch(`${BASE}/${cycle}/${name}`);
    if(!r.ok)throw new Error(`Download failed (${r.status}) for ${name}`);
    fs.writeFileSync(file,Buffer.from(await r.arrayBuffer()));
  }
  return {file,downloaded:fs.statSync(file).mtime.toISOString().slice(0,10)};
}
async function* lines(zip){
  const p=spawn('unzip',['-p',zip,'itpas2.txt']);
  let err='';p.stderr.on('data',d=>err+=d);
  yield* readline.createInterface({input:p.stdout,crlfDelay:Infinity});
  const code=await new Promise(res=>p.on('close',res));
  if(code)throw new Error(`unzip failed for ${zip}: ${err}`);
}

async function main(){
  const dir=process.env.FEC_BULK_DIR||path.join(ROOT,'.local','fec-bulk');
  fs.mkdirSync(dir,{recursive:true});
  const D=JSON.parse(fs.readFileSync(path.join(ROOT,'public','research.json'),'utf8'));
  const ctx=context(D), items=[], sources=[];
  for(const cycle of CYCLES){
    const {file,downloaded}=await download(cycle,dir);
    let n=0;
    for await(const line of lines(file)){const it=classify(line,ctx);if(it){items.push(it);n++;}}
    sources.push({cycle,file:path.basename(file),downloaded,rows:n});
    console.log(`${path.basename(file)}: ${n} matching rows`);
  }
  const contribThrough=items.filter(i=>i.kind==='c').map(i=>i.date).sort().pop()||null;
  const out={
    about:'Monthly money from each researched group to or about each profiled candidate, from FEC bulk files. See scripts/build-funder-history.mjs.',
    built:new Date().toISOString().slice(0,10),
    start:`${CYCLES[0]-1}-01-01`, ieBefore:IE_BEFORE, contribThrough, sources,
    groups:D.groupPos.map(g=>g.key),   // the groups this file was built for, so the page can tell a new group from no money
    people:aggregate(items),
  };
  fs.writeFileSync(path.join(ROOT,'public','funder-history.json'),JSON.stringify(out));
  console.log(`Wrote public/funder-history.json: ${items.length} transactions, contributions through ${contribThrough}.`);
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(e=>{console.error(e.message);process.exit(1);});
