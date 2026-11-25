/* Carnet de santé : logique de l'application (état, moteur d'interprétation, vues, import, événements). */
// Police : SF Pro (police système) sur les appareils Apple ; ailleurs Inter, intégrée à l'appli
// (aucun appel à un service de polices). Chargée seulement si SF Pro est absent.
import '@fontsource-variable/inter/opsz.css'; // graisse + taille optique (comme SF Pro Text / Display)
import {$,$$,esc,clone,iso,today,addD,dShort,dLong,dWk,num,has,fx,f2,r0,sg,clamp,nid,norm,plain,e1,sortDesc,setTxt,fmtSl,hhmm,hm,avg,sdv} from './utils.js';
import {BASE_EX,SPORTS,MEALS,WT,MG,SCALES,MEAS,ZC,ZN,IC,DEF} from './constants.js';
import {readHealth} from './health-import.js';
import {demoHealthXML,demoManual,DEMO_PROFILE} from './demo.js';
import {hasHealthKit,authorizeHealth,readHealthKit,useHealthProvider} from './healthkit.js';

const S={set:clone(DEF),sessions:[],days:{},med:[],cur:null,health:{upd:'',d:{}},detail:{d:{}},day:today()};
let mode='load',resumed=false,histN=15,sv,tt,startMode='mu',medFlt='Tout',psub='',sleepTrend='sl',sleepPer=30;
const LS='carnet-muscu-v1',pend=[];
/* Appli iOS : Apple Santé est lu directement (HealthKit) au lieu d'un fichier d'export. */
let HKN=false,hkBusy=false;const IMP=(web,ios)=>HKN?ios:web;

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
 if(eff)c.push(['Efficacité',clamp((eff-0.75)/0.17*100,0,100),.15,`${r0(eff*100)} % du temps ${h.lat!=null?'au lit':'entre endormissement et réveil'} passé à dormir`]);
 if(h.sd||h.sr){const rp=(num(h.sd)+num(h.sr))/h.sl;c.push(['Récupératrice',clamp((rp-0.15)/0.2*100,0,100),.2,`${r0(rp*100)} % en profond + paradoxal (repère montre : 30 à 35 %)`])}
 const bt=vals('sb',d,14);if(has(h.sb)&&bt.length>=4){const dv=Math.abs(h.sb-avg(bt));c.push(['Régularité',clamp(100-dv*0.9,0,100),.15,`coucher à ${hhmm(h.sb)}, ${r0(dv)} min de ta moyenne`])}
 if(has(h.wu))c.push(['Continuité',clamp(100-num(h.wu)*12,0,100),.1,`${h.wu} réveil${h.wu>1?'s':''} dans la nuit`]);
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
 const rhr=winAvg('rhr',L,30);if(rhr)M('FC au repos',r0(rhr)+' bpm',rhr<55?['Athlétique','var(--rec)']:rhr<65?GD:rhr<75?MID:BAD,'Une FC de repos basse traduit un cœur entraîné. Une hausse durable de plus de 5 bpm signale fatigue, maladie ou surmenage.');
 const vo=hKeys().filter(d=>H(d).vo2).map(d=>H(d).vo2);if(vo.length){const v=vo[vo.length-1];if(age&&sex){const off=Math.max(0,Math.floor((age-20)/10))*3.5,th=(sex==='f'?[31,35,39,45]:[38,42,46,52]).map(x=>x-off);const c=v<th[0]?['Faible','var(--bad)']:v<th[1]?['Moyen','var(--str)']:v<th[2]?['Bon','var(--rec)']:v<th[3]?['Très bon','var(--rec)']:['Excellent','var(--rec)'];M('VO2 max',fx(v)+' ml/kg/min',c,`Pour ${sex==='f'?'une femme':'un homme'} de ${age} ans : bon à partir de ${th[1]}, excellent au-delà de ${th[3]}. C'est l'un des meilleurs indicateurs de santé à long terme ; il progresse avec l'endurance en zone 2 et le fractionné.`)}else M('VO2 max',fx(v)+' ml/kg/min',NA,'Renseigne ton année de naissance et ton sexe (Plus → Réglages) pour situer ta valeur par rapport aux normes de ton âge.')}
 const nv=[];for(let i=0;i<90;i++){const x=nhrv(addD(L,-i));if(x)nv.push([i,x])}if(nv.length>=20){const a=avg(nv.filter(x=>x[0]<14).map(x=>x[1])),b=avg(nv.filter(x=>x[0]>=14).map(x=>x[1]));if(a&&b){const pc=Math.round((a/b-1)*100);M('Tendance de la VFC',`${r0(a)} ms (${pc>0?'+':''}${pc} %)`,pc>=-5?(pc>=5?['En hausse','var(--rec)']:['Stable','var(--rec)']):pc>=-12?MID:BAD,`Tes 14 dernières nuits comparées aux 2 mois et demi précédents (${hvLab()}). La VFC n'a pas de norme universelle : c'est ta tendance qui compte. Une baisse durable traduit un stress ou une récupération insuffisante.`)}}
 const sl=winAvg('sl',L,30);if(sl)M('Sommeil moyen',fmtSl(sl),sl>=420&&sl<=540?OK:sl>=360?MID:BAD,'Les adultes ont besoin de 7 à 9 h. En dessous de 7 h de façon chronique, la récupération musculaire, la glycémie et l\'humeur se dégradent.');
 const bt=vals('sb',L,30,0);if(bt.length>=10){const v=sdv(bt);M('Régularité du coucher',`± ${r0(v)} min`,v<30?OK:v<60?MID:BAD,'Écart-type de ton heure d\'endormissement. Des horaires réguliers (± 30 min) améliorent la qualité du sommeil et la récupération, même à durée égale.')}
 const st=winAvg('st',L,30);if(st)M('Pas par jour',r0(st),st>=8000?OK:st>=5000?MID:BAD,'Les études associent 7 000 à 10 000 pas par jour à une baisse nette de la mortalité ; au-delà, le bénéfice continue mais plus lentement.');
 const exs=vals('ex',L,28,0);if(exs.length>=14){const wkm=exs.reduce((a,b)=>a+b,0)/4;M('Activité par semaine',r0(wkm)+' min',wkm>=300?['Excellent','var(--rec)']:wkm>=150?GD:wkm>=75?MID:BAD,'L\'OMS recommande 150 à 300 min d\'activité modérée par semaine (ou 75 à 150 min intense), plus 2 séances de renforcement. Mesuré par les minutes d\'exercice de la montre.')}
 if(wt){if(hgt>100){const bmi=wt/(hgt/100)**2;M('IMC',fx(bmi),bmi>=18.5&&bmi<25?GD:bmi<30?MID:BAD,`${fx(wt)} kg pour ${hgt} cm. Chez un pratiquant de musculation, l'IMC surestime souvent l'excès de poids : regarde plutôt ton tour de taille.`)}else M('IMC','–',NA,'Renseigne ta taille (Plus → Réglages) pour calculer ton IMC et ton rapport tour de taille / taille.')}
 const ms=Object.keys(S.days).filter(d=>S.days[d].m&&S.days[d].m.taille).sort();if(ms.length&&hgt>100){const w=S.days[ms[ms.length-1]].m.taille,r=w/hgt;M('Tour de taille / taille',f2(r),r<0.5?OK:r<0.6?MID:BAD,`${fx(w)} cm de tour de taille. Sous 0,5, le risque cardiométabolique est faible ; c'est un meilleur indicateur que l'IMC pour la graisse abdominale.`)}
 const bf=hKeys().filter(d=>H(d).bf).map(d=>H(d).bf);if(bf.length&&sex){const v=bf[bf.length-1],r=sex==='f'?[21,33,39]:[8,20,25];M('Masse grasse',fx(v)+' %',v<r[0]?MID:v<=r[1]?GD:v<=r[2]?MID:BAD,`Plage saine pour ${sex==='f'?'une femme':'un homme'} : ${r[0]} à ${r[1]} %. Les balances à impédance ont une marge d'erreur de plusieurs points.`)}
 const pr=[];for(let i=0;i<14;i++){const d=addD(today(),-i);if(dayIt(d).length)pr.push(sum(dayIt(d),'p'))}if(pr.length>=5&&wt){const gk=avg(pr)/wt;M('Protéines par kg',fx(gk)+' g/kg',gk>=1.6&&gk<=2.4?OK:gk>=1.2?MID:BAD,`${r0(avg(pr))} g par jour en moyenne pour ${fx(wt)} kg. Pour prendre ou garder du muscle, la recherche recommande 1,6 à 2,2 g/kg.`)}
 const o2=winAvg('o2',L,30);if(o2)M('Saturation nocturne',fx(o2)+' %',o2>=95?OK:o2>=92?MID:BAD,'Une saturation habituellement sous 92-93 % la nuit peut évoquer des apnées du sommeil : à évoquer avec un médecin si elle se confirme.');
 const rr=winAvg('rr',L,30);if(rr)M('Respiration nocturne',fx(rr)+' /min',rr>=12&&rr<=20?OK:MID,'La norme au repos est de 12 à 20 respirations par minute. Ce qui compte surtout, ce sont les écarts brusques à ta propre moyenne.');
 const dp=winAvg('dip',L,14);if(dp)M('Baisse de FC la nuit',r0(dp)+' %',dp>=10&&dp<=25?OK:dp>=5?MID:BAD,'Ta FC devrait baisser de 10 à 20 % la nuit par rapport à la journée. Une baisse faible est souvent liée à un repas ou un entraînement tardif, à l\'alcool ou au stress.');
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
 if(all.length<2){f._g=null;s.innerHTML=`<text x="${W/2}" y="${H2/2+4}" text-anchor="middle">${esc(c.empty||'Pas encore assez de données')}</text>`;return}
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
  if(!rows.length)return null;for(const [se,m,b] of avgs){const q=b.find(z=>z.x===dt),tf2=se.tf||tfd;if(q)rows.push(`<div class="d">Plage habituelle (±${hw} j) : ${esc(tf2(q.lo))} à ${esc(tf2(q.hi))}</div>`);const v=maps[c.series.indexOf(se)].get(dt);if(v!=null)rows.push(`<div class="d">${esc(se.name||'')} vs moyenne de la période (${esc((se.tf||tfd)(m))}) : <b>${v-m>0?'+':''}${esc((se.df||c.df||se.tf||tfd)(Math.abs(v-m))).replace(/^/,v-m<0?'−':'')}</b></div>`)}return{gx,mk,ty:Math.min(...mk.map(m=>m[1])),html:`<div class="d">${esc(dLong(dt))}</div>${rows.join('')}${c.band?`<div class="d">ta normale : ${esc(fm(c.band[0]))} à ${esc(fm(c.band[1]))}</div>`:''}`}}};
 interact(f)}
function interact(f){if(f._i)return;f._i=1;const ov=document.createElement('div');ov.className='ov';f.appendChild(ov);
 const hide=()=>{ov.innerHTML=''};
 const move=e=>{const g=f._g;if(!g)return hide();const r=f.getBoundingClientRect(),x=e.clientX-r.left,res=g.hit(x,e.clientY-r.top);if(!res)return hide();
  ov.innerHTML=(res.gx!=null?`<i class="guide" style="left:${res.gx}px"></i>`:'')+(res.mk||[]).map(m=>`<i class="mk" style="left:${m[0]}px;top:${m[1]}px;background:${m[2]}"></i>`).join('')+`<div class="tip">${res.html}</div>`;
  const t=ov.querySelector('.tip'),tw=t.offsetWidth,th=t.offsetHeight,ax=res.gx??x;let lx=ax+14;if(lx+tw>r.width)lx=ax-14-tw;t.style.left=Math.max(0,lx)+'px';t.style.top=clamp((res.ty??(e.clientY-r.top))-th-10,0,Math.max(0,r.height-th))+'px'};
 f.addEventListener('pointermove',move);f.addEventListener('pointerdown',move);f.addEventListener('pointerleave',hide);f.addEventListener('pointerup',e=>{if(e.pointerType!=='mouse')hide()});f.addEventListener('pointercancel',hide)}
function drawDay(f){const s=f.querySelector('svg'),c=f._d,W=f.clientWidth,H2=f.clientHeight;if(!W)return;const h=c.h||[];const pts=h.map((v,i)=>v?[i*15+7.5,v]:null).filter(Boolean);f.classList.toggle('nodata',pts.length<4);
 if(pts.length<4){f._g=null;s.innerHTML=`<text x="${W/2}" y="${H2/2+4}" text-anchor="middle">Pas de courbe cardiaque pour ce jour (détail gardé pour les 35 derniers jours importés)</text>`;return}
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
  return{gx:Xf(i*15+7.5),mk:v?[[Xf(i*15+7.5),Y(v),'var(--hrt)']]:[],ty:v?Y(v):40,html:`<div class="d">${hm(i*15)} – ${hm(i*15+15)}</div>${v?`<div><i class="sw" style="background:var(--hrt)"></i>FC moyenne : <b>${v} bpm</b></div>`:''}${inS?'<div><i class="sw" style="background:var(--slp)"></i>Sommeil</div>':''}${inW?'<div><i class="sw" style="background:var(--eff)"></i>Entraînement</div>':''}${sv?`<div><i class="sw" style="background:var(--str)"></i>Stress entre ${hh}h et ${hh+1}h : <b>${sv} / 100</b></div>`:''}`}}};
 interact(f)}
