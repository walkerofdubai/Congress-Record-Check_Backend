import config from '../data/config.json' with {type:'json'};
import COMMITTEES from '../public/committees.json' with {type:'json'};
import {fetchPage,summarize,SourceError,requestSource,missingKey,HOSTS,DEFAULT_PER_RUN} from './sources.mjs';
import {FEEDS,FEED_KINDS,FEEDS_VERSION,normalizeHouseApiVote,houseApiURL,history,SINCE} from './feeds.mjs';
import {mergeTrades,mergeStateBills,mergeNews,committeeDiff,mergeHearings,mergeLegal,mergeStatements,donorOrgs} from './merge.mjs';

const DAY=86400000;
// A recorded roll call does not change, so a published vote is never fetched again.
const NEVER=Number.MAX_SAFE_INTEGER;
// How often a job runs: its source's setting, which can depend on the job (a past year's index is checked weekly).
const everyOf=(kind,args)=>{const e=FEEDS[kind]?.every;const v=typeof e==='function'?e(typeof args==='string'?JSON.parse(args):args||{}):e;return v??(kind==='vote'?NEVER:kind==='committee'?7*DAY:DAY);};
const nextRefresh=(kind,from=Date.now(),args)=>{const every=everyOf(kind,args);return every===NEVER?NEVER:from+every;};
// A job still catching up on its history (a backlog of trade reports, CRS reports back to historyFrom) publishes what
// it has read and runs again this soon, instead of waiting a day.
const CATCH_UP=10*60_000;
// The host each job kind calls, which decides the key it needs and which jobs share a rate limit.
const LEGACY_HOST={campaign:'api.open.fec.gov',committee:'api.open.fec.gov',pac:'api.open.fec.gov',outside:'api.open.fec.gov',legislation:'api.congress.gov','senate-index':'www.senate.gov','house-next':'clerk.house.gov',vote:'clerk.house.gov'};
const hostOf=kind=>FEEDS[kind]?.host||LEGACY_HOST[kind];
export const ALL_KINDS=[...Object.keys(LEGACY_HOST),...FEED_KINDS];
const nowISO=()=>new Date().toISOString();
export const statement=(db,sql,...args)=>db.prepare(sql).bind(...args);
export async function addJob(db,id,kind,subject,args,due=0) {
  await statement(db,'INSERT OR IGNORE INTO jobs (id,kind,subject,args,next_due) VALUES (?,?,?,?,?)',id,kind,subject,JSON.stringify(args),due).run();
}
async function addFinance(db,p,committee,cycle) {
  await addJob(db,`campaign:${p.id}`,'campaign',p.id,{committee,cycle});
  await addJob(db,`pac:${p.id}`,'pac',p.id,{committee,cycle});
}
export const seedScope=c=>({cycle:c.cycle,congress:c.congress,session:c.session,year:c.year});
// A bundled seed lets a new database start from previously published snapshots instead of empty.
async function applySeed(db,seed) {
  const scope=JSON.stringify(seedScope(config));
  if(seed?.version!==1||JSON.stringify(seed.scope)!==scope||!Array.isArray(seed.jobs))return 0;
  // Roll calls in the seed hold the positions of the people configured when it was exported.
  for(const [chamber,value] of Object.entries(seed.voters||{}))await statement(db,'INSERT OR REPLACE INTO metadata(key,value) VALUES(?,?)',`voters-${chamber}`,value).run();
  for(const j of seed.jobs) {
    await addJob(db,j.id,j.kind,j.subject,j.args);
    // Seeded data keeps its original check date, so an old seed is refreshed promptly once keys are present.
    await db.batch([
      statement(db,"UPDATE jobs SET args=?,status='ready',last_success=?,checked_through=?,published_run=?,next_due=? WHERE id=?",JSON.stringify(j.args),j.lastSuccess,j.checkedThrough,j.run,nextRefresh(j.kind,Date.parse(j.lastSuccess),j.args),j.id),
      statement(db,'INSERT OR REPLACE INTO snapshots(job_id,run_id,payload,updated_at) VALUES(?,?,?,?)',j.id,j.run,JSON.stringify(j.snapshot),j.lastSuccess)
    ]);
  }
  return seed.jobs.length;
}
// The jobs the configured sources call for, and a signature of them: when a source, a person or a key bill is added,
// the signature changes and the missing jobs are added, without touching existing ones.
const feedJobs=()=>FEED_KINDS.flatMap(kind=>FEEDS[kind].jobs(config).map(j=>({...j,kind})));
const hash=text=>{let h=0;for(const c of text)h=(Math.imul(h,31)+c.charCodeAt(0))|0;return (h>>>0).toString(36);};
// Whose positions each chamber's roll calls record: Senate votes match people by LIS ID, House votes by Bioguide ID.
const voters=chamber=>hash(config.people.filter(p=>chamber==='S'?p.lis:p.bioguide&&p.chamber==='H').map(p=>p.id).sort().join('|'));
export const voterHashes=()=>({S:voters('S'),H:voters('H')});
export function feedSignature(){
  return `${FEEDS_VERSION}:${hash(FEEDS_VERSION+feedJobs().map(j=>FEEDS[j.kind].rerun?j.id+JSON.stringify(j.args):j.id).join('|')+'#'+voters('S')+voters('H'))}`;
}
// Each person's campaign, PAC, outside-spending and sponsored-bill jobs. Added again with the feed jobs, so a person
// added to the config later gets them in an existing database too.
async function addPerson(db,p,c){
  if(p.fecCmte)await addFinance(db,p,p.fecCmte,c.cycle);
  else if(p.fecCand)await addJob(db,`committee:${p.id}`,'committee',p.id,{candidate:p.fecCand,cycle:c.cycle});
  if(p.fecCand)await addJob(db,`outside:${p.id}`,'outside',p.id,{candidate:p.fecCand,cycle:c.cycle});
  if(p.bioguide)await addJob(db,`legislation:${p.id}`,'legislation',p.id,{bioguide:p.bioguide,congress:c.congress,cycle:c.cycle});
}
async function ensureFeeds(db){
  const v=await statement(db,"SELECT value FROM metadata WHERE key='feeds'").first(),sig=feedSignature();
  if(v?.value===sig)return;
  for(const p of config.people)await addPerson(db,p,config);
  for(const j of feedJobs()){
    await addJob(db,j.id,j.kind,j.subject,j.args);
    // A rerun source's job follows its settings: a change in data/config.json updates it and runs it again.
    if(FEEDS[j.kind].rerun){const args=JSON.stringify(j.args);await statement(db,"UPDATE jobs SET args=?,next_due=0 WHERE id=? AND args!=? AND status!='running'",args,j.id,args).run();}
  }
  // A roll call is read once, with the positions of the people configured then. When someone who votes in that chamber
  // is added (every senator, say), the roll calls already read are read again once, so their positions are filled in.
  for(const chamber of ['S','H']){
    const key=`voters-${chamber}`,now=voters(chamber),known=await statement(db,'SELECT value FROM metadata WHERE key=?',key).first();
    if(known?.value===now)continue;
    await statement(db,"UPDATE jobs SET next_due=0,status='pending' WHERE kind='vote' AND id LIKE ? AND last_success IS NOT NULL AND status!='running'",`vote:${chamber}:%`).run();
    await statement(db,'INSERT OR REPLACE INTO metadata(key,value) VALUES(?,?)',key,now).run();
  }
  await statement(db,"INSERT OR REPLACE INTO metadata(key,value) VALUES('feeds',?)",sig).run();
}
export async function initialize(db,seed=null) {
  // INSERT OR IGNORE preserves checkpoints and dates between restarts/deployments.
  const initialized=await statement(db,"SELECT value FROM metadata WHERE key='initialized'").first();
  if(initialized) return ensureFeeds(db);
  const c=config;
  await addJob(db,'senate-index','senate-index','Senate',{congress:c.congress,session:c.session});
  const house=c.selectedVotes.filter(v=>v.chamber==='H'&&v.year===c.year);
  const latest=Math.max(0,...house.map(v=>v.number));
  await addJob(db,'house-next','house-next','House',{year:c.year,number:latest+1});
  for(const v of [...c.selectedVotes].reverse())await addJob(db,`vote:${v.chamber}:${v.chamber==='H'?v.year:v.congress+':'+v.session}:${v.number}`,'vote',v.id,v);
  for(const p of c.people)await addPerson(db,p,c);
  if(seed&&await applySeed(db,seed))await statement(db,"INSERT OR REPLACE INTO metadata(key,value) VALUES('seeded',?)",seed.exportedAt).run();
  await ensureFeeds(db);
  await statement(db,"INSERT OR REPLACE INTO metadata(key,value) VALUES('initialized',?)",nowISO()).run();
}
function needsKey(kind,env){const h=hostOf(kind);return h?missingKey(h,env):null;}
const keyMessage=m=>m==='SEC contact line'?'SEC contact line needed (SEC_USER_AGENT)':m==='Threads'?'Threads access token needed (THREADS_ACCESS_TOKEN)':`${m} API key needed`;
// Jobs whose args are filled in when another job finishes (a person's top donor organizations, their outside spenders).
const chainContext=db=>({
  addJob:(id,kind,subject,args)=>addJob(db,id,kind,subject,args),
  async setArgs(id,patch){
    const job=await statement(db,'SELECT args FROM jobs WHERE id=?',id).first();if(!job)return;
    const args={...JSON.parse(job.args),...patch};if(JSON.stringify(args)===job.args)return;
    await statement(db,"UPDATE jobs SET args=?,next_due=0,status=CASE WHEN status='blocked' THEN status ELSE 'pending' END WHERE id=?",JSON.stringify(args),id).run();
  }
});
const AFTER={outside:async(snapshot,job,ctx)=>{
  const by=new Map();for(const r of snapshot.rows||[])by.set(r.name,(by.get(r.name)||0)+Math.abs(r.amount||0));
  await ctx.setArgs(`outside-groups:${job.subject}`,{groups:[...by].sort((a,b)=>b[1]-a[1]).slice(0,10).map(x=>x[0]).filter(Boolean)});
}};
// House roll calls from 2023 on come from Congress.gov's House vote endpoint when its key is set; otherwise, and for
// votes it does not cover yet, from the House Clerk.
async function fetchJob(job,env){
  const a=JSON.parse(job.args);
  if(FEEDS[job.kind])return FEEDS[job.kind].page(job,a,env,config);
  if(job.kind==='vote'&&a.chamber==='H'&&a.year>=2023&&env.CONGRESS_API_KEY){
    const d=await requestSource(houseApiURL(a),env,{allow404:true});
    if(d)return {rows:[{...normalizeHouseApiVote(d,a,config.people),source:`https://clerk.house.gov/Votes/${a.year}${a.number}`}],next:null};
  }
  return fetchPage(job,env,config);
}
const summarizeJob=(job,rows)=>FEEDS[job.kind]?(()=>{const s=FEEDS[job.kind].summarize(rows,JSON.parse(job.args),job,config);s.through=s.through||job.started_at.slice(0,10);return s;})():summarize(job,rows);
// steps: how many source pages one run fetches (the hosted worker's default stays small; the local server asks for more).
// Each source gets at most its perRun share of them, so a long queue for one source doesn't hold up the others, and a
// job that has started fetching pages finishes before new ones start, so its records are published sooner.
const perRun=host=>HOSTS[host]?.perRun??DEFAULT_PER_RUN;
export async function runRefresh(env,{steps=8}={}) {
  const db=env.DB;await initialize(db);
  const owner=crypto.randomUUID(),now=Date.now();
  const lock=await statement(db,"INSERT INTO locks (name,owner,expires_at) VALUES ('refresh',?,?) ON CONFLICT(name) DO UPDATE SET owner=excluded.owner,expires_at=excluded.expires_at WHERE locks.expires_at<? RETURNING owner",owner,now+5*60_000,now).first();
  if(lock?.owner!==owner)return {busy:true,processed:0};
  let processed=0;
  try {
    // Missing keys are a setup state. Do not consume the work budget retrying them.
    for(const kind of ALL_KINDS){
      const missing=needsKey(kind,env);
      if(missing)await statement(db,"UPDATE jobs SET status='blocked',error=? WHERE kind=? AND status!='blocked'",keyMessage(missing),kind).run();
      else await statement(db,"UPDATE jobs SET status='pending',error=NULL,next_due=0 WHERE status='blocked' AND kind=?",kind).run();
    }
    const used={};
    for(let step=0;step<Math.min(steps,200);step++) {
      const skip=ALL_KINDS.filter(k=>(used[hostOf(k)]||0)>=perRun(hostOf(k)));
      const job=await statement(db,`SELECT * FROM jobs WHERE status!='blocked' AND next_due<=?${skip.length?` AND kind NOT IN (${skip.map(()=>'?').join(',')})`:''} ORDER BY CASE WHEN cursor IS NULL THEN 1 ELSE 0 END, next_due, CASE kind WHEN 'senate-index' THEN 0 WHEN 'house-next' THEN 1 WHEN 'campaign' THEN 2 WHEN 'vote' THEN 3 ELSE 4 END, id LIMIT 1`,Date.now(),...skip).first();
      if(!job)break;
      if(needsKey(job.kind,env))continue;
      processed++;used[hostOf(job.kind)]=(used[hostOf(job.kind)]||0)+1;
      try {
        if(!job.run_id){job.run_id=crypto.randomUUID();job.started_at=nowISO();job.page=0;job.cursor=null;}
        await statement(db,"UPDATE jobs SET status='running',run_id=?,started_at=?,last_attempt=? WHERE id=?",job.run_id,job.started_at,nowISO(),job.id).run();
        if(job.page>=2000)throw new SourceError('Page limit exceeded; previous published data retained');
        const result=await fetchJob(job,env);
        const writes=result.rows.map(r=>statement(db,'INSERT OR REPLACE INTO records (run_id,id,payload) VALUES (?,?,?)',job.run_id,String(r.id),JSON.stringify(r)));
        for(let offset=0;offset<writes.length;offset+=80)await db.batch(writes.slice(offset,offset+80));
        if(result.next) {
          await statement(db,"UPDATE jobs SET cursor=?,page=page+1,status='pending',next_due=?,failures=0,error=NULL WHERE id=?",result.next,Date.now(),job.id).run();
          // New House votes are published individually; the discovery cursor continues on the next turn.
          if(job.kind==='house-next')for(const vote of result.rows)await registerHouse(db,vote,JSON.parse(job.args).year);
          continue;
        }
        const records=(await statement(db,'SELECT payload FROM records WHERE run_id=?',job.run_id).all()).results.map(r=>JSON.parse(r.payload));
        let snapshot=summarizeJob(job,records);
        if(FEEDS[job.kind]?.compare){const previous=await statement(db,'SELECT payload FROM snapshots WHERE job_id=?',job.id).first();FEEDS[job.kind].compare(previous&&JSON.parse(previous.payload),snapshot);}
        const completed=nowISO(),oldRun=job.published_run;
        const through=snapshot.end||snapshot.through||snapshot.date||null;
        // Snapshot publication and success stamp are atomic; unfinished pages are never served.
        await db.batch([
          statement(db,'INSERT INTO snapshots(job_id,run_id,payload,updated_at) VALUES(?,?,?,?) ON CONFLICT(job_id) DO UPDATE SET run_id=excluded.run_id,payload=excluded.payload,updated_at=excluded.updated_at',job.id,job.run_id,JSON.stringify(snapshot),completed),
          statement(db,"UPDATE jobs SET status='ready',last_success=?,checked_through=?,published_run=?,next_due=?,run_id=NULL,cursor=NULL,page=0,failures=0,error=NULL WHERE id=?",completed,through,job.run_id,snapshot.more?Date.now()+CATCH_UP:nextRefresh(job.kind,Date.now(),job.args),job.id),
          statement(db,'INSERT INTO refresh_history(job_id,status,at,message,row_count) VALUES(?,?,?,?,?)',job.id,'success',completed,'Validated and published',records.length)
        ]);
        if(oldRun&&oldRun!==job.run_id)await statement(db,'DELETE FROM records WHERE run_id=?',oldRun).run();
        if(job.kind==='committee'){const p=config.people.find(p=>p.id===job.subject);await addFinance(db,p,snapshot.committee,config.cycle);}
        if(job.kind==='senate-index')for(const v of snapshot.rows){const a=JSON.parse(job.args);await addJob(db,`vote:S:${a.congress}:${a.session}:${v.number}`,'vote',`s-${a.congress}-${a.session}-${v.number}`,{chamber:'S',...a,number:v.number});}
        const after=FEEDS[job.kind]?.after||AFTER[job.kind];if(after)await after(snapshot,job,chainContext(db));
        if(job.kind==='house-next'&&result.nextProbe)await statement(db,'UPDATE jobs SET args=? WHERE id=?',JSON.stringify({...JSON.parse(job.args),number:result.nextProbe}),job.id).run();
      }catch(error){
        // Never save upstream URLs or response bodies: they may contain API credentials.
        const message=error instanceof SourceError?error.message:'Source request or validation failed; previous data retained';
        const delay=Math.max(error.retryAfter||0,Math.min(DAY,60_000*2**Math.min(job.failures,10)));
        await db.batch([
          statement(db,"UPDATE jobs SET status='error',failures=failures+1,last_attempt=?,error=?,next_due=?,run_id=NULL,cursor=NULL,page=0 WHERE id=?",nowISO(),message,Date.now()+delay,job.id),
          statement(db,'INSERT INTO refresh_history(job_id,status,at,message) VALUES(?,?,?,?)',job.id,'error',nowISO(),message)
        ]);
        // 429 is a rate limit; a host's quota statuses mean its credits are used up, so it pauses for a day.
        const spent=HOSTS[hostOf(job.kind)]?.quota?.includes(error.statusCode);
        if(error.statusCode===429||spent){
          const until=Date.now()+Math.max(delay,error.retryAfter||(spent?DAY:60*60_000));
          // A limit applies to the whole host, so every job on that host waits.
          const host=hostOf(job.kind),kinds=ALL_KINDS.filter(k=>hostOf(k)===host);
          await statement(db,`UPDATE jobs SET next_due=MAX(next_due,?) WHERE kind IN (${kinds.map(()=>'?').join(',')})`,until,...kinds).run();
        }
        if(job.run_id){const published=await statement(db,'SELECT published_run FROM jobs WHERE id=?',job.id).first();if(published?.published_run!==job.run_id)await statement(db,'DELETE FROM records WHERE run_id=?',job.run_id).run();}
      }
    }
    await statement(db,'DELETE FROM refresh_history WHERE id NOT IN (SELECT id FROM refresh_history ORDER BY id DESC LIMIT 2000)').run();
    return {busy:false,processed};
  }finally {await statement(db,'DELETE FROM locks WHERE name=? AND owner=?','refresh',owner).run();}
}
async function registerHouse(db,vote,year) {await addJob(db,`vote:H:${year}:${vote.number}`,'vote',vote.id,{chamber:'H',year,number:vote.number});}

