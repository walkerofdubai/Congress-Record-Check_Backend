import {getStatus,getProfile,runRefresh,statement} from './refresh.mjs';
const headers={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers});
export default {
  async fetch(request,env,ctx){
    const url=new URL(request.url);
    try{
      if(url.pathname==='/api/status'&&request.method==='GET')return json(await getStatus(env));
      if(url.pathname==='/api/profile'&&request.method==='GET') {const data=await getProfile(env,url.searchParams.get('id'));return data?json(data):json({error:'Profile not found'},404);}
      if(url.pathname==='/api/refresh'&&request.method==='POST'){
        if(env.LOCAL_MODE!==true)return json({error:'Manual refresh is available only in the local application. Hosted refreshes use the schedule.'},403);
        if(request.headers.get('Origin')!==url.origin||request.headers.get('X-Requested-With')!=='CongressRecordCheck')return json({error:'Same-origin request required'},403);
        return json(await runRefresh(env,{steps:8}));
      }
      if(url.pathname==='/api/records'&&request.method==='GET'){
        const id=url.searchParams.get('job'),offset=Math.max(0,Math.min(1_000_000,Number(url.searchParams.get('offset'))||0));
        const job=await statement(env.DB,'SELECT published_run FROM jobs WHERE id=?',id||'').first();if(!job?.published_run)return json({error:'No published records'},404);
        if(url.searchParams.has('version')&&url.searchParams.get('version')!==job.published_run)return json({error:'Records were refreshed. Restart pagination at offset 0.'},409);
        const rows=(await statement(env.DB,'SELECT payload FROM records WHERE run_id=? ORDER BY id LIMIT 100 OFFSET ?',job.published_run,offset).all()).results;
        return json({version:job.published_run,rows:rows.map(r=>JSON.parse(r.payload)),offset,nextOffset:rows.length===100?offset+100:null});
      }
      if(url.pathname.startsWith('/api/'))return json({error:'Not found'},404);
      return env.ASSETS.fetch(request);
    }catch(error){console.error('Request failed:',error.name);return json({error:'The saved data could not be loaded. Please try again.'},500);}
  },
  async scheduled(event,env,ctx){await runRefresh(env);}
};
