// The monthly recalculation, run after the month's review: recalculates Promises delivered, Ethics and Workers >
// Profit for everyone from the reviewed research, reruns the Money & Influence timing flags, and adds an entry to
// public/score-log.json saying which score moved, by how much and why. Your match is not logged: it depends on each
// visitor's own choices. The Methodology page shows the latest entries.
//   npm run scores:monthly               write this month's entry (a second run on the same day replaces it)
//   npm run scores:monthly -- --dry-run  print the changes without writing
import fs from 'node:fs';
import crypto from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {ETHICS_COST,CASE_KIND,CASE_AGE,INDEX_COST,INSIDER,DODGER,LATE_DAYS,WEIGHT,MIN_CHECKS,MIN_PVP_ACTIONS,CORP_COMPROMISED} from '../public/grades.js';
import {makeScorer} from '../public/scoring.js';
import {timingFlags,SWING,WINDOW_MONTHS,TOP_DONORS} from '../public/influence.js';

const root=new URL('../',import.meta.url),read=f=>fs.readFileSync(new URL(f,root),'utf8');
const LOG='public/score-log.json';

// One person's logged scores: each grade's percentage (null when not graded) and the counts behind it.
export function personScores(s,scorer,history){
  const p=scorer.promises(s),e=scorer.ethics(s),v=scorer.pvp(s);
  let flags=0;
  if(history){const h=history.people[s.id]||{},through=history.contribThrough.slice(0,7);
    for(const g of s.funderPos||[]){const series={};for(const [m,x] of (h[g.key]||{}).c||[])series[m]=(series[m]||0)+x;
      flags+=timingFlags(g.org,series,(g.compared||[]).map(c=>({date:c.date,match:c.match})),through).length;}}
  return {
    promises:{pct:p.pct,kept:p.kept,half:p.half,broken:p.broken,counted:p.clear},
    ethics:{pct:e.pct,finding:e.finding,open:e.open,closed:e.closed,allegation:e.allegation,late:e.late,conflict:e.conflict,legal:e.legal.index,insider:e.insider.index,dodger:e.dodger.index},
    // Counts of actions on each side (each one is weighted by its bill's strength in the grade itself).
    pvp:{pct:v.pct,people:v.nPeople,profit:v.nProfit,actions:v.n,bills:v.billsPct,cci:v.cci?.index??null},
    flags,
  };
}
const NAMES={promises:'Promises delivered',ethics:'Ethics',pvp:'Workers > Profit'};
// The counts behind each grade, as [field, one, several], for the reason given with each change.
const PARTS={
  promises:[['kept','kept promise','kept promises'],['half','partly kept or changed promise','partly kept or changed promises'],['broken','contradicted promise','contradicted promises'],['counted','counted check','counted checks']],
  ethics:[['finding','confirmed finding','confirmed findings'],['open','open investigation','open investigations'],['closed','investigation closed without a finding','investigations closed without a finding'],['allegation','allegation (not scored)','allegations (not scored)'],['late','late disclosure','late disclosures'],['conflict','committee-conflict trade','committee-conflict trades'],
    ['legal','Legal Trouble Index point','Legal Trouble Index points'],['insider','Insider Trading Index point','Insider Trading Index points'],['dodger','Stock Disclosure Dodger Index point','Stock Disclosure Dodger Index points']],
  pvp:[['people','action for working people','actions for working people'],['profit','action for the wealthy and corporations','actions for the wealthy and corporations'],['cci','Corporation Compromised Index point','Corporation Compromised Index points']],
};
// What moved between two runs, with the reason drawn from the counts behind each grade.
export function compare(before,after){
  const changes=[];
  for(const [id,now] of Object.entries(after)){
    const was=before?.[id];
    for(const g of ['promises','ethics','pvp']){
      const a=was?.[g],b=now[g];
      // A count an older entry didn't record (the Ethics indexes, before they existed) is not compared; an index without
      // enough data (null) counts as 0.
      const diff=k=>a[k]===undefined?0:(b[k]??0)-(a[k]??0);
      if(a&&a.pct===b.pct&&PARTS[g].every(([k])=>!diff(k)))continue;
      const why=a?PARTS[g].filter(([k])=>diff(k)).map(([k,one,many])=>{const d=diff(k);return `${d>0?'+':'−'}${Math.abs(d)} ${Math.abs(d)===1?one:many}`;}):[];
      changes.push({id,grade:g,from:a?a.pct:undefined,to:b.pct,why:!a?'First recorded score':why.length?why.join(', '):'Rule or weight change'});
    }
  }
  for(const id of Object.keys(before||{}))if(!after[id])changes.push({id,grade:'all',from:null,to:null,why:'No longer profiled'});
  return changes.filter(c=>!(c.from===undefined&&c.to===null&&c.why==='First recorded score'));
}
export function buildEntry(research,committees,sectors,history,config,date,tallies=null){
  const scorer=makeScorer(research,committees,sectors.committees||{},tallies);
  const scores=Object.fromEntries([...research.members,...research.cands,...(research.featured||[])].map(s=>[s.id,personScores(s,scorer,history)]));
  return {date,reviewedAt:config.reviewedAt,research:crypto.createHash('sha256').update(JSON.stringify(research)).digest('hex').slice(0,12),
    rules:{ETHICS_COST,CASE_KIND,CASE_AGE,INDEX_COST,INSIDER,DODGER,LATE_DAYS,WEIGHT,MIN_CHECKS,MIN_PVP_ACTIONS,CORP_COMPROMISED,SWING,WINDOW_MONTHS,TOP_DONORS},scores};
}

