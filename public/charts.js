// Chart builders for the score pages and the profile tabs. List charts (ranked, stacked and diverging bars) are HTML and
// size themselves; plotted charts draw into an element at its current width and are redrawn on resize by the caller.
// Every mark carries a data-tip for the shared hover tip, and every chart has a table view next to it.
const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const MON=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const dayMs=86400000;
export const money=n=>{if(n==null)return '—';const a=Math.abs(n);return (n<0?'−$':'$')+(a>=1e9?(a/1e9).toFixed(a>=1e10?1:2)+'B':a>=1e6?(a/1e6).toFixed(a>=1e7?1:2)+'M':a>=1e3?(a/1e3).toFixed(a>=1e5?0:1)+'K':Math.round(a));};
const when=d=>{const m=/^(\d{4})-(\d{2})(?:-(\d{2}))?/.exec(d||'');return m?`${m[3]?+m[3]+' ':''}${MON[+m[2]-1]} ${m[1]}`:d||'';};
// People and Profit share their colors everywhere: the diverging bars, the tree map and the outside-spending sectors.
export const ALIGN_COLOR={people:'var(--s1)',profit:'var(--s5)',other:'var(--cx-other)'};

// The shared hover tip: a mark's data-tip shows on hover and on keyboard focus.
export function hoverTips(root){
  const tip=document.querySelector('#tip');if(!tip||!root)return;
  root.querySelectorAll('[data-tip]').forEach(el=>{
    if(el.dataset.tipBound)return;el.dataset.tipBound='1';
    el.addEventListener('mouseenter',()=>{tip.textContent=el.dataset.tip;tip.classList.add('show');});
    el.addEventListener('mousemove',e=>{tip.style.left=Math.max(10,Math.min(e.clientX+12,window.innerWidth-310))+'px';tip.style.top=(e.clientY+14)+'px';});
    el.addEventListener('mouseleave',()=>tip.classList.remove('show'));
    el.setAttribute('tabindex','0');el.setAttribute('aria-label',el.dataset.tip);
    el.addEventListener('focus',()=>{const r=el.getBoundingClientRect();tip.textContent=el.dataset.tip;tip.style.left=Math.max(10,Math.min(r.left,window.innerWidth-310))+'px';tip.style.top=(r.bottom+6)+'px';tip.classList.add('show');});
    el.addEventListener('blur',()=>tip.classList.remove('show'));
  });
}
export const tableView=(head,rows,summary='Show as a table')=>`<details class="tv"><summary>${esc(summary)}</summary><div class="tablewrap"><table><thead><tr>${head.map(h=>`<th${/^(Amount|Points|Days|%|Count|Total|Kept|Half|Contradicted|People|Profit|Score)/.test(h)?' class="r"':''}>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map(r=>`<tr>${r.map((c,i)=>`<td${/^(Amount|Points|Days|%|Count|Total|Kept|Half|Contradicted|People|Profit|Score)/.test(head[i])?' class="r"':''}>${c}</td>`).join('')}</tr>`).join('')||`<tr><td colspan="${head.length}" class="muted">Nothing to show.</td></tr>`}</tbody></table></div></details>`;
const legend=items=>`<div class="legend">${items.map(([c,l,cls])=>`<span><i class="${cls||''}" style="background:${c}"></i>${esc(l)}</span>`).join('')}</div>`;
export {legend};
const who=r=>`<div class="cx-who">${r.href?`<a href="${esc(r.href)}">${esc(r.label)}</a>`:esc(r.label)}${r.sub?`<small>${esc(r.sub)}</small>`:''}</div>`;

// Ranked bars: one row per person, a bar to the value (0-100) colored by grade; "Not graded" rows stay, greyed.
export function rankBars(rows){
  return `<div class="cx-rows">${rows.map(r=>r.value==null
    ?`<div class="cx-row cx-ng">${who(r)}<div class="cx-track"><span class="cx-ngt">Not graded${r.note?` · ${esc(r.note)}`:''}</span></div><div class="cx-val">—</div></div>`
    :`<div class="cx-row">${who(r)}<div class="cx-track"><i class="cx-bar" style="width:${Math.max(1,r.value)}%;background:${r.color}" data-tip="${esc(r.tip||`${r.label}: ${r.value}%`)}"></i></div><div class="cx-val"><b class="${r.cls||''}">${esc(r.display||r.value+'%')}</b>${r.note?`<small>${esc(r.note)}</small>`:''}</div></div>`).join('')}</div>`;
}
// Stacked bars in raw counts or points, on one scale for every row, with a 2px surface gap between segments.
export function stackRows(rows,segs,{unit='',max}={}){
  const top=max||Math.max(1,...rows.map(r=>segs.reduce((t,s)=>t+(r.parts[s.key]||0),0)));
  return `<div class="cx-rows">${rows.map(r=>{const total=segs.reduce((t,s)=>t+(r.parts[s.key]||0),0);
    return `<div class="cx-row${r.grey?' cx-ng':''}">${who(r)}<div class="cx-track"><div class="cx-stack" style="width:${total/top*100}%">${segs.filter(s=>r.parts[s.key]).map(s=>`<i class="${s.cls||''}" style="flex:${r.parts[s.key]};background:${s.color}" data-tip="${esc(`${r.label}: ${r.parts[s.key]} ${s.label.toLowerCase()}${unit}`)}"></i>`).join('')}</div>${!total?`<span class="cx-ngt">${esc(r.empty||'None')}</span>`:''}</div><div class="cx-val">${r.value!=null?`<b class="${r.cls||''}">${esc(r.display||r.value)}</b>`:''}${r.note?`<small>${esc(r.note)}</small>`:''}</div></div>`;}).join('')}</div>`;
}
// Diverging bars centered at 50%: People-leaning to the right, wealthy-and-corporate-leaning to the left.
export function divergingRows(rows,{left='More for the wealthy and corporations',right='More for working people'}={}){
  return `<div class="cx-rows"><div class="cx-row cx-dhead"><div></div><div class="cx-dlabels"><span>← ${esc(left)}</span><span>${esc(right)} →</span></div><div></div></div>${rows.map(r=>{
    if(r.value==null)return `<div class="cx-row cx-ng">${who(r)}<div class="cx-track cx-dtrack"><span class="cx-ngt">Not graded${r.note?` · ${esc(r.note)}`:''}</span></div><div class="cx-val">—</div></div>`;
    const d=r.value-50,w=Math.abs(d)/50*50;
    return `<div class="cx-row">${who(r)}<div class="cx-track cx-dtrack"><i class="cx-dbar ${d>=0?'r':'l'}" style="width:${Math.max(.6,w)}%;${d>=0?'left:50%':'right:50%'};background:${d>=0?ALIGN_COLOR.people:ALIGN_COLOR.profit}" data-tip="${esc(r.tip||`${r.label}: ${r.value}%`)}"></i></div><div class="cx-val"><b class="${r.cls||''}">${r.value}%</b>${r.note?`<small>${esc(r.note)}</small>`:''}</div></div>`;}).join('')}</div>`;
}
// Position by issue: a bar from the center line toward the liberal side (left) or the conservative side (right), the
// same way round as the ideology scale. rows: [{label, sub, lean (-100 all conservative to +100 all liberal) or null,
// value, note, tip, light (statements only), empty}].
export function leanRows(rows){
  return `<div class="cx-rows cx-lean"><div class="cx-row cx-dhead"><div></div><div class="cx-dlabels"><span>← Liberal</span><span>Conservative →</span></div><div></div></div>${rows.map(r=>{
    if(r.lean==null)return `<div class="cx-row cx-ng">${who(r)}<div class="cx-track cx-dtrack"><span class="cx-ngt">${esc(r.empty||'No record yet')}</span></div><div class="cx-val">—</div></div>`;
    const lib=r.lean>0,w=Math.abs(r.lean)/2;
    return `<div class="cx-row">${who(r)}<div class="cx-track cx-dtrack"><i class="cx-dbar ${lib?'l':'r'}${r.light?' cx-light':''}" style="width:${Math.max(.6,w)}%;${lib?'right:50%':'left:50%'};background:${lib?'var(--dem)':'var(--rep)'}" data-tip="${esc(r.tip||r.label)}"></i></div><div class="cx-val"><b>${esc(r.value)}</b>${r.note?`<small>${esc(r.note)}</small>`:''}</div></div>`;}).join('')}</div>`;
}
// Horizontal bars by category (trades by sector), highlighted categories in the accent and the rest grey.
export function categoryBars(rows,{highlightLabel,otherLabel}){
  const max=Math.max(1,...rows.map(r=>r.value));
  return `<div class="cx-rows cx-cat">${rows.map(r=>`<div class="cx-row"><div class="cx-who">${esc(r.label)}</div><div class="cx-track"><i class="cx-bar" style="width:${r.value/max*100}%;background:${r.hi?'var(--s2)':'var(--cx-other)'}" data-tip="${esc(`${r.label}: ${r.value} trade${r.value===1?'':'s'}${r.hi?' · a sector their committees oversee':''}`)}"></i></div><div class="cx-val"><b>${r.value}</b></div></div>`).join('')}</div>${legend([['var(--s2)',highlightLabel],['var(--cx-other)',otherLabel]])}`;
}

// ---------- plotted charts (draw at the element's width) ----------
const svgOpen=(W,H,label)=>`<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${esc(label)}">`;
const niceMax=v=>{if(v<=0)return 1;const p=10**Math.floor(Math.log10(v)),n=v/p;return (n<=1?1:n<=2?2:n<=5?5:10)*p;};
const t=d=>Date.parse(d+(d.length===7?'-15':''));