function drawHyp(f){const s=f.querySelector('svg'),c=f._d,W=f.clientWidth,H2=f.clientHeight;if(!W)return;const sg2=c.segs||[];f.classList.toggle('nodata',!sg2.length);
 if(!sg2.length){f._g=null;s.innerHTML=`<text x="${W/2}" y="${H2/2+4}" text-anchor="middle">${esc(c.empty||'Pas de détail pour cette nuit')}</text>`;return}
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
  return{gx:Xf(m),mk:[],ty:top+lh*2,html:`<div class="d">${hhmm(m)}</div>${sx?`<div><i class="sw" style="background:${SC[sx[2]]}"></i>${SN[sx[2]]} : <b>${hhmm(sx[0])} – ${hhmm(sx[1])}</b> (${fmtSl(sx[1]-sx[0])})</div>`:''}${hv?`<div><i class="sw" style="background:var(--hrt)"></i>FC : <b>${hv} bpm</b></div>`:''}${pv?`<div><i class="sw" style="background:var(--mind)"></i>VFC ${hvLab()} à ${hhmm(pv[0])} : <b>${r0(pv[1])} ms</b></div>`:''}`}}};
 interact(f)}
const nar=W=>W<520;
function gaugeSVG(v,col,unit,max=100){const r=56,C=2*Math.PI*r,p=v==null?0:clamp(v/max,0,1);return `<svg viewBox="0 0 140 140" aria-hidden="true"><circle cx="70" cy="70" r="${r}" fill="none" stroke="${col}" stroke-opacity=".15" stroke-width="13"/><circle cx="70" cy="70" r="${r}" fill="none" stroke="${col}" stroke-width="13" stroke-linecap="round" stroke-dasharray="${(C*p).toFixed(1)} ${C.toFixed(1)}" transform="rotate(-90 70 70)"${p<=0?' opacity="0"':''}/><text class="gv" x="70" y="${unit?74:80}" text-anchor="middle">${v==null?'–':Math.round(v)}</text>${unit?`<text class="gu" x="70" y="96" text-anchor="middle">${unit}</text>`:''}</svg>`}
function gauge(v,col,label,sub,link,unit='%',big){return `<${link?'button':'div'} class="gauge${big?' big':''}"${link?` data-go="${link}"`:''}>${gaugeSVG(v,col,unit)}<b>${label}</b><span>${sub||''}</span></${link?'button':'div'}>`}
const zbar=z=>{const t=(z||[]).reduce((a,b)=>a+b,0);return t?`<div class="zb">${z.map((m,i)=>m?`<i style="width:${m/t*100}%;background:${ZC[i]}"></i>`:'').join('')}</div>`:''};
const zleg=z=>`<div class="zl">${(z||[]).map((m,i)=>m?`<span><i style="--c:${ZC[i]}"></i>Z${i+1} ${m} min</span>`:'').join('')}</div>`;

/* ---------- vue commune : jour ---------- */
const VT={sommeil:'Sommeil',recuperation:'Récupération',effort:'Effort'};
function renderDayNav(){const d=S.day,v0=cur(),rel=d===today()?"Aujourd'hui":d===addD(today(),-1)?'Hier':'';
 if(VT[v0]){$('#dtitle').textContent=VT[v0];$('#dsub').textContent=rel||dLong(d)}
 else{$('#dtitle').textContent=d===today()?"Aujourd'hui":dLong(d);$('#dsub').textContent=d===today()?dLong(d):rel}$('[data-act=dnext]').disabled=d>=today();
 const L=hLast(),up=S.med.filter(m=>(m.date>=today()&&m.date<=addD(today(),14))||(m.next&&m.next>=today()&&m.next<=addD(today(),14)));const v=cur();
 $('#dn').hidden=!['aujourdhui','sommeil','recuperation','effort'].includes(v);
 $('#dnote').innerHTML=!['aujourdhui','sommeil','recuperation','effort'].includes(v)?'':(!L?`<div class="notice">${IMP('Importe ton export Apple Santé','Connecte Apple Santé')} (onglet <a href="#plus" data-act="psub" data-s="apple">Plus</a>) pour activer les scores, le sommeil détaillé et l'analyse cardiaque.</div>`:d>L?`<div class="notice">Données Apple jusqu'au ${dShort(L)}. ${IMP('Réimporte ton export','Synchronise Apple Santé')} pour mettre à jour, ou <button class="btn small" data-act="dlast">voir le ${dShort(L)}</button></div>`:'')
  +(v==='aujourdhui'&&d===today()&&up.length?`<button type="button" class="upnext" data-act="psub" data-s="dossier"><i><svg viewBox="0 0 24 24"><rect x="4" y="5" width="16" height="15" rx="3"/><path d="M8 3v4M16 3v4M4 10h16"/></svg></i><span>${up.map(m=>{const x=m.date>=today()?m.date:m.next,n=Math.round((new Date(x+'T12:00')-new Date(today()+'T12:00'))/864e5);return `<b>${esc(m.title)}</b> ${n===0?"aujourd'hui":n===1?'demain':'dans '+n+' jours'}`}).join('<br>')}</span><em>›</em></button>`:'')}

/* ---------- aujourd'hui ---------- */
function renderToday(){const d=S.day,h=H(d),D=S.days[d]||{},it=D.items||[],T=dayTrain(d),set=S.set;
 const rc=recovery(d),sl=sleepScore(d),ef=effortOf(d),tg=effTarget(rc&&rc.s);
 $('#g3').innerHTML=gauge(ef,'var(--eff)','Effort',tg?`conseillé ${tg[0]}–${tg[1]}`:'charge du jour','effort','')+gauge(rc&&rc.s,'var(--rec)','Récupération',rc?recLab(rc.s)[0]:(calib(d)<7&&hKeys().length?`calibrage ${calib(d)}/7 nuits`:'en attente de données'),'recuperation')+gauge(sl&&sl.s,'var(--slp)','Sommeil',h.sl?fmtSl(h.sl):'pas de nuit','sommeil');
 $('#coach').innerHTML=coach(d,rc,sl,ef,tg);
 const st=num(h.stz),wat=num(D.w)||num(h.wa),vb=nhrvBase(d);
 const tile=(c,k,v,s,extra='')=>`<div class="tile" style="--c:${c}"><span class="k"><i></i>${k}</span><span class="v">${v}</span><span class="s">${s}</span>${extra}</div>`;
 $('#tiles').innerHTML=[
  tile('var(--str)','Stress estimé',has(h.stz)?`${st}<small> / 100</small>`:'–',has(h.stz)?stressLab(st):hKeys().length?(d===today()?'calculé au fil de la journée':'pas de mesure ce jour'):IMP('après import Apple','après synchro Apple Santé')),
  tile('var(--mind)','VFC nocturne',nhrv(d)?`${r0(nhrv(d))}<small> ms</small>`:'–',nhrv(d)&&vb?`normale ${r0(vb.m)} ms`:'pendant ton sommeil'),
  tile('var(--hrt)','FC au repos',h.rhr?`${h.rhr}<small> bpm</small>`:'–',h.nmin?`min. nocturne ${h.nmin} bpm`:''),
  tile('var(--eff)','Activité',h.st?`${r0(h.st)}<small> pas</small>`:'–',[h.ac?r0(h.ac)+' kcal actives':'',h.ex?h.ex+' min d\'exercice':''].filter(Boolean).join(' · ')),
  tile('var(--nut)','Nutrition',`${r0(it.reduce((a,x)=>a+kcalOf(x),0))}<small> kcal</small>`,`${r0(sum(it,'p'))} g de protéines sur ${r0(set.prot)}`),
  tile('var(--wat)','Hydratation',`${fx(wat/1000)}<small> / ${fx(num(set.water)/1000)} L</small>`,'',`<div class="row"><button class="btn small" data-act="water" data-v="250">+25 cl</button><button class="btn small" data-act="water" data-v="500">+50 cl</button></div>`)
 ].join('');
 const x=X(d);const sleep=[];if(has(h.sw))sleep.push([0,(h.sw+720)%1440]);const hn=H(addD(d,1));if(has(hn.sb)){const m=(hn.sb+720)%1440;if(m>600)sleep.push([m,1440])}
 const wk=(h.wk||[]).filter(w=>has(w.st)).map(w=>[w.st,w.st+num(w.min)]);
 setFig('#fday',{type:'day',h:x&&x.h,sleep,wk,stress:x&&x.sh});
 const hs=x&&x.h?x.h.filter(Boolean):[];$('#daysum').textContent=hs.length?`FC ${Math.min(...hs)}–${Math.max(...hs)} bpm${h.hr?' · moyenne '+r0(h.hr):''}`:'';
 $('#acts').innerHTML=actsHTML(d,T)||`<p class="mute empty">Aucune activité ce jour. <a href="#effort">Noter une séance</a></p>`;
 const mo=monitor(d),bad=mo.filter(x=>x.warn);
 $('#monmini').innerHTML=mo.length?`<div class="mm" data-go="recuperation"><div><div class="eyebrow">Moniteur de santé</div><b style="font-size:17px">${bad.length?`${bad.length} ${bad.length>1?'signaux':'signal'} inhabituel${bad.length>1?'s':''} : ${bad.map(x=>x.l).join(', ')}`:'Tous tes signes vitaux sont dans ta normale'}</b></div><div class="dots" style="margin-left:auto">${mo.map(x=>`<i style="--c:${x.col}" data-tip="${esc(x.l+' : '+monFmt(x,x.v)+'\n'+x.lab)}"></i>`).join('')}</div></div>`:'<div class="eyebrow">Moniteur de santé</div><p class="mute small" style="margin:4px 0 0">Il faut au moins 7 nuits importées pour établir ta normale.</p>';
 renderCheckin()}
function coach(d,rc,sl,ef,tg){const h=H(d),out=[];
 if(rc&&!rc.partial){const [l]=recLab(rc.s);out.push(`<b>Récupération ${l.toLowerCase()} (${rc.s} %).</b> `+(rc.s>=67?'Ton système nerveux est reposé : bon jour pour une séance exigeante ou un record.':rc.s>=34?'Entraîne-toi normalement, sans viser l\'intensité maximale.':'Ton corps récupère encore : privilégie marche, mobilité ou repos.'));
  const low=rc.c.filter(x=>x[1]<45).map(x=>x[0]);if(low.length)out.push(`Ce qui tire vers le bas : ${low.join(', ')}.`)}
 if(tg)out.push(`Effort conseillé : <b>${tg[0]} à ${tg[1]}</b>${ef!=null?` (actuel : ${ef})`:''}.`);
 if(d===today()||d===hLast()){const nd=needOf(addD(d,1)),wa=wakeAvg(d);if(wa!=null)out.push(`Ce soir, vise <b>${fmtSl(nd.need)}</b> de sommeil : couche-toi vers <b>${hhmm(wa-nd.need-15)}</b> pour te lever à ${hhmm(wa)}.`)}
 if(has(h.tp)){const tb=base('tp',d);if(tb!=null&&h.tp-tb>=0.5)out.push('<b>Température au poignet inhabituelle</b> : surveille un éventuel début de maladie.')}
 if(num(h.stz)>=30)out.push('Journée stressante d\'après ta FC : quelques minutes de respiration lente aident à redescendre.');
 return out.join(' ')||''+IMP('Importe tes données Apple Santé et remplis ton check-in','Connecte Apple Santé et remplis ton check-in')+' : le coach interprétera ici ta récupération, ton effort et ton besoin de sommeil.'}
function actsHTML(d,T){T=T||dayTrain(d);const L=[];
 for(const s of T.mu){const w=T.att.filter(isStr)[0];L.push(`<div class="act" style="--c:var(--trn)"><div class="ic"><svg viewBox="0 0 24 24">${IC.lift}</svg></div><div><div class="t">${esc(s.name)}</div><div class="m">${(s.ex||[]).length} exercices · ${fx((s.ex||[]).reduce((a,x)=>a+x.sets.reduce((b,y)=>b+num(y.w)*num(y.r),0),0)/1000)} t${s.dur?' · '+esc(s.dur)+' min':''}${w&&w.hr?' · '+w.hr+' bpm moy.':''}${w&&w.kcal?' · '+w.kcal+' kcal':''}</div>${w?zbar(w.z)+zleg(w.z):''}</div><div class="e">${w&&w.tr?r0(100*(1-Math.exp(-w.tr/110))):''}<small>${w&&w.tr?'effort':''}</small></div></div>`)}
 for(const s of T.sp){const w=T.att.find(x=>(WT[x.ty]||'')===s.type);L.push(`<div class="act" style="--c:var(--eff)"><div class="ic"><svg viewBox="0 0 24 24">${IC.run}</svg></div><div><div class="t">${esc(s.type)}</div><div class="m">${esc(s.min)} min${s.km?' · '+fx(s.km)+' km':''}${s.rpe?' · ressenti '+esc(s.rpe)+'/10':''}${w&&w.hr?' · '+w.hr+' bpm moy.':''}</div>${w?zbar(w.z)+zleg(w.z):''}</div><div class="e">${w&&w.tr?r0(100*(1-Math.exp(-w.tr/110))):''}<small>${w&&w.tr?'effort':''}</small></div></div>`)}
 for(const w of T.ap)L.push(`<div class="act" style="--c:${isStr(w)?'var(--trn)':'var(--eff)'}"><div class="ic"><svg viewBox="0 0 24 24">${isStr(w)?IC.lift:IC.run}</svg></div><div><div class="t">${esc(WT[w.ty]||w.ty)} <span class="mute small">· montre${has(w.st)?' · '+hm(w.st):''}</span></div><div class="m">${esc(w.min)} min${w.km?' · '+fx(w.km)+' km':''}${w.kcal?' · '+esc(w.kcal)+' kcal':''}${w.hr?' · '+esc(w.hr)+' bpm moy.':''}${w.mx?' · max '+esc(w.mx):''}</div>${zbar(w.z)}${zleg(w.z)}</div><div class="e">${w.tr?r0(100*(1-Math.exp(-w.tr/110))):''}<small>${w.tr?'effort':''}</small></div></div>`);
 return L.join('')}
