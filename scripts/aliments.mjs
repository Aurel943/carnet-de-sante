// Banque d'aliments : convertit la table Ciqual de l'ANSES (composition nutritionnelle des aliments,
// licence ouverte Etalab) en une table compacte embarquée dans l'appli : src/data/ciqual.json.
// Chaque ligne : [code Ciqual, nom, kcal, protéines, glucides, lipides], pour 100 g.
//
//   npm run aliments                      télécharge l'archive XML depuis ciqual.anses.fr
//   npm run aliments -- chemin/archive.zip  utilise une archive déjà téléchargée (« Table au format XML »)
//
// Puis : npm run build (et committer src/data/ciqual.json avec le reste).
import JSZip from 'jszip';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const out = fileURLToPath(new URL('../src/data/ciqual.json', import.meta.url));
const URLS = [
  'https://ciqual.anses.fr/cms/sites/default/files/inline-files/XML_2025_11_03.zip',
  'https://ciqual.anses.fr/cms/sites/default/files/inline-files/XML_2020_07_07.zip',
];

async function getZip() {
  const file = process.argv[2];
  if (file) return readFileSync(file);
  for (const u of URLS) {
    try {
      const r = await fetch(u);
      if (r.ok && /zip|octet/.test(r.headers.get('content-type') || '')) { console.log('Téléchargé : ' + u); return Buffer.from(await r.arrayBuffer()); }
      console.log(`${u} : ${r.status}`);
    } catch (e) { console.log(`${u} : ${e.message}`); }
  }
  throw new Error("Impossible de télécharger la table Ciqual. Télécharge « Table au format XML » sur https://ciqual.anses.fr (rubrique Téléchargement), puis : npm run aliments -- chemin/vers/l-archive.zip");
}

/* Les fichiers XML de Ciqual sont en windows-1252 (indiqué dans leur en-tête). */
const decode = (buf) => {
  const head = Buffer.from(buf.slice(0, 200)).toString('latin1');
  const enc = (/encoding="([^"]+)"/i.exec(head) || [])[1] || 'utf-8';
  return new TextDecoder(/1252|latin/i.test(enc) ? 'windows-1252' : enc).decode(buf);
};
const rows = (xml, tag) => [...xml.matchAll(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, 'g'))].map((m) => {
  const o = {};
  for (const f of m[1].matchAll(/<([\w]+)[^>]*>([\s\S]*?)<\/\1>/g)) o[f[1].toLowerCase()] = f[2].trim();
  return o;
});
/* Teneurs : « 12,5 », « < 0,5 » (compté 0), « traces » (0), « - » (inconnu) */
const val = (s) => {
  if (s == null) return null;
  s = String(s).trim().replace(',', '.');
  if (!s || s === '-') return null;
  if (/^traces?$/i.test(s) || s.startsWith('<')) return 0;
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
};
const r1 = (n) => (n == null ? null : Math.round(n * 10) / 10);

const zip = await JSZip.loadAsync(await getZip());
const files = Object.keys(zip.files);
const pick = (re) => { const f = files.find((n) => re.test(n.split('/').pop())); if (!f) throw new Error('Fichier introuvable dans l\'archive : ' + re); return f; };
const read = async (re) => decode(await zip.file(pick(re)).async('uint8array'));
const [alimX, compoX, constX] = await Promise.all([read(/^alim_[\d_]*\.xml$/i), read(/^compo_[\d_]*\.xml$/i), read(/^const_[\d_]*\.xml$/i)]);

/* Constituants retenus, reconnus par leur nom (les codes ont varié selon les éditions) */
const consts = rows(constX, 'CONST');
const find = (re) => { const c = consts.find((x) => re.test(x.const_nom_fr || '')); if (!c) throw new Error('Constituant introuvable : ' + re); return c.const_code; };
const C = {
  k: find(/^Energie, R.glement UE.*kcal/i),
  p: find(/^Prot.ines, N x facteur de Jones/i),
  g: find(/^Glucides \(g/i),
  l: find(/^Lipides \(g/i),
};
const want = new Map(Object.entries(C).map(([k, v]) => [v, k]));
const comp = new Map();
for (const r of rows(compoX, 'COMPO')) {
  const k = want.get(r.const_code);
  if (!k) continue;
  const o = comp.get(r.alim_code) || {};
  o[k] = val(r.teneur);
  comp.set(r.alim_code, o);
}
const table = [];
for (const a of rows(alimX, 'ALIM')) {
  const c = comp.get(a.alim_code) || {};
  const name = (a.alim_nom_fr || '').replace(/\s+/g, ' ').trim();
  if (!name || c.k == null) continue; // sans énergie connue, l'aliment ne sert pas au suivi
  table.push([+a.alim_code, name, Math.round(c.k), r1(c.p) ?? 0, r1(c.g) ?? 0, r1(c.l) ?? 0]);
}
table.sort((x, y) => x[1].localeCompare(y[1], 'fr'));
mkdirSync(fileURLToPath(new URL('../src/data/', import.meta.url)), { recursive: true });
writeFileSync(out, '[\n' + table.map((r) => JSON.stringify(r)).join(',\n') + '\n]\n');
console.log(`${table.length} aliments écrits dans src/data/ciqual.json`);
