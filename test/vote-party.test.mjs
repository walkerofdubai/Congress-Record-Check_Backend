import test from 'node:test';
import assert from 'node:assert/strict';
import {voteArgs,savedVotes,csvRows,resultCounts,totalsAgree,voteviewParty} from '../scripts/build-vote-party.mjs';
import {voteURL} from '../src/sources.mjs';
import {votePositions,houseVotePositions} from '../scripts/fill-vote-positions.mjs';
import {cosponsorRecords,identical} from '../scripts/fill-bill-cosponsors.mjs';

test('each saved vote maps to its official roll-call file',()=>{
  assert.deepEqual(voteArgs({id:'119-1-372'},'S'),{chamber:'S',congress:119,session:1,number:372});
  assert.deepEqual(voteArgs({id:'h-119-1-023',year:2025,roll:23},'H'),{chamber:'H',year:2025,number:23});
  assert.equal(voteArgs({id:'bad'},'S'),null);
  const v=savedVotes({votes:[{id:'119-1-372'}],hvotes:[{id:'h-119-1-023',year:2025,roll:23}]});
  assert.deepEqual(v.map(x=>voteURL(x.args)),['https://www.senate.gov/legislative/LIS/roll_call_votes/vote1191/vote_119_1_00372.xml','https://clerk.house.gov/evs/2025/roll023.xml']);
});

test('CSV rows are read by their header, with quoted commas and quotes',()=>{
  const rows=csvRows('congress,chamber,bioname,party_code\r\n119,Senate,"SMITH, Pat ""PJ""",100\n119,Senate,LEE,200\n');
  assert.deepEqual(rows,[{congress:'119',chamber:'Senate',bioname:'SMITH, Pat "PJ"',party_code:'100'},{congress:'119',chamber:'Senate',bioname:'LEE',party_code:'200'}]);
});

test('a saved result\'s yeas and nays check the party totals, allowing one for the Vice President',()=>{
  assert.deepEqual(resultCounts('Not sustained, 6-93'),{yea:6,nay:93});
  assert.equal(resultCounts('Agreed to by voice vote'),null);
  const t={R:{Yea:50},D:{Nay:47},I:{Nay:2,'Not Voting':1}};
  assert.equal(totalsAgree(t,'Passed 50-49'),true);
  assert.equal(totalsAgree(t,'Passed 51-49 (VP tie-break)'),true);
  assert.equal(totalsAgree(t,'Rejected 49-50'),false);
  assert.equal(totalsAgree(t,'Agreed to by voice vote'),true,'nothing to check against');
});

