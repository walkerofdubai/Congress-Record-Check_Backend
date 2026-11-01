// Each PAC's type as the FEC records it, from the committee's own registration (FEC committee type, designation and
// sponsoring organization's type), shown next to the sector this app assigns from the name. Saved by
// scripts/build-pac-types.mjs in public/research.json: pacIds (parallel to pacNames: each name's FEC committee ID, or
// null) and pacCommittees ({id: [name, committee type, designation, organization type]}). Shown only; no grade uses it
// yet (the planned Corporation Compromised Index would use the corporate share).

// The kinds, in the order they're listed. about: what the FEC codes behind it mean.
export const PAC_KINDS={
  corporate:{label:'Corporate PAC',about:'Sponsored by a corporation (FEC organization type: corporation, or corporation without capital stock).'},
  trade:{label:'Trade association PAC',about:'Sponsored by a trade association (FEC organization type: trade association).'},
  membership:{label:'Membership group PAC',about:'Sponsored by a membership organization, such as a professional or advocacy association (FEC organization type: membership organization).'},
  cooperative:{label:'Cooperative PAC',about:'Sponsored by a cooperative (FEC organization type: cooperative).'},
  labor:{label:'Labor union PAC',about:'Sponsored by a labor union (FEC organization type: labor organization).'},
  lobbyist:{label:'Lobbyist PAC',about:'Registered with the FEC as a lobbyist or lobbying firm\'s PAC, with no sponsoring company, union or association.'},
  leadership:{label:'Leadership PAC',about:'A PAC run by a member of Congress or other politician to give to other candidates (FEC designation: leadership PAC).'},
  unconnected:{label:'Nonconnected PAC',about:'A PAC with no sponsoring organization, usually ideological or single-issue (FEC: nonconnected committee).'},
  candidate:{label:'Candidate committee',about:'Another candidate\'s own campaign committee (FEC committee type: House, Senate or presidential campaign).'},
  party:{label:'Party committee',about:'A political party committee (FEC committee type: party).'},
  joint:{label:'Joint fundraising committee',about:'A committee that raises money for several candidates or committees and splits it (FEC designation: joint fundraiser).'},
  other:{label:'Other committee',about:'A committee type the FEC lists that fits none of the kinds above.'}};

// The kind for an FEC committee record [name, committee type, designation, organization type]. The sponsor's type
// decides first (a corporation's PAC stays corporate even when it is also registered as a lobbyist PAC); then the
// designation; then the committee type.
export function pacKind(c){
  if(!c)return null;
  const [,type,dsgn,org]=c.map(v=>String(v||'').toUpperCase());
  if(dsgn==='D')return 'leadership';
  if(['X','Y','Z'].includes(type))return 'party';
  if(['H','S','P'].includes(type)||dsgn==='P'||dsgn==='A')return 'candidate';
  if(dsgn==='J')return 'joint';
  if(org==='C'||org==='W')return 'corporate';
  if(org==='T')return 'trade';
  if(org==='M')return 'membership';
  if(org==='V')return 'cooperative';
  if(org==='L')return 'labor';
  if(dsgn==='B')return 'lobbyist';
  if(['N','Q','O','U','V','W'].includes(type))return 'unconnected';
  return 'other';
}

// One PAC name's FEC record and kind (by its index in pacNames), or null when it hasn't been looked up or matched.
export function pacTypeOf(data,i){
  const id=(data.pacIds||[])[i],c=id&&(data.pacCommittees||{})[id];
  if(!c)return null;
  const kind=pacKind(c);
  return {id,name:c[0],kind,label:PAC_KINDS[kind].label,about:PAC_KINDS[kind].about,lobbyist:String(c[2]||'').toUpperCase()==='B'&&kind!=='lobbyist'};
}

// A person's itemized PAC money by kind, largest first, with what couldn't be matched kept apart.
export function pacKindTotals(data,rows){
  const by=new Map();
  for(const [i,amt] of rows||[]){const t=pacTypeOf(data,i),k=t?t.kind:'unknown',o=by.get(k)||{kind:k,total:0,n:0};o.total+=amt||0;o.n++;by.set(k,o);}
  const order=Object.keys(PAC_KINDS);
  return [...by.values()].map(o=>({...o,total:Math.round(o.total*100)/100,label:o.kind==='unknown'?'Not matched to an FEC committee':PAC_KINDS[o.kind].label}))
    .sort((a,b)=>(a.kind==='unknown')-(b.kind==='unknown')||b.total-a.total||order.indexOf(a.kind)-order.indexOf(b.kind));
}
