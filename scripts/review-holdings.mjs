// Blind trusts and divestment (step 8): for each person with graded research, their reviewed holdings status
// (research.json "holdings") next to what their latest annual disclosure shows, from the reports the local server's
// refresh saved (.local/records.sqlite, the "net-worth" jobs; run npm start first). Lines marked "REVIEW" are where the
// report points to another status, or a "no-stocks" status has reviewed stock trades after it began. Nothing is written:
// to set a status, add "holdings": {"status": "blind-trust" | "no-stocks", "since", "src": {"t", "u"}, "note"} to the
// person in public/research.json, citing the report or another source, then commit it.
//   npm run review:holdings
import fs from 'node:fs';
import {pathToFileURL} from 'node:url';
import {holdingsLead,holdingsReview,stockTradesSince} from '../public/holdings.js';
import {HOLDINGS} from '../public/grades.js';

// snapshots: {person: payload of their net-worth job}. Returns one row per person with research.
export function holdingsReport(data,snapshots={}){
  return [...(data.members||[]),...(data.cands||[])].map(p=>{
    const x=snapshots[p.id],report=x?.assets?x:x?.rows?.[0]||null,lead=holdingsLead(report),reviewed=p.holdings||null;
    const late=stockTradesSince(reviewed,p.trades);
    const result=late.length?'differs':holdingsReview(reviewed,lead);
    return {id:p.id,name:p.name,reviewed,lead,result,late:late.length,report:report?{year:report.year||null,url:report.url||null,unreadable:!!report.unreadable}:null};
  });
}
function readSnapshots(file){
  const {DatabaseSync}=globalThis.process.getBuiltinModule('node:sqlite'),db=new DatabaseSync(file,{readOnly:true}),out={};
  for(const r of db.prepare(`SELECT j.subject,s.payload FROM snapshots s JOIN jobs j ON j.id=s.job_id WHERE j.kind IN ('net-worth-house','net-worth-senate')`).all())
    out[r.subject]=JSON.parse(r.payload);
  return out;
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const data=JSON.parse(fs.readFileSync(new URL('../public/research.json',import.meta.url),'utf8'));
  const file=new URL('../.local/records.sqlite',import.meta.url);
  let snaps={};
  if(fs.existsSync(file))snaps=readSnapshots(file);
  else console.log('No saved refresh yet (.local/records.sqlite). Run npm start and let the weekly "Net worth" checks finish; until then only the reviewed statuses are listed.\n');
  const rows=holdingsReport(data,snaps);
  for(const r of rows){
    if(!r.reviewed&&!r.lead)continue;
    const mark=r.result==='differs'?'REVIEW ':r.result==='lead'?'LEAD   ':'       ';
    const rev=r.reviewed?`reviewed: ${HOLDINGS[r.reviewed.status]}${r.reviewed.since?` since ${r.reviewed.since}`:''}`:'reviewed: none';
    const lead=r.lead?`${r.lead.year||'latest'} report: ${r.lead.label}${r.lead.blindTrusts.length?` (${r.lead.blindTrusts.slice(0,2).join('; ')})`:''}${r.lead.stocks?` e.g. ${r.lead.stockNames.slice(0,4).join(', ')}`:''}${r.lead.managed?`; ${r.lead.managed} managed account${r.lead.managed===1?'':'s'} (not excused)`:''}`:r.report?.unreadable?'report filed on paper; check it by hand':'no report read yet';
    console.log(`${mark}${r.name}: ${rev} · ${lead}${r.late?` · ${r.late} reviewed stock trade${r.late===1?'':'s'} after the status began`:''}${r.report?.url?`\n         ${r.report.url}`:''}`);
  }
  const n=k=>rows.filter(r=>r.result===k).length;
  console.log(`\n${rows.filter(r=>r.reviewed).length} reviewed statuses; ${n('agrees')} agree with the latest report, ${n('differs')} to review, ${n('lead')} new leads (a blind trust or no individual stocks on the report, not reviewed yet).`);
}
