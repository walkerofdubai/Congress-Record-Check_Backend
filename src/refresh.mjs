import config from '../data/config.json' with {type:'json'};
import {diffPlatform,fetchPage,govinfoKey,summarize,SourceError} from './sources.mjs';

const DAY=86400000;
// A recorded roll call or Congressional Record section does not change, so once published it is never fetched again.
const NEVER=Number.MAX_SAFE_INTEGER;
const FINAL=['vote','crec-package','speech'];
// Campaign sites are searched and crawled monthly to stay within Tavily's free monthly credits.
const INTERVAL={committee:7*DAY,'campaign-site':30*DAY,platform:30*DAY};
const nextRefresh=(kind,from=Date.now())=>FINAL.includes(kind)?NEVER:from+(INTERVAL[kind]||DAY);
const FEC_KINDS=['campaign','committee','pac','outside'],GOVINFO_KINDS=['crec-index','crec-package'],TAVILY_KINDS=['campaign-site','platform'];
// Jobs sharing an API key: blocked together without it, and paused together when that source rate-limits.
// Released FEC and Congress.gov jobs run first (due 0), as before; others queue behind sources already due.
const KEYED=[
  {kinds:FEC_KINDS,label:'FEC',has:e=>!!e.FEC_API_KEY,first:true},
  {kinds:['legislation'],label:'Congress.gov',has:e=>!!e.CONGRESS_API_KEY,first:true},
  {kinds:GOVINFO_KINDS,label:'Congress.gov',has:e=>!!govinfoKey(e),also:['speech']},
  {kinds:TAVILY_KINDS,label:'Tavily',has:e=>!!e.TAVILY_API_KEY}
];
const kindList=kinds=>kinds.map(k=>`'${k}'`).join(',');
// Detail jobs are listed as one aggregate row on the Updates screen; there can be thousands.
const AGGREGATED={'crec-package':'Congressional Record issues','speech':'Congressional Record speeches'};
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
  for(const j of seed.jobs) {
    await addJob(db,j.id,j.kind,j.subject,j.args);
    // Seeded data keeps its original check date, so an old seed is refreshed promptly once keys are present.
    await db.batch([
      statement(db,"UPDATE jobs SET args=?,status='ready',last_success=?,checked_through=?,published_run=?,next_due=? WHERE id=?",JSON.stringify(j.args),j.lastSuccess,j.checkedThrough,j.run,nextRefresh(j.kind,Date.parse(j.lastSuccess)),j.id),
      statement(db,'INSERT OR REPLACE INTO snapshots(job_id,run_id,payload,updated_at) VALUES(?,?,?,?)',j.id,j.run,JSON.stringify(j.snapshot),j.lastSuccess)
    ]);
  }
  return seed.jobs.length;
}
export async function initialize(db,seed=null) {
  // INSERT OR IGNORE preserves checkpoints and dates between restarts/deployments.
  const c=config;
  // Added outside the first-run block so databases created before these sources existed also get them.
  await addJob(db,'crec-index','crec-index','Congress',{start:`${c.cycle-1}-01-01`,congress:c.congress});
  for(const p of c.people){
    // A campaignSite set in data/config.json confirms or corrects the searched site; changing it reruns the job.
    const args=JSON.stringify({name:p.name,chamber:p.chamber,state:p.state,override:p.campaignSite||null});
    await addJob(db,`campaign-site:${p.id}`,'campaign-site',p.id,JSON.parse(args),Date.now());
    await statement(db,"UPDATE jobs SET args=?,next_due=? WHERE id=? AND args!=? AND status!='running'",args,Date.now(),`campaign-site:${p.id}`,args).run();
  }
  const initialized=await statement(db,"SELECT value FROM metadata WHERE key='initialized'").first();
  if(initialized) return;
  await addJob(db,'senate-index','senate-index','Senate',{congress:c.congress,session:c.session});
  const house=c.selectedVotes.filter(v=>v.chamber==='H'&&v.year===c.year);
  const latest=Math.max(0,...house.map(v=>v.number));
  await addJob(db,'house-next','house-next','House',{year:c.year,number:latest+1});
  for(const v of [...c.selectedVotes].reverse())await addJob(db,`vote:${v.chamber}:${v.chamber==='H'?v.year:v.congress+':'+v.session}:${v.number}`,'vote',v.id,v);
  for(const p of c.people){
    if(p.fecCmte)await addFinance(db,p,p.fecCmte,c.cycle);
    else if(p.fecCand)await addJob(db,`committee:${p.id}`,'committee',p.id,{candidate:p.fecCand,cycle:c.cycle});
    if(p.fecCand)await addJob(db,`outside:${p.id}`,'outside',p.id,{candidate:p.fecCand,cycle:c.cycle});
    if(p.bioguide)await addJob(db,`legislation:${p.id}`,'legislation',p.id,{bioguide:p.bioguide,congress:c.congress,cycle:c.cycle});
  }
  if(seed&&await applySeed(db,seed))await statement(db,"INSERT OR REPLACE INTO metadata(key,value) VALUES('seeded',?)",seed.exportedAt).run();
  await statement(db,"INSERT OR REPLACE INTO metadata(key,value) VALUES('initialized',?)",nowISO()).run();
}
function needsKey(kind,env){return KEYED.find(k=>k.kinds.includes(kind)&&!k.has(env))?.label||null;}
// Discovery jobs queue their detail jobs as pages arrive. Detail jobs are due now, not at time zero,
// so a large backfill waits its turn behind sources that were already due.
async function register(db,job,rows) {
  if(job.kind==='house-next')for(const vote of rows)await registerHouse(db,vote,JSON.parse(job.args).year);
  if(job.kind==='crec-index')for(const p of rows){
    const args=JSON.stringify({package:p.id,date:p.date,lastModified:p.lastModified});
    await addJob(db,`crec-package:${p.id}`,'crec-package',p.id,JSON.parse(args),Date.now());
    // A revised daily issue is read again for sections that were added or newly attributed.
    await statement(db,"UPDATE jobs SET args=?,next_due=? WHERE id=? AND json_extract(args,'$.lastModified') IS NOT ? AND status!='running'",args,Date.now(),`crec-package:${p.id}`,p.lastModified).run();
  }
}
export async function runRefresh(env,{steps=8}={}) {
  const db=env.DB;await initialize(db);
  const owner=crypto.randomUUID(),now=Date.now();
  const lock=await statement(db,"INSERT INTO locks (name,owner,expires_at) VALUES ('refresh',?,?) ON CONFLICT(name) DO UPDATE SET owner=excluded.owner,expires_at=excluded.expires_at WHERE locks.expires_at<? RETURNING owner",owner,now+5*60_000,now).first();
  if(lock?.owner!==owner)return {busy:true,processed:0};
  let processed=0;
  try {
    // Missing keys are a setup state. Do not consume the work budget retrying them.
    for(const k of KEYED){
      if(!k.has(env))await statement(db,`UPDATE jobs SET status='blocked',error=? WHERE kind IN (${kindList(k.kinds)}) AND status!='blocked'`,`${k.label} API key needed`).run();
      else await statement(db,`UPDATE jobs SET status='pending',error=NULL,next_due=? WHERE status='blocked' AND kind IN (${kindList(k.kinds)})`,k.first?0:Date.now()).run();
    }
    for(let step=0;step<Math.min(steps,8);step++) {
      const job=await statement(db,"SELECT * FROM jobs WHERE status!='blocked' AND next_due<=? ORDER BY next_due, CASE kind WHEN 'senate-index' THEN 0 WHEN 'house-next' THEN 1 WHEN 'campaign' THEN 2 WHEN 'vote' THEN 3 ELSE 4 END, id LIMIT 1",Date.now()).first();
      if(!job)break;
      if(needsKey(job.kind,env))continue;
      processed++;
      try {
        if(!job.run_id){job.run_id=crypto.randomUUID();job.started_at=nowISO();job.page=0;job.cursor=null;}
        await statement(db,"UPDATE jobs SET status='running',run_id=?,started_at=?,last_attempt=? WHERE id=?",job.run_id,job.started_at,nowISO(),job.id).run();
        if(job.page>=2000)throw new SourceError('Page limit exceeded; previous published data retained');
        const result=await fetchPage(job,env,config);
        const writes=result.rows.map(r=>statement(db,'INSERT OR REPLACE INTO records (run_id,id,payload) VALUES (?,?,?)',job.run_id,String(r.id),JSON.stringify(r)));
        for(let offset=0;offset<writes.length;offset+=80)await db.batch(writes.slice(offset,offset+80));
        // Discovered votes and Record issues are published individually; the discovery cursor continues on the next turn.
        await register(db,job,result.rows);
        if(result.next) {
          await statement(db,"UPDATE jobs SET cursor=?,page=page+1,status='pending',next_due=?,failures=0,error=NULL WHERE id=?",result.next,Date.now(),job.id).run();
          continue;
        }
        const records=(await statement(db,'SELECT payload FROM records WHERE run_id=?',job.run_id).all()).results.map(r=>JSON.parse(r.payload));
        let snapshot=summarize(job,records);
        if(job.kind==='platform'){
          const previous=await statement(db,'SELECT payload FROM snapshots WHERE job_id=?',job.id).first();
          snapshot.changes=diffPlatform(previous&&JSON.parse(previous.payload),snapshot.sections);snapshot.credits=result.credits;
        }
        const completed=nowISO(),oldRun=job.published_run;
        const through=snapshot.end||snapshot.through||snapshot.date||null;
        // Snapshot publication and success stamp are atomic; unfinished pages are never served.
        await db.batch([
          statement(db,'INSERT INTO snapshots(job_id,run_id,payload,updated_at) VALUES(?,?,?,?) ON CONFLICT(job_id) DO UPDATE SET run_id=excluded.run_id,payload=excluded.payload,updated_at=excluded.updated_at',job.id,job.run_id,JSON.stringify(snapshot),completed),
          statement(db,"UPDATE jobs SET status='ready',last_success=?,checked_through=?,published_run=?,next_due=?,run_id=NULL,cursor=NULL,page=0,failures=0,error=NULL WHERE id=?",completed,through,job.run_id,nextRefresh(job.kind),job.id),
          statement(db,'INSERT INTO refresh_history(job_id,status,at,message,row_count) VALUES(?,?,?,?,?)',job.id,'success',completed,'Validated and published',records.length)
        ]);
        if(oldRun&&oldRun!==job.run_id)await statement(db,'DELETE FROM records WHERE run_id=?',oldRun).run();
        if(job.kind==='committee'){const p=config.people.find(p=>p.id===job.subject);await addFinance(db,p,snapshot.committee,config.cycle);}
        if(job.kind==='senate-index')for(const v of snapshot.rows){const a=JSON.parse(job.args);await addJob(db,`vote:S:${a.congress}:${a.session}:${v.number}`,'vote',`s-${a.congress}-${a.session}-${v.number}`,{chamber:'S',...a,number:v.number});}
        if(job.kind==='house-next'&&result.nextProbe)await statement(db,'UPDATE jobs SET args=? WHERE id=?',JSON.stringify({...JSON.parse(job.args),number:result.nextProbe}),job.id).run();
        // The next listing starts two days before this check began, overlapping in case of publication lag.
        if(job.kind==='crec-index')await statement(db,'UPDATE jobs SET args=? WHERE id=?',JSON.stringify({...JSON.parse(job.args),since:new Date(Date.parse(job.started_at)-2*DAY).toISOString().slice(0,10)}),job.id).run();
        if(job.kind==='crec-package')for(const g of snapshot.rows)await addJob(db,`speech:${g.id}`,'speech',g.id,{package:g.package,granule:g.id,date:g.date,title:g.title,chamber:g.chamber,speakers:g.speakers},Date.now());
        // Only an accepted site is crawled. A different accepted site replaces the crawl target and recrawls now.
        if(job.kind==='campaign-site'&&snapshot.site){const args=JSON.stringify({site:snapshot.site});
          await addJob(db,`platform:${job.subject}`,'platform',job.subject,{site:snapshot.site},Date.now());
          await statement(db,"UPDATE jobs SET args=?,next_due=? WHERE id=? AND args!=? AND status!='running'",args,Date.now(),`platform:${job.subject}`,args).run();}
      }catch(error){
        // Never save upstream URLs or response bodies: they may contain API credentials.
        const message=error instanceof SourceError?error.message:'Source request or validation failed; previous data retained';
        const delay=Math.max(error.retryAfter||0,Math.min(DAY,60_000*2**Math.min(job.failures,10)));
        await db.batch([
          statement(db,"UPDATE jobs SET status='error',failures=failures+1,last_attempt=?,error=?,next_due=?,run_id=NULL,cursor=NULL,page=0 WHERE id=?",nowISO(),message,Date.now()+delay,job.id),
          statement(db,'INSERT INTO refresh_history(job_id,status,at,message) VALUES(?,?,?,?)',job.id,'error',nowISO(),message)
        ]);
        // 429 is a rate limit. Tavily's 432/433 mean the plan's or pay-as-you-go credits are used up: pause for a day.
        const group=KEYED.find(k=>k.kinds.includes(job.kind)||k.also?.includes(job.kind));
        if(group&&(error.statusCode===429||TAVILY_KINDS.includes(job.kind)&&[432,433].includes(error.statusCode))){
          const until=Date.now()+Math.max(delay,error.retryAfter||(error.statusCode===429?60*60_000:DAY));
          await statement(db,`UPDATE jobs SET next_due=MAX(next_due,?) WHERE kind IN (${kindList([...group.kinds,...group.also||[]])})`,until).run();
        }
        if(job.run_id){const published=await statement(db,'SELECT published_run FROM jobs WHERE id=?',job.id).first();if(published?.published_run!==job.run_id)await statement(db,'DELETE FROM records WHERE run_id=?',job.run_id).run();}
      }
    }
    await statement(db,'DELETE FROM refresh_history WHERE id NOT IN (SELECT id FROM refresh_history ORDER BY id DESC LIMIT 2000)').run();
    return {busy:false,processed};
  }finally {await statement(db,'DELETE FROM locks WHERE name=? AND owner=?','refresh',owner).run();}
}
async function registerHouse(db,vote,year) {await addJob(db,`vote:H:${year}:${vote.number}`,'vote',vote.id,{chamber:'H',year,number:vote.number});}

