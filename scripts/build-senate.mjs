// Covers every sitting senator, from the congress-legislators project (https://github.com/unitedstates/congress-legislators,
// public domain, no key).
//   node scripts/build-senate.mjs              download the current files
//   node scripts/build-senate.mjs --dir <dir>  use copies already downloaded (same file names, .json)
// Writes public/senate.json, the directory of all senators, and adds each senator who has no reviewed profile in
// public/research.json to data/config.json (marked basic: true), so the refresh collects their records. Then it fills in
// everyone's IDs and committee assignments the way scripts/build-ids.mjs does (public/committees.json).
// Senators who leave office stay in data/config.json until removed by hand; senate.json lists only sitting senators.
import fs from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {loadFiles,buildIds,writeIds} from './build-ids.mjs';

const root=new URL('../',import.meta.url);
const PARTY={Democrat:'D',Republican:'R',Independent:'I'};
export const STATE_NAMES={AL:'Alabama',AK:'Alaska',AZ:'Arizona',AR:'Arkansas',CA:'California',CO:'Colorado',CT:'Connecticut',DE:'Delaware',FL:'Florida',GA:'Georgia',HI:'Hawaii',ID:'Idaho',IL:'Illinois',IN:'Indiana',IA:'Iowa',KS:'Kansas',KY:'Kentucky',LA:'Louisiana',ME:'Maine',MD:'Maryland',MA:'Massachusetts',MI:'Michigan',MN:'Minnesota',MS:'Mississippi',MO:'Missouri',MT:'Montana',NE:'Nebraska',NV:'Nevada',NH:'New Hampshire',NJ:'New Jersey',NM:'New Mexico',NY:'New York',NC:'North Carolina',ND:'North Dakota',OH:'Ohio',OK:'Oklahoma',OR:'Oregon',PA:'Pennsylvania',RI:'Rhode Island',SC:'South Carolina',SD:'South Dakota',TN:'Tennessee',TX:'Texas',UT:'Utah',VT:'Vermont',VA:'Virginia',WA:'Washington',WV:'West Virginia',WI:'Wisconsin',WY:'Wyoming'};

// Profile IDs are letters and digits only (a hyphen starts a tab name in the page address): the last name, or the first
// initial and last name when two senators share a last name or the last name is already taken.
const slug=v=>String(v||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
export function assignIds(senators,taken){
  const used=new Set(taken),count=new Map();
  for(const x of senators)count.set(slug(x.name.last),(count.get(slug(x.name.last))||0)+1);
  const ids=new Map();
  for(const x of senators){
    const last=slug(x.name.last),tries=[count.get(last)>1?null:last,slug(x.name.first[0]+x.name.last),last+x.terms.at(-1).state.toLowerCase()].filter(Boolean);
    let id=tries.find(t=>!used.has(t));for(let n=2;!id;n++)if(!used.has(last+n))id=last+n;
    used.add(id);ids.set(x.id.bioguide,id);
  }
  return ids;
}

// One senator's directory entry. The next election is the year before their term ends (terms end on January 3).
export function senatorEntry(x,id,profiled){
  const t=x.terms.at(-1),senate=x.terms.filter(s=>s.type==='sen');
  return {id,profiled,name:x.name.official_full||`${x.name.first} ${x.name.last}`,short:x.name.last,party:PARTY[t.party]||t.party?.[0]||null,
    state:t.state,stateName:STATE_NAMES[t.state]||t.state,bioguide:x.id.bioguide,lis:x.id.lis||null,class:t.class??null,
    since:senate[0]?.start||t.start,termEnd:t.end,nextElection:Number(t.end.slice(0,4))-1,site:t.url||null,fecCand:senateFecId(x)};
}
// A senator's FEC candidate ID: the Senate one for their state, if congress-legislators lists it.
export const senateFecId=x=>(x.id.fec||[]).filter(f=>f.startsWith('S')&&f.slice(2,4)===x.terms.at(-1).state).at(-1)||null;

// Adds the senators without a profile to config.people and returns the directory.
export function addSenators(current,config,research){
  const senators=current.filter(x=>x.terms.at(-1).type==='sen').sort((a,b)=>a.terms.at(-1).state.localeCompare(b.terms.at(-1).state)||a.name.last.localeCompare(b.name.last));
  const profiles=new Map([...research.members,...research.cands,...(research.featured||[])].filter(s=>s.bioguide).map(s=>[s.bioguide,s.id]));
  const inConfig=new Map(config.people.filter(p=>p.bioguide).map(p=>[p.bioguide,p]));
  const fresh=senators.filter(x=>!profiles.has(x.id.bioguide)&&!inConfig.has(x.id.bioguide));
  const ids=assignIds(fresh,config.people.map(p=>p.id));
  for(const x of fresh){
    const t=x.terms.at(-1);
    config.people.push({id:ids.get(x.id.bioguide),name:x.name.official_full||`${x.name.first} ${x.name.last}`,short:x.name.last,bioguide:x.id.bioguide,lis:x.id.lis||null,
      fecCand:senateFecId(x),fecCmte:null,chamber:'S',state:t.state,race:null,basic:true});
  }
  const idOf=x=>profiles.get(x.id.bioguide)||inConfig.get(x.id.bioguide)?.id||ids.get(x.id.bioguide);
  return {added:fresh.length,senators:senators.map(x=>senatorEntry(x,idOf(x),profiles.has(x.id.bioguide)))};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const arg=process.argv.indexOf('--dir'),files=await loadFiles(arg>0?process.argv[arg+1]:null);
  const config=JSON.parse(await fs.readFile(new URL('data/config.json',root),'utf8'));
  const research=JSON.parse(await fs.readFile(new URL('public/research.json',root),'utf8'));
  const {added,senators}=addSenators(files[0],config,research);
  const {committees,summary}=await buildIds(files,config,research);
  await writeIds(config,committees);
  const out={congress:config.congress,checked:new Date().toISOString().slice(0,10),source:'https://github.com/unitedstates/congress-legislators',
    note:'Every sitting senator. Those with a reviewed profile link to it; the rest have a basic profile with their records from the daily refresh.',senators};
  await fs.writeFile(new URL('public/senate.json',root),JSON.stringify(out,null,1)+'\n');
  console.log(`${senators.length} senators in public/senate.json; ${added} added to data/config.json. ${summary}`);
}
