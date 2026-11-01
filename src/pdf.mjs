// Plain text from a PDF, for the trade reports members file electronically with the House Clerk. It needs no library:
// it opens every stream (inflating FlateDecode, and unpacking object streams), maps each font's character codes
// through the font's ToUnicode table when it has one, and writes text in the order it is drawn, starting a new line when
// the text moves down the page. A scanned (paper) filing has no text and gives ''.
const latin1=b=>new TextDecoder('latin1').decode(b);

async function inflate(bytes){
  try{return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate'))).arrayBuffer());}
  catch{return null;}
}
// Every indirect object: its number, its dictionary text, and its stream's bytes (inflated when FlateDecode).
async function readObjects(bytes){
  const raw=latin1(bytes),objects=new Map();
  for(const m of raw.matchAll(/(\d+)\s+\d+\s+obj\b/g)){
    const start=m.index+m[0].length,end=raw.indexOf('endobj',start);if(end<0)continue;
    let body=raw.slice(start,end),stream=null;
    const s=body.search(/\bstream\r?\n/);
    if(s>=0){
      const from=start+s+body.slice(s).match(/^stream\r?\n/)[0].length,to=raw.lastIndexOf('endstream',end);
      if(to>from){
        const data=bytes.subarray(from,to).subarray(0,Math.max(0,to-from)).slice();
        stream=/\/FlateDecode/.test(body.slice(0,s))?await inflate(trimEol(data)):/\/Filter/.test(body.slice(0,s))?null:data;
      }
      body=body.slice(0,s);
    }
    objects.set(Number(m[1]),{dict:body,stream});
  }
  // Object streams pack several objects (often the fonts) into one compressed stream.
  for(const o of [...objects.values()]){
    if(!/\/Type\s*\/ObjStm/.test(o.dict)||!o.stream)continue;
    const n=Number(o.dict.match(/\/N\s+(\d+)/)?.[1]),first=Number(o.dict.match(/\/First\s+(\d+)/)?.[1]),text=latin1(o.stream);
    const head=text.slice(0,first).trim().split(/\s+/).map(Number);
    for(let i=0;i<n;i++){
      const num=head[2*i],off=head[2*i+1],next=i+1<n?head[2*i+3]:text.length-first;
      if(Number.isFinite(num)&&!objects.has(num))objects.set(num,{dict:text.slice(first+off,first+next),stream:null});
    }
  }
  return objects;
}
const trimEol=b=>{let n=b.length;while(n&&(b[n-1]===10||b[n-1]===13))n--;return b.subarray(0,n);};

// A ToUnicode table: character code (as hex) -> text, and how many bytes a code takes.
function cmap(text){
  const map=new Map(),hex=h=>h.replace(/\s/g,'').toUpperCase();
  const uni=h=>{let s='';for(let i=0;i+4<=h.length;i+=4)s+=String.fromCharCode(parseInt(h.slice(i,i+4),16));return s;};
  const width=(text.match(/begincodespacerange\s*<([0-9a-fA-F]+)>/)?.[1]||'00').length/2;
  for(const block of text.matchAll(/beginbfchar([\s\S]*?)endbfchar/g))
    for(const m of block[1].matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>/g))map.set(hex(m[1]),uni(hex(m[2])));
  for(const block of text.matchAll(/beginbfrange([\s\S]*?)endbfrange/g))
    for(const m of block[1].matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>\s*(<([0-9a-fA-F]+)>|\[([^\]]*)\])/g)){
      const lo=parseInt(m[1],16),hi=parseInt(m[2],16),w=m[1].length;
      const list=m[5]?[...m[5].matchAll(/<([0-9a-fA-F]+)>/g)].map(x=>uni(hex(x[1]))):null;
      for(let c=lo;c<=hi&&c-lo<5000;c++){
        const key=c.toString(16).toUpperCase().padStart(w,'0');
        if(list){if(list[c-lo]!=null)map.set(key,list[c-lo]);}
        else{const base=hex(m[4]),last=parseInt(base.slice(-4),16)+(c-lo);map.set(key,uni(base.slice(0,-4)+last.toString(16).padStart(4,'0')));}
      }
    }
  return {map,width:Math.max(1,width)};
}