// Scatter: each person a dot, x and y on their own scales, grid at the ticks.
export function drawScatter(el,pts,{x,y}){
  if(!el)return;const W=Math.max(300,el.clientWidth),H=Math.min(360,Math.round(W*.62)),mL=46,mR=14,mT=12,mB=40;
  const X=v=>mL+(v-x.min)/(x.max-x.min)*(W-mL-mR),Y=v=>mT+(1-(v-y.min)/(y.max-y.min))*(H-mT-mB);
  let g='';
  for(const v of x.ticks){g+=`<line class="cx-grid" x1="${X(v)}" x2="${X(v)}" y1="${mT}" y2="${H-mB}"></line><text class="cx-tick" x="${X(v)}" y="${H-mB+15}" text-anchor="middle">${v>0?'+':''}${v}</text>`;}
  for(const v of y.ticks){g+=`<line class="cx-grid" x1="${mL}" x2="${W-mR}" y1="${Y(v)}" y2="${Y(v)}"></line><text class="cx-tick" x="${mL-6}" y="${Y(v)+4}" text-anchor="end">${v}%</text>`;}
  g+=`<text class="cx-cap" x="${mL}" y="${H-4}">← ${esc(x.left)}</text><text class="cx-cap" x="${W-mR}" y="${H-4}" text-anchor="end">${esc(x.right)} →</text>`;
  for(const p of pts)g+=`<circle class="cx-dot ${p.cls||''}" cx="${X(p.x).toFixed(1)}" cy="${Y(p.y).toFixed(1)}" r="5" data-tip="${esc(p.tip)}"></circle>`;
  el.innerHTML=svgOpen(W,H,`${y.label} against ${x.label} for ${pts.length} people`)+g+'</svg>';
  hoverTips(el);
}

