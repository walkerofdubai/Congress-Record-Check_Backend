import { XMLParser, XMLValidator } from 'fast-xml-parser';

const xml = new XMLParser({ignoreAttributes:false,parseTagValue:false,trimValues:true});
export const list = v => v == null ? [] : Array.isArray(v) ? v : [v];
export const day = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0,10) : null;
const money = v => { if (v == null || v === '') return null; const n=Number(v); if(!Number.isFinite(n)) throw new Error('Source returned an invalid amount'); return n; };
const sum = (rows, get) => Math.round(rows.reduce((n,r)=>n+Math.round((get(r)||0)*100),0))/100;
// Every approved host, and how its key is sent: `keys` are the .dev.vars names tried in order (GovInfo and
// Regulations.gov also accept the Congress.gov key, since all three are api.data.gov keys); `query` or `header` says
// where it goes. `optional` hosts also work without a key. `agent` hosts require a contact line as the User-Agent.
// `site` hosts are websites read directly (pages, files and feeds posted for people) rather than APIs; the app lists
// their jobs under Website updates.
// perRun: the most requests to a source in one refresh run (the local server runs once a minute), kept under each
// source's published or reported rate limit; sources without one get DEFAULT_PER_RUN.
export const DEFAULT_PER_RUN=5;
export const HOSTS = {
  'api.open.fec.gov':{name:'FEC',keys:['FEC_API_KEY'],query:'api_key',perRun:15},
  'api.congress.gov':{name:'Congress.gov',keys:['CONGRESS_API_KEY'],query:'api_key',perRun:40},
  'www.senate.gov':{name:'Senate.gov',site:true,perRun:10},
  'clerk.house.gov':{name:'House Clerk',site:true,perRun:10},
  // UCLA's roll-call archive (free downloads, no key): the backup for Senate votes Senate.gov won't send.
  'voteview.com':{name:'Voteview',site:true,perRun:10},
  'disclosures-clerk.house.gov':{name:'House Clerk disclosures',site:true,perRun:10},
  // The Senate's financial disclosure site. It is a website, not an API: a session agrees to its terms first.
  'efdsearch.senate.gov':{name:'Senate eFD',site:true,perRun:10,ua:'PublicLedger/1.0 (public-records research; non-commercial)'},
  'api.govinfo.gov':{name:'GovInfo',keys:['GOVINFO_API_KEY','CONGRESS_API_KEY'],query:'api_key',perRun:15},
  'api.votesmart.org':{name:'Vote Smart',keys:['VOTESMART_API_KEY'],query:'key'},
  'v3.openstates.org':{name:'Open States',keys:['OPENSTATES_API_KEY'],header:'X-API-KEY'},
  'api.legiscan.com':{name:'LegiScan',keys:['LEGISCAN_API_KEY'],query:'key'},
  'lda.gov':{name:'LDA.gov',keys:['LDA_API_KEY'],header:'Authorization',prefix:'Token ',optional:true,perRun:10},
  'efile.fara.gov':{name:'FARA'},
  'www.bargo.ai':{name:'Bargo',keys:['BARGO_API_KEY'],header:'X-Api-Key',optional:true},
  'api.eulerpool.com':{name:'Eulerpool',keys:['EULERPOOL_API_KEY'],header:'Authorization',prefix:'Bearer '},
  'financialmodelingprep.com':{name:'Financial Modeling Prep',keys:['FMP_API_KEY'],query:'apikey'},
  'www.courtlistener.com':{name:'CourtListener',keys:['COURTLISTENER_API_TOKEN'],header:'Authorization',prefix:'Token ',perRun:3},
  'factchecktools.googleapis.com':{name:'Google',keys:['GOOGLE_API_KEY'],query:'key',perRun:10},
  'www.googleapis.com':{name:'Google',keys:['GOOGLE_API_KEY'],query:'key',perRun:10},
  'api.nytimes.com':{name:'New York Times',keys:['NYT_API_KEY'],query:'api-key',perRun:4},
  'api.gdeltproject.org':{name:'GDELT',perRun:2},
  'api.regulations.gov':{name:'Regulations.gov',keys:['REGULATIONS_API_KEY','CONGRESS_API_KEY'],query:'api_key',perRun:15},
  'api.sam.gov':{name:'SAM.gov',keys:['SAM_API_KEY'],query:'api_key',perRun:1},
  'api.usaspending.gov':{name:'USAspending',perRun:10},
  'www.federalregister.gov':{name:'Federal Register',perRun:10},
  'public.api.bsky.app':{name:'Bluesky',perRun:10},
  // Threads keyword search (Meta). Searching other people's public posts needs the threads_keyword_search permission
  // approved in App Review; a user can run 2,200 searches a day.
  'graph.threads.net':{name:'Threads',keys:['THREADS_ACCESS_TOKEN'],query:'access_token',perRun:20},
  // Not a hostname: the shared entry for every member's official website (any *.senate.gov or *.house.gov host without
  // an entry of its own), used for their press-release feeds. The feed job counts against this one limit.
  'official-sites':{name:'Official member websites',site:true,perRun:10},
  'web.archive.org':{name:'Wayback Machine',perRun:3},
  // Tavily: campaign website search and crawl. 432 and 433 mean its monthly credits are used up. A crawl can take minutes.
  'api.tavily.com':{name:'Tavily',keys:['TAVILY_API_KEY'],header:'Authorization',prefix:'Bearer ',quota:[432,433],perRun:2},
  'www.justice.gov':{name:'Justice Department'},
  'projects.propublica.org':{name:'ProPublica Nonprofit Explorer'},
  'www.sec.gov':{name:'SEC EDGAR',agent:'SEC_USER_AGENT',perRun:10},
  'data.sec.gov':{name:'SEC EDGAR',agent:'SEC_USER_AGENT',perRun:10},
};
// Query parameters that can carry a credential; they are removed from any URL that is saved (a next-page link).
const SECRET_PARAMS=['api_key','key','apikey','api-key','token','access_token'];
export function cleanURL(url){const u=new URL(url);for(const k of SECRET_PARAMS)u.searchParams.delete(k);return u.href;}
// The approval entry for a hostname: its own entry, or the shared one for members' official websites.
const OFFICIAL_SITE=/^(?:[a-z0-9-]+\.)+(?:senate|house)\.gov$/;
export const hostRule=host=>HOSTS[host]||(OFFICIAL_SITE.test(host)?HOSTS['official-sites']:null);
// The name of the missing setup item for a host, or null when it can be used.
export function missingKey(host,env){
  const h=hostRule(host);if(!h)return 'Approved source';
  if(h.agent&&!env[h.agent])return 'SEC contact line';
  if(h.keys&&!h.optional&&!h.keys.some(k=>env[k]))return h.name;
  return null;
}
export class SourceError extends Error { constructor(message, retryAfter=0,statusCode=0){super(message);this.retryAfter=retryAfter;this.statusCode=statusCode;} }

