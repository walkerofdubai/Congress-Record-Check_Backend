import test from 'node:test';
import assert from 'node:assert/strict';
import {mergeHearings,mergeLegal,mergeStatements,donorOrgs} from '../src/merge.mjs';

const meeting=(o={})=>({id:'115538',title:'Hearing on Drug Prices',date:'2026-03-24',committees:['HSIF'],people:['collins'],witnesses:[{name:'A. Witness'}],documents:[],bills:['119-hr-1'],transcripts:[],url:'https://www.congress.gov/event/119th-congress/house-event/115538',...o});
const transcript=(o={})=>({id:'CHRG-119hhrg59876',title:'HEARING ON DRUG PRICES',date:'2026-09-01',held:'2026-03-24',committees:['Energy and Commerce'],people:['collins'],url:'https://www.govinfo.gov/app/details/CHRG-119hhrg59876',...o});

test('a committee meeting and its transcript are one hearing, by jacket number or by title and date',()=>{
  const byJacket=mergeHearings({meetings:[meeting({transcripts:['59876'],title:'Different wording'})],transcripts:[transcript()]},{},'collins');
  assert.equal(byJacket.length,1);assert.deepEqual(byJacket[0].sources,['Congress.gov','GovInfo']);
  assert.equal(byJacket[0].witnesses.length,1,'the meeting adds the witnesses');assert.equal(byJacket[0].transcript.url,transcript().url,'the transcript adds the text');
  assert.equal(byJacket[0].attended,true);
  assert.equal(mergeHearings({meetings:[meeting()],transcripts:[transcript()]}).length,1,'the same title on the day it was held');
  const long={title:'Examining the Rising Cost of Prescription Drugs for Seniors'};
  const byWords=mergeHearings({meetings:[meeting(long)],transcripts:[transcript({held:null,title:'EXAMINING THE RISING COST OF PRESCRIPTION DRUGS FOR SENIORS'})]});
  assert.equal(byWords.length,1,'an older transcript without a held date still matches by its words, published after the meeting');
  assert.equal(mergeHearings({meetings:[meeting()],transcripts:[transcript({held:null})]}).length,2,'a short title never matches on words alone');
  assert.equal(mergeHearings({meetings:[meeting()],transcripts:[transcript({held:'2025-02-01'})]}).length,2,'same title, different day: two hearings');
});

test('a transcript joins a meeting tied to someone else, from the full lists',()=>{
  // The person isn't on the committee's roster for the meeting, but the transcript lists them as attending.
  const m=meeting({people:['other'],transcripts:['59876']});
  const out=mergeHearings({meetings:[],transcripts:[transcript()]},{allMeetings:[m],allTranscripts:[transcript()]},'collins');
  assert.equal(out.length,1);assert.deepEqual(out[0].sources,['Congress.gov','GovInfo']);assert.equal(out[0].meeting.url,m.url);
});

test('legal leads: a docket and an opinion in the same case are one case, and a DOJ release citing the docket joins it',()=>{
  const courts=[{id:'r-1',kind:'Docket',title:'United States v. Example',court:'dcd',docket:'1:25-cr-00042-ABC',date:'2025-03-01',url:'https://www.courtlistener.com/docket/1/'},
    {id:'o-9',kind:'Opinion',title:'United States v. Example',court:'dcd',docket:'1:25-cr-00042',date:'2025-09-10',url:'https://www.courtlistener.com/opinion/9/'},
    {id:'r-2',kind:'Docket',title:'Example v. Other',court:'nysd',docket:'1:24-cv-01203',date:'2024-05-01',url:'https://www.courtlistener.com/docket/2/'}];
  const doj=[{id:'u1',title:'Defendant pleads guilty',date:'2025-06-02',url:'https://www.justice.gov/opa/pr/x',dockets:['25-cr-42']},{id:'u2',title:'Unrelated release',date:'2025-01-01',url:'https://www.justice.gov/opa/pr/y',dockets:[]}];
  const fec=[{id:'mur-8000',kind:'Enforcement case (MUR)',title:'Collins for Senator',opened:'2024-01-01',closed:'2025-01-01',date:'2025-01-01',url:'https://www.fec.gov/data/legal/matter-under-review/8000/'}];
  const out=mergeLegal(courts,fec,doj);
  const c=out.find(e=>e.title==='United States v. Example');
  assert.deepEqual(c.kinds,['Docket','Opinion','DOJ press release']);assert.deepEqual(c.sources,['CourtListener','DOJ']);
  assert.equal(c.links.length,3);assert.equal(c.date,'2025-09-10','the latest date of its parts');
  assert.equal(out.length,4,'the civil case, the unrelated release and the FEC case stay separate');
  assert.deepEqual(out.map(e=>e.date),[...out.map(e=>e.date)].sort().reverse(),'newest first');
});

