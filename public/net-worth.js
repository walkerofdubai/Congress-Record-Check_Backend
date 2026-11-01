// A net-worth range from a member's latest annual financial disclosure: what they and their spouse and dependent
// children own (assets) minus what they owe (liabilities). The forms give each value as a range, so the result is a
// range: lowest = every asset at the bottom of its range minus every debt at the top of its; highest = the reverse.
// Their home and a mortgage on it aren't on the form unless the home earns income, so neither is counted. Built by the
// refresh ('net-worth' in src/feeds.mjs) and drawn on the pages; shown only, no grade uses it.

// A value as written on the form -> [low, high] (high null when the range is open-ended), or null when it can't be read
// ("Undetermined", "Unascertainable", a blank).
export function valueRange(text){
  const t=String(text||'').replace(/\s+/g,' ').trim();
  if(!t)return null;
  if(/^none\b/i.test(t)||/less than \$1,001/i.test(t))return [0,1000];
  const over=t.match(/over\s+\$([\d,]+)/i);
  if(over)return [Number(over[1].replace(/,/g,''))+1,null];
  const r=t.replace(/,/g,'').match(/\$?(\d+)\s*-\s*\$?(\d+)/);
  return r?[Number(r[1]),Number(r[2])]:null;
}
const sum=(list,i)=>list.reduce((t,x)=>t==null||x[i]==null?null:t+x[i],0);
// assets, debts: [{value}] and [{amount}] as written. Returns the range and its parts; high is null when an asset has no
// upper limit ("Over $50,000,000", "Spouse/DC Over $1,000,000"), and low is null when a debt has none.
export function netWorth(assets=[],debts=[]){
  const a=assets.map(x=>valueRange(x.value)).filter(Boolean),d=debts.map(x=>valueRange(x.amount)).filter(Boolean);
  const aLow=sum(a,0),aHigh=sum(a,1),dLow=sum(d,0),dHigh=sum(d,1);
  return {low:dHigh==null?null:aLow-dHigh,high:aHigh==null?null:aHigh-dLow,assetsLow:aLow,assetsHigh:aHigh,debtsLow:dLow,debtsHigh:dHigh,
    nAssets:a.length,nDebts:d.length,unread:assets.length-a.length+debts.length-d.length};
}
// "$1.2M" style money for the range ends, with "or more" / "or less" for an open end.
export function rangeText(x,money){
  if(!x)return '';
  if(x.low==null&&x.high==null)return 'Can\'t be bounded from the form';
  if(x.high==null)return `${money(x.low)} or more`;
  if(x.low==null)return `${money(x.high)} or less`;
  return `${money(x.low)} – ${money(x.high)}`;
}
