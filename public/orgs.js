// One-line descriptions of the organizations named on profiles (PACs, outside spenders, the groups whose public positions
// are collected, and donors' employers), shown when a name is hovered, tapped or focused. In order of preference: a
// hand-written description for the researched groups and a few well-known committees; the researched note an outside
// spender already carries; otherwise a description built from what the app knows about the committee (its type, the
// sector this app assigned from its name, and its stated orientation). Nothing here is used in a grade.
import {categoryAlign,spenderSector,ALIGN_LABEL,SECTOR_LABEL_EXTRA} from './influence.js';
import {pacTypeOf} from './pac-types.js';

// The groups whose scorecards and key-vote letters are collected (research.json groupPos), by key.
export const GROUP_ABOUT={
  aflcio:'Federation of U.S. labor unions; its political program backs candidates it sees as pro-worker.',
  afp:'Conservative, libertarian-leaning advocacy network founded with support from Charles and David Koch; backs lower taxes and less regulation.',
  afscme:'Labor union of state, county and city government workers and health-care workers.',
  ara:'Advocacy group for retirees, founded by labor unions, focused on Social Security and Medicare.',
  cfg:'Conservative group that backs lower taxes, less federal spending and free-market candidates, often in Republican primaries.',
  chamber:'The largest U.S. business lobbying group, representing companies and trade associations.',
  giffords:'Gun-safety advocacy group founded by former Rep. Gabby Giffords.',
  hrc:'The largest U.S. LGBTQ+ civil-rights advocacy group.',
  lcv:'Environmental advocacy group that scores lawmakers on environmental votes.',
  nfib:'Small-business advocacy group; generally favors lower taxes and less regulation.',
  nra:'Gun-rights advocacy group and lobby.',
  nrlc:'National anti-abortion advocacy group.',
  ppaf:'Political advocacy arm of Planned Parenthood, the reproductive-health provider; supports abortion rights.',
  rffa:'Abortion-rights advocacy group, known until 2023 as NARAL Pro-Choice America.',
  scf:'Conservative PAC founded by former Sen. Jim DeMint that backs hard-line conservatives in Senate races, including primaries.',
  seiu:'Labor union of service workers, including health-care, building-service and public-sector workers.',
  heritage:'Conservative advocacy group, the Heritage Foundation\'s lobbying arm. It scores members of Congress on its key votes; it spends in elections through the Sentinel Action Fund, a super PAC.',
  fairshake:'Network of super PACs (Fairshake, Defend American Jobs, Protect Progress) funded largely by cryptocurrency companies; backs crypto-friendly candidates of both parties.',
  edf:'Environmental advocacy group; EDF Action Votes is its super PAC.',
  nrdc:'Environmental advocacy group; NRDC Action Votes is its super PAC.',
  cffe:'Hybrid PAC that backs Democrats on child care, health care and paid family leave, funded in part by labor unions including SEIU and the NEA.',
  emily:'Group that backs Democratic women candidates who support abortion rights; Women Vote! is its super PAC.',
  acu:'Trade association of U.S. credit unions, formed in 2024 when CUNA and NAFCU merged.',
  aipac:'Pro-Israel lobbying group; its PAC started giving directly to candidates in 2022, and United Democracy Project is its super PAC.',
  aha:'Trade association of U.S. hospitals and health systems.',
  ama:'The largest U.S. association of physicians.',
  aba:'Trade association of U.S. banks, mostly larger ones.',
  mba:'Trade association of mortgage lenders and real-estate finance companies.',
  icba:'Trade association of community banks.',
  nar:'Trade association of real-estate agents and brokers, one of the largest PAC givers in politics.',
  aft:'Labor union of teachers, school staff, college faculty and health-care and public workers.',
  nea:'The largest U.S. labor union, of public-school teachers and education workers.',
  phrma:'Trade association of brand-name drug companies.',
  sba:'National anti-abortion group (formerly the Susan B. Anthony List) that backs anti-abortion candidates.',
  everytown:'Gun-safety advocacy group, the umbrella for Moms Demand Action and Students Demand Action.',
  jstreet:'Liberal pro-Israel advocacy group that backs a two-state solution; its PAC, JStreetPAC, bundles supporters\' donations to candidates.',
};
// Well-known committees by name (compared without case or punctuation).
const NAMED_ABOUT={
  'maga inc':'Super PAC that supports Donald Trump and candidates he backs.',
  'fairshake':'Super PAC funded largely by cryptocurrency companies; backs crypto-friendly candidates of both parties.',
  'defend american jobs':'Super PAC in the cryptocurrency industry\'s Fairshake network; backs crypto-friendly Republicans.',
  'protect progress':'Super PAC in the cryptocurrency industry\'s Fairshake network; backs crypto-friendly Democrats.',
  'nrsc':'National Republican Senatorial Committee: the Republican Party\'s committee for Senate races.',
  'dscc':'Democratic Senatorial Campaign Committee: the Democratic Party\'s committee for Senate races.',
  'nrcc':'National Republican Congressional Committee: the Republican Party\'s committee for House races.',
  'dccc':'Democratic Congressional Campaign Committee: the Democratic Party\'s committee for House races.',
  'nrdc action votes':'Super PAC of the political arm of the Natural Resources Defense Council, an environmental group.',
  'giffords pac':'Political committee of Giffords, the gun-safety group founded by former Rep. Gabby Giffords.',
  'afscme working families fund':'Political fund of AFSCME, the union of state, county and city government workers.',
  'americas credit unions':'Trade association of U.S. credit unions.',
  'end citizens united action fund':'Super PAC of End Citizens United, a group that campaigns to limit money in politics.',
  'aipac pac':'PAC of AIPAC, the pro-Israel lobbying group, which started giving directly to candidates in 2022.',
  'actblue':'Online fundraising platform that processes donations for Democratic candidates and groups.',
  'winred':'Online fundraising platform that processes donations for Republican candidates and groups.',
};
export const EMPLOYER_ABOUT='Named as their employer by individual donors. These are the employees\' own contributions, grouped by employer, plus its PAC\'s if it has one; a company cannot give to a federal campaign directly.';
export const SMALL_DOLLAR_ABOUT='People who gave $200 or less in total. The FEC does not list them by name, so they appear as one total.';
const SPENDER_KIND={
  super_pac:'Super PAC: can raise and spend unlimited sums, but may not coordinate with campaigns.',
  other:'Outside group other than a super PAC (such as a nonprofit, union or trade group) reporting its own spending to the FEC.',
  party:'Party committee, spending on its own rather than through the campaign.',
};
const PAC_KIND={
  lead:'Leadership PAC or politician-affiliated committee: run by an elected official, often to give to other candidates.',
  labor:'PAC of a labor union or employee association.',
  biz:'PAC of a business association that spans several industries.',
  ideo:'Ideological, single-issue or advocacy PAC.',
  tribal:'PAC of a tribal government or Alaska Native corporation.',
  other:'PAC whose name does not say who sponsors it; many are lawmakers\' leadership PACs.',
};
const norm=v=>String(v||'').toLowerCase().replace(/&/g,' and ').replace(/[^a-z0-9 ]/g,'').replace(/\s+/g,' ').trim();
const alignNote=cat=>{const a=categoryAlign(cat);return a==='other'?'':` Counted as ${ALIGN_LABEL[a]} in this app's charts.`;};