function renderCheckin(){const d=S.day,j=J(d);
 $('#checkin').innerHTML=`<div class="ph"><h2>Comment tu te sens ?</h2><span class="mute small">${j.mood||j.energy||j.stress||j.sore?'Enregistré':'20 secondes'}</span></div>
 <div class="ci">${SCALES.map(([k,l,lo,hi])=>`<div class="sc"><span>${l}</span><div class="seg">${[1,2,3,4,5].map(v=>`<button data-act="jset" data-k="${k}" data-v="${v}" class="${j[k]===v?'on':''}" aria-label="${l} ${v} sur 5">${v}</button>`).join('')}</div><small><span>${lo}</span><span>${hi}</span></small></div>`).join('')}</div>
 <h3>Étiquettes</h3><div class="chips">${S.set.tags.map(t=>`<button class="chip ${(j.tags||[]).includes(t)?'on':''}" data-act="jtag" data-t="${esc(t)}">${esc(t)}</button>`).join('')}</div>
 <h3>Note</h3><textarea id="jnote" rows="2" placeholder="Douleur, ressenti, événement…">${esc(j.note||'')}</textarea>`}
function setJ(p){const d=S.day,o=getDay(d);o.j={...(o.j||{}),...p};put.day(d)}

/* ---------- sommeil ---------- */
function compHTML(c,col){return c.map(([n,v,,t])=>`<div class="cr"><span>${n}</span><div class="bar" style="--c:${col}"><i style="width:${v}%"></i></div><span class="num">${Math.round(v)}</span><small>${esc(t)}</small></div>`).join('')}
function renderSleep(){const d=S.day,h=H(d),sl=sleepScore(d),x=X(d),T=num(S.set.sleep);
 $('#gsl').innerHTML=gauge(sl&&sl.s,'var(--slp)','Score de sommeil',h.sl?`nuit du ${dShort(addD(d,-1))} au ${dShort(d)}`:'pas de nuit enregistrée',null,'',true);
 $('#slc').innerHTML=sl?compHTML(sl.c,'var(--slp)'):'<p class="mute small">Les composantes apparaissent avec une nuit importée.</p>';
 const win=has(h.sw)&&has(h.sb)?((h.sw-h.sb+1440)%1440):null;
 const stt=(v,l)=>v?`<div class="stat"><b>${v}</b><span>${l}</span></div>`:'';
 $('#sls').innerHTML=h.sl?[stt(has(h.sb)?`${hhmm(h.sb)} → ${hhmm(h.sw)}`:'','endormissement → réveil'),stt(fmtSl(h.sl),'temps endormi'),stt(win?fmtSl(win):'','temps au lit'),stt(h.sd?fmtSl(h.sd):'','profond'),stt(h.sr?fmtSl(h.sr):'','paradoxal (REM)'),stt(h.sc?fmtSl(h.sc):'','léger'),stt(has(h.wu)?String(h.wu):'','réveils'),stt(nhrv(d)?`${r0(nhrv(d))} <small>ms</small>`:'',`VFC retenue (${hvLab()})`),stt(h.nhr?`${r0(h.nhr)} <small>bpm</small>`:'','FC moyenne nocturne'),stt(h.nmin?`${h.nmin} <small>bpm</small>`:'','FC la plus basse'),stt(has(h.lat)?`${h.lat} <small>min</small>`:'','pour t\'endormir'),stt(has(h.dip)?`${h.dip} <small>%</small>`:'','baisse de FC la nuit'),stt(h.nrq&&useRm()?`${h.nrq} <small>%</small>`:'','battements valides (VFC)'),stt(h.rr?`${fx(h.rr)} <small>/min</small>`:'','respiration'),stt(h.o2?`${fx(h.o2)} <small>%</small>`:'','saturation O2')].join(''):'';
 const cur2=hvm(),hvRows=[['SDNN Apple, moyenne du jour'+(cur2==='apple'?' · utilisée':''),h.hrv,`moyenne des ${h.hvn?h.hvn+' ':''}mesures du ${dShort(d)} (minuit à minuit) : la valeur journalière de l'app Santé`],['SDNN Apple pendant le sommeil'+(cur2==='sdnn'?' · utilisée':''),h.nhv,`moyenne des ${h.nhn?h.nhn+' ':''}mesures de la montre entre endormissement et réveil`],['RMSSD pendant le sommeil'+(cur2==='rmssd'?' · utilisée':''),h.nrm,'recalculé battement par battement : une autre mesure de la VFC, plus sensible à la récupération'],['SDNN recalculé (contrôle)',h.nsc,'doit être proche du SDNN Apple de la nuit si les battements sont bien lus']].filter(x=>x[1]);
 const xd=X(d)||{},hl=xd.hl||[],hsn=xd.hs||[],inSl=m=>{if(!has(h.sb)||!has(h.sw))return false;const r=m+720;return r>=Math.max(720,h.sb)&&r<=h.sw};
 const lastTxt=S.health.last?`Ton export s'arrête le ${dShort(S.health.last.slice(0,10))} à ${S.health.last.slice(11,16)}. `:'';
 const srcRows=(h.hvsrc||[]).map(([n,v,c])=>`<tr><td><b>Source : ${esc(n)}</b><br><span class="mute small">${c} mesure${c>1?'s':''} ce jour-là</span></td><td class="num"><b>${v} ms</b></td></tr>`).join('');
 const list=hl.length?`<details class="hvl"><summary>Voir les ${hl.length} mesures du ${dShort(d)} une par une</summary><p class="mute small">Compare avec l'app Santé : Parcourir → Cœur → Variabilité du rythme cardiaque → Afficher toutes les données. Chaque ligne doit s'y retrouver avec la même heure et la même valeur.</p><table><tbody>${hl.map(([m,v,i])=>`<tr${inSl(m)?' class="insl"':''}><td class="num">${hhmm(m-720)}</td><td>${inSl(m)?'<span class="mute small">pendant le sommeil</span>':''}${hsn.length>1?` <span class="mute small">${esc(hsn[i]||'')}</span>`:''}</td><td class="num"><b>${r0(v)} ms</b></td></tr>`).join('')}</tbody></table><p class="mute small">Moyenne de ces ${hl.length} mesures : <b>${r0(avg(hl.map(x=>x[1])))} ms</b>.</p></details>`:(h.hrv?'<p class="mute small">'+IMP('Réimporte ton export','Synchronise Apple Santé')+' pour voir chaque mesure de VFC une par une, avec son heure et sa source.</p>':'');
 $('#hvcmp').innerHTML=hvRows.length?`<h3>Toutes les mesures de VFC · nuit du ${dShort(addD(d,-1))} au ${dShort(d)}</h3><p class="mute small">${lastTxt}Si l'app Santé affiche une autre valeur, vérifie d'abord que tu regardes la même date${S.health.last&&S.health.last.slice(0,10)<today()?IMP(' : la nuit dernière n\'est pas dans ton export, réimporte-le',' : la nuit dernière n\'est pas encore synchronisée'):''}.</p><table><tbody>${hvRows.map(([l,v,t])=>`<tr><td><b>${l}</b><br><span class="mute small">${t}</span></td><td class="num"><b>${r0(v)} ms</b></td></tr>`).join('')}${srcRows}</tbody></table>${list}<p class="mute small">RMSSD et SDNN mesurent deux choses différentes et ne se comparent pas entre eux. Choisis celle qui sert à tes scores dans Plus → Réglages.</p>`:'';
 const nd=needOf(addD(d,1)),wa=wakeAvg(d);
 $('#slcoach').innerHTML=(sl?`${sl.s>=80?'<b>Excellente nuit.</b> ':sl.s>=60?'<b>Nuit correcte.</b> ':'<b>Nuit insuffisante.</b> '}`+(sl.c.filter(c=>c[1]<50).map(c=>c[0]==='Durée'?`Il t'a manqué ${fmtSl(Math.max(0,sl.nd.need-h.sl))} par rapport à ton besoin.`:c[0]==='Régularité'?'Ton heure de coucher s\'écarte de ton habitude : la régularité améliore la qualité du sommeil.':c[0]==='Récupératrice'?'Peu de sommeil profond et paradoxal : alcool, repas tardif ou écrans peuvent jouer.':c[0]==='Continuité'?'Nuit fragmentée par plusieurs réveils.':'').join(' '))+(has(h.dip)&&h.dip<10?` Ta FC n'a baissé que de ${h.dip} % pendant la nuit (normal : 10 à 20 %) : repas tardif, alcool, stress ou séance du soir peuvent l'expliquer.`:'')+(has(h.lat)&&h.lat>30?` Il t'a fallu ${h.lat} min pour t'endormir : au-delà de 30 min de façon répétée, avance la lumière du matin et réduis les écrans le soir.`:''):'')+
  (wa!=null?` Besoin pour la prochaine nuit : <b>${fmtSl(nd.need)}</b> (base ${fmtSl(nd.T)}${nd.debt?` + ${nd.debt} min de dette`:''}${nd.eff?` + ${nd.eff} min liés à l'effort`:''}). Pour te lever à ${hhmm(wa)}, endors-toi vers <b>${hhmm(wa-nd.need)}</b>.`:'');
 $('#hypsub').textContent=x&&x.hy?`${x.hy.length} phases · ${x.nv?x.nv.length:0} mesures de VFC pendant la nuit`:'';
 setFig('#fhyp',{type:'hyp',segs:x&&x.hy,nh:x&&x.nh,nh0:x&&x.nh0,nv:x&&x.nv,empty:h.sl?'Le détail minute par minute est gardé pour les 35 dernières nuits importées. '+IMP('Réimporte ton export','Synchronise Apple Santé')+' pour l\'obtenir.':'Pas de nuit enregistrée pour ce jour'});
 const L=hLast()||today(),N=[];for(let i=13;i>=0;i--){const k=addD(L,-i);N.push({k,h:H(k)})}
 const mx=Math.max(T*1.2,...N.map(x=>num(x.h.sl))),seg=(v,c)=>v>0?`<i style="width:${v/mx*100}%;background:${c}"></i>`:'';
 $('#s14').innerHTML=N.map(({k,h})=>{const und=Math.max(0,num(h.sl)-num(h.sd)-num(h.sc)-num(h.sr)),ss=sleepScore(k);const tip=h.sl?[dLong(k),`Endormi ${fmtSl(h.sl)}${has(h.sb)?` (${hhmm(h.sb)} → ${hhmm(h.sw)})`:''}`,h.sd?`Profond ${fmtSl(h.sd)} · paradoxal ${fmtSl(h.sr||0)} · léger ${fmtSl(h.sc||0)}`:'',has(h.wu)?`${h.wu} réveil${h.wu>1?'s':''}`:'',nhrv(k)?`VFC ${hvLab()} ${r0(nhrv(k))} ms`:'',h.nmin?`FC min. ${h.nmin} bpm`:'',ss?`Score ${ss.s} / 100`:''].filter(Boolean).join('\n'):dLong(k)+' : pas de nuit enregistrée';return `<div class="hrow" data-tip="${esc(tip)}"><span>${dWk(k)}</span><div class="stk">${seg(num(h.sd),'var(--deep)')}${seg(num(h.sc),'var(--core)')}${seg(num(h.sr),'var(--rem)')}${seg(und,'color-mix(in srgb,var(--slp) 30%,var(--field))')}<b class="tg" style="left:${T/mx*100}%"></b></div><span class="num">${h.sl?fmtSl(h.sl):'–'}${ss?` · <b style="color:var(--slp)">${ss.s}</b>`:''}</span></div>`}).join('');
 const sl14=N.filter(x=>x.h.sl),bt=sl14.filter(x=>has(x.h.sb)).map(x=>x.h.sb),wt=sl14.filter(x=>has(x.h.sw)).map(x=>x.h.sw),debt=sl14.slice(-7).reduce((a,x)=>a+Math.max(0,T-x.h.sl),0);
 $('#sk').innerHTML=sl14.length?[`<div><b>${fmtSl(avg(sl14.map(x=>x.h.sl)))}</b><span>moyenne 14 nuits</span></div>`,`<div><b class="${debt>120?'dn':''}">${fmtSl(debt)}</b><span>dette sur 7 nuits</span></div>`,bt.length?`<div><b>${hhmm(avg(bt))} → ${hhmm(avg(wt))}</b><span>horaires moyens</span></div>`:'',bt.length>3?`<div><b>± ${r0(sdv(bt))} min</b><span>régularité du coucher</span></div>`:''].join(''):'';
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
 const cb=calib(d);$('#grc').innerHTML=gauge(rc&&rc.s,rc?recLab(rc.s)[1]:'var(--rec)','Récupération',rc?recLab(rc.s)[0]:cb<7&&hKeys().length?`calibrage : ${cb} / 7 nuits`:'en attente de données',null,'%',true);
 $('#rcc').innerHTML=rc?compHTML(rc.c,'var(--rec)'):'<p class="mute small">Il faut au moins ta VFC ou ta FC nocturne de ce jour.</p>';
 $('#rccoach').innerHTML=rc?`${coach(d,rc,null,null,effTarget(rc.s)).split('Ce soir')[0]} La récupération compare ta VFC et ta FC de la nuit à ta propre normale des 30 derniers jours : c'est ton évolution qui compte, pas la valeur brute.`:'La récupération s\'appuie surtout sur la VFC mesurée pendant ton sommeil : '+IMP('importe ton export Apple Santé pour l\'activer.','connecte Apple Santé pour l\'activer.')+'';
 const mo=monitor(d),bad=mo.filter(x=>x.warn);$('#mons').textContent=mo.length?(bad.length?`${bad.length} ${bad.length>1?'signaux':'signal'} à surveiller`:'tout est dans ta normale'):'';
 $('#mon').innerHTML=mo.length?mo.map(x=>{const lo=x.m-3*x.sd,hi=x.m+3*x.sd,P=v=>clamp((v-lo)/(hi-lo)*100,2,98);return `<div class="mr" data-tip="${esc(`${x.l}\nCette nuit : ${monFmt(x,x.v)}\nTa normale : ${x.k==='tp'?'± '+f2(1.5*x.sd)+' °C':monFmt(x,x.m-1.5*x.sd)+' à '+monFmt(x,x.m+1.5*x.sd)}\nÉcart : ${sg(Math.round(x.z*10)/10)} écart-type`)}"><div class="n">${x.l}<small>normale ${x.k==='tp'?'± '+f2(1.5*x.sd)+' °C':monFmt(x,x.m)}</small></div><div class="rng"><i class="nb" style="left:${P(x.m-1.5*x.sd)}%;right:${100-P(x.m+1.5*x.sd)}%"></i><i class="pt" style="left:${P(x.v)}%;--c:${x.col}"></i></div><div class="v">${monFmt(x,x.v)}<small><span class="st" style="--c:${x.col}">${x.lab}</span></small></div></div>`}).join(''):'<p class="mute small">Il faut au moins 7 nuits importées avant ce jour pour établir ta normale.</p>';
 const L=hLast()||today(),from=addD(L,-182),vb=nhrvBase(L),pts=[];for(let k=from;k<=L;k=addD(k,1)){if(!nhrv(k))continue;const v=[];for(let i=0;i<7;i++){const y=nhrv(addD(k,-i));if(y)v.push(y)}pts.push({x:k,y:Math.round(avg(v))})}
 const raw=[];for(let k=from;k<=L;k=addD(k,1))if(nhrv(k))raw.push({x:k,y:nhrv(k)});
 setFig('#fhv',{unit:'ms',series:[{name:'VFC de la nuit',avg:true,last:true,pts:raw,col:'var(--mind)',dots:true,r:3,w:1.5,op:.9}],empty:IMP('Réimporte ton export','Synchronise Apple Santé')+' : la VFC nocturne est calculée à partir des mesures prises pendant ton sommeil'});
 const v7=avg(raw.slice(-7).map(p=>p.y));$('#vk2').innerHTML=(hvm()==='rmssd'&&!S.health.rm&&hKeys().length?'<p class="notice" style="width:100%">Ta VFC est encore en SDNN (valeur d\'Apple). '+IMP('Réimporte ton export pour la calculer en RMSSD battement par battement, comme Bevel.','Le RMSSD battement par battement n\'est disponible qu\'avec un fichier d\'export Apple Santé (Plus → Apple Santé).')+'</p>':'')+(v7?`<div><b>${r0(v7)} ms</b><span>${hvLab()}, moyenne des 7 dernières nuits</span></div>`+(vb?`<div><b>${r0(vb.m)} ms</b><span>ta normale (30 j)</span></div><div><b class="${v7>=vb.m?'gd':'dn'}">${sg(Math.round((v7/vb.m-1)*100))} %</b><span>écart à ta normale</span></div>`:''):'');
 const f90=addD(L,-89);setFig('#fnh',{unit:'bpm',series:[{name:'FC min. nocturne',avg:true,pts:dailyPts(d=>num(H(d).nmin)||null,f90,L),col:'var(--trn)',w:1.8,last:true},{name:'FC au repos',avg:true,pts:dailyPts(d=>num(H(d).rhr)||null,f90,L),col:'var(--hrt)',w:1.8,last:true}],empty:'Pas encore de FC nocturne'});
 const nm=winAvg('nmin',L,7),nb=base('nmin',addD(L,-7));$('#nhk').innerHTML=nm?`<div><b>${r0(nm)} bpm</b><span>FC min. nocturne, 7 j${nb?` · <span class="${nm<=nb?'gd':'dn'}">${sg(Math.round(nm-nb))}</span>`:''}</span></div>`:'';
 const x=X(d),sv=num(h.stz);$('#stk').innerHTML=has(h.stz)?`<div><b style="color:var(--str)">${sv}</b><span>stress du ${dShort(d)} : ${stressLab(sv).toLowerCase()}</span></div><div><b>${r0(winAvg('stz',d,7)||0)}</b><span>moyenne 7 j</span></div>`:'<p class="mute small">'+(hKeys().length?'Pas encore de stress estimé pour ce jour : il se calcule au fil de la journée, à partir de ta fréquence cardiaque.':IMP('Le stress estimé apparaît après un import Apple Santé.','Le stress estimé apparaît après la synchro Apple Santé.'))+'</p>';
 $('#sth').innerHTML=x&&x.sh?`<div style="display:grid;grid-template-columns:repeat(24,minmax(0,1fr));gap:2px;align-items:end;height:80px">${x.sh.map((v,i)=>`<i data-tip="${esc(`${i}h – ${i+1}h : stress ${v} / 100`)}" style="display:block;height:${Math.max(4,v)}%;border-radius:3px;background:${v>=50?'var(--str)':v>0?'color-mix(in srgb,var(--str) 45%,var(--field))':'var(--field)'}"></i>`).join('')}</div><div style="display:flex;justify-content:space-between" class="mute small"><span>0h</span><span>6h</span><span>12h</span><span>18h</span><span>24h</span></div>`:'';
 const vk=(key,lab,f,dev)=>{const v=vals(key,L,7,0);if(!v.length)return'';const a=avg(v),b=base(key,addD(L,-7),30);return `<div><b>${dev&&b!=null?sg(Math.round((a-b)*100)/100)+' °C':f(a)}</b><span>${lab}${dev?' vs normale':''}, 7 j</span></div>`};
 $('#vtk').innerHTML=[vk('o2','SpO2',v=>fx(v)+' %'),vk('rr','respirations / min',fx),vk('tp','température poignet',fx,true),vk('hr','FC moyenne',v=>r0(v)+' bpm'),vk('whr','FC en marchant',v=>r0(v)+' bpm'),vk('hrr','récupération à 1 min',v=>r0(v)+' bpm')].join('')||'<p class="mute small">'+IMP('Réimporte ton export Apple Santé','Synchronise Apple Santé')+' pour ajouter ces mesures.</p>';
 const m=$('#vtm').value,f9=addD(L,-89);let p2;if(m==='tp'){const tb=avg(hKeys().map(k=>H(k).tp).filter(has).map(num));p2=dailyPts(d=>has(H(d).tp)?num(H(d).tp)-(tb||0):null,f9,L)}else p2=dailyPts(d=>num(H(d)[m])||null,f9,L);
 setFig('#fvt',{series:[{name:$('#vtm').selectedOptions[0].textContent,avg:true,last:true,pts:p2,col:m==='stz'?'var(--str)':'var(--hrt)',dots:true,r:2.5,w:1.5,op:.8}],hline:m==='tp'?0:null,fmt:m==='tp'?v=>sg(Math.round(v*100)/100):m==='o2'?v=>fx(v)+' %':null,empty:'Pas de données pour cette mesure'})}

/* ---------- effort ---------- */
function renderEffort(){const d=S.day,h=H(d),rc=recovery(d),ef=effortOf(d),tg=effTarget(rc&&rc.s),T=dayTrain(d);
 $('#gef').innerHTML=gauge(ef,'var(--eff)','Effort du jour',tg?`conseillé ${tg[0]}–${tg[1]} selon ta récupération`:'',null,'',true);
 const Z=[0,0,0,0,0];for(const w of h.wk||[])(w.z||[]).forEach((m,i)=>Z[i]+=m);const zt=Z.reduce((a,b)=>a+b,0);
 $('#dz').innerHTML=zt?zbar(Z)+`<div class="comp" style="margin-top:10px">${Z.map((m,i)=>`<div class="cr"><span>${ZN[i]}</span><div class="bar" style="--c:${ZC[i]}"><i style="width:${m/zt*100}%"></i></div><span class="num">${m}′</span></div>`).join('')}</div>`:'<p class="mute small">Pas d\'entraînement enregistré par la montre ce jour.</p>';
 const ac=acwr(d),hmx=num(S.health.hrmax);
 $('#efs').innerHTML=[`<div class="stat"><b>${r0(loadOf(d))}</b><span>charge cardiaque (TRIMP)</span></div>`,T.min?`<div class="stat"><b>${r0(T.min)} <small>min</small></b><span>d'entraînement</span></div>`:'',h.ac?`<div class="stat"><b>${r0(h.ac)} <small>kcal</small></b><span>actives</span></div>`:'',ac.r!=null?`<div class="stat"><b class="${ac.r>1.5?'dn':''}">${f2(ac.r)}</b><span>ratio de charge 7/28 j</span></div>`:'',hmx?`<div class="stat"><b>${hmx} <small>bpm</small></b><span>FC max. (déduite)</span></div>`:''].join('');
 $('#efcoach').innerHTML=(ef==null?'Aucun effort mesuré ce jour.':ef<tg?.[0]?`Effort de ${ef}, sous la zone conseillée : tu as de la marge pour une activité.`:tg&&ef>tg[1]?`Effort de ${ef}, au-dessus de ce que ta récupération conseillait : prévois du sommeil en plus ce soir.`:`Effort de ${ef}${tg?', dans la zone conseillée':''}.`)+(actsHTML(d,T)?'':'')+` L'effort est calculé à partir de ta FC minute par minute (méthode TRIMP), sur une échelle de 0 à 100 qui sature : passer de 80 à 90 demande beaucoup plus que de 20 à 30.`;
 const e=today(),fr=addD(e,-29),E=[],R=[];for(let k=fr;k<=e;k=addD(k,1)){const a=effortOf(k);if(a!=null)E.push({x:k,y:a});const r=recovery(k);if(r)R.push({x:k,y:r.s})}
 setFig('#fer',{series:[{name:'Effort',avg:true,pts:E,col:'var(--eff)',bars:true,op:.75},{name:'Récupération',avg:true,df:v=>r0(v)+' pts',tf:v=>r0(v)+' %',pts:R,col:'var(--rec)',last:true}],ymin:0,ymax:100,empty:'Pas encore de données'});
  const Zs=zones28(),zt2=Zs.reduce((a,b)=>a+b,0);if(zt2){const pc=Zs.map(m=>m/zt2*100),low=pc[0]+pc[1],mid=pc[2],hi=pc[3]+pc[4];
  $('#z28').innerHTML=zbar(Zs)+`<div class="comp" style="margin-top:12px">${Zs.map((m,i)=>`<div class="cr"><span>${ZN[i]}</span><div class="bar" style="--c:${ZC[i]}"><i style="width:${pc[i]}%"></i></div><span class="num">${r0(pc[i])} %</span><small>${r0(m)} min sur 28 jours</small></div>`).join('')}</div><div class="coach">${low>=70&&hi>=10?'<b>Répartition polarisée</b> : beaucoup de basse intensité et un peu de haute intensité, la combinaison la plus efficace pour l\'endurance et la VO2 max.':mid>=35?'<b>Beaucoup de temps en zone 3</b> (tempo) : fatigant sans être le plus efficace. Ralentis tes sorties faciles (zone 2) et rends tes séances dures vraiment dures.':hi<5?'<b>Presque pas de haute intensité</b> : ajoute une séance de fractionné par semaine pour faire progresser ta VO2 max.':low<60?'<b>Peu de basse intensité</b> : ajoute du volume facile en zone 2 (tu peux parler en faisant l\'effort) pour construire ta base aérobie.':'Répartition équilibrée de tes intensités.'} Zones calculées avec ta FC max. de ${S.health.hrmax||'–'} bpm.</div>`}else $('#z28').innerHTML='<p class="mute small">Pas d\'entraînement avec FC enregistré par la montre sur 28 jours.</p>';
 renderLoad();renderMG();renderHeat();renderForce();renderRecs();renderHist()}
function lastFor(name,excl){const k=norm(name);if(!k)return null;for(const s of done()){if(s.id===excl||s.kind==='sport')continue;const e=(s.ex||[]).find(e=>norm(e.n)===k&&e.sets.some(x=>num(x.r)>0));if(e)return{s,e}}return null}
function suggest(name,excl){const L=lastFor(name,excl);if(!L)return null;const sets=L.e.sets.filter(x=>num(x.r)>0);const top=Math.max(...sets.map(x=>num(x.w)));const up=top>0&&sets.filter(x=>num(x.w)===top).every(x=>num(x.r)>=S.set.rmax);return{L,sets,top,up,w:up?top+num(S.set.inc):top}}
function bestE1(name,excl){const k=norm(name);let b=0;for(const s of done()){if(s.id===excl)continue;for(const e of s.ex||[])if(norm(e.n)===k)for(const x of e.sets)b=Math.max(b,e1(num(x.w),num(x.r)))}return b}
function prefill(n,excl){const g=suggest(n,excl);if(!g)return[{w:'',r:''}];return g.sets.map(x=>{const atTop=num(x.w)===g.top;return{w:atTop?g.w:num(x.w),r:'',p:atTop&&g.up?S.set.rmin:num(x.r)}})}
function renderStart(){const seen=new Set(),tpl=[];
 for(const s of done()){if(s.kind==='sport')continue;const k=norm(s.name);if(k&&!seen.has(k)){seen.add(k);tpl.push(s)}if(tpl.length>=8)break}
 const seg=`<div class="seg"><button data-act="smode" data-m="mu" class="${startMode==='mu'?'on':''}">Muscu</button><button data-act="smode" data-m="sp" class="${startMode==='sp'?'on':''}">Autre sport</button></div>`;
 $('#editor').innerHTML=`<div class="panel"><h2>Noter une séance</h2>${seg}`+(startMode==='mu'?`
 <div class="grid2"><label>Nom de la séance<input id="nn" placeholder="Push, Pull, Jambes…" autocomplete="off"></label><label>Date<input id="nd" type="date" value="${today()}"></label></div>
 <button class="btn pri" data-act="start">Commencer une séance</button>
 ${tpl.length?`<h3>Ou reprendre une séance récente</h3><div class="chips">${tpl.map(s=>`<button class="chip" data-act="tpl" data-id="${esc(s.id)}"><b>${esc(s.name)}</b><span>${dShort(s.date)} · ${(s.ex||[]).length} exos</span></button>`).join('')}</div><p class="mute small">Charges pré-remplies avec la progression suggérée.</p>`:''}`
 :`<form id="spf"><div class="grid3"><label>Sport<select id="spt">${SPORTS.map(x=>`<option>${x}</option>`).join('')}</select></label><label>Date<input id="spd" type="date" value="${today()}"></label><label>Durée (min)<input id="spm" inputmode="numeric" required></label>
 <label>Intensité ressentie (1 à 10)<select id="spr"><option value="">Non notée</option>${[1,2,3,4,5,6,7,8,9,10].map(i=>`<option value="${i}">${i}${i<=3?' · facile':i<=6?' · modéré':i<=8?' · dur':' · maximal'}</option>`).join('')}</select></label><label>Distance (km, option)<input id="spk" inputmode="decimal"></label><label>Note<input id="spn" placeholder="ex. fractionné 8×400 m"></label></div>
 <button class="btn pri">Enregistrer</button></form>`)+`</div>`;
 const f=$('#spf');if(f)f.addEventListener('submit',ev=>{ev.preventDefault();const m=num($('#spm').value);if(!(m>0))return $('#spm').focus();
  const o={id:nid(),kind:'sport',type:$('#spt').value,date:$('#spd').value||today(),min:Math.round(m),rpe:num($('#spr').value)||'',km:num($('#spk').value)||'',note:$('#spn').value.trim(),t:Date.now()};
  upsert(o);put.sess(o);renderStart();renderEffort();toast(o.type+' enregistré')})}
function exHTML(e,i){return `<article class="ex" data-i="${i}"><div class="exh"><input class="exn" data-f="n" value="${esc(e.n)}" list="exlist" placeholder="Nom de l'exercice" aria-label="Exercice ${i+1}"><button class="x" data-act="delEx" aria-label="Supprimer l'exercice">×</button></div>
 <p class="hint" id="h${i}"></p>
 <div class="sets"><div class="set hd"><span></span><div>Charge (kg)</div><div>Reps</div><span></span></div>${e.sets.map((s,j)=>`<div class="set"><span>${j+1}</span><input data-f="w" data-s="${j}" inputmode="decimal" value="${esc(s.w)}" placeholder="kg" aria-label="Charge série ${j+1}"><input data-f="r" data-s="${j}" inputmode="numeric" value="${esc(s.r)}" placeholder="${esc(s.p||'reps')}" aria-label="Reps série ${j+1}"><button class="x" data-act="delSet" data-s="${j}" aria-label="Supprimer la série">×</button></div>`).join('')}</div>
 <div class="row"><button class="btn small" data-act="addSet">+ Série</button><button class="btn small ghost" data-act="tstart">Minuteur de repos</button></div></article>`}
function renderEditor(){const c=S.cur;if(!c)return renderStart();
 $('#editor').innerHTML=`<div class="panel"><div class="edh"><input id="cn" class="tin" value="${esc(c.name)}" aria-label="Nom de la séance"><input id="cd" type="date" value="${esc(c.date)}" aria-label="Date"><select id="crpe" aria-label="Ressenti"><option value="">Ressenti /10</option>${[1,2,3,4,5,6,7,8,9,10].map(i=>`<option value="${i}"${num(c.rpe)===i?' selected':''}>Ressenti ${i}/10</option>`).join('')}</select></div>
 <p class="mute small" id="svst">Enregistrement automatique</p><div>${c.ex.map(exHTML).join('')}</div>
 <button class="btn wide" data-act="addEx">+ Ajouter un exercice</button>
 <div class="foot"><button class="btn pri" data-act="finish">Terminer la séance</button><button class="btn ghost" data-act="discard">Abandonner</button></div></div>`;
 c.ex.forEach((e,i)=>updateHint(i))}
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
 upsert(o);put.sess(o);S.cur=null;stopTimer();renderEditor();renderSoft();
 const prs=ex.filter(e=>{const b=bestE1(e.n,o.id);return b&&Math.max(...e.sets.map(x=>e1(x.w,x.r)))>b}).map(e=>e.n);
 toast('Séance enregistrée'+(dur?` (${dur} min)`:'')+(prs.length?` · record sur ${prs.join(', ')}`:''))}
