/* Arden : logique de l'application (état, moteur d'interprétation, vues, import, événements). */
// Police : SF Pro (police système) sur les appareils Apple ; ailleurs Inter, intégrée à l'appli
// (aucun appel à un service de polices). Chargée seulement si SF Pro est absent.
import '@fontsource-variable/inter/opsz.css'; // graisse + taille optique (comme SF Pro Text / Display)
/* Fraunces : la voix d'Arden (grands titres, titre du jour, titres de cartes), intégrée elle aussi. */
import '@fontsource-variable/fraunces/full.css';
import {$,$$,esc,clone,iso,today,addD,dShort,dLong,dWk,num,has,fx,f2,r0,sg,clamp,nid,norm,plain,e1,sortDesc,setTxt,fmtSl,hhmm,hm,avg,sdv} from './utils.js';
import {BASE_EX,SPORTS,MEALS,WT,MG,SCALES,MEAS,ZC,ZN,IC,DEF} from './constants.js';
import {readHealth} from './health-import.js';
import {loadCiqual,ciqualCount,searchFoods,forGrams,lookupOFF,validCode,startScanner} from './foods.js';
import {demoHealthXML,demoManual,DEMO_PROFILE} from './demo.js';
import {hasHealthKit,authorizeHealth,readHealthKit,useHealthProvider} from './healthkit.js';
import {Capacitor} from '@capacitor/core';
import {Haptics,ImpactStyle,NotificationType} from '@capacitor/haptics';

const S={set:clone(DEF),sessions:[],days:{},med:[],cur:null,health:{upd:'',d:{}},detail:{d:{}},day:today()};
let mode='load',resumed=false,histN=6,sv,tt,startMode='mu',medFlt='Tout',psub='',sleepTrend='sl',sleepPer=30;
const LS='carnet-muscu-v1',pend=[];
/* Appli iOS : Apple Santé est lu directement (HealthKit) au lieu d'un fichier d'export. */
let HKN=false,hkBusy=false;const IMP=(web,ios)=>HKN?ios:web;

/* ---------- mouvement : transitions entre écrans, chiffres qui défilent ---------- */
/* Les écrans glissent dans le sens du geste (jour suivant, précédent), se fondent d'un onglet à l'autre,
   et une jauge touchée s'agrandit jusqu'à sa page. Rien de tout cela avec « Réduire les animations ». */
const calm=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;
let zoomFrom=null;
function vt(update,dir='tab'){const r=document.documentElement;
 if(!document.startViewTransition||calm()||document.visibilityState!=='visible'){update();zoomFrom=null;return}
 r.dataset.vt=dir;const src=zoomFrom;zoomFrom=null;if(src)src.style.viewTransitionName='gz';
 const t=document.startViewTransition(()=>{if(src)src.style.viewTransitionName='';update();
  if(src){const big=$('.view:not([hidden]) .gauge.big svg');if(big)big.style.viewTransitionName='gz'}});
 t.finished.finally(()=>{if(r.dataset.vt===dir)r.dataset.vt='';$$('[style*="view-transition-name"]').forEach(e=>{if(e.id!=='tabs')e.style.viewTransitionName=''})})}
function goDay(n){if(n>0&&S.day>=today())return;buzz();vt(()=>{S.day=addD(S.day,n);renderView(cur())},n>0?'next':'prev')}
/* Chiffres des jauges : ils défilent de 0 à leur valeur pendant que l'arc se remplit. */
function countUp(){if(calm())return;$$('.cnt:not([data-done])').forEach(el=>{el.dataset.done='1';const to=+el.dataset.to,t0=performance.now(),D=950;
 const f=t=>{const k=Math.min(1,(t-t0)/D),e=1-Math.pow(1-k,3);el.textContent=Math.round(to*e);if(k<1&&el.isConnected)requestAnimationFrame(f)};requestAnimationFrame(f)})}
new MutationObserver(()=>{if(document.querySelector('.cnt:not([data-done])'))requestAnimationFrame(countUp)}).observe(document.documentElement,{childList:true,subtree:true});

/* ---------- Dynamic Type ---------- */
/* Sur iPhone et iPad, la taille de texte choisie dans Réglages (Luminosité et affichage → Taille du texte,
   ou Accessibilité → Affichage et taille du texte → Police plus grande) est celle de la police système
   « -apple-system-body » : 17 pt par défaut. Toutes les tailles de texte de l'appli sont en rem : on règle
   la racine sur ce rapport (16 px × taille choisie / 17), relu à chaque retour sur l'appli. Ailleurs, c'est
   la taille de police du navigateur qui s'applique. ?dt=1.3 force un rapport (simulateur, tests). */
const isIOS=()=>Capacitor.getPlatform()==='ios'||/iPhone|iPad|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
function sysBody(){const p=document.createElement('span');p.style.cssText='font:-apple-system-body;position:absolute;visibility:hidden';p.textContent='x';document.body.appendChild(p);const px=parseFloat(getComputedStyle(p).fontSize);p.parentNode.removeChild(p);return px}
function dynType(){const r=document.documentElement,q=parseFloat(new URLSearchParams(location.search).get('dt'));let k=null;
 if(q>0)k=q;else if(isIOS()){const px=sysBody();if(px>0)k=px/17}
 if(k==null){r.style.fontSize='';r.dataset.dt='';return}
 k=clamp(k,.82,1.6);const fs=(16*k).toFixed(2)+'px';if(r.style.fontSize===fs)return;
 r.style.fontSize=fs;r.dataset.dt=k<.97?'sm':k>1.3?'xxl':k>1.1?'xl':'';
 setTimeout(()=>$$('.fig').forEach(f=>f._d&&drawFig(f)),50)}
dynType();addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')dynType()});

/* ---------- stockage ---------- */
function status(k){const m={load:'Chargement…',local:'Sauvegarde locale',err:'Problème de sauvegarde'};const e=$('#st');e.textContent=m[k];e.className='pill '+k}
function lsSave(){if(mode==='wiped')return;try{localStorage.setItem(LS,JSON.stringify({set:S.set,sessions:S.sessions,days:S.days,health:S.health,med:S.med,detail:S.detail}));if(mode!=='load')status('local')}catch(e){console.warn(e);status('err');toast('Stockage plein : supprime des données anciennes ou exporte une sauvegarde.')}}
function lsLoad(){try{const d=JSON.parse(localStorage.getItem(LS)||'null');if(!d)return;if(d.health&&d.health.d)S.health=d.health;if(d.detail&&d.detail.d)S.detail=d.detail;if(Array.isArray(d.med))S.med=d.med;S.set={...clone(DEF),...d.set};const ids=new Set((d.sessions||[]).map(s=>s.id));S.sessions=[...(d.sessions||[]),...S.sessions.filter(s=>!ids.has(s.id))];S.days={...(d.days||{}),...S.days}}catch(e){}}
let saveT=0;
const P=fn=>{if(mode==='load')pend.push(fn);else fn()};
/* Toutes les écritures passent par localStorage, regroupées sur une frame. */
const save=()=>P(()=>{if(saveT)return;saveT=requestAnimationFrame(()=>{saveT=0;lsSave()})});
const put={set:save,sess:save,delSess:save,med:save,delMed:save,health:save,detail:save,day:save};
for(const k in put){const f=put[k];put[k]=(...a)=>{bump();return f(...a)}}
function upsert(o){const i=S.sessions.findIndex(s=>s.id===o.id);if(i<0)S.sessions.push(o);else S.sessions[i]=o}
let DV=0,_dv=-1,_done=[],_idx=new Map();const bump=()=>{DV++};
const memo=fn=>{let v=-1;const m=new Map();return k=>{if(v!==DV){v=DV;m.clear()}if(m.has(k))return m.get(k);const r=fn(k);m.set(k,r);return r}};
const done=()=>{if(_dv!==DV){_dv=DV;_done=S.sessions.filter(s=>!s.open).sort(sortDesc);_idx=new Map();for(const x of _done){const a=_idx.get(x.date);a?a.push(x):_idx.set(x.date,[x])}}return _done};
const sessOn=d=>{done();return _idx.get(d)||[]};
const H=d=>S.health.d[d]||{};
const X=d=>S.detail.d[d]||null;
const hKeys=()=>Object.keys(S.health.d).sort();
const hLast=()=>{const k=hKeys();return k[k.length-1]||''};
const getDay=d=>{const o=S.days[d]||(S.days[d]={items:[],bw:''});if(!o.items)o.items=[];return o};
const J=d=>(S.days[d]||{}).j||{};
const dayIt=d=>((S.days[d]||{}).items)||[];
const sum=(a,k)=>a.reduce((t,x)=>t+num(x[k]),0);
const kcalOf=x=>num(x.k)||(num(x.p)*4+num(x.g)*4+num(x.l)*9);

/* ---------- moteur d'interprétation ---------- */
/* Repères tirés des recommandations et des grandes études de cohorte ; ce sont des estimations, pas un diagnostic. */
const ageOf=()=>{const b=num(S.set.birth);return b>1900?new Date().getFullYear()-b:null};
function vals(k,d,n,off=1){const v=[];for(let i=off;i<off+n;i++){const x=H(addD(d,-i))[k];if(has(x)&&(k==='tp'||num(x)>0))v.push(num(x))}return v}
function base(k,d,n=30){const v=vals(k,d,n);return v.length>=3?avg(v):null}
function winAvg(k,d,n){const v=vals(k,d,n,0);return avg(v)}
const hvm=()=>!S.set.hvmSet?'apple':['sdnn','apple','rmssd'].includes(S.set.hvm)?S.set.hvm:'apple';const useRm=()=>hvm()==='rmssd'&&!!S.health.rm;const nhrv=d=>{const h=H(d);return hvm()==='apple'?(num(h.hrv)||null):useRm()?(num(h.nrm)||null):(num(h.nhv)||null)};const hvVal=p=>useRm()&&p[2]?p[2]:p[1];const hvLab=()=>hvm()==='apple'?'SDNN journée':useRm()?'RMSSD':'SDNN';
function nhrvBase(d){const v=[];for(let i=1;i<=30;i++){const x=nhrv(addD(d,-i));if(x)v.push(x)}return v.length>=7?{m:avg(v),s:sdv(v)}:null}
function weights(){const m={};for(const [d,o] of Object.entries(S.health.d))if(num(o.bw)>0)m[d]=num(o.bw);for(const [d,o] of Object.entries(S.days))if(num(o.bw)>0)m[d]=num(o.bw);return m}
function wAvg(W,d){const v=[];for(let i=0;i<7;i++){const x=W[addD(d,-i)];if(x)v.push(x)}return avg(v)}
function series(k,d0,d1,f=v=>v,n=7,raw){const out=[];for(let d=d0;d<=d1;d=addD(d,1)){const x=H(d)[k];if(!has(x)||(!raw&&!(num(x)>0)))continue;const v=[];for(let i=0;i<n;i++){const y=H(addD(d,-i))[k];if(has(y)&&(raw||num(y)>0))v.push(num(y))}const a=avg(v);if(a!=null)out.push({x:d,y:Math.round(f(a,d)*100)/100})}return out}
const isStr=w=>/StrengthTraining|CoreTraining/.test(w.ty);
function dayTrain_(d){
 const ss=sessOn(d),mu=ss.filter(s=>s.kind!=='sport'),sp=ss.filter(s=>s.kind==='sport'),att=[],ap=[],wks=H(d).wk||[];
 const muAtt=new Set(),spAtt=new Set();
 for(const w of wks){if(isStr(w)&&mu.length){att.push(w);mu.forEach(s=>muAtt.add(s.id));continue}const m=sp.find(s=>s.type===(WT[w.ty]||''));if(m){att.push(w);spAtt.add(m.id);continue}ap.push(w)}
 const am=att.filter(isStr).reduce((a,w)=>a+num(w.min),0),mm=mu.reduce((a,s)=>a+num(s.dur),0)||am;
 const min=mm+sp.reduce((a,s)=>a+num(s.min),0)+ap.reduce((a,w)=>a+num(w.min),0);
 const manual=mu.filter(s=>!muAtt.has(s.id)).reduce((a,s)=>a+(num(s.dur)||60)*(num(s.rpe)||7)/3,0)+sp.filter(s=>!spAtt.has(s.id)).reduce((a,s)=>a+num(s.min)*(num(s.rpe)||6)/3,0);
 const wtr=wks.reduce((a,w)=>a+num(w.tr),0);
 const load=wtr+manual+(wks.length?0:0);
 return{mu,sp,ap,att,min,load,manual,wtr}}
const dayTrain=memo(dayTrain_);
function loadOf_(d){const h=H(d),m=dayTrain(d).manual;return has(h.tr)?Math.max(num(h.tr),m):m}
function effortOf_(d){const h=H(d),t=dayTrain(d);if(!has(h.tr)&&!t.manual&&!t.mu.length&&!t.sp.length)return null;return Math.round(100*(1-Math.exp(-loadOf(d)/110)))}
function loadSum(d,n){let s=0;for(let i=0;i<n;i++)s+=loadOf(addD(d,-i));return s}
function acwr(d){const a=loadSum(d,7),c=loadSum(d,28)/4;let n=0;for(let i=0;i<28;i++){const k=addD(d,-i);if(has(H(k).tr)||dayTrain(k).manual)n++}return{a,c,r:c>0&&n>=21?a/c:null,n}}
function needOf_(d){const T=num(S.set.sleep);let debt=0,n=0;for(let i=1;i<=7;i++){const x=num(H(addD(d,-i)).sl);if(x){debt+=Math.max(0,T-x);n++}}const e=effortOf(addD(d,-1))||0;return{T,debt:Math.round(Math.min(60,debt*0.2)),eff:Math.round(e/100*30),need:Math.round(T+Math.min(60,debt*0.2)+e/100*30)}}
function sleepScore_(d){const h=H(d);if(!h.sl)return null;const c=[],nd=needOf(d);
 c.push(['Durée',clamp(h.sl/nd.need*100,0,100),.4,`${fmtSl(h.sl)} pour un besoin de ${fmtSl(nd.need)}`]);
 const win=has(h.sw)&&has(h.sb)?((h.sw-h.sb+1440)%1440):null,eff=num(h.ef)||(win?h.sl/win:null);
 if(eff)c.push(['Efficacité',clamp((eff-0.70)/0.22*100,0,100),.15,`${r0(eff*100)} % du temps ${h.lat!=null?'au lit':'entre endormissement et réveil'} passé à dormir`]);
 if(h.sd||h.sr){const rp=(num(h.sd)+num(h.sr))/h.sl;c.push(['Récupératrice',clamp((rp-0.15)/0.23*100,0,100),.2,`${r0(rp*100)} % en profond + paradoxal (repère adulte : 35 à 45 %, moins avec l'âge)`])}
 const bt=vals('sb',d,14);if(has(h.sb)&&bt.length>=4){const dv=Math.abs(h.sb-avg(bt));c.push(['Régularité',clamp(100-dv*0.9,0,100),.15,`coucher à ${hhmm(h.sb)}, ${r0(dv)} min de ta moyenne`])}
 if(has(h.wu))c.push(['Continuité',clamp(100-Math.max(0,num(h.wu)-2)*15,0,100),.1,`${h.wu} réveil${h.wu>1?'s':''} dans la nuit${num(h.wu)<=2?' (normal)':''}`]);
 const W=c.reduce((a,x)=>a+x[2],0);return{s:Math.round(c.reduce((a,x)=>a+x[1]*x[2],0)/W),c,nd}}
function zb(f,d,n=30,minN=7){const b=[];for(let i=1;i<=n;i++){const x=f(addD(d,-i));if(x!=null&&x>0)b.push(x)}return b.length>=minN?{m:avg(b),s:sdv(b),n:b.length}:{n:b.length}}
function calib(d){const a=zb(nhrv,d).n,b=zb(x=>num(H(x).hrv)||null,d).n;return Math.max(a,b)}
function recovery_(d){const h=H(d),c=[];
 const v=nhrv(d),lb=zb(x=>{const y=nhrv(x);return y?Math.log(y):null},d);
 if(v&&lb.m!=null){const z=(Math.log(v)-lb.m)/Math.max(lb.s,0.05);c.push(['VFC nocturne',clamp(65+z*15,0,100),.45,`${r0(v)} ms, normale ${r0(Math.exp(lb.m))} ms (${sg(Math.round(z*10)/10)} écart-type)`])}
 else{const db=zb(x=>{const y=num(H(x).hrv);return y?Math.log(y):null},d);if(h.hrv&&db.m!=null){const z=(Math.log(h.hrv)-db.m)/Math.max(db.s,0.05);c.push(['VFC du jour',clamp(65+z*15,0,100),.4,`${h.hrv} ms, normale ${r0(Math.exp(db.m))} ms`])}}
 const rk=h.nmin?'nmin':'rhr',rv=num(h[rk]),rb=zb(x=>num(H(x)[rk])||null,d);if(rv&&rb.m!=null){const z=(rb.m-rv)/Math.max(rb.s,1.5);c.push([rk==='nmin'?'FC min. nocturne':'FC au repos',clamp(65+z*12,0,100),.2,`${r0(rv)} bpm, normale ${r0(rb.m)} bpm`])}
 const sl=sleepScore(d);if(sl)c.push(['Sommeil',sl.s,.25,`score de sommeil ${sl.s}`]);
 const rrb=base('rr',d);if(h.rr&&rrb){const dv=h.rr-rrb;c.push(['Respiration',clamp(85-Math.abs(dv)*35,0,100),.05,`${fx(h.rr)} /min (${sg(Math.round(dv*10)/10)})`])}
 const tb=base('tp',d);if(has(h.tp)&&tb!=null){const dv=num(h.tp)-tb;c.push(['Température',clamp(dv<=0.3?85:85-(dv-0.3)*160,0,100),.05,`${sg(Math.round(dv*100)/100)} °C vs normale`])}
 if(!c.some(x=>/VFC|FC/.test(x[0])))return null;
 const W=c.reduce((a,x)=>a+x[2],0);return{s:Math.round(c.reduce((a,x)=>a+x[1]*x[2],0)/W),c}}
const loadOf=memo(loadOf_),effortOf=memo(effortOf_),needOf=memo(needOf_),sleepScore=memo(sleepScore_),recovery=memo(recovery_);
const recLab=s=>s>=67?['Élevée','var(--rec)']:s>=34?['Moyenne','var(--str)']:['Basse','var(--bad)'];
const effTarget=r=>r==null?null:r>=67?[60,85]:r>=34?[40,65]:[10,40];
const stressLab=s=>s<10?'Faible':s<20?'Modéré':s<35?'Élevé':'Très élevé';
function wakeAvg(d){const v=vals('sw',d,14,0);return v.length?avg(v):null}

/* ---------- moniteur de santé ---------- */
const MON=[['hrv','VFC nocturne','ms',d=>nhrv(d),.05,1],['nmin','FC la plus basse la nuit','bpm',d=>num(H(d).nmin)||null,1.5,-1],['rhr','FC au repos','bpm',d=>num(H(d).rhr)||null,1.5,-1],['dip','Baisse de FC nocturne','%',d=>has(H(d).dip)?num(H(d).dip):null,2,1],['rr','Fréquence respiratoire','/min',d=>num(H(d).rr)||null,.4,0],['o2','Saturation en oxygène','%',d=>num(H(d).o2)||null,.6,1],['tp','Température au poignet','°C',d=>has(H(d).tp)?num(H(d).tp):null,.15,-2]];
function monitor(d){const out=[];for(const [k,l,u,f,fl,dir] of MON){const v=f(d);if(v==null)continue;const b=[];for(let i=1;i<=30;i++){const x=f(addD(d,-i));if(x!=null)b.push(x)}if(b.length<7)continue;
 const m=avg(b),sd=Math.max(sdv(b),k==='hrv'?m*fl:fl),z=(v-m)/sd,az=Math.abs(z);let lab,col;
 if(az<1.5){lab='Dans ta normale';col='var(--rec)'}else if(dir!==0&&dir!==-2&&z*dir>0){lab=dir>0?'Plus haut que d\'habitude':'Plus bas que d\'habitude';col='var(--trn)'}else if(dir===-2&&z<0){lab='Plus bas que d\'habitude';col='var(--mute)'}else{lab=az<2.5?'Inhabituel':'Très inhabituel';col=az<2.5?'var(--str)':'var(--bad)'}
 out.push({k,l,u,v,m,sd,z,lab,col,warn:az>=1.5&&col!=='var(--trn)'&&col!=='var(--mute)'})}return out}
const monFmt=(x,v)=>x.k==='tp'?sg(Math.round((v-x.m)*100)/100)+' °C':x.k==='rr'||x.k==='o2'?fx(v)+' '+x.u:r0(v)+' '+x.u;
/* ---------- bilan santé ---------- */
function markers(){const L=hLast()||today(),out=[],age=num(S.set.birth)>1900?new Date().getFullYear()-num(S.set.birth):null,sex=S.set.sex,hgt=num(S.set.height),W=weights(),wk=Object.keys(W).sort(),wt=wk.length?wAvg(W,wk[wk.length-1]):null;
 const M=(t,v,st,p)=>out.push({t,v,st,p}),OK=['Optimal','var(--rec)'],GD=['Bon','var(--rec)'],MID=['À améliorer','var(--str)'],BAD=['À surveiller','var(--bad)'],NA=['À compléter','var(--mute)'];
 const rhr=winAvg('rhr',L,30);if(rhr)M('FC au repos',r0(rhr)+' bpm',rhr<55?['Athlétique','var(--rec)']:rhr<65?GD:rhr<75?['Correcte','var(--rec)']:rhr<90?MID:BAD,'Chez l\'adulte, 60 à 100 bpm au repos est considéré comme normal ; les sportifs d\'endurance descendent souvent sous 60. Les grandes études de suivi associent une FC de repos plus basse à un meilleur pronostic cardiovasculaire. Une hausse de 5 bpm ou plus pendant plusieurs jours accompagne souvent fatigue, maladie, alcool ou stress.');
 const vo=hKeys().filter(d=>H(d).vo2).map(d=>H(d).vo2);if(vo.length){const v=vo[vo.length-1];if(age&&sex){
  /* percentiles 25, 50, 75 et 90 de la VO2 max mesurée sur tapis, par âge et par sexe (grande base de données d'épreuves d'effort) */
  const VT=sex==='f'?{20:[30.5,37.6,44.7,51.3],30:[25.3,30.2,36.1,41.4],40:[22.1,26.7,32.4,38.4],50:[19.9,23.4,27.6,32.0],60:[17.2,20.0,23.8,27.0],70:[15.6,18.3,20.8,23.1]}:{20:[40.1,48.0,55.2,61.8],30:[35.9,42.4,49.2,56.5],40:[31.9,37.8,45.0,52.1],50:[27.1,32.6,39.7,45.6],60:[23.7,28.2,34.5,40.3],70:[20.4,24.4,30.4,36.6]};
  const th=VT[clamp(Math.floor(age/10)*10,20,70)];const c=v<th[0]?['Sous la moyenne','var(--str)']:v<th[1]?['Moyenne','var(--str)']:v<th[2]?['Bonne','var(--rec)']:v<th[3]?['Très bonne','var(--rec)']:['Excellente','var(--rec)'];
  M('VO2 max',fx(v)+' ml/kg/min',c,`Parmi ${sex==='f'?'les femmes':'les hommes'} de ton âge testés sur tapis, la moitié dépasse ${fx(th[1])} et 10 % dépassent ${fx(th[3])} ml/kg/min. La capacité cardio-respiratoire est l'un des facteurs les plus fortement liés à l'espérance de vie ; elle progresse avec l'endurance facile et le fractionné. La montre l'estime avec une marge d'erreur de plusieurs points.`)}else M('VO2 max',fx(v)+' ml/kg/min',NA,'Renseigne ton année de naissance et ton sexe (Plus → Réglages) pour situer ta valeur par rapport aux personnes de ton âge.')}
 const nv=[];for(let i=0;i<90;i++){const x=nhrv(addD(L,-i));if(x)nv.push([i,x])}if(nv.length>=20){const a=avg(nv.filter(x=>x[0]<14).map(x=>x[1])),b=avg(nv.filter(x=>x[0]>=14).map(x=>x[1]));if(a&&b){const pc=Math.round((a/b-1)*100);M('Tendance de la VFC',`${r0(a)} ms (${pc>0?'+':''}${pc} %)`,pc>=-5?(pc>=5?['En hausse','var(--rec)']:['Stable','var(--rec)']):pc>=-12?MID:BAD,`Tes 14 dernières nuits comparées aux 2 mois et demi précédents (${hvLab()}). La VFC varie énormément d'une personne à l'autre et baisse avec l'âge : il n'existe pas de bonne valeur universelle, c'est ta tendance qui compte. Une baisse de plusieurs semaines accompagne souvent un stress, un manque de sommeil ou une récupération insuffisante ; une hausse progressive, une meilleure forme.`)}}
 const sl=winAvg('sl',L,30);if(sl)M('Sommeil moyen',fmtSl(sl),sl>=420&&sl<=540?OK:sl>=360?MID:BAD,'Il est recommandé de dormir au moins 7 h par nuit (7 à 9 h chez l\'adulte). Moins de 7 h de façon habituelle est associé à une moins bonne récupération, à un risque cardiométabolique plus élevé et à une humeur dégradée ; plus de 9 h de façon habituelle peut signaler un sommeil de mauvaise qualité ou un problème de santé.');
 const bt=vals('sb',L,30,0);if(bt.length>=10){const v=sdv(bt);M('Régularité du coucher',`± ${r0(v)} min`,v<30?OK:v<60?MID:BAD,'Écart-type de ton heure d\'endormissement. Des horaires réguliers (± 30 min) améliorent la qualité du sommeil et la récupération, même à durée égale.')}
 const st=winAvg('st',L,30);if(st){const old=age!=null&&age>=60,g1=old?6000:8000,g0=old?4000:5000;M('Pas par jour',r0(st),st>=g1?OK:st>=g0?MID:BAD,`Le risque de mortalité baisse nettement quand on marche davantage, jusqu'à environ ${old?'6 000 à 8 000':'8 000 à 10 000'} pas par jour ${old?'après':'avant'} 60 ans ; au-delà, le bénéfice se stabilise. Chaque tranche de 1 000 pas en plus compte, même en partant de peu, et la marche rapide apporte un bénéfice supplémentaire.`)}
 const exs=vals('ex',L,28,0);if(exs.length>=14){const wkm=exs.reduce((a,b)=>a+b,0)/4;M('Activité par semaine',r0(wkm)+' min',wkm>=300?['Excellent','var(--rec)']:wkm>=150?GD:wkm>=75?MID:BAD,'L\'OMS recommande au moins 150 à 300 min d\'activité d\'intensité modérée par semaine (ou 75 à 150 min d\'intensité soutenue), plus au moins 2 séances de renforcement musculaire. Mesuré ici par les minutes d\'exercice de la montre (marche rapide et plus).')}
 if(wt){if(hgt>100){const bmi=wt/(hgt/100)**2;M('IMC',fx(bmi),bmi>=18.5&&bmi<25?GD:bmi<30?MID:BAD,`${fx(wt)} kg pour ${hgt} cm. Chez un pratiquant de musculation, l'IMC surestime souvent l'excès de poids : regarde plutôt ton tour de taille.`)}else M('IMC','–',NA,'Renseigne ta taille (Plus → Réglages) pour calculer ton IMC et ton rapport tour de taille / taille.')}
 const ms=Object.keys(S.days).filter(d=>S.days[d].m&&S.days[d].m.taille).sort();if(ms.length&&hgt>100){const w=S.days[ms[ms.length-1]].m.taille,r=w/hgt;M('Tour de taille / taille',f2(r),r<0.5?OK:r<0.6?MID:BAD,`${fx(w)} cm de tour de taille. Sous 0,5, le risque cardiométabolique est faible ; c'est un meilleur indicateur que l'IMC pour la graisse abdominale.`)}
 const bf=hKeys().filter(d=>H(d).bf).map(d=>H(d).bf);if(bf.length&&sex){const v=bf[bf.length-1],a=age==null?30:age,
  /* plages selon l'âge et le sexe : [bas, haut de la plage saine, début de l'obésité] */
  r=sex==='f'?(a<40?[21,32,39]:a<60?[23,33,40]:[24,35,42]):(a<40?[8,19,25]:a<60?[11,21,28]:[13,24,30]);
  M('Masse grasse',fx(v)+' %',v<r[0]?['Basse','var(--str)']:v<=r[1]?GD:v<r[2]?['Élevée','var(--str)']:BAD,`Plage habituellement considérée comme saine pour ${sex==='f'?'une femme':'un homme'} de ${age==null?'20 à 39':a<40?'20 à 39':a<60?'40 à 59':'60 ans et plus'}${age==null?' ans (renseigne ton année de naissance pour affiner)':a<60?' ans':''} : ${r[0]} à ${r[1]} %. Les balances à impédance ont une marge d'erreur de 3 à 5 points : suis surtout la tendance.`)}
 const pr=[];for(let i=0;i<14;i++){const d=addD(today(),-i);if(dayIt(d).length)pr.push(sum(dayIt(d),'p'))}if(pr.length>=5&&wt){const gk=avg(pr)/wt;M('Protéines par kg',fx(gk)+' g/kg',gk>=1.6?OK:gk>=1.2?MID:gk>=0.8?['Minimum','var(--str)']:BAD,`${r0(avg(pr))} g par jour en moyenne pour ${fx(wt)} kg. Avec de la musculation, environ 1,6 g/kg par jour suffit à la plupart des gens pour garder ou développer du muscle (jusqu'à 2,2 g/kg en déficit calorique) ; au-delà, le bénéfice est faible. Le minimum pour la santé générale est de 0,8 g/kg.`)}
 const o2=winAvg('o2',L,30);if(o2)M('Saturation nocturne',fx(o2)+' %',o2>=95?OK:o2>=92?MID:BAD,'Au repos, 95 à 100 % est normal, et de brèves baisses la nuit sont fréquentes. Une moyenne nocturne habituellement sous 92-93 %, surtout avec des ronflements ou de la fatigue au réveil, mérite d\'en parler à un médecin (apnées du sommeil). La mesure au poignet est moins précise qu\'un oxymètre au doigt.');
 const rr=winAvg('rr',L,30);if(rr)M('Respiration nocturne',fx(rr)+' /min',rr>=12&&rr<=20?OK:MID,'Chez l\'adulte au repos, 12 à 20 respirations par minute est la norme. Ce qui compte surtout, ce sont les hausses brusques par rapport à ta propre moyenne : elles accompagnent souvent une infection.');
 const dp=winAvg('dip',L,14);if(dp)M('Baisse de FC la nuit',r0(dp)+' %',dp>=10?OK:dp>=5?MID:BAD,'Chez la plupart des gens, la FC baisse d\'environ 10 à 20 % pendant le sommeil par rapport à la journée. Une baisse faible et durable est associée à un moins bon profil cardiovasculaire ; ponctuellement, un repas copieux, l\'alcool, un entraînement tardif ou le stress la réduisent.');
 return out}
function tdeeEst(){const e=today(),ds=[];for(let i=1;i<=21;i++){const d=addD(e,-i);if(dayIt(d).length)ds.push(d)}if(ds.length<10)return null;const W=weights(),wp=[];for(let i=1;i<=21;i++){const d=addD(e,-i);if(W[d])wp.push([-i,W[d]])}if(wp.length<6)return null;
 const mx=avg(wp.map(p=>p[0])),my=avg(wp.map(p=>p[1])),sxx=wp.reduce((a,p)=>a+(p[0]-mx)**2,0);if(!sxx)return null;const rate=wp.reduce((a,p)=>a+(p[0]-mx)*(p[1]-my),0)/sxx;
 const intake=avg(ds.map(d=>dayIt(d).reduce((s,x)=>s+kcalOf(x),0)));return{t:Math.round(intake-rate*7700),intake:Math.round(intake),wk:rate*7,n:ds.length}}
function zones28(){const Z=[0,0,0,0,0];for(let i=0;i<28;i++)for(const w of H(addD(today(),-i)).wk||[])(w.z||[]).forEach((m,j)=>Z[j]+=m);return Z}
function monotony(d){const L=[];for(let i=0;i<7;i++)L.push(loadOf(addD(d,-i)));const m=avg(L);if(m<5)return null;const s=Math.max(sdv(L),m*0.1);return{mono:m/s,strain:L.reduce((a,b)=>a+b,0)*m/s}}
function dailyPts(f,from,to){const o=[];for(let k=from;k<=to;k=addD(k,1)){const v=f(k);if(v!=null&&isFinite(v))o.push({x:k,y:Math.round(v*100)/100})}return o}
function roll7(p){return p.map(q=>{const w=p.filter(z=>z.x<=q.x&&z.x>addD(q.x,-7));return{x:q.x,y:Math.round(avg(w.map(z=>z.y))*100)/100}})}
/* ---------- graphiques ---------- */
const ro=new ResizeObserver(es=>es.forEach(e=>drawFig(e.target)));
function setFig(sel,cfg){const f=$(sel);f._d=cfg;if(!f._o){ro.observe(f);f._o=1}drawFig(f)}
function drawFig(f){const c=f._d;if(!c)return;if(c.type==='day')return drawDay(f);if(c.type==='hyp')return drawHyp(f);const s=f.querySelector('svg');
 const all=c.series.flatMap(x=>x.pts);f.classList.toggle('nodata',all.length<2);const W=f.clientWidth,H2=f.clientHeight;if(!W)return;
 if(all.length<2){f._g=null;s.innerHTML='';f.dataset.empty=c.empty||'Pas encore assez de données';return}
 const span=(Math.max(...all.map(p=>Date.parse(p.x)))-Math.min(...all.map(p=>Date.parse(p.x))))/864e5,hw=c.hw||(span>60?7:3);
 const bands=c.series.filter(se=>se.avg&&se.pts.length>=3).map(se=>({se,b:se.pts.map(q=>{const t=Date.parse(q.x),w=se.pts.filter(z=>Math.abs(Date.parse(z.x)-t)<=hw*864e5+1).map(z=>z.y),m=avg(w),sd=w.length>2?sdv(w):0;return{x:q.x,m,lo:m-sd,hi:m+sd}})}));
 const nar=W<520,pl=nar?34:44,pr=nar?46:56,pt=14,pb=24,xs=all.map(p=>Date.parse(p.x));let ys=all.map(p=>p.y);for(const B of bands)for(const q of B.b)ys.push(q.lo,q.hi);if(has(c.hline))ys=ys.concat(+c.hline);if(c.ymin!=null)ys.push(c.ymin);if(c.ymax!=null)ys.push(c.ymax);if(c.band)ys.push(c.band[0],c.band[1]);
 const x0=Math.min(...xs),x1=Math.max(...xs);let y0=Math.min(...ys),y1=Math.max(...ys);const pad=c.ymin!=null?0:(y1-y0)*.15||Math.max(.5,Math.abs(y1)*.05);y0=c.zero?0:y0-pad;y1+=c.ymax!=null?0:pad;
 const Xf=v=>pl+(v-x0)/((x1-x0)||1)*(W-pl-pr),Y=v=>pt+(1-(v-y0)/((y1-y0)||1))*(H2-pt-pb),fm=c.fmt||(y1>=10000?v=>fx(v/1000)+' k':fx);
 const step=Math.pow(10,Math.floor(Math.log10(((y1-y0)||1)/4))),st=c.step?(Math.ceil((y1-y0)/5/c.step)*c.step):([1,2,2.5,5,10].map(m=>m*step).find(m=>(y1-y0)/m<=5)||step*10);
 let g='';if(c.band)g+=`<rect x="${pl}" width="${W-pl-pr}" y="${Y(c.band[1])}" height="${Math.max(0,Y(c.band[0])-Y(c.band[1]))}" fill="var(--ink)" opacity=".06" rx="4"/><line x1="${pl}" x2="${W-pr}" y1="${Y(c.band[0])}" y2="${Y(c.band[0])}" stroke="var(--mute)" stroke-dasharray="3 4"/><line x1="${pl}" x2="${W-pr}" y1="${Y(c.band[1])}" y2="${Y(c.band[1])}" stroke="var(--mute)" stroke-dasharray="3 4"/>`;
 for(let v=Math.ceil(y0/st)*st;v<=y1+1e-9;v+=st)g+=`<line x1="${pl}" x2="${W-pr}" y1="${Y(v)}" y2="${Y(v)}" stroke="var(--line)"/><text x="${pl-8}" y="${Y(v)+4}" text-anchor="end">${fm(Math.round(v*1000)/1000)}</text>`;
 const xl=[[x0,'start'],[x1,'end']];if(!nar)xl.push([(x0+x1)/2,'middle']);
 for(const [v,a] of xl)g+=`<text x="${Xf(v)}" y="${H2-4}" text-anchor="${a}">${dShort(iso(new Date(v)))}</text>`;
 if(has(c.hline))g+=`<line x1="${pl}" x2="${W-pr}" y1="${Y(+c.hline)}" y2="${Y(+c.hline)}" stroke="var(--ink)" stroke-dasharray="4 4" opacity=".45"/>`;
 const tfa=c.tf||(v=>fm(v)+(c.unit?' '+c.unit:'')),avgs=[];
 const smooth=P=>{if(P.length<2)return'';let d=`M${P[0][0].toFixed(1)} ${P[0][1].toFixed(1)}`;for(let i=0;i<P.length-1;i++){const p0=P[i-1]||P[i],p1=P[i],p2=P[i+1],p3=P[i+2]||p2;d+=` C${(p1[0]+(p2[0]-p0[0])/6).toFixed(1)} ${(p1[1]+(p2[1]-p0[1])/6).toFixed(1)} ${(p2[0]-(p3[0]-p1[0])/6).toFixed(1)} ${(p2[1]-(p3[1]-p1[1])/6).toFixed(1)} ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`}return d};
 for(const {se,b} of bands){avgs.push([se,avg(se.pts.map(p=>p.y)),b]);const up=b.map(q=>[Xf(Date.parse(q.x)),Y(q.hi)]),dn=b.map(q=>[Xf(Date.parse(q.x)),Y(q.lo)]).reverse(),mid=b.map(q=>[Xf(Date.parse(q.x)),Y(q.m)]);
  g+=`<path d="${smooth(up)} L${dn[0][0].toFixed(1)} ${dn[0][1].toFixed(1)} ${smooth(dn).replace(/^M[^C]*/,'')} Z" fill="${se.col}" opacity=".14"/><path d="${smooth(mid)}" fill="none" stroke="${se.col}" stroke-width="${nar?7:10}" stroke-linecap="round" opacity=".16"/><path d="${smooth(mid)}" fill="none" stroke="${se.col}" stroke-width="1.5" opacity=".45"/>`}
 const lastY=[];
 for(const se of c.series){if(!se.pts.length)continue;const px=se.pts.map(p=>[Xf(Date.parse(p.x)),Y(p.y)]);
  if(se.bars){const bw=Math.max(2,(W-pl-pr)/Math.max(1,(x1-x0)/864e5+1)*.7);g+=px.map(([a,b])=>`<rect x="${(a-bw/2).toFixed(1)}" y="${b.toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(0,Y(Math.max(y0,0))-b).toFixed(1)}" rx="${Math.min(3,bw/2)}" fill="${se.col}" opacity="${se.op||.85}"/>`).join('')}
  if(se.dots)g+=px.map(([a,b])=>`<circle cx="${a.toFixed(1)}" cy="${b.toFixed(1)}" r="${se.r||3}" fill="${se.col}" opacity="${se.op||1}"/>`).join('');
  if(!se.bars&&se.line!==false&&px.length>1)g+=`<path d="${px.map((p,i)=>(i&&Date.parse(se.pts[i].x)-Date.parse(se.pts[i-1].x)<2.5*864e5?'L':'M')+p[0].toFixed(1)+' '+p[1].toFixed(1)).join('')}" fill="none" stroke="${se.col}" stroke-width="${se.w||2.5}" stroke-linejoin="round" stroke-linecap="round"${se.dash?' stroke-dasharray="5 4"':''}/>`;
  if(se.last){const [a,b]=px[px.length-1],l=se.pts[se.pts.length-1];let ty=b+5;for(const o of lastY)if(Math.abs(o-ty)<15)ty=o+(ty>=o?15:-15);lastY.push(ty);g+=`<circle cx="${a}" cy="${b}" r="4.5" fill="${se.col}"/><text class="lab" x="${a+8}" y="${ty}">${fm(l.y)}</text>`}}
 s.innerHTML=g;
 const maps=c.series.map(se=>new Map(se.pts.map(p=>[p.x,p.y]))),dates=[...new Set(all.map(p=>p.x))].sort(),dx=dates.map(x=>Xf(Date.parse(x))),tfd=c.tf||(v=>fm(v)+(c.unit?' '+c.unit:''));
 f._g={hit:x=>{let bi=-1,bd=Infinity;for(let i=0;i<dx.length;i++){const q=Math.abs(dx[i]-x);if(q<bd){bd=q;bi=i}}if(bi<0||bd>40)return null;const dt=dates[bi],gx=dx[bi],rows=[],mk=[];
  c.series.forEach((se,i)=>{const v=maps[i].get(dt);if(v==null)return;mk.push([gx,Y(v),se.col]);rows.push(`<div><i class="sw" style="background:${se.col}"></i>${se.name?esc(se.name)+' : ':''}<b>${esc((se.tf||tfd)(v))}</b></div>`)});
  if(!rows.length)return null;const key=dt;for(const [se,m,b] of avgs){const q=b.find(z=>z.x===dt),tf2=se.tf||tfd;if(q)rows.push(`<div class="d">Plage habituelle (±${hw} j) : ${esc(tf2(q.lo))} à ${esc(tf2(q.hi))}</div>`);const v=maps[c.series.indexOf(se)].get(dt);if(v!=null)rows.push(`<div class="d">${esc(se.name||'')} vs moyenne de la période (${esc((se.tf||tfd)(m))}) : <b>${v-m>0?'+':''}${esc((se.df||c.df||se.tf||tfd)(Math.abs(v-m))).replace(/^/,v-m<0?'−':'')}</b></div>`)}return{key,gx,mk,ty:Math.min(...mk.map(m=>m[1])),html:`<div class="d">${esc(dLong(dt))}</div>${rows.join('')}${c.band?`<div class="d">ta normale : ${esc(fm(c.band[0]))} à ${esc(fm(c.band[1]))}</div>`:''}`}}};
 interact(f)}
