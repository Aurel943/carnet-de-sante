/* Import Apple Santé : lecture en flux de export.zip / export.xml, analyse minute par minute.
   Tout est calculé dans le navigateur, rien n'est envoyé ailleurs. */
import {addD,today,num,avg,sdv,clamp} from './utils.js';

const at=(l,n)=>{const i=l.indexOf(' '+n+'="');if(i<0)return'';const s=i+n.length+3;return l.slice(s,l.indexOf('"',s))};
const pd=s=>Date.parse(s.slice(0,10)+'T'+s.slice(11,19)+(s.length>=25?s.slice(20,23)+':'+s.slice(23,25):''));
const rel=s=>((+s.slice(11,13)*60+ +s.slice(14,16))-720+1440)%1440;
const mi=s=>+s.slice(11,13)*60+ +s.slice(14,16);
const tsec=s=>{const m=/(\d{1,2}):(\d{2}):(\d{2})(?:[.,](\d+))?\s*([AaPp])?/.exec(s||'');if(!m)return null;let h=+m[1];if(m[5]){const pm=/p/i.test(m[5]);h=h===12?(pm?12:0):(pm?h+12:h)}return h*3600+ +m[2]*60+ +m[3]+(m[4]?+('0.'+m[4]):0)};
function rmssd(b,bp){let rr=[];if(b.length>=10){for(let i=1;i<b.length;i++){let d=b[i]-b[i-1];if(d<0)d+=86400;rr.push(d*1000)}}else if(bp.length>=10)rr=bp.map(x=>60000/x);else return null;
 const val=x=>x>=300&&x<=2000,ok=rr.map((x,i)=>{if(!val(x))return null;const w=rr.slice(Math.max(0,i-3),i+4).filter(val).sort((p,q)=>p-q),m=w[w.length>>1];return Math.abs(x-m)>0.45*m?null:x});
 const df=[];for(let i=1;i<ok.length;i++){const a=ok[i-1],c=ok[i];if(a==null||c==null)continue;df.push((c-a)**2)}
 const good=ok.filter(x=>x!=null);return df.length>=8?{v:Math.round(Math.sqrt(avg(df))*10)/10,q:good.length/rr.length,sd:Math.round(sdv(good)*10)/10}:null}