export function makeOrgs(data){
  const label=c=>(data.categories||{})[c]||SECTOR_LABEL_EXTRA[c]||c;
  // A PAC's sector is the same on every profile, so the first one seen is kept.
  const pacCat=new Map();
  for(const s of [...(data.members||[]),...(data.cands||[]),...(data.featured||[])])for(const [ni,,cat] of s.pac?.rows||[])if(!pacCat.has(ni))pacCat.set(ni,cat);
  const pacByName=new Map((data.pacNames||[]).map((n,i)=>[norm(n),i]));
  const cmByName=new Map((data.ie?.cm||[]).map(c=>[norm(c[1]),c]));
  const groupByName=new Map();
  for(const g of data.groupPos||[])for(const n of [g.org,...(g.committees||[])])groupByName.set(norm(n),g.key);

  function pac(i){
    const name=(data.pacNames||[])[i],cat=pacCat.get(i),orient=(data.pacOrient||{})[i];
    const named=NAMED_ABOUT[norm(name)]||GROUP_ABOUT[groupByName.get(norm(name))];
    const kind=named||PAC_KIND[cat]||(cat?`PAC of a company or a trade or professional group in ${label(cat).toLowerCase()} (sector assigned by this app from its name).`:'Political action committee.');
    const t=pacTypeOf(data,i);
    return `${kind}${orient?` Orientation: ${orient}.`:''}${named?'':alignNote(cat)}${t?` FEC type: ${t.label}${t.lobbyist?', also registered as a lobbyist PAC':''}.`:''}`;
  }
  function spender(c){
    const [,name,cls,note]=c,named=NAMED_ABOUT[norm(name)]||GROUP_ABOUT[groupByName.get(norm(name))];
    const cat=spenderSector(name,cls),sector=cat!=='ideo'&&cat!=='party'?` Sector (assigned by this app from its name): ${label(cat)}.${alignNote(cat)}`:'';
    const lead=note||named;
    return [lead&&!/[.!?]["')\]]?$/.test(lead)?lead+'.':lead,SPENDER_KIND[cls]].filter(Boolean).join(' ')+sector;
  }
  // kind narrows the lookup when the caller knows what the name is: 'pac', 'spender', 'employer' or 'group'.
  function about(name,kind){
    if(kind==='employer')return EMPLOYER_ABOUT;
    if(kind==='small')return SMALL_DOLLAR_ABOUT;
    const k=norm(name),g=groupByName.get(k);
    if(g&&(kind==='group'||!kind))return GROUP_ABOUT[g];
    if(kind!=='pac'&&cmByName.has(k))return spender(cmByName.get(k));
    if(kind!=='spender'&&pacByName.has(k))return pac(pacByName.get(k));
    return NAMED_ABOUT[k]||(g?GROUP_ABOUT[g]:null);
  }
  return {about,pac,spender,group:key=>GROUP_ABOUT[key]||null};
}