// Filing delay: one dot per trade at its days from trade to disclosure, with a line at the deadline.
export function drawDelay(el,trades,deadline){
  if(!el)return;const W=Math.max(300,el.clientWidth),mL=10,mR=14,H=96,base=58;
  const pts=trades.filter(r=>r.days!=null||r.missing);
  const maxD=niceMax(Math.max(deadline*1.6,...pts.map(r=>r.days||0)));
  const X=v=>mL+v/maxD*(W-mL-mR);
  let g=`<line class="cx-axis" x1="${mL}" x2="${W-mR}" y1="${base}" y2="${base}"></line>`;
  for(let v=0;v<=maxD;v+=maxD/4)g+=`<text class="cx-tick" x="${X(v)}" y="${base+16}" text-anchor="${v===0?'start':v===maxD?'end':'middle'}">${Math.round(v)} days</text>`;
  g+=`<line class="cx-deadline" x1="${X(deadline)}" x2="${X(deadline)}" y1="8" y2="${base+2}"></line><text class="cx-tick" x="${X(deadline)+4}" y="16">${deadline}-day deadline</text>`;
  const lanes={};
  for(const r of pts){const d=r.missing?maxD:r.days,k=Math.round(X(d)/9);lanes[k]=(lanes[k]||0)+1;
    g+=`<circle class="cx-dot ${r.late?'late':'ontime'}" cx="${X(d).toFixed(1)}" cy="${base-8-(lanes[k]-1)*9}" r="4" data-tip="${esc(`${r.company||r.asset||r.ticker||'Trade'} · traded ${when(r.traded)} · ${r.missing?'never disclosed':`disclosed after ${r.days} days`}${r.late?' (late)':''}`)}"></circle>`;}
  g+=`<text class="cx-cap" x="${mL}" y="${H-4}">Days from trade to disclosure</text>`;
  el.innerHTML=svgOpen(W,H,`Filing delay for ${pts.length} trades; ${pts.filter(r=>r.late).length} after the ${deadline}-day deadline`)+g+'</svg>';
  hoverTips(el);
}

