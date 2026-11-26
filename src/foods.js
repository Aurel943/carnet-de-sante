/* Arden : banque d'aliments et scan des codes-barres.
   - Recherche locale, sans réseau : favoris, produits déjà scannés (« mes produits ») et table Ciqual de
     l'ANSES (aliments génériques, valeurs pour 100 g), chargée seulement à l'ouverture de la recherche.
   - Scan : caméra de l'appareil, décodage du code-barres sur place (zxing-wasm, intégré à l'appli), puis
     recherche du produit sur Open Food Facts. Seul le numéro du code-barres est envoyé, et seulement au
     moment du scan ; le produit trouvé est ensuite gardé sur l'appareil. */
import {plain,num,has} from './utils.js';
import {BASICS} from './basics.js';

/* ---------- recherche ---------- */
let CIQ=null,ciqP=null;
/* Table Ciqual : [code, nom, kcal, protéines, glucides, lipides] pour 100 g (générée par npm run aliments) */
export function loadCiqual(){if(CIQ)return Promise.resolve(CIQ);
 return ciqP||(ciqP=import('./data/ciqual.json').then(m=>{const a=m.default||[];CIQ=a.map(r=>({id:'c'+r[0],n:r[1],k:r[2],p:r[3],g:r[4],l:r[5],src:'ciqual',w:plain(r[1]).split(/[^a-z0-9]+/).filter(Boolean)}));return CIQ}).catch(()=>{CIQ=[];return CIQ}))}
export const ciqualCount=()=>CIQ?CIQ.length:null;
const words=s=>plain(s).split(/[^a-z0-9]+/).filter(Boolean);
/* Aliments courants, embarqués : valeurs moyennes pour 100 g et une portion naturelle (« 1 pomme », 150 g) */
export const BASE=BASICS.map((r,i)=>({id:'b'+i,n:r[0],k:r[1],p:r[2],g:r[3],l:r[4],su:r[5],sv:r[6],src:'base',w:words(r[0]+' '+(r[7]||''))}));
/* Chaque mot tapé doit commencer un mot du nom (« riz cu » trouve « Riz blanc, cuit »). */
function score(q,w,name){let s=0;for(const t of q){const i=w.findIndex(x=>x.startsWith(t));if(i<0)return -1;s+=i===0?3:1;if(w[i]===t)s+=1}return s*100-name.length}
export function searchFoods(query,{prods=[],favs=[],recents=[]}={},limit=30){const q=words(query);if(!q.length)return[];
 const rank=(L,w)=>L.map(x=>({x,s:score(q,w(x),x.n)})).filter(r=>r.s>=0).sort((a,b)=>b.s-a.s).map(r=>r.x);
 const mine=rank([...recents.filter(r=>Array.isArray(r.c)).map(r=>({...r,src:'rec'})),...prods.map(p=>({...p,src:p.src==='mine'?'mine':'off'})),...favs.map((f,i)=>({...f,id:'f'+i,src:'fav'}))],x=>words(x.n+' '+(x.b||'')));
 const seen=new Set(),out=[];for(const x of [...mine.slice(0,6),...rank(BASE,x=>x.w).slice(0,10),...rank(CIQ||[],x=>x.w).slice(0,limit),...rank(recents.filter(r=>!Array.isArray(r.c)).map(r=>({...r,src:'rec'})),x=>words(x.n)).slice(0,4)]){const k=plain(x.n);if(seen.has(k))continue;seen.add(k);out.push(x)}
 return out.slice(0,limit)}
/* Valeurs pour une quantité donnée (en grammes) à partir des valeurs pour 100 g */
export function forGrams(f,q){const r=num(q)/100,k=Math.round(num(f.k)*r),o={k,p:Math.round(num(f.p)*r*10)/10,g:Math.round(num(f.g)*r*10)/10,l:Math.round(num(f.l)*r*10)/10};return o}