export function healthParser(cut,sex){
 const CHK=[],days={},mean={},lastv={},wk=[],slp={},QT='HKQuantityTypeIdentifier',HRB={},STB={},HV={},HVL={},RRS={},O2S={};let cw=null,ch=null,lastSd='';
 const KEEP=new Set(['StepCount','ActiveEnergyBurned','BasalEnergyBurned','AppleExerciseTime','DistanceWalkingRunning','FlightsClimbed','AppleStandTime','DietaryWater','RestingHeartRate','HeartRate','WalkingHeartRateAverage','HeartRateRecoveryOneMinute','HeartRateVariabilitySDNN','RespiratoryRate','OxygenSaturation','AppleSleepingWristTemperature','VO2Max','BodyMass','BodyFatPercentage']);
 const add=(d,k,s,v)=>{const o=days[d]||(days[d]={}),m=o[k]||(o[k]={});m[s]=(m[s]||0)+v};
 const mn=(d,k,v)=>{const o=mean[d]||(mean[d]={}),m=o[k]||(o[k]=[0,0]);m[0]+=v;m[1]++};
 const lv=(d,k,v)=>{(lastv[d]||(lastv[d]={}))[k]=v};
 const kc=(l,v)=>at(l,'unit')==='kJ'?v/4.184:v;
 const km=(u,v)=>u==='mi'?v*1.609:u==='m'?v/1000:u==='yd'?v*.0009144:v;
 const ml=(u,v)=>u==='L'?v*1000:u==='fl_oz_us'?v*29.57:u==='cL'?v*10:v;
 const hrb=d=>HRB[d]||(HRB[d]={s:new Float32Array(1440),c:new Uint16Array(1440)});
 const IB={};const night=(sd,d,asleep)=>{const hr=+sd.slice(11,13);if(asleep&&hr>=10&&hr<19)return null;if(!asleep&&hr>=14&&hr<19)return null;return hr>=19?addD(d,1):d};
 return{line(l){
  if(l.includes('<Record ')){const t0=at(l,'type');let t;
   if(t0.startsWith(QT)){t=t0.slice(QT.length);if(!KEEP.has(t))return}else if(t0==='HKCategoryTypeIdentifierSleepAnalysis')t='Sleep';else if(t0==='HKCategoryTypeIdentifierMindfulSession')t='Mind';else return;
   const sd=at(l,'startDate'),d=sd.slice(0,10);if(d<cut)return;if(sd>lastSd)lastSd=sd;const s=at(l,'sourceName'),v=num(at(l,'value')),u=at(l,'unit');
   switch(t){
    case'StepCount':{add(d,'st',s,v);const b=STB[d]||(STB[d]=new Float32Array(1440)),m0=mi(sd),ln=clamp(Math.round((pd(at(l,'endDate'))-pd(sd))/6e4),1,60);for(let k=0;k<ln&&m0+k<1440;k++)b[m0+k]+=v/ln;break}
    case'ActiveEnergyBurned':add(d,'ac',s,kc(l,v));break;
    case'BasalEnergyBurned':add(d,'bs',s,kc(l,v));break;
    case'AppleExerciseTime':add(d,'ex',s,v);break;
    case'DistanceWalkingRunning':add(d,'km',s,km(u,v));break;
    case'FlightsClimbed':add(d,'fl',s,v);break;
    case'AppleStandTime':add(d,'stt',s,u==='s'?v/60:v);break;
    case'DietaryWater':add(d,'wa',s,ml(u,v));break;
    case'RestingHeartRate':if(v>0)mn(d,'rhr',v);break;
    case'HeartRate':if(v>0){mn(d,'hr',v);const b=hrb(d),m=mi(sd);b.s[m]+=v;if(b.c[m]<65000)b.c[m]++}break;
    case'WalkingHeartRateAverage':if(v>0)mn(d,'whr',v);break;
    case'HeartRateRecoveryOneMinute':if(v>0)mn(d,'hrr',v);break;
    case'HeartRateVariabilitySDNN':if(v>0){mn(d,'hrv',v);(HVL[d]||(HVL[d]=[])).push([mi(sd),v,s]);const o=[pd(sd),v,null];(HV[d]||(HV[d]=[])).push(o);if(!l.trimEnd().endsWith('/>'))ch={o,b:[],bp:[]}}break;
    case'RespiratoryRate':if(v>0){mn(d,'rr',v);(RRS[d]||(RRS[d]=[])).push([pd(sd),v])}break;
    case'OxygenSaturation':if(v>0){const x=v<=1?v*100:v;mn(d,'o2',x);(O2S[d]||(O2S[d]=[])).push([pd(sd),x])}break;
    case'AppleSleepingWristTemperature':if(v)mn(at(l,'endDate').slice(0,10)||d,'tp',u==='degF'?(v-32)/1.8:v);break;
    case'VO2Max':if(v>0)lv(d,'vo2',v);break;
    case'BodyMass':if(v>0)lv(d,'bw',u==='lb'?v*.4536:v);break;
    case'BodyFatPercentage':if(v>0)lv(d,'bf',v<=1?v*100:v);break;
    case'Mind':{const m=(pd(at(l,'endDate'))-pd(sd))/6e4;if(m>0&&m<600)add(d,'mf',s,m);break}
    case'Sleep':{const val=at(l,'value'),asl=val.includes('Asleep'),awk=val.includes('Awake');if(val.includes('InBed')){const n=night(sd,d,false);if(n){const a=pd(sd);if(!IB[n]||a<IB[n])IB[n]=a}return}if(!asl&&!awk)return;const n=night(sd,d,asl);if(!n)return;
     const ed=at(l,'endDate'),a=pd(sd),b=pd(ed),m=(b-a)/6e4;if(!(m>0&&m<1440))return;const k=n+'|'+s;
     const o=slp[k]||(slp[k]={n,t:0,d:0,r:0,c:0,a:Infinity,b:-Infinity,as:'',bs:'',seg:[]});
     const code=awk?0:val.includes('REM')?1:val.includes('Core')?2:val.includes('Deep')?3:4;o.seg.push([a,b,code]);
     if(asl){o.t+=m;if(code===3)o.d+=m;else if(code===1)o.r+=m;else if(code===2)o.c+=m;if(a<o.a){o.a=a;o.as=sd}if(b>o.b){o.b=b;o.bs=ed}}}}
   return}
  if(ch){if(l.includes('<InstantaneousBeatsPerMinute')){const t=tsec(at(l,'time')),bp=num(at(l,'bpm'));if(t!=null)ch.b.push(t);if(bp)ch.bp.push(bp);return}if(l.includes('</Record>')){const r=rmssd(ch.b,ch.bp);if(r){ch.o[2]=r.v;ch.o[3]=r.q;ch.o[4]=r.sd;if(ch.o[1]>0)CHK.push(r.sd/ch.o[1])}ch=null;return}}
  if(l.includes('<Workout ')){const sd=at(l,'startDate'),d=sd.slice(0,10);if(d<cut){cw=null;return}let m=num(at(l,'duration'));const u=at(l,'durationUnit');if(u==='s'||u==='sec')m/=60;else if(u==='hr'||u==='h')m*=60;
   const dist=num(at(l,'totalDistance'));cw={d,st:mi(sd),ty:at(l,'workoutActivityType').replace('HKWorkoutActivityType',''),min:Math.round(m),kcal:Math.round(kc(l,num(at(l,'totalEnergyBurned')))),km:dist?Math.round(km(at(l,'totalDistanceUnit'),dist)*100)/100:0,hr:0};wk.push(cw);return}
  if(cw&&l.includes('<WorkoutStatistics ')){const t=at(l,'type');if(t===QT+'ActiveEnergyBurned')cw.kcal=Math.round(kc(l,num(at(l,'sum'))));else if(t===QT+'HeartRate'){cw.hr=Math.round(num(at(l,'average')));cw.mx0=Math.round(num(at(l,'maximum')))}else if(/Distance/.test(t)&&!cw.km)cw.km=Math.round(km(at(l,'unit'),num(at(l,'sum')))*100)/100;return}
  if(l.includes('</Workout>'))cw=null},
 result(){
  const out={},det={},LST={},mx=m=>Math.max(...Object.values(m)),g=d=>out[d]||(out[d]={}),dec={o2:1,rr:1,tp:2};
  for(const [d,o] of Object.entries(days)){const e=g(d);for(const k of ['st','ac','bs','ex','fl','stt','wa','mf'])if(o[k])e[k]=Math.round(mx(o[k]));if(o.km)e.km=Math.round(mx(o.km)*10)/10}
  for(const [d,o] of Object.entries(mean))for(const [k,[s,c]] of Object.entries(o)){const p=10**(dec[k]||0);g(d)[k]=Math.round(s/c*p)/p}
  {const cutL=addD(today(),-35);for(const [d,l] of Object.entries(HVL)){l.sort((a,b)=>a[0]-b[0]);const srcs=[...new Set(l.map(x=>x[2]))];g(d).hvn=l.length;if(srcs.length>1)g(d).hvsrc=srcs.map(n=>{const v=l.filter(x=>x[2]===n).map(x=>x[1]);return[n,Math.round(avg(v)),v.length]});if(d>=cutL)LST[d]={hs:srcs,hl:l.map(([m,v,n])=>[m,Math.round(v*10)/10,srcs.indexOf(n)])}}}
  for(const [d,o] of Object.entries(lastv))for(const [k,v] of Object.entries(o))g(d)[k]=Math.round(v*10)/10;
  const hrAt=(d,m)=>{if(m>=1440){d=addD(d,1);m-=1440}if(m<0){d=addD(d,-1);m+=1440}const b=HRB[d];return b&&b.c[m]?b.s[m]/b.c[m]:0};
  const each=(d,m0,len,f)=>{for(let k=0;k<len;k++){let dd=d,m=m0+k;while(m>=1440){dd=addD(dd,1);m-=1440}f(dd,m,hrAt(dd,m),k)}};
  // FC max : d'après les entraînements
  let hmax=0;for(const w of wk){each(w.d,w.st,w.min,(dd,m,v)=>{if(v>hmax)hmax=v});if(w.mx0>hmax)hmax=w.mx0}
  if(!hmax){for(const b of Object.values(HRB))for(let m=0;m<1440;m++)if(b.c[m]){const v=b.s[m]/b.c[m];if(v>hmax)hmax=v}}
  hmax=Math.round(clamp(hmax||195,150,215));
  // sommeil
  const best={};for(const o of Object.values(slp))if(o.t>0&&(!best[o.n]||o.t>best[o.n].t))best[o.n]=o;
  const sleepMin={},cutDet=addD(today(),-35);let anyRm=false;for(const [k,v] of Object.entries(LST))Object.assign(det[k]||(det[k]={}),v);
  for(const [n,o] of Object.entries(best)){const e=g(n),win=(o.b-o.a)/6e4;e.sl=Math.round(o.t);if(o.d)e.sd=Math.round(o.d);if(o.r)e.sr=Math.round(o.r);if(o.c)e.sc=Math.round(o.c);e.sb=rel(o.as);e.sw=rel(o.bs);let bedA=o.a;if(IB[n]&&IB[n]<=o.a){const lt=(o.a-IB[n])/6e4;if(lt<180){e.lat=Math.round(lt);bedA=IB[n]}}const bedW=(o.b-bedA)/6e4;if(bedW>0)e.ef=Math.round(Math.min(1,o.t/bedW)*100)/100;
   const segs=o.seg.slice().sort((x,y)=>x[0]-y[0]);let wu=0,lastEnd=null;for(const [a,b,cd] of segs){if(cd===0||a<o.a-6e4||a>o.b)continue;if(lastEnd!=null&&a-lastEnd>=3*6e4)wu++;lastEnd=Math.max(lastEnd||0,b)}e.wu=wu;
   const d0=o.as.slice(0,10),m0=mi(o.as),len=Math.round(win);const hs=[],blk={};each(d0,m0,len,(dd,m,v,k)=>{(sleepMin[dd]||(sleepMin[dd]=new Uint8Array(1440)))[m]=1;if(v){hs.push(v);const q=k/10|0;(blk[q]||(blk[q]=[])).push(v)}});
   if(hs.length>=10){e.nhr=Math.round(avg(hs));const bl=Object.values(blk),b2=bl.filter(x=>x.length>=2),use=b2.length>=6?b2:bl;e.nmin=Math.round(Math.min(...use.map(avg)))}
   const hvs=[...(HV[n]||[]),...(HV[addD(n,-1)]||[])].filter(([t])=>t>=o.a&&t<=o.b);if(hvs.length){e.nhv=Math.round(avg(hvs.map(x=>x[1])));e.nhn=hvs.length}const rms=hvs.filter(x=>x[2]!=null&&x[3]>=0.6);
   {const inW=a=>[...(a[n]||[]),...(a[addD(n,-1)]||[])].filter(([t])=>t>=o.a&&t<=o.b).map(x=>x[1]);const r1=inW(RRS),o1=inW(O2S);if(r1.length)e.rr=Math.round(avg(r1)*10)/10;if(o1.length)e.o2=Math.round(avg(o1)*10)/10}if(rms.length){e.nrm=Math.round(avg(rms.map(x=>x[2])));const sc=rms.filter(x=>x[4]>0);if(sc.length)e.nsc=Math.round(avg(sc.map(x=>x[4])));e.nrq=Math.round(avg(rms.map(x=>x[3]))*100);anyRm=true}
   if(n>=cutDet){const r0_=rel(o.as),R=t=>Math.round(r0_+(t-o.a)/6e4),x=det[n]||(det[n]={});
    x.hy=segs.filter(([a,b])=>b>=o.a-30*6e4&&a<=o.b+30*6e4).map(([a,b,cd])=>[R(a),R(b),cd]);
    const nh=[];for(let k=-30;k<len+30;k+=5){const v=[];each(d0,m0+k,5,(dd,m,hv)=>{if(hv)v.push(hv)});nh.push(v.length?Math.round(avg(v)):0)}x.nh=nh;x.nh0=r0_-30;
    x.nv=hvs.map(([t,v,rm])=>[R(t),Math.round(v),rm?Math.round(rm):0])}}
  // entraînements : zones, TRIMP
  const restOf=d=>num((mean[d]||{}).rhr&&mean[d].rhr[0]/mean[d].rhr[1])||60;
  const [ka,kb]=sex==='f'?[0.86,1.67]:[0.64,1.92],trimp=(v,rest)=>{const r=(v-rest)/(hmax-rest);return r>0.3?r*ka*Math.exp(kb*r):0};
  const wkMin={};
  for(const w of wk){const z=[0,0,0,0,0],rest=restOf(w.d);let t=0,mxv=0;each(w.d,w.st,w.min,(dd,m,v)=>{(wkMin[dd]||(wkMin[dd]=new Uint8Array(1440)))[m]=1;if(!v)return;const p=v/hmax;const zi=p<.6?0:p<.7?1:p<.8?2:p<.9?3:4;if(p>=.5)z[zi]++;t+=trimp(v,rest);if(v>mxv)mxv=v});
   w.z=z;w.tr=Math.round(t);w.mx=Math.round(mxv)||w.mx0||0}
  // charge cardiaque du jour, stress estimé
  for(const [d,b] of Object.entries(HRB)){const rest=restOf(d),e=g(d);let t=0;for(let m=0;m<1440;m++)if(b.c[m])t+=trimp(b.s[m]/b.c[m],rest);e.tr=Math.round(t);
   const sm=sleepMin[d],wm=wkMin[d],st=STB[d],hrs=new Array(24).fill(0),tot=new Array(24).fill(0);let el=0,n=0;const thr=rest+0.25*(hmax-rest);
   for(let m=0;m<1440;m++){if(!b.c[m]||(sm&&sm[m]))continue;let nearW=false;if(wm)for(let k=Math.max(0,m-10);k<=Math.min(1439,m+10);k++)if(wm[k]){nearW=true;break}if(nearW)continue;
    let steps=0;if(st)for(let k=Math.max(0,m-3);k<=Math.min(1439,m+3);k++)steps+=st[k];if(steps>=40)continue;
    const v=b.s[m]/b.c[m],hh=m/60|0;n++;tot[hh]++;if(v>thr){el++;hrs[hh]++}}
   if(n>=20)e.stz=Math.round(el/n*100);
   {let s2=0,c2=0;for(let m=0;m<1440;m++){if(!b.c[m]||(sm&&sm[m])||(wm&&wm[m]))continue;s2+=b.s[m]/b.c[m];c2++}if(c2>=20)e.hwa=Math.round(s2/c2)}
   if(d>=cutDet){const x=det[d]||(det[d]={});x.h=Array.from({length:96},(_,i)=>{let s=0,c=0;for(let m=i*15;m<i*15+15;m++)if(b.c[m]){s+=b.s[m]/b.c[m];c++}return c?Math.round(s/c):0});x.sh=hrs.map((v,i)=>tot[i]>=2?Math.round(v/tot[i]*100):0)}}
  for(const n of Object.keys(best)){const e=out[n],p=out[addD(n,-1)];if(e&&e.nhr&&p&&p.hwa)e.dip=Math.round((1-e.nhr/p.hwa)*100)}
  for(const w of wk){const o={ty:w.ty,st:w.st,min:w.min,kcal:w.kcal};if(w.km)o.km=w.km;if(w.hr)o.hr=w.hr;if(w.mx)o.mx=w.mx;if(w.tr)o.tr=w.tr;if(w.z.some(Boolean))o.z=w.z;(g(w.d).wk||(g(w.d).wk=[])).push(o)}
  const cs=CHK.slice().sort((a,b)=>a-b);return{d:out,det,last:lastSd,hmax,rm:anyRm,chk:cs.length?{med:cs[cs.length>>1],n:cs.length}:null}}}}