// Whether a job reads a website directly rather than an API. House roll calls from 2023 on come through Congress.gov's
// API when its key is set (see fetchJob).
const isSite=(j,env)=>j.kind==='vote'&&/^vote:H:/.test(j.id)&&Number(j.id.split(':')[2])>=2023&&env.CONGRESS_API_KEY?false:!!HOSTS[hostOf(j.kind)]?.site;
// Campaign and outside-money totals for everyone, in one request: the home cards of people without reviewed research
// (the basic senator profiles) show these instead of loading each full profile.
export async function getCards(env) {
  await initialize(env.DB);
  const rows=(await statement(env.DB,"SELECT j.subject,j.kind,s.payload FROM snapshots s JOIN jobs j ON j.id=s.job_id WHERE j.kind IN ('campaign','outside')").all()).results,people={};
  for(const r of rows){
    const d=JSON.parse(r.payload),o=people[r.subject]||={};
    if(r.kind==='campaign')o.campaign={receipts:d.receipts??null,cash:d.cash??null,start:d.start||null,end:d.end||null};
    else o.outside={support:d.support||0,oppose:d.oppose||0,through:d.through||null};
  }
  return {people};
}
export async function getStatus(env) {
  await initialize(env.DB);
  const jobs=(await statement(env.DB,'SELECT id,kind,subject,args,status,last_attempt,last_success,checked_through,error,failures,page FROM jobs ORDER BY kind,subject').all()).results;
  for(const j of jobs){const missing=needsKey(j.kind,env);if(missing){j.status='blocked';j.error=keyMessage(missing);}
    const every=everyOf(j.kind,j.args);delete j.args;
    j.stale=j.kind==='vote'||every===NEVER?!j.last_success:!j.last_success||Date.now()-Date.parse(j.last_success)>every*1.5;
    j.label=FEEDS[j.kind]?.label||null;j.tab=FEEDS[j.kind]?.tab||null;j.site=isSite(j,env);
    const who=config.people.find(p=>p.id===j.subject);j.name=who?.name||j.subject;j.person=!!who;
  }
  const keyNames=[...new Set(Object.values(HOSTS).flatMap(h=>[...(h.keys||[]),...(h.agent?[h.agent]:[])]))];
  return {generatedAt:nowISO(),local:env.LOCAL_MODE===true,reviewedAt:config.reviewedAt,cycle:config.cycle,keys:{fec:!!env.FEC_API_KEY,congress:!!env.CONGRESS_API_KEY,...Object.fromEntries(keyNames.map(k=>[k,!!env[k]]))},jobs,
    history:(await statement(env.DB,'SELECT job_id,status,at,message,row_count FROM refresh_history ORDER BY id DESC LIMIT 120').all()).results};
}
const GLOBAL_KINDS=FEED_KINDS.filter(k=>FEEDS[k].scope==='global');
// The lobbying counts for each key bill, for the Workers > Profit bill scores.
export async function getBills(env){
  const rows=(await statement(env.DB,"SELECT j.subject,s.payload,s.updated_at FROM snapshots s JOIN jobs j ON j.id=s.job_id WHERE j.kind='bill-lobbying'").all()).results;
  return {lobbying:Object.fromEntries(rows.map(r=>[r.subject,{...JSON.parse(r.payload),checkedAt:r.updated_at}]))};
}
// Global sources with one snapshot per day of the Record, hearing or meeting, each listing records by person: there are
// thousands of them back to historyFrom, so a profile reads only the ones that name the person.
const BY_PERSON=['crec-day','hearing','meeting'];
// Index jobs list what to read (days of the Record, hearings, meetings, key bills' lobbying); a profile doesn't use them.
const NOT_PROFILE=['meetings','crec-index','crec-archive','hearing-index','hearing-archive','bill-lobbying'];
const named=id=>`%"${String(id).replace(/[%_\\]/g,'')}":[%`;
// The meetings and transcripts that share a jacket number with this person's (the number in a transcript's GovInfo ID,
// which a meeting lists): a member's meeting can have a transcript that doesn't list them, and the other way round.
async function hearingPairs(db,meetings,transcripts){
  const jackets=[...new Set(meetings.flatMap(m=>m.transcripts||[]).filter(j=>/^\d+$/.test(j)))];
  const own=[...new Set(transcripts.map(t=>/[hsj]hrg(\d+)$/i.exec(t.id||'')?.[1]).filter(Boolean))];
  const out={meeting:[],hearing:[]},read=async(kind,clause,values)=>{
    for(let i=0;i<values.length;i+=80){const part=values.slice(i,i+80);
      const r=await statement(db,`SELECT s.payload FROM snapshots s JOIN jobs j ON j.id=s.job_id WHERE j.kind=? AND (${part.map(()=>clause).join(' OR ')})`,kind,...part).all();
      for(const x of r.results)out[kind].push(...Object.values(JSON.parse(x.payload).byPerson||{}).flat());}
  };
  await read('hearing','j.id LIKE ?',jackets.map(j=>`hearing:CHRG-%hrg${j}`));
  await read('meeting','s.payload LIKE ?',own.map(j=>`%"${j}"%`));
  const uniq=l=>[...new Map(l.map(r=>[r.id,r])).values()];
  return {meeting:uniq([...meetings,...out.meeting]),hearing:uniq([...transcripts,...out.hearing])};
}
export async function getProfile(env,id) {
  const person=config.people.find(p=>p.id===id);if(!person)return null;
  const kinds=['vote',...GLOBAL_KINDS.filter(k=>!BY_PERSON.includes(k)&&!NOT_PROFILE.includes(k))];
  const rows=(await statement(env.DB,`SELECT s.job_id,s.payload,s.updated_at,j.kind,j.subject FROM snapshots s JOIN jobs j ON j.id=s.job_id WHERE j.subject=? OR j.kind IN (${kinds.map(()=>'?').join(',')}) OR (j.kind IN (${BY_PERSON.map(()=>'?').join(',')}) AND s.payload LIKE ?)`,id,...kinds,...BY_PERSON,named(id)).all()).results;
  const sections={},votes=[],global={};
  for(const row of rows){
    const data=JSON.parse(row.payload);
    if(row.kind==='vote'){if(data.positions[id])votes.push({...data,position:data.positions[id],checkedAt:row.updated_at});continue;}
    if(GLOBAL_KINDS.includes(row.kind)){
      (global[row.kind]||=[]).push(data);
      // Global sources list each person's records separately; several jobs of one kind (daily Record issues) add up.
      if(data.byPerson?.[id]){const s=sections[row.kind]||={rows:[],checkedAt:row.updated_at};s.rows.push(...data.byPerson[id]);if(row.updated_at>s.checkedAt)s.checkedAt=row.updated_at;}
      continue;
    }
    if(row.subject===id)sections[row.kind]={...data,checkedAt:row.updated_at};
  }
  for(const s of Object.values(sections))if(Array.isArray(s.rows)&&s.rows.every(r=>r&&r.date!==undefined))s.rows.sort((a,b)=>String(b.date||'').localeCompare(String(a.date||'')));
  const pairs=sections.meeting||sections.hearing?await hearingPairs(env.DB,sections.meeting?.rows||[],sections.hearing?.rows||[]):{meeting:[],hearing:[]};
  // Ten years of floor speeches can run to thousands: the newest 40 of each year are sent, with every year's count.
  for(const k of BY_PERSON)if(sections[k]){const h=history(sections[k].rows,40);sections[k]={...sections[k],...h};}
  votes.sort((a,b)=>b.date.localeCompare(a.date)||b.number-a.number);
  // Merged views: one row per trade, state bill and article, whichever sources reported it.
  // The official reports first, so their descriptions and dates win; then the three services.
  const official=['trades-house','trades-senate'].filter(k=>sections[k]);
  const tradeLists=[...official,'trades-bargo','trades-eulerpool','trades-fmp'].map(k=>sections[k]?.rows).filter(Boolean);
  const merged={};
  if(tradeLists.length)merged.trades=mergeTrades(tradeLists,sections['house-fd']?.rows||[],global['sec-sic']?.[0]?.byTicker||{},{officialFrom:official.length?`${SINCE(config)}-01-01`:null}).slice(0,1500);
  // Official reports that couldn't be read (filed on paper, or no text), for review by hand.
  merged.tradesUnread=official.flatMap(k=>sections[k].unread||[]);
  if(sections['state-openstates']||sections['state-legiscan'])merged.stateBills=mergeStateBills(sections['state-openstates']?.rows,sections['state-legiscan']?.rows).slice(0,150);
  // The newest 40 articles, then up to 10 from each earlier year.
  if(sections['news-gdelt']||sections['news-nyt']){const all=mergeNews(sections['news-gdelt']?.rows,sections['news-nyt']?.rows);merged.news=[...all.slice(0,40),...history(all.slice(40),10).rows];}
  const lists=sections['senate-committees']||sections['house-committees'];
  if(lists)merged.committees={rows:lists.rows,checkedAt:lists.checkedAt,...committeeDiff(lists.rows,COMMITTEES.people[id]||[])};
  // Bills they sponsored or cosponsored from historyFrom on (the snapshots list every bill, past the rows they show).
  const theirBills=new Set([...(sections.legislation?.rows||[]),...(sections.cosponsored?.rows||[])].map(r=>r.bill||String(r.id).toLowerCase()).concat(sections.legislation?.bills||[],sections.cosponsored?.bills||[]));
  merged.crs=(global.crs||[]).flatMap(c=>Object.entries(c.byBill||{}).filter(([b])=>theirBills.has(b)).flatMap(([b,list])=>list.map(r=>({...r,bill:b})))).sort((a,b)=>String(b.date||'').localeCompare(String(a.date||''))).slice(0,60);
  // Foreign-agent registrants whose name matches one of this person's top donor organizations.
  const norm=v=>String(v||'').toLowerCase().replace(/[^a-z0-9]/g,'').replace(/(inc|llc|corp|corporation|co|company|lp|llp)$/,'');
  const orgs=new Set((sections.donors?.orgs||[]).slice(0,20).map(o=>norm(o.employer)));
  merged.fara=(global.fara?.[0]?.rows||[]).filter(r=>orgs.has(norm(r.name))||orgs.has(norm(r.business)));
  // Sources that cover the same thing, joined: each fills in what the others don't have yet (see src/merge.mjs).
  if(sections.meeting||sections.hearing){const all=mergeHearings({meetings:sections.meeting?.rows||[],transcripts:sections.hearing?.rows||[]},{allMeetings:pairs.meeting,allTranscripts:pairs.hearing},id);merged.hearings=[...all.slice(0,30),...history(all.slice(30),15).rows];}
  if(sections.courts||sections['fec-legal']||sections.doj)merged.legal=mergeLegal(sections.courts?.rows,sections['fec-legal']?.rows,sections.doj?.rows).slice(0,60);
  if(sections.press||sections.bluesky||sections.threads||sections.youtube)merged.statements={rows:mergeStatements({press:sections.press?.rows,bluesky:sections.bluesky?.rows,threads:sections.threads?.rows,youtube:sections.youtube?.rows}).slice(0,80),
    feed:sections.press?.feed||null,accounts:sections.bluesky?.accounts||[],missing:sections.bluesky?.missing||[]};
  merged.donorOrgs=donorOrgs(sections,global.fara?.length?merged.fara:null);
  const bills=Object.fromEntries((await statement(env.DB,"SELECT j.subject,s.payload FROM snapshots s JOIN jobs j ON j.id=s.job_id WHERE j.kind='bill'").all()).results.map(r=>[r.subject,JSON.parse(r.payload)]));
  return {person,sections,merged,bills,votes:votes.slice(0,60),voteScope:'Selected historical votes and the latest discovered roll calls. New votes do not change reviewed alignment scores.'};
}
