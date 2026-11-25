/* Données de démo : un profil fictif sur 60 jours, pour découvrir l'appli sans rien importer
   (et pour la revue App Store). Les mesures de la montre sont produites sous forme d'export
   Apple Santé, puis analysées par le même moteur que les vraies données : tous les écrans
   (scores, hypnogrammes, zones, tendances, analyses) se remplissent comme en vrai. */
import {addD,today,nid,appleDate} from './utils.js';
import {MEALS} from './constants.js';

const DAYS = 60;

// Générateur pseudo-aléatoire reproductible (mulberry32)
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pad = (n) => String(n).padStart(2, '0');
const fmt = appleDate;
const at = (ds, h, m = 0) => new Date(`${ds}T${pad(h)}:${pad(m)}:00`).getTime(); // heure locale
const MIN = 6e4;

/** Construit le texte d'un export Apple Santé fictif (export.xml). */
export function demoHealthXML(now = Date.now()) {
  const R = rng(20261125), rnd = (a, b) => a + R() * (b - a), gauss = () => (R() + R() + R() - 1.5) * 0.8;
  const W = 'Apple Watch', P = 'iPhone';
  const out = ['<?xml version="1.0" encoding="UTF-8"?>', '<HealthData locale="fr_FR">'];
  const rec = (type, src, a, b, v, unit = '') =>
    out.push(`<Record type="${type}" sourceName="${src}" unit="${unit}" startDate="${fmt(a)}" endDate="${fmt(b)}" value="${v}"/>`);
  const Q = 'HKQuantityTypeIdentifier';
  const t0 = today();
  let fatigue = 0, vo2 = 45.6, bw = 77.6;

  for (let i = DAYS; i >= 0; i--) {
    const D = addD(t0, -i), prev = addD(D, -1), wd = new Date(D + 'T12:00').getDay(); // 0 = dimanche
    const sick = i >= 19 && i <= 22, wkEnd = wd === 0 || wd === 6, sat = wd === 6;
    const party = wd === 0 && R() < 0.5; // samedi soir arrosé → nuit de dimanche moins bonne
    fatigue = fatigue * 0.7 + gauss() * 0.6;
    const rhr = 53 + fatigue * 1.5 + (sick ? 6 : 0) + (party ? 4 : 0);
    const hrv = 58 - fatigue * 5 - (sick ? 17 : 0) - (party ? 11 : 0) + gauss() * 4;

    // ---- nuit (de la veille au matin de D) ----
    const bed = at(prev, 23, 0) + (gauss() * 25 + (wkEnd ? 35 : 0) + (party ? 50 : 0)) * MIN;
    const target = (430 + gauss() * 30 + (wkEnd ? 25 : 0) - (party ? 40 : 0)) * MIN;
    const lat = rnd(6, 20) * MIN;
    let t = bed + lat, cyc = 0;
    const segs = [];
    while (t - bed - lat < target) {
      const deep = Math.max(0, [38, 26, 14, 6, 0][Math.min(cyc, 4)] + gauss() * 6);
      const rem = [10, 18, 24, 30, 34][Math.min(cyc, 4)] + gauss() * 5;
      for (const [code, m] of [['AsleepCore', rnd(15, 28)], ['AsleepDeep', deep], ['AsleepCore', rnd(8, 18)], ['AsleepREM', rem]]) {
        if (m < 2) continue;
        segs.push([code, t, t + m * MIN]); t += m * MIN;
      }
      if (R() < (sick ? 0.8 : 0.45)) { const m = rnd(2, sick ? 14 : 7); segs.push(['Awake', t, t + m * MIN]); t += m * MIN; }
      cyc++;
    }
    const wake = t;
    if (i > 0 || wake < now) {
      rec('HKCategoryTypeIdentifierSleepAnalysis', P, bed, wake + 4 * MIN, 'HKCategoryValueSleepAnalysisInBed');
      for (const [code, a, b] of segs) rec('HKCategoryTypeIdentifierSleepAnalysis', W, a, b, 'HKCategoryValueSleepAnalysis' + code);
      // FC nocturne toutes les 3 min : descend jusqu'au milieu de la nuit puis remonte
      const len = wake - bed;
      for (let x = bed; x < wake; x += 3 * MIN) {
        const p = (x - bed) / len, seg = segs.find(([, a, b]) => x >= a && x < b);
        const base = p < 0.45 ? rhr + 8 - 13 * (p / 0.45) : rhr - 5 + 7 * ((p - 0.45) / 0.55);
        const add = !seg ? 9 : seg[0] === 'Awake' ? 10 : seg[0] === 'AsleepREM' ? 4 : seg[0] === 'AsleepDeep' ? -2 : 0;
        rec(Q + 'HeartRate', W, x, x, Math.round(base + add + gauss() * 2), 'count/min');
      }
      for (let k = 0; k < 5; k++) { const x = bed + (k + 0.6) * len / 5.4; rec(Q + 'HeartRateVariabilitySDNN', W, x, x + MIN, (hrv + gauss() * 9).toFixed(1), 'ms'); }
      for (let k = 0; k < 4; k++) { const x = bed + (k + 0.5) * len / 4; rec(Q + 'RespiratoryRate', W, x, x + MIN, (14.2 + (sick ? 2.1 : 0) + gauss() * 0.5).toFixed(1), 'count/min'); }
      for (let k = 0; k < 4; k++) { const x = bed + (k + 0.4) * len / 4; rec(Q + 'OxygenSaturation', W, x, x, Math.min(1, 0.965 - (sick ? 0.012 : 0) + gauss() * 0.01).toFixed(3), '%'); }
      rec(Q + 'AppleSleepingWristTemperature', W, bed, wake, (36.18 + (sick ? 0.62 : 0) + (party ? 0.2 : 0) + gauss() * 0.09).toFixed(2), 'degC');
    }

    // ---- journée ----
    const end = Math.min(at(D, 23, 0), now);
    if (wake >= end) continue;
    const workouts = [];
    if (!sick) {
      if (wd === 1 || wd === 4) workouts.push({ ty: 'TraditionalStrengthTraining', a: at(D, 18, 30), min: Math.round(rnd(55, 70)), lo: 100, hi: 138, kcal: 330 });
      if (wd === 2 || (sat && R() < 0.9)) workouts.push({ ty: 'Running', a: at(D, sat ? 10 : 7, sat ? 0 : 15), min: Math.round(rnd(35, 55)), lo: 142, hi: 178, kcal: 0, run: true });
      if (wd === 0) workouts.push({ ty: 'Walking', a: at(D, 15, 0), min: Math.round(rnd(55, 85)), lo: 92, hi: 112, kcal: 0, walk: true });
      if (wd === 5 && R() < 0.6) workouts.push({ ty: 'Yoga', a: at(D, 19, 0), min: 30, lo: 80, hi: 98, kcal: 90 });
    }
    const inW = (x) => workouts.find((w) => x >= w.a && x < w.a + w.min * MIN);
    // FC de jour toutes les 5 min, chaque minute pendant les séances
    for (let x = wake + 5 * MIN; x < end; x += 5 * MIN) {
      if (inW(x)) continue;
      const h = new Date(x).getHours(), busy = (h >= 8 && h < 9) || (h >= 12 && h < 13) || (h >= 18 && h < 19);
      rec(Q + 'HeartRate', W, x, x, Math.round(rhr + 17 + (busy ? rnd(8, 30) : 0) + (sick ? 5 : 0) + gauss() * 6), 'count/min');
    }
    let exMin = 0;
    for (const w of workouts) {
      const b = w.a + w.min * MIN;
      if (b > now) continue;
      let mx = 0, s = 0, n = 0;
      for (let x = w.a; x < b; x += MIN) {
        const p = (x - w.a) / (b - w.a), warm = Math.min(1, p * 5);
        const v = Math.round(w.lo * 0.75 + (w.hi - w.lo * 0.75) * warm * (0.82 + 0.18 * Math.sin(p * 9)) + gauss() * 3);
        rec(Q + 'HeartRate', W, x, x, v, 'count/min'); mx = Math.max(mx, v); s += v; n++;
      }
      const km = w.run ? +(w.min / 5.6 * rnd(0.95, 1.05)).toFixed(2) : w.walk ? +(w.min / 13).toFixed(2) : 0;
      const kcal = w.kcal || Math.round(w.min * (w.run ? 11.5 : 4.5));
      out.push(`<Workout workoutActivityType="HKWorkoutActivityType${w.ty}" duration="${w.min}" durationUnit="min" sourceName="${W}" startDate="${fmt(w.a)}" endDate="${fmt(b)}">`);
      out.push(` <WorkoutStatistics type="${Q}ActiveEnergyBurned" startDate="${fmt(w.a)}" endDate="${fmt(b)}" sum="${kcal}" unit="kcal"/>`);
      out.push(` <WorkoutStatistics type="${Q}HeartRate" startDate="${fmt(w.a)}" endDate="${fmt(b)}" average="${Math.round(s / n)}" minimum="${w.lo - 20}" maximum="${mx}" unit="count/min"/>`);
      if (km) out.push(` <WorkoutStatistics type="${Q}DistanceWalkingRunning" startDate="${fmt(w.a)}" endDate="${fmt(b)}" sum="${km}" unit="km"/>`);
      out.push('</Workout>');
      if (km) { rec(Q + 'DistanceWalkingRunning', W, w.a, b, km, 'km'); rec(Q + 'StepCount', W, w.a, b, Math.round(km * (w.run ? 1250 : 1400)), 'count'); }
      rec(Q + 'ActiveEnergyBurned', W, w.a, b, kcal, 'kcal');
      if (w.ty !== 'Yoga') exMin += w.min;
      if (w.run) {
        rec(Q + 'HeartRateRecoveryOneMinute', W, b, b + MIN, Math.round(29 - fatigue * 2 + gauss() * 3), 'count/min');
        if (sat) { vo2 += rnd(0.05, 0.25); rec(Q + 'VO2Max', W, b, b, vo2.toFixed(1), 'mL/min·kg'); }
      }
    }
    // Pas, énergie, distance par tranches de 15 min
    const goal = sick ? 3200 : rnd(6500, 11500) * (wkEnd ? 0.85 : 1);
    let x = wake + 15 * MIN;
    const slots = [];
    for (; x < end; x += 15 * MIN) {
      const h = new Date(x).getHours();
      slots.push([x, (h >= 8 && h < 9) || (h >= 12 && h < 14) || (h >= 17 && h < 19) ? 3 : h >= 21 ? 0.3 : 1]);
    }
    const tot = slots.reduce((a, [, k]) => a + k, 0);
    for (const [x0, k] of slots) {
      if (inW(x0)) continue;
      const st = Math.round(goal * k / tot * rnd(0.4, 1.6));
      if (st > 5) { rec(Q + 'StepCount', P, x0, x0 + 15 * MIN, st, 'count'); rec(Q + 'DistanceWalkingRunning', P, x0, x0 + 15 * MIN, (st * 0.00074).toFixed(3), 'km'); }
      rec(Q + 'ActiveEnergyBurned', W, x0, x0 + 15 * MIN, (st * 0.04 + rnd(0.4, 1.6)).toFixed(1), 'kcal');
      if (k === 3 && st > 900) exMin += 5;
    }
    for (let h = 0; h < 24; h++) { const a = at(D, h); if (a < end) rec(Q + 'BasalEnergyBurned', W, a, a + 60 * MIN, (73 + gauss()).toFixed(1), 'kcal'); }
    for (let h = 8; h < 22; h++) { const a = at(D, h, 10); if (a < end && R() < 0.85) rec(Q + 'AppleStandTime', W, a, a + 5 * MIN, Math.round(rnd(2, 7)), 'min'); }
    if (exMin && end >= at(D, 21)) rec(Q + 'AppleExerciseTime', W, at(D, 21), at(D, 21, 1), exMin, 'min');
    const fl = Math.round(rnd(3, 14)); if (end >= at(D, 13)) rec(Q + 'FlightsClimbed', P, at(D, 12, 40), at(D, 12, 50), fl, 'count');
    rec(Q + 'RestingHeartRate', W, at(D, 8), at(D, 8), Math.round(rhr + 1), 'count/min');
    if (end >= at(D, 20)) rec(Q + 'WalkingHeartRateAverage', W, at(D, 20), at(D, 20), Math.round(rhr + 44 + gauss() * 3), 'count/min');
    for (const hh of [10, 16]) { const a = at(D, hh, 20); if (a < end) rec(Q + 'HeartRateVariabilitySDNN', W, a, a + MIN, (hrv - 9 + gauss() * 8).toFixed(1), 'ms'); }
    if (R() < 0.45 && end >= at(D, 22)) rec('HKCategoryTypeIdentifierMindfulSession', W, at(D, 22, 15), at(D, 22, 15 + Math.round(rnd(5, 12))), 'HKCategoryValueNotApplicable');
    // Pesée du matin (balance connectée)
    bw += -0.022 + gauss() * 0.05;
    if (R() < 0.6) {
      const a = wake + 15 * MIN;
      rec(Q + 'BodyMass', 'Balance', a, a, (bw + gauss() * 0.25).toFixed(1), 'kg');
      if (wd === 1) rec(Q + 'BodyFatPercentage', 'Balance', a, a, (0.172 - (DAYS - i) * 0.00018 + gauss() * 0.003).toFixed(3), '%');
    }
  }
  out.push('</HealthData>');
  return out.join('\n') + '\n';
}