// The content stream's tokens: strings (as bytes), names, numbers, arrays and operators.
function tokens(text){
  const out=[];let i=0;const n=text.length;
  while(i<n){
    const c=text[i];
    if(/\s/.test(c)){i++;continue;}
    if(c==='%'){while(i<n&&text[i]!=='\n'&&text[i]!=='\r')i++;continue;}
    if(c==='('){
      let depth=1,s='';i++;
      while(i<n&&depth){
        const ch=text[i++];
        if(ch==='\\'){
          const e=text[i++];
          if(/[0-7]/.test(e)){let o=e;while(o.length<3&&/[0-7]/.test(text[i]))o+=text[i++];s+=String.fromCharCode(parseInt(o,8));}
          else s+={n:'\n',r:'\r',t:'\t',b:'\b',f:'\f'}[e]??(e==='\r'||e==='\n'?'':e);
        }
        else if(ch==='('){depth++;s+=ch;}
        else if(ch===')'){if(--depth)s+=ch;}
        else s+=ch;
      }
      out.push({str:s});continue;
    }
    if(c==='<'&&text[i+1]!=='<'){
      const e=text.indexOf('>',i);let h=text.slice(i+1,e).replace(/\s/g,'');if(h.length%2)h+='0';
      let s='';for(let k=0;k<h.length;k+=2)s+=String.fromCharCode(parseInt(h.slice(k,k+2),16));
      out.push({str:s});i=e+1;continue;
    }
    if(c==='['||c===']'){out.push({op:c});i++;continue;}
    if(c==='<'||c==='>'){out.push({op:c+c});i+=2;continue;}
    let j=i+1;while(j<n&&!/[\s()<>\[\]/%]/.test(text[j]))j++;
    const w=text.slice(i,j);
    if(c==='/')out.push({name:w.slice(1)});
    else if(/^[+-]?(\d+\.?\d*|\.\d+)$/.test(w))out.push({num:Number(w)});
    else out.push({op:w});
    i=j;
  }
  return out;
}

// Windows-1252 characters a simple font may use in the 0x80-0x9F range.
const WIN={0x91:'‘',0x92:'’',0x93:'“',0x94:'”',0x96:'–',0x97:'—',0x95:'•',0x85:'…'};
function decode(bytes,font){
  if(!font)return [...bytes].map(ch=>WIN[ch.charCodeAt(0)]||ch).join('');
  let s='';
  for(let i=0;i<bytes.length;i+=font.width){
    const code=[...bytes.slice(i,i+font.width)].map(ch=>ch.charCodeAt(0).toString(16).toUpperCase().padStart(2,'0')).join('');
    s+=font.map.get(code)??(font.width===1?bytes[i]:'');
  }
  return s;
}

export async function pdfText(bytes){
  if(!(bytes instanceof Uint8Array)||latin1(bytes.subarray(0,5))!=='%PDF-')return '';
  const objects=await readObjects(bytes);
  // Font resource names (/F1) -> the font's ToUnicode table, when it has one.
  const ref=v=>{const m=String(v||'').match(/^\s*(\d+)\s+\d+\s+R/);return m?objects.get(Number(m[1])):null;};
  const unicodeOf=new Map();
  for(const [num,o] of objects){
    const t=o.dict.match(/\/ToUnicode\s+(\d+)\s+\d+\s+R/);
    if(/\/Type\s*\/Font\b/.test(o.dict)&&t){const c=objects.get(Number(t[1]));if(c?.stream)unicodeOf.set(num,cmap(latin1(c.stream)));}
  }
  const fonts=new Map();
  for(const o of objects.values()){
    for(const m of o.dict.matchAll(/\/Font\s*(<<([\s\S]*?)>>|(\d+\s+\d+\s+R))/g)){
      const body=m[2]??ref(m[3])?.dict??'';
      for(const f of body.matchAll(/\/([^\s/<>\[\]()]+)\s+(\d+)\s+\d+\s+R/g))if(!fonts.has(f[1])&&unicodeOf.has(Number(f[2])))fonts.set(f[1],unicodeOf.get(Number(f[2])));
    }
  }
  const lines=[];
  for(const o of objects.values()){
    if(!o.stream||/\/Type\s*\/(ObjStm|XRef|XObject)/.test(o.dict)||/\/Subtype\s*\/Image/.test(o.dict))continue;
    const text=latin1(o.stream);if(!/\bBT\b/.test(text)||!/T[jJ]|['"]/.test(text))continue;
    let line='',font=null,y=null,stack=[],arr=null;
    const newline=()=>{if(line.trim())lines.push(line.replace(/\s+/g,' ').trim());line='';};
    for(const t of tokens(text)){
      if(t.op==='['){arr=[];continue;}
      if(t.op===']'){stack.push({arr});arr=null;continue;}
      if(arr){arr.push(t);continue;}
      if(!t.op){stack.push(t);continue;}
      const args=stack;stack=[];
      switch(t.op){
        case 'Tf':font=fonts.get(args[0]?.name)||null;break;
        case 'Tj':line+=decode(args.at(-1)?.str||'',font);break;
        case "'":case '"':newline();line+=decode(args.at(-1)?.str||'',font);break;
        case 'TJ':for(const x of args.at(-1)?.arr||[]){if(x.str!=null)line+=decode(x.str,font);else if(x.num<-200)line+=' ';}break;
        case 'Td':case 'TD':if(Math.abs(args[1]?.num||0)>0.5)newline();else if((args[0]?.num||0)>0)line+=' ';break;
        case 'T*':newline();break;
        case 'Tm':{const ny=args[5]?.num;if(y!=null&&ny!=null&&Math.abs(ny-y)>0.5)newline();else if(line)line+=' ';y=ny;break;}
        case 'ET':line+=' ';break;
      }
    }
    newline();
  }
  return lines.join('\n');
}