function interact(f){if(f._i)return;f._i=1;const ov=document.createElement('div');ov.className='ov';f.appendChild(ov);
 const hide=()=>{ov.innerHTML='';if(f._lk!=null){f._lk=null;if(f._d&&f._d.onScrub)f._d.onScrub(null)}};
 const move=e=>{const g=f._g;if(!g)return hide();const r=f.getBoundingClientRect(),x=e.clientX-r.left,res=g.hit(x,e.clientY-r.top);if(!res)return hide();
  if(res.key!==f._lk){f._lk=res.key;if(e.pointerType!=='mouse')buzz();if(f._d&&f._d.onScrub)f._d.onScrub(res.key)}
  ov.innerHTML=(res.gx!=null?`<i class="guide" style="left:${res.gx}px"></i>`:'')+(res.mk||[]).map(m=>`<i class="mk" style="left:${m[0]}px;top:${m[1]}px;background:${m[2]}"></i>`).join('')+`<div class="tip">${res.html}</div>`;
  const t=ov.querySelector('.tip'),tw=t.offsetWidth,th=t.offsetHeight,ax=res.gx??x;let lx=ax+14;if(lx+tw>r.width)lx=ax-14-tw;t.style.left=Math.max(0,lx)+'px';t.style.top=clamp((res.ty??(e.clientY-r.top))-th-10,0,Math.max(0,r.height-th))+'px'};
 f.addEventListener('pointermove',move);f.addEventListener('pointerdown',move);f.addEventListener('pointerleave',hide);f.addEventListener('pointerup',e=>{if(e.pointerType!=='mouse')hide()});f.addEventListener('pointercancel',hide)}
function drawDay(f){const s=f.querySelector('svg'),c=f._d,W=f.clientWidth,H2=f.clientHeight;if(!W)return;const h=c.h||[];const pts=h.map((v,i)=>v?[i*15+7.5,v]:null).filter(Boolean);f.classList.toggle('nodata',pts.length<4);
 if(pts.length<4){f._g=null;s.innerHTML='';f.dataset.empty=hKeys().length?'Pas de courbe cardiaque pour ce jour. Le détail minute par minute est gardé pour les 35 derniers jours.':'Pas encore de fréquence cardiaque';return}
 const pl=34,pr=10,pt=10,pb=22,ys=pts.map(p=>p[1]),y0=Math.min(...ys)-5,y1=Math.max(...ys)+5,Xf=m=>pl+m/1440*(W-pl-pr),Y=v=>pt+(1-(v-y0)/(y1-y0))*(H2-pt-pb);
 let g='';for(const [a,b] of c.sleep||[])g+=`<rect x="${Xf(a)}" y="${pt}" width="${Math.max(1,Xf(b)-Xf(a))}" height="${H2-pt-pb}" fill="var(--slp)" opacity=".13" rx="6"/>`;
 (c.stress||[]).forEach((v,i)=>{if(v>=30)g+=`<rect x="${Xf(i*60)}" y="${H2-pb-6}" width="${Xf(60)-Xf(0)-1}" height="6" fill="var(--str)" opacity="${clamp(v/100,.3,1)}" rx="2"/>`});
 for(const [a,b] of c.wk||[])g+=`<rect x="${Xf(a)}" y="${pt}" width="${Math.max(2,Xf(b)-Xf(a))}" height="${H2-pt-pb}" fill="var(--eff)" opacity=".18" rx="6"/>`;
 const st=y1-y0>60?20:10;for(let v=Math.ceil(y0/st)*st;v<=y1;v+=st)g+=`<line x1="${pl}" x2="${W-pr}" y1="${Y(v)}" y2="${Y(v)}" stroke="var(--line)"/><text x="${pl-6}" y="${Y(v)+4}" text-anchor="end">${v}</text>`;
 for(let hh=0;hh<=24;hh+=W<520?6:3)g+=`<text x="${Xf(hh*60)}" y="${H2-4}" text-anchor="${hh===0?'start':hh===24?'end':'middle'}">${hh}h</text>`;
 let p='',prev=-99;for(const [m,v] of pts){p+=(m-prev>46?'M':'L')+Xf(m).toFixed(1)+' '+Y(v).toFixed(1);prev=m}
 g+=`<path d="${p}" fill="none" stroke="var(--hrt)" stroke-width="2" stroke-linejoin="round"/>`;
 const mx=pts.reduce((a,b)=>b[1]>a[1]?b:a),mn=pts.reduce((a,b)=>b[1]<a[1]?b:a);
 g+=`<circle cx="${Xf(mx[0])}" cy="${Y(mx[1])}" r="4" fill="var(--hrt)"/><text class="lab" x="${Xf(mx[0])}" y="${Y(mx[1])-8}" text-anchor="middle">${mx[1]}</text><text class="lab" x="${Xf(mn[0])}" y="${Y(mn[1])+16}" text-anchor="middle">${mn[1]}</text>`;
 s.innerHTML=g;
 f._g={hit:x=>{const m=clamp((x-pl)/(W-pl-pr)*1440,0,1439);let i=Math.floor(m/15),v=h[i];for(let k=1;k<=2&&!v;k++){if(h[i-k]){i-=k;v=h[i]}else if(h[i+k]){i+=k;v=h[i]}}
  const inS=(c.sleep||[]).some(([a,b])=>m>=a&&m<b),inW=(c.wk||[]).some(([a,b])=>m>=a&&m<b),hh=Math.floor(m/60),sv=(c.stress||[])[hh];if(!v&&!inS&&!inW)return null;
  return{key:i,gx:Xf(i*15+7.5),mk:v?[[Xf(i*15+7.5),Y(v),'var(--hrt)']]:[],ty:v?Y(v):40,html:`<div class="d">${hm(i*15)} – ${hm(i*15+15)}</div>${v?`<div><i class="sw" style="background:var(--hrt)"></i>FC moyenne : <b>${v} bpm</b></div>`:''}${inS?'<div><i class="sw" style="background:var(--slp)"></i>Sommeil</div>':''}${inW?'<div><i class="sw" style="background:var(--eff)"></i>Entraînement</div>':''}${sv?`<div><i class="sw" style="background:var(--str)"></i>Stress entre ${hh}h et ${hh+1}h : <b>${sv} / 100</b></div>`:''}`}}};
 interact(f)}
function drawHyp(f){const s=f.querySelector('svg'),c=f._d,W=f.clientWidth,H2=f.clientHeight;if(!W)return;const sg2=c.segs||[];f.classList.toggle('nodata',!sg2.length);
 if(!sg2.length){f._g=null;s.innerHTML='';f.dataset.empty=c.empty||'Pas de détail pour cette nuit';return}
 const a0=Math.min(...sg2.map(x=>x[0]))-10,a1=Math.max(...sg2.map(x=>x[1]))+10,pl=nar(W)?44:64,pr=nar(W)?36:46,Xf=m=>pl+(m-a0)/(a1-a0)*(W-pl-pr);
 const lanes=[['Éveil','var(--awake)'],['REM','var(--rem)'],['Léger','var(--core)'],['Profond','var(--deep)']],top=8,lh=Math.min(34,(H2*.5-top)/4),code2lane={0:0,1:1,2:2,3:3,4:2};
 let g='';lanes.forEach(([n],i)=>g+=`<text x="${pl-8}" y="${top+i*lh+lh/2+4}" text-anchor="end">${n}</text><line x1="${pl}" x2="${W-pr}" y1="${top+i*lh+lh/2}" y2="${top+i*lh+lh/2}" stroke="var(--line)" stroke-dasharray="2 4"/>`);
 const sorted=sg2.slice().sort((x,y)=>x[0]-y[0]);let prevL=null,prevX=null;
 for(const [a,b,cd] of sorted){const L=code2lane[cd]??2,y=top+L*lh+4,col=cd===4?'color-mix(in srgb,var(--slp) 45%,var(--field))':lanes[L][1];
  if(prevL!=null&&Math.abs(Xf(a)-prevX)<3)g+=`<line x1="${Xf(a)}" x2="${Xf(a)}" y1="${top+Math.min(prevL,L)*lh+lh/2}" y2="${top+Math.max(prevL,L)*lh+lh/2}" stroke="var(--line)" stroke-width="1.5"/>`;
  g+=`<rect x="${Xf(a).toFixed(1)}" y="${y}" width="${Math.max(1.5,Xf(b)-Xf(a)).toFixed(1)}" height="${lh-8}" rx="4" fill="${col}"/>`;prevL=L;prevX=Xf(b)}
 const b0=top+4*lh+18,b1=H2-22;
 const nh=c.nh||[],hp=nh.map((v,i)=>v?[c.nh0+i*5+2.5,v]:null).filter(Boolean).filter(p=>p[0]>=a0&&p[0]<=a1),nv=(c.nv||[]).filter(p=>p[0]>=a0&&p[0]<=a1).map(p=>[p[0],hvVal(p)]);
 if(hp.length>1){const ys=hp.map(p=>p[1]),y0=Math.min(...ys)-3,y1=Math.max(...ys)+3,Y=v=>b0+(1-(v-y0)/(y1-y0))*(b1-b0);
  g+=`<text x="${pl-8}" y="${b0+8}" text-anchor="end" style="fill:var(--hrt)">${Math.round(y1)}</text><text x="${pl-8}" y="${b1}" text-anchor="end" style="fill:var(--hrt)">${Math.round(y0)}</text>`;
  let p='',pv=-99;for(const [m,v] of hp){p+=(m-pv>16?'M':'L')+Xf(m).toFixed(1)+' '+Y(v).toFixed(1);pv=m}g+=`<path d="${p}" fill="none" stroke="var(--hrt)" stroke-width="2" stroke-linejoin="round"/>`;
  const mn=hp.reduce((x,y)=>y[1]<x[1]?y:x);g+=`<circle cx="${Xf(mn[0])}" cy="${Y(mn[1])}" r="4" fill="var(--hrt)"/><text class="lab" x="${Xf(mn[0])}" y="${Y(mn[1])+16}" text-anchor="middle">${mn[1]} bpm</text>`}
 if(nv.length){const vs=nv.map(p=>p[1]),v0=Math.min(...vs)*.85,v1=Math.max(...vs)*1.1,Y=v=>b0+(1-(v-v0)/((v1-v0)||1))*(b1-b0);
  g+=`<text x="${W-pr+6}" y="${b0+8}" style="fill:var(--mind)">${Math.round(v1)}</text><text x="${W-pr+6}" y="${b1}" style="fill:var(--mind)">${Math.round(v0)}</text>`;
  g+=nv.map(([m,v])=>`<circle cx="${Xf(m).toFixed(1)}" cy="${Y(v).toFixed(1)}" r="5" fill="var(--mind)" stroke="var(--panel)" stroke-width="2"/>`+(nv.length<=12?`<text class="lab" x="${Xf(m).toFixed(1)}" y="${(Y(v)-9).toFixed(1)}" text-anchor="middle" style="fill:var(--mind)">${Math.round(v)}</text>`:'')).join('')}
 g+=`<text x="${pl-8}" y="${(b0+b1)/2+4}" text-anchor="end">FC</text><line x1="${pl}" x2="${W-pr}" y1="${b0-8}" y2="${b0-8}" stroke="var(--line)"/>`;
 const step=(a1-a0)>540||nar(W)?120:60;for(let m=Math.ceil(a0/step)*step;m<=a1;m+=step)g+=`<text x="${Xf(m)}" y="${H2-4}" text-anchor="middle">${hhmm(m)}</text>`;
 s.innerHTML=g;
 const SN=['Éveil','Paradoxal (REM)','Léger','Profond','Endormi (phase non détaillée)'],SC=['var(--awake)','var(--rem)','var(--core)','var(--deep)','var(--slp)'];
 f._g={hit:x=>{const m=a0+(x-pl)/(W-pl-pr)*(a1-a0);if(m<a0||m>a1)return null;const inn=sorted.filter(([a,b])=>m>=a&&m<b),sx=inn.find(q=>q[2]===0)||inn[0];
  const hv=(c.nh||[])[Math.round((m-c.nh0-2.5)/5)];let pv=null,bd=21;for(const p of nv){const q=Math.abs(p[0]-m);if(q<bd){bd=q;pv=p}}if(!sx&&!hv&&!pv)return null;
  return{key:Math.round(m),gx:Xf(m),mk:[],ty:top+lh*2,html:`<div class="d">${hhmm(m)}</div>${sx?`<div><i class="sw" style="background:${SC[sx[2]]}"></i>${SN[sx[2]]} : <b>${hhmm(sx[0])} – ${hhmm(sx[1])}</b> (${fmtSl(sx[1]-sx[0])})</div>`:''}${hv?`<div><i class="sw" style="background:var(--hrt)"></i>FC : <b>${hv} bpm</b></div>`:''}${pv?`<div><i class="sw" style="background:var(--mind)"></i>VFC ${hvLab()} à ${hhmm(pv[0])} : <b>${r0(pv[1])} ms</b></div>`:''}`}}};
 interact(f)}
const nar=W=>W<520;
/* Jauges d'Arden : arc ouvert de 270° (ouverture en bas), dégradé du ton profond au ton clair dessiné
   en petits segments, curseur clair au bout ; remplissage animé quand la valeur change. */
let ringN=0;const ringSeen=new Map();
const GA0=Math.PI*.75,GSPAN=Math.PI*1.5;
const arcPath=(cx,cy,r,b0,b1)=>{const P=a=>[cx+r*Math.cos(a),cy+r*Math.sin(a)],[x0,y0]=P(b0),[x1,y1]=P(b1);return `M${x0.toFixed(2)} ${y0.toFixed(2)}A${r} ${r} 0 ${b1-b0>Math.PI?1:0} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`};
function arcRing(cx,cy,r,w,p,col,id,shadow=true,a0=-Math.PI/2,span=2*Math.PI){if(!(p>0))return'';p=Math.min(p,0.9995);
 const a1=a0+p*span,N=Math.max(2,Math.ceil(p*(r>20?90:36))),dk=`color-mix(in oklab, ${col} 82%, #000)`,lt=`color-mix(in oklab, ${col} 66%, #fff)`,
  mix=t=>`color-mix(in oklab, ${dk} ${Math.round((1-t)*100)}%, ${lt})`,P=a=>[cx+r*Math.cos(a),cy+r*Math.sin(a)],f=v=>v.toFixed(2);
 let g='';for(let k=0;k<N;k++){const s0=a0+(a1-a0)*k/N,s1=Math.min(a1,a0+(a1-a0)*(k+1)/N+0.01),[x0,y0]=P(s0),[x1,y1]=P(s1);g+=`<path d="M${f(x0)} ${f(y0)}A${r} ${r} 0 0 1 ${f(x1)} ${f(y1)}" style="stroke:${mix((k+.5)/N*p)}" stroke-width="${w}" fill="none"/>`}
 const [sx,sy]=P(a0),[ex,ey]=P(a1),dx=Math.cos(a1+Math.PI/2)*w*.22,dy=Math.sin(a1+Math.PI/2)*w*.22;
 return `<circle cx="${f(sx)}" cy="${f(sy)}" r="${w/2}" style="fill:${mix(0)}"/>${g}${shadow&&p>.04?`<circle cx="${f(ex+dx)}" cy="${f(ey+dy)}" r="${w/2}" fill="#000" opacity=".3" filter="url(#${id}b)"/>`:''}<circle cx="${f(ex)}" cy="${f(ey)}" r="${w/2}" style="fill:${mix(p)}"/>${shadow?`<circle cx="${f(ex)}" cy="${f(ey)}" r="${(w*.2).toFixed(2)}" fill="#fff" opacity=".92"/>`:''}`}
function gaugeSVG(v,col,unit,max=100,key,zone){const r=56,w=10,cy=74,p=v==null?0:clamp(v/max,0,1),id='rg'+(++ringN);
 const an=!!key&&p>0&&ringSeen.get(key)!==p&&!matchMedia('(prefers-reduced-motion: reduce)').matches;if(key)ringSeen.set(key,p);
 const tick=a=>{const c=Math.cos(a),s=Math.sin(a);return `<line x1="${(70+(r-w/2-5)*c).toFixed(2)}" y1="${(cy+(r-w/2-5)*s).toFixed(2)}" x2="${(70+(r-w/2-2)*c).toFixed(2)}" y2="${(cy+(r-w/2-2)*s).toFixed(2)}" stroke="${col}" stroke-opacity=".45" stroke-width="1.6" stroke-linecap="round"/>`};
 return `<svg viewBox="0 0 140 142" aria-hidden="true"><defs><linearGradient id="${id}w" x1="0" y1="0" x2="0" y2="1"><stop offset="0" class="gw0"/><stop offset="1" class="gw1"/></linearGradient><filter id="${id}b" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="2"/></filter>${an?`<mask id="${id}m"><path class="ringgrow" d="${arcPath(70,cy,r,GA0-.2,GA0+GSPAN+.2)}" fill="none" stroke="#fff" pathLength="100" stroke-dasharray="100 100" stroke-dashoffset="100"/></mask>`:''}</defs><circle class="gw" cx="70" cy="${cy}" r="67" fill="url(#${id}w)"/><path d="${arcPath(70,cy,r,GA0,GA0+GSPAN)}" fill="none" stroke="${col}" stroke-opacity=".15" stroke-width="${w}" stroke-linecap="round"/>${zone?zoneArc(70,cy,r,w,zone,col,max):[.25,.5,.75].map(t=>tick(GA0+GSPAN*t)).join('')}<g${an?` mask="url(#${id}m)"`:''}>${arcRing(70,cy,r,w,p,col,id,true,GA0,GSPAN)}</g><text class="gv${an?' cnt':''}" x="70" y="${cy+11}" text-anchor="middle"${an?` data-to="${Math.round(v)}"`:''}>${v==null?'–':an?0:Math.round(v)}</text>${unit?`<text class="gu" x="70" y="${cy+r*.71+4}" text-anchor="middle">${unit}</text>`:''}</svg>`}
/* zone conseillée : bande plus soutenue sur la piste, bornée par deux traits */
function zoneArc(cx,cy,r,w,[lo,hi],col,max=100){const b0=GA0+GSPAN*lo/max,b1=GA0+GSPAN*hi/max,edge=a=>{const c=Math.cos(a),s=Math.sin(a);return `<line x1="${(cx+(r-w/2-1)*c).toFixed(2)}" y1="${(cy+(r-w/2-1)*s).toFixed(2)}" x2="${(cx+(r+w/2+1)*c).toFixed(2)}" y2="${(cy+(r+w/2+1)*s).toFixed(2)}" stroke="${col}" stroke-opacity=".7" stroke-width="1.6" stroke-linecap="round"/>`};
 return `<path class="gz" d="${arcPath(cx,cy,r,b0,b1)}" fill="none" stroke="${col}" stroke-opacity=".32" stroke-width="${w}"/>${edge(b0)}${edge(b1)}`}
function gauge(v,col,label,sub,link,unit='%',big,zone){return `<${link?'button':'div'} class="gauge${big?' big':''}"${link?` data-go="${link}"`:''}>${gaugeSVG(v,col,unit,100,label+'|'+S.day+(big?'|b':''),zone)}<b>${label}</b><span>${sub||''}</span></${link?'button':'div'}>`}
const zbar=z=>{const t=(z||[]).reduce((a,b)=>a+b,0);return t?`<div class="zb">${z.map((m,i)=>m?`<i style="width:${m/t*100}%;background:${ZC[i]}"></i>`:'').join('')}</div>`:''};
const zleg=z=>`<div class="zl">${(z||[]).map((m,i)=>m?`<span><i style="--c:${ZC[i]}"></i>Z${i+1} ${m} min</span>`:'').join('')}</div>`;

/* ---------- la voix d'Arden : titre du jour, plan, ciel ---------- */
/* Dépense : minutes d'effort modéré (≈ 1,5 de charge cardiaque par minute, comme un footing en zone 2) pour entrer dans la zone */
function effGap(d,tg){if(!tg)return null;const need=-110*Math.log(1-tg[0]/100),dl=need-loadOf(d);return dl<=0?0:Math.max(10,Math.round(dl/1.5/5)*5)}
const fmtMin=m=>m>=90?'plus d\'1 h 30':m>=60?`${Math.floor(m/60)} h ${String(m%60).padStart(2,'0')}`:m+' min';
const effSub=(d,ef,tg)=>!tg?'charge du jour':ef!=null&&ef>tg[1]?'au-delà de ta zone':ef!=null&&ef>=tg[0]?'dans ta zone':d===today()?`vise ${tg[0]}–${tg[1]}`:`zone ${tg[0]}–${tg[1]}`;
function bedOf(d){const nd=needOf(addD(d,1)),wa=wakeAvg(d);return wa==null?null:{need:nd.need,wake:wa,bed:wa-nd.need-15}}
/* minutes avant l'heure de coucher conseillée (heure « relative » des données : minuit = 720) */
function bedIn(d){const b=bedOf(d);if(!b||d!==today())return null;const n=new Date(),now=n.getHours()*60+n.getMinutes(),bed=((b.bed+720)%1440+1440)%1440;let m=bed-now;if(m<-240)m+=1440;return m}
/* Le titre du jour : une conclusion en quelques mots, puis une phrase qui dit quoi faire. */
function dayStory(d){const h=H(d),rc=recovery(d),sl=sleepScore(d),ef=effortOf(d),tg=effTarget(rc&&rc.s),isT=d===today(),warn=monitor(d).filter(x=>x.warn),bi=bedIn(d);
 const S1=(t,l,tone)=>({t,l,tone});
 if(!hKeys().length)return S1(isT?'Ta journée commence ici':'Pas de mesure ce jour',IMP('Note ton check-in, tes séances et tes repas. Importe Apple Santé pour que je calcule aussi ta dépense, ton énergie et ton sommeil.','Note ton check-in, tes séances et tes repas. Connecte Apple Santé pour que je calcule aussi ta dépense, ton énergie et ton sommeil.'),'none');
 if(!rc&&!sl){const cb=calib(d);return cb<7&&cb>0?S1('Arden apprend à te connaître',`Encore ${7-cb} nuit${7-cb>1?'s':''} pour établir ta normale ; ton énergie s'affichera ensuite chaque matin.`,'none'):S1(isT?'En attente de ta nuit':'Pas de nuit ce jour',isT?IMP('Réimporte ton export Apple Santé pour obtenir tes scores du jour.','Synchronise Apple Santé pour obtenir tes scores du jour.'):'Aucune mesure de sommeil ni de VFC pour cette date.','none')}
 if(warn.length>=2)return S1('Écoute ton corps',`Plusieurs signaux inhabituels cette nuit (${warn.map(x=>x.l.toLowerCase()).join(', ')}) : journée légère, hydrate-toi et surveille ton ressenti.`,'warn');
 if(bi!=null&&bi<=120&&new Date().getHours()>=18){const b=bedOf(d);return S1(bi<=10?'C\'est l\'heure':'Prépare ta nuit',bi<=10?`Pour tes ${fmtSl(b.need)} de sommeil, c'est maintenant : lumière douce, écrans de côté.`:`Au lit vers ${hhmm(b.bed)}, dans ${fmtSl(bi)}, pour dormir ${fmtSl(b.need)} et te lever à ${hhmm(b.wake)}.`,'eve')}
 if(ef!=null&&tg&&ef>tg[1]+5)return S1('Grosse journée',`Dépense de ${ef}, au-delà de ce que ton énergie conseillait : mise sur un vrai repas et une nuit plus longue.`,'mid');
 if(isT&&ef!=null&&tg&&ef>=tg[0])return S1('Mission accomplie',`Ta dépense (${ef}) est dans ta zone : la suite de la journée, c'est de la récupération.`,'go');
 if(rc){const s=rc.s;
  if(s>=67)return sl&&sl.s>=75?S1('Journée de force','Énergie haute et nuit réparatrice : c\'est le jour pour une séance exigeante.','go'):S1('Pleine énergie','Ton corps a bien récupéré malgré une nuit moyenne : fonce, puis couche-toi tôt.','go');
  if(s>=34)return sl&&sl.s<60?S1('Journée en douceur','Nuit un peu courte : garde une intensité modérée et offre-toi une meilleure nuit ce soir.','mid'):S1('Rythme de croisière','Tes indicateurs sont proches de ta normale : entraîne-toi normalement, sans viser ton maximum.','mid');
  return S1('Journée de récupération','Tes indicateurs sont sous ta normale : marche, mobilité ou repos, et une nuit plus longue ce soir.','low')}
 return sl.s>=80?S1('Belle nuit',`${fmtSl(h.sl)} de sommeil réparateur : ta journée part sur de bonnes bases.`,'go'):sl.s>=60?S1('Nuit correcte',`${fmtSl(h.sl)} de sommeil : une journée normale t'attend.`,'mid'):S1('Nuit courte',`${fmtSl(h.sl)} de sommeil seulement : vas-y doucement et vise une meilleure nuit.`,'low')}
/* Le plan du jour : trois ou quatre lignes, chacune une action concrète. */
const ARC='<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4.1 11.9A5.5 5.5 0 1 1 11.9 11.9"/><circle cx="11.9" cy="11.9" r="1.6"/></svg>';
function planItems(d){const out=[],P=(c,html)=>out.push([c,html]),h=H(d),D=S.days[d]||{},isT=d===today(),hr=new Date().getHours(),rc=recovery(d),ef=effortOf(d),tg=effTarget(rc&&rc.s);
 if(tg){if(ef!=null&&ef>tg[1])P('var(--eff)',`Dépense <b>${ef}</b>, au-delà de ta zone (${tg[0]}–${tg[1]}) : récupère ce soir.`);
  else if(ef!=null&&ef>=tg[0])P('var(--eff)',`Dépense <b>${ef}</b> : tu es dans ta zone (${tg[0]}–${tg[1]}).`);
  else if(isT&&hr>=20)P('var(--eff)',`Dépense de <b>${ef??0}</b> aujourd'hui : trop tard pour une séance, la récupération compte aussi.`);
  else if(isT){const g=effGap(d,tg);P('var(--eff)',`Bouge : vise une dépense de <b>${tg[0]}–${tg[1]}</b>, soit environ <b>${fmtMin(g)}</b> d'effort modéré (footing, vélo, marche rapide).`)}
  else P('var(--eff)',`Dépense de ${ef??0}, sous la zone conseillée (${tg[0]}–${tg[1]}).`)}
 if(rc&&!rc.partial){const low=rc.c.filter(x=>x[1]<45).map(x=>x[0].toLowerCase());if(low.length)P('var(--rec)',`Ce qui freine ton énergie : <b>${low.join(', ')}</b>.`)}
 if(isT||d===hLast()){const b=bedOf(d);if(b)P('var(--slp)',`Ce soir : <b>${fmtSl(b.need)}</b> de sommeil, au lit vers <b>${hhmm(b.bed)}</b>.`)}
 if(has(h.tp)){const tb=base('tp',d);if(tb!=null&&h.tp-tb>=0.5)P('var(--hrt)','<b>Température au poignet en hausse</b> : peut précéder une infection, ou venir de l\'alcool ou d\'une chambre chaude.')}
 if(num(h.stz)>=30)P('var(--str)','<b>Journée stressante</b> : quelques minutes de respiration lente aident ta FC à redescendre. <button type="button" class="pbtn" data-act="breath">Respirer 1 min</button>');
 if(isT&&hr>=13&&hr<21&&out.length<4){const pr=sum(D.items||[],'p'),T=num(S.set.prot);if(T&&(D.items||[]).length&&pr<T*.5)P('var(--nut)',`Protéines : <b>${r0(pr)} g</b> sur ${r0(T)}, pense à en mettre au prochain repas.`)}
 if(!out.length){P('var(--mind)','Fais ton <b>check-in</b> : 20 secondes pour dire comment tu te sens.');P('var(--trn)','Note ta prochaine <b>séance</b> ou ton prochain <b>repas</b>.')}
 return out.slice(0,4)}
const planHTML=items=>items.map(([c,h])=>`<li style="--c:${c}">${ARC}<span>${h}</span></li>`).join('');
/* Action principale du moment, puis les autres en capsules grises. */
function heroActs(d){if(d!==today())return'';const j=J(d),ci=!!(j.mood||j.energy||j.stress||j.sore),T=dayTrain(d),act=T.mu.length+T.sp.length+T.ap.length>0||!!S.cur,hr=new Date().getHours();
 const A={ci:['ciopen','','Faire mon check-in','Check-in'],mu:['msopen','data-m="mu"',S.cur?'Reprendre ma séance':'Noter une séance','Séance'],food:['foodadd',`data-m="${mealNow()}"`,'Ajouter un repas','Repas']};
 const first=!ci?'ci':!act&&hr<21?'mu':'food',rest=['ci','mu','food'].filter(k=>k!==first&&!(k==='ci'&&ci)).slice(0,1);
 const b=(k,pri)=>{const [a,x,l,s]=A[k];return `<button type="button" class="btn${pri?' pri':' small'}" data-act="${a}" ${x}>${pri?l:s}</button>`};
 return b(first,true)+rest.map(k=>b(k,false)).join('')}
/* Ciel vivant : la lumière suit l'heure (aube, jour, crépuscule, nuit) et se teinte selon ton état. */
const TONE={go:'var(--rec)',mid:'var(--str)',low:'var(--trn)',warn:'var(--hrt)',eve:'var(--slp)',none:'var(--eff)'};
function skyFor(v,tone){const hr=new Date().getHours();
 if(v==='aujourdhui'){const [a,b]=hr>=5&&hr<10?['#ffb48c','#ffd9a6']:hr>=10&&hr<17?['#ffe1a1','#bfe7df']:hr>=17&&hr<21?['#f59c8e','#c4a7f3']:['#7183e6','#343d86'];return{a,b,c:TONE[tone]||TONE.none,o:1,night:hr>=21||hr<5}}
 const C={sommeil:'var(--slp)',recuperation:'var(--rec)',effort:'var(--eff)',tendances:'var(--trn)',nutrition:'var(--nut)'}[v];
 return C?{a:C,b:C,c:C,o:.55,night:v==='sommeil'}:{a:'transparent',b:'transparent',c:'transparent',o:0}}
/* Étoiles du ciel de nuit : positions fixes (toujours le même ciel), scintillement décalé */
const STARS=Array.from({length:24},(_,i)=>{const r=n=>((Math.sin(i*12.9898+n*78.233)*43758.5453)%1+1)%1;return`<i style="left:${(r(1)*100).toFixed(1)}%;top:${(4+r(2)*44).toFixed(1)}%;--s:${(1+r(3)*1.8).toFixed(1)}px;animation-delay:${(-r(4)*5).toFixed(2)}s;animation-duration:${(2.6+r(5)*3).toFixed(1)}s"></i>`}).join('');
function paintSky(el,k){if(el.id==='sky'){el.classList.toggle('night',!!k.night);if(k.night&&!el.firstChild)el.innerHTML=`<div class="stars">${STARS}</div>`}el.style.setProperty('--sk1',k.a);el.style.setProperty('--sk2',k.b);el.style.setProperty('--sk3',k.c);el.style.setProperty('--sko',k.o)}

/* ---------- vue commune : jour ---------- */
const VT={sommeil:'Sommeil',recuperation:'Énergie',effort:'Dépense'};
/* Phrase de conclusion de chaque section, sous le grand titre : ce qu'il faut retenir avant les chiffres. */
const SLW={Durée:'un peu courte',Efficacité:'du temps éveillé au lit',Récupératrice:'peu de sommeil profond',Régularité:'un coucher irrégulier',Continuité:'plusieurs réveils'};
function sectionLede(v,d){const h=H(d);
 if(v==='sommeil'){const sl=sleepScore(d);if(!sl)return'';const w=sl.c.filter(c=>c[1]<60).sort((a,b)=>a[1]-b[1]).map(c=>SLW[c[0]]).filter(Boolean);const b=d===today()||d===hLast()?bedOf(d):null;
  return `${sl.s>=80?'Excellente nuit':sl.s>=60?'Nuit correcte':'Nuit insuffisante'} : ${fmtSl(h.sl)} de sommeil${w.length?`, avec ${w.slice(0,2).join(' et ')}`:sl.s>=80?', profonde et régulière':''}.${b?` Ce soir, au lit vers ${hhmm(b.bed)}.`:''}`}
 if(v==='recuperation'){const rc=recovery(d);if(!rc)return'';const [l]=recLab(rc.s),low=rc.c.filter(x=>x[1]<45).map(x=>x[0].toLowerCase());
  return `Énergie ${l.toLowerCase()} (${rc.s} %) : ${rc.s>=67?'ton corps a bien récupéré, tu peux pousser.':rc.s>=34?'proche de ta normale, entraîne-toi sans viser ton maximum.':'sous ta normale, privilégie le repos ou une activité légère.'}${low.length?` Ce qui freine : ${low.join(', ')}.`:''}`}
 if(v==='effort'){const rc=recovery(d),ef=effortOf(d),tg=effTarget(rc&&rc.s);if(ef==null&&!tg)return'';
  if(!tg)return `Dépense de ${ef} aujourd'hui.`;const e=ef??0;
  return e>tg[1]?`Dépense de ${e}, au-delà de la zone conseillée (${tg[0]}–${tg[1]}) : récupère ce soir.`:e>=tg[0]?`Dépense de ${e}, dans ta zone conseillée (${tg[0]}–${tg[1]}). Bien joué.`:d===today()?`Dépense de ${e} pour une zone de ${tg[0]}–${tg[1]} : encore environ ${fmtMin(effGap(d,tg))} d'effort modéré pour l'atteindre.`:`Dépense de ${e}, sous la zone conseillée (${tg[0]}–${tg[1]}).`}
 return''}
