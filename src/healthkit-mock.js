/* HealthKit simulé, pour tester l'appli iOS sur ordinateur (simulateur : « Mode appli iOS »).
   Il répond comme le module natif HealthSyncPlugin.swift, avec les mesures de montre du profil
   de démo. Ce fichier n'est chargé que dans le simulateur (adresse avec ?ios=1). */
import {demoHealthXML} from './demo.js';

const attr=(l,n)=>{const i=l.indexOf(' '+n+'="');if(i<0)return'';const s=i+n.length+3;return l.slice(s,l.indexOf('"',s))};
const sec=s=>Math.round(Date.parse(s.slice(0,10)+'T'+s.slice(11,19)+s.slice(20,23)+':'+s.slice(23,25))/1000);
const QT='HKQuantityTypeIdentifier';
const SLEEP={InBed:0,AsleepUnspecified:1,Awake:2,AsleepCore:3,AsleepDeep:4,AsleepREM:5};

/** Découpe un export Apple Santé en mesures au format du module natif (sans filtre de date). */
export function exportToNative(xml){
 const src=[],si=new Map(),o=n=>{if(!si.has(n)){si.set(n,src.length);src.push(n)}return si.get(n)};
 const q={},c={},hrMin=new Map(),w=[];let cw=null;
 for(const l of xml.split('\n')){
  if(l.includes('<Record ')){const t=attr(l,'type'),s=sec(attr(l,'startDate')),d=sec(attr(l,'endDate'))-s,so=o(attr(l,'sourceName'));
   if(t===QT+'HeartRate'){const m=Math.floor(s/60)*60,a=hrMin.get(m)||[0,0];a[0]+=+attr(l,'value');a[1]++;hrMin.set(m,a);continue}
   if(t.startsWith(QT)){const k=t.slice(QT.length),a=q[k]||(q[k]={s:[],d:[],v:[],o:[]});a.s.push(s);a.d.push(d);a.v.push(+attr(l,'value'));a.o.push(so);continue}
   const k=t==='HKCategoryTypeIdentifierSleepAnalysis'?'Sleep':t==='HKCategoryTypeIdentifierMindfulSession'?'Mind':null;if(!k)continue;
   const v=k==='Sleep'?SLEEP[attr(l,'value').replace('HKCategoryValueSleepAnalysis','')]:0;if(v==null)continue;
   const a=c[k]||(c[k]={s:[],d:[],v:[],o:[]});a.s.push(s);a.d.push(d);a.v.push(v);a.o.push(so);continue}
  if(l.includes('<Workout ')){const s=sec(attr(l,'startDate'));cw={ty:attr(l,'workoutActivityType').replace('HKWorkoutActivityType',''),s,d:sec(attr(l,'endDate'))-s,o:o(attr(l,'sourceName'))};w.push(cw);continue}
  if(cw&&l.includes('<WorkoutStatistics ')){const t=attr(l,'type');
   if(t===QT+'ActiveEnergyBurned')cw.kcal=Math.round(+attr(l,'sum'));
   else if(t===QT+'HeartRate'){cw.hr=Math.round(+attr(l,'average'));cw.mx=Math.round(+attr(l,'maximum'))}
   else if(/Distance/.test(t))cw.km=+attr(l,'sum');continue}
  if(l.includes('</Workout>'))cw=null}
 const hs=[...hrMin.keys()].sort((a,b)=>a-b);
 return {src,q,c,w,hr:{s:hs,v:hs.map(m=>{const[a,n]=hrMin.get(m);return Math.round(a/n*10)/10})}};
}

/** Garde les mesures qui commencent dans [start, end[ (comme le prédicat « strictStartDate »). */
export function sliceNative(all,start,end){
 const keep=a=>{const r={s:[],d:[],v:[],o:[]};for(let i=0;i<a.s.length;i++)if(a.s[i]>=start&&a.s[i]<end){r.s.push(a.s[i]);r.d.push(a.d[i]);r.v.push(a.v[i]);r.o.push(a.o[i])}return r};
 const q={},c={};for(const k in all.q){const r=keep(all.q[k]);if(r.s.length)q[k]=r}for(const k in all.c){const r=keep(all.c[k]);if(r.s.length)c[k]=r}
 const hr={s:[],v:[]};all.hr.s.forEach((t,i)=>{if(t>=start&&t<end){hr.s.push(t);hr.v.push(all.hr.v[i])}});
 return {src:all.src,q,c,hr,w:all.w.filter(x=>x.s>=start&&x.s<end)}}

let cache=null;
const data=()=>cache||(cache=exportToNative(demoHealthXML()));
const wait=ms=>new Promise(r=>setTimeout(r,ms));

export const healthKitMock={
 async isAvailable(){return{available:true}},
 async requestAuthorization(){
  // Imite la feuille d'autorisation d'iOS
  const ok=window.confirm('« Carnet de santé » souhaite accéder à tes données Santé (lecture seule).\n\nSimulation de la demande d\'autorisation d\'iOS : OK pour tout autoriser.');
  if(!ok)cache={src:[],q:{},c:{},w:[],hr:{s:[],v:[]}};else cache=null;
  return{shown:true}},
 async query({start,end}){await wait(60);return sliceNative(data(),start,end)},
};