test('Voteview rows give party totals by the official session and roll number, and a mismatch is left out',()=>{
  // Made-up rows in Voteview's layout. Voteview numbers a Congress's votes straight through, so its roll number 401 is
  // the official second-session vote 5.
  const rollcalls=[{congress:'119',chamber:'Senate',rollnumber:'401',date:'2026-01-08',session:'2',clerk_rollnumber:'5'},
    {congress:'119',chamber:'Senate',rollnumber:'402',date:'2026-01-09',session:'2',clerk_rollnumber:'6'}];
  const members=[[1,200],[2,200],[3,100],[4,328],[5,100]].map(([icpsr,party_code])=>({congress:'119',chamber:'Senate',icpsr:String(icpsr),party_code:String(party_code)}))
    .concat({congress:'119',chamber:'President',icpsr:'99',party_code:'200'});
  const cast=(roll,codes)=>codes.map((c,i)=>({congress:'119',chamber:'Senate',rollnumber:String(roll),icpsr:String(i+1),cast_code:String(c)}));
  const votes=[...cast(401,[1,1,6,6,9]),...cast(402,[1,6,6,6,3])];
  const w=(id,o={})=>({id,date:null,result:'',args:voteArgs({id},'S'),...o});
  const out=voteviewParty({rollcalls,members,votes},[w('119-2-5',{date:'2026-01-08',result:'Agreed to 2-2'}),w('119-2-6',{result:'Passed 3-1'}),w('119-2-7'),w('119-2-5b')].filter(x=>x.args));
  assert.deepEqual(out.votes,{'119-2-5':{R:{Yea:2},D:{Nay:1,'Not Voting':1},I:{Nay:1}}});
  assert.match(out.problems['119-2-6'],/don't match/,'the saved result says 3-1, Voteview has 1-3');
  assert.equal(out.problems['119-2-7'],'not in Voteview yet');
  const late=voteviewParty({rollcalls,members,votes},[w('119-2-5',{date:'2026-02-20'})]);
  assert.match(late.problems['119-2-5'],/dates it/,'a different day means a different vote');
});

test('senators\' positions from Voteview fill only the missing ones, by Bioguide ID, and a listed one that differs is reported',()=>{
  // Made-up rows in Voteview's layout.
  const rollcalls=[{congress:'117',chamber:'Senate',rollnumber:'210',date:'2021-06-08',session:'1',clerk_rollnumber:'223'}];
  const members=[['1','C001035'],['2','M001198'],['3','S001198']].map(([icpsr,bioguide_id])=>({congress:'117',chamber:'Senate',icpsr,bioguide_id,party_code:'200'}));
  const votes=[['1','6'],['2','1'],['3','1']].map(([icpsr,cast_code])=>({congress:'117',chamber:'Senate',rollnumber:'210',icpsr,cast_code}));
  const tracked=[{id:'collins',bioguide:'C001035'},{id:'marshall',bioguide:'M001198'},{id:'sullivan',bioguide:'S001198'},{id:'ricketts',bioguide:'R000618'}];
  const saved=[{id:'117-1-223',congress:117,session:1,number:223,date:'2021-06-08',pos:{sullivan:'Nay',ricketts:'Not in office'}},{id:'117-1-999',congress:117,session:1,number:999,pos:{}}];
  const r=votePositions({rollcalls,members,votes},saved,tracked);
  assert.deepEqual(r.fill,{'117-1-223':{collins:'Nay',marshall:'Yea'}},'only the missing senators, and never a listed one');
  assert.deepEqual(r.differ,[{vote:'117-1-223',person:'sullivan',research:'Nay',voteview:'Yea'}]);
  assert.equal(r.unread['117-1-999'],'not in Voteview yet');
  const r2=votePositions({rollcalls,members,votes},[{...saved[0],pos:{}}],[{id:'ricketts',bioguide:'R000618'}]);
  assert.deepEqual(r2.fill,{'117-1-223':{ricketts:'Not in office'}},'not a senator in that Congress');
});

test('House positions come from the Clerk\'s file by Bioguide ID; someone not on it wasn\'t a member then',()=>{
  const normalized={date:'2021-03-09',positions:{kaptur:'Aye',perry:'No',castor:'Not Voting'}};
  const tracked=['kaptur','perry','castor','lawler'].map(id=>({id,bioguide:id.toUpperCase()}));
  const r=houseVotePositions(normalized,{id:'h-117-1-070',date:'2021-03-09',pos:{perry:'Yea'}},tracked);
  assert.deepEqual(r.fill,{kaptur:'Yea',castor:'Not voting',lawler:'Not in office'});
  assert.deepEqual(r.differ,[{vote:'h-117-1-070',person:'perry',research:'Yea',voteview:'Nay'}]);
  assert.match(houseVotePositions(normalized,{id:'x',date:'2021-03-10',pos:{}},tracked).unread,/dates it/);
});

test('cosponsors: profiled people only, the sponsor marked, a withdrawn cosponsorship left out, identical bills followed',()=>{
  const people=new Map([['B001288','booker'],['B000944','brown'],['C001035','collins']]);
  const recs=cosponsorRecords({'117-s-420':{sponsor:'B000944',introduced:'2021-02-24',cosponsors:[{bioguideId:'B001288',sponsorshipDate:'2021-02-24'},{bioguideId:'C001035',sponsorshipDate:'2021-03-01',sponsorshipWithdrawnDate:'2021-03-05'},{bioguideId:'X000001'}]},
    '117-hr-842':{sponsor:'S000185',cosponsors:[{bioguideId:'B001288'}]}},people);
  assert.deepEqual(recs,[{person:'booker',bill:'117-hr-842',date:null},{person:'booker',bill:'117-s-420',date:'2021-02-24'},{person:'brown',bill:'117-s-420',sponsor:true,date:'2021-02-24'}]);
  assert.deepEqual(identical([{congress:117,type:'S',number:420,relationshipDetails:[{type:'Identical bill'}]},{congress:117,type:'HR',number:5,relationshipDetails:[{type:'Related bill'}]},{congress:116,type:'S',number:1306,relationshipDetails:[{type:'Identical bill'}]}],117),['117-s-420']);
});