let story=null;
function renderDayNav(){const d=S.day,v0=cur(),rel=d===today()?"Aujourd'hui":d===addD(today(),-1)?'Hier':'',dayv=['aujourdhui','sommeil','recuperation','effort'].includes(v0);
 story=dayStory(d);
 if(VT[v0]){$('#dtitle').textContent=VT[v0];$('#dsub').textContent=rel||dLong(d)}
 else{$('#dtitle').textContent=story.t;$('#dsub').textContent=rel?`${rel} · ${dLong(d)}`:dLong(d)}
 $('#dlede').innerHTML=!dayv?'':v0==='aujourdhui'?esc(story.l):esc(sectionLede(v0,d));
 $('[data-act=dnext]').disabled=d>=today();
 $('#appbar').hidden=!dayv;$('#abback').hidden=v0!=='recuperation';if(dayv){$('#abrel').textContent=rel||new Date(d+'T12:00').toLocaleDateString('fr-FR',{weekday:'long'});$('#abday').textContent=new Date(d+'T12:00').toLocaleDateString('fr-FR',{day:'numeric',month:'short'});
  const L0=hLast(),age=L0?Math.round((new Date(today()+'T12:00')-new Date(L0+'T12:00'))/864e5):null;$('#abdot').className=age==null?'':age<=1?'ok':'old';
  $('.abdate').setAttribute('aria-expanded',String(!S.set.wkc));$('#wk').classList.toggle('cl',!!S.set.wkc)}
 document.documentElement.classList.toggle('dayv',dayv);$('#dback').hidden=v0!=='recuperation';
 paintSky($('#sky'),skyFor(v0,story.tone));
 const L=hLast();
 $('#dn').hidden=!dayv;$('#wk').hidden=$('#dn').hidden;if(!$('#wk').hidden)renderWeek(v0);
 $('#dnote').innerHTML=!dayv?'':(!L?emptyHTML(v0):d>L?`<div class="notice">Données Apple jusqu'au ${dShort(L)}. ${IMP('Réimporte ton export','Synchronise Apple Santé')} pour mettre à jour, ou <button class="btn small" data-act="dlast">voir le ${dShort(L)}</button></div>`:'')
}

/* ---------- frise de la semaine : mini-barres par jour (trois sur le résumé, une sur chaque thème) ---------- */
function barsSVG(bars){const sz=34,n=bars.length,w=n>1?5.5:9,gap=n>1?3.5:0,x0=(sz-(n*w+(n-1)*gap))/2,top=3,H=28,id='rw'+(++ringN);
 return `<svg viewBox="0 0 ${sz} ${sz}" aria-hidden="true">${bars.map(([v,col],i)=>{const p=v==null?0:clamp(v/100,0,1),x=x0+i*(w+gap),h=p>0?Math.max(w,p*H):0,g=id+'g'+i;
  return `<rect x="${x}" y="${top}" width="${w}" height="${H}" rx="${w/2}" fill="${col}" fill-opacity=".16"/>${h?`<linearGradient id="${g}" x1="0" y1="1" x2="0" y2="0"><stop offset="0" style="stop-color:color-mix(in oklab, ${col} 82%, #000)"/><stop offset="1" style="stop-color:color-mix(in oklab, ${col} 70%, #fff)"/></linearGradient><rect x="${x}" y="${(top+H-h).toFixed(2)}" width="${w}" height="${h.toFixed(2)}" rx="${w/2}" fill="url(#${g})"/>`:''}`}).join('')}</svg>`}
function renderWeek(v){const d=S.day,t=today(),wd=(new Date(d+'T12:00').getDay()+6)%7,mon=addD(d,-wd),L='LMMJVSD';
 const val=(f,x)=>{try{const r=f(x);return r==null?null:typeof r==='object'?r.s:r}catch(e){return null}};
 $('#wk').innerHTML=[0,1,2,3,4,5,6].map(i=>{const x=addD(mon,i),fut=x>t;
  const rings=fut?[]:v==='sommeil'?[[val(sleepScore,x),'var(--slp)']]:v==='recuperation'?[[val(recovery,x),'var(--rec)']]:v==='effort'?[[val(effortOf,x),'var(--eff)']]:[[val(effortOf,x),'var(--eff)'],[val(recovery,x),'var(--rec)'],[val(sleepScore,x),'var(--slp)']];
  return `<button type="button" class="wd${x===d?' on':''}${x===t?' tod':''}" data-act="dpick" data-d="${x}"${fut?' disabled':''} aria-label="${esc(dLong(x))}"><span>${L[i]}</span>${fut?'<i class="ph"></i>':barsSVG(rings)}<b>${+x.slice(8)}</b></button>`}).join('')}

/* ---------- état d'attente quand il n'y a pas encore de données Apple Santé ---------- */
const EMPTY={
 aujourdhui:['var(--eff)','<path style="fill:none" d="M6.3 17.7A8 8 0 1 1 17.7 17.7"/><path style="fill:none" d="M9.2 14.8A4 4 0 1 1 14.8 14.8"/>','Ajoute tes données Santé','Chaque matin, Arden calcule ta dépense, ton énergie et ton sommeil à partir des mesures de ton Apple Watch, puis te dit quoi en faire.'],
 sommeil:['var(--slp)','<path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5z"/>','Pas encore de nuits','Ton score de sommeil, tes phases et ton besoin de sommeil viennent des nuits enregistrées par ta montre.'],
 recuperation:['var(--rec)','<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>','Pas encore d\'énergie','L\'énergie compare chaque nuit ta VFC et ta FC au repos à ta propre normale. Il faut une semaine de nuits pour l\'établir.'],
 tendances:['var(--trn)','<path d="M4 4v16h16M8 15l4-4 3 3 5-6"/>','Pas encore de tendances','Ton bilan santé, ta semaine et ce que révèlent tes données apparaissent après quelques semaines de mesures. Tu peux déjà noter ton poids et tes mensurations.'],
 effort:['var(--eff)','<path d="M12 2.5c.8 3.8 5.5 5.6 5.5 11a5.5 5.5 0 0 1-11 0c0-2.8 1.6-4.2 2.4-6 .9 1.3 1.8 1.9 2.9 2.2-.3-2.5-.6-4.6.2-7.2z"/>','Pas encore de fréquence cardiaque','La dépense du jour, les zones cardiaques et la charge d\'entraînement viennent de ta FC. Tu peux déjà noter tes séances à la main.'],
};
function emptyHTML(v){const [c,ic,t,p]=EMPTY[v];
 return `<div class="emptyv" style="--c:${c}"><i><svg viewBox="0 0 24 24">${ic}</svg></i><h3>${t}</h3><p>${p}</p><div class="row">${HKN?'<button type="button" class="btn pri" data-act="hkauth">Connecter Apple Santé</button>':'<button type="button" class="btn pri" data-act="psub" data-s="apple">Importer Apple Santé</button>'}<button type="button" class="btn" data-act="demoTry">Essayer avec la démo</button></div></div>`}

/* ---------- calories brûlées : métabolisme de base + calories actives ---------- */
/* Métabolisme de base par la formule de Mifflin-St Jeor (la plus fiable chez l'adulte selon les études
   comparatives) : poids moyen des 7 dernières pesées, taille, âge, sexe. Sans profil complet, on se rabat
   sur l'énergie au repos d'Apple Santé. */
function bmrInfo(){const W=weights(),wk=Object.keys(W).sort(),wt=wk.length?wAvg(W,wk[wk.length-1]):null,ht=num(S.set.height),a=ageOf(),sx=S.set.sex;
 if(!wt||!(ht>100)||a==null)return{miss:[!wt&&'ton poids',!(ht>100)&&'ta taille',a==null&&'ton année de naissance'].filter(Boolean)};
 const b=10*wt+6.25*ht-5*a;return{v:Math.round(sx==='h'?b+5:sx==='f'?b-161:b-78),wt,ht,a,sx}}
function burnOf(d){const h=H(d),b=bmrInfo(),t=today(),now=new Date(),fr=d===t?(now.getHours()*60+now.getMinutes())/1440:d>t?0:1;
 const basal=b.v?b.v*fr:has(h.bs)?num(h.bs):null,active=num(h.ac);
 if(basal==null&&!active)return null;return{basal:basal||0,active,total:(basal||0)+active,src:b.v?'calc':'apple',fr,b}}
function burnTile(d,tile){const x=burnOf(d),isT=d===today(),hm2=new Date().toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'});
 if(!x)return tile('var(--eff)','Calories brûlées','–',hKeys().length?'renseigne ton poids, ta taille et ton âge':'métabolisme de base + calories actives','','burn');
 const bar=`<div class="burnbar"><i style="flex:${Math.max(1,x.basal)}"></i><i class="ac" style="flex:${Math.max(0,x.active)}"></i></div><div class="burnlg"><span><i></i>${r0(x.basal)} kcal de base</span><span><i class="ac"></i>${r0(x.active)} kcal actives</span></div>`;
 return tile('var(--eff)','Calories brûlées',`${r0(x.total)}<small> kcal</small>`,isT?`depuis minuit, à ${hm2}`:'sur la journée',bar,'burn')}

/* le total avance au fil de la journée : rafraîchi chaque minute sur Aujourd'hui */
setInterval(()=>{if(cur()==='aujourdhui'&&S.day===today()&&!msKind&&document.visibilityState==='visible'&&!document.activeElement?.closest?.('input,textarea,select'))renderView('aujourdhui')},60000);

function upNextHTML(){const up=S.med.filter(m=>(m.date>=today()&&m.date<=addD(today(),14))||(m.next&&m.next>=today()&&m.next<=addD(today(),14)));
 return S.day===today()&&up.length?`<button type="button" class="upnext" data-act="psub" data-s="dossier"><i><svg viewBox="0 0 24 24"><rect x="4" y="5" width="16" height="15" rx="3"/><path d="M8 3v4M16 3v4M4 10h16"/></svg></i><span>${up.map(m=>{const x=m.date>=today()?m.date:m.next,n=Math.round((new Date(x+'T12:00')-new Date(today()+'T12:00'))/864e5);return `<b>${esc(m.title)}</b> ${n===0?"aujourd'hui":n===1?'demain':'dans '+n+' jours'}`}).join('<br>')}</span><em>›</em></button>`:''}

/* ---------- Résumé façon appli : bilan, moniteur en tuiles, chronologie ---------- */
/* Bilan du jour : dépensé (base + actif) et mangé sur la même échelle, l'écart en grand. */
function balHTML(d){const x=burnOf(d),it=(S.days[d]||{}).items||[],ate=it.reduce((a,y)=>a+kcalOf(y),0),goal=num(S.set.kcal);
 if(!x&&!it.length)return'';const burn=x?x.total:0,mx=Math.max(burn,ate,goal||0,1),W=v=>clamp(v/mx*100,0,100).toFixed(1)+'%',dl=Math.round(ate-burn);
 const lab=!x?'calories mangées':Math.abs(dl)<100?'à l\'équilibre':dl<0?'de déficit, pour l\'instant':'de surplus';
 return `<div class="panel balc"><div class="balh"><b>${x?(dl>0?'+':dl<0?'−':'')+r0(Math.abs(x?dl:ate)):r0(ate)}<small> kcal</small></b><span>${lab}</span></div>
 <button type="button" class="balr" data-act="metric" data-k="burn" style="--c:var(--eff)"><span class="bl"><i><svg viewBox="0 0 24 24"><path d="M12 2.5c.8 3.8 5.5 5.6 5.5 11a5.5 5.5 0 0 1-11 0c0-2.8 1.6-4.2 2.4-6 .9 1.3 1.8 1.9 2.9 2.2-.3-2.5-.6-4.6.2-7.2z"/></svg></i>Dépensé</span><span class="bt"><i class="b0" style="width:${W(x?x.basal:0)}"></i><i class="b1" style="width:${W(x?x.active:0)}"></i></span><em>${x?r0(burn):'–'}</em></button>
 <button type="button" class="balr" data-act="metric" data-k="nut" style="--c:var(--nut)"><span class="bl"><i><svg viewBox="0 0 24 24"><path d="M4 11h16a8 8 0 0 1-16 0zM9 7c0-2 1.5-3 3-3s3 1 3 3"/></svg></i>Mangé</span><span class="bt"><i class="b1" style="width:${W(ate)}"></i>${goal?`<u style="left:${W(goal)}"></u>`:''}</span><em>${r0(ate)}</em></button>
 <p class="balf">${x?`${r0(x.basal)} de base · ${r0(x.active)} actives`:'renseigne ton profil pour la dépense'}${goal?` · objectif ${r0(goal)}`:''}</p></div>`}
/* Mini-arc d'Arden pour une mesure : piste, plage normale en couleur, point-curseur sur la valeur. */
function miniArc(p,lo,hi,col){const r=13,c=18,P=t=>{const a=GA0+GSPAN*clamp(t,0,1);return [c+r*Math.cos(a),c+r*Math.sin(a)]},[x,y]=P(p);
 return `<svg class="ma" viewBox="0 0 36 36" aria-hidden="true"><path d="${arcPath(c,c,r,GA0,GA0+GSPAN)}" class="mat"/><path d="${arcPath(c,c,r,GA0+GSPAN*clamp(lo,0,1),GA0+GSPAN*clamp(hi,0,1))}" class="man" style="stroke:${col}"/><circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="3.6" class="mad" style="stroke:${col}"/></svg>`}
const VIT={rhr:['FC repos','<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/>','metric'],hrv:['VFC','<path d="M3 12h4l2-5 3 10 2-5h7"/>','metric'],rr:['Respiration','<path d="M12 4v7M12 11c-2 0-3 1.5-4.5 4S5 20 4 19.5 3.2 14 5 10c1-2.3 2.6-3 3.5-3M12 11c2 0 3 1.5 4.5 4S19 20 20 19.5s.8-5.5-1-9.5c-1-2.3-2.6-3-3.5-3"/>'],o2:['SpO₂','<path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z"/>'],tp:['Température','<path d="M14 14.8V5a2 2 0 0 0-4 0v9.8a4 4 0 1 0 4 0z"/>'],nmin:['FC nocturne','<path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5z"/>']};
const VST=x=>x.lab==='Dans ta normale'?['Normal','ok']:x.lab.startsWith('Plus haut')?['Plus haut','up']:x.lab.startsWith('Plus bas')?['Plus bas','dn']:[x.lab==='Inhabituel'?'Inhabituel':'Très inhabituel','warn'];
const VIC={ok:'<path d="M7.5 12.5l3 3 6-6.5"/>',up:'<path d="M12 17V7M7.5 11.5 12 7l4.5 4.5"/>',dn:'<path d="M12 7v10M7.5 12.5 12 17l4.5-4.5"/>',warn:'<path d="M12 7v6M12 16.6v.1"/>'};
function vitalsHTML(d){const h=H(d),mo=monitor(d),by=Object.fromEntries(mo.map(x=>[x.k,x])),out=[];
 const cell=(k,lab,ic,val,unit,st,arc,tap)=>`<button type="button" class="vit" ${tap}><span class="vk"><svg viewBox="0 0 24 24">${ic}</svg>${lab}</span><span class="vv">${val}<small>${unit}</small></span>${st?`<span class="vs ${st[1]}"><svg viewBox="0 0 24 24">${VIC[st[1]]}</svg>${st[0]}</span>`:'<span class="vs na">pas de normale</span>'}${arc}</button>`;
 for(const k of ['rhr','hrv','rr','o2','tp','nmin']){if(out.length>=5)break;const x=by[k],[lab,ic,how]=VIT[k];
  const raw=x?x.v:k==='hrv'?nhrv(d):k==='tp'?null:num(h[k])||null;if(raw==null)continue;
  const val=k==='tp'?sg(Math.round((raw-x.m)*10)/10).replace('.',','):k==='rr'||k==='o2'?fx(raw):r0(raw),unit=k==='tp'?' °C':k==='rr'?' /min':k==='o2'?' %':' '+(x?x.u:k==='hrv'?'ms':'bpm');
  const arc=x?miniArc((x.v-(x.m-3*x.sd))/(6*x.sd),.25,.75,x.col):'';
  out.push(cell(k,lab,ic,val,unit,x&&VST(x),arc,how?`data-act="metric" data-k="${k}"`:'data-go="recuperation"'))}
 if(has(h.stz)){const st=num(h.stz),sv=st<20?['Faible','ok']:st<35?['Élevé','up']:['Très élevé','warn'];
  out.push(cell('stz','Stress','<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>',r0(st),' /100',sv,miniArc(st/60,0,20/60,st<20?'var(--rec)':st<35?'var(--str)':'var(--bad)'),'data-act="metric" data-k="stz"'))}
 if(!out.length)return'';
 const bad=mo.filter(x=>x.warn);
 return `<p class="vd vitd">${!mo.length?'Encore quelques nuits pour établir ta normale.':bad.length?`${bad.length} ${bad.length>1?'signaux inhabituels':'signal inhabituel'} cette nuit : ${bad.map(x=>(VIT[x.k]||[x.l])[0].toLowerCase()).join(', ')}.`:'Tout est dans ta normale cette nuit.'}</p>${out.join('')}`}
/* Chronologie : ce qui s'est passé dans la journée, du plus récent au plus ancien. */
const MEALT={'Petit-déjeuner':480,'Déjeuner':750,'Collation':990,'Dîner':1200};
const MEALI={'Petit-déjeuner':'<path d="M5 10h11v4a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5zM16 11h1.5a2.5 2.5 0 0 1 0 5H16M9 4c-.6 1 .6 2 0 3M12.5 4c-.6 1 .6 2 0 3"/>','Collation':'<path d="M12 7c-3-2.5-7-.5-7 4 0 4 3 9 5 9 1 0 1.3-.5 2-.5s1 .5 2 .5c2 0 5-5 5-9 0-4.5-4-6.5-7-4zM12 7c0-2 1-3.5 3-4"/>'};
function chronoHTML(d){const h=H(d),T=dayTrain(d),D=S.days[d]||{},it=D.items||[],E=[],j=J(d);
 const ev=(t,lab,c,ic,ti,meta,attr,extra='')=>E.push({t,html:`<button type="button" class="ev" style="--c:${c}" ${attr}><i class="evi"><svg viewBox="0 0 24 24">${ic}</svg></i><span class="evb"><small>${lab}</small><b>${ti}</b>${meta?`<span class="evm">${meta}</span>`:''}${extra}</span><em aria-hidden="true">›</em></button>`});
 const tr=w=>w&&w.tr?`<span><b style="color:var(--eff)">${r0(100*(1-Math.exp(-w.tr/110)))}</b> dépense</span>`:'';
 if(has(h.sw)&&h.sl)ev(h.sw+720,`${has(h.sb)?hhmm(h.sb)+' – ':''}${hhmm(h.sw)}`,'var(--slp)','<path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5z"/>','Nuit',`<span>${fmtSl(h.sl)}</span>${sleepScore(d)?`<span><b style="color:var(--slp)">${sleepScore(d).s}</b> sommeil</span>`:''}`,'data-go="sommeil"');
 for(const x of D.br||[]){const m=/^(\d+):(\d+)/.exec(x.at||'');ev(m?+m[1]*60+ +m[2]:600,x.at||'Respiration','var(--rec)','<path d="M6.3 17.7A8 8 0 1 1 17.7 17.7"/><path d="M9.2 14.8A4 4 0 1 1 14.8 14.8"/>','Respiration guidée',`<span>${x.min} min</span>`,'data-act="breath"')}
 for(const w of T.ap)ev(has(w.st)?w.st:900,has(w.st)?hm(w.st):'Montre',isStr(w)?'var(--trn)':'var(--eff)',isStr(w)?IC.lift:IC.run,esc(WT[w.ty]||w.ty),`<span>${esc(w.min)} min</span>${w.km?`<span>${fx(w.km)} km</span>`:''}${w.hr?`<span>${esc(w.hr)} bpm</span>`:''}${tr(w)}`,'data-go="effort"',zbar(w.z));
 for(const s of T.mu){const w=T.att.filter(isStr)[0],vol=(s.ex||[]).reduce((a,x)=>a+x.sets.reduce((b,y)=>b+num(y.w)*num(y.r),0),0);
  ev(w&&has(w.st)?w.st:s.t?new Date(s.t).getHours()*60+new Date(s.t).getMinutes():1080,w&&has(w.st)?hm(w.st):'Séance','var(--trn)',IC.lift,esc(s.name),`<span>${(s.ex||[]).length} exercices</span>${vol?`<span>${fx(vol/1000)} t</span>`:''}${s.dur?`<span>${esc(s.dur)} min</span>`:''}${tr(w)}`,'data-go="effort"',w?zbar(w.z):'')}
 for(const s of T.sp){const w=T.att.find(x=>(WT[x.ty]||'')===s.type);
  ev(w&&has(w.st)?w.st:1020,w&&has(w.st)?hm(w.st):'Sport','var(--eff)',IC.run,esc(s.type),`<span>${esc(s.min)} min</span>${s.km?`<span>${fx(s.km)} km</span>`:''}${tr(w)}`,'data-go="effort"',w?zbar(w.z):'')}
 const meals={};for(const x of it)(meals[x.m||'Repas']=meals[x.m||'Repas']||[]).push(x);
 for(const [m,L] of Object.entries(meals)){const k=L.reduce((a,x)=>a+kcalOf(x),0),p=L.reduce((a,x)=>a+num(x.p),0);
  ev(MEALT[m]??1100,esc(m),'var(--nut)',MEALI[m]||'<path d="M4 11h16a8 8 0 0 1-16 0zM9 7c0-2 1.5-3 3-3s3 1 3 3"/>',esc(L.length>2?L.slice(0,2).map(x=>x.n).join(', ')+'…':L.map(x=>x.n).join(', ')),`<span>${r0(k)} kcal</span><span>${r0(p)} g prot.</span>`,`data-act="foodadd" data-m="${esc(m)}"`)}
 if(j.mood||j.energy||j.stress||j.sore){const sc=['','Très bas','Bas','Moyen','Bien','Très bien'];ev(-1,'Ressenti','var(--mind)','<circle cx="12" cy="12" r="8.5"/><path d="M8.7 14s1.2 1.8 3.3 1.8 3.3-1.8 3.3-1.8M9.2 10h.01M14.8 10h.01"/>','Check-in',[j.mood&&`<span>humeur ${sc[j.mood]?.toLowerCase()||j.mood}</span>`,j.energy&&`<span>énergie ${j.energy}/5</span>`].filter(Boolean).join(''),'data-act="ciopen"')}
 E.sort((a,b)=>b.t-a.t);
 $('#chrn').textContent=E.length?`${E.length} événement${E.length>1?'s':''}`:'';
 return E.length?E.map(e=>e.html).join(''):`<div class="evempty"><p>Rien de noté pour l'instant.</p><button type="button" class="btn small" data-act="sheet">Noter quelque chose</button></div>`}

/* ---------- aujourd'hui ---------- */
const waterLv={};
function renderToday(){const d=S.day,h=H(d),D=S.days[d]||{},it=D.items||[],T=dayTrain(d),set=S.set;
 const rc=recovery(d),sl=sleepScore(d),ef=effortOf(d),tg=effTarget(rc&&rc.s);
 $('#g3').innerHTML=gauge(tg&&ef==null?0:ef,'var(--eff)','Dépense',effSub(d,ef,tg),'effort','/100',false,tg)+gauge(rc&&rc.s,'var(--rec)','Énergie',rc?recLab(rc.s)[0]:(calib(d)<7&&hKeys().length?`calibrage ${calib(d)}/7 nuits`:'en attente de données'),'recuperation')+gauge(sl&&sl.s,'var(--slp)','Sommeil',h.sl?fmtSl(h.sl):'pas de nuit','sommeil','/100');
 $('#plan').innerHTML=planHTML(planItems(d));$('#heroact').innerHTML=heroActs(d);
 $('#ritual').innerHTML=ritualHTML(d);
 if(d===today()&&tg&&ef!=null&&ef>=tg[0]&&ef<=tg[1]&&S.set.zoneDay!==d&&hKeys().length){S.set.zoneDay=d;put.set();setTimeout(()=>celebrate('Dans ta zone',`Dépense de ${ef} : l'objectif du jour est atteint.`),600)}
 const st=num(h.stz),wat=num(D.w)||num(h.wa),vb=nhrvBase(d);
 const tile=(c,k,v,s,extra='',mk='')=>`<div class="tile${mk?' tap':''}${mk==='burn'?' wide':''}" style="--c:${c}"${mk?` data-act="metric" data-k="${mk}" role="button" tabindex="0" aria-label="${esc(k)} : voir le détail"`:''}><span class="k"><i></i>${k}</span><span class="v">${v}</span><span class="s">${s}</span>${extra}</div>`;
 $('#tiles').innerHTML=[
  burnTile(d,tile),
  tile('var(--eff)','Activité',h.st?`${r0(h.st)}<small> pas</small>`:'–',[h.ex?h.ex+' min d\'exercice':'',h.km?fx(h.km)+' km':''].filter(Boolean).join(' · ')||(h.ac?r0(h.ac)+' kcal actives':''),'','st'),
  tile('var(--hrt)','FC au repos',h.rhr?`${h.rhr}<small> bpm</small>`:'–',h.nmin?`min. nocturne ${h.nmin} bpm`:'','','rhr'),
  tile('var(--mind)','VFC nocturne',nhrv(d)?`${r0(nhrv(d))}<small> ms</small>`:'–',nhrv(d)&&vb?`normale ${r0(vb.m)} ms`:'pendant ton sommeil','','hrv'),
  tile('var(--str)','Stress estimé',has(h.stz)?`${st}<small> / 100</small>`:'–',has(h.stz)?stressLab(st):hKeys().length?(d===today()?'calculé au fil de la journée':'pas de mesure ce jour'):IMP('après import Apple','après synchro Apple Santé'),'','stz'),
  tile('var(--nut)','Nutrition',`${r0(it.reduce((a,x)=>a+kcalOf(x),0))}<small> kcal</small>`,`${r0(sum(it,'p'))} g de protéines sur ${r0(set.prot)}`,'','nut'),
  tile('var(--wat)','Hydratation',`${fx(wat/1000)}<small> / ${fx(num(set.water)/1000)} L</small>`,'',`<i class="wave" aria-hidden="true" style="--lv:${waterLv[d]??Math.min(100,wat/num(set.water)*100)}%"><svg viewBox="0 0 120 10" preserveAspectRatio="none"><path d="M0 5Q15 0 30 5T60 5T90 5T120 5V10H0z"/></svg></i><div class="row"><button class="btn small" data-act="water" data-v="250">+25 cl</button><button class="btn small" data-act="water" data-v="500">+50 cl</button></div>`,'wat')
 ].join('');
 {const lv=Math.min(100,wat/num(set.water)*100),w=$('#tiles .wave');if(w&&waterLv[d]!==lv){requestAnimationFrame(()=>requestAnimationFrame(()=>{w.style.setProperty('--lv',lv+'%')}))}waterLv[d]=lv}
 const x=X(d);const sleep=[];if(has(h.sw))sleep.push([0,(h.sw+720)%1440]);const hn=H(addD(d,1));if(has(hn.sb)){const m=(hn.sb+720)%1440;if(m>600)sleep.push([m,1440])}
 const wk=(h.wk||[]).filter(w=>has(w.st)).map(w=>[w.st,w.st+num(w.min)]);
 setFig('#fday',{type:'day',h:x&&x.h,sleep,wk,stress:x&&x.sh});
 const hs=x&&x.h?x.h.filter(Boolean):[];$('#daysum').textContent=hs.length?`FC ${Math.min(...hs)}–${Math.max(...hs)} bpm${h.hr?' · moyenne '+r0(h.hr):''}`:'';
 $('#acts').innerHTML=actsHTML(d,T)||`<div class="emptyst"><p>Aucune activité ce jour</p><button type="button" class="btn small" data-act="msopen" data-m="mu">Noter une séance</button></div>`;
 const mo=monitor(d),bad=mo.filter(x=>x.warn);
 $('#monmini').innerHTML=mo.length?`<div class="mm" data-go="recuperation"><div><div class="eyebrow">Moniteur de santé</div><b style="font-size:1.0625rem">${bad.length?`${bad.length} ${bad.length>1?'signaux':'signal'} inhabituel${bad.length>1?'s':''} : ${bad.map(x=>x.l).join(', ')}`:'Tous tes signes vitaux sont dans ta normale'}</b></div><div class="dots" style="margin-left:auto">${mo.map(x=>`<i style="--c:${x.col}" data-tip="${esc(x.l+' : '+monFmt(x,x.v)+'\n'+x.lab)}"></i>`).join('')}</div></div>`:'<div class="eyebrow">Moniteur de santé</div><p class="mute small" style="margin:4px 0 0">Il faut au moins 7 nuits importées pour établir ta normale.</p>';
 $('#upn').innerHTML=upNextHTML();
 $('#bal').innerHTML=balHTML(d);$('#vitals').innerHTML=vitalsHTML(d);$('#sh-vit').hidden=!$('#vitals').innerHTML;$('#sh-bal').hidden=false;
 $('#chrono').innerHTML=chronoHTML(d);
 renderCheckin()}
function coach(d,rc,sl,ef,tg){const h=H(d),out=[];
 if(rc&&!rc.partial){const [l]=recLab(rc.s);out.push(`<b>Énergie ${l.toLowerCase()} (${rc.s} %).</b> `+(rc.s>=67?'Tes indicateurs (VFC, FC de repos, sommeil) sont au niveau ou au-dessus de ta normale : bon jour pour une séance exigeante.':rc.s>=34?'Tes indicateurs sont proches de ta normale : entraîne-toi normalement, sans forcément viser ton maximum.':'Tes indicateurs sont sous ta normale : privilégie une activité légère ou le repos, et dors davantage ce soir.'));
  const low=rc.c.filter(x=>x[1]<45).map(x=>x[0]);if(low.length)out.push(`Ce qui tire vers le bas : ${low.join(', ')}.`)}
 if(tg)out.push(`Dépense conseillée : <b>${tg[0]} à ${tg[1]}</b>${ef!=null?` (actuel : ${ef})`:''}.`);
 if(d===today()||d===hLast()){const nd=needOf(addD(d,1)),wa=wakeAvg(d);if(wa!=null)out.push(`Ce soir, vise <b>${fmtSl(nd.need)}</b> de sommeil : couche-toi vers <b>${hhmm(wa-nd.need-15)}</b> pour te lever à ${hhmm(wa)}.`)}
 if(has(h.tp)){const tb=base('tp',d);if(tb!=null&&h.tp-tb>=0.5)out.push('<b>Température au poignet plus élevée que d\'habitude</b> : cela peut précéder une infection, mais aussi venir de l\'alcool, d\'une chambre chaude ou, chez la femme, de la seconde moitié du cycle.')}
 if(num(h.stz)>=30)out.push('Ta FC est restée élevée au repos une bonne partie de la journée (stress, caféine, chaleur, digestion…). Quelques minutes de respiration lente, environ 6 cycles par minute, aident à la faire redescendre.');
 return out.join(' ')||''+IMP('Importe tes données Apple Santé et remplis ton check-in','Connecte Apple Santé et remplis ton check-in')+' : le coach interprétera ici ton énergie, ta dépense et ton besoin de sommeil.'}
function actsHTML(d,T){T=T||dayTrain(d);const L=[];
 for(const x of (S.days[d]||{}).br||[])L.push(`<div class="act" style="--c:var(--rec)"><div class="ic">${ARC}</div><div><div class="t">Respiration guidée</div><div class="m">${x.min} min · ${esc(x.at||'')}</div></div><div class="e"></div></div>`);
 for(const s of T.mu){const w=T.att.filter(isStr)[0];L.push(`<div class="act" style="--c:var(--trn)"><div class="ic"><svg viewBox="0 0 24 24">${IC.lift}</svg></div><div><div class="t">${esc(s.name)}</div><div class="m">${(s.ex||[]).length} exercices · ${fx((s.ex||[]).reduce((a,x)=>a+x.sets.reduce((b,y)=>b+num(y.w)*num(y.r),0),0)/1000)} t${s.dur?' · '+esc(s.dur)+' min':''}${w&&w.hr?' · '+w.hr+' bpm moy.':''}${w&&w.kcal?' · '+w.kcal+' kcal':''}</div>${w?zbar(w.z)+zleg(w.z):''}</div><div class="e">${w&&w.tr?r0(100*(1-Math.exp(-w.tr/110))):''}<small>${w&&w.tr?'dépense':''}</small></div></div>`)}
 for(const s of T.sp){const w=T.att.find(x=>(WT[x.ty]||'')===s.type);L.push(`<div class="act" style="--c:var(--eff)"><div class="ic"><svg viewBox="0 0 24 24">${IC.run}</svg></div><div><div class="t">${esc(s.type)}</div><div class="m">${esc(s.min)} min${s.km?' · '+fx(s.km)+' km':''}${s.rpe?' · ressenti '+esc(s.rpe)+'/10':''}${w&&w.hr?' · '+w.hr+' bpm moy.':''}</div>${w?zbar(w.z)+zleg(w.z):''}</div><div class="e">${w&&w.tr?r0(100*(1-Math.exp(-w.tr/110))):''}<small>${w&&w.tr?'dépense':''}</small></div></div>`)}
 for(const w of T.ap)L.push(`<div class="act" style="--c:${isStr(w)?'var(--trn)':'var(--eff)'}"><div class="ic"><svg viewBox="0 0 24 24">${isStr(w)?IC.lift:IC.run}</svg></div><div><div class="t">${esc(WT[w.ty]||w.ty)} <span class="mute small">· montre${has(w.st)?' · '+hm(w.st):''}</span></div><div class="m">${esc(w.min)} min${w.km?' · '+fx(w.km)+' km':''}${w.kcal?' · '+esc(w.kcal)+' kcal':''}${w.hr?' · '+esc(w.hr)+' bpm moy.':''}${w.mx?' · max '+esc(w.mx):''}</div>${zbar(w.z)}${zleg(w.z)}</div><div class="e">${w.tr?r0(100*(1-Math.exp(-w.tr/110))):''}<small>${w.tr?'dépense':''}</small></div></div>`);
 return L.join('')}
const SCC={mood:'var(--mind)',energy:'var(--nut)',stress:'var(--bad)',sore:'var(--eff)'};
function renderCheckin(){const d=S.day,j=J(d),done=!!(j.mood||j.energy||j.stress||j.sore||(j.tags||[]).length||j.note);
 $('#checkin').innerHTML=`<div class="ph"><h2>Comment tu te sens ?</h2>${done?'<span class="mute small">Enregistré</span>':''}</div>`+(done?
  `<div class="cisum">${SCALES.filter(([k])=>j[k]).map(([k,l])=>`<div class="cis"><span>${l}</span><i style="--c:${SCC[k]}">${[1,2,3,4,5].map(v=>`<b class="${v<=j[k]?'on':''}"></b>`).join('')}</i><em>${j[k]}/5</em></div>`).join('')}</div>${(j.tags||[]).length?`<div class="chips cit">${j.tags.map(t=>`<span class="chip on">${esc(t)}</span>`).join('')}</div>`:''}${j.note?`<p class="cinote">${esc(j.note)}</p>`:''}<div class="row"><button type="button" class="btn small" data-act="ciopen">Modifier</button></div>`
  :`<p class="mute" style="margin:0 0 14px">Humeur, énergie, stress et courbatures en 20 secondes : Arden les croise ensuite avec ton sommeil et ton énergie.</p><button type="button" class="btn pri" data-act="ciopen">Faire mon check-in</button>`);
 if(document.activeElement&&document.activeElement.id==='jnote')return;
 $('#cibody').innerHTML=`<div class="panel"><div class="ci dials">${SCALES.map(([k,l])=>dialHTML(k,l,j[k])).join('')}</div>
 </div><h3 class="ms-sec">Étiquettes</h3><div class="panel"><div class="chips">${S.set.tags.map(t=>`<button class="chip ${(j.tags||[]).includes(t)?'on':''}" data-act="jtag" data-t="${esc(t)}">${esc(t)}</button>`).join('')}</div></div>
 <h3 class="ms-sec">Note</h3><div class="panel"><textarea id="jnote" rows="3" placeholder="Douleur, ressenti, événement…">${esc(j.note||'')}</textarea></div>`}
/* Cadran du check-in : un arc de 270° en cinq crans, à tourner du doigt (ou à toucher, ou au clavier). */
const CIW={mood:['mauvaise','bof','correcte','bonne','excellente'],energy:['à plat','faible','moyenne','bonne','au top'],stress:['calme','léger','modéré','élevé','très stressé'],sore:['aucune','légères','modérées','marquées','fortes']};
const DC={x:60,y:58,r:42};
const dialPos=v=>{const a=GA0+GSPAN*(v-1)/4;return[DC.x+DC.r*Math.cos(a),DC.y+DC.r*Math.sin(a)]};
function dialHTML(k,l,v){const c=SCC[k],p=v?(v-1)/4:0;
 return `<div class="dial" data-k="${k}" style="--c:${c}" role="slider" tabindex="0" aria-label="${l}" aria-valuemin="1" aria-valuemax="5" aria-valuenow="${v||''}" aria-valuetext="${v?esc(CIW[k][v-1]):'non renseigné'}">
  <svg viewBox="0 0 120 106"><path class="dt" d="${arcPath(DC.x,DC.y,DC.r,GA0,GA0+GSPAN)}"/><path class="df" pathLength="100" d="${arcPath(DC.x,DC.y,DC.r,GA0,GA0+GSPAN)}" style="stroke-dashoffset:${v?(100-p*100).toFixed(1):100}"/>${[1,2,3,4,5].map(i=>{const [x,y]=dialPos(i);return `<circle class="dd${v&&i<=v?' on':''}" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="2.6"/>`}).join('')}${v?(()=>{const [x,y]=dialPos(v);return `<circle class="dk" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="8"/>`})():''}</svg>
  <b class="dv">${v||'–'}</b><span class="dl">${l}</span><small class="dw">${v?esc(CIW[k][v-1]):'touche ou tourne'}</small>
  ${[1,2,3,4,5].map(i=>{const [x,y]=dialPos(i);return `<button type="button" class="dbt" data-act="jset" data-k="${k}" data-v="${i}" style="left:${(x/120*100).toFixed(1)}%;top:${(y/106*100).toFixed(1)}%" aria-label="${l} ${i} sur 5 : ${esc(CIW[k][i-1])}" tabindex="-1"></button>`}).join('')}</div>`}
