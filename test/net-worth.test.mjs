// Net worth from the latest annual financial disclosure (public/net-worth.js and the 'net-worth-house' and
// 'net-worth-senate' refresh jobs in src/feeds.mjs): every value on the form is a range, so the result is one.
import test from 'node:test';
import assert from 'node:assert/strict';
import config from '../data/config.json' with {type:'json'};
import {valueRange,netWorth,rangeText} from '../public/net-worth.js';
import {FEEDS,houseAnnualHoldings,efdAnnualHoldings} from '../src/feeds.mjs';

test('values as written on the forms',()=>{
  assert.deepEqual(valueRange('$15,001 - $50,000'),[15001,50000]);
  assert.deepEqual(valueRange('$1,001 -\n $15,000'),[1001,15000],'a range that wraps');
  assert.deepEqual(valueRange('Over $50,000,000'),[50000001,null]);
  assert.deepEqual(valueRange('Spouse/DC Over $1,000,000'),[1000001,null]);
  assert.deepEqual(valueRange('None (or less than $1,001)'),[0,1000]);
  assert.equal(valueRange('Undetermined'),null);assert.equal(valueRange(''),null);
});

test('the range: assets at the bottom minus debts at the top, and the reverse; an open-ended value leaves that end open',()=>{
  const x=netWorth([{value:'$15,001 - $50,000'},{value:'$100,001 - $250,000'},{value:'Undetermined'}],[{amount:'$10,001 - $15,000'}]);
  assert.equal(x.low,115002-15000);assert.equal(x.high,300000-10001);assert.equal(x.nAssets,2);assert.equal(x.unread,1);
  const y=netWorth([{value:'Spouse/DC Over $1,000,000'}],[]);assert.equal(y.low,1000001);assert.equal(y.high,null);
  const z=netWorth([{value:'$1,001 - $15,000'}],[{amount:'Over $50,000,000'}]);assert.equal(z.low,null,'a debt with no top leaves the bottom open');
  const m=v=>'$'+Math.round(v/1000)+'K';
  assert.equal(rangeText({low:100000,high:250000},m),'$100K – $250K');assert.equal(rangeText({low:1000001,high:null},m),'$1000K or more');
  assert.equal(netWorth([],[]).low,0,'nothing listed: zero, shown with the count of assets read');
});

test('a House annual report: assets by their codes, the value right after the owner, and the liabilities',()=>{
  const text=`Schedule A: Assets and "Unearned" Income
Asset Owner Value of Asset Income Type(s) Income Current Year to Filing Income Preceding Year
Apple Inc. (AAPL) [ST] SP $15,001 - $50,000 Dividends $201 - $1,000 $201 - $1,000
Wells Fargo checking [BA] JT $50,001 - $100,000 Interest $1 - $200 $1 - $200
Rental house, Anytown [RP] $250,001 - $500,000 Rent $15,001 - $50,000 $15,001 - $50,000
Location: Anytown, ME, US
Big Fund [MF] Spouse/DC Over $1,000,000 Capital Gains None None
Schedule B: Transactions
Apple Inc. (AAPL) [ST] SP 01/05/2025 P $1,001 - $15,000
Schedule C: Earned Income
Schedule D: Liabilities
Owner Creditor Date Incurred Type Amount of Liability
JT Bank of Maine March 2015 Mortgage on rental property $100,001 - $250,000
Sallie Mae June 2010 Student loan $15,001 - $50,000
Schedule E: Positions`;
  const h=houseAnnualHoldings(text);
  assert.deepEqual(h.assets.map(a=>[a.code,a.owner,a.value]),[['ST','spouse','$15,001 - $50,000'],['BA','joint','$50,001 - $100,000'],['RP','self','$250,001 - $500,000'],['MF','self','Spouse/DC Over $1,000,000']],
    'the income ranges and the transactions in Schedule B are left out');
  assert.equal(h.assets[0].name,'Apple Inc. (AAPL)');
  assert.deepEqual(h.debts.map(d=>[d.owner,d.amount]),[['joint','$100,001 - $250,000'],['self','$15,001 - $50,000']]);
  const x=netWorth(h.assets,h.debts);assert.equal(x.low,15001+50001+250001+1000001-300000);assert.equal(x.high,null);
  assert.deepEqual(houseAnnualHoldings('Schedule A: Assets\nNone disclosed.\nSchedule D: Liabilities\nNone disclosed.\nSchedule E'),{assets:[],debts:[]});
  assert.deepEqual(houseAnnualHoldings(''),{assets:[],debts:[]},'a paper report has no text');
});

