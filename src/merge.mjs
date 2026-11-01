// Merging the same record reported by several sources, so each trade, state bill or article appears once.
// The official record wins whenever sources disagree, and disagreements are listed for review.
import {tradeKey,docketKey} from './feeds.mjs';

const fold=v=>String(v||'').normalize('NFKD').replace(/[̀-ͯ]/g,'').toLowerCase();
const DAY=86400000;
const gap=(a,b)=>Math.abs(Date.parse(a)-Date.parse(b))/DAY;

// Stock trades: the same member, company, date, buy or sell, and amount range from more than one service is one trade.
// Each trade is then matched to the member's official House periodic transaction report filed on (or within 3 days of)
// the disclosure date the services give; the official filing date and link win. Two services reporting the same
// company, date and type with different amounts, or different disclosure dates, are flagged for review.
// The official reports, read straight from the House Clerk and the Senate eFD site. A trade they report keeps their
// filing date and link; officialFrom is the earliest date those readers cover, so a trade only a service reports after
// it is flagged for review.
const OFFICIAL=new Set(['House Clerk','Senate eFD']);
export function mergeTrades(lists,filings=[],sectors={},{officialFrom=null}={}){
  const groups=new Map();
  for(const rows of lists)for(const t of rows||[]){
    const k=tradeKey(t)+'#'+(t.id||'').split('#')[1];
    const g=groups.get(k);
    if(!g){groups.set(k,{...t,id:k,sources:[t.source],disclosedBy:{[t.source]:t.disclosed},links:t.link?[t.link]:[]});continue;}
    if(!g.sources.includes(t.source))g.sources.push(t.source);
    g.disclosedBy[t.source]=t.disclosed;if(t.link&&!g.links.includes(t.link))g.links.push(t.link);
    g.official=g.official||t.official;g.assetType=g.assetType||t.assetType;
    // The official report's description wins over a service's.
    if(OFFICIAL.has(t.source)){g.asset=t.asset||g.asset;g.owner=t.owner||g.owner;}
    g.asset=g.asset||t.asset;g.owner=g.owner||t.owner;g.ticker=g.ticker||t.ticker;
  }
  const out=[...groups.values()];
  const ptrs=filings.filter(f=>f.ptr&&f.filed);
  for(const t of out){
    const review=[];
    const dates=[...new Set(Object.entries(t.disclosedBy).filter(([s])=>!OFFICIAL.has(s)).map(([,d])=>d).filter(Boolean))];
    if(t.official){
      t.filed=t.official.filed;
      if(dates.some(d=>d!==t.official.filed))review.push('A service gives a different disclosure date; the official report\'s date is used');
    }else{
    if(dates.length>1)review.push(`Services give different disclosure dates (${dates.join(', ')})`);
    if(officialFrom&&t.traded>=officialFrom)review.push('Not found in the official reports read so far; check the filing');
    const near=ptrs.filter(f=>dates.some(d=>gap(d,f.filed)<=3)&&Date.parse(f.filed)>=Date.parse(t.traded)).sort((a,b)=>Math.min(...dates.map(d=>gap(d,a.filed)))-Math.min(...dates.map(d=>gap(d,b.filed))));
    if(near.length){t.official={doc:near[0].id,filed:near[0].filed,url:near[0].url};t.filed=near[0].filed;if(dates.length&&!dates.includes(near[0].filed))review.push('Disclosure date differs from the official filing; the official date is used');}
    else t.filed=dates.sort()[0]||null;
    }
    const s=t.ticker&&sectors[t.ticker];if(s){t.sector=s.sector;t.industry=s.industry;}
    t.review=review;
    delete t.source;delete t.disclosed;delete t.link;delete t.doc;
  }
  // Same company, date and type but a different amount range from different services: likely one trade, needs review.
  const loose=new Map();
  for(const t of out){const k=[t.traded,t.ticker||fold(t.asset).slice(0,40),t.type].join('|');(loose.get(k)||loose.set(k,[]).get(k)).push(t);}
  for(const ts of loose.values())if(ts.length>1&&new Set(ts.flatMap(t=>t.sources)).size>1&&new Set(ts.map(t=>`${t.low}-${t.high}`)).size>1)
    for(const t of ts)t.review.push('Services disagree on the amount range');
  return out.sort((a,b)=>b.traded.localeCompare(a.traded));
}

