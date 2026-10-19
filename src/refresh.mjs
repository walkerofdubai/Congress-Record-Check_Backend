import config from '../data/config.json' with {type:'json'};
import {fetchPage,summarize,SourceError} from './sources.mjs';

const DAY=86400000;
const nowISO=()=>new Date().toISOString();
export const statement=(db,sql,...args)=>db.prepare(sql).bind(...args);
export async function addJob(db,id,kind,subject,args,due=0) {
  await statement(db,'INSERT OR IGNORE INTO jobs (id,kind,subject,args,next_due) VALUES (?,?,?,?,?)',id,kind,subject,JSON.stringify(args),due).run();
}
async function addFinance(db,p,committee,cycle) {
  await addJob(db,`campaign:${p.id}`,'campaign',p.id,{committee,cycle});
  await addJob(db,`pac:${p.id}`,'pac',p.id,{committee,cycle});
}
export async function initialize(db) {
  // INSERT OR IGNORE preserves checkpoints and dates between restarts/deployments.
  const initialized=await statement(db,"SELECT value FROM metadata WHERE key='initialized'").first();
  if(initialized) return;
  const c=config;
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
  await statement(db,"INSERT OR REPLACE INTO metadata(key,value) VALUES('initialized',?)",nowISO()).run();
}
function needsKey(kind,env){return ['campaign','committee','pac','outside'].includes(kind)&&!env.FEC_API_KEY?'FEC':kind==='legislation'&&!env.CONGRESS_API_KEY?'Congress.gov':null;}
export async function runRefresh(env,{steps=8}={}) {
  const db=env.DB;await initialize(db);
  const owner=crypto.randomUUID(),now=Date.now();
  const lock=await statement(db,"INSERT INTO locks (name,owner,expires_at) VALUES ('refresh',?,?) ON CONFLICT(name) DO UPDATE SET owner=excluded.owner,expires_at=excluded.expires_at WHERE locks.expires_at<? RETURNING owner",owner,now+5*60_000,now).first();
  if(lock?.owner!==owner)return {busy:true,processed:0};
  let processed=0;
  try {
    // Missing keys are a setup state. Do not consume the work budget retrying them.
    await statement(db,"UPDATE jobs SET status='blocked',error='FEC API key needed' WHERE kind IN ('campaign','committee','pac','outside') AND status!='blocked' AND ?=0",env.FEC_API_KEY?1:0).run();
    await statement(db,"UPDATE jobs SET status='blocked',error='Congress.gov API key needed' WHERE kind='legislation' AND status!='blocked' AND ?=0",env.CONGRESS_API_KEY?1:0).run();
    if(env.FEC_API_KEY)await statement(db,"UPDATE jobs SET status='pending',error=NULL,next_due=0 WHERE status='blocked' AND kind IN ('campaign','committee','pac','outside')").run();
    if(env.CONGRESS_API_KEY)await statement(db,"UPDATE jobs SET status='pending',error=NULL,next_due=0 WHERE status='blocked' AND kind='legislation'").run();
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
        if(result.next) {
          await statement(db,"UPDATE jobs SET cursor=?,page=page+1,status='pending',next_due=?,failures=0,error=NULL WHERE id=?",result.next,Date.now(),job.id).run();
          // New House votes are published individually; the discovery cursor continues on the next turn.
          if(job.kind==='house-next')for(const vote of result.rows)await registerHouse(db,vote,JSON.parse(job.args).year);
          continue;
        }
        const records=(await statement(db,'SELECT payload FROM records WHERE run_id=?',job.run_id).all()).results.map(r=>JSON.parse(r.payload));
        let snapshot=summarize(job,records);
        const completed=nowISO(),oldRun=job.published_run;
        const through=snapshot.end||snapshot.through||snapshot.date||null;
        // Snapshot publication and success stamp are atomic; unfinished pages are never served.
        await db.batch([
          statement(db,'INSERT INTO snapshots(job_id,run_id,payload,updated_at) VALUES(?,?,?,?) ON CONFLICT(job_id) DO UPDATE SET run_id=excluded.run_id,payload=excluded.payload,updated_at=excluded.updated_at',job.id,job.run_id,JSON.stringify(snapshot),completed),
          statement(db,"UPDATE jobs SET status='ready',last_success=?,checked_through=?,published_run=?,next_due=?,run_id=NULL,cursor=NULL,page=0,failures=0,error=NULL WHERE id=?",completed,through,job.run_id,Date.now()+(job.kind==='committee'?7*DAY:DAY),job.id),
          statement(db,'INSERT INTO refresh_history(job_id,status,at,message,row_count) VALUES(?,?,?,?,?)',job.id,'success',completed,'Validated and published',records.length)
        ]);
        if(oldRun&&oldRun!==job.run_id)await statement(db,'DELETE FROM records WHERE run_id=?',oldRun).run();
        if(job.kind==='committee'){const p=config.people.find(p=>p.id===job.subject);await addFinance(db,p,snapshot.committee,config.cycle);}
        if(job.kind==='senate-index')for(const v of snapshot.rows){const a=JSON.parse(job.args);await addJob(db,`vote:S:${a.congress}:${a.session}:${v.number}`,'vote',`s-${a.congress}-${a.session}-${v.number}`,{chamber:'S',...a,number:v.number});}
        if(job.kind==='house-next'&&result.nextProbe)await statement(db,'UPDATE jobs SET args=? WHERE id=?',JSON.stringify({...JSON.parse(job.args),number:result.nextProbe}),job.id).run();
      }catch(error){
        // Never save upstream URLs or response bodies: they may contain API credentials.
        const message=error instanceof SourceError?error.message:'Source request or validation failed; previous data retained';
        const delay=Math.max(error.retryAfter||0,Math.min(DAY,60_000*2**Math.min(job.failures,10)));
        await db.batch([
          statement(db,"UPDATE jobs SET status='error',failures=failures+1,last_attempt=?,error=?,next_due=?,run_id=NULL,cursor=NULL,page=0 WHERE id=?",nowISO(),message,Date.now()+delay,job.id),
          statement(db,'INSERT INTO refresh_history(job_id,status,at,message) VALUES(?,?,?,?)',job.id,'error',nowISO(),message)
        ]);
        if(error.statusCode===429){
          const until=Date.now()+Math.max(delay,error.retryAfter||60*60_000);
          if(['campaign','committee','pac','outside'].includes(job.kind))await statement(db,"UPDATE jobs SET next_due=MAX(next_due,?) WHERE kind IN ('campaign','committee','pac','outside')",until).run();
          else if(job.kind==='legislation')await statement(db,"UPDATE jobs SET next_due=MAX(next_due,?) WHERE kind='legislation'",until).run();
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
  const jobs=(await statement(env.DB,'SELECT id,kind,subject,status,last_attempt,last_success,checked_through,error,failures,page FROM jobs ORDER BY kind,subject').all()).results;
  for(const j of jobs){const missing=needsKey(j.kind,env);if(missing){j.status='blocked';j.error=`${missing} API key needed`;}
    j.stale=!j.last_success||Date.now()-Date.parse(j.last_success)>36*60*60_000;
    j.name=config.people.find(p=>p.id===j.subject)?.name||j.subject;
  }
  return {generatedAt:nowISO(),local:env.LOCAL_MODE===true,reviewedAt:config.reviewedAt,cycle:config.cycle,keys:{fec:!!env.FEC_API_KEY,congress:!!env.CONGRESS_API_KEY},jobs,
    history:(await statement(env.DB,'SELECT job_id,status,at,message,row_count FROM refresh_history ORDER BY id DESC LIMIT 60').all()).results};
}
export async function getProfile(env,id) {
  const person=config.people.find(p=>p.id===id);if(!person)return null;
  const rows=(await statement(env.DB,'SELECT s.job_id,s.payload,s.updated_at,j.kind,j.subject FROM snapshots s JOIN jobs j ON j.id=s.job_id WHERE j.subject=? OR j.kind=\'vote\'',id).all()).results;
  const sections={},votes=[];
  for(const row of rows){const data=JSON.parse(row.payload);if(row.kind==='vote'){if(data.positions[id])votes.push({...data,position:data.positions[id],checkedAt:row.updated_at});}else sections[row.kind]={...data,checkedAt:row.updated_at};}
  votes.sort((a,b)=>b.date.localeCompare(a.date)||b.number-a.number);
  return {person,sections,votes:votes.slice(0,60),voteScope:'Selected historical votes and the latest discovered roll calls. New votes do not change reviewed alignment scores.'};
}
