import {RecordLive} from './live.js';
window.RecordLive=RecordLive;
try {
  const history=fetch('/funder-history.json',{cache:'no-cache'}).then(r=>r.ok?r.json():null).catch(()=>null);
  const portraits=fetch('/portraits/index.json',{cache:'no-cache'}).then(r=>r.ok?r.json():null).catch(()=>null);
  const committees=fetch('/committees.json',{cache:'no-cache'}).then(r=>r.ok?r.json():null).catch(()=>null);
  const sectors=fetch('/committee-sectors.json',{cache:'no-cache'}).then(r=>r.ok?r.json():null).catch(()=>null);
  const scoreLog=fetch('/score-log.json',{cache:'no-cache'}).then(r=>r.ok?r.json():null).catch(()=>null);
  const senate=fetch('/senate.json',{cache:'no-cache'}).then(r=>r.ok?r.json():null).catch(()=>null);
  const execTrades=fetch('/exec-trades.json',{cache:'no-cache'}).then(r=>r.ok?r.json():null).catch(()=>null);
  const voteParty=fetch('/vote-party.json',{cache:'no-cache'}).then(r=>r.ok?r.json():null).catch(()=>null);
  const response=await fetch('/research.json',{cache:'no-cache'});
  if(!response.ok)throw new Error('Research file unavailable');
  window.DATA=await response.json();
  window.FUNDHIST=await history;
  window.PORTRAITS=(await portraits)?.people||{};
  window.COMMITTEES=(await committees)||{committees:{},people:{}};
  window.COMMITTEE_SECTORS=(await sectors)?.committees||{};
  window.SCORELOG=(await scoreLog)?.entries||[];
  window.EXEC_TRADES=await execTrades;
  window.VOTE_PARTY=(await voteParty)?.votes||null;
  const sen=await senate;window.SENATE=sen?.senators||[];window.SENATE_INFO=sen?{checked:sen.checked,source:sen.source,congress:sen.congress}:null;
  await import('./app.js');
  await RecordLive.banner();
  window.addEventListener('hashchange',()=>RecordLive.banner());
  setInterval(()=>RecordLive.banner(),60000);
}catch(error){
  document.querySelector('#app').textContent='The saved research could not be loaded. Start the local server and reopen this page.';
  console.error(error);
}
