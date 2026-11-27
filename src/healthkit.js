/* Lecture directe d'Apple Santé (HealthKit) dans l'appli iOS.
   Le module natif (ios/App/App/HealthSyncPlugin.swift) renvoie les mesures brutes ; elles sont
   converties ici au format de l'export Apple Santé, puis passées au même analyseur que les
   fichiers d'export : scores, nuits, zones et tendances sont calculés exactement de la même façon. */
import {Capacitor,registerPlugin} from '@capacitor/core';
import {healthParser} from './health-import.js';
import {addD,today,appleDate} from './utils.js';

const Native=registerPlugin('HealthSync');
let mock=null;

/** Remplace le module natif (simulateur : HealthKit simulé). */
export function useHealthProvider(p){mock=p}
/** Vrai dans l'appli iOS (ou dans le simulateur en mode iOS). */
export const hasHealthKit=()=>!!mock||(Capacitor.isNativePlatform()&&Capacitor.isPluginAvailable('HealthSync'));
const api=()=>mock||Native;

/** Affiche la demande d'autorisation d'iOS (une seule fois : ensuite, c'est dans Réglages → Santé). */
export async function authorizeHealth(){const r=await api().isAvailable();if(!r.available)throw new Error('Apple Santé n\'est pas disponible sur cet appareil.');await api().requestAuthorization()}

const QT='HKQuantityTypeIdentifier';
// Unités renvoyées par le module natif, telles qu'elles figurent dans l'export
const UNIT={StepCount:'count',ActiveEnergyBurned:'kcal',BasalEnergyBurned:'kcal',AppleExerciseTime:'min',DistanceWalkingRunning:'km',FlightsClimbed:'count',AppleStandTime:'min',DietaryWater:'mL',RestingHeartRate:'count/min',WalkingHeartRateAverage:'count/min',HeartRateRecoveryOneMinute:'count/min',HeartRateVariabilitySDNN:'ms',RespiratoryRate:'count/min',OxygenSaturation:'%',AppleSleepingWristTemperature:'degC',VO2Max:'mL/min·kg',BodyMass:'kg',BodyFatPercentage:'%'};
// HKCategoryValueSleepAnalysis : 0 au lit, 1 endormi (non détaillé), 2 éveil, 3 léger, 4 profond, 5 paradoxal
const SLEEP=['InBed','AsleepUnspecified','Awake','AsleepCore','AsleepDeep','AsleepREM'];
const clean=s=>String(s??'').replace(/["<>&]/g,'');

/** Convertit une réponse du module natif en lignes au format de l'export Apple Santé. */
export function* exportLines(r){
 const src=(r.src||[]).map(clean),D=s=>appleDate(s*1000),rec=(type,o,s,d,v,unit='')=>`<Record type="${type}" sourceName="${src[o]??''}" unit="${unit}" startDate="${D(s)}" endDate="${D(s+d)}" value="${v}"/>`;
 for(const [name,a] of Object.entries(r.q||{}))for(let i=0;i<a.s.length;i++)yield rec(QT+name,a.o[i],a.s[i],a.d[i],a.v[i],UNIT[name]||'');
 const h=r.hr||{s:[],v:[]};for(let i=0;i<h.s.length;i++)yield `<Record type="${QT}HeartRate" sourceName="HealthKit" unit="count/min" startDate="${D(h.s[i])}" endDate="${D(h.s[i])}" value="${h.v[i]}"/>`;
 const sl=(r.c||{}).Sleep;if(sl)for(let i=0;i<sl.s.length;i++){const k=SLEEP[sl.v[i]];if(k)yield rec('HKCategoryTypeIdentifierSleepAnalysis',sl.o[i],sl.s[i],sl.d[i],'HKCategoryValueSleepAnalysis'+k)}
 const mf=(r.c||{}).Mind;if(mf)for(let i=0;i<mf.s.length;i++)yield rec('HKCategoryTypeIdentifierMindfulSession',mf.o[i],mf.s[i],mf.d[i],'HKCategoryValueNotApplicable');
 for(const w of r.w||[]){const a=D(w.s),b=D(w.s+w.d),min=Math.round(w.d/6)/10;
  yield `<Workout workoutActivityType="HKWorkoutActivityType${clean(w.ty)}" duration="${min}" durationUnit="min"${w.km?` totalDistance="${w.km}" totalDistanceUnit="km"`:''}${w.kcal?` totalEnergyBurned="${w.kcal}" totalEnergyBurnedUnit="kcal"`:''} sourceName="${src[w.o]??''}" startDate="${a}" endDate="${b}">`;
  if(w.hr)yield ` <WorkoutStatistics type="${QT}HeartRate" startDate="${a}" endDate="${b}" average="${w.hr}" maximum="${w.mx||w.hr}" unit="count/min"/>`;
  yield '</Workout>'}}

/**
 * Pendant une séance : la fréquence cardiaque et les calories actives au fil de l'eau.
 * Apple Santé prévient dès qu'une mesure arrive sur l'iPhone (requête ouverte du module natif) ;
 * `onSample({ k: 'hr' | 'kcal', samples: [{ t, e, v }] })` est appelé à chaque arrivée.
 * Avec un module natif d'avant cette fonction, relecture toutes les 15 s en secours.
 * Renvoie une fonction qui arrête tout.
 */
export async function startLiveHealth(since,onSample){const a=api();
 try{const h=await a.addListener('live',onSample);await a.startLive({since});
  return()=>{try{a.stopLive()}catch(e){/* déjà arrêté */}try{h.remove()}catch(e){/* déjà retiré */}}}
 catch(e){
  let stopped=false,from=since;const poll=async()=>{if(stopped)return;try{const now=Math.floor(Date.now()/1000),r=await a.query({start:from,end:now});
   const h=r.hr||{s:[],v:[]};if(h.s.length)onSample({k:'hr',samples:h.s.map((t,i)=>({t,e:t+60,v:h.v[i]}))});
   const k=(r.q||{}).ActiveEnergyBurned;if(k&&k.s.length)onSample({k:'kcal',samples:k.s.map((t,i)=>({t,e:t+k.d[i],v:k.v[i]}))});
   from=Math.max(since,now-300)}catch(err){/* on réessaiera */}};
  poll();const id=setInterval(poll,15000);return()=>{stopped=true;clearInterval(id)}}}

/**
 * Lit Apple Santé depuis le jour `from` (AAAA-MM-JJ) jusqu'à maintenant, par périodes de 30 jours.
 * Renvoie le résultat de l'analyseur (même forme qu'un import de fichier), avec `from`.
 */
export async function readHealthKit({from=addD(today(),-395),sex='',age=null,onProgress=()=>{}}={}){
 const P=healthParser(from,sex,age),t0=new Date(from+'T00:00').getTime()/1000,t1=Math.floor(Date.now()/1000),step=30*86400,n=Math.max(1,Math.ceil((t1-t0)/step));
 let k=0,count=0;
 for(let a=t0;a<t1;a+=step){
  const r=await api().query({start:a,end:Math.min(a+step,t1)});
  for(const l of exportLines(r)){P.line(l);count++}
  onProgress(++k/n*95);await new Promise(res=>setTimeout(res,0))}
 onProgress(97);await new Promise(res=>setTimeout(res,20));
 return {...P.result(),from,count}}