// Trades and votes on one time axis: buys above the line, sells below, related votes and hearings as ticks on the
// line; flagged trades carry a ring.
export function drawTradeTimeline(el,trades,events){
  if(!el)return;const W=Math.max(300,el.clientWidth),mL=10,mR=10,H=130,mid=62;
  const dates=[...trades.map(r=>r.traded),...events.map(e=>e.date)].filter(Boolean).map(t);
  if(!dates.length){el.innerHTML='';return;}
  const a=Math.min(...dates)-20*dayMs,b=Math.max(...dates)+20*dayMs,X=v=>mL+(v-a)/(b-a)*(W-mL-mR);
  let g=`<line class="cx-axis" x1="${mL}" x2="${W-mR}" y1="${mid}" y2="${mid}"></line><text class="cx-cap" x="${mL}" y="12">Buys</text><text class="cx-cap" x="${mL}" y="${H-24}">Sells</text>`;
  for(let y=new Date(a).getUTCFullYear();y<=new Date(b).getUTCFullYear();y++){const v=Date.UTC(y,0,1);if(v>a&&v<b){const near=X(v)>W-40;g+=`<line class="cx-grid" x1="${X(v)}" x2="${X(v)}" y1="18" y2="${H-30}"></line><text class="cx-tick" x="${X(v)+(near?-3:3)}" y="${H-8}" text-anchor="${near?'end':'start'}">${y}</text>`;}}
  for(const e of events)g+=`<rect class="cx-event" x="${X(t(e.date))-1.5}" y="${mid-9}" width="3" height="18" data-tip="${esc(`${when(e.date)} · ${e.label}`)}"></rect>`;
  const used={};
  for(const r of trades){const x=X(t(r.traded)),up=r.type!=='sale',k=`${up}${Math.round(x/10)}`;used[k]=(used[k]||0)+1;const y=up?mid-16-(used[k]-1)*11:mid+16+(used[k]-1)*11;
    g+=`<circle class="cx-dot ${up?'buy':'sell'}${r.flag?' flagged':''}" cx="${x.toFixed(1)}" cy="${y}" r="5.5" data-tip="${esc(`${when(r.traded)} · ${up?'Bought':'Sold'} ${r.company||r.asset||r.ticker||''} ${r.amount||''}${r.flag?` · Flagged: ${r.flag}`:''}`)}"></circle>`;}
  el.innerHTML=svgOpen(W,H,`${trades.length} trades and ${events.length} related votes or hearings on one timeline`)+g+'</svg>';
  hoverTips(el);
}