/* mise à jour en direct pendant le geste, enregistrée au lâcher */
function dialShow(el,v){const k=el.dataset.k,p=(v-1)/4;el.querySelector('.df').style.strokeDashoffset=(100-p*100).toFixed(1);
 el.querySelectorAll('.dd').forEach((c,i)=>c.classList.toggle('on',i<v));let kn=el.querySelector('.dk');if(!kn){kn=document.createElementNS('http://www.w3.org/2000/svg','circle');kn.setAttribute('class','dk');kn.setAttribute('r','8');el.querySelector('svg').appendChild(kn)}
 const [x,y]=dialPos(v);kn.setAttribute('cx',x.toFixed(1));kn.setAttribute('cy',y.toFixed(1));el.querySelector('.dv').textContent=v;el.querySelector('.dw').textContent=CIW[k][v-1];el.setAttribute('aria-valuenow',v);el.setAttribute('aria-valuetext',CIW[k][v-1])}
{let dl=null,dv=0;
 const val=(el,e)=>{const r=el.querySelector('svg').getBoundingClientRect(),x=(e.clientX-r.left)/r.width*120,y=(e.clientY-r.top)/r.height*106;let a=Math.atan2(y-DC.y,x-DC.x)-GA0;a=((a%(2*Math.PI))+2*Math.PI)%(2*Math.PI);if(a>GSPAN)a=a>GSPAN+(2*Math.PI-GSPAN)/2?0:GSPAN;return 1+Math.round(a/GSPAN*4)};
 document.addEventListener('pointerdown',e=>{const el=e.target.closest('.dial');if(!el||e.button>0)return;dl=el;dv=+el.getAttribute('aria-valuenow')||0;el.dataset.moved=''});
 document.addEventListener('pointermove',e=>{if(!dl)return;const v=val(dl,e);if(v!==dv){dv=v;dl.dataset.moved='1';dialShow(dl,v);buzz()}});
 const up=()=>{if(!dl)return;const el=dl;dl=null;if(el.dataset.moved){setJ({[el.dataset.k]:dv});renderCheckin();const n=$(`.dial[data-k=${el.dataset.k}]`);if(n){n.focus({preventScroll:true});n.dataset.drag='1';setTimeout(()=>{delete n.dataset.drag},80)}}};
 document.addEventListener('pointerup',up);document.addEventListener('pointercancel',up);
 /* un glissé ne doit pas aussi compter comme un toucher sur un cran */
 document.addEventListener('click',e=>{const n=e.target.closest('.dial[data-drag]');if(n){delete n.dataset.drag;e.stopPropagation();e.preventDefault()}},true);
 document.addEventListener('keydown',e=>{const el=e.target.closest&&e.target.closest('.dial');if(!el)return;const v=+el.getAttribute('aria-valuenow')||0,d={ArrowRight:1,ArrowUp:1,ArrowLeft:-1,ArrowDown:-1}[e.key];if(!d)return;e.preventDefault();e.stopPropagation();
  const n=clamp((v||3)+(v?d:0),1,5);setJ({[el.dataset.k]:n});buzz();renderCheckin();$(`.dial[data-k=${el.dataset.k}]`)?.focus()},true)}
function setJ(p){const d=S.day,o=getDay(d);o.j={...(o.j||{}),...p};put.day(d)}

