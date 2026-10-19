import { XMLParser, XMLValidator } from 'fast-xml-parser';

const xml = new XMLParser({ignoreAttributes:false,parseTagValue:false,trimValues:true});
const list = v => v == null ? [] : Array.isArray(v) ? v : [v];
const day = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0,10) : null;
const money = v => { if (v == null || v === '') return null; const n=Number(v); if(!Number.isFinite(n)) throw new Error('Source returned an invalid amount'); return n; };
const sum = (rows, get) => Math.round(rows.reduce((n,r)=>n+Math.round((get(r)||0)*100),0))/100;
const nameKey = v => String(v||'').normalize('NFKD').replace(/[^a-z]/gi,'').toLowerCase();
const allowedHosts = new Set(['api.open.fec.gov','api.congress.gov','www.senate.gov','clerk.house.gov']);
export class SourceError extends Error { constructor(message, retryAfter=0,statusCode=0){super(message);this.retryAfter=retryAfter;this.statusCode=statusCode;} }

export async function requestSource(url, env, {json=true,allow404=false}={}) {
  const u=new URL(url); if(u.protocol!=='https:' || !allowedHosts.has(u.hostname)) throw new SourceError('Unapproved data source');
  if(u.hostname==='api.open.fec.gov') { if(!env.FEC_API_KEY) throw new SourceError('FEC API key needed'); u.searchParams.set('api_key',env.FEC_API_KEY); }
  if(u.hostname==='api.congress.gov') { if(!env.CONGRESS_API_KEY) throw new SourceError('Congress.gov API key needed'); u.searchParams.set('api_key',env.CONGRESS_API_KEY); }
  const response=await (env.fetch||fetch)(u,{headers:{Accept:json?'application/json':'application/xml,text/xml'},signal:AbortSignal.timeout(20000),redirect:'error'});
  if(response.status===404 && allow404) return null;
  if(!response.ok) {
    const retry=response.headers.get('retry-after');
    const seconds=retry ? (Number.isFinite(Number(retry))?Number(retry):Math.max(0,(Date.parse(retry)-Date.now())/1000)):0;
    throw new SourceError(`${u.hostname} returned HTTP ${response.status}`,seconds*1000,response.status);
  }
  const text=await response.text(); if(text.length>12_000_000) throw new SourceError('Source response exceeds safe page size');
  if(json) { try {
    // FEC identifiers can exceed JavaScript's safe integer range. Preserve them before parsing.
    return JSON.parse(u.hostname==='api.open.fec.gov'?text.replace(/("(?:sub_id|original_sub_id|last_index)"\s*:\s*)(\d+)(?=\s*[,}])/g,'$1"$2"'):text);
  }catch{throw new SourceError('Source returned invalid JSON');} }
  if(!text.trim().startsWith('<')||XMLValidator.validate(text)!==true||/<html[\s>]/i.test(text)) throw new SourceError('Source returned an invalid XML document');
  return xml.parse(text);
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
export function normalizeVote(document,args,people) {
  let result;
  if(args.chamber==='S') {
    const v=document.roll_call_vote;if(!v||Number(v.vote_number)!==Number(args.number)||Number(v.congress)!==Number(args.congress)||Number(v.session)!==Number(args.session))throw new SourceError('Senate vote identity mismatch');
    const members=list(v.members?.member);if(members.length<1)throw new SourceError('Senate vote has no member records');
    const positions={}; for(const p of people.filter(p=>p.bioguide&&p.chamber==='S')) {
      const surname=nameKey(p.name.replace(/\s+(Jr\.?|III|II)$/,'').split(' ').at(-1));
      const matches=members.filter(m=>m.state===p.state && (p.lis?m.lis_member_id===p.lis:nameKey(m.last_name)===surname));
      if(matches.length===1)positions[p.id]=matches[0].vote_cast;
    }
    const date=new Date(v.vote_date.replace(/,\s+\d\d?:\d\d.*$/,'')+' UTC');
    if(!Number.isFinite(+date))throw new SourceError('Senate vote date invalid');
    result={id:`s-${args.congress}-${args.session}-${args.number}`,chamber:'S',number:Number(args.number),date:date.toISOString().slice(0,10),title:v.vote_title||v.vote_document_text||v.question,question:v.vote_question_text||v.question,result:v.vote_result_text||v.vote_result,positions};
  }else{
    const root=document['rollcall-vote'],v=root?.['vote-metadata'];if(!v||Number(v['rollcall-num'])!==Number(args.number))throw new SourceError('House vote identity mismatch');
    const members=list(root['vote-data']?.['recorded-vote']);if(!members.length)throw new SourceError('House vote has no member records');
    const positions={};for(const p of people.filter(p=>p.bioguide)){const m=members.find(m=>m.legislator?.['@_name-id']===p.bioguide);if(m)positions[p.id]=m.vote;}
    const date=new Date(v['action-date']+' UTC');if(!Number.isFinite(+date)||date.getUTCFullYear()!==Number(args.year))throw new SourceError('House vote date mismatch');
    result={id:`h-${args.year}-${args.number}`,chamber:'H',number:Number(args.number),date:date.toISOString().slice(0,10),title:v['vote-desc']||v['legis-num']||v['vote-question'],question:v['vote-question'],result:v['vote-result'],positions};
  }
  result.source=voteURL(args);return result;
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
    const url=job.cursor||`https://api.congress.gov/v3/member/${a.bioguide}/sponsored-legislation?format=json&limit=250&fromDateTime=${a.cycle-1}-01-01T00%3A00%3A00Z`;
    const d=await requestSource(url,env);if(!Array.isArray(d.sponsoredLegislation)||!d.pagination)throw new SourceError('Sponsored legislation response incomplete');
    const types={HR:'house-bill',S:'senate-bill',HJRES:'house-joint-resolution',SJRES:'senate-joint-resolution',HCONRES:'house-concurrent-resolution',SCONRES:'senate-concurrent-resolution',HRES:'house-resolution',SRES:'senate-resolution'};
    const rows=d.sponsoredLegislation.filter(r=>Number(r.congress)===Number(a.congress)).map(r=>{
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
  if(job.kind==='legislation')return {count:rows.length,congress:a.congress,rows:rows.sort((a,b)=>b.date.localeCompare(a.date)).slice(0,100),rowLimit:100};
  if(job.kind==='house-next')return {count:rows.length,rows:rows.sort((a,b)=>b.number-a.number).slice(0,30)};
  if(job.kind==='senate-index')return {rows};
  if(!rows.length)throw new SourceError('No validated record to publish');
  return rows[0];
}