// as: 'json' (default), 'xml', 'text' or 'bytes'. A body is sent as JSON with POST, and a form as an HTML form post.
// allow lists HTTP statuses that return null instead of failing (allow404 is the same as allow:[404]); a 3xx in allow
// is returned rather than followed. follow allows up to 3 redirects, each to an approved https host; otherwise any
// redirect fails. headers adds request headers (never a credential header); withHeaders returns {body, status,
// headers} so a caller can read the response's cookies.
export async function requestSource(url, env, {json=true,as=json?'json':'xml',allow404=false,allow=allow404?[404]:[],follow=false,body=null,form=null,headers:extra=null,withHeaders=false,timeout=20000}={}) {
  let u=new URL(url),h=hostRule(u.hostname); if(u.protocol!=='https:' || !h) throw new SourceError('Unapproved data source');
  const missing=missingKey(u.hostname,env);if(missing)throw new SourceError(`${missing} API key needed`);
  const headers={Accept:as==='json'?'application/json':as==='xml'?'application/rss+xml,application/atom+xml,application/xml,text/xml':'*/*'};
  const key=h.keys&&h.keys.map(k=>env[k]).find(Boolean);
  if(key){if(h.query)u.searchParams.set(h.query,key);else headers[h.header]=(h.prefix||'')+key;}
  if(h.ua)headers['User-Agent']=h.ua;
  if(h.agent)headers['User-Agent']=env[h.agent];
  for(const [k,v] of Object.entries(extra||{}))if(v!=null&&!/^(authorization|x-api-key)$/i.test(k))headers[k]=String(v);
  if(body)headers['Content-Type']='application/json';
  if(form)headers['Content-Type']='application/x-www-form-urlencoded';
  const payload=form?new URLSearchParams(form).toString():body?JSON.stringify(body):undefined;
  const manual=follow||allow.some(s=>s>=300&&s<400);
  let response;
  for(let hop=0;;hop++){
    response=await (env.fetch||fetch)(u,{method:payload?'POST':'GET',headers,body:payload,signal:AbortSignal.timeout(timeout),redirect:manual?'manual':'error'});
    if(!follow||response.status<300||response.status>=400||allow.includes(response.status))break;
    const to=response.headers.get('location');
    if(!to||hop>=3)throw new SourceError('Source redirected too many times');
    const next=new URL(to,u);
    // A redirect may not leave the approved hosts, and never carries a key to a different host.
    if(next.protocol!=='https:'||!hostRule(next.hostname)||(key&&next.hostname!==u.hostname))throw new SourceError('Source redirected to an unapproved address');
    u=next;
  }
  const out=b=>withHeaders?{body:b,status:response.status,headers:response.headers}:b;
  if(allow.includes(response.status)) return out(null);
  if(!response.ok) {
    const retry=response.headers.get('retry-after');
    const seconds=retry ? (Number.isFinite(Number(retry))?Number(retry):Math.max(0,(Date.parse(retry)-Date.now())/1000)):0;
    throw new SourceError(`${u.hostname} returned HTTP ${response.status}`,seconds*1000,response.status);
  }
  if(as==='bytes'){const b=new Uint8Array(await response.arrayBuffer());if(b.length>40_000_000)throw new SourceError('Source response exceeds safe page size');return out(b);}
  const text=await response.text(); if(text.length>12_000_000) throw new SourceError('Source response exceeds safe page size');
  if(as==='text')return out(text);
  if(as==='json') { try {
    // FEC identifiers can exceed JavaScript's safe integer range. Preserve them before parsing.
    return out(JSON.parse(u.hostname==='api.open.fec.gov'?text.replace(/("(?:sub_id|original_sub_id|last_index)"\s*:\s*)(\d+)(?=\s*[,}])/g,'$1"$2"'):text));
  }catch{throw new SourceError('Source returned invalid JSON');} }
  return out(parseXML(text));
}
// Cookies a response sets, added to a jar ({name: value}), and the Cookie header that sends them back.
export function addCookies(jar,headers){
  const list=headers?.getSetCookie?.()??String(headers?.get?.('set-cookie')||'').split(/,(?=\s*[^;,=\s]+=)/).filter(Boolean);
  for(const c of list){const m=String(c).match(/^\s*([^=;\s]+)=([^;]*)/);if(m)jar[m[1]]=m[2];}
  return jar;
}
export const cookieHeader=jar=>Object.entries(jar||{}).map(([k,v])=>`${k}=${v}`).join('; ');
export function parseXML(text){
  if(!text.trim().startsWith('<')||XMLValidator.validate(text)!==true||/<html[\s>]/i.test(text)) throw new SourceError('Source returned an invalid XML document');
  return xml.parse(text);
}
// Reads one file from a ZIP archive (stored or deflated), for the House Clerk's yearly disclosure index.
export async function unzipFile(bytes,match){
  const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  let eocd=-1;for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65557);i--)if(v.getUint32(i,true)===0x06054b50){eocd=i;break;}
  if(eocd<0)throw new SourceError('Archive is not a ZIP file');
  let p=v.getUint32(eocd+16,true);const n=v.getUint16(eocd+10,true);
  for(let k=0;k<n;k++){
    if(v.getUint32(p,true)!==0x02014b50)throw new SourceError('Archive directory is damaged');
    const method=v.getUint16(p+10,true),size=v.getUint32(p+20,true),nameLen=v.getUint16(p+28,true),extra=v.getUint16(p+30,true),comment=v.getUint16(p+32,true),local=v.getUint32(p+42,true);
    const name=new TextDecoder().decode(bytes.subarray(p+46,p+46+nameLen));
    if(match.test(name)){
      const start=local+30+v.getUint16(local+26,true)+v.getUint16(local+28,true),data=bytes.subarray(start,start+size);
      if(method===0)return new TextDecoder().decode(data);
      if(method!==8)throw new SourceError('Archive uses an unsupported compression method');
      return new TextDecoder().decode(await new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer());
    }
    p+=46+nameLen+extra+comment;
  }
  throw new SourceError('Expected file is missing from the archive');
}

