// Industry sectors for stock trades and committee oversight (placeholder until reviewed). A company's sector comes from
// its Standard Industrial Classification (SIC) code in SEC EDGAR. Ranges are checked in order and the first match wins,
// so narrower ranges (health insurers, REITs, pipelines) sit before the wider ones they fall inside.
export const SECTORS=[
  {id:'Health & Pharma',sic:[[2830,2836],[3840,3851],[5047,5047],[5122,5122],[6324,6324],[8000,8099]]},
  {id:'Real Estate & Construction',sic:[[1500,1799],[6500,6599],[6798,6798]]},
  {id:'Energy',sic:[[1200,1399],[2900,2999],[4610,4619],[4920,4925],[5170,5172]]},
  {id:'Utilities',sic:[[4900,4919],[4926,4999]]},
  {id:'Defense & Aerospace',sic:[[3480,3489],[3720,3729],[3760,3769],[3795,3795],[3812,3812]]},
  {id:'Agriculture & Food',sic:[[100,999],[2000,2099],[5140,5159]]},
  {id:'Mining & Materials',sic:[[1000,1099],[1400,1499],[2600,2699],[2800,2829],[2840,2899],[3200,3399]]},
  {id:'Technology',sic:[[3570,3579],[3660,3699],[3820,3829],[7370,7379]]},
  {id:'Telecom & Media',sic:[[2710,2799],[4800,4899],[7810,7819]]},
  {id:'Transportation',sic:[[3710,3716],[3740,3743],[4000,4609],[4620,4799]]},
  {id:'Finance & Insurance',sic:[[6000,6499],[6700,6799]]},
  {id:'Retail & Consumer',sic:[[2100,2399],[2510,2599],[3140,3199],[3630,3639],[3940,3949],[5200,5999],[7000,7099],[7900,7999]]},
];
export const OTHER_SECTOR='Other';
export function sectorForSic(sic){
  const n=Number(sic);if(!Number.isInteger(n)||n<=0)return null;
  for(const s of SECTORS)if(s.sic.some(([a,b])=>n>=a&&n<=b))return s.id;
  return OTHER_SECTOR;
}
