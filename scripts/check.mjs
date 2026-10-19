import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
import config from '../data/config.json' with {type:'json'};
const files=['src/sources.mjs','src/refresh.mjs','src/worker.mjs','scripts/local.mjs','public/boot.js','public/live.js','public/app.js'];
for(const file of files){const result=spawnSync(process.execPath,['--check',file],{stdio:'inherit'});if(result.status)process.exit(result.status);}
const research=JSON.parse(fs.readFileSync('public/research.json','utf8'));
if(new Set(config.people.map(p=>p.id)).size!==config.people.length)throw new Error('Duplicate person IDs');
if(!research.members?.length||!research.votes?.length)throw new Error('Research import is incomplete');
for(const p of config.people){if(p.fecCand&&!/^[HSP]\d[A-Z]{2}\d{5}$/.test(p.fecCand))throw new Error('Invalid candidate ID: '+p.id);if(p.fecCmte&&!/^C\d{8}$/.test(p.fecCmte))throw new Error('Invalid committee ID: '+p.id);}
const html=fs.readFileSync('public/index.html','utf8');if(html.includes('const DATA ='))throw new Error('Data is still embedded in HTML');
console.log(`Syntax and import checks passed: ${config.people.length} people, ${config.selectedVotes.length} selected roll calls.`);
