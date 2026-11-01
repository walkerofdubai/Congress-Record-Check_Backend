// The refresh sources added with the scoring overhaul, one entry per job kind. Each entry says which host it calls
// (that host's key in sources.mjs HOSTS decides whether the job waits for setup), how often it runs, which jobs to
// create, how to fetch one page, and how to summarize the validated records into the published snapshot.
// Response formats follow each source's published documentation; live responses need your keys and are not verified
// here. Every adapter checks the identity and shape of what comes back and refuses to publish anything else.
import {SourceError,requestSource,cleanURL,fecNext,list,day,unzipFile,parseXML,addCookies,cookieHeader,partyTally,normalizeCampaign,campaignSiteQuery,chooseCampaignSite,diffPlatform,normalizePlatform,notCampaign,platformPaths} from './sources.mjs';
import {pdfText} from './pdf.mjs';
import {billKey} from '../public/grades.js';
import {sectorForSic} from '../public/sectors.js';
import {donorSizes} from '../public/donor-sizes.js';
import {netWorth} from '../public/net-worth.js';
import COMMITTEES from '../public/committees.json' with {type:'json'};

export const DAY=86400000, WEEK=7*DAY, NEVER=Number.MAX_SAFE_INTEGER;
const need=(ok,message)=>{if(!ok)throw new SourceError(message);};
const daysAgo=n=>new Date(Date.now()-n*DAY).toISOString().slice(0,10);
const fold=v=>String(v||'').normalize('NFKD').replace(/[̀-ͯ]/g,'').toLowerCase();
const surname=p=>p.name.replace(/,?\s+(Jr\.?|Sr\.?|III|II|IV)$/i,'').split(/\s+/).at(-1);
const firstName=p=>p.name.split(/\s+/)[0];
// The person's full name appears in the text (first name or a listed nickname, and surname).
export const namesPerson=(text,p)=>{const t=fold(text);return t.includes(fold(surname(p)))&&[firstName(p),...(p.nicknames||[])].some(f=>t.includes(fold(f)));};
// A campaign committee named after the person ("Collins for Senator", "Friends of Collins", "Team Collins").
export const namesCampaign=(text,p)=>{const t=fold(text),s=fold(surname(p));return t.includes(s)&&new RegExp(`\\b${s}\\b.*\\bfor\\b|\\bfriends of\\b.*\\b${s}\\b|\\b(team|elect)\\s+${s}\\b|\\b${s}\\s+(victory|campaign|committee)\\b`).test(t);};
const strip=html=>String(html||'').replace(/<[^>]+>/g,' ').replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').replace(/&#39;|&rsquo;/g,"'").replace(/&quot;|&[lr]dquo;/g,'"').replace(/\s+/g,' ').trim();
const https=u=>{try{const x=new URL(u);return x.protocol==='https:'?x.href:null;}catch{return null;}};
const cut=(t,n)=>t&&t.length>n?t.slice(0,n-1)+'…':t||null;
const state=c=>c?JSON.parse(c):null;
const profiled=c=>c.people.filter(p=>p.ids);
const congressOf=year=>Math.floor((year-1789)/2)+1;
const BILL_PATH={HR:'house-bill',S:'senate-bill',HJRES:'house-joint-resolution',SJRES:'senate-joint-resolution',HCONRES:'house-concurrent-resolution',SCONRES:'senate-concurrent-resolution',HRES:'house-resolution',SRES:'senate-resolution'};
const billPage=(congress,type,number)=>`https://www.congress.gov/bill/${congress}th-congress/${BILL_PATH[String(type).toUpperCase()]}/${number}`;
// How a bill number is written in a lobbying report's search ("H.R. 5376").
const BILL_ABBR={hr:'H.R.',s:'S.',hjres:'H.J.Res.',sjres:'S.J.Res.'};
// A client that is a labor union, by its name (a lobbying report doesn't say what kind of group the client is).
const NOT_UNION=/credit unions?|union pacific|western union|union bank|union carbide|european union|civil liberties union|taxpayers union|union of concerned|union league/i;
export const isUnion=name=>!NOT_UNION.test(String(name||''))&&/\b(unions?|brotherhood|afl-cio|teamsters|seiu|afscme|steelworkers|uaw|ufcw|ibew|machinists|nurses united|national education association|communications workers|federation of (?:teachers|government employees|state, county|labor|musicians)|laborers'? international|united (?:auto|food|mine|farm) workers)\b/i.test(String(name||''));
// Bill numbers named in free text, such as a lobbying report ("H.R. 1", "S.J.Res. 12").
export function billsInText(text,congress){
  const out=new Set(),re=/(?<![\w.])(H\.?\s?R|H\.?\s?J\.?\s?Res|S\.?\s?J\.?\s?Res|H\.?\s?Con\.?\s?Res|S\.?\s?Con\.?\s?Res|H\.?\s?Res|S)\.?\s?(\d{1,5})\b/gi;
  for(const m of String(text||'').matchAll(re)){const k=billKey(congress,m[1]+m[2]);if(k)out.add(k);}
  return [...out];
}
const congressNext=(d,cursor)=>{let next=d.pagination?.next||null;if(next){const u=new URL(cleanURL(next));u.searchParams.set('format','json');next=u.href;need(next!==cursor,'Congress pagination stopped advancing');}return next;};
const top=(rows,n,by='date')=>rows.slice().sort((a,b)=>String(b[by]||'').localeCompare(String(a[by]||''))).slice(0,n);
const recent=(rows,n=50)=>({count:rows.length,rows:top(rows,n),rowLimit:n});
// Federal docket numbers in text ("1:23-cr-00257-TSC", "23-cr-257"), as "23-cr-257": the year, the case type and the
// number, so the same case matches however each source writes it.
export const docketKey=v=>{const m=/(?:\b\d{1,2}:)?\b(\d{2})-([a-z]{2,4})-0*(\d{1,6})\b/i.exec(String(v||''));return m?`${m[1]}-${m[2].toLowerCase()}-${m[3]}`:null;};
export const docketsIn=text=>[...new Set([...String(text||'').matchAll(/(?:\b\d{1,2}:)?\b\d{2}-(?:cr|cv|mj|mc|po|sw)-\d{1,6}\b/gi)].map(m=>docketKey(m[0])).filter(Boolean))];
const byPersonOf=rows=>{const out={};for(const r of rows)for(const id of r.people||[])(out[id]||=[]).push(r);return out;};

// ---------- History back to config.historyFrom (2016) ----------
// The year the refresh reads history from. Each source goes back to it where it can; see README "How far back".
export const SINCE=c=>Number(c?.historyFrom)||2016;
const thisYear=()=>new Date().getUTCFullYear();
export const yearsFrom=(from,to=thisYear())=>Array.from({length:Math.max(0,to-from+1)},(_,i)=>from+i);
// Election cycles (even years) from the one that includes `from` through `to`.
export const cyclesFrom=(from,to)=>yearsFrom(from+from%2,to).filter(y=>y%2===0);
const isoDay=ms=>new Date(ms).toISOString().slice(0,10);
// A year whose records are complete: it ended more than two months ago, so late filings (fourth-quarter lobbying
// reports, year-end campaign reports) are in. Its records are read once and kept.
export const ended=(year,now=new Date())=>Number(year)<now.getUTCFullYear()-1||(Number(year)===now.getUTCFullYear()-1&&now.getUTCMonth()>=2);
// A long list kept by year: the newest perYear rows of each year, newest first, with every year's full count, so ten
// years of records stay a manageable size and the older years can still be opened.
export function history(rows,perYear=40){
  const by={};for(const r of rows)(by[String(r.date||'').slice(0,4)||'undated']||=[]).push(r);
  const kept=Object.values(by).flatMap(l=>top(l,perYear));
  return {count:rows.length,rows:top(kept,kept.length),byYear:Object.fromEntries(Object.entries(by).map(([y,l])=>[y,l.length])),perYear};
}
// Every record behind a job's last published snapshot (not only the rows the snapshot shows): what a job carries over.
async function publishedRecords(env,jobId){
  if(!env.DB)return [];
  const r=await env.DB.prepare('SELECT r.payload FROM records r JOIN jobs j ON r.run_id=j.published_run WHERE j.id=?').bind(jobId).all();
  return r.results.map(x=>JSON.parse(x.payload));
}
// Which of these record IDs the current run has already saved.
async function recorded(env,runId,ids){
  const have=new Set();if(!env.DB||!runId)return have;
  for(let i=0;i<ids.length;i+=90){const part=ids.slice(i,i+90).map(String);
    const r=await env.DB.prepare(`SELECT id FROM records WHERE run_id=? AND id IN (${part.map(()=>'?').join(',')})`).bind(runId,...part).all();
    for(const x of r.results)have.add(x.id);}
  return have;
}
// History read one period at a time (a year, an election cycle, a year for one organization). A period that has
// ended is read once: its records are carried over from the job's last published run, with a marker saying it was read
// in full. Periods still open are read again on each run. tag: what else the records depend on (the organizations a
// donor search names), so a change reads the period again. read(period, cursor) returns {rows, next}.
export async function byPeriod(job,env,{periods,closed=ended,tag='',read}){
  let c=state(job.cursor),rows=[];
  if(!c){
    const old=await publishedRecords(env,job.id),keep=new Set(periods.map(String));
    const done=new Set(old.filter(r=>r.periodDone!=null&&r.tag===tag&&keep.has(String(r.periodDone))&&closed(r.periodDone)).map(r=>String(r.periodDone)));
    rows=old.filter(r=>done.has(String(r.periodDone??r.period)));
    c={todo:periods.filter(p=>!done.has(String(p))),i:0,at:null};
    if(!c.todo.length)return {rows,next:null};
  }
  const p=c.todo[c.i],r=await read(p,c.at);
  rows.push(...r.rows.map(x=>({...x,id:`${p}:${x.id}`,period:p})));
  if(r.next)return {rows,next:JSON.stringify({...c,at:r.next})};
  if(closed(p))rows.push({id:`period:${p}`,periodDone:p,tag});
  return {rows,next:c.i+1<c.todo.length?JSON.stringify({todo:c.todo,i:c.i+1,at:null}):null};
}
const periodRows=rows=>rows.filter(r=>r.periodDone==null);
const countBy=(rows,key)=>{const o={};for(const r of rows){const k=key(r);o[k]=(o[k]||0)+1;}return o;};
// A newest-first list read back to historyFrom: in full about once a month, and in between only its newest page, with
// the older records carried over from the last run. read(cursor) returns {rows, next, oldest} (oldest: the date of the
// last item on the page, read or not).
async function readBack(job,env,config,read,{maxPages=10,name='list'}={}){
  const since=`${SINCE(config)}-01-01`,mark=`scan:${name}`;let c=state(job.cursor);const rows=[];
  if(!c){
    const old=await publishedRecords(env,job.id),m=old.find(r=>r.id===mark);
    c={at:null,n:0,full:!(m&&m.since===since&&Date.now()-Date.parse(m.at)<30*DAY)};
    if(!c.full)rows.push(...old);
  }
  const r=await read(c.at);rows.push(...r.rows);
  const more=c.full&&r.next&&c.n+1<maxPages&&!(r.oldest&&r.oldest<since);
  if(c.full&&!more)rows.push({id:mark,since,at:new Date().toISOString()});
  return {rows,next:more?JSON.stringify({...c,at:r.next,n:c.n+1}):null};
}
const scanRows=rows=>rows.filter(r=>!/^scan:/.test(String(r.id))&&r.periodDone==null);

// ---------- Statements: social accounts and official press releases ----------
const domainOf=u=>{try{return new URL(u).hostname.replace(/^www\./,'').toLowerCase();}catch{return null;}};
// Shared platforms a "website" can point to (a Facebook page, a donation page): their domain belongs to the platform,
// not to the person, so it is never checked as the person's Bluesky handle.
const SHARED_HOST=/(^|\.)(facebook|instagram|x|twitter|threads|youtube|tiktok|linktr|linkedin|actblue|winred|anedot|bsky|wikipedia|ballotpedia|squarespace|wixsite|wordpress|medium|substack|google)\.(com|net|org|app|ee|site)$/;
export const ownDomain=u=>{const d=domainOf(u);return d&&!SHARED_HOST.test(d)?d:null;};
// Bluesky handles to check: the ones added by hand (scripts/find-bluesky.mjs finds and verifies them), then the
// person's official website domain and campaign website domain. Only a domain's owner can use it as a Bluesky handle,
// so those need no other check; a domain with no account is skipped and listed.
export const blueskyHandles=p=>[...new Set([...(p.social?.bluesky||[]).map(h=>String(h).replace(/^@/,'').toLowerCase()),...[p.official?.site,p.campaignSite].map(ownDomain)].filter(Boolean))];
// Threads accounts: the ones added by hand, or else the Instagram username, since a Threads profile always uses the
// username of the Instagram account it was made from.
export const threadsUsers=p=>[...new Set((p.social?.threads?.length?p.social.threads:p.social?.instagram?[p.social.instagram]:[]).map(u=>String(u).replace(/^@/,'').toLowerCase()).filter(u=>/^[a-z0-9._]{1,30}$/.test(u)))];
// The search word for each alignment issue. Threads posts are found by searching each account for these words, so
// only posts that mention an issue are collected.
export const THREADS_TERMS={health:'health care',taxes:'taxes',immigration:'immigration',abortion:'abortion',civil:'marriage',guns:'guns',climate:'climate',tariffs:'tariffs',ukraine:'Ukraine',warpowers:'Venezuela',jan6:'January 6',labor:'wages',voting:'voter ID',infra:'infrastructure',vouchers:'school choice'};
// RSS and Atom feed links a web page advertises (<link rel="alternate" type="application/rss+xml" href="...">),
// resolved against the page: press-release feeds first, then news feeds, then the rest.
export function feedLinks(html,base){
  const out=[];
  for(const [tag] of String(html||'').matchAll(/<link\b[^>]*>/gi)){
    const attr=n=>{const m=new RegExp(`\\b${n}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'>]+))`,'i').exec(tag);return m?(m[1]??m[2]??m[3]).replace(/&amp;/g,'&'):'';};
    if(!/\balternate\b/i.test(attr('rel'))||!/(rss|atom)\+xml/i.test(attr('type'))||!attr('href'))continue;
    try{const u=new URL(attr('href'),base);if(u.protocol==='http:')u.protocol='https:';out.push({url:u.href,title:attr('title')});}catch{}
  }
  const press=f=>/press/i.test(f.title+' '+f.url)?0:/news/i.test(f.title+' '+f.url)?1:2;
  return [...new Set(out.sort((a,b)=>press(a)-press(b)).map(f=>f.url))];
}
const txt=v=>v&&typeof v==='object'?v['#text']??'':v??'';
const dateOf=v=>{const d=new Date(String(txt(v)).trim());return Number.isFinite(+d)?d.toISOString().slice(0,10):null;};
const atomLink=l=>{const ls=list(l);const x=ls.find(k=>!k['@_rel']||k['@_rel']==='alternate')||ls[0];return typeof x==='string'?x:x?.['@_href'];};
// The items of an RSS 2.0, RSS 1.0 or Atom document, or null when it is not a feed.
export function feedItems(doc){
  const rss=doc?.rss?.channel,rdf=doc?.['rdf:RDF'],atom=doc?.feed;
  const raw=rss?list(rss.item).map(i=>({title:i.title,url:txt(i.link)||txt(i.guid),date:i.pubDate||i['dc:date'],summary:i.description}))
    :rdf?list(rdf.item).map(i=>({title:i.title,url:txt(i.link),date:i['dc:date'],summary:i.description}))
    :atom?list(atom.entry).map(e=>({title:e.title,url:atomLink(e.link),date:e.published||e.updated,summary:e.summary||e.content})):null;
  if(!raw)return null;
  return raw.map(i=>{const url=https(String(txt(i.url)).trim().replace(/^http:/,'https:'));return {id:url,title:cut(strip(txt(i.title)),300),url,date:dateOf(i.date),summary:cut(strip(txt(i.summary)),300)};}).filter(i=>i.url&&i.title);
}

// ---------- Record ----------
// Congress.gov lists the amendments a member sponsored or cosponsored (mostly senators') with their bills; an amendment
// has an amendment number instead of a bill number and no title, so it is left out rather than failing the page.
export const isAmendment=r=>r.amendmentNumber!=null||/AMDT$/i.test(r.type||'');
// Bills in the response from a.first (a Congress number) on, or from a.congress alone.
function billRows(items,a){
  return items.filter(r=>(a.first?Number(r.congress)>=Number(a.first):Number(r.congress)===Number(a.congress))&&!isAmendment(r)).map(r=>{
    need(BILL_PATH[r.type]&&r.number&&(r.title||r.latestTitle)&&day(r.introducedDate),'Legislation record incomplete');
    return {id:`${r.congress}-${r.type}-${r.number}`,bill:billKey(r.congress,r.type+r.number),title:r.title||r.latestTitle,measure:`${r.type} ${r.number}`,date:day(r.introducedDate),latestAction:r.latestAction?.text||null,actionDate:day(r.latestAction?.actionDate),source:billPage(r.congress,r.type,r.number)};
  });
}
// A House roll call from Congress.gov's House vote endpoint, in the same shape as a House Clerk roll call.
export function normalizeHouseApiVote(d,args,people){
  const v=d?.houseRollCallVoteMemberVotes;
  need(v&&Number(v.rollCallNumber)===Number(args.number)&&Number(v.congress)===congressOf(args.year),'House vote identity mismatch');
  const members=list(v.results);need(members.length,'House vote has no member records');
  const positions={};for(const p of people.filter(p=>p.bioguide)){const m=members.find(m=>(m.bioguideID||m.bioguideId)===p.bioguide);if(m)positions[p.id]=m.voteCast;}
  const date=day(v.startDate);need(date&&Number(date.slice(0,4))===Number(args.year),'House vote date mismatch');
  const measure=v.legislationType?`${v.legislationType} ${v.legislationNumber}`:null;
  return {id:`h-${args.year}-${args.number}`,chamber:'H',number:Number(args.number),date,title:measure?`${measure}: ${v.voteQuestion||''}`.trim():v.voteQuestion,question:v.voteQuestion,result:v.result,positions,
    byParty:partyTally(members.map(m=>[m.voteParty,m.voteCast])),
    bill:v.legislationType?billKey(v.congress,v.legislationType+v.legislationNumber):null,via:'Congress.gov'};
}
export const houseApiURL=args=>`https://api.congress.gov/v3/house-vote/${congressOf(args.year)}/${args.year%2?1:2}/${args.number}/members?format=json`;

// GovInfo packages of one collection issued from historyFrom until `lag` days ago (the newer ones come from the daily
// index), from GovInfo's published-date service.
async function publishedPage(job,a,env,config,lag,re){
  const url=job.cursor||`https://api.govinfo.gov/published/${SINCE(config)}-01-01/${daysAgo(lag)}?collection=${a.collection}&offsetMark=*&pageSize=1000`;
  const d=await requestSource(url,env);need(Array.isArray(d.packages),'GovInfo package list missing');
  return {rows:d.packages.filter(x=>re.test(x.packageId||'')).map(x=>({id:x.packageId,date:day(x.dateIssued)})),next:d.nextPage?cleanURL(d.nextPage):null};
}
// The speeches in one day's Congressional Record, from the day's MODS metadata file: each section of the Record (a
// granule) with its ID (accessId), its part of the Record (granuleClass) and the members speaking in it (congMember,
// by Bioguide ID), in the same shape as the granule-by-granule reader.
export function crecModsRows(doc,pkg,bios){
  const merge=exts=>{const o={};for(const e of exts)if(e&&typeof e==='object')for(const [k,v] of Object.entries(e))o[k]=k in o?[...list(o[k]),...list(v)]:v;return o;};
  const parts=list(doc?.mods?.relatedItem).map(it=>{const ext=merge(list(it.extension));return {it,ext,id:String(txt(list(ext.accessId)[0])).trim()};}).filter(x=>x.id);
  need(parts.some(x=>x.id.startsWith(pkg+'-')),'Congressional Record metadata missing');
  return parts.map(x=>{
    const section=String(txt(list(x.ext.granuleClass)[0])).trim();if(!['HOUSE','SENATE','EXTENSIONS'].includes(section))return null;
    const people=[...new Set(list(x.ext.congMember).filter(m=>m&&(!m['@_role']||/speak/i.test(m['@_role']))).map(m=>bios.get(m['@_bioGuideId'])).filter(Boolean))];
    if(!people.length)return null;
    const title=String(txt(list(list(x.it.titleInfo)[0]?.title)[0])||String(txt(list(x.ext.searchTitle)[0])).replace(/;\s*Congressional Record Vol\..*$/,'')).trim();
    return {id:x.id,title:cut(title,300),date:pkg.slice(5,15),section,people,url:`https://www.govinfo.gov/app/details/${pkg}/${x.id}`};
  }).filter(Boolean);
}

export const FEEDS={
  // Every bill they cosponsored from historyFrom on: read in full once a week, and on the other days only the bills
  // updated since the last run (a new cosponsor or action updates a bill), with the rest carried over.
  cosponsored:{host:'api.congress.gov',label:'Cosponsored legislation',tab:'match',
    jobs:c=>profiled(c).filter(p=>p.bioguide).map(p=>({id:`cosponsored:${p.id}`,subject:p.id,args:{bioguide:p.bioguide,congress:c.congress,cycle:c.cycle}})),
    async page(job,a,env,config){
      const since=SINCE(config);let c=state(job.cursor),carry=[];
      if(!c){
        const old=await publishedRecords(env,job.id),m=old.find(r=>r.id==='scan:full');
        const fresh=m&&m.since===since&&Date.now()-Date.parse(m.at)<WEEK&&job.last_success;
        const from=fresh?isoDay(Date.parse(job.last_success)-3*DAY):`${since}-01-01`;
        carry=fresh?old:[{id:'scan:full',since,at:new Date().toISOString()}];
        c={url:`https://api.congress.gov/v3/member/${a.bioguide}/cosponsored-legislation?format=json&limit=250&fromDateTime=${from}T00%3A00%3A00Z`};
      }
      const d=await requestSource(c.url,env);need(Array.isArray(d.cosponsoredLegislation)&&d.pagination,'Cosponsored legislation response incomplete');
      const next=congressNext(d,c.url);
      return {rows:[...carry,...billRows(d.cosponsoredLegislation,{first:congressOf(since)})],next:next&&JSON.stringify({url:next})};
    },
    summarize:(rows,a)=>{const bills=rows.filter(r=>r.measure),m=rows.find(r=>r.id==='scan:full');
      return {...history(bills,30),congress:a.congress,since:m?.since||null,bills:[...new Set(bills.map(r=>r.bill).filter(Boolean))],byCongress:countBy(bills,r=>r.id.split('-')[0])};}},

  // Key bills: the Workers > Profit bills and the bills behind the selected votes (config.keyBills).
  bill:{host:'api.congress.gov',label:'Bill details',tab:'match',
    jobs:c=>(c.keyBills||[]).filter(k=>!/-[sh]amdt-/.test(k)).map(k=>({id:`bill:${k}`,subject:k,args:{bill:k}})),
    async page(job,a,env){
      const [congress,type,number]=a.bill.split('-'),base=`https://api.congress.gov/v3/bill/${congress}/${type}/${number}`;
      const step=job.cursor||'detail';
      if(step==='detail'){
        const b=(await requestSource(base+'?format=json',env)).bill;
        need(b&&Number(b.congress)===Number(congress)&&String(b.number)===number&&String(b.type).toLowerCase()===type,'Bill identity mismatch');
        return {rows:[{id:'detail',title:b.title,introduced:day(b.introducedDate),policyArea:b.policyArea?.name||null,latestAction:b.latestAction?.text||null,actionDate:day(b.latestAction?.actionDate),
          sponsor:list(b.sponsors)[0]?.fullName||null,cosponsors:b.cosponsors?.count??null,laws:list(b.laws).map(l=>`${l.type} ${l.number}`),
          cbo:list(b.cboCostEstimates).map(e=>({title:e.title,date:day(e.pubDate),url:https(e.url),note:cut(strip(e.description),400)})),
          reports:list(b.committeeReports).map(r=>({title:r.citation,url:https(r.url)})),source:billPage(congress,type,number)}],next:'summaries'};
      }
      if(step==='summaries'){
        const s=list((await requestSource(base+'/summaries?format=json',env)).summaries).sort((x,y)=>String(y.updateDate||y.actionDate).localeCompare(String(x.updateDate||x.actionDate)))[0];
        return {rows:[{id:'summary',summary:s?cut(strip(s.text),2400):null,summaryAction:s?.actionDesc||null,summaryDate:day(s?.actionDate)}],next:'amendments'};
      }
      const am=list((await requestSource(base+'/amendments?format=json&limit=250',env)).amendments);
      return {rows:[{id:'amendments',amendments:am.length,amendmentList:am.slice(0,20).map(x=>({number:`${x.type} ${x.number}`,purpose:cut(x.purpose||x.description,240),action:x.latestAction?.text||null}))}],next:null};
    },
    summarize:(rows,a)=>{const out={bill:a.bill};for(const r of rows){const {id,...rest}=r;Object.assign(out,rest);}need(out.title,'Bill details missing');return out;}},

  // CRS reports from historyFrom on, each with the bills it covers. A report already read is carried over, not read
  // again; the first run reads up to 1,700 reports and the rest follow in the next runs, a few minutes apart. Once all are
  // read, each weekly run lists only the reports updated since the last one.
  crs:{host:'api.congress.gov',label:'CRS reports',tab:'match',scope:'global',every:WEEK,
    jobs:()=>[{id:'crs',subject:'CRS',args:{}}],
    async page(job,a,env,config){
      const since=SINCE(config);let c=state(job.cursor);
      // First: the reports already read, so the listing below can skip them.
      if(!c){
        const old=await publishedRecords(env,job.id),m=old.find(r=>r.id==='scan:crs'),complete=m?.since===since&&m.complete&&job.last_success;
        return {rows:old.filter(r=>r.id!=='scan:crs'),next:JSON.stringify({from:complete?isoDay(Date.parse(job.last_success)-7*DAY):`${since}-01-01`,offset:0,todo:[],i:0})};
      }
      if(c.i<c.todo.length){
        const id=c.todo[c.i],r=(await requestSource(`https://api.congress.gov/v3/crsreport/${encodeURIComponent(id)}?format=json`,env)).CRSReport;
        need(r&&r.id===id,'CRS report identity mismatch');
        const bills=list(r.relatedMaterials).map(m=>m.type&&m.number&&m.congress?billKey(m.congress,m.type+m.number):null).filter(Boolean);
        const pdf=list(r.formats).find(f=>/pdf/i.test(f.format||''))||list(r.formats)[0];
        const row={id,title:r.title,date:day(r.publishDate),bills,url:https(r.url)||https(pdf?.url)||`https://www.congress.gov/crs-product/${id}`};
        return {rows:[row],next:JSON.stringify({...c,i:c.i+1})};
      }
      if(c.last)return {rows:[{id:'scan:crs',since,complete:true}],next:null};
      // A run stops well before the page limit and publishes what it has; the next run continues.
      if(job.page>1700)return {rows:[{id:'scan:crs',since,complete:false}],next:null};
      const d=await requestSource(`https://api.congress.gov/v3/crsreport?format=json&limit=250&offset=${c.offset}&fromDateTime=${c.from}T00%3A00%3A00Z`,env);
      const items=list(d.CRSReports||d.crsReports);need(Array.isArray(d.CRSReports||d.crsReports),'CRS report list missing');
      const ids=[...new Set(items.map(x=>x.id).filter(Boolean))],have=await recorded(env,job.run_id,ids);
      return {rows:[],next:JSON.stringify({...c,offset:c.offset+250,todo:ids.filter(id=>!have.has(String(id))),i:0,last:items.length<250})};
    },
    summarize:rows=>{const m=rows.find(r=>r.id==='scan:crs'),reports=rows.filter(r=>r!==m),byBill={};
      for(const r of reports)for(const b of r.bills||[])(byBill[b]||=[]).push(r);
      return {count:reports.length,byBill,since:m?.since||null,more:m?!m.complete:false};}},

  // Committee meetings with witnesses and their testimony, and the committee's own documents (the House Document
  // Repository's files, served through Congress.gov), for committees that profiled members sit on: every meeting of the
  // current Congress. Earlier Congresses' meetings are left out because a meeting is matched to members by their
  // committee seats, and only the current seats are on file; the hearing transcripts (GovInfo) cover earlier years with
  // the members who attended.
  meetings:{host:'api.congress.gov',label:'Committee meetings',scope:'global',
    jobs:c=>['house','senate'].map(ch=>({id:`meetings:${ch}`,subject:ch==='house'?'House':'Senate',args:{chamber:ch,congress:c.congress,days:30}})),
    async page(job,a,env){
      const url=job.cursor||`https://api.congress.gov/v3/committee-meeting/${a.congress}/${a.chamber}?format=json&limit=250`;
      const d=await requestSource(url,env);need(Array.isArray(d.committeeMeetings),'Committee meeting list missing');
      return {rows:d.committeeMeetings.map(m=>({id:String(m.eventId),eventId:String(m.eventId)})).filter(r=>/^\d+$/.test(r.id)),next:congressNext(d,job.cursor)};
    },
    summarize:rows=>({count:rows.length,events:rows.map(r=>r.eventId)}),
    after:async(snapshot,job,ctx)=>{const a=JSON.parse(job.args);for(const e of snapshot.events)await ctx.addJob(`meeting:${a.chamber}:${e}`,'meeting',e,{chamber:a.chamber,congress:a.congress,event:e});}},
  meeting:{host:'api.congress.gov',label:'Committee meeting',tab:'promises',scope:'global',every:WEEK,jobs:()=>[],
    async page(job,a,env,config){
      const m=(await requestSource(`https://api.congress.gov/v3/committee-meeting/${a.congress}/${a.chamber}/${a.event}?format=json`,env)).committeeMeeting;
      need(m&&String(m.eventId)===String(a.event),'Committee meeting identity mismatch');
      const codes=list(m.committees).map(c=>committeeCode(c.systemCode)).filter(Boolean);
      const people=Object.entries(COMMITTEES.people).filter(([,seats])=>seats.some(s=>codes.includes(s.id))).map(([id])=>id).filter(id=>config.people.some(p=>p.id===id));
      return {rows:[{id:String(m.eventId),title:cut(strip(m.title),300),date:day(m.date),chamber:m.chamber,committees:codes,people,
        witnesses:list(m.witnesses).map(w=>({name:w.name,position:w.position||null,organization:w.organization||null})),
        documents:list(m.witnessDocuments).map(x=>({type:x.documentType,url:https(x.url)})).concat(list(m.meetingDocuments).map(x=>({type:x.documentType||x.name,url:https(x.url)}))).filter(x=>x.url),
        bills:list(m.relatedItems?.bills).map(b=>billKey(b.congress,b.type+b.number)).filter(Boolean),
        // The hearing transcripts it points to, by jacket number: the number in GovInfo's package ID, so the two match.
        transcripts:list(m.hearingTranscript).map(h=>String(h.jacketNumber??'')).filter(x=>/^\d+$/.test(x)),type:m.type||null,
        url:`https://www.congress.gov/event/${a.congress}th-congress/${a.chamber}-event/${a.event}`}],next:null};
    },
    summarize:rows=>{need(rows.length===1,'No validated record to publish');return {byPerson:byPersonOf(rows)};}},

  // Federal Register documents for profiled people who held federal executive office (config federalRegister).
  'official-acts':{host:'www.federalregister.gov',label:'Official acts',tab:'match',
    jobs:c=>profiled(c).filter(p=>p.federalRegister).map(p=>({id:`official-acts:${p.id}`,subject:p.id,args:p.federalRegister})),
    // Documents from historyFrom on (up to 3,000), read in full about once a month; other days read the newest 100.
    page:(job,a,env,config)=>readBack(job,env,config,async next=>{
      const u=new URL('https://www.federalregister.gov/api/v1/documents.json');u.searchParams.set('order','newest');u.searchParams.set('per_page','100');
      if(a.president){u.searchParams.append('conditions[president][]',a.president);u.searchParams.append('conditions[type][]','PRESDOCU');}
      if(a.agency)u.searchParams.append('conditions[agencies][]',a.agency);
      u.searchParams.set('conditions[publication_date][gte]',`${SINCE(config)}-01-01`);
      need(a.president||a.agency,'Federal Register filter missing');
      const d=await requestSource(next||u.href,env);need(Array.isArray(d.results),'Federal Register results missing');
      const rows=d.results.map(r=>({id:r.document_number,title:r.title,type:r.type,date:day(r.publication_date),order:r.executive_order_number||null,url:https(r.html_url)})).filter(r=>r.id&&r.url);
      return {rows,next:https(d.next_page_url),oldest:day(d.results.at(-1)?.publication_date)};
    },{maxPages:30}),
    summarize:rows=>history(scanRows(rows),40)},

  // State legislative records, from Open States and LegiScan together (merged by state bill number when read).
  'state-openstates':{host:'v3.openstates.org',label:'State bills (Open States)',tab:'match',
    jobs:c=>profiled(c).filter(p=>p.stateLeg).map(p=>({id:`state-openstates:${p.id}`,subject:p.id,args:{state:p.stateLeg.toLowerCase(),name:p.name,openstates:p.openstates||null}})),
    async page(job,a,env){
      let c=state(job.cursor)||{person:a.openstates,page:1};
      if(!c.person){
        const d=await requestSource(`https://v3.openstates.org/people?jurisdiction=${a.state}&name=${encodeURIComponent(a.name)}&per_page=10`,env);
        const found=list(d.results).filter(r=>/^ocd-person\//.test(r.id||''));
        need(found.length===1,found.length?'Several Open States people match; set openstates in data/config.json':'No Open States person matches; set openstates in data/config.json');
        return {rows:[],next:JSON.stringify({person:found[0].id,page:1})};
      }
      const d=await requestSource(`https://v3.openstates.org/bills?jurisdiction=${a.state}&sponsor=${encodeURIComponent(c.person)}&sort=updated_desc&per_page=20&page=${c.page}&include=sponsorships&include=votes`,env);
      need(Array.isArray(d.results)&&d.pagination,'Open States bill list incomplete');
      const rows=d.results.map(b=>{
        const sp=list(b.sponsorships).find(s=>s.person?.id===c.person);
        const votes=list(b.votes).flatMap(v=>list(v.votes).filter(x=>x.voter?.id===c.person).map(x=>({date:day(v.start_date),motion:cut(v.motion_text,200),option:x.option,result:v.result})));
        return {id:b.id,state:a.state.toUpperCase(),session:String(b.session),identifier:b.identifier,title:cut(b.title,300),role:sp?(sp.primary?'sponsor':'cosponsor'):'sponsor',
          latestAction:b.latest_action_description||null,date:day(b.latest_action_date),votes,url:https(b.openstates_url),source:'Open States'};
      });
      return {rows,next:c.page<Math.min(10,d.pagination.max_page||1)?JSON.stringify({person:c.person,page:c.page+1}):null};
    },
    summarize:rows=>history(rows,25)},
  // The person's LegiScan ID is looked up once and kept in the published snapshot, so each later weekly check spends one
  // query (their sponsored bills) instead of repeating the session and people lookups, which LegiScan asks users to avoid.
  'state-legiscan':{host:'api.legiscan.com',label:'State bills (LegiScan)',tab:'match',every:WEEK,
    jobs:c=>profiled(c).filter(p=>p.stateLeg).map(p=>({id:`state-legiscan:${p.id}`,subject:p.id,args:{state:p.stateLeg.toUpperCase(),first:firstName(p),last:surname(p),legiscan:p.legiscan||null}})),
    async page(job,a,env){
      const ask=(op,extra)=>requestSource(`https://api.legiscan.com/?op=${op}&${extra}`,env);
      const api=(op,extra)=>ask(op,extra).then(d=>{need(d&&d.status==='OK','LegiScan returned an error');return d;});
      let c=state(job.cursor);
      if(!c){const saved=a.legiscan?null:await savedLegiscanPerson(env,job.id);c={person:a.legiscan||saved,saved:!!saved,sessions:null,i:0};}
      if(!c.person&&!c.sessions){
        const d=await api('getSessionList',`state=${a.state}`);
        const sessions=list(d.sessions).filter(s=>!Number(s.special)).sort((x,y)=>y.year_start-x.year_start).map(s=>s.session_id).slice(0,8);
        need(sessions.length,'LegiScan has no sessions for this state');
        return {rows:[],next:JSON.stringify({person:null,sessions,i:0})};
      }
      if(!c.person){
        const d=await api('getSessionPeople',`id=${c.sessions[c.i]}`);
        const hit=list(d.sessionpeople?.people).filter(x=>fold(x.last_name)===fold(a.last)&&fold(x.first_name).startsWith(fold(a.first).slice(0,3)));
        need(hit.length<2,'Several LegiScan people match; set legiscan in data/config.json');
        if(hit.length)return {rows:[],next:JSON.stringify({person:hit[0].people_id})};
        need(c.i+1<c.sessions.length,'No LegiScan person matches; set legiscan in data/config.json');
        return {rows:[],next:JSON.stringify({...c,i:c.i+1})};
      }
      const d=await ask('getSponsoredList',`id=${c.person}`);
      // A saved ID that LegiScan no longer accepts is dropped, and the person is looked up again.
      if(c.saved&&d?.status!=='OK')return {rows:[],next:JSON.stringify({person:null,sessions:null,i:0})};
      need(d&&d.status==='OK','LegiScan returned an error');
      const sb=d.sponsoredbills;need(sb&&Array.isArray(sb.bills),'LegiScan sponsored list missing');
      const sessions=Object.fromEntries(list(sb.sessions).map(s=>[s.session_id,s]));
      const rows=sb.bills.map(b=>{const s=sessions[b.session_id]||{};const year=String(s.year_start||'').slice(0,4);
        return {id:'ls-'+b.bill_id,state:a.state,session:s.session_name||String(b.session_id),year,identifier:b.number,title:cut(b.title||null,300),role:null,date:day(b.last_action_date)||null,
          url:year?`https://legiscan.com/${a.state}/bill/${encodeURIComponent(b.number)}/${year}`:null,source:'LegiScan'};});
      return {rows:[...rows,{id:LEGISCAN_PERSON,person:c.person}],next:null};
    },
    summarize:rows=>{const p=rows.find(r=>r.id===LEGISCAN_PERSON);return {...recent(rows.filter(r=>r!==p),100),person:p?.person??null};}},

  // ---------- Statements ----------
  // The Congressional Record: each new daily issue becomes its own job; its speeches are matched to members by Bioguide ID.
  'crec-index':{host:'api.govinfo.gov',label:'Congressional Record issues',scope:'global',
    jobs:()=>[{id:'crec-index',subject:'Congress',args:{collection:'CREC',days:14}}],
    async page(job,a,env){
      const url=job.cursor||`https://api.govinfo.gov/collections/${a.collection}/${daysAgo(a.days)}T00:00:00Z?offsetMark=*&pageSize=100`;
      const d=await requestSource(url,env);need(Array.isArray(d.packages),'GovInfo package list missing');
      return {rows:d.packages.filter(x=>new RegExp(`^${a.collection}-`).test(x.packageId||'')).map(x=>({id:x.packageId,date:day(x.dateIssued)})),next:d.nextPage?cleanURL(d.nextPage):null};
    },
    summarize:rows=>({count:rows.length,packages:rows.map(r=>r.id)}),
    after:async(snapshot,job,ctx)=>{for(const pkg of snapshot.packages)await ctx.addJob(`crec-day:${pkg}`,'crec-day',pkg,{pkg});}},
  // Every daily issue from historyFrom until two weeks ago, by the date it was issued; each one is read once, in full,
  // from its metadata file (one request a day of the Record instead of one for each speech).
  'crec-archive':{host:'api.govinfo.gov',label:'Congressional Record archive',scope:'global',every:WEEK,
    jobs:()=>[{id:'crec-archive',subject:'Congress',args:{collection:'CREC'}}],
    page:(job,a,env,config)=>publishedPage(job,a,env,config,15,/^CREC-\d{4}-\d{2}-\d{2}$/),
    summarize:rows=>({count:rows.length,packages:rows.map(r=>r.id)}),
    after:async(snapshot,job,ctx)=>{for(const pkg of snapshot.packages)await ctx.addJob(`crec-day:${pkg}`,'crec-day',pkg,{pkg,whole:true});}},
  'crec-day':{host:'api.govinfo.gov',label:'Floor speeches',tab:'promises',scope:'global',every:NEVER,jobs:()=>[],
    async page(job,a,env,config){
      const bios=new Map(config.people.filter(p=>p.bioguide).map(p=>[p.bioguide,p.id]));
      if(a.whole)return {rows:crecModsRows(parseXML(await requestSource(`https://api.govinfo.gov/packages/${a.pkg}/mods`,env,{as:'text'})),a.pkg,bios),next:null};
      const c=state(job.cursor)||{ids:null,i:0};
      if(!c.ids){
        const d=await requestSource(`https://api.govinfo.gov/packages/${a.pkg}/granules?offsetMark=*&pageSize=1000`,env);need(Array.isArray(d.granules),'GovInfo granule list missing');
        const ids=d.granules.filter(g=>['HOUSE','SENATE','EXTENSIONS'].includes(g.granuleClass)).map(g=>g.granuleId);
        return {rows:[],next:ids.length?JSON.stringify({ids,i:0}):null};
      }
      const g=await requestSource(`https://api.govinfo.gov/packages/${a.pkg}/granules/${c.ids[c.i]}/summary`,env);
      need(g&&g.granuleId===c.ids[c.i],'GovInfo granule identity mismatch');
      const people=[...new Set(list(g.members).filter(m=>!m.role||/speak/i.test(m.role)).map(m=>bios.get(m.bioGuideId)).filter(Boolean))];
      const rows=people.length?[{id:g.granuleId,title:cut(g.title,300),date:day(g.dateIssued),section:g.granuleClass,people,url:`https://www.govinfo.gov/app/details/${a.pkg}/${g.granuleId}`}]:[];
      return {rows,next:c.i+1<c.ids.length?JSON.stringify({ids:c.ids,i:c.i+1}):null};
    },
    summarize:rows=>({byPerson:byPersonOf(rows)})},
  'hearing-index':{host:'api.govinfo.gov',label:'Hearing transcripts',scope:'global',
    jobs:()=>[{id:'hearing-index',subject:'Congress',args:{collection:'CHRG',days:60}}],
    page:(...x)=>FEEDS['crec-index'].page(...x),
    summarize:rows=>({count:rows.length,packages:rows.map(r=>r.id)}),
    after:async(snapshot,job,ctx)=>{for(const pkg of snapshot.packages)await ctx.addJob(`hearing:${pkg}`,'hearing',pkg,{pkg});}},
  // Every hearing transcript published from historyFrom until two months ago, each read once.
  'hearing-archive':{host:'api.govinfo.gov',label:'Hearing transcript archive',scope:'global',every:WEEK,
    jobs:()=>[{id:'hearing-archive',subject:'Congress',args:{collection:'CHRG'}}],
    page:(job,a,env,config)=>publishedPage(job,a,env,config,60,/^CHRG-\d+/),
    summarize:rows=>({count:rows.length,packages:rows.map(r=>r.id)}),
    after:async(snapshot,job,ctx)=>{for(const pkg of snapshot.packages)await ctx.addJob(`hearing:${pkg}`,'hearing',pkg,{pkg});}},
  hearing:{host:'api.govinfo.gov',label:'Hearing transcript',tab:'promises',scope:'global',every:NEVER,jobs:()=>[],
    async page(job,a,env,config){
      const s=await requestSource(`https://api.govinfo.gov/packages/${a.pkg}/summary`,env);need(s&&s.packageId===a.pkg,'GovInfo package identity mismatch');
      const bios=new Map(config.people.filter(p=>p.bioguide).map(p=>[p.bioguide,p.id]));
      const people=[...new Set(list(s.members).map(m=>bios.get(m.bioGuideId)).filter(Boolean))];
      // dateIssued is when the transcript was published, often months after the hearing; held is the day it was held.
      return {rows:[{id:a.pkg,title:cut(s.title,300),date:day(s.dateIssued),held:day(list(s.heldDates)[0])||null,committees:list(s.committees).map(c=>c.committeeName).filter(Boolean),people,url:`https://www.govinfo.gov/app/details/${a.pkg}`}],next:null};
    },
    summarize:rows=>({byPerson:byPersonOf(rows)})},

  // Vote Smart: interest-group ratings and the Political Courage Test (issue positions), one person per request.
  votesmart:{host:'api.votesmart.org',label:'Vote Smart positions and ratings',tab:'promises',
    jobs:c=>profiled(c).filter(p=>p.ids.votesmart).map(p=>({id:`votesmart:${p.id}`,subject:p.id,args:{candidate:String(p.ids.votesmart)}})),
    async page(job,a,env){
      if(!job.cursor){
        const d=await requestSource(`https://api.votesmart.org/Rating.getCandidateRating?candidateId=${a.candidate}&o=JSON`,env);
        need(d.candidateRating||d.error,'Vote Smart rating response incomplete');
        const rows=list(d.candidateRating?.rating).map(r=>({id:`rating-${r.ratingId||r.sigId}-${r.timespan}`,kind:'rating',group:r.ratingName,rating:r.rating,timespan:r.timespan,text:cut(r.ratingText,300)}));
        return {rows,next:'npat'};
      }
      const d=await requestSource(`https://api.votesmart.org/Npat.getNpat?candidateId=${a.candidate}&o=JSON`,env);
      const n=d.npat;need(n||d.error,'Vote Smart position response incomplete');
      return {rows:[{id:'npat',kind:'npat',took:n?.passed==='Y'?'yes':'no',sections:list(n?.section).map(s=>s.name).filter(Boolean),url:`https://justfacts.votesmart.org/candidate/political-courage-test/${a.candidate}`}],next:null};
    },
    summarize:(rows,a)=>({ratings:rows.filter(r=>r.kind==='rating').sort((x,y)=>String(y.timespan).localeCompare(String(x.timespan))).slice(0,60),npat:rows.find(r=>r.kind==='npat')||null,url:`https://justfacts.votesmart.org/candidate/evaluations/${a.candidate}`})},

  bluesky:{host:'public.api.bsky.app',label:'Bluesky posts',tab:'promises',
    jobs:c=>profiled(c).map(p=>({id:`bluesky:${p.id}`,subject:p.id,args:{handles:blueskyHandles(p)}})).filter(j=>j.args.handles.length),
    async page(job,a,env){
      const i=Number(job.cursor||0),handle=a.handles[i];
      // Bluesky answers 400 for a handle with no account (most often a website domain that isn't used as a handle).
      const d=await requestSource(`https://public.api.bsky.app/xrpc/app.bsky.feed.getAuthorFeed?actor=${encodeURIComponent(handle)}&limit=100&filter=posts_no_replies`,env,{allow:[400,404]});
      if(d===null)return {rows:[{id:`missing:${handle}`,missing:handle}],next:i+1<a.handles.length?String(i+1):null};
      need(Array.isArray(d.feed),'Bluesky feed missing');
      const linksOf=r=>[...new Set([r?.embed?.external?.uri,...list(r?.facets).flatMap(f=>list(f.features).map(x=>x.uri))].map(u=>https(u)).filter(Boolean))];
      const rows=d.feed.map(f=>f.post).filter(p=>p&&p.author?.handle===handle&&!p.reason).map(p=>({id:p.uri,handle,text:cut(p.record?.text,500),date:day(p.record?.createdAt),url:`https://bsky.app/profile/${handle}/post/${p.uri.split('/').pop()}`,links:linksOf(p.record)}));
      return {rows,next:i+1<a.handles.length?String(i+1):null};
    },
    summarize:(rows,a)=>{const posts=rows.filter(r=>!r.missing),missing=rows.filter(r=>r.missing).map(r=>r.missing);
      return {...recent(posts,60),accounts:a.handles.filter(h=>!missing.includes(h)),missing};}},

  // Members' official press releases, from the RSS or Atom feed on their official website: the same messages they
  // often post on X and Facebook, which have no free API.
  press:{host:'official-sites',label:'Press releases',tab:'promises',
    jobs:c=>profiled(c).filter(p=>p.official?.site).map(p=>({id:`press:${p.id}`,subject:p.id,args:{site:p.official.site,feed:p.official.feed||null}})),
    async page(job,a,env){
      // Tried in order until one is a valid feed: the feeds the homepage advertises, the feed congress-legislators
      // lists, then the usual addresses on Senate and House websites.
      const site=a.site.replace(/\/+$/,''),step=Number(job.cursor||0);
      const tries=['homepage',a.feed,`${site}/rss.xml`,`${site}/feed/`,`${site}/news/rss.aspx`,`${site}/press-releases/feed/`];
      const read=async url=>{
        try{const items=feedItems(await requestSource(url,env,{as:'xml',follow:true}));return items?.length?items:null;}
        catch(e){if(e.statusCode===429)throw e;return null;}
      };
      let items=null,used=null;
      if(step===0){
        let html=null;try{html=await requestSource(site+'/',env,{as:'text',follow:true});}catch(e){if(e.statusCode===429)throw e;}
        for(const url of feedLinks(html,site+'/').slice(0,3)){items=await read(url);if(items){used=url;break;}}
      }else if(tries[step]&&!tries.slice(1,step).includes(tries[step])){items=await read(tries[step]);used=tries[step];}
      if(items)return {rows:items.map(i=>({...i,feed:used})),next:null};
      if(step+1<tries.length)return {rows:[],next:String(step+1)};
      throw new SourceError('No press-release feed found on the official website');
    },
    summarize:rows=>({feed:rows[0]?.feed||null,...recent(rows,40)})},

  // Threads posts that mention one of the issues, from Threads keyword search limited to the person's own account.
  threads:{host:'graph.threads.net',label:'Threads posts',tab:'promises',
    jobs:c=>profiled(c).filter(p=>threadsUsers(p).length).map(p=>({id:`threads:${p.id}`,subject:p.id,args:{users:threadsUsers(p)}})),
    async page(job,a,env){
      const terms=Object.entries(THREADS_TERMS),i=Number(job.cursor||0),user=a.users[Math.floor(i/terms.length)],[issue,term]=terms[i%terms.length];
      const u=new URL('https://graph.threads.net/v1.0/keyword_search');
      for(const [k,v] of Object.entries({q:term,search_type:'RECENT',author_username:user,fields:'id,text,timestamp,permalink,username',limit:'25'}))u.searchParams.set(k,v);
      const d=await requestSource(u.href,env);need(Array.isArray(d?.data),'Threads search response missing');
      const rows=d.data.filter(x=>x?.id&&String(x.username||'').toLowerCase()===user&&https(x.permalink)).map(x=>({id:String(x.id),user,text:cut(x.text,500),date:day(x.timestamp),url:https(x.permalink),issues:[issue]}));
      return {rows,next:i+1<terms.length*a.users.length?String(i+1):null};
    },
    // A post that mentions several issues is listed once, with each of them.
    summarize:rows=>{const by=new Map();for(const r of rows){const o=by.get(r.id);if(o)o.issues=[...new Set([...o.issues,...r.issues])];else by.set(r.id,{...r});}return recent([...by.values()],60);}},

  // Every distinct Wayback Machine capture of the campaign site from historyFrom on, so promises can be compared after
  // edits. Read a year at a time; a year that has ended is read once and kept.
  wayback:{host:'web.archive.org',label:'Campaign-site snapshots',tab:'promises',
    jobs:c=>profiled(c).filter(p=>p.campaignSite).map(p=>({id:`wayback:${p.id}`,subject:p.id,args:{site:p.campaignSite,from:c.cycle-1}})),
    async page(job,a,env,config){
      const host=new URL(a.site).host;
      return byPeriod(job,env,{periods:yearsFrom(SINCE(config)),read:async year=>{
        const d=await requestSource(`https://web.archive.org/cdx/search/cdx?url=${encodeURIComponent(host)}&output=json&fl=timestamp,original,statuscode,digest&collapse=digest&filter=statuscode:200&from=${year}&to=${year}&limit=2000`,env);
        need(Array.isArray(d),'Wayback response missing');
        if(!d.length)return {rows:[],next:null};
        need(JSON.stringify(d[0])===JSON.stringify(['timestamp','original','statuscode','digest']),'Wayback columns changed');
        return {rows:d.slice(1).filter(r=>/^\d{14}$/.test(r[0])&&r[0].startsWith(String(year))).map(([ts,original,,digest])=>({id:ts,date:`${ts.slice(0,4)}-${ts.slice(4,6)}-${ts.slice(6,8)}`,digest,url:`https://web.archive.org/web/${ts}/${original}`})),next:null};
      }});
    },
    summarize:(rows,a)=>{const caps=periodRows(rows);return {site:a.site,...history(caps,12),first:caps.map(r=>r.date).sort()[0]||null};}},

  // The campaign website, found by a Tavily search: only a clear match is accepted, otherwise candidates are listed for
  // review. campaignSite in data/config.json confirms or corrects one without a search, and changing it reruns the job.
  // Searched and crawled monthly to stay within Tavily's free monthly credits.
  'campaign-site':{host:'api.tavily.com',label:'Campaign website',tab:'promises',every:30*DAY,rerun:true,
    jobs:c=>c.people.map(p=>({id:`campaign-site:${p.id}`,subject:p.id,args:{name:p.name,chamber:p.chamber,state:p.state,override:p.campaignSite||null}})),
    async page(job,a,env,config){
      if(a.override)return {rows:[{id:job.subject,site:a.override,confidence:'confirmed',source:'config',candidates:[]}],next:null};
      const query=campaignSiteQuery(a,config.year);
      const d=await requestSource('https://api.tavily.com/search',env,{body:{query,search_depth:'basic',max_results:10,country:'united states',exclude_domains:notCampaign.slice(0,150)}});
      need(Array.isArray(d.results),'Tavily search response incomplete');
      return {rows:[{id:job.subject,...chooseCampaignSite(d.results,a),source:'tavily',query}],next:null};
    },
    summarize:rows=>{need(rows.length,'No validated record to publish');return rows[0];},
    // Only an accepted site is crawled. A different accepted site replaces the crawl target and recrawls now.
    after:async(snapshot,job,ctx)=>{if(!snapshot.site)return;await ctx.addJob(`platform:${job.subject}`,'platform',job.subject,{site:snapshot.site});await ctx.setArgs(`platform:${job.subject}`,{site:snapshot.site});}},

  // The accepted site's issue, priority and about pages, split into statements and compared with the previous capture.
  platform:{host:'api.tavily.com',label:'Campaign platform',tab:'promises',every:30*DAY,
    jobs:()=>[],
    async page(job,a,env){
      const d=await requestSource('https://api.tavily.com/crawl',env,{timeout:170_000,body:{url:a.site,max_depth:2,max_breadth:40,limit:20,select_paths:platformPaths,allow_external:false,extract_depth:'basic',format:'markdown',timeout:150,include_usage:true}});
      return {rows:normalizePlatform(d,a.site).map(p=>({...p,credits:d.usage?.credits??null})),next:null};
    },
    summarize:(rows,a,job)=>{const pages=rows.sort((x,y)=>x.url.localeCompare(y.url));
      return {site:a.site,through:job.started_at.slice(0,10),credits:pages[0]?.credits??null,pages:pages.map(p=>({url:p.url,chars:p.chars,sections:p.sections.length})),sections:pages.flatMap(p=>p.sections),
        scope:'Text from the campaign website as crawled. Not reviewed, and not classified by issue.'};},
    compare:(previous,snapshot)=>{snapshot.changes=diffPlatform(previous,snapshot.sections);}},

  factcheck:{host:'factchecktools.googleapis.com',label:'Fact-checks',tab:'promises',
    jobs:c=>profiled(c).map(p=>({id:`factcheck:${p.id}`,subject:p.id,args:{name:p.name}})),
    async page(job,a,env,config){
      const p=config.people.find(x=>x.id===job.subject);
      const u=new URL('https://factchecktools.googleapis.com/v1alpha1/claims:search');u.searchParams.set('query',a.name);u.searchParams.set('languageCode','en-US');u.searchParams.set('pageSize','50');
      // Claims reviewed from historyFrom on, up to four pages of 50.
      u.searchParams.set('maxAgeDays',String(Math.ceil((Date.now()-Date.parse(`${SINCE(config)}-01-01`))/DAY)));
      const c=state(job.cursor)||{n:0};if(c.token)u.searchParams.set('pageToken',c.token);
      const d=await requestSource(u.href,env);need(d&&typeof d==='object','Fact-check response missing');
      const rows=list(d.claims).filter(c=>namesPerson(`${c.claimant||''} ${c.text||''}`,p)).flatMap(c=>list(c.claimReview).filter(r=>https(r.url)).map(r=>({id:r.url,claim:cut(c.text,400),claimant:c.claimant||null,date:day(r.reviewDate)||day(c.claimDate),publisher:r.publisher?.name||r.publisher?.site||null,rating:r.textualRating||null,url:https(r.url)})));
      return {rows,next:d.nextPageToken&&c.n<3?JSON.stringify({token:d.nextPageToken,n:c.n+1}):null};
    },
    summarize:rows=>history(rows,20)},

  youtube:{host:'www.googleapis.com',label:'YouTube videos',tab:'promises',
    jobs:c=>profiled(c).filter(p=>/^UC[\w-]{22}$/.test(p.social?.youtube_id||'')).map(p=>({id:`youtube:${p.id}`,subject:p.id,args:{channel:p.social.youtube_id}})),
    // The uploads back to historyFrom (up to 1,000), read in full about once a month; other days read the newest 50.
    page:(job,a,env,config)=>readBack(job,env,config,async token=>{
      // A channel's uploads playlist is its ID with "UC" replaced by "UU"; reading it costs 1 quota unit, a search 100.
      const d=await requestSource(`https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&maxResults=50&playlistId=UU${a.channel.slice(2)}${token?`&pageToken=${encodeURIComponent(token)}`:''}`,env);
      need(Array.isArray(d.items),'YouTube response missing');
      const items=d.items.map(i=>i.snippet).filter(Boolean);
      const rows=items.filter(s=>s?.resourceId?.videoId&&(!s.videoOwnerChannelId||s.videoOwnerChannelId===a.channel)).map(s=>({id:s.resourceId.videoId,title:cut(s.title,200),date:day(s.publishedAt),url:`https://www.youtube.com/watch?v=${s.resourceId.videoId}`}));
      return {rows,next:d.nextPageToken||null,oldest:day(items.at(-1)?.publishedAt)};
    },{maxPages:20}),
    summarize:rows=>history(scanRows(rows),15)},

  'news-gdelt':{host:'api.gdeltproject.org',label:'News (GDELT)',tab:'promises',
    jobs:c=>profiled(c).map(p=>({id:`news-gdelt:${p.id}`,subject:p.id,args:{name:p.name}})),
    async page(job,a,env){
      const q=encodeURIComponent(`"${a.name}" sourcelang:english`);
      const text=await requestSource(`https://api.gdeltproject.org/api/v2/doc/doc?query=${q}&mode=artlist&format=json&maxrecords=75&sort=datedesc&timespan=3months`,env,{as:'text'});
      let d;try{d=JSON.parse(text||'{}');}catch{throw new SourceError('GDELT returned an error instead of results');}
      const rows=list(d.articles).filter(x=>https(x.url)).map(x=>({id:https(x.url),title:cut(x.title,250),outlet:x.domain||null,date:/^\d{8}/.test(x.seendate||'')?`${x.seendate.slice(0,4)}-${x.seendate.slice(4,6)}-${x.seendate.slice(6,8)}`:null,url:https(x.url),source:'GDELT'}));
      return {rows,next:null};
    },
    summarize:rows=>recent(rows,60)},
  'news-nyt':{host:'api.nytimes.com',label:'News (New York Times)',tab:'promises',
    jobs:c=>profiled(c).map(p=>({id:`news-nyt:${p.id}`,subject:p.id,args:{name:p.name}})),
    // The newest 10 articles of each year from historyFrom on; a year that has ended is read once and kept.
    page:(job,a,env,config)=>byPeriod(job,env,{periods:yearsFrom(SINCE(config)),read:async year=>{
      const d=await requestSource(`https://api.nytimes.com/svc/search/v2/articlesearch.json?q=${encodeURIComponent(`"${a.name}"`)}&begin_date=${year}0101&end_date=${year}1231&sort=newest`,env);
      need(d&&d.status==='OK'&&d.response,'New York Times response incomplete');
      return {rows:list(d.response.docs).filter(x=>https(x.web_url)).map(x=>({id:https(x.web_url),title:cut(x.headline?.main,250),outlet:'New York Times',section:x.section_name||null,summary:cut(x.abstract,300),date:day(x.pub_date),url:https(x.web_url),source:'New York Times'})),next:null};
    }}),
    summarize:rows=>history(periodRows(rows),10)},

  // ---------- Ethics leads ----------
  // Stock trades from three services at once. Each service is filtered to the member by name, chamber and state;
  // the trades are merged (and matched to the official House filing) when a profile is read.
  'trades-bargo':{host:'www.bargo.ai',label:'Stock trades (Bargo)',tab:'ethics',
    jobs:c=>profiled(c).filter(p=>p.inOffice).map(p=>({id:`trades-bargo:${p.id}`,subject:p.id,args:{last:surname(p),first:firstName(p),chamber:p.chamber,state:p.state}})),
    async page(job,a,env){
      const page=Number(job.cursor||0);
      const d=await requestSource(`https://www.bargo.ai/free-apis/congress/v1/trades?member=${encodeURIComponent(a.last)}&chamber=${a.chamber==='S'?'senate':'house'}&limit=250&page=${page}`,env);
      need(Array.isArray(d.trades),'Bargo trades missing');
      const rows=d.trades.filter(t=>fold(t.member).includes(fold(a.last))&&fold(t.member).includes(fold(a.first).slice(0,3))&&String(t.state||'').toUpperCase().startsWith(a.state))
        .map(t=>trade('Bargo',{traded:t.transaction_date,disclosed:t.disclosure_date,ticker:t.ticker,asset:t.asset,type:t.type,low:t.amount_low,high:t.amount_high,amount:t.amount_range,owner:null,link:t.filing_portal}));
      return {rows:numberTrades(rows),next:d.trades.length===250&&page<4?String(page+1):null};
    },
    summarize:rows=>({count:rows.length,rows:top(rows,200,'traded'),rowLimit:200})},
  'trades-eulerpool':{host:'api.eulerpool.com',label:'Stock trades (Eulerpool)',tab:'ethics',
    jobs:c=>profiled(c).filter(p=>p.inOffice).map(p=>({id:`trades-eulerpool:${p.id}`,subject:p.id,args:{name:p.name,last:surname(p),first:firstName(p),chamber:p.chamber}})),
    async page(job,a,env){
      const d=await requestSource(`https://api.eulerpool.com/api/1/alternative/congress-trading?politician=${encodeURIComponent(a.last)}`,env);
      const items=Array.isArray(d)?d:list(d?.data||d?.trades);need(Array.isArray(d)||Array.isArray(d?.data)||Array.isArray(d?.trades),'Eulerpool trades missing');
      const rows=items.filter(t=>fold(t.politician).includes(fold(a.last))&&fold(t.politician).includes(fold(a.first).slice(0,3))&&(!t.chamber||fold(t.chamber).startsWith(a.chamber==='S'?'s':'h')))
        .map(t=>trade('Eulerpool',{traded:t.transactionDate,disclosed:t.disclosureDate,ticker:t.ticker,asset:t.asset||t.assetDescription||null,type:t.type,low:t.amountMin,high:t.amountMax,owner:t.owner||null,link:null}));
      return {rows:numberTrades(rows),next:null};
    },
    summarize:rows=>({count:rows.length,rows:top(rows,200,'traded'),rowLimit:200})},
  'trades-fmp':{host:'financialmodelingprep.com',label:'Stock trades (Financial Modeling Prep)',tab:'ethics',
    jobs:c=>profiled(c).filter(p=>p.inOffice).map(p=>({id:`trades-fmp:${p.id}`,subject:p.id,args:{last:surname(p),first:firstName(p),chamber:p.chamber,state:p.state}})),
    async page(job,a,env){
      const d=await requestSource(`https://financialmodelingprep.com/stable/${a.chamber==='S'?'senate':'house'}-trades-by-name?name=${encodeURIComponent(a.last)}`,env);
      need(Array.isArray(d),'Financial Modeling Prep trades missing');
      const rows=d.filter(t=>fold(t.lastName)===fold(a.last)&&fold(t.firstName).startsWith(fold(a.first).slice(0,3))&&(!t.district||String(t.district).toUpperCase().startsWith(a.state)))
        .map(t=>{const [low,high]=amountRange(t.amount);return trade('Financial Modeling Prep',{traded:t.transactionDate,disclosed:t.disclosureDate,ticker:t.symbol,asset:t.assetDescription,type:t.type,low,high,amount:t.amount,owner:t.owner||null,link:t.link});});
      return {rows:numberTrades(rows),next:null};
    },
    summarize:rows=>({count:rows.length,rows:top(rows,200,'traded'),rowLimit:200})},
  // Trades read straight from each House member's official trade reports (PDFs), listed in the House Clerk's index
  // (the house-fd jobs, each year from historyFrom). An electronically filed report has text; one filed on paper is a scanned
  // image, so it is listed for review. Reports already read are kept from the last run and not downloaded again.
  'trades-house':{host:'disclosures-clerk.house.gov',label:'Stock trades (House Clerk reports)',tab:'ethics',
    jobs:c=>profiled(c).filter(p=>p.inOffice&&p.chamber==='H').map(p=>({id:`trades-house:${p.id}`,subject:p.id,args:{}})),
    async page(job,a,env){
      const c=state(job.cursor);
      if(!c){
        const index=await snapshotsOf(env,'house-fd');need(index.length,'Waiting for the House disclosure index');
        const filings=index.flatMap(x=>x.byPerson?.[job.subject]||[]).filter(f=>f.ptr&&f.url&&f.filed);
        const {rows,done}=await carried(env,job.id);
        const left=filings.filter(f=>!done.has(f.id)).sort((x,y)=>y.filed.localeCompare(x.filed));
        const todo=left.slice(0,80).map(f=>({doc:f.id,filed:f.filed,url:f.url}));
        // More than 80 reports to read (the years back to historyFrom, the first time): the rest follow in the next runs.
        if(left.length>80)rows.push({id:'scan:more',backlog:left.length-80});
        return {rows,next:todo.length?JSON.stringify({todo,i:0}):null};
      }
      const f=c.todo[c.i],found=housePtrTrades(await pdfText(await requestSource(f.url,env,{as:'bytes'})));
      return {rows:officialRows('House Clerk',f,found,'Filed on paper (a scanned image) or not readable as text; check the report'),next:c.i+1<c.todo.length?JSON.stringify({...c,i:c.i+1}):null};
    },
    summarize:officialSummary},
  // Trades read from each senator's reports on the Senate's financial disclosure site (eFD). A session agrees to the
  // site's terms, as a visitor does, searches the senator's trade reports since January of historyFrom, and reads each
  // electronic report's table. A report filed on paper is a scanned image, so it is listed for review.
  'trades-senate':{host:'efdsearch.senate.gov',label:'Stock trades (Senate eFD reports)',tab:'ethics',
    jobs:c=>profiled(c).filter(p=>p.inOffice&&p.chamber==='S').map(p=>({id:`trades-senate:${p.id}`,subject:p.id,args:{last:surname(p),first:[firstName(p),...(p.nicknames||[])],from:c.year-1}})),
    async page(job,a,env,config){
      const c=state(job.cursor);
      if(!c){
        const session=await efdSession(env),reports=await efdReports(env,session,{...a,from:SINCE(config)});
        const {rows,done}=await carried(env,job.id);
        const left=reports.filter(r=>!done.has(r.doc)),todo=left.slice(0,80);
        if(left.length>80)rows.push({id:'scan:more',backlog:left.length-80});
        return {rows,next:todo.length?JSON.stringify({todo,i:0,jar:session.jar}):null};
      }
      const f=c.todo[c.i];let rows;
      if(f.paper)rows=[unreadRow(f,'Filed on paper (a scanned image); check the report')];
      else{
        let html=await efdGet(env,c.jar,f.url);
        // A session that has expired sends the visitor back to the agreement page: agree again once.
        if(html===null){c.jar=(await efdSession(env)).jar;html=await efdGet(env,c.jar,f.url);need(html!==null,'Senate eFD session could not be restored');}
        rows=officialRows('Senate eFD',f,efdTrades(html),'No trades could be read from this report; check the report');
      }
      return {rows,next:c.i+1<c.todo.length?JSON.stringify({...c,i:c.i+1}):null};
    },
    summarize:officialSummary},
  // Net worth from each member's latest annual financial disclosure (the most recent report year, an amendment over
  // the original): a range, since every value on the form is one. House reports are PDFs from the disclosure index;
  // senators' are eFD pages (report type 7). Read weekly; a report filed on paper is listed for checking by hand.
  'net-worth-house':{host:'disclosures-clerk.house.gov',label:'Net worth (House annual disclosures)',tab:'ethics',every:WEEK,
    jobs:c=>profiled(c).filter(p=>p.inOffice&&p.chamber==='H').map(p=>({id:`net-worth-house:${p.id}`,subject:p.id,args:{}})),
    async page(job,a,env){
      const index=await snapshotsOf(env,'house-fd');need(index.length,'Waiting for the House disclosure index');
      const f=index.flatMap(x=>x.byPerson?.[job.subject]||[]).filter(f=>['O','A','C'].includes(f.type)&&f.url&&f.filed)
        .sort((x,y)=>(y.year-x.year)||((y.type==='A')-(x.type==='A'))||y.filed.localeCompare(x.filed))[0];
      need(f,'No annual report in the House disclosure index yet');
      return {rows:[{id:f.id,...holdingsSnapshot(f,houseAnnualHoldings(await pdfText(await requestSource(f.url,env,{as:'bytes'}))))}],next:null};
    },
    summarize:rows=>rows[0]||{}},
  'net-worth-senate':{host:'efdsearch.senate.gov',label:'Net worth (Senate annual disclosures)',tab:'ethics',every:WEEK,
    jobs:c=>profiled(c).filter(p=>p.inOffice&&p.chamber==='S').map(p=>({id:`net-worth-senate:${p.id}`,subject:p.id,args:{last:surname(p),first:[firstName(p),...(p.nicknames||[])]}})),
    async page(job,a,env,config){
      const session=await efdSession(env),reports=await efdReports(env,session,{...a,from:new Date().getUTCFullYear()-2,reportTypes:'[7]'});
      const f=reports[0];need(f,'No annual report on Senate eFD in the last two years');
      const doc={id:f.doc,url:f.url,filed:f.filed,year:f.filed?Number(f.filed.slice(0,4))-1:null,type:'annual'};
      if(f.paper)return {rows:[{id:doc.id,...holdingsSnapshot(doc,{assets:[],debts:[]})}],next:null};
      const html=await efdGet(env,session.jar,f.url,/Assets|Liabilities/i);need(html!==null,'Senate eFD annual report could not be opened');
      return {rows:[{id:doc.id,...holdingsSnapshot(doc,efdAnnualHoldings(html))}],next:null};
    },
    summarize:rows=>rows[0]||{}},
  // The House Clerk's yearly index of every financial disclosure filing (each year from historyFrom): the official record
  // trades are checked against, and the list of trade reports the House reader opens.
  'house-fd':{host:'disclosures-clerk.house.gov',label:'House disclosure filings',tab:'ethics',scope:'global',
    // One index a year from historyFrom on; a year that has ended is checked weekly, for late and amended filings.
    every:a=>ended(a.year)?WEEK:DAY,
    jobs:c=>yearsFrom(SINCE(c),c.year).reverse().map((year,i)=>({id:i?`house-fd:${year}`:'house-fd',subject:'House',args:{year}})),
    async page(job,a,env,config){
      const text=await unzipFile(await requestSource(`https://disclosures-clerk.house.gov/public_disc/financial-pdfs/${a.year}FD.zip`,env,{as:'bytes'}),new RegExp(`^${a.year}FD\\.xml$`,'i'));
      const filings=list(parseXML(text).FinancialDisclosure?.Member);need(filings.length,'House disclosure index is empty');
      const house=config.people.filter(p=>p.inOffice&&p.chamber==='H');
      const rows=[];
      for(const f of filings){
        const p=house.filter(p=>fold(f.Last)===fold(surname(p))&&String(f.StateDst||'').toUpperCase().startsWith(p.state)&&fold(f.First).startsWith(fold(firstName(p)).slice(0,3)));
        if(p.length!==1||!/^\d+$/.test(String(f.DocID)))continue;
        const [m,d,y]=String(f.FilingDate||'').split('/');const filed=y?`${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`:null;
        rows.push({id:String(f.DocID),people:[p[0].id],type:f.FilingType,ptr:f.FilingType==='P',filed,year:Number(f.Year),
          url:`https://disclosures-clerk.house.gov/public_disc/${f.FilingType==='P'?'ptr-pdfs':'financial-pdfs'}/${f.Year}/${f.DocID}.pdf`});
      }
      return {rows,next:null};
    },
    summarize:rows=>({count:rows.length,byPerson:byPersonOf(rows)})},
  // Company industry codes (SEC EDGAR) for every ticker in the members' trades, for the committee-conflict check.
  'sec-sic':{host:'www.sec.gov',label:'Company industry codes',scope:'global',
    jobs:()=>[{id:'sec-sic',subject:'SEC',args:{}}],
    async page(job,a,env){
      let c=state(job.cursor);
      if(!c){
        const tickers=new Set();
        for(const r of (await env.DB.prepare("SELECT s.payload FROM snapshots s JOIN jobs j ON j.id=s.job_id WHERE j.kind LIKE 'trades-%'").all()).results)
          for(const t of JSON.parse(r.payload).rows||[])if(/^[A-Z][A-Z.\-]{0,9}$/.test(t.ticker||''))tickers.add(t.ticker);
        if(!tickers.size)return {rows:[],next:null};
        const map=await requestSource('https://www.sec.gov/files/company_tickers.json',env);need(map&&typeof map==='object','SEC ticker list missing');
        const cik=new Map(Object.values(map).map(x=>[String(x.ticker).toUpperCase(),x.cik_str]));
        const todo=[...tickers].sort().map(t=>[t,cik.get(t)]).filter(([,k])=>k).slice(0,400);
        return {rows:[],next:todo.length?JSON.stringify({todo,i:0}):null};
      }
      const [ticker,cik]=c.todo[c.i];
      const d=await requestSource(`https://data.sec.gov/submissions/CIK${String(cik).padStart(10,'0')}.json`,env);
      need(Number(d.cik)===Number(cik),'SEC company identity mismatch');
      return {rows:[{id:ticker,cik:Number(cik),company:d.name,sic:d.sic?Number(d.sic):null,industry:d.sicDescription||null,sector:sectorForSic(d.sic)}],next:c.i+1<c.todo.length?JSON.stringify({todo:c.todo,i:c.i+1}):null};
    },
    summarize:rows=>({count:rows.length,byTicker:Object.fromEntries(rows.map(r=>[r.id,r]))})},

  courts:{host:'www.courtlistener.com',label:'Court records',tab:'ethics',every:WEEK,
    jobs:c=>profiled(c).map(p=>({id:`courts:${p.id}`,subject:p.id,args:{name:p.name}})),
    // Up to three pages (60 results) of dockets and three of opinions, newest first, with no start date.
    async page(job,a,env){
      const c=state(job.cursor)||{type:'r',n:0},type=c.type;
      const d=await requestSource(c.url||`https://www.courtlistener.com/api/rest/v4/search/?q=${encodeURIComponent(`"${a.name}"`)}&type=${type}&order_by=${encodeURIComponent('dateFiled desc')}`,env);
      need(Array.isArray(d.results),'CourtListener results missing');
      // The search is for the exact full name; every hit is a lead for review, never a scored case.
      const rows=d.results.map(r=>({id:`${type}-${r.docket_id||r.cluster_id}`,kind:type==='r'?'Docket':'Opinion',title:cut(r.caseName,250),court:r.court||r.court_id||null,docket:r.docketNumber||null,date:day(r.dateFiled),
        url:https('https://www.courtlistener.com'+(r.docket_absolute_url||r.absolute_url||''))})).filter(r=>r.url);
      const more=https(d.next)&&c.n<2?{type,n:c.n+1,url:https(d.next)}:type==='r'?{type:'o',n:0}:null;
      return {rows,next:more&&JSON.stringify(more)};
    },
    summarize:rows=>history(rows,15)},
  'fec-legal':{host:'api.open.fec.gov',label:'FEC enforcement records',tab:'ethics',every:WEEK,
    jobs:c=>profiled(c).filter(p=>p.fecCand).map(p=>({id:`fec-legal:${p.id}`,subject:p.id,args:{name:p.name,committee:p.fecCmte||null}})),
    async page(job,a,env,config){
      const p=config.people.find(x=>x.id===job.subject);
      const d=await requestSource(`https://api.open.fec.gov/v1/legal/search/?q=${encodeURIComponent(`"${a.name}"`)}&type=all&hits_returned=50`,env);
      need(d&&typeof d==='object','FEC legal search response missing');
      const pick=(arr,kind,path)=>list(arr).filter(m=>{const t=`${m.name||''} ${list(m.respondents).join(' ')}`;return namesPerson(t,p)||namesCampaign(t,p)||(a.committee&&m.committee_id===a.committee);})
        .map(m=>({id:`${kind}-${m.no||m.case_no}`,kind:{mur:'Enforcement case (MUR)',af:'Administrative fine',adr:'Alternative dispute resolution',ao:'Advisory opinion'}[kind],title:cut(m.name||m.case_name,250),
          opened:day(m.open_date),closed:day(m.close_date),date:day(m.close_date)||day(m.open_date)||day(m.issue_date),url:`https://www.fec.gov/data/legal/${path}/${m.no||m.case_no}/`}));
      return {rows:[...pick(d.murs,'mur','matter-under-review'),...pick(d.admin_fines,'af','administrative-fine'),...pick(d.adrs,'adr','alternative-dispute-resolution'),...pick(d.advisory_opinions,'ao','advisory-opinions')],next:null};
    },
    summarize:rows=>history(rows,15)},
  doj:{host:'www.justice.gov',label:'DOJ press releases',tab:'ethics',
    jobs:c=>profiled(c).map(p=>({id:`doj:${p.id}`,subject:p.id,args:{last:surname(p)}})),
    // Releases with their surname in the title, back to historyFrom (up to 500), read in full about once a month;
    // other days read the newest 50.
    page:(job,a,env,config)=>readBack(job,env,config,async n=>{
      const p=config.people.find(x=>x.id===job.subject);
      const d=await requestSource(`https://www.justice.gov/api/v1/press_releases.json?parameters%5Btitle%5D=${encodeURIComponent(a.last)}&sort=date&direction=DESC&pagesize=50&page=${n||0}`,env);
      need(Array.isArray(d.results),'DOJ press releases missing');
      const when=r=>/^\d+$/.test(String(r.date))?new Date(Number(r.date)*1000).toISOString().slice(0,10):day(r.date);
      const rows=d.results.filter(r=>namesPerson(`${r.title||''} ${strip(r.body||r.teaser||'')}`,p)).map(r=>({id:r.uuid||r.url,title:cut(r.title,250),date:when(r),url:https(r.url),
        dockets:docketsIn(`${r.title||''} ${strip(r.body||r.teaser||'')}`)})).filter(r=>r.url);
      return {rows,next:d.results.length>=50?(n||0)+1:null,oldest:d.results.length?when(d.results.at(-1)):null};
    },{maxPages:10}),
    summarize:rows=>history(scanRows(rows),15)},

  // ---------- Money ----------
  // Donor organizations: itemized individual contributions grouped by the donor's employer (FEC). Names are never kept.
  // The campaign's money in each election cycle from historyFrom on, from the FEC's totals for its committee (one
  // request covers every cycle): raised, from individuals and from PACs, spent, and cash at the end.
  'campaign-history':{host:'api.open.fec.gov',label:'Campaign money by cycle',tab:'finance',
    jobs:c=>profiled(c).filter(p=>p.fecCmte).map(p=>({id:`campaign-history:${p.id}`,subject:p.id,args:{committee:p.fecCmte}})),
    async page(job,a,env,config){
      const d=await requestSource(`https://api.open.fec.gov/v1/committee/${a.committee}/totals/?per_page=20&sort=-cycle`,env);
      need(Array.isArray(d.results),'Campaign totals missing');
      // A cycle whose totals don't check out (another committee, missing dates) is left out rather than shown.
      const ok=r=>{try{return {...normalizeCampaign(r,a.committee,r.cycle),id:String(r.cycle)};}catch{return null;}};
      return {rows:d.results.filter(r=>Number(r.cycle)>=SINCE(config)).map(ok).filter(Boolean),next:null};
    },
    summarize:rows=>({cycles:rows.sort((x,y)=>y.cycle-x.cycle)})},
  // Money from individual donors in the current cycle, by the size of each gift: the FEC's five size groups for the
  // campaign committee, checked against the committee's itemized and unitemized totals (public/donor-sizes.js).
  'donor-sizes':{host:'api.open.fec.gov',label:'Donors by gift size',tab:'finance',
    jobs:c=>profiled(c).filter(p=>p.fecCmte).map(p=>({id:`donor-sizes:${p.id}`,subject:p.id,args:{committee:p.fecCmte,cycle:c.cycle}})),
    async page(job,a,env){
      const s=await requestSource(`https://api.open.fec.gov/v1/schedules/schedule_a/by_size/?committee_id=${a.committee}&cycle=${a.cycle}&per_page=100`,env);
      need(Array.isArray(s.results),'FEC gift-size totals missing');
      const t=await requestSource(`https://api.open.fec.gov/v1/committee/${a.committee}/totals/?cycle=${a.cycle}&per_page=20`,env);
      need(Array.isArray(t.results),'Campaign totals missing');
      const tot=t.results.find(r=>r.committee_id===a.committee&&Number(r.cycle)===Number(a.cycle));
      need(tot,'No campaign report for this committee and cycle yet');
      const rows=s.results.filter(r=>r.committee_id===a.committee&&Number(r.cycle)===Number(a.cycle)).map(r=>({id:`size-${r.size}`,size:Number(r.size),total:Number(r.total)||0,count:Number(r.count)||0}));
      return {rows:[...rows,{id:'totals',individual_itemized_contributions:tot.individual_itemized_contributions??null,individual_unitemized_contributions:tot.individual_unitemized_contributions??null,
        coverage_start_date:day(tot.coverage_start_date),coverage_end_date:day(tot.coverage_end_date)}],next:null};
    },
    summarize:(rows,a)=>({...donorSizes(rows.filter(r=>r.id!=='totals'),rows.find(r=>r.id==='totals')||{}),cycle:a.cycle,committee:a.committee,
      source:`https://www.fec.gov/data/committee/${a.committee}/?cycle=${a.cycle}&tab=raising`})},
  // Each election cycle from historyFrom on (a cycle that has ended is read once and kept). The top organizations, and
  // the sources that follow them, are the current cycle's; the earlier cycles' top 10 are kept by cycle.
  donors:{host:'api.open.fec.gov',label:'Donors by employer',tab:'finance',
    jobs:c=>profiled(c).filter(p=>p.fecCmte).map(p=>({id:`donors:${p.id}`,subject:p.id,args:{committee:p.fecCmte,cycle:c.cycle}})),
    page:(job,a,env,config)=>byPeriod(job,env,{periods:cyclesFrom(SINCE(config),a.cycle),read:async cycle=>{
      const d=await requestSource(`https://api.open.fec.gov/v1/schedules/schedule_a/by_employer/?committee_id=${a.committee}&cycle=${cycle}&sort=-total&per_page=100`,env);
      need(Array.isArray(d.results),'FEC employer totals missing');
      return {rows:d.results.filter(r=>r.committee_id===a.committee).map(r=>({id:String(r.employer||''),employer:r.employer,total:Number(r.total)||0,count:Number(r.count)||0})),next:null};
    }}),
    summarize:(rows,a)=>{
      const all=periodRows(rows),org=r=>({id:String(r.employer||''),employer:r.employer,total:r.total,count:r.count});
      const pick=list=>list.filter(r=>isOrg(r.employer)).sort((x,y)=>y.total-x.total).map(org);
      const now=all.filter(r=>Number(r.period??a.cycle)===Number(a.cycle)),orgs=pick(now),by={};
      for(const r of all)if(r.period!=null&&Number(r.period)!==Number(a.cycle))(by[r.period]||=[]).push(r);
      return {orgs:orgs.slice(0,50),count:orgs.length,notOrgs:now.length-orgs.length,cycle:a.cycle,
        cycles:Object.fromEntries(Object.entries(by).sort((x,y)=>y[0]-x[0]).map(([c,l])=>[c,pick(l).slice(0,10)]))};
    },
    after:async(snapshot,job,ctx)=>{const orgs=snapshot.orgs.slice(0,20).map(o=>o.employer);for(const k of ['donor-months','lobbying','regulations','sam'])await ctx.setArgs(`${k}:${job.subject}`,{orgs});}},
  'donor-months':{host:'api.open.fec.gov',label:'Top donors by month',tab:'finance',
    jobs:c=>profiled(c).filter(p=>p.fecCmte).map(p=>({id:`donor-months:${p.id}`,subject:p.id,args:{committee:p.fecCmte,cycle:c.cycle,orgs:[]}})),
    // The current top organizations' gifts in each cycle from historyFrom on; an ended cycle is read once and kept
    // (read again when the top organizations change).
    async page(job,a,env,config){
      if(!a.orgs?.length)return {rows:[],next:null};
      return byPeriod(job,env,{periods:cyclesFrom(SINCE(config),a.cycle),tag:a.orgs.join('|'),read:async(cycle,cursor)=>{
        const u=new URL('https://api.open.fec.gov/v1/schedules/schedule_a/');
        for(const[k,v]of Object.entries({committee_id:a.committee,two_year_transaction_period:cycle,is_individual:'true',per_page:100,sort:'-contribution_receipt_date'}))u.searchParams.set(k,v);
        for(const o of a.orgs)u.searchParams.append('contributor_employer',o);
        const url=cursor||u.href,d=await requestSource(url,env);
        const rows=d.results.map(r=>{need(r.sub_id&&r.committee_id===a.committee,'Wrong recipient committee in FEC response');
          return {id:String(r.sub_id),employer:r.contributor_employer,date:day(r.contribution_receipt_date),amount:Number(r.contribution_receipt_amount)||0,memo:r.memo_code==='X'};});
        return {rows,next:fecNext(url,d)};
      }});
    },
    summarize:(rows,a)=>{
      rows=periodRows(rows);
      const m={};for(const r of rows){if(r.memo||!r.date)continue;const key=a.orgs.find(o=>fold(o)===fold(r.employer))||r.employer;((m[key]||={})[r.date.slice(0,7)]||=0);m[key][r.date.slice(0,7)]+=r.amount;}
      for(const o of Object.values(m))for(const k in o)o[k]=Math.round(o[k]*100)/100;
      return {orgs:a.orgs,months:m,count:rows.length};
    }},
  // Lobbying reports filed for each top donor organization in each year from historyFrom on (up to 25 a year), with the
  // bills each report names. A year that has ended is read once and kept.
  lobbying:{host:'lda.gov',label:'Lobbying filings',tab:'finance',
    jobs:c=>profiled(c).filter(p=>p.fecCmte).map(p=>({id:`lobbying:${p.id}`,subject:p.id,args:{orgs:[],year:c.year}})),
    page:(job,a,env,config)=>byPeriod(job,env,{periods:yearsFrom(SINCE(config)).reverse().flatMap(y=>(a.orgs||[]).map(o=>`${y}|${o}`)),closed:p=>ended(String(p).split('|')[0]),read:async p=>{
      const year=Number(p.slice(0,4)),org=p.slice(5);
      const d=await requestSource(`https://lda.gov/api/v1/filings/?client_name=${encodeURIComponent(org)}&filing_year=${year}&page_size=25`,env);
      need(Array.isArray(d.results),'LDA filings missing');
      const rows=d.results.filter(f=>f.filing_uuid).map(f=>{const acts=list(f.lobbying_activities);
        return {id:f.filing_uuid,org,client:f.client?.name||null,registrant:f.registrant?.name||null,period:f.filing_period_display||f.filing_period||null,year:f.filing_year,
          amount:Number(f.income??f.expenses)||null,issues:[...new Set(acts.map(x=>x.general_issue_code_display||x.general_issue_code).filter(Boolean))],
          bills:[...new Set(acts.flatMap(x=>billsInText(x.description,congressOf(Number(f.filing_year)||year))))],date:day(f.dt_posted),url:https(f.filing_document_url)};});
      return {rows,next:null};
    }}),
    summarize:rows=>history(periodRows(rows),60)},
  // Lobbying reports that name a key bill (LDA.gov), in the two years of its Congress: how many there are, and of the
  // reports read (up to 100 a year), how many were filed for unions. Shown with the Workers > Profit bill scores as
  // context, never scored: a report says a client lobbied on the bill, not which side it was on.
  'bill-lobbying':{host:'lda.gov',label:'Lobbying on key bills',tab:'pvp',scope:'global',every:WEEK,
    jobs:c=>(c.keyBills||[]).filter(k=>BILL_ABBR[k.split('-')[1]]).map(k=>({id:`bill-lobbying:${k}`,subject:k,args:{bill:k}})),
    async page(job,a,env){
      const [congress,type,number]=a.bill.split('-'),first=1787+2*Number(congress),cur=job.cursor?JSON.parse(job.cursor):{year:first,page:1};
      const u=new URL('https://lda.gov/api/v1/filings/');
      for(const [k,v] of Object.entries({filing_specific_lobbying_issues:`${BILL_ABBR[type]} ${number}`,filing_year:cur.year,page_size:25,page:cur.page}))u.searchParams.set(k,v);
      const d=await requestSource(u.href,env,{allow404:true});
      const results=list(d?.results).filter(f=>f.filing_uuid);
      const rows=results.map(f=>{const acts=list(f.lobbying_activities),client=f.client?.name||null;
        return {id:f.filing_uuid,year:Number(f.filing_year)||cur.year,total:Number(d.count)||0,client,registrant:f.registrant?.name||null,union:isUnion(client),
          named:acts.some(x=>billsInText(x.description,Number(congress)).includes(a.bill)),url:https(f.filing_document_url)};});
      // The search must have matched on the bill: if most reports returned don't name it, the filter wasn't applied.
      need(rows.length<10||rows.filter(r=>r.named).length>=rows.length/2,`LDA.gov did not filter reports by ${BILL_ABBR[type]} ${number}; nothing counted`);
      const next=cur.page<4&&d?.next?{year:cur.year,page:cur.page+1}:cur.year<first+1?{year:first+1,page:1}:null;
      return {rows,next:next&&JSON.stringify(next)};
    },
    summarize:(rows,a)=>{
      const named=rows.filter(r=>r.named),byYear={};for(const r of rows)byYear[r.year]=Math.max(byYear[r.year]||0,r.total);
      const clients=list=>[...new Set(list.map(r=>r.client).filter(Boolean))];
      return {bill:a.bill,total:Object.values(byYear).reduce((t,n)=>t+n,0),read:named.length,unions:named.filter(r=>r.union).length,others:named.filter(r=>!r.union).length,
        unionClients:clients(named.filter(r=>r.union)).slice(0,8),otherClients:clients(named.filter(r=>!r.union)).slice(0,8)};
    }},
  fara:{host:'efile.fara.gov',label:'Foreign agent registrations',tab:'finance',scope:'global',every:WEEK,
    jobs:()=>[{id:'fara',subject:'FARA',args:{}}],
    async page(job,a,env){
      const d=await requestSource('https://efile.fara.gov/api/v1/Registrants/json/Active',env);
      const rows=list(d?.REGISTRANTS_ACTIVE?.ROW);need(rows.length,'FARA registrant list missing');
      return {rows:rows.map(r=>({id:String(r.Registration_Number),name:r.Name,business:r.Business_Name||null,date:r.Registration_Date||null,url:`https://efile.fara.gov/ords/fara/f?p=1381:200:::NO:RP,200:P200_REG_NUMBER:${r.Registration_Number}`})),next:null};
    },
    summarize:rows=>({count:rows.length,rows})},
  regulations:{host:'api.regulations.gov',label:'Comments on federal rules',tab:'finance',
    jobs:c=>profiled(c).filter(p=>p.fecCmte).map(p=>({id:`regulations:${p.id}`,subject:p.id,args:{orgs:[]}})),
    async page(job,a,env){
      const i=Number(job.cursor||0),org=a.orgs?.[i];if(!org)return {rows:[],next:null};
      // The newest 250 comments that name the organization (one request each; the most a page holds).
      const d=await requestSource(`https://api.regulations.gov/v4/comments?filter%5BsearchTerm%5D=${encodeURIComponent(`"${org}"`)}&sort=-postedDate&page%5Bsize%5D=250`,env);
      need(Array.isArray(d.data),'Regulations.gov comments missing');
      const rows=d.data.filter(x=>x.id&&x.type==='comments').map(x=>({id:x.id,org,title:cut(x.attributes?.title,250),agency:x.attributes?.agencyId||null,date:day(x.attributes?.postedDate),url:`https://www.regulations.gov/comment/${encodeURIComponent(x.id)}`}));
      return {rows,next:i+1<a.orgs.length?String(i+1):null};
    },
    summarize:rows=>history(rows,20)},
  sam:{host:'api.sam.gov',label:'Company federal IDs',tab:'finance',
    jobs:c=>profiled(c).filter(p=>p.fecCmte).map(p=>({id:`sam:${p.id}`,subject:p.id,args:{orgs:[]}})),
    async page(job,a,env){
      const i=Number(job.cursor||0),org=a.orgs?.[i];if(!org)return {rows:[],next:null};
      const d=await requestSource(`https://api.sam.gov/entity-information/v3/entities?legalBusinessName=${encodeURIComponent(org)}&registrationStatus=A&includeSections=entityRegistration`,env);
      need(Array.isArray(d.entityData)||Number(d.totalRecords)===0,'SAM.gov entity response missing');
      const hits=list(d.entityData).map(e=>e.entityRegistration).filter(e=>e?.ueiSAM);
      const exact=hits.filter(e=>fold(e.legalBusinessName).replace(/[^a-z0-9]/g,'')===fold(org).replace(/[^a-z0-9]/g,''));
      // Only a single exact name match is used; anything else is left for review.
      const row=exact.length===1?{id:org,org,uei:exact[0].ueiSAM,name:exact[0].legalBusinessName,review:null}:{id:org,org,uei:null,name:null,review:hits.length?`${hits.length} possible matches`:'No registered entity found'};
      return {rows:[row],next:i+1<a.orgs.length?String(i+1):null};
    },
    summarize:rows=>({rows}),
    after:async(snapshot,job,ctx)=>ctx.setArgs(`contracts:${job.subject}`,{orgs:snapshot.rows.filter(r=>r.uei).map(r=>({org:r.org,uei:r.uei}))})},
  contracts:{host:'api.usaspending.gov',label:'Federal contracts',tab:'finance',
    jobs:c=>profiled(c).filter(p=>p.fecCmte).map(p=>({id:`contracts:${p.id}`,subject:p.id,args:{orgs:[],cycle:c.cycle}})),
    // The ten largest awards to each organization from the federal fiscal year that includes historyFrom (it starts
    // the October before) through this cycle's.
    async page(job,a,env,config){
      const i=Number(job.cursor||0),o=a.orgs?.[i];if(!o)return {rows:[],next:null};
      const d=await requestSource('https://api.usaspending.gov/api/v2/search/spending_by_award/',env,{body:{
        filters:{recipient_search_text:[o.uei],award_type_codes:['A','B','C','D'],time_period:[{start_date:`${SINCE(config)-1}-10-01`,end_date:`${a.cycle}-09-30`}]},
        fields:['Award ID','Recipient Name','Award Amount','Awarding Agency','Start Date','Description','generated_internal_id'],page:1,limit:10,sort:'Award Amount',order:'desc'}});
      need(Array.isArray(d.results),'USAspending results missing');
      const rows=d.results.filter(r=>r.generated_internal_id).map(r=>({id:r.generated_internal_id,org:o.org,uei:o.uei,award:r['Award ID'],amount:Number(r['Award Amount'])||0,agency:r['Awarding Agency']||null,date:day(r['Start Date']),description:cut(r.Description,200),url:`https://www.usaspending.gov/award/${encodeURIComponent(r.generated_internal_id)}`}));
      return {rows,next:i+1<a.orgs.length?String(i+1):null};
    },
    summarize:rows=>({count:rows.length,total:Math.round(rows.reduce((n,r)=>n+r.amount,0)),rows:rows.sort((x,y)=>y.amount-x.amount).slice(0,60)})},
  // Nonprofits among the groups spending in the race: their own filings, from ProPublica's Nonprofit Explorer.
  'outside-groups':{host:'projects.propublica.org',label:'Groups behind outside spending',tab:'finance',
    jobs:c=>profiled(c).filter(p=>p.fecCand).map(p=>({id:`outside-groups:${p.id}`,subject:p.id,args:{groups:[]}})),
    async page(job,a,env,config){
      const i=Number(job.cursor||0),g=a.groups?.[i];if(!g)return {rows:[],next:null};
      const d=await requestSource(`https://projects.propublica.org/nonprofits/api/v2/search.json?q=${encodeURIComponent(`"${g}"`)}`,env);
      need(Array.isArray(d.organizations),'Nonprofit Explorer response missing');
      const exact=d.organizations.filter(o=>fold(o.name).replace(/[^a-z0-9]/g,'')===fold(g).replace(/[^a-z0-9]/g,''));
      if(exact.length!==1)return {rows:[{id:g,group:g,ein:null,review:exact.length?'Several nonprofits share this name':'Not found as a nonprofit (it may be a super PAC or a 527 group)',irs527:`https://forms.irs.gov/app/pod/basicSearch/search?searchType=1&organizationName=${encodeURIComponent(g)}`}],next:i+1<a.groups.length?String(i+1):null};
      const ein=exact[0].ein,o=await requestSource(`https://projects.propublica.org/nonprofits/api/v2/organizations/${ein}.json`,env);
      need(Number(o.organization?.ein)===Number(ein),'Nonprofit identity mismatch');
      return {rows:[{id:g,group:g,ein,name:o.organization.name,subsection:o.organization.subsection_code??exact[0].subseccd??null,state:o.organization.state||null,
        filings:list(o.filings_with_data).filter(f=>Number(f.tax_prd_yr)>=SINCE(config)-1).slice(0,12).map(f=>({year:f.tax_prd_yr,revenue:f.totrevenue??null,expenses:f.totfuncexpns??null,pdf:https(f.pdf_url)})),url:`https://projects.propublica.org/nonprofits/organizations/${ein}`}],next:i+1<a.groups.length?String(i+1):null};
    },
    summarize:rows=>({rows})},

  // ---------- Committees (official lists) ----------
  'senate-committees':{host:'www.senate.gov',label:'Senate committee lists',tab:'match',scope:'global',
    jobs:()=>[{id:'senate-committees',subject:'Senate',args:{}}],
    async page(job,a,env,config){
      const d=await requestSource('https://www.senate.gov/legislative/LIS_MEMBER/cvc_member_data.xml',env,{json:false});
      const senators=list(d.senators?.senator||d.senator_list?.senator);need(senators.length,'Senate member list missing');
      const byLis=new Map(config.people.filter(p=>p.lis).map(p=>[p.lis,p.id]));
      const rows=senators.map(s=>({lis:s['@_lis_member_id']||s.lis_member_id,s})).filter(x=>byLis.has(x.lis)).map(({lis,s})=>({id:byLis.get(lis),people:[byLis.get(lis)],
        committees:list(s.committees?.committee).map(c=>({id:committeeCode(c['@_code']),name:typeof c==='string'?c:c['#text']||null})).filter(c=>c.id)}));
      return {rows,next:null};
    },
    summarize:rows=>({byPerson:Object.fromEntries(rows.map(r=>[r.id,r.committees]))})},
  'house-committees':{host:'clerk.house.gov',label:'House committee lists',tab:'match',scope:'global',
    jobs:()=>[{id:'house-committees',subject:'House',args:{}}],
    async page(job,a,env,config){
      const d=await requestSource('https://clerk.house.gov/xml/lists/MemberData.xml',env,{json:false});
      const members=list(d.MemberData?.members?.member);need(members.length,'House member list missing');
      const byBio=new Map(config.people.filter(p=>p.bioguide).map(p=>[p.bioguide,p.id]));
      const rows=members.map(m=>({bio:m['member-info']?.bioguideID,m})).filter(x=>byBio.has(x.bio)).map(({bio,m})=>({id:byBio.get(bio),people:[byBio.get(bio)],
        committees:[...list(m['committee-assignments']?.committee).map(c=>c['@_comcode']),...list(m['committee-assignments']?.subcommittee).map(c=>c['@_subcomcode'])].map(c=>({id:committeeCode(c)})).filter(c=>c.id)}));
      return {rows,next:null};
    },
    summarize:rows=>({byPerson:Object.fromEntries(rows.map(r=>[r.id,r.committees]))})},
};
// Official committee codes to congress-legislators IDs: House "AG00" -> "HSAG", "AG15" -> "HSAG15"; Senate "SSAP00" ->
// "SSAP"; Congress.gov system codes "hsii24" -> "HSII24". The House Intelligence committee is "HLIG" in both.
export function committeeCode(code){
  const c=String(code||'').toUpperCase();
  let m=/^([A-Z]{4})(\d{2})$/.exec(c);if(m)return m[2]==='00'?m[1]:m[1]+m[2];
  m=/^([A-Z]{2})(\d{2})$/.exec(c);if(m)return (m[1]==='IG'?'HL':'HS')+m[1]+(m[2]==='00'?'':m[2]);
  return null;
}
// Employers that are not organizations are left out of the donor-organization list.
const NOT_ORG=/^(none|n\/?a|not employed|unemployed|retired|self[- ]?employed|self|homemaker|student|information requested( per best efforts)?|requested|disabled|entrepreneur|attorney|physician|consultant|refused|unknown|-)$/i;
export const isOrg=e=>!!e&&!NOT_ORG.test(String(e).trim());

// ---------- trades ----------
const TYPES={purchase:'purchase',buy:'purchase',p:'purchase',sale:'sale',sell:'sale',s:'sale','sale (full)':'sale','sale (partial)':'sale','s (partial)':'sale',exchange:'exchange',e:'exchange'};
export function amountRange(text){const n=String(text||'').replace(/,/g,'').match(/\$?(\d+)\s*-\s*\$?(\d+)/);return n?[Number(n[1]),Number(n[2])]:[null,null];}
function trade(source,t){
  const traded=day(t.traded),disclosed=day(t.disclosed);need(traded,'Trade date missing');
  const type=TYPES[fold(t.type).replace(/_/g,' ')]||'other',ticker=t.ticker&&/^[A-Za-z][A-Za-z.\-]{0,9}$/.test(t.ticker)?t.ticker.toUpperCase():null;
  const low=t.low==null?null:Number(t.low),high=t.high==null?null:Number(t.high);
  return {source,traded,disclosed,ticker,asset:cut(t.asset,160),type,low,high,amount:t.amount||(low!=null?`$${low.toLocaleString('en-US')} - $${(high??low).toLocaleString('en-US')}`:null),owner:t.owner?fold(t.owner):null,link:https(t.link)};
}
// Identical trades within one service (two lots on the same day) keep separate IDs.
function numberTrades(rows){const seen={};return rows.map(r=>{const k=tradeKey(r);seen[k]=(seen[k]||0)+1;return {...r,id:`${k}#${seen[k]}`};});}
export const tradeKey=t=>[t.traded,t.ticker||fold(t.asset).replace(/[^a-z0-9]/g,'').slice(0,40),t.type,t.low,t.high].join('|');

// ---------- the official trade reports (Periodic Transaction Reports) ----------
const mdy=v=>{const m=String(v||'').match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);return m?`${m[3]}-${m[1].padStart(2,'0')}-${m[2].padStart(2,'0')}`:null;};
// The House's asset codes: stocks and options are single companies; funds and bonds are not.
const HOUSE_ASSET={ST:'stock',OP:'option',PS:'stock',EF:'fund',MF:'fund',ET:'fund',CS:'bond',GS:'bond',OT:'other'};
const HOUSE_OWNER={SP:'spouse',JT:'joint',DC:'child'};
// Lines that label a row's extra details (filing status, subholding, description...) or repeat the table header.
const PTR_LABEL=/^(F\s*S|S\s*O|D|L|C|Filing\s*Status|Subholding\s*Of|Description|Location|Comments?)\s*:/i;
const PTR_HEADER=/\b(Notification|Cap\.?\s*Gains|Transaction\s+Type|Owner\s+Asset|Periodic\s+Transaction|Filing\s+ID|Clerk of the House|Digitally Signed|I CERTIFY|Initial Public Offerings)\b/i;
const ASSET_TAG=/\[([A-Z]{2})\]/;
// One row of an electronically filed House trade report: the type, the two dates and the amount anchor it, and the
// asset (with its ticker and [ST]-style code) is the text just before it, or wraps onto the next line.
const PTR_ROW=/(?:^|[ \t\n])(P|S\s*\(partial\)|S|E)[ \t]+(\d{1,2}\/\d{1,2}\/\d{4})\s+(\d{1,2}\/\d{1,2}\/\d{4})\s+((?:Spouse\/DC\s+)?Over\s+\$[\d,]+|\$[\d,]+\s*-\s*\$[\d,]+|\$[\d,]+\s*-(?!\s*\$)|\$[\d,]+)/g;
export function housePtrTrades(text){
  const t=String(text||''),hits=[...t.matchAll(PTR_ROW)],out=[];
  hits.forEach((m,k)=>{
    const start=m.index+(m[0].length-m[0].trimStart().length),end=m.index+m[0].length;
    const prevEnd=k?hits[k-1].index+hits[k-1][0].length:0,nextStart=k+1<hits.length?hits[k+1].index:t.length;
    // Before: the rest of the row's own line, and earlier lines back to the previous row's details, its asset code,
    // or a line starting with an owner code (which starts this row).
    const before=t.slice(prevEnd,start).split('\n'),mine=[before.pop()];
    for(const line of before.reverse()){const l=line.trim();if(!l)continue;if(PTR_LABEL.test(l)||PTR_HEADER.test(l)||ASSET_TAG.test(l))break;mine.unshift(l);if(/^(SP|JT|DC)\s/.test(l))break;}
    let asset=mine.join(' '),amount=m[4].replace(/\s+/g,' ').trim();
    // After: a range that wraps ("$1,001 -" then "$15,000") ends on the next line, and an asset that wraps past the
    // dates continues there too, up to its [ST]-style code.
    const rest=t.slice(end,nextStart).split('\n').slice(1,4).map(l=>l.trim()).filter(Boolean);
    if(/-$/.test(amount)){const top=rest.slice(0,2).join(' ').match(/\$[\d,]+/);amount=top?`${amount} ${top[0]}`:amount.replace(/\s*-$/,'');}
    if(!ASSET_TAG.test(asset))
      for(const l of rest){if(PTR_LABEL.test(l)||PTR_HEADER.test(l)||/^(SP|JT|DC)\s/.test(l))break;asset+=' '+l.replace(/\$[\d,]+/g,'');if(ASSET_TAG.test(l))break;}
    asset=asset.replace(/\s+/g,' ').trim();
    const owner=asset.match(/^(SP|JT|DC)\s+/),code=asset.match(ASSET_TAG)?.[1]||null;
    const ticker=[...asset.matchAll(/\(([A-Z][A-Z0-9.\-]{0,9})\)/g)].map(x=>x[1]).filter(x=>x!=='partial').pop()||null;
    const name=asset.replace(/^(SP|JT|DC)\s+/,'').replace(ASSET_TAG,'').replace(ticker?`(${ticker})`:/$^/,'').replace(/\s+/g,' ').trim().replace(/\s*-\s*$/,'');
    const [low,high]=amountRange(amount);
    out.push({traded:mdy(m[2]),notified:mdy(m[3]),type:m[1].replace(/\s+/g,' '),ticker,asset:name||null,assetType:HOUSE_ASSET[code]||(code?'other':null),owner:owner?HOUSE_OWNER[owner[1]]:'self',
      low,high:high??(/^(Spouse\/DC\s+)?Over/.test(amount)?null:low),amount});
  });
  return out;
}
// A Senate eFD report's transaction table. Columns are found by their headings.
const SENATE_OWNER=v=>/spouse/i.test(v)?'spouse':/joint/i.test(v)?'joint':/child|dependent/i.test(v)?'child':'self';
const SENATE_ASSET=v=>/option/i.test(v)?'option':/stock/i.test(v)?'stock':/fund|etf/i.test(v)?'fund':/bond|municipal|treasury|security|note/i.test(v)?'bond':v?'other':null;
export function efdTrades(html){
  const out=[];
  for(const [table] of String(html||'').matchAll(/<table[\s\S]*?<\/table>/gi)){
    if(!/Transaction\s*Date/i.test(table))continue;
    const heads=[...(table.match(/<thead[\s\S]*?<\/thead>/i)?.[0]||'').matchAll(/<th[^>]*>([\s\S]*?)<\/th>/gi)].map(m=>fold(strip(m[1])));
    const at=name=>heads.findIndex(h=>h===name||h.startsWith(name+' '));
    const ci={traded:at('transaction date'),owner:at('owner'),ticker:at('ticker'),asset:at('asset name'),assetType:at('asset type'),type:at('type'),amount:at('amount')};
    need(ci.traded>=0&&ci.type>=0&&ci.amount>=0,'Senate report table changed');
    for(const [,row] of (table.match(/<tbody[\s\S]*?<\/tbody>/i)?.[0]||'').matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)){
      const cells=[...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map(m=>m[1]),cell=i=>i>=0&&cells[i]!=null?strip(cells[i]):'';
      const amount=cell(ci.amount),[low,high]=amountRange(amount),ticker=cell(ci.ticker);
      out.push({traded:mdy(cell(ci.traded)),type:cell(ci.type),ticker:/^[A-Z][A-Z0-9.\-]{0,9}$/.test(ticker)?ticker:null,asset:cell(ci.asset)||null,assetType:SENATE_ASSET(cell(ci.assetType)),owner:SENATE_OWNER(cell(ci.owner)),low,high,amount});
    }
  }
  return out.filter(t=>t.traded);
}
// ---------- the annual financial disclosures (what they own and owe, as value ranges) ----------
// A value as written on an annual report: the asset value ranges, the open-ended top ranges, or no amount.
const FD_VALUE=String.raw`(?:Spouse\/DC\s+Over\s+\$[\d,]+|Over\s+\$[\d,]+|\$[\d,]+\s*-\s*\$[\d,]+|None|Undetermined|Unascertainable)`;
const section=(t,from,to)=>{const a=t.search(from);if(a<0)return '';const rest=t.slice(a+1),b=rest.search(to);return b<0?rest:rest.slice(0,b);};
// An electronically filed House annual (or candidate) report's text: Schedule A's assets, each anchored on its [ST]-style
// code with the owner code and the value right after it (the income ranges that follow are left out), and Schedule D's
// liabilities, each ending on its amount. A report filed on paper has no text, so nothing is read.
export function houseAnnualHoldings(text){
  const t=String(text||''),a=section(t,/Schedule\s*A\b/i,/Schedule\s*B\b/i),d=section(t,/Schedule\s*D\b/i,/Schedule\s*E\b/i);
  const assets=[...a.matchAll(new RegExp(String.raw`([^\n\[]*)\[([A-Z]{2})\]\s*(?:(SP|JT|DC)\s+)?(${FD_VALUE})`,'g'))].map(m=>({name:m[1].replace(/\s+/g,' ').trim().replace(/^(SP|JT|DC)\s+/,'')||null,code:m[2],
    owner:m[3]?HOUSE_OWNER[m[3]]:'self',value:m[4].replace(/\s+/g,' ').trim()}));
  const debts=/None\s+disclosed/i.test(d)&&!/\$[\d,]+/.test(d)?[]:[...d.matchAll(/([^\n]*?)(Over\s+\$[\d,]+|\$[\d,]+\s*-\s*\$[\d,]+)\s*$/gm)].filter(m=>!/^(Owner|Creditor)\b/i.test(m[1].trim()))
    .map(m=>{const l=m[1].replace(/\s+/g,' ').trim(),owner=l.match(/^(SP|JT|DC)\s+/);return {creditor:l.replace(/^(SP|JT|DC)\s+/,'')||null,owner:owner?HOUSE_OWNER[owner[1]]:'self',amount:m[2].replace(/\s+/g,' ').trim()};});
  return {assets,debts};
}
// A Senate eFD annual report's asset table (it has Asset and Value columns; the gifts table has Value but no Asset) and
// liability table (Amount with a Creditor or Debtor column). Columns are found by their headings.
export function efdAnnualHoldings(html){
  const assets=[],debts=[];
  for(const [table] of String(html||'').matchAll(/<table[\s\S]*?<\/table>/gi)){
    const heads=[...(table.match(/<thead[\s\S]*?<\/thead>/i)?.[0]||'').matchAll(/<th[^>]*>([\s\S]*?)<\/th>/gi)].map(m=>fold(strip(m[1])));
    const at=name=>heads.findIndex(h=>h===name||h.startsWith(name+' '));
    const isAssets=at('asset')>=0&&at('value')>=0,isDebts=at('amount')>=0&&(at('creditor')>=0||at('debtor')>=0)&&!heads.some(h=>/transaction/.test(h));
    if(!isAssets&&!isDebts)continue;
    for(const [,row] of (table.match(/<tbody[\s\S]*?<\/tbody>/i)?.[0]||'').matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)){
      const cells=[...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map(m=>m[1]),cell=i=>i>=0&&cells[i]!=null?strip(cells[i]):'';
      if(isAssets){const value=cell(at('value'));if(value)assets.push({name:cell(at('asset'))||null,type:cell(at('asset type'))||null,owner:SENATE_OWNER(cell(at('owner'))),value});}
      else{const amount=cell(at('amount'));if(amount)debts.push({creditor:cell(at('creditor'))||null,type:cell(at('type'))||null,owner:SENATE_OWNER(cell(at('debtor'))),amount});}
    }
  }
  return {assets,debts};
}
// One annual report's holdings, with the net-worth range (public/net-worth.js). No assets read means a paper report.
const holdingsSnapshot=(f,h)=>({year:f.year||null,filed:f.filed||null,url:f.url,type:f.type||null,...netWorth(h.assets,h.debts),
  unreadable:!h.assets.length&&!h.debts.length,assets:h.assets.slice(0,400),debts:h.debts.slice(0,100)});
const EFD='https://efdsearch.senate.gov';
// Agree to the site's terms (the checkbox every visitor ticks), keeping the session's cookies.
async function efdSession(env){
  const home=await requestSource(`${EFD}/search/home/`,env,{as:'text',withHeaders:true}),jar=addCookies({},home.headers);
  const input=String(home.body).match(/<input[^>]*name=["']csrfmiddlewaretoken["'][^>]*>/i)?.[0],token=input?.match(/value=["']([^"']+)/)?.[1];
  need(token,'Senate eFD agreement form not found');
  const agreed=await requestSource(`${EFD}/search/home/`,env,{as:'text',form:{csrfmiddlewaretoken:token,prohibition_agreement:'1'},headers:{Cookie:cookieHeader(jar),Referer:`${EFD}/search/home/`},allow:[301,302,303],withHeaders:true});
  addCookies(jar,agreed.headers);need(jar.csrftoken,'Senate eFD did not start a session');
  return {jar};
}
// The senator's trade reports (report type 11) since January of last year, newest first.
async function efdReports(env,{jar},a){
  const found=[];
  for(let start=0;start<1000;start+=100){
    const d=await requestSource(`${EFD}/search/report/data/`,env,{form:{start:String(start),length:'100',report_types:a.reportTypes||'[11]',filer_types:'[1]',submitted_start_date:`01/01/${a.from} 00:00:00`,submitted_end_date:'',candidate_state:'',senator_state:'',office_id:'',first_name:'',last_name:a.last,csrfmiddlewaretoken:jar.csrftoken},
      headers:{Cookie:cookieHeader(jar),Referer:`${EFD}/search/`,'X-CSRFToken':jar.csrftoken,'X-Requested-With':'XMLHttpRequest'}});
    need(Array.isArray(d?.data),'Senate eFD search response missing');
    found.push(...d.data.filter(r=>Array.isArray(r)&&fold(r[1])===fold(a.last)));
    if(start+100>=Number(d.recordsFiltered??d.recordsTotal??0))break;
  }
  // Another senator with the same last name: keep the rows whose first name matches.
  const firsts=new Set(found.map(r=>fold(r[0]).split(/\s+/)[0]));
  const rows=firsts.size>1?found.filter(r=>[a.first].flat().some(f=>fold(r[0]).startsWith(fold(f).slice(0,3)))):found;
  const out=[];
  for(const r of rows){
    const href=String(r[3]).match(/href=["']([^"']+)["']/)?.[1],m=href?.match(/^\/search\/view\/(ptr|annual|paper)\/([0-9a-f-]{8,40})\/?$/i);
    if(m)out.push({doc:m[2].toLowerCase(),paper:m[1].toLowerCase()==='paper',filed:mdy(r[4]),url:`${EFD}${href}`});
  }
  return out.sort((x,y)=>String(y.filed).localeCompare(String(x.filed)));
}
async function efdGet(env,jar,url,expect=/Transaction|transactions/i){
  const html=await requestSource(url,env,{as:'text',headers:{Cookie:cookieHeader(jar),Referer:`${EFD}/search/`},allow:[301,302,303]});
  return html===null||!expect.test(html)?null:html;
}
// The rows one official report gives: its trades, numbered and tagged with the report, or one "not read" row.
const unreadRow=(f,why)=>({id:`unread:${f.doc}`,doc:f.doc,unread:{doc:f.doc,filed:f.filed,url:f.url,why}});
function officialRows(source,f,found,why){
  const official={doc:f.doc,filed:f.filed,url:f.url};
  const rows=found.filter(t=>t.traded).map(t=>({...trade(source,{...t,disclosed:f.filed,link:f.url}),assetType:t.assetType||null,doc:f.doc,official}));
  return rows.length?numberTrades(rows).map(r=>({...r,id:`${f.doc}:${r.id}`})):[unreadRow(f,why)];
}
function officialSummary(rows){
  const mark=rows.find(r=>r.id==='scan:more');rows=rows.filter(r=>r!==mark);
  const trades=rows.filter(r=>!r.unread),unread=rows.filter(r=>r.unread).map(r=>r.unread);
  return {count:trades.length,rows:top(trades,2000,'traded'),rowLimit:2000,unread:top(unread,200,'filed'),reports:new Set(rows.map(r=>r.doc).filter(Boolean)).size,
    ...(mark?{more:true,backlog:mark.backlog}:{})};
}
// The LegiScan person ID saved in a job's last snapshot. It travels as one extra record, which summarize takes out.
const LEGISCAN_PERSON='ls-person';
async function savedLegiscanPerson(env,jobId){
  if(!env.DB)return null;
  const r=await env.DB.prepare('SELECT payload FROM snapshots WHERE job_id=?').bind(jobId).first();
  return r?JSON.parse(r.payload).person||null:null;
}
// The last published snapshot of a job, or of every job of a kind.
async function snapshotsOf(env,kind){return (await env.DB.prepare('SELECT s.payload FROM snapshots s JOIN jobs j ON j.id=s.job_id WHERE j.kind=?').bind(kind).all()).results.map(r=>JSON.parse(r.payload));}
// What the last run already read: its trades and unreadable reports carry over, and those reports aren't fetched again.
// They come from the run's records (all of them, past the snapshot's 2,000-row limit), or from the snapshot when the
// records aren't there (a database started from a seed).
async function carried(env,jobId){
  let rows=(await publishedRecords(env,jobId)).filter(r=>r.id!=='scan:more');
  if(!rows.length){
    const r=await env.DB.prepare('SELECT payload FROM snapshots WHERE job_id=?').bind(jobId).first(),last=r?JSON.parse(r.payload):null;
    rows=[...(last?.rows||[]),...(last?.unread||[]).map(u=>({id:`unread:${u.doc}`,doc:u.doc,unread:u}))];
  }
  return {rows,done:new Set(rows.map(x=>x.doc).filter(Boolean))};
}

export const FEED_KINDS=Object.keys(FEEDS);
export const FEEDS_VERSION=1;
