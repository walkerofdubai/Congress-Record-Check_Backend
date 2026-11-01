// Positions on the saved roll calls (public/research.json "votes" and "hvotes") for the tracked people a vote doesn't
// list yet (a newly added roll call): senators from Voteview's free files (Senate.gov turns scripts away), House members
// from the House Clerk's official file for each vote. Both are matched by Bioguide ID. Run on your own computer.
//   node scripts/fill-vote-positions.mjs           fill the missing positions and check every listed one
//   node scripts/fill-vote-positions.mjs --check   only check: report positions that differ from Voteview
// A position already in the research is never changed: a difference is reported for review. Each vote is matched by its
// official session and roll number, and must fall on the same day as the research's date.
import fs from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {voteviewFiles,CAST,voteArgs} from './build-vote-party.mjs';
import {requestSource,voteURL,normalizeVote,castOf} from '../src/sources.mjs';

// Positions for the saved Senate votes from one Congress's Voteview files. tracked: [{id, bioguide}]. Returns the
// positions to fill ({voteId: {personId: position}}), the listed positions that differ, and votes that couldn't be read.
export function votePositions({rollcalls,members,votes},saved,tracked){
  const n=Number,senate=members.filter(m=>m.chamber==='Senate');
  const icpsr=new Map(senate.filter(m=>m.bioguide_id).map(m=>[m.bioguide_id,n(m.icpsr)]));
  const byRoll=new Map(rollcalls.filter(r=>r.chamber==='Senate').map(r=>[`${n(r.congress)}-${n(r.session)}-${n(r.clerk_rollnumber)}`,r]));
  const cast=new Map();for(const v of votes)if(v.chamber==='Senate')cast.set(`${n(v.rollnumber)}:${n(v.icpsr)}`,n(v.cast_code));
  const fill={},differ=[],unread={};
  for(const v of saved){
    const r=byRoll.get(`${v.congress}-${v.session}-${v.number}`);
    if(!r){unread[v.id]='not in Voteview yet';continue;}
    if(v.date&&r.date&&Math.abs(Date.parse(r.date)-Date.parse(v.date))>864e5){unread[v.id]=`Voteview dates it ${r.date}, the research ${v.date}`;continue;}
    for(const p of tracked){
      const who=icpsr.get(p.bioguide),code=who==null?0:cast.get(`${n(r.rollnumber)}:${who}`)??0;
      // Not a senator in that Congress, or not yet (or no longer) one on that day.
      const pos=code===0?'Not in office':CAST[code]||null;if(!pos)continue;
      const had=v.pos?.[p.id];
      if(had==null)(fill[v.id]||={})[p.id]=pos;
      else if(['Yea','Nay'].includes(had)&&had!==pos)differ.push({vote:v.id,person:p.id,research:had,voteview:pos});
    }
  }
  return {fill,differ,unread};
}

// House positions for one saved House vote from its normalized Clerk file (src/sources.mjs normalizeVote, which matches
// members by Bioguide ID). Someone not on the roll call wasn't a member then. The House list writes "Not voting".
export function houseVotePositions(normalized,saved,tracked){
  const fill={},differ=[];
  if(saved.date&&normalized.date!==saved.date)return {fill,differ,unread:`the Clerk dates it ${normalized.date}, the research ${saved.date}`};
  for(const p of tracked){
    const raw=normalized.positions[p.id],c=castOf(raw),pos=raw==null?'Not in office':c==='Yea'||c==='Nay'?c:/not voting/i.test(raw)?'Not voting':raw;
    const had=saved.pos?.[p.id];
    if(had==null)fill[p.id]=pos;else if(['Yea','Nay'].includes(had)&&['Yea','Nay'].includes(pos)&&had!==pos)differ.push({vote:saved.id,person:p.id,research:had,voteview:pos});
  }
  return {fill,differ,unread:null};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const file=new URL('../public/research.json',import.meta.url),research=JSON.parse(await fs.readFile(file,'utf8'));
  const people=[...research.members,...research.cands,...(research.featured||[])];
  const ids=[...new Set(research.votes.flatMap(v=>Object.keys(v.pos||{})))];
  const tracked=ids.map(id=>({id,bioguide:people.find(p=>p.id===id)?.bioguide})).filter(p=>p.bioguide);
  const check=process.argv.includes('--check'),byCongress=new Map();
  for(const v of research.votes)(byCongress.get(v.congress)||byCongress.set(v.congress,[]).get(v.congress)).push(v);
  let filled=0;const differ=[];
  for(const [congress,saved] of byCongress){
    let r;try{r=votePositions(await voteviewFiles(congress),saved,tracked);}catch(e){console.warn(`${congress}th Congress: Voteview: ${e.message}`);continue;}
    for(const [id,why] of Object.entries(r.unread))console.warn(`${id}: ${why}`);
    differ.push(...r.differ);
    for(const [id,pos] of Object.entries(r.fill)){const v=research.votes.find(x=>x.id===id);
      for(const [person,p] of Object.entries(pos)){console.log(`${id} ${person}: ${p}${check?' (not saved: --check)':''}`);if(!check){v.pos[person]=p;filled++;}}}
  }
  // House: one Clerk file per vote, only for votes missing someone, plus a check of the listed positions on those.
  const housePeople=[...new Set(research.hvotes.flatMap(v=>Object.keys(v.pos||{})))].map(id=>({id,bioguide:people.find(p=>p.id===id)?.bioguide})).filter(p=>p.bioguide);
  for(const v of research.hvotes.filter(v=>housePeople.some(p=>!(p.id in (v.pos||{}))))){
    try{
      const args=voteArgs(v,'H'),r=houseVotePositions(normalizeVote(await requestSource(voteURL(args),{},{json:false}),args,housePeople),v,housePeople);
      if(r.unread){console.warn(`${v.id}: ${r.unread}`);continue;}
      for(const d of r.differ)differ.push({...d,source:'the House Clerk'});
      for(const [person,p] of Object.entries(r.fill)){console.log(`${v.id} ${person}: ${p}${check?' (not saved: --check)':''}`);if(!check){(v.pos||={})[person]=p;filled++;}}
    }catch(e){console.warn(`${v.id}: ${e.message}`);}
    await new Promise(r=>setTimeout(r,300));
  }
  for(const d of differ)console.warn(`Differs: ${d.vote} ${d.person} is ${d.research} in the research, ${d.voteview} in ${d.source||'Voteview'}. Check the official roll call.`);
  if(filled)await fs.writeFile(file,JSON.stringify(research,null,2));
  console.log(`${filled} position${filled===1?'':'s'} filled${differ.length?`; ${differ.length} listed position${differ.length===1?'':'s'} differ from the source`:'; every listed Yea and Nay that was checked matches'}.`);
}