// Ethics cases on a year axis: each case a bar over the years it spans (a dot for a single date), colored by status.
export function drawCaseTimeline(el,cases,colors){
  if(!el)return;const W=Math.max(300,el.clientWidth),mL=10,mR=10,row=34,top=8;
  const ok=cases.filter(c=>c.from);if(!ok.length){el.innerHTML='';return;}
  const a=Math.min(...ok.map(c=>c.from))-.3,b=Math.max(...ok.map(c=>c.to||c.from))+1.3,X=v=>mL+(v-a)/(b-a)*(W-mL-mR);
  const H=top+ok.length*row+26;let g='';
  for(let y=Math.ceil(a);y<=Math.floor(b);y++)g+=`<line class="cx-grid" x1="${X(y)}" x2="${X(y)}" y1="${top}" y2="${H-22}"></line>${(y-Math.ceil(a))%(W<520?3:2)===0?`<text class="cx-tick" x="${X(y)}" y="${H-8}" text-anchor="middle">${y}</text>`:''}`;
  ok.forEach((c,i)=>{const y=top+i*row+row/2+6,x0=X(c.from),x1=X((c.to||c.from)+1)-2,col=colors[c.status]||'var(--cx-other)',max=Math.floor((W-mL-mR)/6.2);
    g+=`<text class="cx-lab" x="${x0<W/2?x0:Math.max(mL,x1)}" y="${y-9}" text-anchor="${x0<W/2?'start':'end'}">${esc(c.label.length>max?c.label.slice(0,max-1)+'…':c.label)}</text>`;
    g+=c.to&&c.to>c.from?`<rect x="${x0}" y="${y-5}" width="${Math.max(6,x1-x0)}" height="10" rx="4" style="fill:${col}" data-tip="${esc(`${c.label} · ${c.statusLabel} · ${c.when}`)}"></rect>`:`<circle cx="${x0+4}" cy="${y}" r="5" style="fill:${col}" data-tip="${esc(`${c.label} · ${c.statusLabel} · ${c.when}`)}"></circle>`;});
  el.innerHTML=svgOpen(W,H,`${ok.length} ethics entries on a timeline`)+g+'</svg>';
  hoverTips(el);
}

// Tree map: tile area is the amount; squarified so tiles stay close to square. Labels only where they fit.
function squarify(items,x,y,w,h){
  const out=[],total=items.reduce((t,i)=>t+i.value,0);if(!total)return out;
  const scale=w*h/total;let rest=items.map(i=>({...i,area:i.value*scale}));
  while(rest.length){
    const short=Math.min(w,h);let row=[rest[0]],worst=Infinity;
    for(let k=1;k<=rest.length;k++){const r=rest.slice(0,k),s=r.reduce((t,i)=>t+i.area,0),mx=Math.max(...r.map(i=>i.area)),mn=Math.min(...r.map(i=>i.area));
      const wv=Math.max(short*short*mx/(s*s),s*s/(short*short*mn));if(wv<=worst){worst=wv;row=r;}else break;}
    const s=row.reduce((t,i)=>t+i.area,0);
    if(w>=h){const cw=s/h;let yy=y;for(const i of row){const ch=i.area/cw;out.push({...i,x,y:yy,w:cw,h:ch});yy+=ch;}x+=cw;w-=cw;}
    else{const ch=s/w;let xx=x;for(const i of row){const cw=i.area/ch;out.push({...i,x:xx,y,w:cw,h:ch});xx+=cw;}y+=ch;h-=ch;}
    rest=rest.slice(row.length);
  }
  return out;
}
export function drawTreemap(el,tiles){
  if(!el)return;const W=Math.max(300,el.clientWidth),H=Math.round(Math.min(420,Math.max(240,W*.5)));
  const laid=squarify(tiles.filter(x=>x.value>0).sort((a,b)=>b.value-a.value),0,0,W,H);
  el.style.height=H+'px';
  el.innerHTML=`<div class="cx-tm" style="width:${W}px;height:${H}px">${laid.map(r=>{const fits=r.w>86&&r.h>40;
    return `<div class="cx-tile ${r.align}" style="left:${r.x+1}px;top:${r.y+1}px;width:${Math.max(0,r.w-2)}px;height:${Math.max(0,r.h-2)}px;background:${ALIGN_COLOR[r.align]}" data-tip="${esc(`${r.label}: ${money(r.value)} · ${r.alignLabel}${r.catLabel?` · ${r.catLabel}`:''}${r.about?`. ${r.about}`:''}`)}">${fits?`<span>${esc(r.label)}</span><b>${money(r.value)}</b>`:''}</div>`;}).join('')}</div>`;
  hoverTips(el);
}