/* ---------- saisies manuelles : séances de muscu, repas, check-ins, dossier ---------- */
const PLANS = [
  ['Haut du corps : poussée', [['Développé couché', 70, 8], ['Développé militaire', 40, 8], ['Dips', 0, 10], ['Élévations latérales', 10, 12], ['Extension triceps poulie', 25, 12]]],
  ['Haut du corps : tirage', [['Tractions', 0, 8], ['Rowing barre', 60, 8], ['Tirage vertical', 55, 10], ['Curl biceps', 14, 10], ['Curl marteau', 14, 12]]],
  ['Jambes', [['Squat', 85, 6], ['Soulevé de terre roumain', 80, 8], ['Presse à cuisses', 140, 10], ['Leg curl', 40, 12], ['Mollets debout', 60, 12]]],
];
const FOODS = {
  'Petit-déjeuner': [
    [{ n: "Flocons d'avoine 60 g", p: 8, g: 36, l: 4, k: 220 }, { n: 'Skyr 150 g', p: 15, g: 6, l: 0.3, k: 90 }, { n: 'Banane', p: 1, g: 23, l: 0.3, k: 100 }],
    [{ n: '3 œufs', p: 19, g: 1, l: 15, k: 220 }, { n: 'Pain complet 2 tranches', p: 7, g: 30, l: 2, k: 170 }],
  ],
  Déjeuner: [
    [{ n: 'Blanc de poulet 150 g', p: 35, g: 0, l: 3, k: 165 }, { n: 'Riz basmati 200 g cuit', p: 5, g: 56, l: 0.6, k: 260 }, { n: 'Légumes rôtis', p: 3, g: 15, l: 7, k: 135 }],
    [{ n: 'Saumon 140 g', p: 28, g: 0, l: 18, k: 280 }, { n: 'Pâtes complètes 200 g cuites', p: 11, g: 60, l: 2, k: 300 }],
    [{ n: 'Bowl quinoa, pois chiches, feta', p: 22, g: 58, l: 16, k: 470 }],
  ],
  Collation: [
    [{ n: 'Whey isolat (30 g)', p: 27, g: 1, l: 0.5, k: 110 }, { n: 'Pomme', p: 0.4, g: 19, l: 0.3, k: 80 }],
    [{ n: 'Amandes 30 g', p: 6, g: 6, l: 15, k: 175 }],
  ],
  Dîner: [
    [{ n: 'Steak haché 5 % 125 g', p: 26, g: 0, l: 6, k: 160 }, { n: 'Pommes de terre 250 g', p: 5, g: 43, l: 0.3, k: 195 }, { n: 'Haricots verts', p: 2, g: 7, l: 0.2, k: 35 }],
    [{ n: 'Lentilles corail 200 g cuites', p: 18, g: 40, l: 1, k: 230 }, { n: 'Yaourt grec', p: 9, g: 4, l: 10, k: 140 }],
    [{ n: 'Tofu sauté 150 g', p: 20, g: 4, l: 12, k: 200 }, { n: 'Nouilles de riz 180 g cuites', p: 3, g: 44, l: 0.5, k: 195 }],
  ],
};