// State bills: Open States and LegiScan records of the same bill (state, session year and bill number) are one bill.
// Open States wins on title and role; a LegiScan-only bill is kept, and a mismatch in the session is flagged.
export const stateBillKey=b=>[b.state,String(b.year||String(b.session).match(/\d{4}/)?.[0]||''),String(b.identifier||'').toUpperCase().replace(/[^A-Z0-9]/g,'').replace(/^([A-Z]+)0+/,'$1')].join('|');
export function mergeStateBills(openstates=[],legiscan=[]){
  const out=new Map();
  for(const b of openstates)out.set(stateBillKey(b),{...b,sources:['Open States'],links:b.url?[b.url]:[]});
  for(const b of legiscan){
    const k=stateBillKey(b),m=out.get(k);
    if(!m){out.set(k,{...b,sources:['LegiScan'],links:b.url?[b.url]:[]});continue;}
    m.sources.push('LegiScan');if(b.url)m.links.push(b.url);m.title=m.title||b.title;
  }
  return [...out.values()].sort((a,b)=>String(b.date||'').localeCompare(String(a.date||'')));
}

// News: the same article (same address, ignoring tracking parameters and "www.") from GDELT and the Times is one item.
export const articleKey=u=>{try{const x=new URL(u);return (x.host.replace(/^www\./,'')+x.pathname.replace(/\/+$/,'')).toLowerCase();}catch{return String(u);}};
export function mergeNews(...lists){
  const out=new Map();
  for(const rows of lists)for(const a of rows||[]){
    const k=articleKey(a.url),m=out.get(k);
    if(!m){out.set(k,{...a,sources:[a.source]});continue;}
    if(!m.sources.includes(a.source))m.sources.push(a.source);
    m.title=m.title||a.title;m.summary=m.summary||a.summary;m.date=[m.date,a.date].filter(Boolean).sort()[0]||null;
  }
  return [...out.values()].sort((a,b)=>String(b.date||'').localeCompare(String(a.date||'')));
}

// Committees: the official Senate and House lists compared with the reviewed list (public/committees.json).
export function committeeDiff(official=[],reviewed=[]){
  const a=new Set(official.map(c=>c.id)),b=new Set(reviewed.map(c=>c.id));
  return {added:[...a].filter(x=>!b.has(x)),removed:[...b].filter(x=>!a.has(x))};
}

// Words for matching titles and messages: folded, without links, very short words or the most common ones.
const STOP=new Set('and are but for from has have her his its not our out that the their them they this was were what when who will with you your'.split(' '));
const words=t=>new Set(fold(t).replace(/https?:\/\/\S+/g,' ').split(/[^a-z0-9]+/).filter(w=>w.length>2&&!STOP.has(w)));
// How much of the shorter text's words the longer one shares (0 when the shorter has fewer than min words).
const overlap=(a,b,min=4)=>{const [x,y]=a.size<=b.size?[a,b]:[b,a];if(x.size<min)return 0;let n=0;for(const w of x)if(y.has(w))n++;return n/x.size;};

// Hearings: a Congress.gov committee meeting and the GovInfo transcript of the same hearing are one hearing. They match
// by jacket number (the meeting lists its transcripts by it, and it is the number in GovInfo's package ID), or else by
// title and date. The meeting adds the witnesses, documents and bills; the transcript adds the text and who attended.
// mine: this person's meetings and transcripts; all: everyone's, since a transcript can list members a meeting doesn't.
const jacketOf=t=>t.jacket||/[hsj]hrg(\d+)$/i.exec(t.id||'')?.[1]||null;
// Without a jacket number: on the day it was held, the same title (or most of the same words); for an older transcript
// with no held date, most of the same words and published within two years after the meeting. A short title like
// "Nominations" never matches on words alone.
const titleKey=t=>fold(t).replace(/[^a-z0-9]+/g,' ').trim();
const sameHearing=(m,t)=>(m.transcripts||[]).includes(jacketOf(t))||(t.held
  ?gap(t.held,m.date)<=1&&(titleKey(m.title)===titleKey(t.title)||overlap(words(m.title),words(t.title))>=0.8)
  :overlap(words(m.title),words(t.title))>=0.8&&Date.parse(t.date)>=Date.parse(m.date)-DAY&&gap(t.date,m.date)<=730);