/* ---------- sommeil ---------- */
function compHTML(c,col){return c.map(([n,v,,t])=>`<div class="cr"><span>${n}</span><div class="bar" style="--c:${col}"><i style="width:${v}%"></i></div><span class="num">${Math.round(v)}</span><small>${esc(t)}</small></div>`).join('')}
function renderSleep(){const d=S.day,h=H(d),sl=sleepScore(d),x=X(d),T=num(S.set.sleep);
 $('#gsl').innerHTML=gauge(sl&&sl.s,'var(--slp)','Score de sommeil',h.sl?`nuit du ${dShort(addD(d,-1))} au ${dShort(d)}`:'pas de nuit enregistrée',null,'/100',true);
 $('#slc').innerHTML=sl?compHTML(sl.c,'var(--slp)'):'<p class="mute small">Les composantes apparaissent avec une nuit importée.</p>';
 const win=has(h.sw)&&has(h.sb)?((h.sw-h.sb+1440)%1440):null;
 /* la nuit en listes groupées, comme dans Santé : phases, horaires, signes vitaux */
 {const row=(l,v)=>v?`<div class="mrow"><span>${l}</span><b>${v}</b></div>`:'',grp=(t,rows)=>rows.join('')?`<div class="adv-s"><div class="sgh">${t}</div><div class="sgrp">${rows.join('')}</div></div>`:'',U=(v,u)=>`${v}<small> ${u}</small>`;
  const aw=win?Math.max(0,win-h.sl):0,und=Math.max(0,h.sl-num(h.sd)-num(h.sr)-num(h.sc)),tot=aw+h.sl;
  const ph=[['Éveil','var(--awake)',aw],['Paradoxal (REM)','var(--rem)',num(h.sr)],['Léger','var(--core)',num(h.sc)],['Profond','var(--deep)',num(h.sd)],['Endormi, non détaillé','color-mix(in srgb,var(--slp) 30%,var(--field))',und>5?und:0]].filter(x=>x[2]>0);
  $('#sls').innerHTML=h.sl?`${ph.length>1?`<div class="sgh">Phases</div><div class="phbar">${ph.map(([,c,m])=>`<i style="flex:${m};background:${c}"></i>`).join('')}</div><div class="sgrp">${ph.map(([l,c,m])=>`<div class="mrow"><span><i class="pdot" style="background:${c}"></i>${l}</span><b>${fmtSl(m)}<small> · ${r0(m/tot*100)} %</small></b></div>`).join('')}</div>`:''}`
   +grp('La nuit',[row('Coucher → lever',has(h.sb)?`${hhmm(h.sb)} → ${hhmm(h.sw)}`:''),row('Temps endormi',fmtSl(h.sl)),row('Temps au lit',win?fmtSl(win):''),row('Pour t\'endormir',has(h.lat)?U(h.lat,'min'):''),row('Réveils',has(h.wu)?String(h.wu):'')])
   +grp('Pendant le sommeil',[row('FC moyenne',h.nhr?U(r0(h.nhr),'bpm'):''),row('FC la plus basse',h.nmin?U(h.nmin,'bpm'):''),row('Baisse de FC',has(h.dip)?U(h.dip,'%'):''),row(`VFC (${hvLab()})`,nhrv(d)?U(r0(nhrv(d)),'ms'):''),row('Respiration',h.rr?U(fx(h.rr),'/min'):''),row('Saturation en oxygène',h.o2?U(fx(h.o2),'%'):''),row('Battements valides (VFC)',h.nrq&&useRm()?U(h.nrq,'%'):'')]):''}
 const cur2=hvm(),hvRows=[['SDNN Apple, moyenne du jour'+(cur2==='apple'?' · utilisée':''),h.hrv,`moyenne des ${h.hvn?h.hvn+' ':''}mesures du ${dShort(d)} (minuit à minuit) : la valeur journalière de l'app Santé`],['SDNN Apple pendant le sommeil'+(cur2==='sdnn'?' · utilisée':''),h.nhv,`moyenne des ${h.nhn?h.nhn+' ':''}mesures de la montre entre endormissement et réveil`],['RMSSD pendant le sommeil'+(cur2==='rmssd'?' · utilisée':''),h.nrm,'recalculé battement par battement : une autre mesure de la VFC, plus sensible à la récupération'],['SDNN recalculé (contrôle)',h.nsc,'doit être proche du SDNN Apple de la nuit si les battements sont bien lus']].filter(x=>x[1]);
 const xd=X(d)||{},hl=xd.hl||[],hsn=xd.hs||[],inSl=m=>{if(!has(h.sb)||!has(h.sw))return false;const r=m+720;return r>=Math.max(720,h.sb)&&r<=h.sw};
 const lastTxt=S.health.last?`Ton export s'arrête le ${dShort(S.health.last.slice(0,10))} à ${S.health.last.slice(11,16)}. `:'';
 const srcRows=(h.hvsrc||[]).map(([n,v,c])=>`<tr><td><b>Source : ${esc(n)}</b><br><span class="mute small">${c} mesure${c>1?'s':''} ce jour-là</span></td><td class="num"><b>${v} ms</b></td></tr>`).join('');
 const list=hl.length?`<details class="hvl"><summary>Voir les ${hl.length} mesures du ${dShort(d)} une par une</summary><p class="mute small">Compare avec l'app Santé : Parcourir → Cœur → Variabilité du rythme cardiaque → Afficher toutes les données. Chaque ligne doit s'y retrouver avec la même heure et la même valeur.</p><table><tbody>${hl.map(([m,v,i])=>`<tr${inSl(m)?' class="insl"':''}><td class="num">${hhmm(m-720)}</td><td>${inSl(m)?'<span class="mute small">pendant le sommeil</span>':''}${hsn.length>1?` <span class="mute small">${esc(hsn[i]||'')}</span>`:''}</td><td class="num"><b>${r0(v)} ms</b></td></tr>`).join('')}</tbody></table><p class="mute small">Moyenne de ces ${hl.length} mesures : <b>${r0(avg(hl.map(x=>x[1])))} ms</b>.</p></details>`:(h.hrv?'<p class="mute small">'+IMP('Réimporte ton export','Synchronise Apple Santé')+' pour voir chaque mesure de VFC une par une, avec son heure et sa source.</p>':'');
 $('#hvcmp').innerHTML=hvRows.length?`<details class="disc adv-s"><summary>Toutes les mesures de VFC<small>nuit du ${dShort(addD(d,-1))} au ${dShort(d)}</small></summary><p class="mute small">${lastTxt}Si l'app Santé affiche une autre valeur, vérifie d'abord que tu regardes la même date${S.health.last&&S.health.last.slice(0,10)<today()?IMP(' : la nuit dernière n\'est pas dans ton export, réimporte-le',' : la nuit dernière n\'est pas encore synchronisée'):''}.</p><table><tbody>${hvRows.map(([l,v,t])=>`<tr><td><b>${l}</b><br><span class="mute small">${t}</span></td><td class="num"><b>${r0(v)} ms</b></td></tr>`).join('')}${srcRows}</tbody></table>${list}<p class="mute small">RMSSD et SDNN mesurent deux choses différentes et ne se comparent pas entre eux. Choisis celle qui sert à tes scores dans Plus → Réglages.</p></details>`:'';
 const nd=needOf(addD(d,1)),wa=wakeAvg(d);
 $('#slcoach').innerHTML=(sl?`${sl.s>=80?'<b>Excellente nuit.</b> ':sl.s>=60?'<b>Nuit correcte.</b> ':'<b>Nuit insuffisante.</b> '}`+(sl.c.filter(c=>c[1]<50).map(c=>c[0]==='Durée'?`Il t'a manqué ${fmtSl(Math.max(0,sl.nd.need-h.sl))} par rapport à ton besoin.`:c[0]==='Régularité'?'Ton heure de coucher s\'écarte de ton habitude : la régularité améliore la qualité du sommeil.':c[0]==='Récupératrice'?'Peu de sommeil profond et paradoxal : alcool, repas tardif ou écrans peuvent jouer.':c[0]==='Continuité'?'Nuit fragmentée par plusieurs réveils.':'').join(' '))+(has(h.dip)&&h.dip<10?` Ta FC n'a baissé que de ${h.dip} % pendant la nuit (normal : 10 à 20 %) : repas tardif, alcool, stress ou séance du soir peuvent l'expliquer.`:'')+(has(h.lat)&&h.lat>30?` Il t'a fallu ${h.lat} min pour t'endormir : au-delà de 30 min de façon répétée, avance la lumière du matin et réduis les écrans le soir.`:''):'')+
  (wa!=null?` Besoin pour la prochaine nuit : <b>${fmtSl(nd.need)}</b> (base ${fmtSl(nd.T)}${nd.debt?` + ${nd.debt} min de dette`:''}${nd.eff?` + ${nd.eff} min liés à l'effort`:''}). Pour te lever à ${hhmm(wa)}, endors-toi vers <b>${hhmm(wa-nd.need)}</b>.`:'');
 $('#vd-hyp').innerHTML=h.sl&&(h.sd||h.sr)?`<b>${fmtSl(num(h.sd))}</b> de sommeil profond et <b>${fmtSl(num(h.sr))}</b> de paradoxal${has(h.wu)?`, ${h.wu} réveil${h.wu>1?'s':''}`:''}${h.nmin?`, FC au plus bas à ${h.nmin} bpm`:''}.`:'';
 $('#hypsub').textContent=x&&x.hy?`${x.hy.length} phases · ${x.nv?x.nv.length:0} mesures de VFC pendant la nuit`:'';
 setFig('#fhyp',{type:'hyp',segs:x&&x.hy,nh:x&&x.nh,nh0:x&&x.nh0,nv:x&&x.nv,empty:h.sl?'Le détail minute par minute est gardé pour les 35 dernières nuits importées. '+IMP('Réimporte ton export','Synchronise Apple Santé')+' pour l\'obtenir.':'Pas de nuit enregistrée pour ce jour'});
 const L=hLast()||today(),N=[];for(let i=13;i>=0;i--){const k=addD(L,-i);N.push({k,h:H(k)})}
 const mx=Math.max(T*1.2,...N.map(x=>num(x.h.sl))),seg=(v,c)=>v>0?`<i style="width:${v/mx*100}%;background:${c}"></i>`:'';
 $('#s14').innerHTML=N.map(({k,h})=>{const und=Math.max(0,num(h.sl)-num(h.sd)-num(h.sc)-num(h.sr)),ss=sleepScore(k);const tip=h.sl?[dLong(k),`Endormi ${fmtSl(h.sl)}${has(h.sb)?` (${hhmm(h.sb)} → ${hhmm(h.sw)})`:''}`,h.sd?`Profond ${fmtSl(h.sd)} · paradoxal ${fmtSl(h.sr||0)} · léger ${fmtSl(h.sc||0)}`:'',has(h.wu)?`${h.wu} réveil${h.wu>1?'s':''}`:'',nhrv(k)?`VFC ${hvLab()} ${r0(nhrv(k))} ms`:'',h.nmin?`FC min. ${h.nmin} bpm`:'',ss?`Score ${ss.s} / 100`:''].filter(Boolean).join('\n'):dLong(k)+' : pas de nuit enregistrée';return `<div class="hrow" data-tip="${esc(tip)}"><span>${dWk(k)}</span><div class="stk">${seg(num(h.sd),'var(--deep)')}${seg(num(h.sc),'var(--core)')}${seg(num(h.sr),'var(--rem)')}${seg(und,'color-mix(in srgb,var(--slp) 30%,var(--field))')}<b class="tg" style="left:${T/mx*100}%"></b></div><span class="num">${h.sl?fmtSl(h.sl):'–'}${ss?` · <b style="color:var(--slp)">${ss.s}</b>`:''}</span></div>`}).join('');
 const sl14=N.filter(x=>x.h.sl),bt=sl14.filter(x=>has(x.h.sb)).map(x=>x.h.sb),wt=sl14.filter(x=>has(x.h.sw)).map(x=>x.h.sw),debt=sl14.slice(-7).reduce((a,x)=>a+Math.max(0,T-x.h.sl),0);
 $('#sk').innerHTML=sl14.length?[`<div><b>${fmtSl(avg(sl14.map(x=>x.h.sl)))}</b><span>moyenne 14 nuits</span></div>`,`<div><b class="${debt>120?'dn':''}">${fmtSl(debt)}</b><span>dette sur 7 nuits</span></div>`,bt.length?`<div><b>${hhmm(avg(bt))} → ${hhmm(avg(wt))}</b><span>horaires moyens</span></div>`:'',bt.length>3?`<div><b>± ${r0(sdv(bt))} min</b><span>régularité du coucher</span></div>`:''].join(''):'';
 $('#vd-s14').innerHTML=sl14.length?`Moyenne de <b>${fmtSl(avg(sl14.map(x=>x.h.sl)))}</b> par nuit${debt>=30?`, et <b>${fmtSl(debt)}</b> de dette sur 7 nuits`:', sans dette de sommeil'}.`:'';
 const opts=[['sl','Durée'],['score','Score'],['phases','Phases'],['nhv','VFC'],['nmin','FC nocturne'],['dip','Baisse de FC'],['horaires','Horaires'],['eff','Efficacité'],['wu','Réveils'],['lat','Endormissement']];
 $('#slt').innerHTML=opts.map(([k,l])=>`<button data-act="slt" data-k="${k}" class="${sleepTrend===k?'on':''}">${l}</button>`).join('');
 $('#slpr').innerHTML=[[14,'14 j'],[30,'30 j'],[90,'3 mois'],[182,'6 mois']].map(([n,l])=>`<button data-act="slper" data-n="${n}" class="${sleepPer===n?'on':''}">${l}</button>`).join('');
 const from=addD(L,-(sleepPer-1));const T2=num(S.set.sleep);let cfg,note;
 const pts=f=>dailyPts(f,from,L),big=sleepPer>45,hk=k=>d=>{const x=H(d)[k];return has(x)?num(x):null};
 const barsAvg=(name,p,col,tf)=>[{name,pts:p,col,dots:!big,r:3.5,w:big?1.5:2.2,tf,avg:true,last:true}];
 const lineAvg=(name,p,col,tf)=>[{name,pts:p,col,dots:!big,r:3,w:big?1.5:2,op:.9,tf,avg:true,last:true}];
 switch(sleepTrend){
  case'sl':cfg={series:barsAvg('Durée',pts(d=>H(d).sl?H(d).sl/60:null),'var(--slp)',v=>fmtSl(v*60)),hline:T2/60,fmt:v=>fx(v)+' h'};note='Points : durée de chaque nuit. Bande colorée : ta plage habituelle (moyenne ± 1 écart-type des nuits voisines), qui suit l\'évolution de tes données. Pointillés : ton objectif.';break;
  case'score':cfg={df:v=>r0(v)+' pts',series:barsAvg('Score',pts(d=>sleepScore(d)?.s??null),'var(--slp)',v=>r0(v)+' / 100'),ymax:100};note='Score de chaque nuit, sur fond de ta plage habituelle.';break;
  case'phases':cfg={zero:true,fmt:v=>r0(v)+' min',tf:fmtSl,series:[{name:'Profond',pts:pts(hk('sd')),col:'var(--deep)',avg:true,dots:!big,r:3,w:2,last:true},{name:'Paradoxal (REM)',pts:pts(hk('sr')),col:'var(--rem)',avg:true,dots:!big,r:3,w:2,last:true},{name:'Léger',pts:pts(hk('sc')),col:'var(--core)',avg:true,dots:!big,r:3,w:2,last:true}]};note='Minutes passées dans chaque phase, nuit par nuit. Repères chez l\'adulte jeune : profond 13 à 23 %, paradoxal 20 à 25 % du temps endormi.';break;
  case'nhv':cfg={unit:'ms',series:lineAvg(`VFC ${hvLab()} de la nuit`,pts(nhrv),'var(--mind)')};note=`VFC moyenne de chaque nuit (${hvLab()}).`;break;
  case'nmin':cfg={unit:'bpm',series:[{name:'FC la plus basse',pts:pts(hk('nmin')),col:'var(--trn)',avg:true,dots:!big,r:3,w:2,last:true},{name:'FC moyenne de la nuit',pts:pts(hk('nhr')),col:'var(--hrt)',avg:true,dots:!big,r:3,w:2,last:true}]};note='Fréquence cardiaque la plus basse (moyenne sur 5 min) et moyenne de chaque nuit.';break;
  case'dip':cfg={unit:'%',band:[10,20],series:lineAvg('Baisse de FC',pts(hk('dip')),'var(--hrt)')};note='Baisse de ta FC la nuit par rapport à la journée précédente. Zone grisée : 10 à 20 %, la plage habituelle.';break;
  case'horaires':cfg={step:60,df:v=>r0(v)+' min',fmt:v=>hhmm(v),series:[{name:'Endormissement',pts:pts(hk('sb')),col:'var(--slp)',avg:true,dots:true,r:3,w:2,last:true},{name:'Réveil',pts:pts(hk('sw')),col:'var(--str)',avg:true,dots:true,r:3,w:2,last:true}]};note='Heure d\'endormissement et de réveil de chaque nuit.';break;
  case'eff':cfg={unit:'%',ymax:100,series:barsAvg('Efficacité',pts(d=>H(d).ef?H(d).ef*100:null),'var(--slp)')};note='Part du temps passé à dormir entre l\'endormissement et le réveil. Au-dessus de 85 %, c\'est une bonne nuit.';break;
  case'wu':cfg={zero:true,series:barsAvg('Réveils',pts(hk('wu')),'var(--awake)',v=>r0(v)+(v>1?' réveils':' réveil'))};note='Nombre de réveils (éveil d\'au moins 1 min ou interruption de 5 min) dans chaque nuit.';break;
  case'lat':cfg={zero:true,unit:'min',series:barsAvg('Endormissement',pts(hk('lat')),'var(--slp)')};note='Temps entre ton coucher (mise au lit enregistrée par l\'iPhone ou la montre) et l\'endormissement. Normal : 10 à 20 min.';break}
 cfg.empty='Pas de donnée pour cette mesure sur la période ('+IMP('réimporte ton export','synchronise Apple Santé')+' si besoin)';setFig('#fs',cfg);
 const tfk=cfg.tf||(cfg.fmt?cfg.fmt:v=>fx(v)+(cfg.unit?' '+cfg.unit:''));$('#fsk').innerHTML=cfg.series.filter(x=>x.avg&&x.pts.length).map(se=>{const ys=se.pts.map(p=>p.y),tf=se.tf||tfk,mi2=se.pts.reduce((a,b)=>b.y<a.y?b:a),ma2=se.pts.reduce((a,b)=>b.y>a.y?b:a);return `<div class="stat" style="border-left:4px solid ${se.col}"><b>${esc(tf(avg(ys)))}</b><span>${esc(se.name)} · moyenne sur ${se.pts.length} nuit${se.pts.length>1?'s':''}</span><span style="display:block">min. ${esc(tf(mi2.y))} (${dShort(mi2.x)}) · max. ${esc(tf(ma2.y))} (${dShort(ma2.x)})</span></div>`}).join('');$('#fsn').textContent=note+' La bande large représente ta plage habituelle : une valeur qui en sort est inhabituelle pour toi. Survole ou touche le graphique pour la valeur exacte de chaque jour.'}

/* ---------- récupération ---------- */
function renderRec(){const d=S.day,h=H(d),rc=recovery(d);
 const cb=calib(d);$('#grc').innerHTML=gauge(rc&&rc.s,rc?recLab(rc.s)[1]:'var(--rec)','Énergie',rc?recLab(rc.s)[0]:cb<7&&hKeys().length?`calibrage : ${cb} / 7 nuits`:'en attente de données',null,'%',true);
 $('#rcc').innerHTML=rc?compHTML(rc.c,'var(--rec)'):'<p class="mute small">Il faut au moins ta VFC ou ta FC nocturne de ce jour.</p>';
 $('#rccoach').innerHTML=rc?`${coach(d,rc,null,null,effTarget(rc.s)).split('Ce soir')[0]} L'énergie compare ta VFC et ta FC de la nuit à ta propre normale des 30 derniers jours : c'est ton évolution qui compte, pas la valeur brute.`:'L\'énergie s\'appuie surtout sur la VFC mesurée pendant ton sommeil : '+IMP('importe ton export Apple Santé pour l\'activer.','connecte Apple Santé pour l\'activer.')+'';
 const mo=monitor(d),bad=mo.filter(x=>x.warn);$('#mons').innerHTML=mo.length?(bad.length?`<b>${bad.length} ${bad.length>1?'signaux':'signal'} à surveiller</b> : ${esc(bad.map(x=>x.l.toLowerCase()).join(', '))}.`:'Tous tes signes vitaux sont dans ta normale.'):'';
 $('#mon').innerHTML=mo.length?mo.map(x=>{const lo=x.m-3*x.sd,hi=x.m+3*x.sd,P=v=>clamp((v-lo)/(hi-lo)*100,2,98);return `<div class="mr" data-tip="${esc(`${x.l}\nCette nuit : ${monFmt(x,x.v)}\nTa normale : ${x.k==='tp'?'± '+f2(1.5*x.sd)+' °C':monFmt(x,x.m-1.5*x.sd)+' à '+monFmt(x,x.m+1.5*x.sd)}\nÉcart : ${sg(Math.round(x.z*10)/10)} écart-type`)}"><div class="n">${x.l}<small>normale ${x.k==='tp'?'± '+f2(1.5*x.sd)+' °C':monFmt(x,x.m)}</small></div><div class="rng"><i class="nb" style="left:${P(x.m-1.5*x.sd)}%;right:${100-P(x.m+1.5*x.sd)}%"></i><i class="pt" style="left:${P(x.v)}%;--c:${x.col}"></i></div><div class="v">${monFmt(x,x.v)}<small><span class="st" style="--c:${x.col}">${x.lab}</span></small></div></div>`}).join(''):'<p class="mute small">Il faut au moins 7 nuits importées avant ce jour pour établir ta normale.</p>';
 const L=hLast()||today(),from=addD(L,-182),vb=nhrvBase(L),pts=[];for(let k=from;k<=L;k=addD(k,1)){if(!nhrv(k))continue;const v=[];for(let i=0;i<7;i++){const y=nhrv(addD(k,-i));if(y)v.push(y)}pts.push({x:k,y:Math.round(avg(v))})}
 const raw=[];for(let k=from;k<=L;k=addD(k,1))if(nhrv(k))raw.push({x:k,y:nhrv(k)});
 setFig('#fhv',{unit:'ms',series:[{name:'VFC de la nuit',avg:true,last:true,pts:raw,col:'var(--mind)',dots:true,r:3,w:1.5,op:.9}],empty:IMP('Réimporte ton export','Synchronise Apple Santé')+' : la VFC nocturne est calculée à partir des mesures prises pendant ton sommeil'});
 const v7=avg(raw.slice(-7).map(p=>p.y));$('#vk2').innerHTML=(hvm()==='rmssd'&&!S.health.rm&&hKeys().length?'<p class="notice" style="width:100%">Ta VFC est encore en SDNN (valeur d\'Apple). '+IMP('Réimporte ton export pour la calculer en RMSSD battement par battement.','Le RMSSD battement par battement n\'est disponible qu\'avec un fichier d\'export Apple Santé (Plus → Apple Santé).')+'</p>':'')+(v7?`<div><b>${r0(v7)} ms</b><span>${hvLab()}, moyenne des 7 dernières nuits</span></div>`+(vb?`<div><b>${r0(vb.m)} ms</b><span>ta normale (30 j)</span></div><div><b class="${v7>=vb.m?'gd':'dn'}">${sg(Math.round((v7/vb.m-1)*100))} %</b><span>écart à ta normale</span></div>`:''):'');
 {const pc=v7&&vb?Math.round((v7/vb.m-1)*100):null;$('#vd-hv').innerHTML=pc==null?'':pc>=5?`VFC des 7 dernières nuits <b>${sg(pc)} %</b> au-dessus de ta normale : bonne récupération.`:pc<=-5?`VFC des 7 dernières nuits <b>${pc} %</b> sous ta normale : pense sommeil, stress et charge d'entraînement.`:'VFC stable, dans ta normale.'}
 const f90=addD(L,-89);setFig('#fnh',{unit:'bpm',series:[{name:'FC min. nocturne',avg:true,pts:dailyPts(d=>num(H(d).nmin)||null,f90,L),col:'var(--trn)',w:1.8,last:true},{name:'FC au repos',avg:true,pts:dailyPts(d=>num(H(d).rhr)||null,f90,L),col:'var(--hrt)',w:1.8,last:true}],empty:'Pas encore de FC nocturne'});
 const nm=winAvg('nmin',L,7),nb=base('nmin',addD(L,-7));{const df=nm&&nb?nm-nb:null;$('#vd-nh').innerHTML=df==null?'':Math.abs(df)<1.5?'FC nocturne stable sur 7 jours.':df<0?`En baisse de <b>${r0(-df)} bpm</b> sur 7 jours : bon signe de récupération.`:`En hausse de <b>${r0(df)} bpm</b> sur 7 jours : fatigue, alcool ou maladie possibles.`}
 $('#nhk').innerHTML=nm?`<div><b>${r0(nm)} bpm</b><span>FC min. nocturne, 7 j${nb?` · <span class="${nm<=nb?'gd':'dn'}">${sg(Math.round(nm-nb))}</span>`:''}</span></div>`:'';
 const x=X(d),sv=num(h.stz);$('#vd-st').innerHTML=has(h.stz)?`<b>${sv<10?'Journée calme':sv<20?'Stress modéré':sv<35?'Journée chargée':'Journée très tendue'}</b> : ${sv} / 100 ce jour, ${r0(winAvg('stz',d,7)||0)} en moyenne sur 7 jours.`:'';$('#stk').innerHTML=has(h.stz)?`<div><b style="color:var(--str)">${sv}</b><span>stress du ${dShort(d)} : ${stressLab(sv).toLowerCase()}</span></div><div><b>${r0(winAvg('stz',d,7)||0)}</b><span>moyenne 7 j</span></div>`:'<p class="mute small">'+(hKeys().length?'Pas encore de stress estimé pour ce jour : il se calcule au fil de la journée, à partir de ta fréquence cardiaque.':IMP('Le stress estimé apparaît après un import Apple Santé.','Le stress estimé apparaît après la synchro Apple Santé.'))+'</p>';
 $('#sth').innerHTML=x&&x.sh?`<div style="display:grid;grid-template-columns:repeat(24,minmax(0,1fr));gap:2px;align-items:end;height:80px">${x.sh.map((v,i)=>`<i data-tip="${esc(`${i}h – ${i+1}h : stress ${v} / 100`)}" style="display:block;height:${Math.max(4,v)}%;border-radius:3px;background:${v>=50?'var(--str)':v>0?'color-mix(in srgb,var(--str) 45%,var(--field))':'var(--field)'}"></i>`).join('')}</div><div style="display:flex;justify-content:space-between" class="mute small"><span>0h</span><span>6h</span><span>12h</span><span>18h</span><span>24h</span></div>`:'';
 const vk=(key,lab,f,dev)=>{const v=vals(key,L,7,0);if(!v.length)return'';const a=avg(v),b=base(key,addD(L,-7),30);return `<div><b>${dev&&b!=null?sg(Math.round((a-b)*100)/100)+' °C':f(a)}</b><span>${lab}${dev?' vs normale':''}, 7 j</span></div>`};
 $('#vtk').innerHTML=[vk('o2','SpO2',v=>fx(v)+' %'),vk('rr','respirations / min',fx),vk('tp','température poignet',fx,true),vk('hr','FC moyenne',v=>r0(v)+' bpm'),vk('whr','FC en marchant',v=>r0(v)+' bpm'),vk('hrr','récupération à 1 min',v=>r0(v)+' bpm')].join('')||'<p class="mute small">'+IMP('Réimporte ton export Apple Santé','Synchronise Apple Santé')+' pour ajouter ces mesures.</p>';
 const m=$('#vtm').value,f9=addD(L,-89);let p2;if(m==='tp'){const tb=avg(hKeys().map(k=>H(k).tp).filter(has).map(num));p2=dailyPts(d=>has(H(d).tp)?num(H(d).tp)-(tb||0):null,f9,L)}else p2=dailyPts(d=>num(H(d)[m])||null,f9,L);
 setFig('#fvt',{series:[{name:$('#vtm').selectedOptions[0].textContent,avg:true,last:true,pts:p2,col:m==='stz'?'var(--str)':'var(--hrt)',dots:true,r:2.5,w:1.5,op:.8}],hline:m==='tp'?0:null,fmt:m==='tp'?v=>sg(Math.round(v*100)/100):m==='o2'?v=>fx(v)+' %':null,empty:'Pas de données pour cette mesure'})}

/* ---------- effort ---------- */
function renderEffort(){renderSessCard();const d=S.day,h=H(d),rc=recovery(d),ef=effortOf(d),tg=effTarget(rc&&rc.s),T=dayTrain(d);
 $('#gef').innerHTML=gauge(tg&&ef==null?0:ef,'var(--eff)','Dépense du jour',tg?`zone conseillée ${tg[0]}–${tg[1]} selon ton énergie`:'',null,'/100',true,tg);
 const Z=[0,0,0,0,0];for(const w of h.wk||[])(w.z||[]).forEach((m,i)=>Z[i]+=m);const zt=Z.reduce((a,b)=>a+b,0);
 $('#dz').innerHTML=zt?zbar(Z)+`<div class="comp" style="margin-top:10px">${Z.map((m,i)=>`<div class="cr"><span>${ZN[i]}</span><div class="bar" style="--c:${ZC[i]}"><i style="width:${m/zt*100}%"></i></div><span class="num">${m}′</span></div>`).join('')}</div>`:'<p class="mute small">Pas d\'entraînement enregistré par la montre ce jour.</p>';
 const ac=acwr(d),hmx=num(S.health.hrmax);
 $('#efs').innerHTML=[`<div class="stat adv-s"><b>${r0(loadOf(d))}</b><span>charge cardiaque (TRIMP)</span></div>`,T.min?`<div class="stat"><b>${r0(T.min)} <small>min</small></b><span>d'entraînement</span></div>`:'',h.ac?`<div class="stat"><b>${r0(h.ac)} <small>kcal</small></b><span>actives</span></div>`:'',ac.r!=null?`<div class="stat adv-s"><b class="${ac.r>1.5?'dn':''}">${f2(ac.r)}</b><span>ratio de charge 7/28 j</span></div>`:'',hmx?`<div class="stat adv-s"><b>${hmx} <small>bpm</small></b><span>FC max. (déduite)</span></div>`:''].join('');
 $('#efcoach').classList.add('adv-s');$('#efcoach').innerHTML=(ef==null?'Aucune dépense mesurée ce jour.':ef<tg?.[0]?`Dépense de ${ef}, sous la zone conseillée : tu as de la marge pour une activité.`:tg&&ef>tg[1]?`Dépense de ${ef}, au-dessus de ce que ton énergie conseillait : prévois du sommeil en plus ce soir.`:`Dépense de ${ef}${tg?', dans la zone conseillée':''}.`)+(actsHTML(d,T)?'':'')+` La dépense est calculée à partir de ta FC minute par minute (méthode TRIMP), sur une échelle de 0 à 100 qui sature : passer de 80 à 90 demande beaucoup plus que de 20 à 30.`;
 const e=today(),fr=addD(e,-29),E=[],R=[];for(let k=fr;k<=e;k=addD(k,1)){const a=effortOf(k);if(a!=null)E.push({x:k,y:a});const r=recovery(k);if(r)R.push({x:k,y:r.s})}
 {const ae=avg(E.map(p=>p.y)),ar=avg(R.map(p=>p.y));$('#vd-fer').innerHTML=ae!=null?`Sur 30 jours : dépense moyenne de <b>${r0(ae)}</b>${ar!=null?`, énergie moyenne de <b>${r0(ar)} %</b>`:''}.`:''}
 setFig('#fer',{series:[{name:'Dépense',avg:true,pts:E,col:'var(--eff)',bars:true,op:.75},{name:'Énergie',avg:true,df:v=>r0(v)+' pts',tf:v=>r0(v)+' %',pts:R,col:'var(--rec)',last:true}],ymin:0,ymax:100,empty:'Pas encore de données'});
  const Zs=zones28(),zt2=Zs.reduce((a,b)=>a+b,0);if(zt2){const pc=Zs.map(m=>m/zt2*100),low=pc[0]+pc[1],mid=pc[2],hi=pc[3]+pc[4];
  $('#z28').innerHTML=zbar(Zs)+`<div class="comp" style="margin-top:12px">${Zs.map((m,i)=>`<div class="cr"><span>${ZN[i]}</span><div class="bar" style="--c:${ZC[i]}"><i style="width:${pc[i]}%"></i></div><span class="num">${r0(pc[i])} %</span><small>${r0(m)} min sur 28 jours</small></div>`).join('')}</div><div class="coach">${low>=70&&hi>=10?'<b>Répartition polarisée</b> : surtout de la basse intensité et un peu de haute intensité, une répartition que la recherche associe à de bons progrès en endurance et en VO2 max.':mid>=35?'<b>Beaucoup de temps en zone 3</b> (tempo) : c\'est fatigant, et la plupart des programmes d\'endurance conseillent plutôt de rendre les sorties faciles vraiment faciles (zone 2) et les séances dures vraiment dures.':hi<5?'<b>Presque pas de haute intensité</b> : ajoute une séance de fractionné par semaine pour faire progresser ta VO2 max.':low<60?'<b>Peu de basse intensité</b> : ajoute du volume facile en zone 2 (tu peux parler en faisant l\'effort) pour construire ta base aérobie.':'Répartition équilibrée de tes intensités.'} Zones calculées avec ta FC max. de ${S.health.hrmax||'–'} bpm.</div>`}else $('#z28').innerHTML='<p class="mute small">Pas d\'entraînement avec FC enregistré par la montre sur 28 jours.</p>';
 {const co=$('#z28 .coach');$('#vd-z28').innerHTML=co?co.innerHTML:'';if(co)co.remove()}
 renderLoad();renderMG();renderHeat();renderForce();renderRecs();renderHist()}
function lastFor(name,excl){const k=norm(name);if(!k)return null;for(const s of done()){if(s.id===excl||s.kind==='sport')continue;const e=(s.ex||[]).find(e=>norm(e.n)===k&&e.sets.some(x=>num(x.r)>0));if(e)return{s,e}}return null}
function suggest(name,excl){const L=lastFor(name,excl);if(!L)return null;const sets=L.e.sets.filter(x=>num(x.r)>0);const top=Math.max(...sets.map(x=>num(x.w)));const up=top>0&&sets.filter(x=>num(x.w)===top).every(x=>num(x.r)>=S.set.rmax);return{L,sets,top,up,w:up?top+num(S.set.inc):top}}
function bestE1(name,excl){const k=norm(name);let b=0;for(const s of done()){if(s.id===excl)continue;for(const e of s.ex||[])if(norm(e.n)===k)for(const x of e.sets)b=Math.max(b,e1(num(x.w),num(x.r)))}return b}
function prefill(n,excl){const g=suggest(n,excl);if(!g)return[{w:'',r:''}];return g.sets.map(x=>{const atTop=num(x.w)===g.top;return{w:atTop?g.w:num(x.w),r:'',p:atTop&&g.up?S.set.rmin:num(x.r)}})}
function renderStart(){const seen=new Set(),tpl=[];
 for(const s of done()){if(s.kind==='sport')continue;const k=norm(s.name);if(k&&!seen.has(k)){seen.add(k);tpl.push(s)}if(tpl.length>=8)break}
 const seg=`<div class="seg"><button data-act="smode" data-m="mu" class="${startMode==='mu'?'on':''}">Muscu</button><button data-act="smode" data-m="sp" class="${startMode==='sp'?'on':''}">Autre sport</button></div>`;
 $('#editor').innerHTML=`<div class="panel">${seg}`+(startMode==='mu'?`
 <div class="grid2"><label>Nom de la séance<input id="nn" placeholder="Push, Pull, Jambes…" autocomplete="off"></label><label>Date<input id="nd" type="date" value="${today()}"></label></div>
 <button class="btn pri" data-act="start">Commencer une séance</button>
 ${tpl.length?`<h3>Ou reprendre une séance récente</h3><div class="chips">${tpl.map(s=>`<button class="chip" data-act="tpl" data-id="${esc(s.id)}"><b>${esc(s.name)}</b><span>${dShort(s.date)} · ${(s.ex||[]).length} exos</span></button>`).join('')}</div><p class="mute small">Charges pré-remplies avec la progression suggérée.</p>`:''}`
 :`<form id="spf"><div class="grid3"><label>Sport<select id="spt">${SPORTS.map(x=>`<option>${x}</option>`).join('')}</select></label><label>Date<input id="spd" type="date" value="${today()}"></label><label>Durée (min)<input id="spm" inputmode="numeric" required></label>
 <label>Intensité ressentie (1 à 10)<select id="spr"><option value="">Non notée</option>${[1,2,3,4,5,6,7,8,9,10].map(i=>`<option value="${i}">${i}${i<=3?' · facile':i<=6?' · modéré':i<=8?' · dur':' · maximal'}</option>`).join('')}</select></label><label>Distance (km, option)<input id="spk" inputmode="decimal"></label><label>Note<input id="spn" placeholder="ex. fractionné 8×400 m"></label></div>
 <button class="btn pri">Enregistrer</button></form>`)+`</div>`;
 const f=$('#spf');if(f)f.addEventListener('submit',ev=>{ev.preventDefault();const m=num($('#spm').value);if(!(m>0))return $('#spm').focus();
  const o={id:nid(),kind:'sport',type:$('#spt').value,date:$('#spd').value||today(),min:Math.round(m),rpe:num($('#spr').value)||'',km:num($('#spk').value)||'',note:$('#spn').value.trim(),t:Date.now()};
  upsert(o);put.sess(o);renderStart();closeSheet();renderEffort();buzz('ok');toast(o.type+' enregistré')})
 if(msKind==='seance')msBar()}
function exHTML(e,i){return `<article class="ex" data-i="${i}"><div class="exh"><input class="exn" data-f="n" value="${esc(e.n)}" list="exlist" placeholder="Nom de l'exercice" aria-label="Exercice ${i+1}"><button class="x" data-act="delEx" aria-label="Supprimer l'exercice">×</button></div>
 <p class="hint" id="h${i}"></p>
 <div class="sets"><div class="set hd"><span></span><div>Charge (kg)</div><div>Reps</div><span></span></div>${e.sets.map((s,j)=>`<div class="set"><span>${j+1}</span><input data-f="w" data-s="${j}" inputmode="decimal" value="${esc(s.w)}" placeholder="kg" aria-label="Charge série ${j+1}"><input data-f="r" data-s="${j}" inputmode="numeric" value="${esc(s.r)}" placeholder="${esc(s.p||'reps')}" aria-label="Reps série ${j+1}"><button class="x" data-act="delSet" data-s="${j}" aria-label="Supprimer la série">×</button></div>`).join('')}</div>
 <div class="row"><button class="btn small" data-act="addSet">+ Série</button><button class="btn small ghost" data-act="tstart">Minuteur de repos</button></div></article>`}
function renderEditor(){const c=S.cur;if(!c)return renderStart();
 $('#editor').innerHTML=`<div class="panel"><div class="edh"><input id="cn" class="tin" value="${esc(c.name)}" aria-label="Nom de la séance"><input id="cd" type="date" value="${esc(c.date)}" aria-label="Date"><select id="crpe" aria-label="Ressenti"><option value="">Ressenti /10</option>${[1,2,3,4,5,6,7,8,9,10].map(i=>`<option value="${i}"${num(c.rpe)===i?' selected':''}>Ressenti ${i}/10</option>`).join('')}</select></div>
 <p class="mute small" id="svst">Enregistrement automatique</p><div>${c.ex.map(exHTML).join('')}</div>
 <button class="btn wide" data-act="addEx">+ Ajouter un exercice</button>
 <div class="foot"><button class="btn pri" data-act="finish">Terminer la séance</button><button class="btn ghost" data-act="discard">Abandonner</button></div></div>`;
 c.ex.forEach((e,i)=>updateHint(i));if(msKind==='seance')msBar()}
function updateHint(i){const el=$('#h'+i);if(!el||!S.cur)return;const e=S.cur.ex[i];if(!e||!norm(e.n)){el.textContent='';return}
 const g=suggest(e.n,S.cur.id);if(!g){el.textContent="Nouvel exercice : pas encore d'historique.";return}
 const adv=g.top<=0?'vise +1 rep par série':g.up?`<span class="up">objectif validé, passe à ${fx(g.w)} kg</span>`:`garde ${fx(g.top)} kg et vise +1 rep (jusqu'à ${esc(S.set.rmax)})`;
 const best=bestE1(e.n,S.cur.id),now=Math.max(0,...e.sets.map(s=>e1(num(s.w),num(s.r))));
 el.innerHTML=`Dernière fois (${dShort(g.L.s.date)}) : <b>${esc(g.sets.map(setTxt).join(' · '))}</b> → ${adv}${best&&now>best?'<span class="pr">Record</span>':''}`}
function dirty(){clearTimeout(sv);const e=$('#svst');if(e)e.textContent='Modification…';sv=setTimeout(saveCur,900)}
function saveCur(){if(!S.cur)return;const o=clone(S.cur);upsert(o);put.sess(o);const e=$('#svst');if(e)e.textContent='Enregistré'}
function startSession(tid){const name=($('#nn')?.value||'').trim(),date=$('#nd')?.value||today();let ex=[{n:'',sets:[{w:'',r:''}]}],nm=name;
 if(tid){const t=S.sessions.find(s=>s.id===tid);if(t){nm=name||t.name;ex=(t.ex||[]).map(e=>({n:e.n,sets:prefill(e.n,null)}))}}
 S.cur={id:nid(),name:nm||'Séance',date,ex,open:true,t:Date.now()};saveCur();renderEditor();if(!tid)$('.exn')?.focus()}
function finish(){const c=S.cur;clearTimeout(sv);
 const ex=c.ex.map(e=>({n:e.n.trim(),sets:e.sets.filter(s=>num(s.r)>0).map(s=>({w:num(s.w),r:num(s.r)}))})).filter(e=>e.n&&e.sets.length);
 if(!ex.length){toast('Rien à enregistrer : note au moins une série avec ses reps.');return}
 const el=Math.round((Date.now()-(c.t||Date.now()))/6e4),dur=c.dur||(c.date===today()&&el>=10&&el<=240?el:'');
 const o={id:c.id,name:(c.name||'').trim()||'Séance',date:c.date||today(),ex,t:c.t||Date.now(),dur,rpe:num(c.rpe)||''};
 upsert(o);put.sess(o);S.cur=null;stopTimer();renderEditor();closeSheet();renderSoft();buzz('ok');
 const prs=ex.filter(e=>{const b=bestE1(e.n,o.id);return b&&Math.max(...e.sets.map(x=>e1(x.w,x.r)))>b}).map(e=>e.n);
 if(prs.length)celebrate(prs.length>1?'Nouveaux records':'Nouveau record',prs.join(', '));else toast('Séance enregistrée'+(dur?` (${dur} min)`:'')+'. Bien joué.')}
function discard(){const c=S.cur;clearTimeout(sv);S.cur=null;stopTimer();S.sessions=S.sessions.filter(s=>s.id!==c.id);put.delSess(c.id);renderEditor();closeSheet();renderSoft();
 toast('Séance abandonnée',()=>{if(S.cur)return toast("Termine d'abord la séance en cours");S.cur=c;saveCur();renderEditor();renderSoft()})}
function editSess(id){if(S.cur)return toast("Termine d'abord la séance en cours");const s=S.sessions.find(s=>s.id===id);if(!s||s.kind==='sport')return;
 S.cur=clone(s);S.cur.open=true;S.cur.ex.forEach(e=>{if(!e.sets.length)e.sets.push({w:'',r:''})});saveCur();renderEditor();openSheet('seance')}
function delSess(id){const s=S.sessions.find(s=>s.id===id);if(!s)return;S.sessions=S.sessions.filter(x=>x.id!==id);put.delSess(id);renderSoft();toast('Supprimé',()=>{upsert(s);put.sess(s);renderSoft()})}
let tEnd=0,tInt=0,actx=null;
function beep(){try{if(!actx)return;const o=actx.createOscillator(),g=actx.createGain();o.frequency.value=880;g.gain.value=.15;o.connect(g);g.connect(actx.destination);o.start();o.stop(actx.currentTime+.35)}catch(e){}}
function unlockAudio(){try{if(!actx){const A=window.AudioContext||window.webkitAudioContext;if(A)actx=new A()}if(actx&&actx.state==='suspended')actx.resume()}catch(e){}}
let tDur=120000;
function startTimer(sec){unlockAudio();document.body.classList.add('timing');tDur=(sec||num(S.set.rest)||120)*1000;tEnd=Date.now()+tDur;$('#tarc').setAttribute('d',arcPath(18,18,13,GA0,GA0+GSPAN));$('#timer').hidden=false;$('#timer').classList.remove('end');$('#tlab').textContent='Repos';clearInterval(tInt);tInt=setInterval(tick,250);tick()}
function tick(){const r=Math.round((tEnd-Date.now())/1000),el=$('#tval');$('#tarc').style.strokeDashoffset=(100-clamp((tEnd-Date.now())/tDur,0,1)*100).toFixed(1);if(r<=0){el.textContent='0:00';if(!$('#timer').classList.contains('end')){$('#timer').classList.add('end');$('#tlab').textContent='Série suivante';buzz('ok');beep();setTimeout(beep,450);try{navigator.vibrate&&navigator.vibrate([200,100,200])}catch(e){}}if(r<-20)stopTimer();return}el.textContent=Math.floor(r/60)+':'+String(r%60).padStart(2,'0')}
function stopTimer(){clearInterval(tInt);$('#timer').hidden=true;document.body.classList.remove('timing')}
function renderMG(){const from=addD(today(),-6),cnt={};MG.forEach(([n])=>cnt[n]=0);let other=0;
 for(const s of done())if(s.kind!=='sport'&&s.date>=from)for(const e of s.ex||[]){const p=plain(e.n),k=e.sets.filter(x=>num(x.r)>0).length;let hit=false;for(const [n,re] of MG)if(re.test(p)){cnt[n]+=k;hit=true}if(!hit)other+=k}
 const mx=25;$('#mg').innerHTML=MG.map(([n])=>`<div class="hrow" data-tip="${esc(`${n} : ${cnt[n]} séries effectives sur 7 jours\n${cnt[n]<10?'sous':cnt[n]>20?'au-dessus de':'dans'} la zone 10 à 20 séries`)}"><span>${n}</span><div class="bar" style="--c:${cnt[n]>=10?'var(--trn)':'color-mix(in srgb,var(--trn) 45%,var(--field))'}"><b class="band" style="left:${10/mx*100}%;width:${10/mx*100}%"></b><i style="width:${Math.min(100,cnt[n]/mx*100)}%"></i></div><span class="num">${cnt[n]} série${cnt[n]>1?'s':''}</span></div>`).join('')+(other?`<p class="mute small">${other} séries sur des exercices non classés.</p>`:'');
 const tot=Object.values(cnt).reduce((a,b)=>a+b,0)+other,top=MG.map(([n])=>n).filter(n=>cnt[n]>0).sort((a,b)=>cnt[b]-cnt[a]),zero=MG.map(([n])=>n).filter(n=>!cnt[n]);
 $('#vd-mg').innerHTML=tot?`<b>${tot} séries</b> cette semaine, surtout ${esc(top.slice(0,2).join(' et ').toLowerCase())}${zero.length&&zero.length<MG.length?`. Rien encore pour ${esc(zero.slice(0,3).join(', ').toLowerCase())}${zero.length>3?'…':'.'}`:'.'}`:'Pas encore de séance de muscu cette semaine.'}
function renderHeat(){const end=today(),wd=(new Date(end+'T12:00').getDay()+6)%7,start=addD(end,-wd-15*7),cells=[];let act28=0;
 for(let i=0;i<16*7;i++){const k=addD(start,i);if(k>end){cells.push('<i class="c f"></i>');continue}const t=dayTrain(k),m=t.mu.length>0||t.ap.some(isStr),s=t.sp.length+t.ap.filter(w=>!isStr(w)).length>0;if((m||s)&&k>addD(end,-28))act28++;const lab=[...t.mu.map(x=>x.name),...t.sp.map(x=>x.type+' '+x.min+' min'),...t.ap.map(w=>(WT[w.ty]||w.ty)+' '+w.min+' min')];const ef=effortOf(k);cells.push(`<i class="c ${m&&s?'b':m?'m':s?'s':''}" data-tip="${esc(dLong(k)+'\n'+(lab.join('\n')||'Repos')+(ef!=null?'\nEffort '+ef:''))}"></i>`)}
 $('#heat').innerHTML=`<div class="hm">${cells.join('')}</div>`;$('#vd-heat').innerHTML=`<b>${act28} jour${act28>1?'s':''} actif${act28>1?'s':''}</b> sur les 28 derniers${act28>=12?' : belle régularité.':act28>=6?'.':' : un peu de mouvement en plus ferait du bien.'}`}
function renderLoad(){const e=today(),from=addD(e,-120),A=[],C=[];for(let d=from;d<=e;d=addD(d,1)){const x=acwr(d);A.push({x:d,y:Math.round(x.a)});C.push({x:d,y:Math.round(x.c)})}
 const x=acwr(e),mo0=monotony(e);$('#vd-ld').innerHTML=x.r==null?'Il faut 3 semaines de suivi pour comparer ta charge à ton habitude.':x.r>1.5?'<b>Hausse brutale de la charge</b> : lève le pied quelques jours pour laisser ton corps suivre.':x.r>1.3?'<b>Charge en hausse</b> : surveille ton énergie et ton sommeil.':x.r>=0.8?'<b>Charge stable</b> : tu progresses sans à-coup.'+(mo0&&mo0.mono>2?' Varie davantage les intensités d\'un jour à l\'autre.':''):'<b>Charge en baisse</b> : tu as de la marge pour augmenter progressivement.';
 $('#lk').innerHTML=`<div><b>${r0(x.a)}</b><span>charge des 7 derniers jours</span></div><div><b>${r0(x.c)}</b><span>moyenne hebdo sur 28 jours</span></div>`+(x.r!=null?`<div><b class="${x.r>1.5?'dn':x.r>=0.8&&x.r<=1.3?'gd':''}">${f2(x.r)}</b><span>ratio aigu / chronique</span></div>`:'')+(()=>{const mo=monotony(e);return mo?`<div><b class="${mo.mono>2?'dn':''}">${f2(mo.mono)}</b><span>monotonie (risque au-delà de 2)</span></div>`:''})();
 setFig('#fl',{series:[{name:'Moyenne hebdo 28 j',pts:C,col:'var(--mute)',w:2,dash:true},{name:'Charge 7 j',pts:A,col:'var(--eff)',last:true}],zero:true,fmt:r0,empty:"Pas encore de charge mesurée"})}
function exNames(){const m=new Map();for(const s of done())for(const e of s.ex||[]){const k=norm(e.n);if(!k)continue;if(!m.has(k))m.set(k,{n:e.n,c:0});m.get(k).c++}return[...m.values()].sort((a,b)=>b.c-a.c)}
function renderForce(){const names=exNames(),sel=$('#pex'),cv=sel.value;
 sel.innerHTML=names.length?names.map(x=>`<option value="${esc(x.n)}">${esc(x.n)} (${x.c} séance${x.c>1?'s':''})</option>`).join(''):"<option value=''>Aucun exercice pour l'instant</option>";
 if(cv&&names.some(x=>x.n===cv))sel.value=cv;
 const k=norm(sel.value),rows=[];
 for(const s of done().slice().reverse()){const e=(s.ex||[]).find(e=>norm(e.n)===k);if(!e)continue;let b=null;for(const x of e.sets){const v=e1(num(x.w),num(x.r));if(!b||v>b.v||(v===b.v&&num(x.r)>num(b.x.r)))b={v,x}}if(b)rows.push({d:s.date,x:b.x,v:b.v})}
 const bodyw=rows.length&&rows.every(r=>!r.v),pts=rows.map(r=>({x:r.d,y:bodyw?num(r.x.r):Math.round(r.v*10)/10})).filter(p=>p.y>0),u=bodyw?' reps':' kg';
 setFig('#f1',{unit:u.trim(),series:[{name:bodyw?'Reps max':'1RM estimé',pts,col:'var(--trn)',dots:pts.length<=40,last:true}],empty:'Encore une séance sur cet exercice et la courbe apparaît'});
 $('#pk').innerHTML=pts.length?`<div><b>${fx(pts[pts.length-1].y)}${u}</b><span>${bodyw?'reps max':'1RM estimé'}, dernière séance</span></div><div><b>${fx(Math.max(...pts.map(p=>p.y)))}${u}</b><span>meilleur</span></div><div><b class="${pts[pts.length-1].y>=pts[0].y?'up':''}">${sg(pts[pts.length-1].y-pts[0].y)}${u}</b><span>depuis le ${dShort(pts[0].x)}</span></div>`:'';
 $('#vd-f1').innerHTML=pts.length>=2?`${esc(sel.value)} : <b>${sg(Math.round((pts[pts.length-1].y-pts[0].y)*10)/10)}${u}</b> ${bodyw?'':'d\'1RM estimé '}depuis le ${dShort(pts[0].x)}.`:'';
 $('#ptab').innerHTML=rows.length?`<table><thead><tr><th>Date</th><th>Meilleure série</th><th class="num">1RM est.</th></tr></thead><tbody>${rows.slice(-6).reverse().map(r=>`<tr><td>${dShort(r.d)}</td><td>${esc(setTxt(r.x))}</td><td class="num">${r.v?fx(r.v)+' kg':'–'}</td></tr>`).join('')}</tbody></table>`:''}
function renderRecs(){const m=new Map();for(const s of done())if(s.kind!=='sport')for(const e of s.ex||[]){const k=norm(e.n);if(!k)continue;const o=m.get(k)||{n:e.n,e1:0,e1d:'',hw:0,hwd:'',hws:null,mr:0};for(const x of e.sets){const v=e1(num(x.w),num(x.r));if(v>o.e1){o.e1=v;o.e1d=s.date}if(num(x.w)>o.hw||(num(x.w)===o.hw&&num(x.r)>num(o.hws&&o.hws.r))){o.hw=num(x.w);o.hwd=s.date;o.hws=x}o.mr=Math.max(o.mr,num(x.r))}m.set(k,o)}
 const L=[...m.values()].sort((a,b)=>b.e1-a.e1),lr=L.filter(o=>o.e1d).sort((a,b)=>b.e1d.localeCompare(a.e1d))[0];
 $('#vd-rec').innerHTML=lr?`Dernier record : <b>${esc(lr.n)}</b>, ${fx(lr.e1)} kg estimés le ${dShort(lr.e1d)}.`:'';
 $('#recs').innerHTML=L.length?`<table><thead><tr><th>Exercice</th><th>Série la plus lourde</th><th class="num">Meilleur 1RM est.</th><th class="num">Date</th></tr></thead><tbody>${L.map(o=>`<tr><td>${esc(o.n)}</td><td>${o.hws?esc(setTxt(o.hws)):'–'}</td><td class="num">${o.e1?fx(o.e1)+' kg':o.mr+' reps'}</td><td class="num">${dShort(o.e1d||o.hwd)}</td></tr>`).join('')}</tbody></table>${L.length>6?`<button type="button" class="btn small mall" data-act="showall" data-t="#recs">Afficher les ${L.length} exercices</button>`:''}`:'<p class="mute empty">Tes records apparaîtront après tes premières séances.</p>'}
function renderHist(){const open=new Set($$('#hist details[open]').map(d=>d.dataset.id)),E=[];
 const dates=new Set(done().map(s=>s.date));for(const d of hKeys().slice(-120))if((H(d).wk||[]).length)dates.add(d);
 for(const d of dates){const t=dayTrain(d);for(const s of t.mu)E.push({d,k:'mu',s,att:t.att.filter(isStr)});for(const s of t.sp)E.push({d,k:'sp',s,att:t.att.filter(w=>(WT[w.ty]||'')===s.type)});t.ap.forEach((w,i)=>E.push({d,k:'ap',w}))}
 E.sort((a,b)=>b.d.localeCompare(a.d)||(b.s?.t||0)-(a.s?.t||0));
 if(!E.length){$('#hist').innerHTML='<p class="mute empty">Tes séances et activités apparaîtront ici.</p>';return}
 const watch=a=>a.length?` · montre ${a.map(w=>w.min+' min'+(w.hr?', '+w.hr+' bpm':'')).join(', ')}`:'';
 $('#hist').innerHTML=E.slice(0,histN).map(e=>{
  if(e.k==='mu'){const s=e.s,ton=(s.ex||[]).reduce((a,x)=>a+x.sets.reduce((b,y)=>b+num(y.w)*num(y.r),0),0),w=e.att[0];
   return `<details class="je" data-id="${esc(s.id)}"${open.has(s.id)?' open':''} style="--c:var(--trn)"><summary><span class="dt">${dShort(e.d)}</span><i class="dot"></i><span class="tl">${esc(s.name)}</span><span class="mt">${(s.ex||[]).length} exos · ${fx(ton/1000)} t${s.dur?' · '+esc(s.dur)+' min':''}${s.rpe?' · '+esc(s.rpe)+'/10':''}${esc(watch(e.att))}</span></summary>
   <div class="jb">${w?zbar(w.z)+zleg(w.z):''}${(s.ex||[]).map(x=>`<div class="hx"><b>${esc(x.n)}</b><span>${esc(x.sets.map(setTxt).join(' · '))}</span></div>`).join('')}<div class="row"><button class="btn small" data-act="edit" data-id="${esc(s.id)}">Modifier</button><button class="btn small ghost" data-act="delSess" data-id="${esc(s.id)}">Supprimer</button></div></div></details>`}
  if(e.k==='sp'){const s=e.s,w=e.att[0];return `<details class="je" data-id="${esc(s.id)}"${open.has(s.id)?' open':''} style="--c:var(--eff)"><summary><span class="dt">${dShort(e.d)}</span><i class="dot"></i><span class="tl">${esc(s.type)}</span><span class="mt">${esc(s.min)} min${s.km?' · '+fx(s.km)+' km':''}${s.rpe?' · '+esc(s.rpe)+'/10':''}${esc(watch(e.att))}</span></summary>
   <div class="jb">${w?zbar(w.z)+zleg(w.z):''}${s.note?`<p class="small">${esc(s.note)}</p>`:''}<div class="row"><button class="btn small ghost" data-act="delSess" data-id="${esc(s.id)}">Supprimer</button></div></div></details>`}
  const w=e.w;return `<details class="je" style="--c:color-mix(in srgb,var(--eff) 55%,var(--field))"><summary><span class="dt">${dShort(e.d)}</span><i class="dot"></i><span class="tl">${esc(WT[w.ty]||w.ty)} <span class="mute small">· montre</span></span><span class="mt">${esc(w.min)} min${w.km?' · '+fx(w.km)+' km':''}${w.hr?' · '+esc(w.hr)+' bpm':''}${w.tr?' · dépense '+r0(100*(1-Math.exp(-w.tr/110))):''}</span></summary><div class="jb">${zbar(w.z)+zleg(w.z)}<p class="mute small">${w.kcal?esc(w.kcal)+' kcal · ':''}${w.mx?'FC max '+esc(w.mx)+' bpm · ':''}importé d'Apple Santé</p></div></details>`}).join('')
 +(E.length>histN?`<div class="row"><button class="btn small" data-act="more">Voir plus (${E.length-histN})</button></div>`:'')}

/* ---------- nutrition ---------- */
function meter(l,v,t,u,sub,cls,col){return `<div class="${cls}" style="--c:${col}"><div class="mh"><span class="eyebrow">${l}</span><b class="big">${r0(v)}<small> / ${r0(t)} ${u}</small></b></div><div class="bar"><i style="width:${Math.min(100,t?v/t*100:0)}%"></i></div><p class="mute small">${sub}</p></div>`}
function renderNutri(){const d=S.day,D=S.days[d]||{},it=D.items||[],Pr=sum(it,'p'),G=sum(it,'g'),Li=sum(it,'l'),K=it.reduce((a,x)=>a+kcalOf(x),0),T=num(S.set.prot),KT=num(S.set.kcal),h=H(d),out=num(h.bs)+num(h.ac);
 if(document.activeElement!==$('#nday'))$('#nday').value=d;
 if(!$('#fm').options.length){const hr=new Date().getHours();$('#fm').innerHTML=MEALS.map(m=>`<option>${m}</option>`).join('');$('#fm').value=hr<11?'Petit-déjeuner':hr<15?'Déjeuner':hr<18?'Collation':'Dîner'}
 const Wn=weights(),wkk=Object.keys(Wn).sort(),wtn=wkk.length?wAvg(Wn,wkk[wkk.length-1]):null;
 $('#meters').innerHTML=meter('Protéines',Pr,T,'g',(Pr>=T?'Objectif atteint':'Il reste '+r0(T-Pr)+' g')+(wtn?` · ${fx(Pr/wtn)} g/kg`:''),Pr>=T?'ok':'','var(--nut)')+meter('Calories',K,KT,'kcal',K>KT?r0(K-KT)+' kcal au-dessus':'Il reste '+r0(KT-K)+' kcal',K>KT*1.05?'over':'','var(--nut)')
  +(out?meter('Calories brûlées',out,out,'kcal',`${r0(num(h.bs))} de base + ${r0(num(h.ac))} actives`+(K?` · bilan <b>${K-out>0?'+':''}${r0(K-out)}</b>`:''),'','var(--eff)'):`<div><span class="eyebrow">Calories brûlées</span><p class="mute small">Tes calories brûlées de ce jour apparaîtra après ${IMP('un import Apple couvrant cette date','la synchro Apple Santé de cette date')}.</p></div>`);
 const mk=Pr*4+G*4+Li*9;$('#macros').innerHTML=mk&&(G||Li)?`<div class="mh small"><span>Macros : <b>${r0(Pr)} g</b> protéines · <b>${r0(G)} g</b> glucides · <b>${r0(Li)} g</b> lipides</span><span class="mute">${r0(Pr*4/mk*100)} / ${r0(G*4/mk*100)} / ${r0(Li*9/mk*100)} % des kcal</span></div><div class="macro"><i style="width:${Pr*4/mk*100}%;background:var(--nut)"></i><i style="width:${G*4/mk*100}%;background:var(--wat)"></i><i style="width:${Li*9/mk*100}%;background:var(--hrt)"></i></div>`:'';
 $('#hday').textContent=h.wa&&!num(D.w)?`Eau notée dans Apple Santé : ${fx(h.wa/1000)} L`:'';
 $('#favs').innerHTML=S.set.foods.map((f,k)=>`<button class="chip" data-act="fav" data-k="${k}"><b>${esc(f.n)}</b><span>${fx(num(f.p))} g · ${r0(kcalOf(f))} kcal</span></button>`).join('')||'<p class="mute small">Coche « Garder dans mes favoris » en ajoutant un aliment.</p>';
 const byM={};it.forEach((x,k)=>{const m=x.m||'Sans repas';(byM[m]||(byM[m]=[])).push([x,k])});
 $('#flist').innerHTML=[...MEALS,'Sans repas'].filter(m=>byM[m]||m!=='Sans repas').map(m=>`<div class="mealh"><span>${m}</span><span>${byM[m]?`${r0(byM[m].reduce((a,[x])=>a+num(x.p),0))} g · ${r0(byM[m].reduce((a,[x])=>a+kcalOf(x),0))} kcal`:''}</span></div><ul class="flist meal" style="margin:0">${(byM[m]||[]).map(([x,k])=>`<li><span>${esc(x.n)}${x.g||x.l?`<span class="ml">G ${fx(num(x.g))} g · L ${fx(num(x.l))} g</span>`:''}</span><span class="num">${fx(num(x.p))} g</span><span class="num">${r0(kcalOf(x))} kcal</span><button class="x" data-act="delFood" data-k="${k}" aria-label="Supprimer">×</button></li>`).join('')}${m!=='Sans repas'?`<li class="addf"><button type="button" data-act="foodadd" data-m="${m}">Ajouter un aliment</button></li>`:''}</ul>`).join('');
 const bw=$('#bw');if(document.activeElement!==bw)bw.value=has(D.bw)?String(D.bw).replace('.',','):'';
 const wat=num(D.w),wt=num(S.set.water);
 $('#water').innerHTML=`<div class="mh"><span class="eyebrow">${d===today()?"Aujourd'hui":dShort(d)}</span><b class="big">${fx(wat/1000)}<small> / ${fx(wt/1000)} L</small></b></div><div class="bar" style="--c:var(--wat)"><i style="width:${Math.min(100,wat/wt*100)}%"></i></div><div class="row"><button class="btn small" data-act="water" data-v="250">+ 25 cl</button><button class="btn small" data-act="water" data-v="330">+ 33 cl</button><button class="btn small" data-act="water" data-v="500">+ 50 cl</button><button class="btn small ghost" data-act="water" data-v="-250">− 25 cl</button></div>`;
 const tk=D.sup||[];$('#sups').innerHTML=S.set.sups.length?`<div class="chips">${S.set.sups.map(s=>`<button class="chip ${tk.includes(s)?'on':''}" data-act="sup" data-s="${esc(s)}">${tk.includes(s)?'✓ ':''}${esc(s)}</button>`).join('')}</div><p class="mute small">Touche pour cocher ce que tu as pris.</p>`:'<p class="mute small">Ajoute tes compléments dans Plus → Réglages.</p>';
 const L=[];for(let i=13;i>=0;i--){const k=addD(d,-i),its=dayIt(k);L.push({k,p:sum(its,'p'),c:its.reduce((a,x)=>a+kcalOf(x),0),has:its.length>0})}
 const hv=L.filter(x=>x.has),mp=Math.max(T*1.25,...L.map(x=>x.p));
 $('#nk').innerHTML=hv.length?`<div><b>${r0(avg(hv.map(x=>x.p)))} g</b><span>protéines / jour</span></div><div><b>${r0(avg(hv.map(x=>x.c)))}</b><span>kcal / jour</span></div><div><b>${hv.filter(x=>x.p>=T).length} / ${hv.length}</b><span>jours à l'objectif</span></div>`:'';
 const td=tdeeEst(),gw=num(S.set.goalw),ab=[];for(let i=1;i<=14;i++){const h2=H(addD(today(),-i));if(h2.bs||h2.ac)ab.push(num(h2.bs)+num(h2.ac))}const apl=avg(ab);
 $('#tdee').innerHTML=td?`<div class="kpis"><div><b>${r0(td.t)} kcal</b><span>besoins réels par jour</span></div><div><b>${r0(td.intake)} kcal</b><span>apport moyen (${td.n} jours notés)</span></div><div><b>${sg(Math.round(td.wk*100)/100)} kg</b><span>par semaine (tendance du poids)</span></div>${apl?`<div><b>${r0(apl)} kcal</b><span>dépense selon la montre</span></div>`:''}</div><p class="small">Calculée à partir de ce que tu manges et de la pente de ton poids sur 3 semaines (régression sur toutes tes pesées ; 1 kg ≈ 7 700 kcal). Fiable seulement si tu notes tout ce que tu manges les jours renseignés : un oubli fait paraître ta dépense plus basse qu'en réalité.${gw&&wtn?` Pour aller vers ${fx(gw)} kg, vise environ <b>${r0(td.t+(gw>wtn?300:-450))} kcal par jour</b> (${gw>wtn?'léger surplus pour prendre du muscle en limitant le gras':'déficit modéré pour perdre du gras en gardant le muscle'}).`:''}${apl&&Math.abs(apl-td.t)>250?` La montre ${apl>td.t?'surestime':'sous-estime'} ta dépense d'environ ${r0(Math.abs(apl-td.t))} kcal.`:''}</p>`:'<p class="mute small">Note tes repas au moins 10 jours sur 3 semaines et pèse-toi régulièrement : l\'appli calculera ta vraie dépense à partir de l\'évolution de ton poids.</p>';
 $('#prot14').innerHTML=L.map(x=>`<div class="hrow ${x.p>=T?'ok':''}" style="--c:var(--nut)" data-tip="${esc(x.has?`${dLong(x.k)}\n${r0(x.p)} g de protéines (${x.p>=T?'objectif atteint':'il manquait '+r0(T-x.p)+' g'})\n${r0(x.c)} kcal`:dLong(x.k)+' : rien de noté')}"><span>${dWk(x.k)}</span><div class="bar"><i style="width:${x.p/mp*100}%"></i><b class="tg" style="left:${T/mp*100}%"></b></div><span class="num">${x.has?r0(x.p)+' g':'–'}</span></div>`).join('')}
function addFood(f,m){if(!f)return;const d=S.day,o={n:f.n,p:num(f.p),k:Math.round(kcalOf(f)),m:m||$('#fm').value};if(num(f.g))o.g=num(f.g);if(num(f.l))o.l=num(f.l);getDay(d).items.push(o);put.day(d);renderNutri()}
function delFood(k){const d=S.day,D=getDay(d),x=D.items.splice(k,1)[0];put.day(d);renderNutri();toast('Aliment retiré',()=>{getDay(d).items.splice(k,0,x);put.day(d);renderNutri()})}

/* ---------- tendances ---------- */
 function renderMarkers(){const m=markers(),gm=m.filter(x=>x.st[1]==='var(--rec)'),wm=m.filter(x=>x.st[1]==='var(--bad)'||x.st[0]==='À améliorer');$('#vd-mk').innerHTML=m.length?`<b>${gm.length} repère${gm.length>1?'s':''} sur ${m.length}</b> au vert${wm.length?`. À travailler : ${esc(wm.slice(0,2).map(x=>x.t.toLowerCase()).join(', '))}`:''}.`:'';$('#mkrs').innerHTML=m.length?m.map(x=>`<div class="mkr"><div class="t2"><span>${x.t}</span><span class="st" style="--c:${x.st[1]}">${x.st[0]}</span></div><b>${esc(x.v)}</b><p>${x.p}</p></div>`).join('')+(m.length>4?`<button type="button" class="btn mall" data-act="showall" data-t="#mkrs">Afficher les ${m.length} repères</button>`:''):'<p class="mute small">'+IMP('Importe Apple Santé et note ton poids pour obtenir ton bilan.','Connecte Apple Santé et note ton poids pour obtenir ton bilan.')+'</p>';
 const R14=k=>{let n=0;for(let i=0;i<14;i++)if(k(addD(today(),-i)))n++;return n};let streak=0;for(let i=0;i<400;i++){const d=addD(today(),-i);const j=J(d);if(j.mood||j.energy||j.stress||j.sore)streak++;else if(i>0)break}
 const W=weights(),L=hLast(),rs=[['Nuits suivies',R14(d=>H(d).sl),'montre portée la nuit'],['Repas notés',R14(d=>dayIt(d).length),'jours avec nutrition'],['Check-ins',R14(d=>J(d).mood||J(d).energy),'jours remplis'],['Pesées',R14(d=>W[d]),'jours pesés']];
 $('#rig').innerHTML=rs.map(([t,n,s])=>`<div class="stat"><b style="color:${n>=11?'var(--rec)':n>=6?'var(--str)':'var(--bad)'}">${n} <small>/ 14</small></b><span>${t} · ${s}</span></div>`).join('')+`<div class="stat"><b>${streak} <small>j</small></b><span>série de check-ins en cours</span></div>`+(L?`<div class="stat"><b>${dShort(L)}</b><span>dernières données Apple${today()>addD(L,3)?IMP(' : pense à réimporter',' : synchronise Apple Santé'):''}</span></div>`:'')}
function renderTrends(){renderMarkers();renderRecap();const e=today(),s0=addD(e,-6),p0=addD(e,-13),p1=addD(e,-7);$('#wkr').textContent=`du ${dShort(s0)} au ${dShort(e)}, vs les 7 jours d'avant`;
 const rng=(a,b)=>{const r=[];for(let d=a;d<=b;d=addD(d,1))r.push(d);return r},A=rng(s0,e),B=rng(p0,p1);
 const hv=(ds,k)=>avg(ds.map(d=>num(H(d)[k])).filter(x=>x>0)),sc=(ds,f)=>avg(ds.map(f).filter(x=>x!=null));
 const nut=(ds,f)=>avg(ds.filter(d=>dayIt(d).length).map(f));
 const tr=ds=>{let n=0,m=0,t=0;for(const d of ds){const x=dayTrain(d);n+=x.mu.length+x.sp.length+x.ap.length;m+=x.min;for(const s of x.mu)t+=(s.ex||[]).reduce((a,y)=>a+y.sets.reduce((b,z)=>b+num(z.w)*num(z.r),0),0)}return{n,m,t}};
 const W=weights(),jm=(ds,k)=>avg(ds.map(d=>J(d)[k]).filter(Boolean)),ta=tr(A),tb=tr(B);
 const rows=[['Énergie',sc(A,d=>recovery(d)?.s),sc(B,d=>recovery(d)?.s),v=>r0(v)+' %',1,3],['Dépense moyenne',sc(A,effortOf),sc(B,effortOf),r0,0,3],['Score de sommeil',sc(A,d=>sleepScore(d)?.s),sc(B,d=>sleepScore(d)?.s),r0,1,3],['Sommeil moyen',hv(A,'sl'),hv(B,'sl'),fmtSl,1,15],['VFC nocturne',avg(A.map(nhrv).filter(Boolean)),avg(B.map(nhrv).filter(Boolean)),v=>r0(v)+' ms',1,2],['FC au repos',hv(A,'rhr'),hv(B,'rhr'),v=>r0(v)+' bpm',-1,1],['Stress estimé',hv(A,'stz'),hv(B,'stz'),r0,-1,5],['Pas par jour',hv(A,'st'),hv(B,'st'),r0,1,500],['Séances',ta.n,tb.n,r0,1,1],['Temps d\'entraînement',ta.m,tb.m,v=>r0(v)+' min',1,20],['Tonnage muscu',ta.t,tb.t,v=>fx(v/1000)+' t',1,500],['Protéines / jour',nut(A,d=>sum(dayIt(d),'p')),nut(B,d=>sum(dayIt(d),'p')),v=>r0(v)+' g',1,5],['Calories / jour',nut(A,d=>dayIt(d).reduce((a,x)=>a+kcalOf(x),0)),nut(B,d=>dayIt(d).reduce((a,x)=>a+kcalOf(x),0)),r0,0,100],['Poids (moy. 7 j)',wAvg(W,e),wAvg(W,p1),v=>fx(v)+' kg',0,.2],['Humeur',jm(A,'mood'),jm(B,'mood'),v=>fx(v)+' / 5',1,.3],['Énergie',jm(A,'energy'),jm(B,'energy'),v=>fx(v)+' / 5',1,.3],['Stress ressenti',jm(A,'stress'),jm(B,'stress'),v=>fx(v)+' / 5',-1,.3]];
 $('#week').innerHTML=`<table><thead><tr><th>Mesure</th><th class="num">Cette semaine</th><th class="num">Semaine d'avant</th><th class="num">Évolution</th></tr></thead><tbody>${rows.map((r,i)=>[...r,[0,1,2,3,7,8,9,13].includes(i)]).filter(r=>r[1]!=null||r[2]!=null).map(([l,a,b,f,dir,th,ess])=>{let ev='–';if(a!=null&&b!=null){const df=a-b;ev=Math.abs(df)<th?'stable':`<span class="${dir===0?'':(df*dir>0?'gd':'dn')}">${df>0?'▲':'▼'} ${f(Math.abs(df))}</span>`}return `<tr${ess?'':' class="adv-s"'}><td>${l}</td><td class="num" data-l="Cette semaine">${a!=null?f(a):'–'}</td><td class="num" data-l="Semaine d'avant">${b!=null?f(b):'–'}</td><td class="num" data-l="Évolution">${ev}</td></tr>`}).join('')}</tbody></table>`;
 {const R=rows.filter(r=>r[1]!=null&&r[2]!=null&&r[4]!==0&&Math.abs(r[1]-r[2])>=r[5]),up=R.filter(r=>(r[1]-r[2])*r[4]>0).map(r=>r[0].toLowerCase()),dn=R.filter(r=>(r[1]-r[2])*r[4]<0).map(r=>r[0].toLowerCase()),uq=a=>[...new Set(a)];
  $('#vd-wk').innerHTML=R.length?`Par rapport à la semaine d'avant : <b>${up.length} en progrès</b>${up.length?` (${esc(uq(up).slice(0,3).join(', '))})`:''}${dn.length?`, ${dn.length} en recul (${esc(uq(dn).slice(0,3).join(', '))})`:''}.`:'Pas encore deux semaines à comparer.'}
 const ins=insights();$('#insights').innerHTML=ins.length?ins.map(x=>`<li style="--c:${x.c}"><div><b>${x.t}</b><span>${x.s}</span></div></li>`).join(''):'<li style="--c:var(--line)"><div><b>Pas encore assez de données croisées.</b><span>'+IMP('Importe Apple Santé et remplis ton check-in quelques semaines.','Connecte Apple Santé et remplis ton check-in quelques semaines.')+'</span></div></li>';
 const fr=addD(e,-60),js=k=>{const o=[];for(let d=fr;d<=e;d=addD(d,1)){const v=[];for(let i=0;i<7;i++){const x=J(addD(d,-i))[k];if(x)v.push(x)}if(J(d)[k]&&v.length)o.push({x:d,y:Math.round(avg(v)*100)/100})}return o};
 setFig('#fj',{tf:v=>fx(v)+' / 5',series:[{name:'Humeur',avg:true,pts:js('mood'),col:'var(--mind)',last:true},{name:'Énergie',avg:true,pts:js('energy'),col:'var(--nut)',last:true},{name:'Stress ressenti',pts:js('stress'),col:'var(--bad)',last:true}],ymin:1,ymax:5,empty:'Remplis ton check-in pour voir cette courbe'});
 renderBody()}
function insights(){const e=hLast()||today(),from=addD(e,-120),out=[],T=num(S.set.sleep),days=[];for(let d=from;d<=e;d=addD(d,1))days.push(d);
 const cmp=(A,B,f)=>{const a=A.map(f).filter(x=>x!=null&&x>0),b=B.map(f).filter(x=>x!=null&&x>0);if(a.length<5||b.length<5)return null;const ma=avg(a),mb=avg(b),se=Math.sqrt(sdv(a)**2/a.length+sdv(b)**2/b.length);return Math.abs(ma-mb)>2*se?{a:ma,b:mb,na:a.length,nb:b.length}:null};
 const pct=(x,y)=>Math.round((x/y-1)*100),hv=d=>nhrv(d)||num(H(d).hrv)||null;
 const good=days.filter(d=>num(H(d).sl)>=T),bad=days.filter(d=>H(d).sl&&num(H(d).sl)<T-45);
 let r=cmp(good,bad,hv);if(r&&Math.abs(pct(r.a,r.b))>=5)out.push({c:'var(--mind)',t:`Après une nuit d'au moins ${fmtSl(T)}, ta VFC est ${pct(r.a,r.b)>0?'plus haute':'plus basse'} de ${Math.abs(pct(r.a,r.b))} %.`,s:`${r0(r.a)} contre ${r0(r.b)} ms après les nuits de moins de ${fmtSl(T-45)} (${r.na} et ${r.nb} nuits).`});
 const hi=days.filter(d=>(effortOf(d)||0)>=70),lo=days.filter(d=>{const x=effortOf(d);return x!=null&&x<35});
 r=cmp(hi,lo,d=>recovery(addD(d,1))?.s);if(r&&Math.abs(r.a-r.b)>=4)out.push({c:'var(--eff)',t:`Après une dépense de 70 ou plus, ton énergie du lendemain est ${r.a<r.b?'plus basse':'plus haute'} de ${r0(Math.abs(r.a-r.b))} points.`,s:`${r0(r.a)} % contre ${r0(r.b)} % après les journées calmes (${r.na} et ${r.nb} jours). Prévois une journée plus légère après tes grosses séances.`});
 r=cmp(hi,lo,d=>num(H(addD(d,1)).sl)||null);if(r&&Math.abs(r.a-r.b)>=10)out.push({c:'var(--slp)',t:`Les jours de forte dépense, tu dors ${fmtSl(Math.abs(r.a-r.b))} ${r.a>r.b?'de plus':'de moins'} la nuit suivante.`,s:`${fmtSl(r.a)} contre ${fmtSl(r.b)} (${r.na} et ${r.nb} nuits).`});
 const late=days.filter(d=>has(H(d).sb)&&H(d).sb>=750),early=days.filter(d=>has(H(d).sb)&&H(d).sb<=690);
 r=cmp(late,early,d=>num(H(d).sl)||null);if(r&&Math.abs(r.a-r.b)>=10)out.push({c:'var(--slp)',t:`Te coucher après 00:30 te coûte en moyenne ${fmtSl(Math.abs(r.b-r.a))} de sommeil.`,s:`${fmtSl(r.a)} contre ${fmtSl(r.b)} avant 23:30 (${r.na} et ${r.nb} nuits).`});
 r=cmp(late,early,d=>sleepScore(d)?.s);if(r&&Math.abs(r.a-r.b)>=5)out.push({c:'var(--slp)',t:`Ton score de sommeil perd ${r0(Math.abs(r.b-r.a))} points quand tu te couches tard.`,s:`${r0(r.a)} contre ${r0(r.b)}.`});
 const st=num(S.set.steps),act=days.filter(d=>num(H(d).st)>=st),sed=days.filter(d=>H(d).st&&num(H(d).st)<st*0.6);
 r=cmp(act,sed,d=>sleepScore(addD(d,1))?.s);if(r&&Math.abs(r.a-r.b)>=4)out.push({c:'var(--eff)',t:`Quand tu dépasses ${r0(st)} pas, ton score de sommeil suivant est ${r.a>r.b?'meilleur':'moins bon'} de ${r0(Math.abs(r.a-r.b))} points.`,s:`Comparé aux jours sous ${r0(st*0.6)} pas (${r.na} et ${r.nb} nuits).`});
 const sh=days.filter(d=>num(H(d).stz)>=25),sl2=days.filter(d=>has(H(d).stz)&&num(H(d).stz)<10);
 r=cmp(sh,sl2,d=>hv(addD(d,1)));if(r&&Math.abs(pct(r.a,r.b))>=5)out.push({c:'var(--str)',t:`Après une journée stressante, ta VFC de la nuit est ${pct(r.a,r.b)<0?'plus basse':'plus haute'} de ${Math.abs(pct(r.a,r.b))} %.`,s:`${r0(r.a)} contre ${r0(r.b)} ms (${r.na} et ${r.nb} jours).`});
 for(const tag of S.set.tags){const w=days.filter(d=>(J(d).tags||[]).includes(tag)),wo=days.filter(d=>J(d).mood&&!(J(d).tags||[]).includes(tag));if(w.length<5)continue;
  const t1=cmp(w,wo,d=>hv(addD(d,1))),a=t1&&t1.a,b=t1&&t1.b;
  if(a&&b&&Math.abs(pct(a,b))>=5)out.push({c:'var(--mind)',t:`Les jours « ${esc(tag)} », ta VFC de la nuit suivante est ${pct(a,b)>0?'plus haute':'plus basse'} de ${Math.abs(pct(a,b))} %.`,s:`${r0(a)} contre ${r0(b)} ms (${w.length} jours étiquetés).`});
  const t2=cmp(w,wo,d=>sleepScore(addD(d,1))?.s),sa=t2&&t2.a,sb=t2&&t2.b;if(sa&&sb&&Math.abs(sa-sb)>=5)out.push({c:'var(--slp)',t:`« ${esc(tag)} » ${sa<sb?'abaisse':'améliore'} ton score de sommeil de ${r0(Math.abs(sa-sb))} points en moyenne.`,s:`${r0(sa)} contre ${r0(sb)}.`})}
 const te=cmp(good,bad,d=>J(d).energy||null),ea=te&&te.a,eb=te&&te.b;
 if(ea&&eb&&Math.abs(ea-eb)>=0.3)out.push({c:'var(--nut)',t:`Ton énergie ressentie est de ${fx(ea)} / 5 après une bonne nuit, contre ${fx(eb)} après une nuit courte.`,s:'D\'après ton check-in.'});
 const n30=[];for(let i=0;i<30;i++){const d=addD(today(),-i);if(dayIt(d).length)n30.push(sum(dayIt(d),'p'))}
 if(n30.length>=5){const ok=n30.filter(x=>x>=num(S.set.prot)).length;out.push({c:'var(--nut)',t:`Objectif protéines atteint ${ok} jours sur ${n30.length} notés ce mois-ci.`,s:`Moyenne : ${r0(avg(n30))} g par jour pour ${r0(S.set.prot)} g visés.`})}
 const s7=vals('sl',e,7,0);if(s7.length>=5){const debt=s7.reduce((a,x)=>a+Math.max(0,T-x),0);if(debt>=60)out.push({c:'var(--slp)',t:`Dette de sommeil sur 7 nuits : ${fmtSl(debt)}.`,s:`Une ou deux nuits plus longues aident à la résorber.`})}
 const vb=nhrvBase(e),v3=avg([0,1,2].map(i=>nhrv(addD(e,-i))).filter(Boolean));if(vb&&v3&&v3<vb.m-vb.s)out.push({c:'var(--mind)',t:'Ta VFC nocturne est sous ta normale depuis plusieurs nuits.',s:`${r0(v3)} ms contre ${r0(vb.m)} ms habituellement. Signe de fatigue accumulée : allège l'entraînement et soigne ton sommeil.`});
 const ac=acwr(today());if(ac.r!=null&&(ac.r>1.5||ac.r<0.7))out.push({c:'var(--eff)',t:ac.r>1.5?`Ta charge d'entraînement a bondi : ratio ${f2(ac.r)}.`:`Ta charge d'entraînement est en baisse : ratio ${f2(ac.r)}.`,s:ac.r>1.5?'Une hausse brutale augmente le risque de blessure.':'Normal après une semaine de repos ; sinon, reprends progressivement.'});
 const tb=base('tp',e,30),t3=[0,1,2].map(i=>H(addD(e,-i)).tp).filter(has);if(tb!=null&&t3.length>=2){const dv=avg(t3.map(num))-tb;if(dv>=0.4)out.push({c:'var(--hrt)',t:`Température au poignet en hausse : ${sg(Math.round(dv*100)/100)} °C.`,s:'Peut signaler un début d\'infection, une fatigue ou un repas tardif.'})}
 return out}
function renderBody(){const W=weights(),wk=Object.keys(W).sort(),L=hLast()||today(),gw=num(S.set.goalw);
 setFig('#fw',{unit:'kg',series:[{name:'Pesée',pts:wk.map(x=>({x,y:W[x]})),col:'var(--bod)',dots:true,line:false,r:2.5,op:.4},{name:'Moyenne 7 j',pts:wk.map(x=>({x,y:Math.round(wAvg(W,x)*10)/10})),col:'var(--bod)',last:true}],hline:gw||null,fmt:v=>fx(v),empty:''+IMP('Note ton poids (Nutrition) ou importe Apple Santé','Note ton poids (Nutrition) ou connecte Apple Santé')+''});
 $('#vd-bw').innerHTML='';
 if(wk.length){const ld=wk[wk.length-1],a=wAvg(W,ld),b=wAvg(W,addD(ld,-28)),c=wAvg(W,addD(ld,-84)),rate=b?(a-b)/4:null;let proj='';
  if(b)$('#vd-bw').innerHTML=Math.abs(a-b)<0.3?`<b>Poids stable</b> sur 4 semaines, autour de ${fx(a)} kg.`:`${a<b?'En baisse':'En hausse'} de <b>${fx(Math.abs(a-b))} kg</b> en 4 semaines (moyenne sur 7 jours : ${fx(a)} kg).`;
  if(gw&&rate){const left=gw-a;if(Math.abs(left)<0.3)proj=`<div><b class="gd">Atteint</b><span>objectif ${fx(gw)} kg</span></div>`;else if(left*rate>0){const w=left/rate;proj=`<div><b>${w>104?'> 2 ans':dShort(addD(ld,Math.round(w*7)))}</b><span>objectif ${fx(gw)} kg au rythme actuel</span></div>`}else proj=`<div><b class="dn">${fx(Math.abs(left))} kg</b><span>de l'objectif, tendance inverse</span></div>`}
  $('#bk').innerHTML=`<div><b>${fx(a)} kg</b><span>moyenne 7 j au ${dShort(ld)}</span></div>`+(b?`<div><b>${sg(a-b)} kg</b><span>4 semaines (${sg(rate)} kg/sem.)</span></div>`:'')+(c?`<div><b>${sg(a-c)} kg</b><span>12 semaines</span></div>`:'')+proj}else $('#bk').innerHTML='';
 const md=$('#mdate');if(!md.value)md.value=today();
 const ms=Object.keys(S.days).filter(d=>S.days[d].m&&Object.keys(S.days[d].m).length).sort().reverse();
 $('#mtab').innerHTML=ms.length?`<table><thead><tr><th>Date</th>${MEAS.map(([,l])=>`<th class="num">${l}</th>`).join('')}</tr></thead><tbody>${ms.slice(0,8).map((d,i)=>{const m=S.days[d].m,p=ms[i+1]?S.days[ms[i+1]].m:null;return `<tr><td>${dShort(d)}<button class="x" data-act="delM" data-d="${d}" aria-label="Supprimer" style="width:32px;height:32px;font-size:1.125rem">×</button></td>${MEAS.map(([k])=>`<td class="num">${m[k]?fx(m[k]):'–'}${m[k]&&p&&p[k]?` <span class="mute small">(${sg(m[k]-p[k])})</span>`:''}</td>`).join('')}</tr>`}).join('')}</tbody></table>`:'';
 const bf=hKeys().filter(d=>H(d).bf).map(d=>({x:d,y:H(d).bf})),vo=hKeys().filter(d=>H(d).vo2).map(d=>({x:d,y:H(d).vo2}));
 setFig('#fb',{series:[{name:'Masse grasse',pts:bf,col:'var(--bod)',dots:bf.length<=40,last:true}],fmt:v=>fx(v)+' %',empty:'Pas de mesure de masse grasse'});
 $('#fk2').innerHTML=bf.length?`<div><b>${fx(bf[bf.length-1].y)} %</b><span>dernière mesure (${dShort(bf[bf.length-1].x)})</span></div>`+(wk.length?`<div><b>${fx((wAvg(W,bf[bf.length-1].x)||W[wk[wk.length-1]])*(1-bf[bf.length-1].y/100))} kg</b><span>masse maigre estimée</span></div>`:''):'<p class="mute small">Une balance connectée qui écrit dans Apple Santé remplit cette courbe.</p>';
 setFig('#fo',{unit:'ml/kg/min',series:[{name:'VO2 max',pts:vo,col:'var(--hrt)',dots:vo.length<=40,last:true}],empty:'Pas de VO2 max (mesurée en course ou marche extérieure)'});
 $('#vk').innerHTML=vo.length?`<div><b>${fx(vo[vo.length-1].y)}</b><span>ml/kg/min (${dShort(vo[vo.length-1].x)})</span></div>`+(vo.length>1?`<div><b>${sg(vo[vo.length-1].y-vo[0].y)}</b><span>depuis le ${dShort(vo[0].x)}</span></div>`:''):'';
 const m=$('#am').value,tg={st:num(S.set.steps),ex:num(S.set.exmin)}[m];
 const pa=dailyPts(d=>num(H(d)[m])||null,addD(L,-89),L);setFig('#fa',{zero:true,series:[{name:$('#am').selectedOptions[0].textContent,avg:true,last:true,pts:pa,col:'var(--eff)',dots:true,r:2.5,w:1.5}],hline:tg,empty:'Pas de données pour cette mesure'});
 const kk=(key,lab,f)=>{const a=winAvg(key,L,7),b=winAvg(key,L,30);return a==null?'':`<div><b>${f(a)}</b><span>${lab}, 7 j · 30 j : ${f(b)}</span></div>`};
 $('#ak').innerHTML=kk('st','pas / jour',r0)+kk('ac','kcal actives',r0)+kk('ex',"min d'exercice",r0)+kk('km','km / jour',fx)+kk('fl','étages',r0)}

/* ---------- plus ---------- */
const SUBT={dossier:'Dossier médical',reglages:'Réglages',apple:'Apple Santé',donnees:'Données et confidentialité'};
function quick(q){$('#sheet').hidden=true;setTimeout(()=>document.documentElement.style.setProperty('--hh',$('.top').offsetHeight+'px'),0);if(q==='close')return;const go=(h,fn)=>{if(location.hash!=='#'+h)location.hash=h;else route();setTimeout(fn||(()=>{}),150)};
 if(q==='mu'||q==='sp'){if(!S.cur){startMode=q;renderStart()}openSheet('seance')}
 else if(q==='food'){S.day=today();openFood(mealNow())}
 else if(q==='scan'){S.day=today();openScan()}
 else if(q==='breath')openBreath()
 else if(q==='bw'){S.day=today();go('nutrition',()=>{$('#bw').scrollIntoView({behavior:'smooth',block:'center'});$('#bw').focus({preventScroll:true})})}
 else if(q==='water'){const o=getDay(today());o.w=num(o.w)+250;put.day(today());renderView(cur());toast(`Eau : ${fx(o.w/1000)} L aujourd'hui`)}
 else if(q==='ci'){S.day=today();renderCheckin();openSheet('checkin')}
 else if(q==='med'){psub='dossier';go('plus',()=>{renderPlus();$('#mti').focus({preventScroll:true})})}
 else if(q==='apple'){if(HKN&&S.health.src==='hk'){hkSync();return}psub='apple';go('plus',renderPlus)}}

function renderPlus(){setTimeout(syncNav,0);$('#hub').hidden=!!psub;$('#subbar').hidden=!psub;$('#subt').textContent=SUBT[psub]||'';$$('[data-sub]').forEach(x=>x.hidden=x.dataset.sub!==psub);
 const L=hLast();$('#hubapple').textContent=S.set.demo?"Données de démo pour l'instant":HKN?(S.health.src==='hk'?'Connecté · '+syncWhen():'Connecter Apple Santé'):L?`Données jusqu'au ${dShort(L)}${today()>addD(L,3)?' : pense à réimporter':''}`:'Importer tes données (pas encore fait)';
 if(psub==='dossier')renderMed();else if(psub)renderSettings()}
function renderMed(){const t=today(),L=S.med.slice().sort((a,b)=>b.date.localeCompare(a.date)),types=['Tout','Rendez-vous','Vaccin','Analyse','Blessure','Note'];
 if(!$('#md').value)$('#md').value=t;
 const li=m=>`<li><span class="num" style="text-align:left">${dShort(m.date)}<br><span class="mute small">${m.date.slice(0,4)}</span></span><span><span class="tag">${esc(m.type)}</span><b>${esc(m.title)}</b>${m.who?` · <span class="mute">${esc(m.who)}</span>`:''}${m.note?`<span class="ml">${esc(m.note)}</span>`:''}${m.next?`<span class="ml">Rappel : ${dShort(m.next)}/${m.next.slice(0,4)}</span>`:''}</span><button class="x" data-act="delMed" data-id="${esc(m.id)}" aria-label="Supprimer">×</button></li>`;
 const up=L.filter(m=>m.date>=t||(m.next&&m.next>=t)).sort((a,b)=>(a.date>=t?a.date:a.next).localeCompare(b.date>=t?b.date:b.next));
 $('#medup').innerHTML=up.length?up.map(li).join(''):'<li class="mute empty" style="display:block">Rien de prévu.</li>';
 $('#medflt').innerHTML=types.map(x=>`<button data-act="medflt" data-t="${x}" class="${medFlt===x?'on':''}">${x}</button>`).join('');
 const hs=L.filter(m=>m.date<t&&(medFlt==='Tout'||m.type===medFlt));$('#medhist').innerHTML=hs.length?hs.map(li).join(''):'<li class="mute empty" style="display:block">Aucune entrée.</li>'}
const SK={'s-birth':'birth','s-height':'height','s-prot':'prot','s-kcal':'kcal','s-steps':'steps','s-sleep':'sleep','s-exmin':'exmin','s-water':'water','s-goalw':'goalw','s-rest':'rest','s-rmin':'rmin','s-rmax':'rmax','s-inc':'inc'};
function renderSettings(){const a=document.activeElement;
 for(const id in SK){const e=$('#'+id);if(a!==e){const raw=S.set[SK[id]];if(!has(raw)){e.value='';continue}const v=SK[id]==='sleep'?num(raw)/60:num(raw);e.value=String(Math.round(v*100)/100).replace('.',',')}}
 $('#s-auto').checked=S.set.auto!==false;$('#s-hvm').value=hvm();$('#s-sex').value=S.set.sex||'';
 const lst=(arr,act)=>arr.length?arr.map((t,k)=>`<li style="grid-template-columns:minmax(0,1fr) 44px"><span>${esc(t)}</span><button class="x" data-act="${act}" data-k="${k}" aria-label="Supprimer">×</button></li>`).join(''):'<li class="mute empty" style="display:block">Aucun.</li>';
 $('#suplist').innerHTML=lst(S.set.sups,'delSup');$('#taglist').innerHTML=lst(S.set.tags,'delTag');
 $('#favlist').innerHTML=S.set.foods.length?S.set.foods.map((f,k)=>`<li><span>${esc(f.n)}</span><span class="num">${fx(num(f.p))} g</span><span class="num">${r0(kcalOf(f))} kcal</span><button class="x" data-act="delFav" data-k="${k}" aria-label="Supprimer le favori">×</button></li>`).join(''):'<li class="mute empty">Aucun favori.</li>';
 $('#savenote').textContent=S.set.bk?`Dernière sauvegarde enregistrée le ${dShort(S.set.bk)}/${S.set.bk.slice(0,4)}.`:"Aucune sauvegarde enregistrée pour l'instant : pense à en faire une de temps en temps.";
 if(HKN)$('#hkmsg').textContent=S.health.src==='hk'?`Connecté, ${syncWhen()} · ${hKeys().length} jours de données, jusqu'au ${dShort(hLast())}.`:"Pas encore connecté : touche « Connecter » pour autoriser la lecture.";
 if(HKN)$('#hkgo').textContent=S.health.src==='hk'?'Synchroniser maintenant':'Connecter Apple Santé',$('#hkgo').dataset.act=S.health.src==='hk'?'hksync':'hkauth';
 const L=hLast();if(L&&S.health.src!=='hk'&&!$('#hmsg').dataset.busy&&!$('#hmsg').dataset.keep)$('#hmsg').textContent=`Dernier import le ${dShort(S.health.upd)} · données jusqu'au ${dShort(L)} · ${hKeys().length} jours.`;
 const dk=Object.keys(S.detail.d||{}).length,nn=hKeys().filter(k=>H(k).nhv).length,nr=hKeys().filter(k=>H(k).nrm).length;
 $('#hstat').innerHTML=L?`<div class="stat"><b>${hKeys().length}</b><span>jours résumés</span></div><div class="stat"><b>${dk}</b><span>jours détaillés</span></div><div class="stat"><b>${nn}</b><span>nuits avec VFC nocturne</span></div><div class="stat"><b>${nr}</b><span>nuits avec RMSSD (battements)</span></div>${S.health.hrmax?`<div class="stat"><b>${S.health.hrmax} <small>bpm</small></b><span>FC max. déduite</span></div>`:''}`:'';
 if(a!==$('#exp'))$('#exp').value=JSON.stringify({v:4,set:S.set,sessions:done(),days:S.days,med:S.med})}
function doImport(txt=$('#imp').value,m=$('#impmsg')){let d;try{d=JSON.parse(txt)}catch(e){m.textContent='Texte illisible : colle un export complet.';return}
 if(!d||!Array.isArray(d.sessions)||typeof d.days!=='object'){m.textContent="Ce texte n'est pas un export d'Arden.";return}
 const ok=/^[\w.~:@+-]+$/,str=v=>String(v??'');
 S.set={...clone(DEF),...(d.set||{})};
 S.sessions=d.sessions.filter(s=>s&&s.id&&ok.test(s.id)).map(s=>s.kind==='sport'?{id:s.id,kind:'sport',type:str(s.type||'Autre'),date:str(s.date||today()),min:num(s.min),rpe:num(s.rpe)||'',km:num(s.km)||'',note:str(s.note),t:num(s.t)}:{id:s.id,name:str(s.name||'Séance'),date:str(s.date||today()),t:num(s.t),dur:num(s.dur)||'',rpe:num(s.rpe)||'',ex:(s.ex||[]).map(e=>({n:str(e.n),sets:(e.sets||[]).map(x=>({w:num(x.w),r:num(x.r)}))}))});
 S.days={};for(const [k,o] of Object.entries(d.days||{}))if(/^\d{4}-\d{2}-\d{2}$/.test(k)&&o&&typeof o==='object'){const x={items:(o.items||[]).map(i=>({n:str(i.n),p:num(i.p),k:num(i.k),...(i.g?{g:num(i.g)}:{}),...(i.l?{l:num(i.l)}:{}),...(i.m?{m:str(i.m)}:{})})),bw:has(o.bw)?num(o.bw):''};if(o.w)x.w=num(o.w);if(Array.isArray(o.sup))x.sup=o.sup.map(str);if(o.j)x.j={mood:num(o.j.mood)||undefined,energy:num(o.j.energy)||undefined,stress:num(o.j.stress)||undefined,sore:num(o.j.sore)||undefined,note:str(o.j.note),tags:(o.j.tags||[]).map(str)};if(o.m){x.m={};for(const [mk] of MEAS)if(num(o.m[mk]))x.m[mk]=num(o.m[mk])}S.days[k]=clone(x)}
 S.med=(d.med||[]).filter(x=>x&&x.id&&ok.test(x.id)).map(x=>({id:x.id,type:str(x.type||'Note'),date:str(x.date||today()),title:str(x.title),who:str(x.who),note:str(x.note),next:str(x.next)}));
 put.set();S.sessions.forEach(put.sess);Object.keys(S.days).forEach(put.day);S.med.forEach(put.med);
 $('#imp').value='';m.textContent=`Importé : ${S.sessions.length} séances, ${Object.keys(S.days).length} jours, ${S.med.length} entrées de dossier.`;renderSoft()}


/* ---------- général ---------- */
function toast(msg,undo){const t=$('#toast');t.innerHTML='<span></span>'+(undo?'<button type="button">Annuler</button>':'');t.firstChild.textContent=msg;t.classList.add('on');clearTimeout(tt);tt=setTimeout(()=>t.classList.remove('on'),5500);if(undo)t.querySelector('button').onclick=()=>{t.classList.remove('on');undo()}}
function updateDatalist(){const m=new Map();for(const x of exNames())m.set(norm(x.n),x.n);for(const n of BASE_EX)if(!m.has(norm(n)))m.set(norm(n),n);$('#exlist').innerHTML=[...m.values()].map(n=>`<option value="${esc(n)}">`).join('')}
function resumeOnce(){if(resumed)return;resumed=true;const o=S.sessions.filter(s=>s.open).sort(sortDesc)[0];if(o&&!S.cur){S.cur=clone(o);renderEditor()}}
const views=['aujourdhui','sommeil','recuperation','effort','nutrition','tendances','plus'];
const cur=()=>{const h=location.hash.slice(1);return views.includes(h)?h:'aujourdhui'};
function markMore(){if(!matchMedia('(max-width:800px)').matches)return;requestAnimationFrame(()=>$$('.view:not([hidden]) :is(.panel>p.mute.small,.mkr p):not(.open)').forEach(p=>p.classList.toggle('more',p.scrollHeight>p.clientHeight+2)))}
function renderView(v){const sec=$('#v-'+v);if(sec){sec.classList.toggle('nohd',!hKeys().length);sec.classList.toggle('nosess',!done().length)}if(v==='tendances')$('#tnote').innerHTML=hKeys().length?'':emptyHTML('tendances');setTimeout(markMore,0);setTimeout(syncNav,0);renderDayNav();applyDeep();$('#demobar').hidden=!S.set.demo;try{({aujourdhui:renderToday,sommeil:renderSleep,recuperation:renderRec,effort:renderEffort,nutrition:renderNutri,tendances:renderTrends,plus:renderPlus})[v]()}catch(e){console.error(e)}}
function renderSoft(){updateDatalist();
 if(!S.cur&&!$('#editor').contains(document.activeElement))renderStart();
 if(S.cur)S.cur.ex.forEach((e,i)=>updateHint(i));
 const v=cur();if(v==='aujourdhui'&&$('#checkin').contains(document.activeElement))return;if(v==='effort'&&$('#editor').contains(document.activeElement))return;renderView(v)}
function route(){const v=cur();views.forEach(n=>$('#v-'+n).hidden=n!==v);$$('#tabs a').forEach(a=>{a.setAttribute('aria-current',a.getAttribute('href')==='#'+v?'page':'false');a.classList.toggle('sub-on',(a.getAttribute('href')==='#plus'&&v==='nutrition')||(a.getAttribute('href')==='#aujourdhui'&&v==='recuperation'))});renderView(v);tabInd()}
/* indicateur de l'onglet actif : il glisse d'un onglet à l'autre (ressort), à la couleur de la section */
function tabInd(){const nav=$('#tabs');let ind=nav.querySelector('.tabind');if(!ind){ind=document.createElement('i');ind.className='tabind';ind.setAttribute('aria-hidden','true');nav.prepend(ind)}
 const a=nav.querySelector('a[aria-current=page]:not(.dsk),a.sub-on');if(!a||!a.offsetWidth){ind.classList.add('off');return}
 const first=!ind.style.width;if(first)ind.style.transition='none';ind.classList.remove('off');ind.style.width=a.offsetWidth+'px';ind.style.transform=`translateX(${a.offsetLeft}px)`;ind.style.setProperty('--tc',getComputedStyle(a).getPropertyValue('--tc'));
 if(first){void ind.offsetWidth;ind.style.transition=''}}
addEventListener('resize',()=>requestAnimationFrame(tabInd));

$('#editor').addEventListener('input',ev=>{const t=ev.target,c=S.cur;if(!c)return;
 if(t.id==='cn'){c.name=t.value;return dirty()}if(t.id==='cd'){c.date=t.value;return dirty()}if(t.id==='crpe'){c.rpe=num(t.value)||'';return dirty()}
 const a=t.closest('.ex');if(!a||!t.dataset.f)return;const i=+a.dataset.i;
 if(t.dataset.f==='n')c.ex[i].n=t.value;else{const v=t.value.trim();c.ex[i].sets[+t.dataset.s][t.dataset.f]=v===''?'':num(v);updateHint(i)}dirty()});
$('#editor').addEventListener('change',ev=>{const t=ev.target,c=S.cur;if(!c)return;
 if(t.dataset.f==='r'&&num(t.value)>0&&S.set.auto!==false)startTimer();
 if(!t.classList.contains('exn'))return;const a=t.closest('.ex'),i=+a.dataset.i,e=c.ex[i];
 if(e.sets.every(s=>s.w===''&&s.r==='')&&suggest(e.n,c.id)){e.sets=prefill(e.n,c.id);a.outerHTML=exHTML(e,i);dirty()}updateHint(i)});
document.addEventListener('click',ev=>{unlockAudio();
 /* onglet Plus : toujours le menu Plus, jamais la sous-page laissée la dernière fois (comme sur iPhone) ;
    déjà sur une sous-page de Plus, le toucher ramène au menu */
 {const tl=ev.target.closest('#tabs a');if(tl&&tl.getAttribute('href')==='#plus')psub='';if(tl&&tl.getAttribute('href')==='#'+cur()){ev.preventDefault();buzz();const v=cur(),top=()=>scrollTo({top:0,behavior:calm()?'auto':'smooth'});
  if(v==='plus'){psub='';renderPlus();top()}else if(DAYV.includes(v)&&S.day!==today()){scrollTo(0,0);vt(()=>{S.day=today();renderView(v)},'next')}else top();return}}if(ev.target.closest('#cele')){hideCele();return}{const db=ev.target.closest('[data-dlg]');if(db){closeDlg(db.dataset.dlg);return}if(ev.target.id==='dlg'){closeDlg('cancel');return}}if(matchMedia('(max-width:800px)').matches){const nt=ev.target.closest('.panel>p.mute.small,.mkr p');if(nt&&!ev.target.closest('a,button')){nt.classList.toggle('open');return}}if(ev.target.id==='sheet'){quick('close');return}const go=ev.target.closest('[data-go]');if(go){if(go.classList.contains('gauge')&&location.hash!=='#'+go.dataset.go)zoomFrom=go.querySelector('svg');location.hash=go.dataset.go;return}
 const b=ev.target.closest('[data-act]');if(!b)return;const act=b.dataset.act,c=S.cur,a=b.closest('.ex'),i=a?+a.dataset.i:-1;
 switch(act){
 case'sheet':{const sh=$('#sheet');sh.hidden=!sh.hidden;setTimeout(()=>{document.documentElement.style.setProperty('--hh',$('.top').offsetHeight+'px')},0);return}
 case'qa':return quick(b.dataset.q);
 case'deep':{buzz();const v=b.dataset.v;S.set.deep={...(S.set.deep||{}),[v]:!(S.set.deep||{})[v]};put.set();applyDeep();return}
 case'share':return shareWeek();
 case'briefok':return hideBrief();
 case'briefopen':return showBrief();
 case'dpick':{if(b.dataset.d===S.day)return;const n=b.dataset.d>S.day?1:-1;buzz();return vt(()=>{S.day=b.dataset.d;renderView(cur())},n>0?'next':'prev')}
 case'msclose':return closeSheet();
 case'showall':buzz();$(b.dataset.t).classList.add('all');return;
 case'demoTry':return loadDemo();
 case'ciopen':renderCheckin();return openSheet('checkin');
 case'metric':return openMetric(b.dataset.k);
 case'mper':buzz();metP=+b.dataset.n;return renderMetric();
 case'msopen':if(!S.cur){startMode=b.dataset.m||'mu';renderStart()}return openSheet('seance');
 case'foodadd':return openFood(b.dataset.m);
 case'foodsave':return pick?addPicked():$('#ff').requestSubmit();
 case'onb':if(b.dataset.to==='2'&&!b.dataset.skip)saveProfile();return showOnb(+b.dataset.to);
 case'onbGo':return onbGo(b.dataset.go2);
 case'demoEnd':clearDemo();renderSoft();return showOnb(2);
 case'bksave':return saveBackup();
 case'hksync':return hkSync();
 case'hkauth':return hkConnect();
 case'bkok':{const t=pendingBk;pendingBk='';if(t)doImport(t,$('#bkmsg'));return}
 case'wipe':{if(b.classList.contains('armed'))return resetAll();b.classList.add('armed');b.textContent='Confirmer : tout effacer définitivement';setTimeout(()=>{b.classList.remove('armed');b.textContent='Effacer toutes mes données'},6000);return}
 case'wktoggle':buzz();return vt(()=>{S.set.wkc=!S.set.wkc;put.set();renderDayNav()},'tab');
 case'absync':buzz();if(HKN)return hkSync();psub='apple';scrollTo(0,0);location.hash='plus';return;
 case'dprev':return goDay(-1);
 case'dnext':return goDay(1);
 case'dlast':S.day=hLast()||today();return renderView(cur());
 case'psub':psub=b.dataset.s;scrollTo(0,0);if(cur()!=='plus'){ev.preventDefault();location.hash='plus';return}return renderPlus();
 case'slt':sleepTrend=b.dataset.k;return renderSleep();
 case'slper':sleepPer=+b.dataset.n;return renderSleep();
 case'jset':buzz();{const k=b.dataset.k,v=+b.dataset.v;setJ({[k]:J(S.day)[k]===v?undefined:v});const n=ciStreak();if(S.day===today()&&n>=7&&n%7===0&&S.set.streakCel!==today()){S.set.streakCel=today();put.set();celebrate(`${n} jours d'affilée`,'Ton check-in devient un rituel.')}return renderCheckin()}
 case'jtag':buzz();{const t=b.dataset.t,tg=(J(S.day).tags||[]).slice(),x=tg.indexOf(t);if(x<0)tg.push(t);else tg.splice(x,1);setJ({tags:tg});return renderCheckin()}
 case'water':{buzz('light');const d=S.day,o=getDay(d);o.w=Math.max(0,num(o.w)+ +b.dataset.v);put.day(d);renderView(cur());const t=$('#tiles .tile[data-k=wat]');if(t&&+b.dataset.v>0){t.classList.remove('splash');void t.offsetWidth;t.classList.add('splash')}return}
 case'sup':{const d=S.day,o=getDay(d),s=b.dataset.s,l=(o.sup||[]).slice(),x=l.indexOf(s);if(x<0)l.push(s);else l.splice(x,1);o.sup=l;put.day(d);return renderNutri()}
 case'copyY':{const d=S.day,y=dayIt(addD(d,-1));if(!y.length)return toast('Rien de noté la veille.');getDay(d).items.push(...clone(y));put.day(d);renderNutri();return toast(y.length+' aliments copiés depuis la veille')}
 case'smode':buzz();startMode=b.dataset.m;return renderStart();
 case'start':return startSession();
 case'tpl':return startSession(b.dataset.id);
 case'tstart':return startTimer();
 case't30':tEnd=Math.max(tEnd,Date.now())+30000;tDur=Math.max(tDur,tEnd-Date.now());$('#timer').classList.remove('end');$('#tlab').textContent='Repos';return tick();
 case'tstop':return stopTimer();
 case'addSet':{const s=c.ex[i].sets,l=s[s.length-1]||{};s.push({w:l.w??'',r:'',p:l.p||''});a.outerHTML=exHTML(c.ex[i],i);updateHint(i);dirty();$(`.ex[data-i="${i}"] .set:last-of-type input[data-f="r"]`)?.focus();return}
 case'delSet':{c.ex[i].sets.splice(+b.dataset.s,1);if(!c.ex[i].sets.length)c.ex[i].sets.push({w:'',r:''});a.outerHTML=exHTML(c.ex[i],i);updateHint(i);dirty();return}
 case'delEx':{const old=clone(c.ex);c.ex.splice(i,1);renderEditor();dirty();toast('Exercice supprimé',()=>{if(S.cur===c){c.ex=old;renderEditor();dirty()}});return}
 case'addEx':{c.ex.push({n:'',sets:[{w:'',r:''}]});renderEditor();dirty();$$('.exn').pop()?.focus();return}
 case'finish':return finish();
 case'discard':return discard();
 case'edit':return editSess(b.dataset.id);
 case'delSess':return delSess(b.dataset.id);
 case'more':histN+=20;return renderHist();
 case'fpick':return openPick(fres[+b.dataset.i]);
 case'mprod':return openPick(prods()[+b.dataset.i]);
 case'pickq':pick.q=+b.dataset.q;$('#pq').value=String(pick.q);return pickTotal();
 case'pickadd':return addPicked();
 case'pickback':pick=null;renderPick();msBar();return;
 case'scan':return openScan();
 case'breath':return openBreath();
 case'bzmin':bzMin=+b.dataset.m;buzz();return bzSeg();
 case'bzgo':return startBreath();
 case'bzclose':return closeBreath();
 case'scanclose':return closeScan();
 case'fav':{const f=S.set.foods[+b.dataset.k],m=$('#fm').value;addFood(f);if(msKind==='food'){closeSheet();toast(f.n+' ajouté · '+m)}return}
 case'delFood':return delFood(+b.dataset.k);
 case'delM':{const d=b.dataset.d,o=S.days[d],old=o&&o.m;if(!o)return;delete o.m;put.day(d);renderBody();toast('Mensurations supprimées',()=>{getDay(d).m=old;put.day(d);renderBody()});return}
 case'delMed':{const id=b.dataset.id,x=S.med.find(m=>m.id===id);S.med=S.med.filter(m=>m.id!==id);put.delMed(id);renderMed();toast('Entrée supprimée',()=>{S.med.push(x);put.med(x);renderMed()});return}
 case'medflt':medFlt=b.dataset.t;return renderMed();
 case'delFav':{const k=+b.dataset.k,f=S.set.foods.splice(k,1)[0];put.set();renderSettings();toast('Favori supprimé',()=>{S.set.foods.splice(k,0,f);put.set();renderSettings()});return}
 case'delSup':S.set.sups.splice(+b.dataset.k,1);put.set();return renderSettings();
 case'delTag':S.set.tags.splice(+b.dataset.k,1);put.set();return renderSettings();
 case'copy':{const e=$('#exp');navigator.clipboard.writeText(e.value).then(()=>toast('Export copié'),()=>{e.select();toast('Texte sélectionné : copie-le avec Ctrl+C')});return}
 case'import':{if(b.dataset.c){delete b.dataset.c;b.textContent='Importer (remplace tout)';return doImport()}b.dataset.c='1';b.textContent='Confirmer : tout remplacer ?';setTimeout(()=>{if(b.dataset.c){delete b.dataset.c;b.textContent='Importer (remplace tout)'}},6000);return}
 }});
document.addEventListener('change',ev=>{if(ev.target.id==='jnote')setJ({note:ev.target.value.trim()})});
document.addEventListener('input',ev=>{const t=ev.target;if(t.id==='fq')return renderFoodSearch();if(t.id==='fn')delete t.dataset.auto;
 if(!pick)return;if(t.id==='pq'){pick.q=num(t.value);return pickTotal()}
 const k={'pk-n':'n','pk-k':'k','pk-p':'p','pk-g':'g','pk-l':'l'}[t.id];if(k){pick.f[k]=k==='n'?t.value:(t.value.trim()===''?(k==='k'?null:0):num(t.value));pickTotal()}});
$('#scf').addEventListener('submit',ev=>{ev.preventDefault();const c=$('#sccode').value.replace(/\D/g,'');if(!validCode(c)){$('#scmsg').textContent='Un code-barres compte 8 ou 13 chiffres.';return}closeScan();handleCode(c)});
$('#ff').addEventListener('submit',ev=>{ev.preventDefault();const n=$('#fn').value.trim(),p=num($('#fp').value),g=num($('#fg').value),l=num($('#fl2').value),k=num($('#fk').value);if(!n&&!p&&!k&&!g&&!l)return $('#fn').focus();
 const f={n:n||'Aliment',p,g,l,k:k||Math.round(p*4+g*4+l*9)};addFood(f);if($('#fsave').checked&&!S.set.foods.some(x=>norm(x.n)===norm(f.n))){S.set.foods.push(f);put.set()}
 const m=$('#fm').value;$('#ff').reset();$('#fm').value=m;renderNutri();buzz('ok');if(msKind==='food'){closeSheet();toast(f.n+' ajouté · '+m)}else $('#fn').focus()});
$('#mf').addEventListener('submit',ev=>{ev.preventDefault();const d=$('#mdate').value||today(),m={};for(const [k] of MEAS){const v=num($('#m-'+k).value);if(v>0)m[k]=v}if(!Object.keys(m).length)return $('#m-taille').focus();getDay(d).m=m;put.day(d);$('#mf').reset();$('#mdate').value=today();renderBody();toast('Mensurations enregistrées')});
$('#medf').addEventListener('submit',ev=>{ev.preventDefault();const o={id:nid(),type:$('#mt').value,date:$('#md').value||today(),title:$('#mti').value.trim(),who:$('#mw').value.trim(),next:$('#mn').value,note:$('#mno').value.trim()};if(!o.title)return $('#mti').focus();S.med.push(o);put.med(o);$('#medf').reset();$('#md').value=today();renderMed();toast('Ajouté au dossier')});
$('#supf').addEventListener('submit',ev=>{ev.preventDefault();const v=$('#supn').value.trim();if(v&&!S.set.sups.includes(v)){S.set.sups.push(v);put.set()}$('#supn').value='';renderSettings()});
$('#tagf').addEventListener('submit',ev=>{ev.preventDefault();const v=$('#tagn').value.trim();if(v&&!S.set.tags.includes(v)){S.set.tags.push(v);put.set()}$('#tagn').value='';renderSettings()});
$('#nday').addEventListener('change',ev=>{if(ev.target.value){S.day=ev.target.value;renderNutri()}});
$('#bw').addEventListener('change',ev=>{const d=S.day,v=ev.target.value.trim();getDay(d).bw=v===''?'':num(v);put.day(d);renderNutri()});
$('#bkfile').addEventListener('change',async ev=>{const f=ev.target.files[0];ev.target.value='';if(!f)return;const m=$('#bkmsg');
 let d;try{pendingBk=await f.text();d=JSON.parse(pendingBk)}catch(e){pendingBk='';m.textContent="Ce fichier n'est pas une sauvegarde lisible.";return}
 if(!d||!Array.isArray(d.sessions)||typeof d.days!=='object'){pendingBk='';m.textContent="Ce fichier n'est pas une sauvegarde d'Arden.";return}
 m.innerHTML=`Sauvegarde trouvée : ${d.sessions.length} séances, ${Object.keys(d.days||{}).length} jours, ${(d.med||[]).length} entrées de dossier. Elle remplacera tes données actuelles. <button type="button" class="btn small danger armed" data-act="bkok">Restaurer</button>`});
$('#pex').addEventListener('change',renderForce);$('#am').addEventListener('change',renderBody);$('#vtm').addEventListener('change',renderRec);
$('#s-auto').addEventListener('change',ev=>{S.set.auto=ev.target.checked;put.set()});
$('#s-sex').addEventListener('change',ev=>{S.set.sex=ev.target.value;put.set()});
$('#s-hvm').addEventListener('change',ev=>{S.set.hvm=ev.target.value;S.set.hvmSet=true;put.set();toast(ev.target.value==='rmssd'?'VFC : RMSSD pendant le sommeil':ev.target.value==='sdnn'?'VFC : SDNN Apple pendant le sommeil':'VFC : SDNN Apple, moyenne de la journée')});
for(const id in SK)$('#'+id).addEventListener('change',ev=>{const key=SK[id];if(['goalw','birth','height'].includes(key)&&ev.target.value.trim()===''){S.set[key]='';put.set();return renderSettings()}let v=num(ev.target.value);if(v>0){if(key==='sleep')v=Math.round(v*60);S.set[key]=v;if(S.set.rmin>S.set.rmax)S.set.rmax=S.set.rmin;put.set()}renderSettings()});
$('#hfile').addEventListener('change',async ev=>{const f=ev.target.files[0];ev.target.value='';if(!f)return;const bar=$('#hbar'),bi=bar.querySelector('i'),msg=$('#hmsg');
 const prog=p=>{p=Math.min(100,p||0);bi.style.width=p.toFixed(0)+'%';msg.textContent=(p>=96?'Analyse des nuits et du cœur… ':'Lecture… ')+p.toFixed(0)+' %'};
 bar.hidden=false;bi.style.width='0';msg.dataset.busy='1';msg.textContent='Ouverture du fichier…';
 try{const R=await readHealth(f,prog,S.set.sex,ageOf()),r=R.d,n=Object.keys(r).length;
  if(!n){msg.textContent='Aucune donnée récente dans ce fichier.';return}
  if(S.set.demo)clearDemo();applyHealth(R);
  const w=Object.values(r).reduce((a,o)=>a+(o.wk||[]).length,0),ns=Object.values(r).filter(o=>o.sl).length,nv=Object.values(r).filter(o=>o.nhv).length,nrm=Object.values(r).filter(o=>o.nrm).length;
  msg.dataset.keep='1';msg.textContent=`Analyse terminée : ${n} jours, ${ns} nuits (dont ${nv} avec VFC nocturne, ${nrm} recalculées en RMSSD) et ${w} entraînements. ${R.chk?` Contrôle de lecture des battements : le SDNN recalculé vaut ${Math.round(R.chk.med*100)} % de la valeur Apple (sur ${R.chk.n} mesures).`:''} FC max. déduite : ${R.hmax} bpm.`}
 catch(e){console.error(e);msg.textContent="Impossible de lire ce fichier. Choisis le export.zip d'Apple Santé, ou le fichier .xml qu'il contient (pas celui qui contient « cda »)."}
 finally{bar.hidden=true;delete msg.dataset.busy;renderSoft()}});
/* Revenir sur un onglet depuis une autre partie de l'appli le rouvre à son point de départ (aujourd'hui,
   menu Plus) ; entre onglets de jour (Résumé, Sommeil, Énergie, Dépense), le jour choisi est gardé. */
const DAYV=['aujourdhui','sommeil','recuperation','effort'];let lastV=cur();
addEventListener('hashchange',()=>{$('#sheet').hidden=true;buzz();const v=cur(),from=lastV;lastV=v;
 if(DAYV.includes(v)&&!DAYV.includes(from))S.day=today();
 vt(()=>{route();scrollTo(0,0)},zoomFrom?'zoom':'tab')});
document.addEventListener('keydown',e=>{if(e.metaKey||e.ctrlKey||e.altKey)return;const t=e.target;if(t.closest&&t.closest('input,textarea,select,[contenteditable]'))return;
 const tabs=['aujourdhui','sommeil','recuperation','effort','nutrition','tendances','plus'];
 if(e.key==='Escape'){if(!$('#breath').hidden)return closeBreath();if(!$('#dlg').hidden)return closeDlg('cancel');if(!$('#scan').hidden)return closeScan();$('#sheet').hidden=true;closeSheet();if(!$('#brief').hidden)hideBrief();hideCele();return}
 if(/^[1-7]$/.test(e.key)){location.hash=tabs[+e.key-1];return}
 if(e.key==='n'||e.key==='N'){e.preventDefault();$('.tplus').click();return}
 if(!$('#dn').hidden){if(e.key==='ArrowLeft')goDay(-1);else if(e.key==='ArrowRight')goDay(1)}});
{const fit=()=>{const r=document.documentElement;r.style.setProperty('--hh',$('.top').offsetHeight+'px');};fit();addEventListener('resize',fit);setTimeout(fit,300)}
{const T=$('#tip'),place=e=>{const w=T.offsetWidth,h=T.offsetHeight,W=document.documentElement.clientWidth;let x=e.pageX+14,y=e.pageY-h-12;if(x+w>W-8)x=e.pageX-w-14;if(y<scrollY+8)y=e.pageY+18;T.style.left=Math.max(8,x)+'px';T.style.top=y+'px'};
 document.addEventListener('pointerover',e=>{const t=e.target.closest&&e.target.closest('[data-tip]');if(!t){T.hidden=true;return}T.textContent=t.dataset.tip;T.hidden=false;place(e)});
 document.addEventListener('pointermove',e=>{if(!T.hidden)place(e)});const hideT=e=>{if(e.pointerType!=='mouse')T.hidden=true};document.addEventListener('pointerup',hideT);document.addEventListener('pointercancel',hideT);document.addEventListener('scroll',()=>{T.hidden=true;$$('.ov').forEach(o=>o.innerHTML='')},{passive:true,capture:true})}

/* ---------- gestes : glisser d'un jour à l'autre, tirer pour synchroniser ---------- */
{const sc=$('#sc'),wrap=$('#sc>.wrap'),ptr=$('#ptr'),dayV=()=>['aujourdhui','sommeil','recuperation','effort'].includes(cur());
 let x0=null,y0=0,dx=0,dy=0,lock=null,armed=false;const PULL=86;
 const skip=t=>t.closest('.fig,.scroll,.seg,.chips,input,textarea,select,label,#wk,.rc-d,.dial,#tabs,#sheet');
 const setPull=d=>{const p=Math.min(1,d/PULL);ptr.style.setProperty('--p',p);ptr.style.transform=`translate(-50%,${Math.min(d,PULL*1.3)*.6-40}px)`;ptr.style.opacity=Math.min(1,p*1.6);
  if(p>=1&&!armed){armed=true;buzz('light')}else if(p<1)armed=false};
 sc.addEventListener('touchstart',e=>{x0=null;if(e.touches.length!==1||!dayV()||skip(e.target)||msKind||!$('#brief').hidden)return;
  x0=e.touches[0].clientX;y0=e.touches[0].clientY;dx=dy=0;lock=null;armed=false},{passive:true});
 sc.addEventListener('touchmove',e=>{if(x0==null)return;const t=e.touches[0];dx=t.clientX-x0;dy=t.clientY-y0;
  if(!lock&&(Math.abs(dx)>12||Math.abs(dy)>12))lock=Math.abs(dx)>Math.abs(dy)*1.3?'x':dy>0&&scrollY<=0&&HKN&&!hkBusy?'pull':'y';
  if(lock==='x'){const stop=dx<0&&S.day>=today();wrap.style.transform=`translateX(${dx*(stop?.12:.32)}px)`}
  else if(lock==='pull')setPull(Math.max(0,dy*.55))},{passive:true});
 const end=async()=>{if(x0==null)return;x0=null;
  if(lock==='x'){wrap.style.transition='transform .22s cubic-bezier(.2,.8,.2,1)';wrap.style.transform='';setTimeout(()=>{wrap.style.transition=''},240);
   if(Math.abs(dx)>70)goDay(dx>0?-1:1)}
  else if(lock==='pull'){if(armed){ptr.classList.add('spin');ptr.style.transform='translate(-50%,12px)';ptr.style.opacity=1;
    try{await hkSync()}finally{ptr.classList.remove('spin')}}
   ptr.style.transition='transform .3s,opacity .3s';ptr.style.transform='translate(-50%,-40px)';ptr.style.opacity=0;setTimeout(()=>{ptr.style.transition=''},320)}
  lock=null};
 sc.addEventListener('touchend',end);sc.addEventListener('touchcancel',end)}

/* ---------- données Apple Santé : fusion d'un import ---------- */
function applyHealth(R,inc=false){
 /* Synchro incrémentale : le premier jour lu est incomplet (sa nuit commence la veille), on le laisse de côté. */
 if(inc){const d={...R.d},x={...R.det};delete d[R.from];delete x[R.from];R={...R,d,det:x}}
 const hrmax=!inc||!S.health.hrmax?R.hmax:Object.values(R.d).some(o=>o.wk)?Math.max(S.health.hrmax,R.hmax):S.health.hrmax;
 const all={...S.health.d,...R.d};let ks=Object.keys(all).sort().slice(-400),keep;
 for(;;){keep={};ks.forEach(k=>keep[k]=all[k]);if(JSON.stringify(keep).length<235000||ks.length<=60)break;ks=ks.slice(20)}
 S.health={upd:today(),last:R.last||S.health.last||'',hrmax,rm:R.rm||!!S.health.rm,chk:R.chk||S.health.chk||null,d:keep};put.health();
 const det={...(S.detail.d||{}),...R.det},dk=Object.keys(det).sort().slice(-35);let dkeep;
 for(let n2=dk.length;;n2-=3){dkeep={};dk.slice(-n2).forEach(k=>dkeep[k]=det[k]);if(JSON.stringify(dkeep).length<235000||n2<=6)break}
 S.detail={d:dkeep};put.detail()}

/* ---------- données de démo ---------- */
const PROFILE_KEYS=['birth','sex','height','goalw','sups'];
const hasRealData=()=>!S.set.demo&&!!(hKeys().length||S.sessions.length||Object.keys(S.days).length||S.med.length);
async function loadDemo(){
 if(S.set.demo)clearDemo();
 toast('Préparation des données de démo…');await new Promise(r=>setTimeout(r,30));
 const prev={};for(const k of PROFILE_KEYS)prev[k]=clone(S.set[k]??'');
 for(const k of PROFILE_KEYS)if(k==='sups'||!has(S.set[k]))S.set[k]=clone(DEMO_PROFILE[k]);
 const R=await readHealth(new File([demoHealthXML()],'export.xml',{type:'text/xml'}),()=>{},S.set.sex,ageOf());
 S.health={upd:'',d:{}};S.detail={d:{}};applyHealth(R);
 const M=demoManual();S.cur=null;S.sessions=M.sessions;S.days=M.days;S.med=M.med;
 S.set.demo={prev};S.set.onb=1;S.day=today();put.set();put.day(today());
 hideOnb();renderEditor();if(location.hash!=='#aujourdhui')location.hash='aujourdhui';else renderSoft();
 toast('Données de démo chargées : un profil fictif sur deux mois.')}
function clearDemo(){
 const prev=(S.set.demo&&S.set.demo.prev)||{};for(const k of PROFILE_KEYS)if(k in prev)S.set[k]=prev[k];
 delete S.set.demo;S.health={upd:'',d:{}};S.detail={d:{}};S.sessions=[];S.days={};S.med=[];S.cur=null;
 put.set();put.health();renderEditor()}

/* ---------- Apple Santé en direct (appli iOS) ---------- */
const syncWhen=()=>{const t=S.health.sync;if(!t)return'';const d=new Date(t),ds=iso(d),hm2=d.toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'});return ds===today()?'synchronisé à '+hm2:ds===addD(today(),-1)?'synchronisé hier à '+hm2:'synchronisé le '+dShort(ds)};
async function hkConnect(){
 try{await authorizeHealth()}catch(e){toast(String(e&&e.message||e));return}
 return hkSync({full:true})}
async function hkSync({full=false,quiet=false}={}){
 if(!HKN||hkBusy)return;hkBusy=true;
 const inc=!full&&S.health.src==='hk'&&!!S.health.sync&&hKeys().length>0,from=inc?addD(iso(new Date(S.health.sync)),-3):addD(today(),-395);
 const bar=$('#syncbar'),bi=bar.querySelector('i'),lab=bar.querySelector('span');
 const prog=p=>{bi.style.width=Math.round(p)+'%';lab.textContent=(inc?'Mise à jour depuis Apple Santé… ':'Lecture d\'Apple Santé… ')+Math.round(p)+' %'};
 bar.hidden=quiet&&inc;prog(0);
 try{
  if(S.set.demo)clearDemo();
  const R=await readHealthKit({from,sex:S.set.sex,age:ageOf(),onProgress:prog});
  if(!Object.keys(R.d).length){if(!inc)toast("Aucune donnée reçue d'Apple Santé. Vérifie l'accès : Réglages → Santé → Accès aux données et appareils → Arden.");return}
  applyHealth(R,inc);S.health.src='hk';S.health.sync=Date.now();put.health();
  if(!inc)toast(`Apple Santé connecté : ${Object.keys(R.d).length} jours lus.`);else if(!quiet)toast('Apple Santé à jour.')
 }catch(e){console.error(e);toast("Lecture d'Apple Santé impossible : "+String(e&&e.message||e))}
 finally{hkBusy=false;bar.hidden=true;renderSoft();maybeBrief()}}
/* Textes et boutons propres à l'appli iOS */
function setupHK(){
 document.documentElement.classList.add('hk');
 const ch=$('#onb [data-go2="apple"]');ch.dataset.go2='hk';ch.querySelector('b').textContent='Connecter Apple Santé';ch.querySelector('small').textContent='Lecture seule : sommeil, cœur, activité, entraînements';
 const qa=$('#sheet [data-q="apple"]');qa.lastChild.textContent='Synchro Santé';
 $('#hkpanel').hidden=false;$('#impt').textContent="Importer un fichier d'export (facultatif)";$('#hkmsg').after($('#hstat'));
 addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&S.health.src==='hk'&&!S.set.demo&&Date.now()-(S.health.sync||0)>15*6e4)hkSync({quiet:true})})}

