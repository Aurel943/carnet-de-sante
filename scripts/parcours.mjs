// Tests de parcours : l'appli est ouverte comme sur un iPhone et parcourue comme le ferait
// quelqu'un, du premier lancement aux rituels. Toute erreur JavaScript fait échouer le test.
//
// Lancer :  npm run parcours      (le serveur de dev est lancé automatiquement)
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';

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
} finally {
  await browser.close();
  await server.close();
}
if (errs.length) { ko++; console.log('\nErreurs JavaScript :\n  ' + errs.join('\n  ')); }
console.log(`\n${ok} étape${ok > 1 ? 's' : ''} réussie${ok > 1 ? 's' : ''}, ${ko} en échec.`);
process.exit(ko ? 1 : 0);
