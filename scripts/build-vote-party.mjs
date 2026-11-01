// How each party voted on the saved roll calls (public/research.json votes and hvotes), from the official Senate and
// House Clerk files (no key), for the Donor Loyalty Index: a person's vote is compared with the rest of their party's.
//   node scripts/build-vote-party.mjs          read the saved votes not in public/vote-party.json yet
//   node scripts/build-vote-party.mjs --all    read them all again
// Writes public/vote-party.json: {votes: {voteId: {R: {Yea, Nay, ...}, D: {...}, I: {...}}}}. A published roll call
// doesn't change, so this runs once, and again when votes are added to the research. New roll calls the refresh reads
// keep their own party totals too.
// Senate.gov can turn these requests away (HTTP 403). Then the Senate votes come from Voteview (UCLA's roll-call
// archive, free downloads, no key), whose files give each vote's official session and roll number and every senator's
// vote and party. A Voteview total is kept only when it matches the result saved with the vote ("Passed 50-49").
import fs from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {requestSource,voteURL,normalizeVote,partyTally} from '../src/sources.mjs';

const root=new URL('../',import.meta.url);
const OUT=new URL('public/vote-party.json',root);
const VOTEVIEW='https://voteview.com/static/data/out';

// The official file's address arguments for a saved vote: Senate votes are "117-1-1" (Congress, session, number), House
// votes carry their year and roll number.
export function voteArgs(v,chamber){
  if(chamber==='H')return v.year&&v.roll?{chamber:'H',year:Number(v.year),number:Number(v.roll)}:null;
  const [congress,session,number]=String(v.id).split('-').map(Number);
  return congress&&session&&number?{chamber:'S',congress,session,number}:null;
}
export const savedVotes=research=>[...(research.votes||[]).map(v=>[v,'S']),...(research.hvotes||[]).map(v=>[v,'H'])].map(([v,ch])=>({id:v.id,date:v.date||null,result:v.result||'',args:voteArgs(v,ch)})).filter(v=>v.args);

// A CSV file as one object per row, keyed by the header line. Quoted fields may hold commas, quotes and line breaks.
export function csvRows(text){
  const rows=[];let row=[],field='',quoted=false;
  for(let i=0;i<text.length;i++){
    const c=text[i];
    if(quoted){if(c==='"'){if(text[i+1]==='"'){field+='"';i++;}else quoted=false;}else field+=c;continue;}
    if(c==='"')quoted=true;
    else if(c===','){row.push(field);field='';}
    else if(c==='\n'||c==='\r'){if(c==='\r'&&text[i+1]==='\n')i++;row.push(field);field='';if(row.some(f=>f!==''))rows.push(row);row=[];}
    else field+=c;
  }
  row.push(field);if(row.some(f=>f!==''))rows.push(row);
  const [head=[],...body]=rows;
  return body.map(r=>Object.fromEntries(head.map((h,i)=>[h.trim(),r[i]??''])));
}

// Voteview's codes (voteview.com/articles/data_help_votes): 1 Yea, 6 Nay, 7–8 Present; paired and announced votes
// (2–5) and 9 are not cast on the floor, as in the official record. Parties: 100 Democrat, 200 Republican,
// 328 Independent.
export const CAST={1:'Yea',2:'Not Voting',3:'Not Voting',4:'Not Voting',5:'Not Voting',6:'Nay',7:'Present',8:'Present',9:'Not Voting'};
const PARTY={100:'D',200:'R',328:'I'};

// The yea and nay counts in a saved result ("Not sustained, 6-93", "Passed 51-50 (VP tie-break)"), if it has them.
export function resultCounts(result){const m=String(result||'').match(/(\d+)\s*-\s*(\d+)/);return m?{yea:Number(m[1]),nay:Number(m[2])}:null;}
// Party totals agree with the saved result when the yeas and nays match, allowing one for a Vice President's vote,
// which is in some saved results but never on the senators' list.
export function totalsAgree(byParty,result){
  const want=resultCounts(result);if(!want)return true;
  const got=Object.values(byParty).reduce((t,p)=>({yea:t.yea+(p.Yea||0),nay:t.nay+(p.Nay||0)}),{yea:0,nay:0});
  return Math.abs(got.yea-want.yea)+Math.abs(got.nay-want.nay)<=1;
}