/* ---------- feuilles modales (comme iOS) : séance, aliment ---------- */
let msKind='',foodMeal='';
const mealNow=()=>{const hr=new Date().getHours();return hr<11?'Petit-déjeuner':hr<15?'Déjeuner':hr<18?'Collation':'Dîner'};
function msBar(){const t=$('#mstitle'),l=$('#msl'),r=$('#msr');
 if(msKind==='seance'){t.textContent=S.cur?'Séance en cours':'Nouvelle séance';l.textContent=S.cur?'Fermer':'Annuler';r.innerHTML=S.cur?'<button type="button" class="ms-btn ms-done" data-act="finish">Terminer</button>':''}
 else if(msKind==='food'){t.textContent=foodMeal;l.textContent='Annuler';r.innerHTML='<button type="button" class="ms-btn ms-done" data-act="foodsave">Ajouter</button>'}
 else if(msKind==='checkin'){t.textContent=S.day===today()?"Check-in du jour":'Check-in du '+dShort(S.day);l.textContent='';r.innerHTML='<button type="button" class="ms-btn ms-done" data-act="msclose">OK</button>'}
 else if(msKind==='metric'){t.textContent=(MET[metK]||{}).t||'';l.textContent='';r.innerHTML='<button type="button" class="ms-btn ms-done" data-act="msclose">OK</button>'}
 l.style.visibility=l.textContent?'':'hidden'}