function discard(){const c=S.cur;clearTimeout(sv);S.cur=null;stopTimer();S.sessions=S.sessions.filter(s=>s.id!==c.id);put.delSess(c.id);renderEditor();renderSoft();
 toast('Séance abandonnée',()=>{if(S.cur)return toast("Termine d'abord la séance en cours");S.cur=c;saveCur();renderEditor()})}
function editSess(id){if(S.cur)return toast("Termine d'abord la séance en cours");const s=S.sessions.find(s=>s.id===id);if(!s||s.kind==='sport')return;
 S.cur=clone(s);S.cur.open=true;S.cur.ex.forEach(e=>{if(!e.sets.length)e.sets.push({w:'',r:''})});saveCur();renderEditor();$('#editor').scrollIntoView({behavior:'smooth'})}
function delSess(id){const s=S.sessions.find(s=>s.id===id);if(!s)return;S.sessions=S.sessions.filter(x=>x.id!==id);put.delSess(id);renderSoft();toast('Supprimé',()=>{upsert(s);put.sess(s);renderSoft()})}
let tEnd=0,tInt=0,actx=null;
function beep(){try{if(!actx)return;const o=actx.createOscillator(),g=actx.createGain();o.frequency.value=880;g.gain.value=.15;o.connect(g);g.connect(actx.destination);o.start();o.stop(actx.currentTime+.35)}catch(e){}}
function unlockAudio(){try{if(!actx){const A=window.AudioContext||window.webkitAudioContext;if(A)actx=new A()}if(actx&&actx.state==='suspended')actx.resume()}catch(e){}}
function startTimer(sec){unlockAudio();document.body.classList.add('timing');tEnd=Date.now()+(sec||num(S.set.rest)||120)*1000;$('#timer').hidden=false;$('#timer').classList.remove('end');$('#tlab').textContent='Repos';clearInterval(tInt);tInt=setInterval(tick,250);tick()}
function tick(){const r=Math.round((tEnd-Date.now())/1000),el=$('#tval');if(r<=0){el.textContent='0:00';if(!$('#timer').classList.contains('end')){$('#timer').classList.add('end');$('#tlab').textContent='Série suivante';beep();setTimeout(beep,450);try{navigator.vibrate&&navigator.vibrate([200,100,200])}catch(e){}}if(r<-20)stopTimer();return}el.textContent=Math.floor(r/60)+':'+String(r%60).padStart(2,'0')}
function stopTimer(){clearInterval(tInt);$('#timer').hidden=true;document.body.classList.remove('timing')}
function renderMG(){const from=addD(today(),-6),cnt={};MG.forEach(([n])=>cnt[n]=0);let other=0;
 for(const s of done())if(s.kind!=='sport'&&s.date>=from)for(const e of s.ex||[]){const p=plain(e.n),k=e.sets.filter(x=>num(x.r)>0).length;let hit=false;for(const [n,re] of MG)if(re.test(p)){cnt[n]+=k;hit=true}if(!hit)other+=k}
 const mx=25;$('#mg').innerHTML=MG.map(([n])=>`<div class="hrow" data-tip="${esc(`${n} : ${cnt[n]} séries effectives sur 7 jours\n${cnt[n]<10?'sous':cnt[n]>20?'au-dessus de':'dans'} la zone 10 à 20 séries`)}"><span>${n}</span><div class="bar" style="--c:${cnt[n]>=10?'var(--trn)':'color-mix(in srgb,var(--trn) 45%,var(--field))'}"><b class="band" style="left:${10/mx*100}%;width:${10/mx*100}%"></b><i style="width:${Math.min(100,cnt[n]/mx*100)}%"></i></div><span class="num">${cnt[n]} série${cnt[n]>1?'s':''}</span></div>`).join('')+(other?`<p class="mute small">${other} séries sur des exercices non classés.</p>`:'')}