async function loadZip(){const m=await import('jszip');return m.default||m}
export async function readHealth(file,prog,sex){
 const P=healthParser(addD(today(),-395),sex),dec=new TextDecoder();let buf='';
 const feed=ch=>{buf+=dec.decode(ch,{stream:true});let st=0,i;while((i=buf.indexOf('\n',st))>=0){P.line(buf.slice(st,i));st=i+1}buf=buf.slice(st)};
 if(/\.zip$/i.test(file.name)||file.type.includes('zip')){
  const Z=await loadZip(),zip=await Z.loadAsync(file);
  const xs=Object.values(zip.files).filter(z=>!z.dir&&/\.xml$/i.test(z.name)&&!/cda/i.test(z.name)&&!/__MACOSX/.test(z.name));
  const f=xs.find(z=>/(^|\/)(export|exportation)\.xml$/i.test(z.name))||xs[0];if(!f)throw new Error('no xml');
  await new Promise((res,rej)=>f.internalStream('uint8array').on('data',(d,m)=>{feed(d);prog(m.percent*.95)}).on('error',rej).on('end',res).resume());
 }else{const r=file.stream().getReader();let n=0;for(;;){const {done,value}=await r.read();if(done)break;feed(value);n+=value.length;prog(n/file.size*95)}}
 buf+=dec.decode();if(buf)P.line(buf);prog(97);await new Promise(r=>setTimeout(r,30));return P.result()}