function openSheet(k){msKind=k;const m=$('#msheet');$$('#msheet .ms-body').forEach(b=>b.hidden=b.dataset.k!==k);msBar();m.hidden=false;document.documentElement.classList.add('ms-open');m.querySelector('.ms-body:not([hidden])').scrollTop=0}
function closeSheet(){if(!msKind)return;msKind='';pick=null;const a=document.activeElement;if(a&&$('#msheet').contains(a))a.blur();$('#msheet').hidden=true;document.documentElement.classList.remove('ms-open');setTimeout(renderSoft,0)}
function openFood(m){renderNutri();foodMeal=m;$('#ff').reset();$('#fm').value=m;$('#fq').value='';pick=null;renderPick();renderFoodSearch();openSheet('food');
 loadCiqual().then(()=>{if(msKind==='food')renderFoodSearch()});if(matchMedia('(pointer:fine)').matches)$('#fq').focus()}

/* ---------- banque d'aliments : recherche, quantité, produits scannés ---------- */
let pick=null,fres=[],scanStop=null;
const SRC={ciqual:'Ciqual (ANSES)',off:'Open Food Facts',mine:'Mon produit'};
const per100=f=>f.k==null?'valeurs à compléter':`${r0(f.k)} kcal · P ${fx(num(f.p))} · G ${fx(num(f.g))} · L ${fx(num(f.l))} g`;
const prods=()=>S.set.prods||(S.set.prods=[]);
function saveProd(f){const L=prods(),i=L.findIndex(x=>x.id===f.id),o={id:f.id,n:f.n,b:f.b||'',k:f.k,p:num(f.p),g:num(f.g),l:num(f.l),sv:f.sv||null,src:f.src||'off',t:Date.now()};
 if(i>=0)L.splice(i,1);L.unshift(o);if(L.length>300)L.length=300;put.set()}
function renderFoodSearch(){const q=$('#fq').value.trim();$('#fhome').hidden=!!q;$('#ffh').textContent=q?'Pas dans la liste ? Saisie libre':'Saisie libre';
 const mp=prods();$('#mprodw').hidden=!mp.length;
 $('#mprods').innerHTML=mp.slice(0,12).map((f,i)=>`<button class="chip" data-act="mprod" data-i="${i}"><b>${esc(f.n)}${f.b?` <small>${esc(f.b)}</small>`:''}</b><span>${f.k==null?'à compléter':r0(f.k)+' kcal / 100 g'}</span></button>`).join('');
 if(!q){$('#fres').innerHTML='';return}
 fres=searchFoods(q,{prods:mp,favs:S.set.foods});const n=ciqualCount();
 $('#fres').innerHTML=fres.length?fres.map((f,i)=>`<li><button type="button" class="fr" ${f.src==='fav'?`data-act="fav" data-k="${f.id.slice(1)}"`:`data-act="fpick" data-i="${i}"`}><span><b>${esc(f.n)}</b><small>${f.src==='fav'?`Favori · ${fx(num(f.p))} g de protéines · ${r0(kcalOf(f))} kcal`:`${esc(f.b||SRC[f.src]||'')} · ${per100(f)}${f.k==null?'':' / 100 g'}`}</small></span><em>${f.src==='fav'?'+':'›'}</em></button></li>`).join('')
  :`<li class="fnone">${n===0?'La banque d\'aliments s\'installe : en attendant, scanne le produit ou saisis-le ci-dessous.':n==null?'Chargement de la banque d\'aliments…':`Aucun aliment ne correspond à « ${esc(q)} ».`}</li>`;
 if(!$('#fn').value||$('#fn').dataset.auto){$('#fn').value=q;$('#fn').dataset.auto='1'}}
/* Étape « quantité » : valeurs pour 100 g, grammes, total calculé en direct */
function openPick(f,note=''){if(msKind!=='food')openFood(mealNow());pick={f:{...f},q:f.sv||100,note,edit:f.k==null||!f.n};renderPick();msBar();$('#fpick').scrollIntoView({block:'start'});setTimeout(()=>(pick&&pick.edit?$('#pk-n'):$('#pq'))?.focus({preventScroll:true}),80)}
function renderPick(){const el=$('#fpick');$('#fsearch').hidden=!!pick;$('.fsr').hidden=!!pick;el.hidden=!pick;if(!pick){el.innerHTML='';return}const f=pick.f;
 const qs=[...new Set([f.sv,50,100,150,200].filter(Boolean))];
 el.innerHTML=`<div class="panel pick">${pick.note?`<p class="vd">${esc(pick.note)}</p>`:''}
  ${pick.edit?`<div class="pk-h"><b>${f.src==='mine'?'Nouveau produit':'À compléter'}</b><small>Code-barres ${esc(f.id)} · valeurs pour 100 g, sur l'emballage</small></div>`:''}
  ${pick.edit?`<div class="pk-ed"><label>Nom<input id="pk-n" value="${esc(f.n)}" placeholder="ex. Yaourt grec nature"></label><label>Calories (kcal)<input id="pk-k" inputmode="decimal" value="${f.k??''}"></label><label>Protéines (g)<input id="pk-p" inputmode="decimal" value="${f.p??''}"></label><label>Glucides (g)<input id="pk-g" inputmode="decimal" value="${f.g??''}"></label><label>Lipides (g)<input id="pk-l" inputmode="decimal" value="${f.l??''}"></label></div>`
   :`<div class="pk-h"><b>${esc(f.n)}</b><small>${esc([f.b,SRC[f.src]].filter(Boolean).join(' · '))}<br>Pour 100 g : ${per100(f)}</small></div>`}
  <label class="pk-q">Quantité<span><input id="pq" inputmode="decimal" value="${esc(String(pick.q).replace('.',','))}" aria-label="Quantité en grammes"> g</span></label>
  <div class="chips pk-c">${qs.map(q=>`<button type="button" class="chip${num(pick.q)===q?' on':''}" data-act="pickq" data-q="${q}">${q===f.sv?`1 portion (${q} g)`:q+' g'}</button>`).join('')}</div>
  <p class="pk-r" id="pkr"></p>
  <label class="chk"><input type="checkbox" id="pfav"> Garder cette portion dans mes favoris</label>
  <div class="row"><button type="button" class="btn pri" data-act="pickadd">Ajouter · ${esc(foodMeal.toLowerCase())}</button><button type="button" class="btn" data-act="pickback">Retour</button></div></div>`;
 pickTotal()}
function pickTotal(){if(!pick)return;const f=pick.f,x=forGrams(f,pick.q);$('#pkr').innerHTML=f.k==null?'Indique au moins les calories pour 100 g (sur l\'emballage).':`<b>${r0(x.k)} kcal</b> · ${fx(x.p)} g de protéines · ${fx(x.g)} g de glucides · ${fx(x.l)} g de lipides`;
 $$('#fpick [data-act=pickq]').forEach(b=>b.classList.toggle('on',+b.dataset.q===num(pick.q)))}
function addPicked(){const f=pick.f,q=num(pick.q);if(pick.edit&&!f.n.trim())return $('#pk-n').focus();if(f.k==null)return $('#pk-k').focus();if(!(q>0))return $('#pq').focus();
 const x=forGrams(f,q),o={n:`${f.n}${f.b?' · '+f.b:''} (${fx(q)} g)`,p:x.p,k:x.k};if(x.g)o.g=x.g;if(x.l)o.l=x.l;
 if(f.src!=='ciqual')saveProd(f);
 if($('#pfav').checked&&!S.set.foods.some(y=>norm(y.n)===norm(o.n))){S.set.foods.push({n:o.n,p:o.p,g:o.g||0,l:o.l||0,k:o.k});put.set()}
 addFood(o,foodMeal);pick=null;closeSheet();buzz('ok');toast(`${o.n} ajouté · ${foodMeal}`)}
/* ---------- scan : caméra, puis Open Food Facts ---------- */
async function openScan(){const sc=$('#scan');sc.hidden=false;document.documentElement.classList.add('scan-open');$('#sccode').value='';$('#scmsg').textContent='Vise le code-barres de l\'emballage';sc.classList.remove('nocam');
 try{scanStop=await startScanner($('#scv'),c=>{scanStop=null;buzz('ok');closeScan();handleCode(c)});if(sc.hidden&&scanStop){scanStop();scanStop=null}}
 catch(e){sc.classList.add('nocam');$('#scmsg').textContent=e&&e.name==='NotAllowedError'?'Arden n\'a pas accès à la caméra (Réglages → Arden → Appareil photo). Tu peux taper le code :':'Caméra indisponible : tape les chiffres sous le code-barres.';setTimeout(()=>$('#sccode').focus(),60)}}
function closeScan(){if(scanStop){scanStop();scanStop=null}$('#scan').hidden=true;document.documentElement.classList.remove('scan-open')}
/* Alerte façon iOS : un titre, une phrase, des choix. Renvoie la clé du bouton touché (null si fermée). */
let dlgDone=null;
function ask(title,msg,btns){const d=$('#dlg');if(dlgDone)dlgDone(null);
 $('#dlgt').textContent=title;$('#dlgm').textContent=msg;
 $('#dlgb').innerHTML=btns.map(([k,l,cls])=>`<button type="button" class="btn${cls?' '+cls:''}" data-dlg="${k}">${esc(l)}</button>`).join('');
 d.hidden=false;document.documentElement.classList.add('dlg-open');buzz('warn');setTimeout(()=>$('#dlgb .btn')?.focus({preventScroll:true}),60);
 return new Promise(res=>{dlgDone=k=>{dlgDone=null;d.hidden=true;document.documentElement.classList.remove('dlg-open');res(k)}})}
const closeDlg=k=>{if(dlgDone)dlgDone(k)};
/* Code lu : produit déjà connu, trouvé sur Open Food Facts, ou alerte (inconnu, incomplet, hors connexion) */
async function handleCode(code){const known=prods().find(x=>x.id===code);if(known)return openPick(known);
 toast('Recherche du produit…');let r=null,f=null,err=false;
 try{r=await lookupOFF(code)}catch(e){err=true}
 $('#toast').classList.remove('on');
 if(r&&r.found){f={...r.prod,src:'off'};if(f.k!=null&&f.n){saveProd(f);return openPick(f)}}
 const blank={id:code,n:'',k:null,src:'mine'};
 const [t,m]=err?['Pas de connexion',`Impossible de chercher le code ${code} sur Open Food Facts pour l'instant. Tu peux réessayer, ou saisir le produit toi-même.`]
  :f?['Produit incomplet',`${f.n||'Ce produit'} est connu d'Open Food Facts, mais sans ses valeurs nutritionnelles. Complète-les une fois : Arden s'en souviendra au prochain scan.`]
  :['Produit inconnu',`Le code ${code} n'est pas encore dans Open Food Facts. Ajoute-le toi-même avec les valeurs de l'emballage : Arden s'en souviendra au prochain scan.`];
 const k=await ask(t,m,[['add',f?'Compléter moi-même':'Ajouter moi-même','pri'],[err?'retry':'rescan',err?'Réessayer':'Scanner à nouveau'],['cancel','Annuler','ghost']]);
 if(k==='add')return openPick(f||blank);
 if(k==='retry')return handleCode(code);
 if(k==='rescan')return openScan()}
function renderSessCard(){const c=S.cur,el=$('#sesscard');if(!el)return;
 const row=(m,col,ic,t,s2)=>`<button type="button" class="hr" data-act="msopen" data-m="${m}" style="--c:${col}"><i><svg viewBox="0 0 24 24">${ic}</svg></i><span><b>${t}</b><small>${s2}</small></span><em>›</em></button>`;
 if(c){const n=c.ex.filter(e=>norm(e.n)).length,h0=new Date(c.t||Date.now()).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'});
  el.innerHTML=`<div class="panel sessnow"><button type="button" class="hr" data-act="msopen" style="--c:var(--trn)"><i><svg viewBox="0 0 24 24">${IC.lift}</svg></i><span><b>Séance en cours</b><small>${esc(c.name||'Séance')} · ${n} exercice${n>1?'s':''} · commencée à ${h0}</small></span><em class="go">Reprendre</em></button></div>`;return}
 el.innerHTML=`<div class="panel sessnew"><h2>Noter une séance</h2>${row('mu','var(--trn)',IC.lift,'Séance de muscu','Séries, charges et progression suggérée')}${row('sp','var(--eff)',IC.bolt,'Autre sport','Course, vélo, natation, yoga…')}</div>`}

