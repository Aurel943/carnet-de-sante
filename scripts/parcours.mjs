// Tests de parcours : l'appli est ouverte comme sur un iPhone et parcourue comme le ferait
// quelqu'un, du premier lancement aux rituels. Toute erreur JavaScript fait échouer le test.
//
// Lancer :  npm run parcours      (le serveur de dev est lancé automatiquement)
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
const server = await createServer({ root, logLevel: 'error', server: { port: 5198, strictPort: false } });
await server.listen();
const url = server.resolvedUrls.local[0];
const browser = await chromium.launch();
let ok = 0, ko = 0;
const errs = [];

async function step(name, fn) {
  try { await fn(); ok++; console.log('  ✓ ' + name); }
  catch (e) { ko++; console.log('  ✗ ' + name + '\n      ' + String(e && e.message || e).split('\n')[0]); }
}
const expect = (cond, msg) => { if (!cond) throw new Error(msg); };

async function phone(theme, hour) {
  const ctx = await browser.newContext({
    viewport: { width: 393, height: 852 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true,
    colorScheme: theme, locale: 'fr-FR', timezoneId: 'Europe/Paris', acceptDownloads: true,
  });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errs.push(`[${theme} ${hour} h] ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errs.push(`[${theme} ${hour} h] ${m.text()}`); });
  const d = new Date(); d.setHours(hour, 5, 0, 0);
  await page.clock.setFixedTime(d);
  await page.goto(url);
  return { ctx, page };
}
const visible = (page, sel) => page.isVisible(sel);
const text = (page, sel) => page.textContent(sel).then((t) => (t || '').trim());
/* change d'onglet et attend que la vue soit affichée (le briefing éventuel est refermé d'abord) */
async function tab(page, h) {
  if (await page.isVisible('#brief')) { await page.click('[data-act="briefok"]'); await page.waitForSelector('#brief', { state: 'hidden' }); }
  await page.click(`#tabs a[href="#${h}"]`);
  await page.waitForSelector(`#v-${h}:not([hidden])`);
}
/* recharge l'appli et laisse le briefing du matin s'ouvrir s'il doit le faire */
async function reload(page) { await page.reload(); await page.waitForTimeout(800); }

try {
  for (const [theme, hour] of [['light', 8], ['dark', 21]]) {
    console.log(`\nParcours en mode ${theme === 'light' ? 'clair, le matin' : 'sombre, le soir'}`);
    const { ctx, page } = await phone(theme, hour);

    await step('premier lancement : accueil avec un matin en aperçu', async () => {
      await page.waitForSelector('#onb:not([hidden])');
      expect(await page.$$eval('#obg svg', (a) => a.length) === 3, 'les trois jauges d\'exemple manquent');
      await page.click('#onb [data-act="onb"][data-to="1"]');
      await page.click('#onb [data-act="onb"][data-to="2"][data-skip]');
      await page.click('#onb [data-go2="empty"]');
      await page.waitForSelector('#onb', { state: 'hidden' });
      expect(/commence ici/.test(await text(page, '#dtitle')), 'titre du jour sans données inattendu');
    });

    await step('données de démo : titre du jour, plan, zone de dépense, action', async () => {
      await page.evaluate(() => window.carnet.loadDemo());
      await page.waitForFunction(() => document.querySelector('#plan li'), null, { timeout: 30000 });
      expect((await text(page, '#dtitle')).length > 3, 'pas de titre du jour');
      expect((await text(page, '#dlede')).length > 20, 'pas de phrase du jour');
      expect(await page.$('#g3 .gz'), 'la zone conseillée n\'est pas dessinée sur la jauge Dépense');
      expect(await page.$('#heroact .btn.pri'), 'pas d\'action principale');
      expect(await page.$$eval('#g3 .gu', (a) => a.map((x) => x.textContent).join(' ')) === '/100 % /100', 'unités des jauges incohérentes');
    });

    await step('barre d\'onglets : Résumé, Sommeil, Dépense, Tendances, Plus', async () => {
      const labels = await page.$$eval('#tabs a', (a) => a.filter((x) => x.offsetParent).map((x) => x.innerText.trim()));
      expect(labels.join('|') === 'Résumé|Sommeil|Dépense|Tendances|Plus', 'onglets visibles : ' + labels.join(', '));
      for (const [h, vd] of [['sommeil', '#vd-s14'], ['effort', '#vd-heat'], ['tendances', '#vd-mk'], ['plus', null]]) {
        await tab(page, h);
        if (vd) expect((await text(page, vd)).length > 10, `pas de conclusion en tête de carte (${vd})`);
      }
    });

    await step('Énergie : depuis la jauge du Résumé, puis retour', async () => {
      await tab(page, 'aujourdhui');
      await page.click('#g3 [data-go="recuperation"]');
      await page.waitForSelector('#v-recuperation:not([hidden])');
      expect(await visible(page, '#dback'), 'bouton « ‹ Résumé » absent');
      expect(await page.$eval('#tabs a[href="#aujourdhui"]', (a) => a.classList.contains('sub-on')), 'Résumé non surligné');
      await page.click('#dback');
      await page.waitForSelector('#v-aujourdhui:not([hidden])');
    });

    await step('analyse détaillée : repliée, dépliée, gardée après rechargement', async () => {
      await tab(page, 'effort');
      expect(!(await visible(page, '#v-effort .panel:has(#fl)')), 'la charge devrait être repliée');
      await page.click('#v-effort .deep');
      expect(await visible(page, '#v-effort .panel:has(#fl)'), 'la charge ne s\'affiche pas');
      await reload(page); await page.waitForSelector('#v-effort:not([hidden])');
      expect(await visible(page, '#v-effort .panel:has(#fl)'), 'le choix n\'est pas gardé');
      if (await visible(page, '#brief')) await page.click('[data-act="briefok"]');
      await page.click('#v-effort .deep');
    });

    await step('check-in depuis le Résumé', async () => {
      await tab(page, 'aujourdhui');
      const b = await page.$('#heroact [data-act="ciopen"]');
      if (b) {
        await b.click();
        await page.waitForSelector('#msheet:not([hidden])');
        await page.click('[data-act="jset"][data-k="mood"][data-v="4"]');
        await page.click('#msr [data-act="msclose"]');
        await page.waitForSelector('#msheet', { state: 'hidden' });
        await page.waitForTimeout(250);
        expect(!(await page.$('#heroact [data-act="ciopen"]')), 'le check-in fait reste proposé');
      }
    });

    await step('séance avec un record : célébration', async () => {
      await page.click('.tplus');
      await page.click('#sheet [data-q="mu"]');
      await page.waitForSelector('#msheet:not([hidden])');
      await page.fill('#nn', 'Test');
      await page.click('[data-act="start"]');
      await page.fill('.exn', 'Développé couché');
      await page.press('.exn', 'Tab');
      await page.fill('.ex[data-i="0"] input[data-f="w"][data-s="0"]', '200');
      await page.fill('.ex[data-i="0"] input[data-f="r"][data-s="0"]', '5');
      await page.press('.ex[data-i="0"] input[data-f="r"][data-s="0"]', 'Tab');
      await page.click('.foot [data-act="finish"]');
      await page.waitForSelector('#cele.on', { timeout: 4000 });
      expect(/record/i.test(await text(page, '#cet')), 'pas de célébration de record');
      await page.click('#cele');
    });

    await step('image de la semaine à partager', async () => {
      await tab(page, 'tendances');
      expect(await visible(page, '#recap'), 'carte de la semaine absente');
      const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 8000 }), page.click('[data-act="share"]')]);
      expect(/arden-semaine-.*\.png$/.test(dl.suggestedFilename()), 'nom de fichier inattendu');
    });

    if (hour < 12) {
      await step('briefing du matin : une fois par jour, à l\'ouverture', async () => {
        await page.evaluate(() => { const k = 'carnet-muscu-v1', d = JSON.parse(localStorage.getItem(k)); delete d.set.brief; localStorage.setItem(k, JSON.stringify(d)); });
        await page.reload();
        await page.waitForSelector('#brief:not([hidden])', { timeout: 4000 });
        expect((await text(page, '#brt')).length > 3, 'briefing sans titre');
        await page.click('[data-act="briefok"]');
        await page.waitForSelector('#brief', { state: 'hidden' });
        await reload(page);
        expect(!(await visible(page, '#brief')), 'le briefing revient le même jour');
      });
    } else {
      await step('le soir : « Prépare ta nuit » ou carte du coucher', async () => {
        await tab(page, 'aujourdhui');
        const t = await text(page, '#dtitle'), r = await text(page, '#ritual');
        expect(/nuit|heure|Au lit/.test(t + r) || r === '', 'rituel du soir incohérent : ' + t);
        expect(!/Bouge : vise/.test(await text(page, '#plan')), 'le plan pousse à bouger le soir');
      });
    }
    await ctx.close();
  }

  console.log('\nParcours en grande taille de texte (Dynamic Type)');
  for (const dt of [1.35, 1.6]) {
    const ctx = await browser.newContext({ viewport: { width: 375, height: 667 }, isMobile: true, hasTouch: true, locale: 'fr-FR', timezoneId: 'Europe/Paris' });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errs.push(`[texte ×${dt}] ${e.message}`));
    await page.goto(url + '?dt=' + dt);
    await step(`texte ×${dt} : tout suit la taille, rien ne déborde`, async () => {
      const fs = await page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).fontSize));
      expect(Math.abs(fs - 16 * dt) < 0.1, `taille racine ${fs} px au lieu de ${16 * dt}`);
      await page.evaluate(() => window.carnet.loadDemo());
      await page.waitForFunction(() => document.querySelector('#plan li'), null, { timeout: 30000 });
      for (const h of ['aujourdhui', 'sommeil', 'recuperation', 'effort', 'tendances', 'nutrition', 'plus']) {
        await page.evaluate((x) => { location.hash = x; }, h);
        await page.waitForSelector(`#v-${h}:not([hidden])`);
        const over = await page.evaluate(() => {
          const W = document.documentElement.clientWidth;
          return [...document.querySelectorAll('.view:not([hidden]) *')]
            .filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.right > W + 1 && !e.closest('.scroll,.seg,#favs,.fig,.chips'); })
            .slice(0, 3).map((e) => e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') + '.' + String(e.className).split(' ')[0]);
        });
        expect(!over.length, `${h} : ${over.join(', ')} dépasse de l'écran`);
      }
    });
    await ctx.close();
  }

  /* ---------- repas : banque d'aliments et scan ---------- */
  console.log('\nParcours repas : recherche, scan, produit inconnu');
  {
    /* caméra simulée : une vidéo (Y4M) qui filme le code-barres EAN-13 de la pâte à tartiner 3017620422003 */
    const cam = join(tmpdir(), 'arden-camera.y4m');
    writeFileSync(cam, y4mBarcode('3017620422003'));
    const cb = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--use-file-for-fake-video-capture=' + cam] });
    const ctx = await cb.newContext({ viewport: { width: 393, height: 852 }, isMobile: true, hasTouch: true, locale: 'fr-FR', timezoneId: 'Europe/Paris', permissions: ['camera'] });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errs.push('[repas] ' + e.message));
    let offline = false, asked = [];
    /* Open Food Facts simulé : le test ne dépend pas du réseau */
    await page.route('https://world.openfoodfacts.org/**', (r) => {
      const code = new URL(r.request().url()).pathname.split('/').pop();
      asked.push(code);
      if (offline) return r.abort('internetdisconnected');
      if (code === '3017620422003') return r.fulfill({ json: { status: 1, code, product: { product_name_fr: 'Pâte à tartiner', brands: 'Marque test', serving_quantity: 15, nutriments: { 'energy-kcal_100g': 539, proteins_100g: 6.3, carbohydrates_100g: 57.5, fat_100g: 30.9 } } } });
      return r.fulfill({ json: { status: 0, code } });
    });
    await page.goto(url);
    await page.evaluate(() => window.carnet.loadDemo());
    await page.waitForFunction(() => document.querySelector('#plan li'), null, { timeout: 30000 });
    const items = () => page.evaluate(() => { const d = JSON.parse(localStorage.getItem('carnet-muscu-v1')); const t = new Date(); const k = new Date(t - t.getTimezoneOffset() * 6e4).toISOString().slice(0, 10); return (d.days[k] && d.days[k].items || []).map((x) => x.n); });

    await step('recherche : favoris et banque d\'aliments', async () => {
      await page.click('.tplus'); await page.click('#sheet [data-q="food"]');
      await page.waitForSelector('#msheet:not([hidden])');
      await page.fill('#fq', 'whey');
      await page.waitForSelector('#fres [data-act="fav"]');
      const n = await page.evaluate(() => import('/src/foods.js').then((m) => m.loadCiqual()).then((a) => a.length));
      if (n) {
        await page.fill('#fq', 'riz');
        await page.waitForSelector('#fres [data-act="fpick"]');
        await page.click('#fres [data-act="fpick"]');
        await page.fill('#pq', '150');
        expect(/kcal/.test(await text(page, '#pkr')), 'pas de total calculé');
        await page.click('[data-act="pickadd"]');
        await page.waitForSelector('#msheet', { state: 'hidden' });
        expect((await items()).some((x) => /150 g/.test(x)), 'aliment Ciqual non ajouté');
      } else {
        await page.fill('#fq', 'zzzz');
        expect(/s'installe|Aucun/.test(await text(page, '#fres')), 'pas de message sans résultat');
        await page.click('#msl');
      }
    });

    await step('scan à la caméra, Open Food Facts, portion, ajout', async () => {
      await page.click('.tplus'); await page.click('#sheet [data-q="scan"]');
      await page.waitForSelector('#fpick:not([hidden])', { timeout: 15000 });
      expect(/Pâte à tartiner/.test(await text(page, '#fpick')), 'produit scanné absent');
      expect(await page.isHidden('#scan'), 'la caméra reste ouverte');
      await page.click('[data-act="pickq"][data-q="15"]');
      expect(/81 kcal/.test(await text(page, '#pkr')), 'portion mal calculée : ' + await text(page, '#pkr'));
      await page.click('[data-act="pickadd"]');
      await page.waitForSelector('#msheet', { state: 'hidden' });
      expect((await items()).some((x) => /Pâte à tartiner.*15 g/.test(x)), 'produit scanné non ajouté');
    });

    await step('produit déjà scanné : retrouvé hors connexion', async () => {
      offline = true; asked = [];
      await page.click('.tplus'); await page.click('#sheet [data-q="scan"]');
      await page.waitForSelector('#fpick:not([hidden])', { timeout: 15000 });
      expect(/Pâte à tartiner/.test(await text(page, '#fpick')), 'produit mémorisé non retrouvé');
      expect(!asked.length, 'Open Food Facts interrogé pour un produit connu');
      await page.click('#msl');
      offline = false;
    });

    await step('code tapé à la main, produit inconnu à compléter', async () => {
      await page.click('.tplus'); await page.click('#sheet [data-q="scan"]');
      await page.waitForSelector('#scan:not([hidden])');
      await page.fill('#sccode', '12345670');
      await page.press('#sccode', 'Enter');
      await page.waitForSelector('#pk-n', { timeout: 8000 });
      expect(asked.includes('12345670'), 'seul le code-barres devait partir vers Open Food Facts');
      await page.fill('#pk-n', 'Yaourt maison');
      await page.fill('#pk-k', '95');
      await page.fill('#pk-p', '4');
      await page.fill('#pq', '125');
      await page.click('[data-act="pickadd"]');
      await page.waitForSelector('#msheet', { state: 'hidden' });
      expect((await items()).some((x) => /Yaourt maison \(125 g\)/.test(x)), 'produit inconnu non ajouté');
      const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('carnet-muscu-v1')).set.prods.map((p) => p.id));
      expect(saved.includes('12345670'), 'produit inconnu non mémorisé');
    });
    await cb.close();
  }
} finally {
  await browser.close();
  await server.close();
}
if (errs.length) { ko++; console.log('\nErreurs JavaScript :\n  ' + errs.join('\n  ')); }
console.log(`\n${ok} étape${ok > 1 ? 's' : ''} réussie${ok > 1 ? 's' : ''}, ${ko} en échec.`);
process.exit(ko ? 1 : 0);