if(import.meta.url===pathToFileURL(process.argv[1]).href){
  const dry=process.argv.includes('--dry-run');
  const research=JSON.parse(read('public/research.json')),config=JSON.parse(read('data/config.json'));
  const committees=JSON.parse(read('public/committees.json')),sectors=JSON.parse(read('public/committee-sectors.json'));
  const history=fs.existsSync(new URL('public/funder-history.json',root))?JSON.parse(read('public/funder-history.json')):null;
  const log=fs.existsSync(new URL(LOG,root))?JSON.parse(read(LOG)):{about:'',entries:[]};
  const date=new Date().toISOString().slice(0,10);
  const tallies=fs.existsSync(new URL('public/vote-party.json',root))?JSON.parse(read('public/vote-party.json')).votes:null;
  const entry=buildEntry(research,committees,sectors,history,config,date,tallies);
  const prev=log.entries.filter(e=>e.date!==date).at(-1);
  entry.changes=prev?compare(prev.scores,entry.scores):[];
  entry.note=prev?`${entry.changes.length} change${entry.changes.length===1?'':'s'} since ${prev.date}.`:'First recalculation: these are the starting scores.';
  if(prev&&JSON.stringify(prev.rules)!==JSON.stringify(entry.rules))entry.note+=' Scoring rules or weights changed since the last run.';
  console.log(`${entry.note} Research ${entry.research}, reviewed ${entry.reviewedAt}.`);
  for(const c of entry.changes)console.log(`  ${c.id} · ${NAMES[c.grade]||c.grade}: ${c.from==null?'Not graded':c.from+'%'} → ${c.to==null?'Not graded':c.to+'%'} (${c.why})`);
  if(dry){console.log('Dry run: nothing written.');process.exit(0);}
  log.about='Monthly recalculations of Promises delivered, Ethics and Workers > Profit, after review, with every change and why. Written by scripts/scores-monthly.mjs; newest last.';
  log.entries=log.entries.filter(e=>e.date!==date).concat(entry);
  // One entry per line keeps the log reviewable as a diff.
  fs.writeFileSync(new URL(LOG,root),`{"about":${JSON.stringify(log.about)},"entries":[\n${log.entries.map(e=>JSON.stringify(e)).join(',\n')}\n]}\n`);
  console.log(`Wrote ${LOG} (${log.entries.length} entr${log.entries.length===1?'y':'ies'}).`);
}