export function mergeHearings({meetings=[],transcripts=[]}={},{allMeetings=meetings,allTranscripts=transcripts}={},person=null){
  const out=[],usedT=new Set(),usedM=new Set();
  const entry=(m,t)=>({id:m?`meeting:${m.id}`:`transcript:${t.id}`,title:m?.title||t?.title,date:m?.date||t?.held||t?.date||null,
    committees:m?.committees||[],committeeNames:t?.committees||[],witnesses:m?.witnesses||[],documents:m?.documents||[],bills:m?.bills||[],
    meeting:m?{url:m.url,type:m.type||null}:null,transcript:t?{url:t.url,published:t.date||null}:null,
    attended:t&&person?(t.people||[]).includes(person):null,sources:[m&&'Congress.gov',t&&'GovInfo'].filter(Boolean)});
  for(const m of meetings){const t=allTranscripts.find(t=>!usedT.has(t.id)&&sameHearing(m,t));if(t)usedT.add(t.id);usedM.add(m.id);out.push(entry(m,t));}
  for(const t of transcripts){if(usedT.has(t.id))continue;const m=allMeetings.find(m=>!usedM.has(m.id)&&sameHearing(m,t));if(m)usedM.add(m.id);usedT.add(t.id);out.push(entry(m,t));}
  return out.sort((a,b)=>String(b.date||'').localeCompare(String(a.date||'')));
}

// Legal leads: court records (CourtListener), FEC enforcement records and DOJ press releases as one list. A docket and an
// opinion in the same court with the same docket number are one case, and a DOJ release that cites the docket number joins
// it. Nothing else is joined, since a case name or a date alone could join two different cases. Each stays a lead.
export function mergeLegal(courts=[],fec=[],doj=[]){
  const cases=new Map(),out=[];
  const add=(e,link)=>{e.links.push(link);if(link.date&&(!e.date||link.date>e.date))e.date=link.date;if(!e.sources.includes(link.source))e.sources.push(link.source);};
  for(const r of courts||[]){
    const k=docketKey(r.docket),key=k?`${r.court||''}|${k}`:`court:${r.id}`;
    let e=cases.get(key);
    if(!e){e={id:key,title:r.title,court:r.court||null,docket:r.docket||null,docketKey:k,date:null,kinds:[],sources:[],links:[]};cases.set(key,e);out.push(e);}
    if(!e.kinds.includes(r.kind))e.kinds.push(r.kind);
    add(e,{source:'CourtListener',label:r.kind,url:r.url,date:r.date||null});
  }
  for(const r of doj||[]){
    const e=out.find(e=>e.docketKey&&(r.dockets||[]).includes(e.docketKey));
    const link={source:'DOJ',label:'DOJ press release',title:r.title,url:r.url,date:r.date||null};
    if(e){if(!e.kinds.includes('DOJ press release'))e.kinds.push('DOJ press release');add(e,link);continue;}
    const d={id:`doj:${r.id}`,title:r.title,court:null,docket:null,docketKey:null,date:null,kinds:['DOJ press release'],sources:[],links:[]};add(d,link);out.push(d);
  }
  for(const r of fec||[]){
    const d={id:`fec:${r.id}`,title:r.title,court:null,docket:null,docketKey:null,date:null,opened:r.opened||null,closed:r.closed||null,kinds:[r.kind],sources:[],links:[]};
    add(d,{source:'FEC',label:r.kind,url:r.url,date:r.date||null});out.push(d);
  }
  for(const e of out)delete e.docketKey;
  return out.sort((a,b)=>String(b.date||'').localeCompare(String(a.date||'')));
}