function renderHeat(){const end=today(),wd=(new Date(end+'T12:00').getDay()+6)%7,start=addD(end,-wd-15*7),cells=[];let act28=0;
 for(let i=0;i<16*7;i++){const k=addD(start,i);if(k>end){cells.push('<i class="c f"></i>');continue}const t=dayTrain(k),m=t.mu.length>0||t.ap.some(isStr),s=t.sp.length+t.ap.filter(w=>!isStr(w)).length>0;if((m||s)&&k>addD(end,-28))act28++;const lab=[...t.mu.map(x=>x.name),...t.sp.map(x=>x.type+' '+x.min+' min'),...t.ap.map(w=>(WT[w.ty]||w.ty)+' '+w.min+' min')];const ef=effortOf(k);cells.push(`<i class="c ${m&&s?'b':m?'m':s?'s':''}" data-tip="${esc(dLong(k)+'\n'+(lab.join('\n')||'Repos')+(ef!=null?'\nEffort '+ef:''))}"></i>`)}
 $('#heat').innerHTML=`<div class="hm">${cells.join('')}</div>`;$('#heatsum').textContent=`${act28} jours actifs sur les 28 derniers. Une colonne par semaine, du lundi au dimanche.`}
function renderLoad(){const e=today(),from=addD(e,-120),A=[],C=[];for(let d=from;d<=e;d=addD(d,1)){const x=acwr(d);A.push({x:d,y:Math.round(x.a)});C.push({x:d,y:Math.round(x.c)})}
 const x=acwr(e);$('#lk').innerHTML=`<div><b>${r0(x.a)}</b><span>charge des 7 derniers jours</span></div><div><b>${r0(x.c)}</b><span>moyenne hebdo sur 28 jours</span></div>`+(x.r!=null?`<div><b class="${x.r>1.5?'dn':x.r>=0.8&&x.r<=1.3?'gd':''}">${f2(x.r)}</b><span>ratio aigu / chronique</span></div>`:'')+(()=>{const mo=monotony(e);return mo?`<div><b class="${mo.mono>2?'dn':''}">${f2(mo.mono)}</b><span>monotonie (risque au-delà de 2)</span></div>`:''})();
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
 $('#ptab').innerHTML=rows.length?`<table><thead><tr><th>Date</th><th>Meilleure série</th><th class="num">1RM est.</th></tr></thead><tbody>${rows.slice(-6).reverse().map(r=>`<tr><td>${dShort(r.d)}</td><td>${esc(setTxt(r.x))}</td><td class="num">${r.v?fx(r.v)+' kg':'–'}</td></tr>`).join('')}</tbody></table>`:''}