// One Congress's Voteview Senate files (parsed rows) → party totals for the saved votes asked for, and the reason each
// other one was left out.
export function voteviewParty({rollcalls,members,votes},wanted){
  const n=Number,party=new Map(members.filter(m=>m.chamber==='Senate').map(m=>[n(m.icpsr),PARTY[n(m.party_code)]||null]));
  const byRoll=new Map(rollcalls.filter(r=>r.chamber==='Senate').map(r=>[`${n(r.congress)}-${n(r.session)}-${n(r.clerk_rollnumber)}`,r]));
  const cast=new Map();
  for(const v of votes){if(v.chamber!=='Senate')continue;const k=n(v.rollnumber);(cast.get(k)||cast.set(k,[]).get(k)).push([party.get(n(v.icpsr)),CAST[n(v.cast_code)]]);}
  const out={},problems={};
  for(const w of wanted){
    const r=byRoll.get(`${w.args.congress}-${w.args.session}-${w.args.number}`);
    if(!r){problems[w.id]='not in Voteview yet';continue;}
    if(w.date&&r.date&&Math.abs(Date.parse(r.date)-Date.parse(w.date))>864e5){problems[w.id]=`Voteview dates it ${r.date}, the research ${w.date}`;continue;}
    const byParty=partyTally(cast.get(n(r.rollnumber))||[]);
    if(!Object.keys(byParty).length){problems[w.id]='no senators\' votes in Voteview';continue;}
    if(!totalsAgree(byParty,w.result)){problems[w.id]=`Voteview's totals don't match "${w.result}"`;continue;}
    out[w.id]=byParty;
  }
  return {votes:out,problems};
}

// One Congress's three Voteview Senate files, parsed: rollcalls (each vote's official session and roll number), members
// (party and Bioguide ID) and votes (each senator's cast code).
export async function voteviewFiles(congress){
  const files={};
  for(const kind of ['rollcalls','members','votes'])files[kind]=csvRows(await requestSource(`${VOTEVIEW}/${kind}/S${congress}_${kind}.csv`,{},{as:'text'}));
  return files;
}
async function fromVoteview(wanted){
  const out={},problems={},byCongress=new Map();
  for(const w of wanted)(byCongress.get(w.args.congress)||byCongress.set(w.args.congress,[]).get(w.args.congress)).push(w);
  for(const [congress,list] of byCongress){
    try{
      const r=voteviewParty(await voteviewFiles(congress),list);Object.assign(out,r.votes);Object.assign(problems,r.problems);
    }catch(e){for(const w of list)problems[w.id]=`Voteview: ${e.message}`;}
  }
  return {votes:out,problems};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const research=JSON.parse(await fs.readFile(new URL('public/research.json',root),'utf8'));
  const old=process.argv.includes('--all')?null:JSON.parse(await fs.readFile(OUT,'utf8').catch(()=>'null'));
  const votes={...(old?.votes||{})},missing=[],fromVV=new Set(old?.voteview||[]);
  const todo=savedVotes(research).filter(v=>!votes[v.id]);
  const backup=[];let senateRefused=false;
  for(const [i,v] of todo.entries()){
    // Once Senate.gov refuses, the other Senate votes go straight to Voteview rather than asking it again.
    if(v.args.chamber==='S'&&senateRefused){backup.push(v);continue;}
    try{
      const doc=await requestSource(voteURL(v.args),{},{json:false});
      const byParty=normalizeVote(doc,v.args,[]).byParty;
      if(!Object.keys(byParty).length)throw new Error('no party on the member records');
      votes[v.id]=byParty;fromVV.delete(v.id);
    }catch(e){
      if(v.args.chamber==='S'){
        if(e.statusCode===403){senateRefused=true;console.warn('Senate.gov turned the request away (HTTP 403), so the Senate votes come from Voteview.');}
        else console.warn(`${v.id}: ${e.message}; trying Voteview.`);
        backup.push(v);
      }else{missing.push(v.id);console.warn(`${v.id}: ${e.message}`);}
    }
    if(i<todo.length-1&&!(senateRefused&&todo[i+1]?.args.chamber==='S'))await new Promise(r=>setTimeout(r,300));
  }
  if(backup.length){
    const vv=await fromVoteview(backup);
    for(const [id,byParty] of Object.entries(vv.votes)){votes[id]=byParty;fromVV.add(id);}
    for(const [id,why] of Object.entries(vv.problems)){missing.push(id);console.warn(`${id}: ${why}`);}
  }
  const voteview=[...fromVV].filter(id=>votes[id]);
  const out={about:'How each party voted on the saved roll calls, for the Donor Loyalty Index. See scripts/build-vote-party.mjs.',
    source:'Senate.gov roll call votes and the House Clerk; Voteview for the Senate votes listed under "voteview"',
    built:new Date().toISOString().slice(0,10),votes,voteview,missing};
  await fs.writeFile(OUT,JSON.stringify(out,null,1)+'\n');
  const now=todo.length-missing.length;
  console.log(`${Object.keys(votes).length} roll calls with party totals in public/vote-party.json (${now} read now${voteview.length?`, ${voteview.length} in all from Voteview`:''})${missing.length?`; ${missing.length} could not be read: ${missing.join(', ')}`:''}.`);
}