/* ---------- pages de détail des tuiles (comme dans Santé) ---------- */
let metK='',metP=30;
const dayKcal=d=>{const it=dayIt(d);return it.length?it.reduce((a,x)=>a+kcalOf(x),0):null};
const dayWat=d=>{const w=num((S.days[d]||{}).w)||num(H(d).wa);return w?w/1000:null};
const MET={
 burn:{t:'Calories brûlées',u:'kcal',col:'var(--eff)',cum:1,f:d=>{const x=burnOf(d);return x?x.total:null},bars:1,fmt:r0,
  about:'Ton corps dépense de l\'énergie en permanence, même au repos : c\'est le métabolisme de base, qui représente 60 à 70 % de la dépense d\'une journée chez la plupart des gens. Il dépend surtout de ta masse maigre, donc de ton poids, de ta taille, de ton âge et de ton sexe. La formule de Mifflin-St Jeor, utilisée ici, est celle que les études comparatives jugent la plus fiable chez l\'adulte : elle tombe à moins de 10 % près pour la majorité des gens. Le métabolisme de base est réparti sur les 24 heures, d\'où un total qui grimpe au fil de la journée. Les calories actives viennent de ta montre (mouvement et fréquence cardiaque) ; elles sont moins précises, avec des écarts de 20 % ou plus selon les activités. La digestion ajoute environ 10 % de ce que tu manges, non compté ici. C\'est une estimation, utile surtout pour suivre tes tendances.'},
 stz:{t:'Stress estimé',u:'/ 100',col:'var(--str)',f:d=>has(H(d).stz)?num(H(d).stz):null,line:1,fmt:r0,
  about:'Part des minutes de la journée où ta fréquence cardiaque était nettement au-dessus de ton repos alors que tu bougeais peu (hors sommeil et entraînement). Une FC qui monte sans effort physique reflète souvent une activation du système nerveux sympathique : stress, mais aussi caféine, chaleur, digestion, déshydratation ou station debout prolongée. C\'est donc une estimation, pas une mesure du stress. Sous 10, la journée a été calme ; au-delà de 20 à 30, elle a été chargée. La respiration lente (environ 6 cycles par minute), l\'activité physique régulière et un sommeil suffisant aident à faire baisser cette activation.'},
 hrv:{t:'VFC nocturne',u:'ms',col:'var(--mind)',f:d=>nhrv(d),line:1,fmt:r0,base:d=>{const b=nhrvBase(d);return b?{m:b.m,s:b.s}:null},
  about:'La variabilité de la fréquence cardiaque (VFC) mesure les petites différences de durée entre deux battements. Elle reflète surtout l\'activité du système nerveux parasympathique, celui du repos et de la récupération. Elle varie énormément d\'une personne à l\'autre (âge, génétique, condition physique) et baisse naturellement avec l\'âge : il n\'existe pas de bonne valeur universelle, et comparer la tienne à celle de quelqu\'un d\'autre n\'a pas de sens. Ce qui compte, c\'est ta tendance : au-dessus de ta plage habituelle, c\'est souvent signe de bonne récupération ; une baisse qui dure plusieurs jours accompagne fréquemment un manque de sommeil, l\'alcool, le stress, une maladie qui commence ou une charge d\'entraînement trop forte. L\'entraînement d\'endurance régulier tend à l\'augmenter sur plusieurs semaines. L\'Apple Watch mesure le SDNN, qui ne se compare pas directement au RMSSD utilisé par d\'autres appareils.'},
 rhr:{t:'FC au repos',u:'bpm',col:'var(--hrt)',f:d=>num(H(d).rhr)||null,line:1,fmt:r0,base:d=>{const b=zb(x=>num(H(x).rhr)||null,d);return b.m!=null?{m:b.m,s:Math.max(b.s,1.5)}:null},
  about:'La fréquence cardiaque au repos est le nombre de battements par minute quand tu es éveillé et immobile depuis un moment. Chez l\'adulte, 60 à 100 bpm est considéré comme normal ; les sportifs d\'endurance descendent souvent sous 60. Les grandes études de suivi associent une FC de repos plus basse à un meilleur pronostic cardiovasculaire et à une meilleure espérance de vie. L\'entraînement d\'endurance la fait baisser progressivement, sur plusieurs semaines à quelques mois. À court terme, une hausse de 5 bpm ou plus pendant plusieurs jours par rapport à ton habitude accompagne souvent fatigue, maladie, déshydratation, alcool, chaleur ou stress.'},
 st:{t:'Pas',u:'pas',col:'var(--eff)',cum:1,f:d=>num(H(d).st)||null,bars:1,fmt:r0,goal:()=>num(S.set.steps),
  about:'Marcher davantage est l\'un des comportements les plus clairement associés à une meilleure santé. Dans les grandes études, le risque de mortalité baisse nettement à mesure que le nombre de pas augmente, jusqu\'à environ 8 000 à 10 000 pas par jour avant 60 ans et 6 000 à 8 000 après ; au-delà, le bénéfice se stabilise. Chaque tranche de 1 000 pas en plus compte, même en partant de peu. Le rythme compte aussi : une partie des pas faite à allure soutenue (marche rapide) apporte un bénéfice supplémentaire.'},
 nut:{t:'Nutrition',u:'kcal',col:'var(--nut)',cum:1,f:dayKcal,bars:1,fmt:r0,goal:()=>num(S.set.kcal),
  about:'Les besoins caloriques dépendent de ta taille, de ton poids, de ton âge et de ton activité ; les formules et les montres les estiment avec une erreur de plusieurs centaines de kcal. La mesure la plus fiable est tes « besoins caloriques réels » (onglet Nutrition), calculée à partir de ce que tu manges et de l\'évolution de ton poids. Pour les protéines, avec de la musculation, environ 1,6 g par kg de poids et par jour suffit à la plupart des gens pour garder ou développer du muscle, jusqu\'à 2,2 g/kg en déficit calorique ; les répartir en 3 ou 4 prises de 20 à 40 g aide. Le minimum pour la santé générale est de 0,8 g/kg.'},
 wat:{t:'Hydratation',u:'L',col:'var(--wat)',cum:1,f:dayWat,bars:1,fmt:fx,goal:()=>num(S.set.water)/1000,
  about:'Les apports en eau conseillés, boissons et aliments compris, sont d\'environ 2,5 L par jour pour un homme et 2 L pour une femme ; les boissons en apportent 70 à 80 %, le reste vient de l\'alimentation. Les besoins augmentent avec la chaleur, l\'altitude et l\'activité physique : compte environ 0,5 à 1 L de plus par heure d\'effort qui fait transpirer. La soif et une urine claire restent de bons repères au quotidien.'},
};
function openMetric(k){if(!MET[k])return;metK=k;openSheet('metric');renderMetric()}
function renderMetric(){const m=MET[metK];if(!m)return;const end=S.day,from=addD(end,-(metP-1)),pts=[];
 for(let x=from;x<=end;x=addD(x,1)){const v=m.f(x);if(v!=null&&isFinite(v))pts.push({x,y:Math.round(v*100)/100})}
 const part=m.cum&&end===today(),ys=pts.filter(p=>!(part&&p.x===end)).map(p=>p.y),av=avg(ys),mn=ys.length?Math.min(...ys):null,mx=ys.length?Math.max(...ys):null,last=m.f(end),b=m.base?m.base(end):null,goal=m.goal?m.goal():0;
 const U=v=>v==null?'–':`${m.fmt(v)}<small> ${m.u}</small>`,per=`${dShort(from)} – ${dShort(end)}`;
 const row=(l,v)=>`<div class="mrow"><span>${l}</span><b>${v}</b></div>`;
 /* interprétation de la valeur du jour */
 let note='';
 if(last!=null&&b&&(metK==='hrv'||metK==='rhr')){const lo=b.m-b.s,hi=b.m+b.s,z=(last-b.m)/b.s,lab=metK==='hrv'?(z>1?'au-dessus de ta plage habituelle, un signe fréquent de bonne récupération':z<-1?'sous ta plage habituelle. Une baisse isolée est courante ; si elle dure plusieurs jours, pense sommeil, alcool, stress, maladie ou charge d\'entraînement':'dans ta plage habituelle'):(z>1?`plus haute que d'habitude (${sg(Math.round(last-b.m))} bpm). Si cela dure plusieurs jours, pense fatigue, maladie, alcool ou stress`:z<-1?'plus basse que d\'habitude, ce qui va souvent avec une bonne récupération':'dans ta plage habituelle');
  note=`${metK==='hrv'?'Ta VFC':'Ta FC au repos'} (${m.fmt(last)} ${m.u}) est ${lab}. Plage habituelle sur 30 jours : ${m.fmt(lo)} à ${m.fmt(hi)} ${m.u}.`}
 else if(metK==='burn'){const x=burnOf(end),b=bmrInfo();note=(b.v?`Ton métabolisme de base est estimé à ${r0(b.v)} kcal par jour (${fx(b.wt)} kg, ${b.ht} cm, ${b.a} ans${b.sx?'':', sexe non précisé : moyenne homme-femme'}).`:`Pour calculer ton métabolisme de base, renseigne ${b.miss.join(', ')} (Plus → Réglages, et ton poids dans Nutrition). En attendant, l'appli utilise l'énergie au repos mesurée par Apple Santé.`)+(x?` ${end===today()?'Aujourd\'hui à '+new Date().toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'}):'Ce jour-là'} : ${r0(x.basal)} kcal de base + ${r0(x.active)} kcal actives = ${r0(x.total)} kcal.`:'')}
 else if(metK==='stz'&&last!=null)note=`Stress estimé de ${r0(last)} / 100 ce jour : ${stressLab(last).toLowerCase()}.`;
 else if(metK==='st'&&av!=null){const a=ageOf(),old=a!=null&&a>=60,g1=old?6000:8000;note=`Moyenne de ${r0(av)} pas par jour sur la période : ${av>=g1?'au niveau où la recherche observe l\'essentiel du bénéfice pour la santé':av>=g1-3000?'chaque millier de pas en plus apporterait un bénéfice mesurable':'augmenter progressivement, par exemple de 1 000 pas par jour chaque semaine, apporterait un bénéfice net'}.`}
 else if(metK==='nut'&&av!=null){const pr=[];for(let x=from;x<=end;x=addD(x,1)){const it=dayIt(x);if(it.length)pr.push(sum(it,'p'))}const W=weights(),wk=Object.keys(W).sort(),wt=wk.length?wAvg(W,wk[wk.length-1]):null,pa=avg(pr);note=`${r0(av)} kcal et ${r0(pa)} g de protéines par jour en moyenne sur les jours notés${wt?`, soit ${fx(pa/wt)} g/kg pour ${fx(wt)} kg`:''}.`}
 else if(metK==='wat'&&av!=null){note=`${fx(av)} L par jour en moyenne sur les jours notés, pour un objectif de ${fx(goal)} L.`}
 $('#mdet').innerHTML=`<div class="seg mseg">${[[7,'7 J'],[30,'30 J'],[182,'6 M']].map(([n,l])=>`<button type="button" data-act="mper" data-n="${n}" class="${metP===n?'on':''}">${l}</button>`).join('')}</div>
  <div class="panel"><div class="mhead"><span class="eyebrow">Moyenne${part?' · jours complets':''}</span><b class="big">${U(av)}</b><span class="mute small">${per}${pts.length&&pts.length<metP?` · ${pts.length} jour${pts.length>1?'s':''} avec mesure`:''}</span></div><div class="fig sm" id="mfig"><svg></svg></div></div>
  <div class="panel mstats">${row(end===today()?(part?"Aujourd'hui, en cours":"Aujourd'hui"):dShort(end),U(last))}${row('Minimum',U(mn))}${row('Maximum',U(mx))}${b?row('Plage habituelle (30 j)',`${m.fmt(b.m-b.s)} – ${m.fmt(b.m+b.s)}<small> ${m.u}</small>`):''}${goal?row('Objectif',U(goal)):''}</div>
  ${metK==='stz'?'<button type="button" class="btn pri ms-main" data-act="breath">Respiration guidée</button>':''}<h3 class="ms-sec">À propos</h3><div class="panel mabout">${note?`<p><b>${note}</b></p>`:''}<p>${m.about}</p><p class="mute small">Repères tirés des recommandations et de la recherche ; ils ne remplacent pas un avis médical.</p></div>`;
 const mh=$('#mdet .mhead'),mh0=mh.innerHTML,byD=new Map(pts.map(p=>[p.x,p.y]));
 setFig('#mfig',{onScrub:dt=>{mh.innerHTML=dt==null||!byD.has(dt)?mh0:`<span class="eyebrow">${esc(dLong(dt))}</span><b class="big">${U(byD.get(dt))}</b><span class="mute small">${b?(()=>{const z=(byD.get(dt)-b.m)/b.s;return Math.abs(z)<=1?'dans ta plage habituelle':z>0?'au-dessus de ta plage habituelle':'sous ta plage habituelle'})():av!=null?`moyenne de la période : ${m.fmt(av)} ${m.u}`:''}</span>`},series:[{name:m.t,pts,col:m.col,bars:!!m.bars,dots:!m.bars&&metP<=30,r:3,w:2,last:!m.bars}],unit:m.u,zero:!!m.bars,hline:goal||null,band:b?[b.m-b.s,b.m+b.s]:null,fmt:m.fmt,empty:'Pas de mesure sur cette période'});
 if(msKind==='metric')msBar()}

/* ---------- rituels : la soirée, la semaine, le briefing du matin ---------- */
const NIGHT_TIPS=['Lumière tamisée et écrans en mode nuit','Chambre fraîche, autour de 18 °C','Pas de caféine après 14 h, dîner léger','Dix minutes de lecture ou de respiration lente','Même heure de coucher que d\'habitude, à 30 min près'];
function ritualHTML(d){if(d!==today()||!hKeys().length)return'';const n=new Date(),hr=n.getHours(),wd=n.getDay(),b=bedOf(d),bi=bedIn(d);
 if(b&&bi!=null&&hr>=18&&bi<=240){const k=+d.slice(8)%NIGHT_TIPS.length,tips=[0,1,2].map(i=>NIGHT_TIPS[(k+i)%NIGHT_TIPS.length]);
  return `<div class="panel ritual eve"><span class="eyebrow">Ce soir</span><b class="rt">${bi<=10?'C\'est l\'heure de dormir':'Au lit dans '+fmtSl(bi)}</b><p>Vers ${hhmm(b.bed)}, pour ${fmtSl(b.need)} de sommeil et un réveil à ${hhmm(b.wake)}.</p><ul class="tips">${tips.map(t=>`<li>${t}</li>`).join('')}</ul></div>`}
 if(wd===1||(wd===0&&hr>=17)){const w=weekRecap();if(w)return `<button type="button" class="panel ritual wkr" data-go="tendances"><span class="eyebrow">Ta semaine est prête</span><b class="rt">${w.title}</b><p>${w.line}</p><span class="go">Voir et partager ›</span></button>`}
 if(hr<12&&S.set.brief===d&&(H(d).sl||recovery(d)))return `<button type="button" class="ritual-link" data-act="briefopen">${ARC}<span>Revoir le briefing du matin</span><em>›</em></button>`;
 return''}
/* La semaine en un coup d'œil : moyennes, jours actifs, et une image à partager. Le lundi, la semaine qui vient de finir. */
function weekRecap(e){e=e||(new Date().getDay()===1?addD(today(),-1):today());const ds=[];for(let i=6;i>=0;i--)ds.push(addD(e,-i));
 const val=f=>ds.map(d=>{const r=f(d);return r==null?null:typeof r==='object'?r.s:r}),av=a=>{const x=a.filter(y=>y!=null);return x.length?avg(x):null};
 const E=val(effortOf),R=val(recovery),Sl=val(sleepScore),act=ds.filter(d=>{const t=dayTrain(d);return t.mu.length+t.sp.length+t.ap.length>0}).length;
 const sl=avg(ds.map(d=>num(H(d).sl)).filter(x=>x>0)),r=av(R),s2=av(Sl),e2=av(E),n=ds.filter((d,i)=>R[i]!=null||Sl[i]!=null||E[i]!=null).length;
 if(n<3&&act<2)return null;
 const pv=ds.map(d=>addD(d,-7)),rp=av(pv.map(d=>recovery(d)?.s??null));
 const title=act>=4&&(r==null||r>=50)?'Semaine solide':act>=4?'Semaine chargée':r!=null&&r>=67?'Semaine pleine d\'énergie':act<=1?'Semaine calme':'Semaine régulière';
 const bi=R.reduce((b,v,i)=>v!=null&&(b<0||v>R[b])?i:b,-1);
 const line=[`${act} jour${act>1?'s':''} actif${act>1?'s':''}`,sl?`${fmtSl(sl)} de sommeil par nuit`:'',r!=null?`énergie moyenne de ${r0(r)} %${rp!=null&&Math.abs(r-rp)>=3?` (${sg(Math.round(r-rp))} vs la semaine d'avant)`:''}`:''].filter(Boolean).join(', ')+'.';
 return{ds,E,R,Sl,e:e2,r,s:s2,act,sl,title,line,best:bi>=0?ds[bi]:null,from:ds[0],to:e}}
const WL='LMMJVSD',wdl=d=>WL[(new Date(d+'T12:00').getDay()+6)%7];
function renderRecap(){const w=weekRecap(),el=$('#recap');if(!w){el.hidden=true;return}el.hidden=false;
 el.innerHTML=`<div class="rc-h"><span class="eyebrow">Ta semaine · du ${dShort(w.from)} au ${dShort(w.to)}</span><b class="rt">${w.title}</b><p>${w.line}</p></div>
 <div class="gauges rc-g">${[[w.e,'var(--eff)','Dépense','/100'],[w.r,'var(--rec)','Énergie','%'],[w.s,'var(--slp)','Sommeil','/100']].map(([v,c,l,u])=>`<div class="gauge">${gaugeSVG(v,c,u,100,'wk|'+l+'|'+w.to)}<b>${l}</b><span>moyenne</span></div>`).join('')}</div>
 <div class="rc-d">${w.ds.map((d,i)=>`<div title="${esc(dLong(d))}"><span>${wdl(d)}</span>${barsSVG([[w.E[i],'var(--eff)'],[w.R[i],'var(--rec)'],[w.Sl[i],'var(--slp)']])}</div>`).join('')}</div>
 <div class="row"><button type="button" class="btn pri" data-act="share">Partager ma semaine</button>${w.best?`<span class="mute small">Meilleure forme : ${esc(dLong(w.best))}</span>`:''}</div>`}
/* Image de la semaine (1080 × 1350, format des réseaux sociaux), dessinée sur place : rien n'est envoyé ailleurs. */
async function shareWeek(){const w=weekRecap();if(!w)return;
 try{await Promise.all(['600 100px "Fraunces Variable"','600 30px "Inter Variable"'].map(f=>document.fonts.load(f)))}catch(e){}
 const W=1080,HH=1350,cv=document.createElement('canvas');cv.width=W;cv.height=HH;const g=cv.getContext('2d'),SANS='-apple-system,"Inter Variable",system-ui,sans-serif',SER='"Fraunces Variable",Georgia,serif',ROUND='ui-rounded,-apple-system,"Inter Variable",system-ui,sans-serif';
 const ink='#1b1813',mute='#6c645a',cols=['#f2553d','#0aa898','#3651d4'],rgba=(h,a)=>`rgba(${parseInt(h.slice(1,3),16)},${parseInt(h.slice(3,5),16)},${parseInt(h.slice(5,7),16)},${a})`;
 const rr=(x,y,w2,h2,r)=>{g.beginPath();g.roundRect?g.roundRect(x,y,w2,h2,r):g.rect(x,y,w2,h2);g.fill()};
 g.fillStyle='#f4f1eb';g.fillRect(0,0,W,HH);
 for(const [x,y,r,c] of [[140,-40,900,'rgba(255,180,140,.55)'],[980,60,760,'rgba(191,231,223,.7)']]){const gr=g.createRadialGradient(x,y,0,x,y,r);gr.addColorStop(0,c);gr.addColorStop(1,'rgba(244,241,235,0)');g.fillStyle=gr;g.fillRect(0,0,W,HH)}
 /* logo : la tuile graphite et l'arc tricolore, comme l'icône */
 g.save();g.translate(80,72);g.scale(3,3);g.fillStyle='#16161a';rr(0,0,32,32,7.2);g.lineWidth=3.78;g.lineCap='round';
 [['M8.463 24.6A10.64 10.64 0 0 1 6.52 12.26','#ff6e57'],['M9.034 9.048A10.64 10.64 0 0 1 22.966 9.048','#2fd3c1'],['M25.48 12.26A10.64 10.64 0 0 1 23.537 24.6','#6b84ff']].forEach(([p,c])=>{g.strokeStyle=c;g.stroke(new Path2D(p))});g.restore();
 g.textBaseline='middle';g.fillStyle=ink;g.font=`600 46px ${SER}`;g.fillText('Arden',200,120);
 g.textBaseline='alphabetic';g.fillStyle=mute;g.font=`500 30px ${SANS}`;g.fillText(`Ma semaine · du ${dShort(w.from)} au ${dShort(w.to)}`,80,290);
 let fs=104;g.font=`600 ${fs}px ${SER}`;while(g.measureText(w.title).width>920&&fs>60){fs-=4;g.font=`600 ${fs}px ${SER}`}g.fillStyle=ink;g.fillText(w.title,76,400);
 g.font=`400 34px ${SANS}`;g.fillStyle='#3d372f';{const words=w.line.split(' ');let line='',y=470;for(const t of words){const tt=line?line+' '+t:t;if(g.measureText(tt).width>920){g.fillText(line,80,y);line=t;y+=48}else line=tt}g.fillText(line,80,y)}
 [[w.e,'Dépense'],[w.r,'Énergie'],[w.s,'Sommeil']].forEach(([v,l],i)=>{const cx=220+i*320,cy=780,r=118,a0=Math.PI*.75,p=v==null?0:clamp(v/100,0,1);
  g.lineCap='round';g.lineWidth=26;g.strokeStyle=rgba(cols[i],.16);g.beginPath();g.arc(cx,cy,r,a0,a0+Math.PI*1.5);g.stroke();
  if(p>0){g.strokeStyle=cols[i];g.beginPath();g.arc(cx,cy,r,a0,a0+Math.PI*1.5*p);g.stroke();const a=a0+Math.PI*1.5*p;g.fillStyle='#fff';g.beginPath();g.arc(cx+r*Math.cos(a),cy+r*Math.sin(a),5.5,0,7);g.fill()}
  g.textAlign='center';g.fillStyle=ink;g.font=`600 80px ${ROUND}`;g.fillText(v==null?'–':r0(v),cx,cy+28);g.fillStyle=mute;g.font=`500 30px ${SANS}`;g.fillText(l,cx,cy+r+56);g.textAlign='left'});
 const y0=1030,bh=160;w.ds.forEach((d,i)=>{const x=118+i*126;[w.E[i],w.R[i],w.Sl[i]].forEach((v,j)=>{const bx=x+j*26,bw=18;g.fillStyle=rgba(cols[j],.16);rr(bx,y0,bw,bh,9);const h2=v==null?0:Math.max(bw,v/100*bh);if(h2){g.fillStyle=cols[j];rr(bx,y0+bh-h2,bw,h2,9)}});
  g.textAlign='center';g.fillStyle=mute;g.font=`500 26px ${SANS}`;g.fillText(wdl(d),x+35,y0+bh+42);g.textAlign='left'});
 g.fillStyle='#8a8278';g.font=`500 24px ${SANS}`;g.fillText('Arden · tes données restent sur ton téléphone',80,1300);
 const blob=await new Promise(r=>cv.toBlob(r,'image/png'));if(!blob)return toast('Image impossible à créer sur cet appareil.');
 const file=new File([blob],`arden-semaine-${w.to}.png`,{type:'image/png'});
 if(navigator.canShare&&navigator.canShare({files:[file]})){try{await navigator.share({files:[file],title:'Ma semaine avec Arden'});return}catch(e){if(e&&e.name==='AbortError')return}}
 const a=document.createElement('a');a.href=URL.createObjectURL(file);a.download=file.name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),4000);toast('Image enregistrée : '+file.name)}
/* Briefing du matin : un écran, une fois par jour, à la première ouverture avant midi. */
function maybeBrief(){const d=today(),hr=new Date().getHours();if(hr<4||hr>=12||S.set.brief===d||!$('#onb').hidden||msKind||!$('#brief').hidden)return;if(!(H(d).sl||recovery(d)))return;showBrief()}
function showBrief(){const d=today(),st=dayStory(d),rc=recovery(d),sl=sleepScore(d),ef=effortOf(d),tg=effTarget(rc&&rc.s),hr=new Date().getHours();
 $('#brhi').textContent=`${hr<5?'Bonne nuit':hr<18?'Bonjour':'Bonsoir'} · ${dLong(d)}`;$('#brt').textContent=st.t;$('#brlede').textContent=st.l;
 const k=Date.now();$('#brg').innerHTML=[[tg&&ef==null?0:ef,'var(--eff)','Dépense','/100',tg],[rc&&rc.s,'var(--rec)','Énergie','%'],[sl&&sl.s,'var(--slp)','Sommeil','/100']].map(([v,c,l,u,z])=>`<div class="gauge">${gaugeSVG(v,c,u,100,'brief|'+l+'|'+k,z)}<b>${l}</b></div>`).join('');
 $('#brplan').innerHTML=planHTML(planItems(d));paintSky($('#brief'),skyFor('aujourdhui',st.tone));
 const b=$('#brief');b.hidden=false;b.scrollTop=0;document.documentElement.classList.add('br-open');buzz('light')}
function hideBrief(){if(S.set.brief!==today()){S.set.brief=today();put.set()}const b=$('#brief');b.classList.add('out');setTimeout(()=>{b.hidden=true;b.classList.remove('out');document.documentElement.classList.remove('br-open');if(cur()==='aujourdhui')renderView('aujourdhui')},320)}

/* ---------- respiration guidée ---------- */
/* Six respirations par minute (inspire 4 s, expire 6 s) : le rythme dit « de résonance », celui qui
   fait le plus monter la variabilité cardiaque et redescendre la FC. L'arc s'ouvre à l'inspiration,
   se referme à l'expiration ; une vibration marque chaque phase (et chaque seconde d'inspiration). */
let bzMin=1,bzRaf=0,bzT0=0;const BZ_IN=4000,BZ_CY=10000;
function openBreath(min){bzMin=min||S.set.bzMin||1;const b=$('#breath');
 const d=arcPath(120,124,92,GA0,GA0+GSPAN);$$('#breath .bz-tr,#breath .bz-ar').forEach(p=>p.setAttribute('d',d));
 $('#breath .bz-ar').style.strokeDashoffset=94;$('#bzw').textContent='Respiration guidée';$('#bzh').textContent='Inspire 4 s, expire 6 s : six respirations par minute, le rythme qui apaise le plus le cœur.';
 $('#bzt').textContent='';$('#bzch').hidden=false;$('#bzend').hidden=true;b.classList.remove('on');bzSeg();
 paintSky(b,skyFor('aujourdhui','eve'));b.hidden=false;document.documentElement.classList.add('bz-open')}
function bzSeg(){$$('#bzm button').forEach(x=>x.classList.toggle('on',+x.dataset.m===bzMin))}
function startBreath(){S.set.bzMin=bzMin;put.set();$('#bzch').hidden=true;$('#breath').classList.add('on');bzT0=performance.now();let ph=-1,sec=-1;const total=bzMin*60000,ar=$('#breath .bz-ar'),gl=$('#breath .bz-glow');
 const f=t=>{const el=t-bzT0;if(el>=total)return endBreath(el);
  const c=el%BZ_CY,inh=c<BZ_IN,k=inh?c/BZ_IN:(c-BZ_IN)/(BZ_CY-BZ_IN),e=.5-.5*Math.cos(Math.PI*k),p=inh?.06+.94*e:1-.94*e;
  ar.style.strokeDashoffset=(100-100*p).toFixed(2);gl.style.transform=`scale(${(.55+.45*p).toFixed(3)})`;gl.style.opacity=(.25+.5*p).toFixed(2);
  if(+inh!==ph){ph=+inh;$('#bzw').textContent=inh?'Inspire':'Expire';$('#bzh').textContent=inh?'par le nez, en gonflant le ventre':'lentement, par la bouche';buzz(inh?'med':'light')}
  if(inh){const s2=Math.floor(c/1000);if(s2!==sec){sec=s2;if(s2>0)buzz()}}else sec=-1;
  const left=Math.ceil((total-el)/1000);$('#bzt').textContent=`${Math.floor(left/60)}:${String(left%60).padStart(2,'0')}`;
  bzRaf=requestAnimationFrame(f)};
 bzRaf=requestAnimationFrame(f)}
function endBreath(el){cancelAnimationFrame(bzRaf);bzRaf=0;const b=$('#breath');b.classList.remove('on');const n=Math.round(el/60000);
 if(n>=1){const d=today(),o=getDay(d);o.br=[...(o.br||[]),{min:n,at:new Date().toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'})}];put.day(d);buzz('ok')}
 $('#bzw').textContent=n>=1?`${n} minute${n>1?'s':''} pour toi`:'Séance écourtée';
 $('#bzh').textContent=n>=1?'Ta fréquence cardiaque redescend souvent dans les minutes qui suivent. C\'est noté dans ta journée.':'Même quelques respirations lentes aident. Reviens quand tu veux.';
 $('#bzt').textContent='';$('#bzend').hidden=false;$('#breath .bz-ar').style.strokeDashoffset=0;$('#breath .bz-glow').style.transform='scale(1)'}
function closeBreath(){if(bzRaf)return endBreath(performance.now()-bzT0);$('#breath').hidden=true;document.documentElement.classList.remove('bz-open');if(cur()==='aujourdhui')renderView('aujourdhui')}

/* ---------- moments : records, zone atteinte, régularité ---------- */
let celT=0;
function celebrate(t,sub){const c=$('#cele');$('#cet').textContent=t;$('#ces').textContent=sub||'';c.hidden=false;c.classList.remove('on');void c.offsetWidth;c.classList.add('on');buzz('ok');clearTimeout(celT);celT=setTimeout(hideCele,2900)}
function hideCele(){const c=$('#cele');c.classList.remove('on');setTimeout(()=>{if(!c.classList.contains('on'))c.hidden=true},380)}
function ciStreak(){let n=0;for(let i=0;i<400;i++){const j=J(addD(today(),-i));if(j.mood||j.energy||j.stress||j.sore)n++;else if(i>0)break}return n}

/* ---------- analyse détaillée : les cartes avancées, repliées par défaut ---------- */
const DEEP={sommeil:'Durée, phases, VFC, FC et horaires sur 6 mois',recuperation:'FC nocturne, stress estimé, signes vitaux',effort:'Charge d\'entraînement, zones cardiaques, volume par muscle',tendances:'Bien-être, masse grasse, VO2 max, activité quotidienne'};
function applyDeep(){const D=S.set.deep||{};$$('.deep').forEach(b=>{const v=b.dataset.v,on=!!D[v];$('#v-'+v).classList.toggle('deep-on',on);b.setAttribute('aria-expanded',on);
 b.innerHTML=`<span><b>Analyse détaillée</b><small>${DEEP[v]}</small></span><em>${on?'Masquer':'Afficher'}</em>`})}

/* ---------- retours haptiques (appli iOS uniquement) ---------- */
function buzz(k='sel'){if(!Capacitor.isNativePlatform())return;try{
 if(k==='ok')Haptics.notification({type:NotificationType.Success});
 else if(k==='warn')Haptics.notification({type:NotificationType.Warning});
 else if(k==='light')Haptics.impact({style:ImpactStyle.Light});
 else if(k==='med')Haptics.impact({style:ImpactStyle.Medium});
 else Haptics.selectionChanged()}catch(e){}}

/* ---------- barre de titre compacte : le grand titre se replie en défilant (comme iOS) ---------- */
function navTitle(){const v=cur();return v==='aujourdhui'?(S.day===today()?"Aujourd'hui":dLong(S.day)):['sommeil','recuperation','effort'].includes(v)?$('#dtitle').textContent:v==='nutrition'?'Nutrition':v==='tendances'?'Tendances':psub?(SUBT[psub]||'Plus'):'Plus'}
function syncNav(){const t=navTitle();if($('#navct').textContent!==t)$('#navct').textContent=t}
addEventListener('scroll',()=>{document.documentElement.classList.toggle('scrolled',scrollY>64)},{passive:true});

/* ---------- premier lancement ---------- */
const needOnb=()=>!S.set.onb&&!hKeys().length&&!S.sessions.length&&!Object.keys(S.days).length&&!S.med.length;
function showOnb(step=0){const o=$('#onb');o.hidden=false;document.documentElement.style.overflow='hidden';
 $$('#onb .ob').forEach(x=>x.hidden=+x.dataset.step!==step);$$('#onb .ob-dots i').forEach((x,i)=>x.classList.toggle('on',i===step));
 if(step===0){const k=Date.now();$('#obg').innerHTML=[[68,'var(--eff)','Dépense','/100',[60,85]],[84,'var(--rec)','Énergie','%'],[91,'var(--slp)','Sommeil','/100']].map(([v,c,l,u,z])=>`<div class="gauge">${gaugeSVG(v,c,u,100,'obg|'+l+k,z)}<b>${l}</b></div>`).join('')}
 if(step===1){$('#ob-birth').value=S.set.birth||'';$('#ob-sex').value=S.set.sex||'';$('#ob-height').value=S.set.height||'';$('#ob-sleep').value=String(S.set.sleep||450)}
 o.scrollTop=0}
function hideOnb(){$('#onb').hidden=true;document.documentElement.style.overflow=''}
function saveProfile(){const y=new Date().getFullYear(),b=Math.round(num($('#ob-birth').value)),h=Math.round(num($('#ob-height').value)),sl=num($('#ob-sleep').value);
 if(b>=y-110&&b<=y-10)S.set.birth=b;if(h>=100&&h<=250)S.set.height=h;S.set.sex=$('#ob-sex').value;if(sl>=300)S.set.sleep=sl;put.set()}
function onbGo(to){S.set.onb=1;put.set();
 if(to==='demo')return loadDemo();
 hideOnb();
 if(to==='hk'){if(location.hash!=='#aujourdhui')location.hash='aujourdhui';else renderSoft();return hkConnect()}
 if(to==='apple'){psub='apple';if(location.hash!=='#plus')location.hash='plus';else renderPlus();return}
 if(location.hash!=='#aujourdhui')location.hash='aujourdhui';else renderSoft();toast('Touche « Noter » pour ta première séance, ton repas ou ton check-in.')}

/* ---------- sauvegarde en fichier, effacement ---------- */
let pendingBk='';
const backupText=()=>JSON.stringify({v:4,set:S.set,sessions:done(),days:S.days,med:S.med});
async function saveBackup(){const name=`arden-${today()}.json`,file=new File([backupText()],name,{type:'application/json'});
 const mark=()=>{S.set.bk=today();put.set();renderSettings()};
 if(matchMedia('(pointer:coarse)').matches&&navigator.canShare&&navigator.canShare({files:[file]})){
  try{await navigator.share({files:[file],title:'Sauvegarde Arden'});mark();return}catch(e){if(e&&e.name==='AbortError')return}}
 const a=document.createElement('a');a.href=URL.createObjectURL(file);a.download=name;document.body.appendChild(a);a.click();a.parentNode.removeChild(a);setTimeout(()=>URL.revokeObjectURL(a.href),4000);
 mark();toast('Sauvegarde enregistrée : '+name)}
function resetAll(){mode='wiped';try{localStorage.removeItem(LS)}catch(e){}history.replaceState(null,'',location.pathname+location.search);location.reload()}

/* Feuille : glisser vers le bas depuis la barre du haut pour la fermer (comme iOS) */
{const ms=$('#msheet .ms'),bar=$('#msheet .ms-bar');let y0=null,dy=0;
 bar.addEventListener('pointerdown',e=>{if(e.target.closest('button')||matchMedia('(min-width:801px)').matches)return;y0=e.clientY;dy=0;ms.style.transition='none';bar.setPointerCapture(e.pointerId)});
 bar.addEventListener('pointermove',e=>{if(y0==null)return;dy=Math.max(0,e.clientY-y0);ms.style.transform=`translateY(${dy}px)`});
 const end=()=>{if(y0==null)return;y0=null;ms.style.transition='transform .25s ease';
  if(dy>110){ms.style.transform='translateY(100%)';setTimeout(()=>{closeSheet();ms.style.transform='';ms.style.transition=''},230)}
  else{ms.style.transform='';setTimeout(()=>{ms.style.transition=''},260)}};
 bar.addEventListener('pointerup',end);bar.addEventListener('pointercancel',end)}

async function init(){
 if(new URLSearchParams(location.search).has('ios')){const m=await import('./healthkit-mock.js');useHealthProvider(m.healthKitMock)}
 HKN=hasHealthKit();if(HKN)setupHK();
 route();renderEditor();status('load');
 mode='local';lsLoad();bump();pend.splice(0).forEach(f=>f());status('local');resumeOnce();renderSoft();
 if(needOnb())showOnb(0);else setTimeout(maybeBrief,350);
 addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')maybeBrief()});
 if(HKN&&S.health.src==='hk'&&!S.set.demo)hkSync({quiet:true});
 $('#appver').textContent='version '+__APP_VERSION__;
 /* Accès pour le simulateur iPhone (simulateur.html). */
 window.carnet={loadDemo,resetAll,hasRealData,showBrief,celebrate,shareWeek};
 /* Autre onglet ouvert sur la même appli : on recharge les données qu'il vient d'écrire. */
 addEventListener('storage',e=>{if(e.key!==LS)return;if(e.newValue==null)return location.reload();S.sessions=[];S.days={};lsLoad();bump();renderSoft()});
 /* Hors connexion sur le web ; inutile dans l'appli iOS, qui embarque déjà ses fichiers. */
 if('serviceWorker' in navigator&&import.meta.env.PROD&&!window.Capacitor?.isNativePlatform?.()){
  /* Nouvelle version publiée : on recharge une fois pour l'afficher tout de suite. */
  const had=!!navigator.serviceWorker.controller;let done=false;
  navigator.serviceWorker.addEventListener('controllerchange',()=>{if(had&&!done&&!$('#onb').contains(document.activeElement)){done=true;location.reload()}});
  navigator.serviceWorker.register('./sw.js',{updateViaCache:'none'}).then(r=>r.update()).catch(()=>{})}
}
init();