/* ---------- Open Food Facts ---------- */
const OFF='https://world.openfoodfacts.org/api/v2/product/';
export const validCode=c=>/^\d{8}$|^\d{12,14}$/.test(c);
/* Renvoie {found:true,prod} | {found:false} ; lève une erreur hors connexion */
export async function lookupOFF(code){const ctl=new AbortController(),t=setTimeout(()=>ctl.abort(),9000);
 try{const r=await fetch(`${OFF}${encodeURIComponent(code)}?fields=code,product_name,product_name_fr,generic_name_fr,brands,quantity,serving_quantity,nutriments&lc=fr`,{signal:ctl.signal,credentials:'omit',referrerPolicy:'no-referrer'});
  if(r.status===404)return{found:false};if(!r.ok)throw new Error('Open Food Facts ne répond pas ('+r.status+')');
  const d=await r.json();if(d.status!==1||!d.product)return{found:false};const p=d.product,n=p.nutriments||{};
  const kcal=has(n['energy-kcal_100g'])?num(n['energy-kcal_100g']):has(n.energy_100g)?num(n.energy_100g)/4.184:null;
  const name=(p.product_name_fr||p.product_name||p.generic_name_fr||'').trim();
  return{found:true,prod:{id:String(code),n:name,b:String(p.brands||'').split(',')[0].trim(),k:kcal==null?null:Math.round(kcal),p:r1(n.proteins_100g),g:r1(n.carbohydrates_100g),l:r1(n.fat_100g),sv:num(p.serving_quantity)||null,qt:p.quantity||''}}}
 finally{clearTimeout(t)}}
const r1=v=>has(v)?Math.round(num(v)*10)/10:null;

/* ---------- caméra et décodage ---------- */
let zx=null;
async function decoder(){
 /* détecteur natif du navigateur quand il existe (Chrome sur Android, par exemple) */
 if('BarcodeDetector' in window){try{const f=await window.BarcodeDetector.getSupportedFormats();if(f.includes('ean_13')){const d=new window.BarcodeDetector({formats:['ean_13','ean_8','upc_a','upc_e']});return async src=>{const r=await d.detect(src);return r[0]&&r[0].rawValue}}}catch(e){/* on passe à zxing */}}
 if(!zx){const [z,w]=await Promise.all([import('zxing-wasm/reader'),import('zxing-wasm/reader/zxing_reader.wasm?url')]);
  z.prepareZXingModule({overrides:{locateFile:(p,pre)=>p.endsWith('.wasm')?w.default:pre+p}});zx=z}
 const cv=document.createElement('canvas'),cx=cv.getContext('2d',{willReadFrequently:true});
 return async v=>{const W=v.videoWidth,H=v.videoHeight;if(!W||!H)return null;
  /* bande centrale, là où se trouve le cadre de visée, réduite pour aller vite */
  const sw=W,sh=Math.round(H*.5),sy=Math.round((H-sh)/2),k=Math.min(1,960/sw);cv.width=Math.round(sw*k);cv.height=Math.round(sh*k);
  cx.drawImage(v,0,sy,sw,sh,0,0,cv.width,cv.height);
  const r=await zx.readBarcodes(cx.getImageData(0,0,cv.width,cv.height),{formats:['EAN13','EAN8','UPCA','UPCE'],tryHarder:true,maxNumberOfSymbols:1});
  return r[0]&&r[0].isValid?r[0].text:null}}
/* Démarre la caméra arrière dans <video> et appelle onCode(code) au premier code lu. Renvoie stop(). */
export async function startScanner(video,onCode){
 if(!navigator.mediaDevices||!navigator.mediaDevices.getUserMedia)throw new Error('nocam');
 const stream=await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:{ideal:'environment'},width:{ideal:1920},height:{ideal:1080}}});
 video.srcObject=stream;video.setAttribute('playsinline','');video.muted=true;await video.play().catch(()=>{});
 const read=await decoder();let on=true,busy=false,last=0;
 const loop=async t=>{if(!on)return;if(!busy&&t-last>140){busy=true;last=t;try{const c=await read(video);if(c&&on&&validCode(c)){on=false;stop();onCode(c);return}}catch(e){/* image illisible : on réessaie */}busy=false}requestAnimationFrame(loop)};
 requestAnimationFrame(loop);
 function stop(){on=false;stream.getTracks().forEach(tr=>tr.stop());video.srcObject=null}
 return stop}
