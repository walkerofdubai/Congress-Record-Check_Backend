import test from 'node:test';
import assert from 'node:assert/strict';
import {parseRange,rangeOf,assetKind,nameKey,matchPeople,summarize,refreshedFrom,build,misdated,CREDIT} from '../scripts/build-exec-trades.mjs';

// Rows in the dataset's format (made up, not copied from it).
const row=(o={})=>({filer_name:'Pat Q. Official',role_title:'Secretary of Testing',agency:'DOT',ticker:'N/A',asset_description:'ACME CORP',
  transaction_type:'Buy',transaction_date:'2026-01-10',amount_range:'$1,001 - $15,000',filing_date:'',filing_type:'',source_filing_id:'',
  disclosedcapitol_url:'https://www.disclosedcapitol.com/politicians/1',...o});

test('OGE ranges are read, and a range that is not one of them is "Other ranges"',()=>{
  assert.deepEqual(parseRange('$15,001 - $50,000'),{low:15001,high:50000});
  assert.deepEqual(parseRange('Over $50,000,000'),{low:50000001,high:null});
  assert.equal(parseRange('$500,001 - $500,000'),null,'a range that runs backwards is unreadable');
  assert.deepEqual([rangeOf('$1,001 - $15,000'),rangeOf('Over $50,000,000'),rangeOf('$50,001 - $250,000')],['$1,001 - $15,000','Over $50,000,000','Other ranges']);
});

test('the kind of asset comes from the ticker bucket, and a missing ticker is a bond only when the description reads like one',()=>{
  const k=(ticker,asset_description='ACME CORP')=>assetKind({ticker,asset_description});
  assert.deepEqual([k('BOND'),k('MUNI'),k('TREAS'),k('ETF'),k('LP'),k('SPY'),k('BRK-B')],['bond','muni','treasury','fund','partnership','ticker','ticker']);
  assert.equal(k('N/A','ACME CORP 5.25% SR NOTES DUE 2031'),'bond');
  assert.equal(k('N/A','ACME CORP COM'),'named');
  assert.equal(k('THE','THE ACME COMPANY'),'named','a word the parser picked up is not a ticker');
});

test('officials match profiles by first and last name, and a name two profiles share is left out',()=>{
  assert.equal(nameKey('Pat Q. Official, Jr.'),'pat official');
  assert.equal(nameKey('José Núñez'),'jose nunez');
  assert.deepEqual(matchPeople(['Pat Q. Official','Lee Other'],[{id:'official',name:'Pat Official'},{id:'x',name:'Someone Else'}]),{'Pat Q. Official':'official'});
  assert.deepEqual(matchPeople(['Pat Official'],[{id:'a',name:'Pat Official'},{id:'b',name:'Pat R. Official'}]),{});
});

test('a trade listed twice counts once, and the copy kept is the one on a periodic report',()=>{
  const linked={filing_date:'2026-02-01',filing_type:'278-T',source_filing_id:'r1'};
  const s=summarize([row(),row(linked),row({asset_description:'BETA INC',transaction_type:'Sell'})]);
  assert.deepEqual([s.rows,s.trades,s.repeats,s.buys,s.sells,s.linked],[3,2,1,1,1,1]);
  assert.equal(s.recent.find(t=>t.asset==='ACME CORP').form,'278-T');
});

test('a trade dated long before its periodic report is counted but kept out of the charts and the late count',()=>{
  const report={filing_date:'2026-02-26',filing_type:'278-T',source_filing_id:'r1;r2'};
  const rows=[row({...report,transaction_date:'2008-12-01',asset_description:'OLD BOND DUE 2009'}),
    row({...report,transaction_date:'2026-01-02'}),row({...report,transaction_date:'2026-02-20',asset_description:'BETA INC'})];
  assert.equal(misdated(rows[0]),true);
  const s=summarize(rows);
  assert.equal(s.trades,3);assert.equal(s.misdated,1);
  assert.deepEqual(s.byYear.map(y=>y.year),['2026']);
  assert.deepEqual(s.late,{n:1,of:2},'only the January trade was reported more than 45 days later');
  assert.deepEqual(s.reports,[{filed:'2026-02-26',form:'278-T',count:2,listed:3,misdated:1,from:'2026-01-02',to:'2026-02-20'}]);
});

test('values add up the disclosed ranges, and the latest trades come first',()=>{
  const s=summarize([row({transaction_date:'2026-03-01',amount_range:'$15,001 - $50,000'}),row({transaction_date:'2026-04-01',asset_description:'BETA INC'})]);
  assert.deepEqual(s.value,{low:16002,high:65000,open:0});
  assert.deepEqual(s.recent.map(t=>t.traded),['2026-04-01','2026-03-01']);
  assert.deepEqual(s.byAmount,[{label:'$1,001 - $15,000',n:1},{label:'$15,001 - $50,000',n:1}]);
});

test('the build keeps only profiled people and carries the credit line and license',()=>{
  const out=build([row(),row({filer_name:'Lee Other'})],[{id:'official',name:'Pat Official'}],{refreshed:refreshedFrom('| Last refreshed | 2026-10-20 (UTC) |'),built:'2026-10-30'});
  assert.deepEqual(Object.keys(out.people),['official']);
  assert.deepEqual([out.credit,out.license,out.refreshed,out.built],[CREDIT,'CC BY 4.0','2026-10-20','2026-10-30']);
});