test('a Senate eFD annual report: the asset and liability tables, not the gifts or transactions',()=>{
  const table=(heads,rows)=>`<table><thead><tr>${heads.map(h=>`<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.map(r=>`<tr>${r.map(c=>`<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  const html=table(['#','Asset','Asset Type','Owner','Value','Income Type','Income Amount'],[['1','<strong>Vanguard 500</strong>','Mutual Funds','Spouse','$100,001 - $250,000','Dividends','$2,501 - $5,000'],['2','Checking','Bank Deposit','Self','$15,001 - $50,000','Interest','$1 - $200']])
    +table(['#','Transaction Date','Owner','Ticker','Asset Name','Type','Amount'],[['1','01/02/2025','Self','AAPL','Apple','Purchase','$1,001 - $15,000']])
    +table(['#','Date','Recipient','Value','Source'],[['1','03/01/2025','Self','$500','A friend']])
    +table(['#','Date Incurred','Debtor','Type','Points','Term Rate','Amount','Creditor'],[['1','2019','Joint','Mortgage','','30 years','$250,001 - $500,000','Big Bank']]);
  const h=efdAnnualHoldings(html);
  assert.deepEqual(h.assets.map(a=>[a.name,a.owner,a.value]),[['Vanguard 500','spouse','$100,001 - $250,000'],['Checking','self','$15,001 - $50,000']]);
  assert.deepEqual(h.debts.map(d=>[d.creditor,d.owner,d.amount]),[['Big Bank','joint','$250,001 - $500,000']]);
});

test('the House job reads the newest report year, an amendment over the original, and lists a paper report as unreadable',async()=>{
  const p=config.people.find(x=>x.inOffice&&x.chamber==='H');assert.ok(p);
  assert.ok(FEEDS['net-worth-house'].jobs(config).some(j=>j.id===`net-worth-house:${p.id}`));
  assert.ok(FEEDS['net-worth-senate'].jobs(config).every(j=>config.people.find(x=>x.id===j.subject).chamber==='S'));
  const filings=[{id:'1',type:'O',year:2024,filed:'2024-05-15',url:'https://disclosures-clerk.house.gov/public_disc/financial-pdfs/2024/1.pdf'},
    {id:'2',type:'O',year:2025,filed:'2025-05-15',url:'https://disclosures-clerk.house.gov/public_disc/financial-pdfs/2025/2.pdf'},
    {id:'3',type:'A',year:2025,filed:'2025-06-01',url:'https://disclosures-clerk.house.gov/public_disc/financial-pdfs/2025/3.pdf'},
    {id:'4',type:'P',year:2025,filed:'2025-07-01',url:'https://disclosures-clerk.house.gov/public_disc/ptr-pdfs/2025/4.pdf'}];
  const urls=[];
  const env={DB:{prepare:()=>({bind:()=>({all:async()=>({results:[{payload:JSON.stringify({byPerson:{[p.id]:filings}})}]})})})},
    fetch:async u=>{urls.push(String(u));return new Response(new Uint8Array([1,2,3]));}};
  const job={kind:'net-worth-house',subject:p.id,args:'{}',cursor:null,started_at:new Date().toISOString()};
  const r=await FEEDS['net-worth-house'].page(job,{},env,config);
  assert.deepEqual(urls,[filings[2].url],'the 2025 amendment');
  const snap=FEEDS['net-worth-house'].summarize(r.rows);
  assert.equal(snap.year,2025);assert.equal(snap.unreadable,true,'no text: filed on paper, checked by hand');assert.equal(snap.url,filings[2].url);
});
