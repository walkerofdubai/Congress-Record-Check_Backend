// Finds each profiled person's Bluesky accounts and keeps only the ones that can be confirmed as theirs. Bluesky has no
// official list of politicians' accounts, so this runs on your computer (Bluesky's public API needs no key).
//   npm run social:bluesky              print what it finds, without changing anything
//   npm run social:bluesky -- --write   also save the confirmed accounts to data/config.json
// An account counts as confirmed when:
//   1. it is linked from the person's official website or campaign website, or
//   2. it carries Bluesky's verified badge and its display name is the person's name.
// Accounts whose handle is the official or campaign website domain are listed but not saved: only the domain's owner can
// use it as a handle, and the refresh already checks those domains for everyone. Fan, parody and unverified accounts
// are never saved. Rerun it every few months; saved accounts are kept unless you remove them by hand.
import fs from 'node:fs';
import {pathToFileURL} from 'node:url';
import {namesPerson,ownDomain} from '../src/feeds.mjs';

const API='https://public.api.bsky.app/xrpc/';
const HANDLE=/^[a-z0-9-]+(\.[a-z0-9-]+)+$/;

// Bluesky profile links on a web page (bsky.app/profile/<handle or DID>), without duplicates.
export function bskyLinks(html){
  const out=new Set();
  for(const m of String(html||'').matchAll(/https?:\/\/(?:www\.)?bsky\.app\/profile\/([a-z0-9.:-]+)/gi)){
    const id=m[1].toLowerCase().replace(/\.$/,'');
    if(HANDLE.test(id)||/^did:plc:[a-z0-9]+$/.test(id))out.add(id);
  }
  return [...out];
}
// Accounts from a Bluesky name search that carry the verified badge and use the person's name.
export function verifiedMatches(actors,person){
  return (actors||[]).filter(a=>a?.verification?.verifiedStatus==='valid'&&namesPerson(a.displayName||'',person)).map(a=>a.handle.toLowerCase());
}

async function get(url){
  const r=await fetch(url,{headers:{'User-Agent':'PublicLedger/1.0 (Bluesky account check)'},signal:AbortSignal.timeout(20000)});
  if(!r.ok)return null;
  return /json/.test(r.headers.get('content-type')||'')?r.json():r.text();
}
const profile=actor=>get(`${API}app.bsky.actor.getProfile?actor=${encodeURIComponent(actor)}`);
const pause=ms=>new Promise(r=>setTimeout(r,ms));

async function check(p){
  const found=new Map(),domains=[p.official?.site,p.campaignSite].map(ownDomain).filter(Boolean);
  for(const d of domains){const x=await profile(d);if(x?.handle===d)found.set(d,'Website domain (checked by the refresh automatically)');}
  for(const site of [p.official?.site,p.campaignSite].filter(Boolean)){
    const html=await get(site).catch(()=>null);
    for(const id of bskyLinks(typeof html==='string'?html:'')){
      const x=await profile(id);if(x?.handle&&HANDLE.test(x.handle)&&!found.has(x.handle))found.set(x.handle.toLowerCase(),`Linked from ${new URL(site).hostname}`);
    }
  }
  const search=await get(`${API}app.bsky.actor.searchActors?q=${encodeURIComponent(p.name)}&limit=25`);
  for(const h of verifiedMatches(search?.actors,p))if(!found.has(h))found.set(h,'Bluesky verified badge, matching name');
  return {found,domains};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const write=process.argv.includes('--write');
  const path=new URL('../data/config.json',import.meta.url),config=JSON.parse(fs.readFileSync(path,'utf8'));
  let added=0;
  for(const p of config.people.filter(p=>p.ids)){
    const {found,domains}=await check(p).catch(e=>({found:new Map(),error:e.message,domains:[]}));
    p.social=p.social||{};const before=new Set(p.social.bluesky||[]);
    const save=[...found].filter(([h])=>!domains.includes(h)).map(([h])=>h);
    console.log(`${p.name}: ${found.size?[...found].map(([h,why])=>`@${h} (${why})`).join('; '):'no confirmed account'}`);
    if(write){for(const h of save)if(!before.has(h)){before.add(h);added++;}p.social.bluesky=[...before];}
    await pause(300);
  }
  if(write){fs.writeFileSync(path,JSON.stringify(config,null,2));console.log(`\nSaved ${added} new account${added===1?'':'s'} to data/config.json. Restart the local server to pick them up.`);}
  else console.log('\nNothing was changed. Run with --write to save the confirmed accounts.');
}
