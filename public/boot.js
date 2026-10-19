import {RecordLive} from './live.js';
window.RecordLive=RecordLive;
try {
  const response=await fetch('/research.json',{cache:'no-cache'});
  if(!response.ok)throw new Error('Research file unavailable');
  window.DATA=await response.json();
  await import('./app.js');
  await RecordLive.banner();
  window.addEventListener('hashchange',()=>RecordLive.banner());
  setInterval(()=>RecordLive.banner(),60000);
}catch(error){
  document.querySelector('#app').textContent='The saved research could not be loaded. Start the local server and reopen this page.';
  console.error(error);
}
