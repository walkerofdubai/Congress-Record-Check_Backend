import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import worker from '../src/worker.mjs';
import {initialize,runRefresh} from '../src/refresh.mjs';
import {openDatabase} from './sqlite.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
await fs.mkdir(path.join(root,'.local'),{recursive:true});
const db=openDatabase(path.join(root,'.local','records.sqlite'));
db.exec(await fs.readFile(path.join(root,'migrations','0001_initial.sql'),'utf8'));
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml'};
const env={DB:db,LOCAL_MODE:true,FEC_API_KEY:process.env.FEC_API_KEY,CONGRESS_API_KEY:process.env.CONGRESS_API_KEY,ASSETS:{async fetch(req){
  const url=new URL(req.url);let relative;try{relative=decodeURIComponent(url.pathname);}catch{return new Response('Invalid path',{status:400});}
  const file=path.resolve(root,'public','.'+(relative==='/'?'/index.html':relative));
  if(!file.startsWith(path.join(root,'public')+path.sep))return new Response('Not found',{status:404});
  try{return new Response(await fs.readFile(file),{headers:{'Content-Type':mime[path.extname(file)]||'application/octet-stream','Cache-Control':'no-cache','X-Content-Type-Options':'nosniff'}});}catch{return new Response('Not found',{status:404});}
}}};
await initialize(db);
const port=Number(process.env.PORT||8787);
if(!Number.isInteger(port)||port<1024||port>65535)throw new Error('PORT must be an integer from 1024 to 65535');
const server=http.createServer(async(req,res)=>{
  if(![`127.0.0.1:${port}`,`localhost:${port}`].includes(req.headers.host)){res.writeHead(403);res.end('Local requests only');return;}
  try{
    const request=new Request(`http://${req.headers.host}${req.url}`,{method:req.method,headers:req.headers});
    const result=await worker.fetch(request,env,{});res.writeHead(result.status,Object.fromEntries(result.headers));res.end(Buffer.from(await result.arrayBuffer()));
  }catch{res.writeHead(500);res.end('Local server error');}
});
let running=false;
async function tick(){if(running)return;running=true;try{const r=await runRefresh(env);if(r.processed)console.log(`Refresh processed ${r.processed} source pages.`);}catch(e){console.error('Refresh failed:',e.message);}finally{running=false;}}
let timer;
server.on('error',error=>{console.error(error.code==='EADDRINUSE'?`Port ${port} is already in use. If Congress Record Check is already running, open http://127.0.0.1:${port}. Otherwise choose another PORT in .dev.vars.`:error.message);db.close();process.exit(1);});
server.listen(port,'127.0.0.1',()=>{
  console.log(`Congress Record Check is ready at http://127.0.0.1:${port}\nOfficial records refresh while this process is running. Stop with Ctrl+C.`);
  if(process.env.LOCAL_AUTORUN!=='false'){void tick();timer=setInterval(tick,60_000);}
});
process.on('SIGINT',()=>{clearInterval(timer);server.close(()=>{db.close();process.exit(0);});});