// Statements: the same message from the office's press releases, Bluesky, Threads and YouTube is one statement. Two items
// match when one links to the other (a post sharing the press release), or when, within 3 days, most of the shorter
// one's words are in the other (a post repeating the release's headline, or the same text cross-posted). The press
// release leads when there is one, since it is the office's own record.
const SOURCE_ORDER=['Press release','YouTube','Bluesky','Threads'];
const linkKey=u=>{try{const x=new URL(u);return (x.host.replace(/^www\./,'')+x.pathname.replace(/\/+$/,'')).toLowerCase();}catch{return null;}};
export function mergeStatements({press=[],bluesky=[],threads=[],youtube=[]}={}){
  const items=[...press.map(r=>({source:'Press release',text:r.title,url:r.url,date:r.date,links:[]})),
    ...youtube.map(r=>({source:'YouTube',text:r.title,url:r.url,date:r.date,links:[]})),
    ...bluesky.map(r=>({source:'Bluesky',text:r.text,url:r.url,date:r.date,links:r.links||[]})),
    ...threads.map(r=>({source:'Threads',text:r.text,url:r.url,date:r.date,links:String(r.text||'').match(/https?:\/\/\S+/g)||[],issues:r.issues||[]}))]
    .filter(i=>i.url).map((i,n)=>({...i,n,w:words(i.text),own:linkKey(i.url),to:new Set(i.links.map(linkKey).filter(Boolean))}));
  // Groups of matching items (union-find), never two items from the same source in one pair.
  const up=items.map((_,i)=>i),find=i=>up[i]===i?i:(up[i]=find(up[i]));
  const same=(a,b)=>a.to.has(b.own)||b.to.has(a.own)||(a.date&&b.date&&gap(a.date,b.date)<=3&&overlap(a.w,b.w,5)>=0.75);
  for(let i=0;i<items.length;i++)for(let j=i+1;j<items.length;j++)if(items[i].source!==items[j].source&&same(items[i],items[j]))up[find(i)]=find(j);
  const groups=new Map();for(const it of items)(groups.get(find(it.n))||groups.set(find(it.n),[]).get(find(it.n))).push(it);
  return [...groups.values()].map(g=>{
    g.sort((a,b)=>SOURCE_ORDER.indexOf(a.source)-SOURCE_ORDER.indexOf(b.source)||String(a.date).localeCompare(String(b.date)));
    const [lead,...rest]=g;
    return {text:lead.text,url:lead.url,source:lead.source,date:g.map(i=>i.date).filter(Boolean).sort()[0]||null,
      sources:[...new Set(g.map(i=>i.source))],also:rest.map(i=>({source:i.source,url:i.url,date:i.date})),issues:[...new Set(g.flatMap(i=>i.issues||[]))]};
  }).sort((a,b)=>String(b.date||'').localeCompare(String(a.date||'')));
}

// Top donor organizations across sources: for each organization whose employees gave the most (FEC), what the other
// sources found for the same name: lobbying filings (LDA.gov), a foreign-agent registration (FARA), comments on federal
// rules (Regulations.gov), its federal ID (SAM.gov) and federal contracts (USAspending, found by that ID). A source that
// hasn't run yet shows as not checked, rather than as nothing found. fara: the FARA registrants matched to these
// organizations, or null when the FARA list hasn't been read yet.
export function donorOrgs(sections={},fara=null){
  const orgs=(sections.donors?.orgs||[]).slice(0,20);if(!orgs.length)return null;
  const norm=v=>fold(v).replace(/[^a-z0-9]/g,'').replace(/(inc|llc|corp|corporation|co|company|lp|llp)$/,'');
  const by=rows=>{const m=new Map();for(const r of rows||[])(m.get(r.org)||m.set(r.org,[]).get(r.org)).push(r);return m;};
  const lob=by(sections.lobbying?.rows),com=by(sections.regulations?.rows),sam=by(sections.sam?.rows),con=by(sections.contracts?.rows);
  const checked={lobbying:!!sections.lobbying,fara:fara!=null,regulations:!!sections.regulations,sam:!!sections.sam,contracts:!!sections.contracts};
  const rows=orgs.map(o=>{
    const L=lob.get(o.employer)||[],C=com.get(o.employer)||[],S=(sam.get(o.employer)||[])[0]||null,K=con.get(o.employer)||[];
    const F=(fara||[]).filter(r=>norm(r.name)===norm(o.employer)||norm(r.business)===norm(o.employer));
    const issues=[...new Set(L.flatMap(r=>r.issues||[]))];
    return {org:o.employer,given:o.total,givers:o.count,
      lobbying:{n:L.length,amount:L.reduce((t,r)=>t+(Number(r.amount)||0),0),issues:issues.slice(0,4),url:L[0]?.url||null},
      fara:F.map(r=>({id:r.id,url:r.url})),
      comments:{n:C.length,latest:C.sort((a,b)=>String(b.date).localeCompare(String(a.date)))[0]||null},
      uei:S?.uei||null,samReview:S&&!S.uei?S.review:null,
      contracts:{n:K.length,total:Math.round(K.reduce((t,r)=>t+(r.amount||0),0)),top:K.sort((a,b)=>b.amount-a.amount)[0]||null},
      sources:['FEC',L.length&&'LDA.gov',F.length&&'FARA',C.length&&'Regulations.gov',S?.uei&&'SAM.gov',K.length&&'USAspending'].filter(Boolean)};
  });
  return {rows,checked};
}