/** Séances, journal (repas, eau, compléments, check-ins, mensurations) et dossier médical fictifs. */
export function demoManual(now = Date.now()) {
  const R = rng(4242), pick = (a) => a[Math.floor(R() * a.length)], t0 = today();
  const sessions = [], days = {}, med = [];
  let k = 0;
  for (let i = DAYS; i >= 0; i--) {
    const D = addD(t0, -i), wd = new Date(D + 'T12:00').getDay(), sick = i >= 19 && i <= 22;
    // Muscu lundi et jeudi, aux mêmes heures que les séances de la montre
    if ((wd === 1 || wd === 4) && !sick) {
      const start = new Date(D + 'T18:30').getTime();
      if (start + 70 * 6e4 < now) {
        const [name, ex] = PLANS[k % 3], prog = Math.floor(k / 3);
        sessions.push({
          id: nid(), name, date: D, t: start, dur: 60 + Math.round(R() * 10), rpe: 7 + Math.round(R() * 2),
          ex: ex.map(([n, w0, r]) => ({
            n,
            sets: Array.from({ length: n === 'Dips' || n === 'Tractions' ? 3 : 4 }, (_, s) => ({
              w: w0 ? Math.round((w0 + prog * (w0 >= 60 ? 2.5 : 1)) * 2) / 2 : 0,
              r: Math.max(4, r + (s === 0 ? 1 : 0) - (s === 3 ? 1 : 0) + (R() < 0.2 ? -1 : 0) + Math.min(2, prog >> 1)),
            })),
          })),
        });
        k++;
      }
    }
    const o = { items: [], bw: '' };
    // Repas sur les 21 derniers jours (aujourd'hui : seulement le petit-déjeuner)
    if (i <= 21 && !sick) {
      for (const m of MEALS) {
        if (i === 0 && m !== 'Petit-déjeuner') continue;
        if (m === 'Collation' && R() < 0.4) continue;
        for (const f of pick(FOODS[m])) o.items.push({ ...f, m });
      }
      o.w = i === 0 ? 500 : 1250 + Math.round(R() * 5) * 250;
      o.sup = R() < 0.85 ? ['Whey', 'Créatine'] : ['Créatine'];
    }
    // Check-in du soir (pas encore rempli aujourd'hui)
    if (i > 0 && i <= 45 && R() < 0.82) {
      const tags = [];
      if (sick) tags.push('Malade');
      if (wd === 6 && R() < 0.5) tags.push('Alcool');
      if (R() < 0.15) tags.push('Écrans tard');
      if (R() < 0.1) tags.push('Caféine tardive');
      if (wd === 3 && R() < 0.5) tags.push('Grosse journée');
      const low = sick || tags.includes('Grosse journée');
      o.j = {
        mood: low ? 2 + Math.round(R()) : 3 + Math.round(R() * 2),
        energy: sick ? 2 : 3 + Math.round(R() * 2) - (tags.includes('Écrans tard') ? 1 : 0),
        stress: tags.includes('Grosse journée') ? 4 : 1 + Math.round(R() * 2),
        sore: wd === 5 || wd === 2 ? 3 : 1 + Math.round(R()),
        note: sick ? 'Nez qui coule, gorge irritée' : '',
        tags,
      };
    }
    if (i % 14 === 3) o.m = { taille: +(84 - (DAYS - i) * 0.03).toFixed(1), poitrine: 101, bras: +(36 + (DAYS - i) * 0.008).toFixed(1), cuisse: 58, hanches: 97 };
    if (o.items.length || o.j || o.m || o.w) days[D] = o;
  }
  const m = (type, d, title, who = '', note = '', next = '') => med.push({ id: nid(), type, date: addD(t0, d), title, who, note, next: next === '' ? '' : addD(t0, next) });
  m('Analyse', -41, 'Bilan sanguin annuel', 'Laboratoire du centre', 'Ferritine, vitamine D et glycémie normales. LDL à surveiller.', 324);
  m('Note', -22, 'Rhume', '', 'Trois jours de repos, pas de sport.');
  m('Vaccin', -230, 'Rappel grippe', 'Pharmacie', '', 135);
  m('Rendez-vous', 12, 'Dentiste : détartrage', 'Dr Martin');
  m('Rendez-vous', 26, 'Kiné : genou droit', 'Cabinet Rive gauche', 'Apporter la radio');
  return { sessions, days, med };
}

/** Profil du compte de démo (complète seulement ce que l'utilisateur n'a pas déjà rempli). */
export const DEMO_PROFILE = { birth: 1991, sex: 'h', height: 178, goalw: 75, sups: ['Whey', 'Créatine'] };
