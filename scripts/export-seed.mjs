// Saves the published snapshots in .local/records.sqlite to data/seed.json, which new installs start from.
// Usage: npm run seed:export [-- --partial]
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {DatabaseSync} from 'node:sqlite';
import config from '../data/config.json' with {type:'json'};
import {seedScope} from '../src/refresh.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const db=new DatabaseSync(path.join(root,'.local','records.sqlite'),{readOnly:true});

const unfinished=db.prepare("SELECT kind,status,COUNT(*) n FROM jobs WHERE last_success IS NULL GROUP BY kind,status").all();
if(unfinished.length){
  console.log('Jobs that have not completed a first refresh:');console.table(unfinished);
  if(!process.argv.includes('--partial')){console.error('Export stopped. Wait for the first refresh to finish, or pass --partial to export what has completed.');process.exit(1);}
}
const rows=db.prepare('SELECT j.id,j.kind,j.subject,j.args,j.last_success,j.checked_through,s.run_id,s.payload FROM jobs j JOIN snapshots s ON s.job_id=j.id WHERE j.last_success IS NOT NULL ORDER BY j.kind,j.id').all();
const jobs=rows.map(r=>({id:r.id,kind:r.kind,subject:r.subject,args:JSON.parse(r.args),lastSuccess:r.last_success,checkedThrough:r.checked_through,run:r.run_id,snapshot:JSON.parse(r.payload)}));
const seed={version:1,exportedAt:new Date().toISOString(),scope:seedScope(config),jobs};
// One job per line keeps future seed updates reviewable as diffs.
const text=`{"version":1,"exportedAt":${JSON.stringify(seed.exportedAt)},"scope":${JSON.stringify(seed.scope)},"jobs":[\n${jobs.map(j=>JSON.stringify(j)).join(',\n')}\n]}\n`;

const secrets=[process.env.FEC_API_KEY,process.env.CONGRESS_API_KEY].filter(Boolean);
if(/api_key=/i.test(text)||secrets.some(s=>text.includes(s))){console.error('Export stopped: the snapshot contains an API key.');process.exit(1);}
fs.writeFileSync(path.join(root,'data','seed.json'),text);
const counts={};for(const j of jobs)counts[j.kind]=(counts[j.kind]||0)+1;
console.log(`Saved ${jobs.length} snapshots (${(Buffer.byteLength(text)/1e6).toFixed(1)} MB) to data/seed.json:`,counts);