test('statements: a post that links to the press release, or repeats it within days, is the same statement',()=>{
  const press=[{title:'Collins Secures Funding for Maine Shipyard Workers and Families',url:'https://www.collins.senate.gov/newsroom/press/shipyard',date:'2026-10-01'},
    {title:'Collins Statement on the Farm Bill Vote',url:'https://www.collins.senate.gov/newsroom/press/farm',date:'2026-09-20'}];
  const bluesky=[{text:'Proud to secure this for Maine.',url:'https://bsky.app/profile/x/post/1',date:'2026-10-02',links:['https://collins.senate.gov/newsroom/press/shipyard/']},
    {text:'Good morning, Maine!',url:'https://bsky.app/profile/x/post/2',date:'2026-10-02',links:[]}];
  const threads=[{text:'Collins secures funding for Maine shipyard workers and their families today',url:'https://www.threads.net/@x/post/3',date:'2026-10-03',issues:['jobs']}];
  const youtube=[{title:'Collins Statement on the Farm Bill Vote',url:'https://www.youtube.com/watch?v=abc',date:'2026-11-30'}];
  const out=mergeStatements({press,bluesky,threads,youtube});
  const ship=out.find(s=>s.url.endsWith('/shipyard'));
  assert.deepEqual(ship.sources,['Press release','Bluesky','Threads'],'the link joins Bluesky, the repeated words join Threads');
  assert.equal(ship.source,'Press release','the press release leads');assert.deepEqual(ship.issues,['jobs']);
  assert.equal(out.length,5-1-1+1,'the farm-bill video is weeks later, so it stays separate; the greeting stays separate');
});

test('donor organizations: each source fills in the same organization, and a source not run yet is not checked',()=>{
  const sections={donors:{orgs:[{employer:'Acme Corp',total:52000,count:40},{employer:'Beta LLC',total:9000,count:8}]},
    lobbying:{rows:[{org:'Acme Corp',amount:120000,issues:['Health Issues','Taxation'],url:'https://lda.gov/f/1'},{org:'Acme Corp',amount:80000,issues:['Taxation'],url:'https://lda.gov/f/2'}]},
    sam:{rows:[{org:'Acme Corp',uei:'ABC123DEF456'},{org:'Beta LLC',uei:null,review:'2 possible matches'}]},
    contracts:{rows:[{org:'Acme Corp',amount:3e6,url:'https://www.usaspending.gov/award/1',agency:'Department of Defense'}]}};
  const d=donorOrgs(sections,[{id:'7000',name:'ACME CORP.',url:'https://efile.fara.gov/x'}]);
  const a=d.rows[0];
  assert.deepEqual([a.lobbying.n,a.lobbying.amount,a.lobbying.issues],[2,200000,['Health Issues','Taxation']]);
  assert.deepEqual([a.uei,a.contracts.total,a.fara.length],['ABC123DEF456',3000000,1]);
  assert.deepEqual(a.sources,['FEC','LDA.gov','FARA','SAM.gov','USAspending']);
  assert.equal(d.rows[1].samReview,'2 possible matches');
  assert.deepEqual(d.checked,{lobbying:true,fara:true,regulations:false,sam:true,contracts:true});
  assert.equal(donorOrgs({},[]),null,'no donor list yet, nothing to join');
  assert.equal(donorOrgs(sections,null).checked.fara,false,'the FARA list not read yet');
});