/* Vidéo Y4M (niveaux de gris) qui montre un code EAN-13 noir sur une étiquette blanche */
function y4mBarcode(code) {
  const L = ['0001101', '0011001', '0010011', '0111101', '0100011', '0110001', '0101111', '0111011', '0110111', '0001011'];
  const R = L.map((c) => [...c].map((b) => (b === '0' ? '1' : '0')).join('')), G = R.map((c) => [...c].reverse().join(''));
  const PAR = ['LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG', 'LGGLLG', 'LGGGLL', 'LGLGLG', 'LGLGGL', 'LGGLGL'];
  const d = [...code].map(Number);
  let bits = '101';
  for (let i = 1; i <= 6; i++) bits += (PAR[d[0]][i - 1] === 'L' ? L : G)[d[i]];
  bits += '01010';
  for (let i = 7; i <= 12; i++) bits += R[d[i]];
  bits += '101';
  const W = 640, H = 360, m = 4, bw = bits.length * m, x0 = (W - bw) >> 1, y0 = 90, y1 = 270;
  const Y = Buffer.alloc(W * H, 110);
  for (let y = 60; y < 300; y++) for (let x = x0 - 40; x < x0 + bw + 40; x++) Y[y * W + x] = 245;
  for (let i = 0; i < bits.length; i++) if (bits[i] === '1') for (let y = y0; y < y1; y++) for (let x = 0; x < m; x++) Y[y * W + x0 + i * m + x] = 20;
  const UV = Buffer.alloc((W / 2) * (H / 2) * 2, 128), frame = Buffer.concat([Buffer.from('FRAME\n'), Y, UV]);
  return Buffer.concat([Buffer.from(`YUV4MPEG2 W${W} H${H} F10:1 Ip A1:1 C420jpeg\n`), ...Array(10).fill(frame)]);
}