function renderRecs(){const m=new Map();for(const s of done())if(s.kind!=='sport')for(const e of s.ex||[]){const k=norm(e.n);if(!k)continue;const o=m.get(k)||{n:e.n,e1:0,e1d:'',hw:0,hwd:'',hws:null,mr:0};for(const x of e.sets){const v=e1(num(x.w),num(x.r));if(v>o.e1){o.e1=v;o.e1d=s.date}if(num(x.w)>o.hw||(num(x.w)===o.hw&&num(x.r)>num(o.hws&&o.hws.r))){o.hw=num(x.w);o.hwd=s.date;o.hws=x}o.mr=Math.max(o.mr,num(x.r))}m.set(k,o)}
 const L=[...m.values()].sort((a,b)=>b.e1-a.e1);
 $('#recs').innerHTML=L.length?`<table><thead><tr><th>Exercice</th><th>Série la plus lourde</th><th class="num">Meilleur 1RM est.</th><th class="num">Date</th></tr></thead><tbody>${L.map(o=>`<tr><td>${esc(o.n)}</td><td>${o.hws?esc(setTxt(o.hws)):'–'}</td><td class="num">${o.e1?fx(o.e1)+' kg':o.mr+' reps'}</td><td class="num">${dShort(o.e1d||o.hwd)}</td></tr>`).join('')}</tbody></table>`:'<p class="mute empty">Tes records apparaîtront après tes premières séances.</p>'}
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
  const w=e.w;return `<details class="je" style="--c:color-mix(in srgb,var(--eff) 55%,var(--field))"><summary><span class="dt">${dShort(e.d)}</span><i class="dot"></i><span class="tl">${esc(WT[w.ty]||w.ty)} <span class="mute small">· montre</span></span><span class="mt">${esc(w.min)} min${w.km?' · '+fx(w.km)+' km':''}${w.hr?' · '+esc(w.hr)+' bpm':''}${w.tr?' · effort '+r0(100*(1-Math.exp(-w.tr/110))):''}</span></summary><div class="jb">${zbar(w.z)+zleg(w.z)}<p class="mute small">${w.kcal?esc(w.kcal)+' kcal · ':''}${w.mx?'FC max '+esc(w.mx)+' bpm · ':''}importé d'Apple Santé</p></div></details>`}).join('')
 +(E.length>histN?`<div class="row"><button class="btn small" data-act="more">Voir plus (${E.length-histN})</button></div>`:'')}

/* ---------- nutrition ---------- */
function meter(l,v,t,u,sub,cls,col){return `<div class="${cls}" style="--c:${col}"><div class="mh"><span class="eyebrow">${l}</span><b class="big">${r0(v)}<small> / ${r0(t)} ${u}</small></b></div><div class="bar"><i style="width:${Math.min(100,t?v/t*100:0)}%"></i></div><p class="mute small">${sub}</p></div>`}
function renderNutri(){const d=S.day,D=S.days[d]||{},it=D.items||[],Pr=sum(it,'p'),G=sum(it,'g'),Li=sum(it,'l'),K=it.reduce((a,x)=>a+kcalOf(x),0),T=num(S.set.prot),KT=num(S.set.kcal),h=H(d),out=num(h.bs)+num(h.ac);
 if(document.activeElement!==$('#nday'))$('#nday').value=d;
 if(!$('#fm').options.length){const hr=new Date().getHours();$('#fm').innerHTML=MEALS.map(m=>`<option>${m}</option>`).join('');$('#fm').value=hr<11?'Petit-déjeuner':hr<15?'Déjeuner':hr<18?'Collation':'Dîner'}
 const Wn=weights(),wkk=Object.keys(Wn).sort(),wtn=wkk.length?wAvg(Wn,wkk[wkk.length-1]):null;
 $('#meters').innerHTML=meter('Protéines',Pr,T,'g',(Pr>=T?'Objectif atteint':'Il reste '+r0(T-Pr)+' g')+(wtn?` · ${fx(Pr/wtn)} g/kg`:''),Pr>=T?'ok':'','var(--nut)')+meter('Calories',K,KT,'kcal',K>KT?r0(K-KT)+' kcal au-dessus':'Il reste '+r0(KT-K)+' kcal',K>KT*1.05?'over':'','var(--nut)')
  +(out?meter('Dépense Apple',out,out,'kcal',`${r0(num(h.bs))} de base + ${r0(num(h.ac))} actives`+(K?` · bilan <b>${K-out>0?'+':''}${r0(K-out)}</b>`:''),'','var(--eff)'):`<div><span class="eyebrow">Dépense</span><p class="mute small">Ta dépense de ce jour apparaîtra après ${IMP('un import Apple couvrant cette date','la synchro Apple Santé de cette date')}.</p></div>`);
 const mk=Pr*4+G*4+Li*9;$('#macros').innerHTML=mk&&(G||Li)?`<div class="mh small"><span>Macros : <b>${r0(Pr)} g</b> protéines · <b>${r0(G)} g</b> glucides · <b>${r0(Li)} g</b> lipides</span><span class="mute">${r0(Pr*4/mk*100)} / ${r0(G*4/mk*100)} / ${r0(Li*9/mk*100)} % des kcal</span></div><div class="macro"><i style="width:${Pr*4/mk*100}%;background:var(--nut)"></i><i style="width:${G*4/mk*100}%;background:var(--wat)"></i><i style="width:${Li*9/mk*100}%;background:var(--hrt)"></i></div>`:'';
 $('#hday').textContent=h.wa&&!num(D.w)?`Eau notée dans Apple Santé : ${fx(h.wa/1000)} L`:'';
 $('#favs').innerHTML=S.set.foods.map((f,k)=>`<button class="chip" data-act="fav" data-k="${k}"><b>${esc(f.n)}</b><span>${fx(num(f.p))} g · ${r0(kcalOf(f))} kcal</span></button>`).join('')||'<p class="mute small">Coche « Garder dans mes favoris » en ajoutant un aliment.</p>';
 const byM={};it.forEach((x,k)=>{const m=x.m||'Sans repas';(byM[m]||(byM[m]=[])).push([x,k])});
 $('#flist').innerHTML=it.length?[...MEALS,'Sans repas'].filter(m=>byM[m]).map(m=>`<div class="mealh"><span>${m}</span><span>${r0(byM[m].reduce((a,[x])=>a+num(x.p),0))} g · ${r0(byM[m].reduce((a,[x])=>a+kcalOf(x),0))} kcal</span></div><ul class="flist" style="margin:0">${byM[m].map(([x,k])=>`<li><span>${esc(x.n)}${x.g||x.l?`<span class="ml">G ${fx(num(x.g))} g · L ${fx(num(x.l))} g</span>`:''}</span><span class="num">${fx(num(x.p))} g</span><span class="num">${r0(kcalOf(x))} kcal</span><button class="x" data-act="delFood" data-k="${k}" aria-label="Supprimer">×</button></li>`).join('')}</ul>`).join(''):'<p class="mute empty">Rien de noté pour ce jour.</p>';
 const bw=$('#bw');if(document.activeElement!==bw)bw.value=has(D.bw)?String(D.bw).replace('.',','):'';
 const wat=num(D.w),wt=num(S.set.water);
 $('#water').innerHTML=`<div class="mh"><span class="eyebrow">${d===today()?"Aujourd'hui":dShort(d)}</span><b class="big">${fx(wat/1000)}<small> / ${fx(wt/1000)} L</small></b></div><div class="bar" style="--c:var(--wat)"><i style="width:${Math.min(100,wat/wt*100)}%"></i></div><div class="row"><button class="btn small" data-act="water" data-v="250">+ 25 cl</button><button class="btn small" data-act="water" data-v="330">+ 33 cl</button><button class="btn small" data-act="water" data-v="500">+ 50 cl</button><button class="btn small ghost" data-act="water" data-v="-250">− 25 cl</button></div>`;
 const tk=D.sup||[];$('#sups').innerHTML=S.set.sups.length?`<div class="chips">${S.set.sups.map(s=>`<button class="chip ${tk.includes(s)?'on':''}" data-act="sup" data-s="${esc(s)}">${tk.includes(s)?'✓ ':''}${esc(s)}</button>`).join('')}</div><p class="mute small">Touche pour cocher ce que tu as pris.</p>`:'<p class="mute small">Ajoute tes compléments dans Plus → Réglages.</p>';
 const L=[];for(let i=13;i>=0;i--){const k=addD(d,-i),its=dayIt(k);L.push({k,p:sum(its,'p'),c:its.reduce((a,x)=>a+kcalOf(x),0),has:its.length>0})}
 const hv=L.filter(x=>x.has),mp=Math.max(T*1.25,...L.map(x=>x.p));
 $('#nk').innerHTML=hv.length?`<div><b>${r0(avg(hv.map(x=>x.p)))} g</b><span>protéines / jour</span></div><div><b>${r0(avg(hv.map(x=>x.c)))}</b><span>kcal / jour</span></div><div><b>${hv.filter(x=>x.p>=T).length} / ${hv.length}</b><span>jours à l'objectif</span></div>`:'';
 const td=tdeeEst(),gw=num(S.set.goalw),ab=[];for(let i=1;i<=14;i++){const h2=H(addD(today(),-i));if(h2.bs||h2.ac)ab.push(num(h2.bs)+num(h2.ac))}const apl=avg(ab);
 $('#tdee').innerHTML=td?`<div class="kpis"><div><b>${r0(td.t)} kcal</b><span>dépense réelle par jour</span></div><div><b>${r0(td.intake)} kcal</b><span>apport moyen (${td.n} jours notés)</span></div><div><b>${sg(Math.round(td.wk*100)/100)} kg</b><span>par semaine (tendance du poids)</span></div>${apl?`<div><b>${r0(apl)} kcal</b><span>dépense selon la montre</span></div>`:''}</div><p class="small">Calculée à partir de ce que tu manges et de la pente de ton poids sur 3 semaines (régression sur toutes tes pesées ; 1 kg ≈ 7 700 kcal). Fiable seulement si tu notes tout ce que tu manges les jours renseignés : un oubli fait paraître ta dépense plus basse qu'en réalité.${gw&&wtn?` Pour aller vers ${fx(gw)} kg, vise environ <b>${r0(td.t+(gw>wtn?300:-450))} kcal par jour</b> (${gw>wtn?'léger surplus pour prendre du muscle en limitant le gras':'déficit modéré pour perdre du gras en gardant le muscle'}).`:''}${apl&&Math.abs(apl-td.t)>250?` La montre ${apl>td.t?'surestime':'sous-estime'} ta dépense d'environ ${r0(Math.abs(apl-td.t))} kcal.`:''}</p>`:'<p class="mute small">Note tes repas au moins 10 jours sur 3 semaines et pèse-toi régulièrement : l\'appli calculera ta vraie dépense à partir de l\'évolution de ton poids.</p>';
 $('#prot14').innerHTML=L.map(x=>`<div class="hrow ${x.p>=T?'ok':''}" style="--c:var(--nut)" data-tip="${esc(x.has?`${dLong(x.k)}\n${r0(x.p)} g de protéines (${x.p>=T?'objectif atteint':'il manquait '+r0(T-x.p)+' g'})\n${r0(x.c)} kcal`:dLong(x.k)+' : rien de noté')}"><span>${dWk(x.k)}</span><div class="bar"><i style="width:${x.p/mp*100}%"></i><b class="tg" style="left:${T/mp*100}%"></b></div><span class="num">${x.has?r0(x.p)+' g':'–'}</span></div>`).join('')}
function addFood(f,m){if(!f)return;const d=S.day,o={n:f.n,p:num(f.p),k:Math.round(kcalOf(f)),m:m||$('#fm').value};if(num(f.g))o.g=num(f.g);if(num(f.l))o.l=num(f.l);getDay(d).items.push(o);put.day(d);renderNutri()}
function delFood(k){const d=S.day,D=getDay(d),x=D.items.splice(k,1)[0];put.day(d);renderNutri();toast('Aliment retiré',()=>{getDay(d).items.splice(k,0,x);put.day(d);renderNutri()})}

/* ---------- tendances ---------- */
 function renderMarkers(){const m=markers();$('#mkrs').innerHTML=m.length?m.map(x=>`<div class="mkr"><div class="t2"><span>${x.t}</span><span class="st" style="--c:${x.st[1]}">${x.st[0]}</span></div><b>${esc(x.v)}</b><p>${x.p}</p></div>`).join(''):'<p class="mute small">'+IMP('Importe Apple Santé et note ton poids pour obtenir ton bilan.','Connecte Apple Santé et note ton poids pour obtenir ton bilan.')+'</p>';
 const R14=k=>{let n=0;for(let i=0;i<14;i++)if(k(addD(today(),-i)))n++;return n};let streak=0;for(let i=0;i<400;i++){const d=addD(today(),-i);const j=J(d);if(j.mood||j.energy||j.stress||j.sore)streak++;else if(i>0)break}
 const W=weights(),L=hLast(),rs=[['Nuits suivies',R14(d=>H(d).sl),'montre portée la nuit'],['Repas notés',R14(d=>dayIt(d).length),'jours avec nutrition'],['Check-ins',R14(d=>J(d).mood||J(d).energy),'jours remplis'],['Pesées',R14(d=>W[d]),'jours pesés']];
 $('#rig').innerHTML=rs.map(([t,n,s])=>`<div class="stat"><b style="color:${n>=11?'var(--rec)':n>=6?'var(--str)':'var(--bad)'}">${n} <small>/ 14</small></b><span>${t} · ${s}</span></div>`).join('')+`<div class="stat"><b>${streak} <small>j</small></b><span>série de check-ins en cours</span></div>`+(L?`<div class="stat"><b>${dShort(L)}</b><span>dernières données Apple${today()>addD(L,3)?IMP(' : pense à réimporter',' : synchronise Apple Santé'):''}</span></div>`:'')}
