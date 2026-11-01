// Individual donors' money by gift size (public/donor-sizes.js and the 'donor-sizes' refresh job in src/feeds.mjs):
// the FEC's five size groups, checked against the committee's itemized and unitemized totals.
import test from 'node:test';
import assert from 'node:assert/strict';
import config from '../data/config.json' with {type:'json'};
import {SIZE_BRACKETS,donorSizes,sizeParts,sizeShare} from '../public/donor-sizes.js';
import {FEEDS} from '../src/feeds.mjs';
const json=o=>new Response(JSON.stringify(o),{headers:{'content-type':'application/json'}});
const rows=list=>list.map(([size,total,count])=>({size,total,count}));

test('the five groups are the FEC\'s, in size order',()=>{
  assert.deepEqual(SIZE_BRACKETS.map(b=>b.size),[0,200,500,1000,2000]);
});

test('unitemized gifts go in the first group once, whether or not the FEC already counted them there',()=>{
  // The groups hold itemized gifts only: unitemized are added to "$200 and under".
  const a=donorSizes(rows([[0,10000,80],[200,20000,60],[500,30000,40],[1000,40000,30],[2000,100000,25]]),
    {individual_itemized_contributions:200000,individual_unitemized_contributions:50000,coverage_start_date:'2025-01-01T00:00:00',coverage_end_date:'2026-09-30T00:00:00'});
  assert.equal(a.brackets[0].total,60000);assert.equal(a.unitemizedIncluded,false);assert.equal(a.notSorted,0);assert.equal(a.total,250000);
  assert.equal(a.start,'2025-01-01');assert.equal(a.end,'2026-09-30');
  // The first group already holds them: not added again.
  const b=donorSizes(rows([[0,60000,80],[200,20000,60],[500,30000,40],[1000,40000,30],[2000,100000,25]]),
    {individual_itemized_contributions:200000,individual_unitemized_contributions:50000});
  assert.equal(b.brackets[0].total,60000);assert.equal(b.unitemizedIncluded,true);assert.equal(b.total,250000);
});

test('itemized gifts not sorted by size yet are shown on their own, never spread over the groups',()=>{
  const x=donorSizes(rows([[0,10000,1],[2000,50000,1]]),{individual_itemized_contributions:90000,individual_unitemized_contributions:0});
  assert.equal(x.notSorted,30000);assert.equal(x.total,90000);
  const parts=sizeParts(x);
  assert.deepEqual(parts.map(p=>p.key),['sz1','sz5','szn'],'empty groups left out, the unsorted part last');
  assert.equal(sizeShare(30000,x.total),'33%');assert.equal(sizeShare(100,x.total),'<1%');assert.equal(sizeShare(0,0),'0%');
  // Odd sizes and missing numbers are ignored.
  const y=donorSizes([{size:'5000',total:9},{size:0,total:null,count:null}],{});
  assert.equal(y.total,0);assert.equal(y.notSorted,0);assert.deepEqual(sizeParts(y),[]);
});

test('the refresh job reads the FEC\'s size groups and the committee\'s totals for the same cycle',async()=>{
  const p=config.people.find(x=>x.fecCmte);assert.ok(p);
  const jobs=FEEDS['donor-sizes'].jobs({...config,cycle:2026});
  assert.ok(jobs.some(j=>j.id===`donor-sizes:${p.id}`&&j.args.committee===p.fecCmte&&j.args.cycle===2026));
  const a={committee:p.fecCmte,cycle:2026},calls=[];
  const env={FEC_API_KEY:'fk',fetch:async u=>{u=String(u);calls.push(u);
    if(/by_size/.test(u))return json({results:[{committee_id:a.committee,cycle:2026,size:0,total:1000,count:9},{committee_id:a.committee,cycle:2026,size:2000,total:9000,count:3},
      {committee_id:'C99999999',cycle:2026,size:500,total:777,count:1},{committee_id:a.committee,cycle:2024,size:500,total:555,count:1}],pagination:{}});
    if(/\/totals\//.test(u))return json({results:[{committee_id:a.committee,cycle:2026,individual_itemized_contributions:10000,individual_unitemized_contributions:4000,coverage_start_date:'2025-01-01T00:00:00',coverage_end_date:'2026-09-30T00:00:00'}],pagination:{}});
    throw new Error('unexpected '+u);}};
  const job={kind:'donor-sizes',subject:p.id,args:JSON.stringify(a),cursor:null,started_at:new Date().toISOString()};
  const r=await FEEDS['donor-sizes'].page(job,a,env,config);
  assert.equal(r.next,null);
  const u0=new URL(calls[0]);assert.equal(u0.pathname,'/v1/schedules/schedule_a/by_size/');assert.equal(u0.searchParams.get('committee_id'),a.committee);assert.equal(u0.searchParams.get('cycle'),'2026');
  assert.match(calls[1],new RegExp(`/v1/committee/${a.committee}/totals/\\?cycle=2026`));
  const snap=FEEDS['donor-sizes'].summarize(r.rows,a,job,config);
  assert.equal(snap.brackets[0].total,5000,'unitemized $4,000 joins the $1,000 itemized in the first group');
  assert.equal(snap.brackets[2].total,0,'another committee\'s or cycle\'s rows are left out');
  assert.equal(snap.total,14000);assert.equal(snap.cycle,2026);assert.match(snap.source,/^https:\/\/www\.fec\.gov\/data\/committee\//);
  assert.ok(!JSON.stringify(snap).includes('fk'),'the key is never saved');
  // No report for the cycle yet: the job says so instead of saving an empty breakdown.
  const none={FEC_API_KEY:'fk',fetch:async u=>json({results:[],pagination:{}})};
  await assert.rejects(FEEDS['donor-sizes'].page(job,a,none,config),/No campaign report/);
});