function api(path,params) {const u=new URL(path,'https://api.open.fec.gov/v1/');for(const[k,v]of Object.entries(params))if(v!=null)u.searchParams.set(k,v);return u.href;}
export function fecNext(url,data) {
  if(!Array.isArray(data.results)||!data.pagination) throw new SourceError('FEC response is missing results or pagination');
  if(!data.results.length) return null;
  const u=new URL(url),p=data.pagination,last=p.last_indexes;
  if(last && Object.keys(last).length) {
    if(last.last_index==null) throw new SourceError('FEC cursor is incomplete');
    for(const[k,v]of Object.entries(last))if(v!=null)u.searchParams.set(k,String(v));
    if(u.href===url) throw new SourceError('FEC pagination stopped advancing');
    return u.href;
  }
  if(p.pages!=null && Number(p.page||1)<Number(p.pages)){u.searchParams.set('page',String(Number(p.page||1)+1));return u.href;}
  // Seek endpoints must supply a cursor for a full page; never publish an accidental partial result.
  if(/\/schedules\//.test(u.pathname)&&data.results.length>=Number(u.searchParams.get('per_page')||100)) throw new SourceError('FEC omitted a required pagination cursor');
  return null;
}

export function normalizeCampaign(r,committee,cycle) {
  if(!r || r.committee_id!==committee || Number(r.cycle)!==Number(cycle)) throw new SourceError('Campaign response does not match the requested committee and cycle');
  const end=day(r.coverage_end_date),start=day(r.coverage_start_date);
  if(!end||!start||end<start)throw new SourceError('Campaign reporting dates are missing or invalid');
  const receipts=money(r.receipts); if(receipts==null)throw new SourceError('Campaign receipts missing');
  return {id:committee,committee,cycle,start,end,receipts,cash:money(r.last_cash_on_hand_end_period),debts:money(r.last_debts_owed_by_committee),disbursements:money(r.disbursements),individual:money(r.individual_contributions),pac:money(r.other_political_committee_contributions),party:money(r.political_party_committee_contributions),candidate:money(r.candidate_contribution),loans:money(r.loans),source:`https://www.fec.gov/data/committee/${committee}/?cycle=${cycle}`};
}

export function normalizeTransaction(r,kind,args) {
  if(!r.sub_id)throw new SourceError('Transaction identifier missing');
  if(kind==='pac'&&r.committee_id!==args.committee)throw new SourceError('Wrong recipient committee in FEC response');
  if(kind==='outside'&&r.candidate_id!==args.candidate)throw new SourceError('Wrong candidate in FEC response');
  const amount=money(kind==='pac'?r.contribution_receipt_amount:r.expenditure_amount);
  if(amount==null)throw new SourceError('Transaction amount missing');
  return {id:String(r.sub_id),transaction:r.transaction_id||null,file:String(r.file_number||r.file_id||''),committee:r.committee_id,
    name:kind==='pac'?r.contributor_name:(r.committee?.name||r.committee_name||r.committee_id),
    date:day(kind==='pac'?r.contribution_receipt_date:r.dissemination_date),amount,
    direction:kind==='outside'?r.support_oppose_indicator:null,election:r.election_type||r.election_type_full||null,
    memo:r.memoed_subtotal===true||r.memoed_subtotal==='true'||r.memo_code==='X',
    payee:r.payee_name||null,purpose:r.expenditure_description||null,
    source:r.image_number?`https://docquery.fec.gov/cgi-bin/fecimg/?${encodeURIComponent(r.image_number)}`:`https://www.fec.gov/data/${kind==='pac'?'receipts':'independent-expenditures'}/?committee_id=${r.committee_id}`};
}

export function summarizeTransactions(rows,kind,args,through) {
  const exact=new Map(); let duplicates=0;
  for(const r of rows) {
    const key=r.transaction?JSON.stringify([r.committee,r.transaction,r.date,r.amount,r.direction,r.election,r.memo,r.payee,r.name,r.purpose]):`sub:${r.id}`;
    const previous=exact.get(key); if(previous){duplicates++; if(Number(r.file)>Number(previous.file))exact.set(key,r);}else exact.set(key,r);
  }
  const start=`${args.cycle-1}-01-01`;let memo=0,outOfPeriod=0,otherElection=0,unknownDate=0;
  const included=[];
  for(const r of exact.values()) {
    if(r.memo){memo++;continue;}if(!r.date){unknownDate++;continue;}
    if(r.date<start||r.date>through){outOfPeriod++;continue;}
    if(kind==='outside' && !/^(G\d{0,4}|GENERAL)$/i.test(r.election||'')){otherElection++;continue;}
    if(kind==='outside'&&!['S','O'].includes(r.direction))throw new SourceError('Unknown support/oppose code');
    included.push(r);
  }
  included.sort((a,b)=>b.date.localeCompare(a.date)||b.id.localeCompare(a.id));
  const total=sum(included,r=>r.amount),support=sum(included.filter(r=>r.direction==='S'),r=>r.amount),oppose=sum(included.filter(r=>r.direction==='O'),r=>r.amount);
  return {kind,start,through,count:included.length,total,support,oppose,excluded:{duplicates,memo,outOfPeriod,otherElection,unknownDate},rows:included.slice(0,200),rowLimit:200,
    source:`https://www.fec.gov/data/${kind==='pac'?'receipts':'independent-expenditures'}/?${kind==='pac'?'committee_id='+args.committee:'candidate_id='+args.candidate}&cycle=${args.cycle}`};
}

export function voteURL(args) {return args.chamber==='S'?`https://www.senate.gov/legislative/LIS/roll_call_votes/vote${args.congress}${args.session}/vote_${args.congress}_${args.session}_${String(args.number).padStart(5,'0')}.xml`:`https://clerk.house.gov/evs/${args.year}/roll${String(args.number).padStart(3,'0')}.xml`;}
// A recorded vote as Yea or Nay where it means one ("Aye", "No", "Guilty", "Not Guilty"); anything else as written.
export const castOf=v=>({yea:'Yea',aye:'Yea',yes:'Yea',guilty:'Yea',nay:'Nay',no:'Nay','not guilty':'Nay'})[String(v??'').trim().toLowerCase()]||String(v??'').trim();
// How each party voted, from every member in the official file: {R:{Yea:n,Nay:n,...},D:{...},I:{...}}. It lets a
// person's vote be compared with the rest of their party's (the Donor Loyalty Index).
export function partyTally(members){
  const out={};
  for(const [party,cast] of members){const p=String(party??'').trim().toUpperCase().slice(0,1),c=castOf(cast);if(!p||!c)continue;(out[p]||={})[c]=(out[p][c]||0)+1;}
  return out;
}
export function normalizeVote(document,args,people) {
  let result;
  if(args.chamber==='S') {
    const v=document.roll_call_vote;if(!v||Number(v.vote_number)!==Number(args.number)||Number(v.congress)!==Number(args.congress)||Number(v.session)!==Number(args.session))throw new SourceError('Senate vote identity mismatch');
    const members=list(v.members?.member);if(members.length<1)throw new SourceError('Senate vote has no member records');
    // Senators are matched by their official LIS member ID (from congress-legislators); anyone without one gets no position.
    const positions={}; for(const p of people.filter(p=>p.lis)) {
      const matches=members.filter(m=>m.lis_member_id===p.lis);
      if(matches.length===1)positions[p.id]=matches[0].vote_cast;
    }
    const date=new Date(v.vote_date.replace(/,\s+\d\d?:\d\d.*$/,'')+' UTC');
    if(!Number.isFinite(+date))throw new SourceError('Senate vote date invalid');
    result={id:`s-${args.congress}-${args.session}-${args.number}`,chamber:'S',number:Number(args.number),date:date.toISOString().slice(0,10),title:v.vote_title||v.vote_document_text||v.question,question:v.vote_question_text||v.question,result:v.vote_result_text||v.vote_result,positions,byParty:partyTally(members.map(m=>[m.party,m.vote_cast]))};
  }else{
    const root=document['rollcall-vote'],v=root?.['vote-metadata'];if(!v||Number(v['rollcall-num'])!==Number(args.number))throw new SourceError('House vote identity mismatch');
    const members=list(root['vote-data']?.['recorded-vote']);if(!members.length)throw new SourceError('House vote has no member records');
    const positions={};for(const p of people.filter(p=>p.bioguide)){const m=members.find(m=>m.legislator?.['@_name-id']===p.bioguide);if(m)positions[p.id]=m.vote;}
    const date=new Date(v['action-date']+' UTC');if(!Number.isFinite(+date)||date.getUTCFullYear()!==Number(args.year))throw new SourceError('House vote date mismatch');
    result={id:`h-${args.year}-${args.number}`,chamber:'H',number:Number(args.number),date:date.toISOString().slice(0,10),title:v['vote-desc']||v['legis-num']||v['vote-question'],question:v['vote-question'],result:v['vote-result'],positions,
      byParty:partyTally(members.map(m=>[m.legislator?.['@_party'],m.vote]))};
  }
  result.source=voteURL(args);return result;
}

const nameKey = v => String(v||'').normalize('NFKD').replace(/[^a-z]/gi,'').toLowerCase();
// Campaign websites. Search results are scored; only a clear match is accepted, otherwise it is left for review
// (set campaignSite in data/config.json to confirm or correct one by hand).
export const notCampaign=['wikipedia.org','ballotpedia.org','fec.gov','opensecrets.org','votesmart.org','x.com','twitter.com','facebook.com','instagram.com','youtube.com','linkedin.com','tiktok.com','threads.net','bsky.app','reddit.com','medium.com','substack.com','actblue.com','secure.actblue.com','winred.com','secure.winred.com','nytimes.com','washingtonpost.com','politico.com','thehill.com','axios.com','cnn.com','foxnews.com','apnews.com','reuters.com','nbcnews.com','cbsnews.com','abcnews.go.com','npr.org','rollcall.com','govtrack.us','congress.gov','house.gov','senate.gov','britannica.com','justfacts.com','270towin.com','cookpolitical.com','realclearpolling.com','vote411.org','isidewith.com','followthemoney.org','legistorm.com'];
const surnameOf=name=>nameKey(String(name).replace(/\s+(Jr\.?|Sr\.?|III|II|IV)$/i,'').split(' ').at(-1));
export function campaignSiteQuery(p,year){return `${p.name} ${year} campaign website ${p.chamber==='S'?'U.S. Senate':'U.S. House'} ${p.state}`;}
export function chooseCampaignSite(results,person) {
  const surname=surnameOf(person.name),first=nameKey(person.name.split(' ')[0]),hosts=new Map();
  for(const r of results||[]) {
    let u;try{u=new URL(r.url);}catch{continue;}
    const host=u.hostname.toLowerCase().replace(/^www\./,'');
    if(u.protocol!=='https:'&&u.protocol!=='http:'||host.endsWith('.gov')||host.endsWith('.mil')||notCampaign.some(d=>host===d||host.endsWith('.'+d)))continue;
    const key=nameKey(host.split('.').slice(0,-1).join('')),text=`${r.title||''} ${r.content||''}`;
    let score=0;
    if(surname&&key.includes(surname))score+=3;
    if(first&&key.includes(first))score+=1;
    if(surname&&nameKey(text).includes(surname))score+=2;
    if(/\b(for (u\.?s\.? )?(senate|congress)|donate|volunteer|chip in|join (our|the) (team|campaign)|paid for by)\b/i.test(text))score+=2;
    if(/^\/?$/.test(u.pathname))score+=1;
    const h=hosts.get(host)||{host,score:0,hits:0,title:r.title||'',surnameInHost:surname&&key.includes(surname)};
    h.score=Math.max(h.score,score);h.hits++;hosts.set(host,h);
  }
  const ranked=[...hosts.values()].map(h=>({...h,score:h.score+Math.min(h.hits-1,2)})).sort((a,b)=>b.score-a.score||a.host.localeCompare(b.host));
  const [best,next]=ranked;
  // Accept only a domain that carries the surname, with campaign evidence, and a clear lead over the runner-up.
  const confident=!!best&&best.surnameInHost&&best.score>=6&&(!next||best.score-next.score>=2||!next.surnameInHost);
  return {site:confident?`https://${best.host}/`:null,confidence:confident?'high':best?'low':'none',candidates:ranked.slice(0,5).map(({host,score,title})=>({host,score,title}))};
}

// Platform pages: issue, priority and about pages, split into one statement per heading.
export const platformPaths=['^/?$','/(issues?|priorities|platform|policy|policies|plans?|agenda|vision|positions?|values|about|meet[-a-z]*|record|accomplishments|why[-a-z]*)(/.*)?$'];
const boilerplate=/^(donate|volunteer|sign up|join (us|the team)|contact|privacy|cookie|shop|store|events?|news|press|get involved|subscribe|paid for by|menu|search|share|follow)\b/i;
const PAGE_LIMIT=30_000;
function fnv(text){let h=0x811c9dc5;for(let i=0;i<text.length;i++){h^=text.charCodeAt(i);h=Math.imul(h,0x01000193)>>>0;}return h.toString(16).padStart(8,'0');}
export function platformSections(url,markdown) {
  const clean=String(markdown||'').slice(0,PAGE_LIMIT).replace(/!\[[^\]]*\]\([^)]*\)/g,'').replace(/\[([^\]]*)\]\([^)]*\)/g,'$1').replace(/\r/g,'');
  const sections=[];let heading=null,lines=[];
  const flush=()=>{const text=lines.join('\n').replace(/\n{3,}/g,'\n\n').trim();
    // Short or navigation-like blocks are not statements.
    if(heading&&text.length>=120&&!boilerplate.test(heading)&&text.split(/\s+/).length>=20)sections.push({id:fnv(url+'\n'+heading),url,heading,text,hash:fnv(text)});lines=[];};
  for(const line of clean.split('\n')){const m=line.match(/^#{1,4}\s+(.+?)\s*#*\s*$/);if(m){flush();heading=m[1].replace(/[*_`]/g,'').trim();}else lines.push(line);}
  flush();return sections;
}
export function normalizePlatform(d,site) {
  if(!Array.isArray(d?.results))throw new SourceError('Tavily crawl response incomplete');
  const host=new URL(site).hostname.replace(/^www\./,'');
  const pages=d.results.filter(r=>{try{return new URL(r.url).hostname.replace(/^www\./,'')===host;}catch{return false;}});
  if(!pages.length)throw new SourceError('Campaign website returned no pages; previous capture retained');
  return pages.map(p=>({id:p.url,url:p.url,chars:String(p.raw_content||'').length,sections:platformSections(p.url,p.raw_content)}));
}
// Compares a new platform capture with the previous one, so edits and removed promises are visible.
export function diffPlatform(previous,current) {
  if(!previous?.sections)return {first:true,added:current.length,changed:0,removed:[]};
  const old=new Map(previous.sections.map(s=>[s.id,s]));let added=0,changed=0;
  for(const s of current){const o=old.get(s.id);if(!o)added++;else if(o.hash!==s.hash)changed++;old.delete(s.id);}
  return {first:false,added,changed,removed:[...old.values()].map(s=>({url:s.url,heading:s.heading,lastSeen:previous.checkedThrough||null}))};
}

export async function fetchPage(job,env,config) {
  const a=JSON.parse(job.args),through=(job.started_at||new Date().toISOString()).slice(0,10);
  if(job.kind==='campaign'){
    const url=api(`committee/${a.committee}/totals/`,{cycle:a.cycle,per_page:100});const d=await requestSource(url,env);
    if(!Array.isArray(d.results))throw new SourceError('Campaign results missing');
    if(!d.results.length)throw new SourceError('No campaign report available for this committee and cycle');
    if(d.results.length!==1)throw new SourceError('Ambiguous committee totals');
    return {rows:[normalizeCampaign(d.results[0],a.committee,a.cycle)],next:null};
  }
  if(job.kind==='committee') {
    const d=await requestSource(api(`candidate/${a.candidate}/committees/`,{cycle:a.cycle,designation:'P',per_page:100}),env);
    if(!Array.isArray(d.results)||d.results.length!==1)throw new SourceError('Principal campaign committee needs review');
    const r=d.results[0];if(!/^C\d{8}$/.test(r.committee_id))throw new SourceError('Invalid committee identifier');
    return {rows:[{id:r.committee_id,committee:r.committee_id,name:r.name}],next:null};
  }
  if(['pac','outside'].includes(job.kind)) {
    const url=job.cursor||api(`schedules/schedule_${job.kind==='pac'?'a':'e'}/`,job.kind==='pac'?{committee_id:a.committee,two_year_transaction_period:a.cycle,line_number:'F3-11C',per_page:100,sort:'-contribution_receipt_date'}:{candidate_id:a.candidate,cycle:a.cycle,most_recent:true,per_page:100,sort:'-expenditure_date'});
    const d=await requestSource(url,env);const next=fecNext(url,d);
    return {rows:d.results.map(r=>normalizeTransaction(r,job.kind,a)),next};
  }
  if(job.kind==='legislation') {
    // Every bill they sponsored from the Congress that includes historyFrom (2016: the 114th) on.
    const since=Number(config?.historyFrom)||2016,first=Math.floor((since-1789)/2)+1;
    const url=job.cursor||`https://api.congress.gov/v3/member/${a.bioguide}/sponsored-legislation?format=json&limit=250&fromDateTime=${since}-01-01T00%3A00%3A00Z`;
    const d=await requestSource(url,env);if(!Array.isArray(d.sponsoredLegislation)||!d.pagination)throw new SourceError('Sponsored legislation response incomplete');
    const types={HR:'house-bill',S:'senate-bill',HJRES:'house-joint-resolution',SJRES:'senate-joint-resolution',HCONRES:'house-concurrent-resolution',SCONRES:'senate-concurrent-resolution',HRES:'house-resolution',SRES:'senate-resolution'};
    // Amendments a senator sponsored are listed too; they have no bill number or title and are left out.
    const rows=d.sponsoredLegislation.filter(r=>Number(r.congress)>=first&&r.amendmentNumber==null&&!/AMDT$/i.test(r.type||'')).map(r=>{
      if(!types[r.type]||!r.number||!(r.title||r.latestTitle)||!day(r.introducedDate))throw new SourceError('Legislation record incomplete');
      return {id:`${r.congress}-${r.type}-${r.number}`,title:r.title||r.latestTitle,measure:`${r.type} ${r.number}`,date:day(r.introducedDate),latestAction:r.latestAction?.text||null,actionDate:day(r.latestAction?.actionDate),source:`https://www.congress.gov/bill/${r.congress}th-congress/${types[r.type]}/${r.number}`};
    });
    let next=d.pagination.next||null;if(next){const u=new URL(next);u.searchParams.delete('api_key');u.searchParams.set('format','json');next=u.href;if(next===job.cursor)throw new SourceError('Congress pagination stopped advancing');}
    return {rows,next};
  }
  if(job.kind==='vote') {return {rows:[normalizeVote(await requestSource(voteURL(a),env,{json:false}),a,config.people)],next:null};}
  if(job.kind==='senate-index') {
    const d=await requestSource(`https://www.senate.gov/legislative/LIS/roll_call_lists/vote_menu_${a.congress}_${a.session}.xml`,env,{json:false});
    const v=d.vote_summary;if(!v||Number(v.congress)!==a.congress||Number(v.session)!==a.session)throw new SourceError('Senate index identity mismatch');
    return {rows:list(v.votes?.vote).map(v=>({id:String(Number(v.vote_number)),number:Number(v.vote_number)})).filter(v=>v.number>0).sort((a,b)=>b.number-a.number).slice(0,30),next:null};
  }
  if(job.kind==='house-next') {
    const number=Number(job.cursor||a.number);
    const args={chamber:'H',year:a.year,number};
    const d=await requestSource(voteURL(args),env,{json:false,allow404:true});
    if(d===null)return {rows:[],next:null,nextProbe:number};
    return {rows:[normalizeVote(d,args,config.people)],next:String(number+1)};
  }
  throw new SourceError('Unknown refresh job');
}

export function summarize(job,rows) {
  const a=JSON.parse(job.args),through=job.started_at.slice(0,10);
  if(['pac','outside'].includes(job.kind))return summarizeTransactions(rows,job.kind,a,through);
  if(job.kind==='legislation'){const by={};for(const r of rows)by[r.id.split('-')[0]]=(by[r.id.split('-')[0]]||0)+1;
    return {count:rows.length,congress:a.congress,rows:rows.sort((a,b)=>b.date.localeCompare(a.date)).slice(0,300),rowLimit:300,byCongress:by,bills:rows.map(r=>r.id.toLowerCase())};}
  if(job.kind==='house-next')return {count:rows.length,rows:rows.sort((a,b)=>b.number-a.number).slice(0,30)};
  if(job.kind==='senate-index')return {rows};
  if(!rows.length)throw new SourceError('No validated record to publish');
  return rows[0];
}