function renderTrends(){renderMarkers();const e=today(),s0=addD(e,-6),p0=addD(e,-13),p1=addD(e,-7);$('#wkr').textContent=`du ${dShort(s0)} au ${dShort(e)}, vs les 7 jours d'avant`;
 const rng=(a,b)=>{const r=[];for(let d=a;d<=b;d=addD(d,1))r.push(d);return r},A=rng(s0,e),B=rng(p0,p1);
 const hv=(ds,k)=>avg(ds.map(d=>num(H(d)[k])).filter(x=>x>0)),sc=(ds,f)=>avg(ds.map(f).filter(x=>x!=null));
 const nut=(ds,f)=>avg(ds.filter(d=>dayIt(d).length).map(f));
 const tr=ds=>{let n=0,m=0,t=0;for(const d of ds){const x=dayTrain(d);n+=x.mu.length+x.sp.length+x.ap.length;m+=x.min;for(const s of x.mu)t+=(s.ex||[]).reduce((a,y)=>a+y.sets.reduce((b,z)=>b+num(z.w)*num(z.r),0),0)}return{n,m,t}};
 const W=weights(),jm=(ds,k)=>avg(ds.map(d=>J(d)[k]).filter(Boolean)),ta=tr(A),tb=tr(B);
 const rows=[['Récupération',sc(A,d=>recovery(d)?.s),sc(B,d=>recovery(d)?.s),v=>r0(v)+' %',1,3],['Effort moyen',sc(A,effortOf),sc(B,effortOf),r0,0,3],['Score de sommeil',sc(A,d=>sleepScore(d)?.s),sc(B,d=>sleepScore(d)?.s),r0,1,3],['Sommeil moyen',hv(A,'sl'),hv(B,'sl'),fmtSl,1,15],['VFC nocturne',avg(A.map(nhrv).filter(Boolean)),avg(B.map(nhrv).filter(Boolean)),v=>r0(v)+' ms',1,2],['FC au repos',hv(A,'rhr'),hv(B,'rhr'),v=>r0(v)+' bpm',-1,1],['Stress estimé',hv(A,'stz'),hv(B,'stz'),r0,-1,5],['Pas par jour',hv(A,'st'),hv(B,'st'),r0,1,500],['Séances',ta.n,tb.n,r0,1,1],['Temps d\'entraînement',ta.m,tb.m,v=>r0(v)+' min',1,20],['Tonnage muscu',ta.t,tb.t,v=>fx(v/1000)+' t',1,500],['Protéines / jour',nut(A,d=>sum(dayIt(d),'p')),nut(B,d=>sum(dayIt(d),'p')),v=>r0(v)+' g',1,5],['Calories / jour',nut(A,d=>dayIt(d).reduce((a,x)=>a+kcalOf(x),0)),nut(B,d=>dayIt(d).reduce((a,x)=>a+kcalOf(x),0)),r0,0,100],['Poids (moy. 7 j)',wAvg(W,e),wAvg(W,p1),v=>fx(v)+' kg',0,.2],['Humeur',jm(A,'mood'),jm(B,'mood'),v=>fx(v)+' / 5',1,.3],['Énergie',jm(A,'energy'),jm(B,'energy'),v=>fx(v)+' / 5',1,.3],['Stress ressenti',jm(A,'stress'),jm(B,'stress'),v=>fx(v)+' / 5',-1,.3]];
 $('#week').innerHTML=`<table><thead><tr><th>Mesure</th><th class="num">Cette semaine</th><th class="num">Semaine d'avant</th><th class="num">Évolution</th></tr></thead><tbody>${rows.filter(r=>r[1]!=null||r[2]!=null).map(([l,a,b,f,dir,th])=>{let ev='–';if(a!=null&&b!=null){const df=a-b;ev=Math.abs(df)<th?'stable':`<span class="${dir===0?'':(df*dir>0?'gd':'dn')}">${df>0?'▲':'▼'} ${f(Math.abs(df))}</span>`}return `<tr><td>${l}</td><td class="num" data-l="Cette semaine">${a!=null?f(a):'–'}</td><td class="num" data-l="Semaine d'avant">${b!=null?f(b):'–'}</td><td class="num" data-l="Évolution">${ev}</td></tr>`}).join('')}</tbody></table>`;
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
 r=cmp(hi,lo,d=>recovery(addD(d,1))?.s);if(r&&Math.abs(r.a-r.b)>=4)out.push({c:'var(--eff)',t:`Après un effort de 70 ou plus, ta récupération du lendemain est ${r.a<r.b?'plus basse':'plus haute'} de ${r0(Math.abs(r.a-r.b))} points.`,s:`${r0(r.a)} % contre ${r0(r.b)} % après les journées calmes (${r.na} et ${r.nb} jours). Prévois une journée plus légère après tes grosses séances.`});
 r=cmp(hi,lo,d=>num(H(addD(d,1)).sl)||null);if(r&&Math.abs(r.a-r.b)>=10)out.push({c:'var(--slp)',t:`Les jours d'effort intense, tu dors ${fmtSl(Math.abs(r.a-r.b))} ${r.a>r.b?'de plus':'de moins'} la nuit suivante.`,s:`${fmtSl(r.a)} contre ${fmtSl(r.b)} (${r.na} et ${r.nb} nuits).`});
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
 if(wk.length){const ld=wk[wk.length-1],a=wAvg(W,ld),b=wAvg(W,addD(ld,-28)),c=wAvg(W,addD(ld,-84)),rate=b?(a-b)/4:null;let proj='';
  if(gw&&rate){const left=gw-a;if(Math.abs(left)<0.3)proj=`<div><b class="gd">Atteint</b><span>objectif ${fx(gw)} kg</span></div>`;else if(left*rate>0){const w=left/rate;proj=`<div><b>${w>104?'> 2 ans':dShort(addD(ld,Math.round(w*7)))}</b><span>objectif ${fx(gw)} kg au rythme actuel</span></div>`}else proj=`<div><b class="dn">${fx(Math.abs(left))} kg</b><span>de l'objectif, tendance inverse</span></div>`}
  $('#bk').innerHTML=`<div><b>${fx(a)} kg</b><span>moyenne 7 j au ${dShort(ld)}</span></div>`+(b?`<div><b>${sg(a-b)} kg</b><span>4 semaines (${sg(rate)} kg/sem.)</span></div>`:'')+(c?`<div><b>${sg(a-c)} kg</b><span>12 semaines</span></div>`:'')+proj}else $('#bk').innerHTML='';
 const md=$('#mdate');if(!md.value)md.value=today();
 const ms=Object.keys(S.days).filter(d=>S.days[d].m&&Object.keys(S.days[d].m).length).sort().reverse();
 $('#mtab').innerHTML=ms.length?`<table><thead><tr><th>Date</th>${MEAS.map(([,l])=>`<th class="num">${l}</th>`).join('')}</tr></thead><tbody>${ms.slice(0,8).map((d,i)=>{const m=S.days[d].m,p=ms[i+1]?S.days[ms[i+1]].m:null;return `<tr><td>${dShort(d)}<button class="x" data-act="delM" data-d="${d}" aria-label="Supprimer" style="width:32px;height:32px;font-size:18px">×</button></td>${MEAS.map(([k])=>`<td class="num">${m[k]?fx(m[k]):'–'}${m[k]&&p&&p[k]?` <span class="mute small">(${sg(m[k]-p[k])})</span>`:''}</td>`).join('')}</tr>`}).join('')}</tbody></table>`:'';
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
 if(q==='mu'||q==='sp'){startMode=q;if(!S.cur)renderStart();go('effort',()=>{$('#editor').scrollIntoView({behavior:'smooth',block:'start'});const f=$(q==='mu'?'#nn':'#spm');if(f&&!S.cur)f.focus({preventScroll:true})})}
 else if(q==='food'){S.day=today();go('nutrition',()=>{$('#ff').scrollIntoView({behavior:'smooth',block:'center'});$('#fn').focus({preventScroll:true})})}
 else if(q==='bw'){S.day=today();go('nutrition',()=>{$('#bw').scrollIntoView({behavior:'smooth',block:'center'});$('#bw').focus({preventScroll:true})})}
 else if(q==='water'){const o=getDay(today());o.w=num(o.w)+250;put.day(today());renderView(cur());toast(`Eau : ${fx(o.w/1000)} L aujourd'hui`)}
 else if(q==='ci'){S.day=today();go('aujourdhui',()=>$('#checkin').scrollIntoView({behavior:'smooth',block:'start'}))}
 else if(q==='med'){psub='dossier';go('plus',()=>{renderPlus();$('#mti').focus({preventScroll:true})})}
 else if(q==='apple'){if(HKN&&S.health.src==='hk'){hkSync();return}psub='apple';go('plus',renderPlus)}}

