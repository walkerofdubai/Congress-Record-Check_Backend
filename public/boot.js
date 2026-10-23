import {RecordLive} from './live.js';
window.RecordLive=RecordLive;
try {
  const history=fetch('/funder-history.json',{cache:'no-cache'}).then(r=>r.ok?r.json():null).catch(()=>null);
  const portraits=fetch('/portraits/index.json',{cache:'no-cache'}).then(r=>r.ok?r.json():null).catch(()=>null);
  const response=await fetch('/research.json',{cache:'no-cache'});
  if(!response.ok)throw new Error('Research file unavailable');
  window.DATA=await response.json();
  window.FUNDHIST=await history;
  window.PORTRAITS=(await portraits)?.people||{};
  await import('./app.js');
  await RecordLive.banner();
  window.addEventListener('hashchange',()=>RecordLive.banner());
  setInterval(()=>RecordLive.banner(),60000);
}catch(error){
  document.querySelector('#app').textContent='The saved research could not be loaded. Start the local server and reopen this page.';
  console.error(error);
}