export async function getStatus(env) {
  await initialize(env.DB);
  const kinds=Object.keys(AGGREGATED).map(k=>`'${k}'`).join(',');
  const jobs=(await statement(env.DB,`SELECT id,kind,subject,status,last_attempt,last_success,checked_through,error,failures,page FROM jobs WHERE kind NOT IN (${kinds}) ORDER BY kind,subject`).all()).results;
  const groups=(await statement(env.DB,`SELECT kind,COUNT(*) total,SUM(status='ready') ready,SUM(status='error') errors,SUM(status='blocked') blocked,MAX(last_success) last_success,MAX(checked_through) checked_through,MAX(last_attempt) last_attempt FROM jobs WHERE kind IN (${kinds}) GROUP BY kind`).all()).results;
  for(const g of groups)jobs.push({id:g.kind,kind:g.kind,subject:AGGREGATED[g.kind],aggregate:true,status:g.blocked?'blocked':g.errors?'error':g.ready<g.total?'pending':'ready',
    error:g.errors?`${g.errors} of ${g.total} retrying`:null,last_success:g.last_success,checked_through:g.checked_through,last_attempt:g.last_attempt,page:0,failures:0,
    name:`${AGGREGATED[g.kind]}: ${g.ready} of ${g.total} saved`});
  for(const j of jobs){const missing=needsKey(j.kind,env);if(missing){j.status='blocked';j.error=`${missing} API key needed`;}
    j.stale=FINAL.includes(j.kind)?!j.last_success:!j.last_success||Date.now()-Date.parse(j.last_success)>36*60*60_000;
    j.name??=config.people.find(p=>p.id===j.subject)?.name||j.subject;
  }
  return {generatedAt:nowISO(),local:env.LOCAL_MODE===true,reviewedAt:config.reviewedAt,cycle:config.cycle,keys:{fec:!!env.FEC_API_KEY,congress:!!env.CONGRESS_API_KEY,tavily:!!env.TAVILY_API_KEY},jobs,
    history:(await statement(env.DB,'SELECT job_id,status,at,message,row_count FROM refresh_history ORDER BY id DESC LIMIT 60').all()).results};
}
export async function getProfile(env,id) {
  const person=config.people.find(p=>p.id===id);if(!person)return null;
  const rows=(await statement(env.DB,'SELECT s.job_id,s.payload,s.updated_at,j.kind,j.subject FROM snapshots s JOIN jobs j ON j.id=s.job_id WHERE j.subject=? OR j.kind=\'vote\'',id).all()).results;
  const sections={},votes=[];
  for(const row of rows){const data=JSON.parse(row.payload);if(row.kind==='vote'){if(data.positions[id])votes.push({...data,position:data.positions[id],checkedAt:row.updated_at});}else sections[row.kind]={...data,checkedAt:row.updated_at};}
  votes.sort((a,b)=>b.date.localeCompare(a.date)||b.number-a.number);
  // Speech text can be long, so the profile carries excerpts; the full text stays in the saved snapshot.
  const path=`$.speakers."${id}"`;
  const speeches=(await statement(env.DB,`SELECT json_extract(s.payload,'$.date') date,json_extract(s.payload,'$.title') title,json_extract(s.payload,'$.chamber') chamber,json_extract(s.payload,'$.source') source,
    json_extract(s.payload,?) matched,substr(json_extract(s.payload,?),1,400) excerpt FROM snapshots s JOIN jobs j ON j.id=s.job_id WHERE j.kind='speech' AND json_extract(s.payload,?) IS NOT NULL ORDER BY date DESC,s.job_id DESC LIMIT 30`,path+'.matched',path+'.text',path).all()).results;
  const speechCount=(await statement(env.DB,"SELECT COUNT(*) n FROM snapshots s JOIN jobs j ON j.id=s.job_id WHERE j.kind='speech' AND json_extract(s.payload,?) IS NOT NULL",path).first()).n;
  return {person,sections,votes:votes.slice(0,60),voteScope:'Selected historical votes and the latest discovered roll calls. New votes do not change reviewed alignment scores.',
    speeches:speeches.map(s=>({...s,matched:!!s.matched})),speechCount,speechScope:'Congressional Record floor remarks and extensions of remarks since the start of the current cycle. Not reviewed, and not classified by issue.'};
}