// Small multiples: one row per donor, monthly amounts as a 2px line with a 10% wash, on a shared month axis and each
// row's own scale (labelled), with decision markers and flagged windows.
export function drawMonthly(el,rows,months,markers){
  if(!el)return;const W=Math.max(300,el.clientWidth),mL=Math.min(190,Math.round(W*.32)),mR=58,rowH=44,top=6;
  const n=months.length,X=i=>mL+(n<2?0:i/(n-1)*(W-mL-mR)),xm=m=>{const i=months.indexOf(m.slice(0,7));return i<0?null:X(i);};
  const H=top+rows.length*rowH+30;let g='';
  months.forEach((m,i)=>{if(m.endsWith('-01')||i===0)g+=`<line class="cx-grid" x1="${X(i)}" x2="${X(i)}" y1="${top}" y2="${H-26}"></line><text class="cx-tick" x="${X(i)}" y="${H-10}" text-anchor="${i===0?'start':'middle'}">${m.endsWith('-01')?m.slice(0,4):MON[+m.slice(5,7)-1]+' '+m.slice(2,4)}</text>`;});
  rows.forEach((r,k)=>{
    const y0=top+k*rowH,base=y0+rowH-10,max=Math.max(1,...months.map(m=>r.series[m]||0)),Y=v=>base-v/max*(rowH-18);
    for(const f of r.flags||[]){const a=xm(f.from)??X(0),b=xm(f.to)??X(n-1);g+=`<rect class="cx-flagwin" x="${a}" y="${y0+2}" width="${Math.max(3,b-a)}" height="${rowH-10}" data-tip="${esc(f.tip)}"></rect>`;}
    const d=months.map((m,i)=>`${i?'L':'M'}${X(i).toFixed(1)} ${Y(r.series[m]||0).toFixed(1)}`).join('');
    g+=`<path class="cx-wash" d="${d}L${X(n-1)} ${base}L${X(0)} ${base}Z"></path><path class="cx-line" d="${d}"></path><line class="cx-axis" x1="${mL}" x2="${W-mR}" y1="${base}" y2="${base}"></line>`;
    g+=`<text class="cx-lab" x="${mL-8}" y="${y0+rowH/2}" text-anchor="end">${esc(r.label.length>28?r.label.slice(0,27)+'…':r.label)}</text><text class="cx-tick" x="${W-mR+6}" y="${y0+14}">${money(max)}</text>`;
    // Each month's hover area, kept inside the plot so the first and last months don't spill past the edges.
    const half=Math.max(3,(W-mL-mR)/n/2);
    months.forEach((m,i)=>{const v=r.series[m]||0,a=Math.max(mL-3,X(i)-half),b=Math.min(W-mR+3,X(i)+half);g+=`<rect class="cx-hit" x="${a}" y="${y0}" width="${Math.max(6,b-a)}" height="${rowH-8}" data-tip="${esc(`${r.label} · ${MON[+m.slice(5,7)-1]} ${m.slice(0,4)}: ${money(v)}`)}"></rect>`;});
    // Votes are triangles under the row; trades in the donor's company are diamonds at the top.
    for(const mk of r.markers||[]){const x=xm(mk.date);if(x==null)continue;g+=`<path class="cx-mark ${mk.kind}" d="${mk.kind==='trade'?`M${x} ${y0+1}l4.5 4.5l-4.5 4.5l-4.5-4.5z`:`M${x} ${base+1}l-4 6h8z`}" data-tip="${esc(`${when(mk.date)} · ${mk.label}`)}"></path>`;}
  });
  for(const mk of markers||[]){const x=xm(mk.date);if(x==null)continue;g+=`<line class="cx-vline ${mk.kind}" x1="${x}" x2="${x}" y1="${top}" y2="${H-26}" data-tip="${esc(`${when(mk.date)} · ${mk.label}`)}"></line>`;}
  el.innerHTML=svgOpen(W,H,`Monthly money from ${rows.length} donors`)+g+'</svg>';
  hoverTips(el);
}

// Outside spending for and against, each bar split into sectors and colored by alignment.
export function sectorSpendBars(by,label,{fw='For',aw='Against'}={}){
  const tot=s=>s.reduce((t,x)=>t+x.amount,0),F=tot(by.for),A=tot(by.against),max=Math.max(F,A,1);
  const bar=(side,name,total)=>`<div class="cx-row"><div class="cx-who">${esc(name)}<small>${money(total)}</small></div><div class="cx-track"><div class="cx-stack" style="width:${total/max*100}%">${side.map(x=>`<i style="flex:${x.amount};background:${ALIGN_COLOR[x.align]}" data-tip="${esc(`${name}: ${label(x.cat)} ${money(x.amount)}`)}"></i>`).join('')}</div></div><div class="cx-val"></div></div>`;
  return `<div class="cx-rows cx-sector">${bar(by.for,fw,F)}${bar(by.against,aw,A)}</div>`;
}