function renderPlus(){$('#hub').hidden=!!psub;$('#subbar').hidden=!psub;$('#subt').textContent=SUBT[psub]||'';$$('[data-sub]').forEach(x=>x.hidden=x.dataset.sub!==psub);
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
 if(!d||!Array.isArray(d.sessions)||typeof d.days!=='object'){m.textContent="Ce texte n'est pas un export du carnet.";return}
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
function markMore(){if(!matchMedia('(max-width:800px)').matches)return;requestAnimationFrame(()=>$$('.view:not([hidden]) .panel>p.mute.small:not(.open)').forEach(p=>p.classList.toggle('more',p.scrollHeight>p.clientHeight+2)))}
function renderView(v){setTimeout(markMore,0);renderDayNav();$('#demobar').hidden=!S.set.demo;try{({aujourdhui:renderToday,sommeil:renderSleep,recuperation:renderRec,effort:renderEffort,nutrition:renderNutri,tendances:renderTrends,plus:renderPlus})[v]()}catch(e){console.error(e)}}
function renderSoft(){updateDatalist();
 if(!S.cur&&!$('#editor').contains(document.activeElement))renderStart();
 if(S.cur)S.cur.ex.forEach((e,i)=>updateHint(i));
 const v=cur();if(v==='aujourdhui'&&$('#checkin').contains(document.activeElement))return;if(v==='effort'&&$('#editor').contains(document.activeElement))return;renderView(v)}
function route(){const v=cur();views.forEach(n=>$('#v-'+n).hidden=n!==v);$$('#tabs a').forEach(a=>{a.setAttribute('aria-current',a.getAttribute('href')==='#'+v?'page':'false');a.classList.toggle('sub-on',a.getAttribute('href')==='#plus'&&['nutrition','tendances'].includes(v))});renderView(v)}

$('#editor').addEventListener('input',ev=>{const t=ev.target,c=S.cur;if(!c)return;
 if(t.id==='cn'){c.name=t.value;return dirty()}if(t.id==='cd'){c.date=t.value;return dirty()}if(t.id==='crpe'){c.rpe=num(t.value)||'';return dirty()}
 const a=t.closest('.ex');if(!a||!t.dataset.f)return;const i=+a.dataset.i;
 if(t.dataset.f==='n')c.ex[i].n=t.value;else{const v=t.value.trim();c.ex[i].sets[+t.dataset.s][t.dataset.f]=v===''?'':num(v);updateHint(i)}dirty()});
$('#editor').addEventListener('change',ev=>{const t=ev.target,c=S.cur;if(!c)return;
 if(t.dataset.f==='r'&&num(t.value)>0&&S.set.auto!==false)startTimer();
 if(!t.classList.contains('exn'))return;const a=t.closest('.ex'),i=+a.dataset.i,e=c.ex[i];
 if(e.sets.every(s=>s.w===''&&s.r==='')&&suggest(e.n,c.id)){e.sets=prefill(e.n,c.id);a.outerHTML=exHTML(e,i);dirty()}updateHint(i)});
document.addEventListener('click',ev=>{unlockAudio();if(matchMedia('(max-width:800px)').matches){const nt=ev.target.closest('.panel>p.mute.small');if(nt&&!ev.target.closest('a,button')){nt.classList.toggle('open');return}}if(ev.target.id==='sheet'){quick('close');return}const go=ev.target.closest('[data-go]');if(go){location.hash=go.dataset.go;return}
 const b=ev.target.closest('[data-act]');if(!b)return;const act=b.dataset.act,c=S.cur,a=b.closest('.ex'),i=a?+a.dataset.i:-1;
 switch(act){
 case'sheet':{const sh=$('#sheet');sh.hidden=!sh.hidden;setTimeout(()=>{document.documentElement.style.setProperty('--hh',$('.top').offsetHeight+'px')},0);return}
 case'qa':return quick(b.dataset.q);
 case'onb':if(b.dataset.to==='2'&&!b.dataset.skip)saveProfile();return showOnb(+b.dataset.to);
 case'onbGo':return onbGo(b.dataset.go2);
 case'demoEnd':clearDemo();renderSoft();return showOnb(2);
 case'bksave':return saveBackup();
 case'hksync':return hkSync();
 case'hkauth':return hkConnect();
 case'bkok':{const t=pendingBk;pendingBk='';if(t)doImport(t,$('#bkmsg'));return}
 case'wipe':{if(b.classList.contains('armed'))return resetAll();b.classList.add('armed');b.textContent='Confirmer : tout effacer définitivement';setTimeout(()=>{b.classList.remove('armed');b.textContent='Effacer toutes mes données'},6000);return}
 case'dprev':S.day=addD(S.day,-1);return renderView(cur());
 case'dnext':if(S.day<today())S.day=addD(S.day,1);return renderView(cur());
 case'dlast':S.day=hLast()||today();return renderView(cur());
 case'psub':psub=b.dataset.s;scrollTo(0,0);if(cur()!=='plus'){ev.preventDefault();location.hash='plus';return}return renderPlus();
 case'slt':sleepTrend=b.dataset.k;return renderSleep();
 case'slper':sleepPer=+b.dataset.n;return renderSleep();
 case'jset':{const k=b.dataset.k,v=+b.dataset.v;setJ({[k]:J(S.day)[k]===v?undefined:v});return renderCheckin()}
 case'jtag':{const t=b.dataset.t,tg=(J(S.day).tags||[]).slice(),x=tg.indexOf(t);if(x<0)tg.push(t);else tg.splice(x,1);setJ({tags:tg});return renderCheckin()}
 case'water':{const d=S.day,o=getDay(d);o.w=Math.max(0,num(o.w)+ +b.dataset.v);put.day(d);return renderView(cur())}
 case'sup':{const d=S.day,o=getDay(d),s=b.dataset.s,l=(o.sup||[]).slice(),x=l.indexOf(s);if(x<0)l.push(s);else l.splice(x,1);o.sup=l;put.day(d);return renderNutri()}
 case'copyY':{const d=S.day,y=dayIt(addD(d,-1));if(!y.length)return toast('Rien de noté la veille.');getDay(d).items.push(...clone(y));put.day(d);renderNutri();return toast(y.length+' aliments copiés depuis la veille')}
 case'smode':startMode=b.dataset.m;return renderStart();
 case'start':return startSession();
 case'tpl':return startSession(b.dataset.id);
 case'tstart':return startTimer();
 case't30':tEnd=Math.max(tEnd,Date.now())+30000;$('#timer').classList.remove('end');$('#tlab').textContent='Repos';return tick();
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
 case'fav':return addFood(S.set.foods[+b.dataset.k]);
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
$('#ff').addEventListener('submit',ev=>{ev.preventDefault();const n=$('#fn').value.trim(),p=num($('#fp').value),g=num($('#fg').value),l=num($('#fl2').value),k=num($('#fk').value);if(!n&&!p&&!k&&!g&&!l)return $('#fn').focus();
 const f={n:n||'Aliment',p,g,l,k:k||Math.round(p*4+g*4+l*9)};addFood(f);if($('#fsave').checked&&!S.set.foods.some(x=>norm(x.n)===norm(f.n))){S.set.foods.push(f);put.set()}
 const m=$('#fm').value;$('#ff').reset();$('#fm').value=m;renderNutri();$('#fn').focus()});
$('#mf').addEventListener('submit',ev=>{ev.preventDefault();const d=$('#mdate').value||today(),m={};for(const [k] of MEAS){const v=num($('#m-'+k).value);if(v>0)m[k]=v}if(!Object.keys(m).length)return $('#m-taille').focus();getDay(d).m=m;put.day(d);$('#mf').reset();$('#mdate').value=today();renderBody();toast('Mensurations enregistrées')});
$('#medf').addEventListener('submit',ev=>{ev.preventDefault();const o={id:nid(),type:$('#mt').value,date:$('#md').value||today(),title:$('#mti').value.trim(),who:$('#mw').value.trim(),next:$('#mn').value,note:$('#mno').value.trim()};if(!o.title)return $('#mti').focus();S.med.push(o);put.med(o);$('#medf').reset();$('#md').value=today();renderMed();toast('Ajouté au dossier')});
$('#supf').addEventListener('submit',ev=>{ev.preventDefault();const v=$('#supn').value.trim();if(v&&!S.set.sups.includes(v)){S.set.sups.push(v);put.set()}$('#supn').value='';renderSettings()});
$('#tagf').addEventListener('submit',ev=>{ev.preventDefault();const v=$('#tagn').value.trim();if(v&&!S.set.tags.includes(v)){S.set.tags.push(v);put.set()}$('#tagn').value='';renderSettings()});
$('#nday').addEventListener('change',ev=>{if(ev.target.value){S.day=ev.target.value;renderNutri()}});
$('#bw').addEventListener('change',ev=>{const d=S.day,v=ev.target.value.trim();getDay(d).bw=v===''?'':num(v);put.day(d);renderNutri()});
$('#bkfile').addEventListener('change',async ev=>{const f=ev.target.files[0];ev.target.value='';if(!f)return;const m=$('#bkmsg');
 let d;try{pendingBk=await f.text();d=JSON.parse(pendingBk)}catch(e){pendingBk='';m.textContent="Ce fichier n'est pas une sauvegarde lisible.";return}
 if(!d||!Array.isArray(d.sessions)||typeof d.days!=='object'){pendingBk='';m.textContent="Ce fichier n'est pas une sauvegarde du carnet.";return}
 m.innerHTML=`Sauvegarde trouvée : ${d.sessions.length} séances, ${Object.keys(d.days||{}).length} jours, ${(d.med||[]).length} entrées de dossier. Elle remplacera tes données actuelles. <button type="button" class="btn small danger armed" data-act="bkok">Restaurer</button>`});
$('#pex').addEventListener('change',renderForce);$('#am').addEventListener('change',renderBody);$('#vtm').addEventListener('change',renderRec);
$('#s-auto').addEventListener('change',ev=>{S.set.auto=ev.target.checked;put.set()});
$('#s-sex').addEventListener('change',ev=>{S.set.sex=ev.target.value;put.set()});
$('#s-hvm').addEventListener('change',ev=>{S.set.hvm=ev.target.value;S.set.hvmSet=true;put.set();toast(ev.target.value==='rmssd'?'VFC : RMSSD pendant le sommeil':ev.target.value==='sdnn'?'VFC : SDNN Apple pendant le sommeil':'VFC : SDNN Apple, moyenne de la journée')});
for(const id in SK)$('#'+id).addEventListener('change',ev=>{const key=SK[id];if(['goalw','birth','height'].includes(key)&&ev.target.value.trim()===''){S.set[key]='';put.set();return renderSettings()}let v=num(ev.target.value);if(v>0){if(key==='sleep')v=Math.round(v*60);S.set[key]=v;if(S.set.rmin>S.set.rmax)S.set.rmax=S.set.rmin;put.set()}renderSettings()});
$('#hfile').addEventListener('change',async ev=>{const f=ev.target.files[0];ev.target.value='';if(!f)return;const bar=$('#hbar'),bi=bar.querySelector('i'),msg=$('#hmsg');
 const prog=p=>{p=Math.min(100,p||0);bi.style.width=p.toFixed(0)+'%';msg.textContent=(p>=96?'Analyse des nuits et du cœur… ':'Lecture… ')+p.toFixed(0)+' %'};
 bar.hidden=false;bi.style.width='0';msg.dataset.busy='1';msg.textContent='Ouverture du fichier…';
 try{const R=await readHealth(f,prog,S.set.sex),r=R.d,n=Object.keys(r).length;
  if(!n){msg.textContent='Aucune donnée récente dans ce fichier.';return}
  if(S.set.demo)clearDemo();applyHealth(R);
  const w=Object.values(r).reduce((a,o)=>a+(o.wk||[]).length,0),ns=Object.values(r).filter(o=>o.sl).length,nv=Object.values(r).filter(o=>o.nhv).length,nrm=Object.values(r).filter(o=>o.nrm).length;
  msg.dataset.keep='1';msg.textContent=`Analyse terminée : ${n} jours, ${ns} nuits (dont ${nv} avec VFC nocturne, ${nrm} recalculées en RMSSD) et ${w} entraînements. ${R.chk?` Contrôle de lecture des battements : le SDNN recalculé vaut ${Math.round(R.chk.med*100)} % de la valeur Apple (sur ${R.chk.n} mesures).`:''} FC max. déduite : ${R.hmax} bpm.`}
 catch(e){console.error(e);msg.textContent="Impossible de lire ce fichier. Choisis le export.zip d'Apple Santé, ou le fichier .xml qu'il contient (pas celui qui contient « cda »)."}
 finally{bar.hidden=true;delete msg.dataset.busy;renderSoft()}});
addEventListener('hashchange',()=>{$('#sheet').hidden=true;route();scrollTo(0,0)});
document.addEventListener('keydown',e=>{if(e.metaKey||e.ctrlKey||e.altKey)return;const t=e.target;if(t.closest&&t.closest('input,textarea,select,[contenteditable]'))return;
 const tabs=['aujourdhui','sommeil','recuperation','effort','nutrition','tendances','plus'];
 if(e.key==='Escape'){$('#sheet').hidden=true;return}
 if(/^[1-7]$/.test(e.key)){location.hash=tabs[+e.key-1];return}
 if(e.key==='n'||e.key==='N'){e.preventDefault();$('.tplus').click();return}
 if(!$('#dn').hidden){if(e.key==='ArrowLeft'){S.day=addD(S.day,-1);renderView(cur())}else if(e.key==='ArrowRight'&&S.day<today()){S.day=addD(S.day,1);renderView(cur())}}});
{const fit=()=>{const r=document.documentElement;r.style.setProperty('--hh',$('.top').offsetHeight+'px');};fit();addEventListener('resize',fit);setTimeout(fit,300)}
{const T=$('#tip'),place=e=>{const w=T.offsetWidth,h=T.offsetHeight,W=document.documentElement.clientWidth;let x=e.pageX+14,y=e.pageY-h-12;if(x+w>W-8)x=e.pageX-w-14;if(y<scrollY+8)y=e.pageY+18;T.style.left=Math.max(8,x)+'px';T.style.top=y+'px'};
 document.addEventListener('pointerover',e=>{const t=e.target.closest&&e.target.closest('[data-tip]');if(!t){T.hidden=true;return}T.textContent=t.dataset.tip;T.hidden=false;place(e)});
 document.addEventListener('pointermove',e=>{if(!T.hidden)place(e)});const hideT=e=>{if(e.pointerType!=='mouse')T.hidden=true};document.addEventListener('pointerup',hideT);document.addEventListener('pointercancel',hideT);document.addEventListener('scroll',()=>{T.hidden=true;$$('.ov').forEach(o=>o.innerHTML='')},{passive:true,capture:true})}

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
 const R=await readHealth(new File([demoHealthXML()],'export.xml',{type:'text/xml'}),()=>{},S.set.sex);
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
  const R=await readHealthKit({from,sex:S.set.sex,onProgress:prog});
  if(!Object.keys(R.d).length){if(!inc)toast("Aucune donnée reçue d'Apple Santé. Vérifie l'accès : Réglages → Santé → Accès aux données et appareils → Carnet de santé.");return}
  applyHealth(R,inc);S.health.src='hk';S.health.sync=Date.now();put.health();
  if(!inc)toast(`Apple Santé connecté : ${Object.keys(R.d).length} jours lus.`);else if(!quiet)toast('Apple Santé à jour.')
 }catch(e){console.error(e);toast("Lecture d'Apple Santé impossible : "+String(e&&e.message||e))}
 finally{hkBusy=false;bar.hidden=true;renderSoft()}}
/* Textes et boutons propres à l'appli iOS */
function setupHK(){
 document.documentElement.classList.add('hk');
 const ch=$('#onb [data-go2="apple"]');ch.dataset.go2='hk';ch.querySelector('b').textContent='Connecter Apple Santé';ch.querySelector('small').textContent='Lecture seule : sommeil, cœur, activité, entraînements';
 const qa=$('#sheet [data-q="apple"]');qa.lastChild.textContent='Synchro Santé';
 $('#hkpanel').hidden=false;$('#impt').textContent="Importer un fichier d'export (facultatif)";$('#hkmsg').after($('#hstat'));
 addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&S.health.src==='hk'&&!S.set.demo&&Date.now()-(S.health.sync||0)>15*6e4)hkSync({quiet:true})})}

/* ---------- premier lancement ---------- */
const needOnb=()=>!S.set.onb&&!hKeys().length&&!S.sessions.length&&!Object.keys(S.days).length&&!S.med.length;
function showOnb(step=0){const o=$('#onb');o.hidden=false;document.documentElement.style.overflow='hidden';
 $$('#onb .ob').forEach(x=>x.hidden=+x.dataset.step!==step);$$('#onb .ob-dots i').forEach((x,i)=>x.classList.toggle('on',i===step));
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
async function saveBackup(){const name=`carnet-sante-${today()}.json`,file=new File([backupText()],name,{type:'application/json'});
 const mark=()=>{S.set.bk=today();put.set();renderSettings()};
 if(matchMedia('(pointer:coarse)').matches&&navigator.canShare&&navigator.canShare({files:[file]})){
  try{await navigator.share({files:[file],title:'Sauvegarde Carnet de santé'});mark();return}catch(e){if(e&&e.name==='AbortError')return}}
 const a=document.createElement('a');a.href=URL.createObjectURL(file);a.download=name;document.body.appendChild(a);a.click();a.parentNode.removeChild(a);setTimeout(()=>URL.revokeObjectURL(a.href),4000);
 mark();toast('Sauvegarde enregistrée : '+name)}
function resetAll(){mode='wiped';try{localStorage.removeItem(LS)}catch(e){}history.replaceState(null,'',location.pathname+location.search);location.reload()}

async function init(){
 if(new URLSearchParams(location.search).has('ios')){const m=await import('./healthkit-mock.js');useHealthProvider(m.healthKitMock)}
 HKN=hasHealthKit();if(HKN)setupHK();
 route();renderEditor();status('load');
 mode='local';lsLoad();bump();pend.splice(0).forEach(f=>f());status('local');resumeOnce();renderSoft();
 if(needOnb())showOnb(0);
 if(HKN&&S.health.src==='hk'&&!S.set.demo)hkSync({quiet:true});
 $('#appver').textContent='version '+__APP_VERSION__;
 /* Accès pour le simulateur iPhone (simulateur.html). */
 window.carnet={loadDemo,resetAll,hasRealData};
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
