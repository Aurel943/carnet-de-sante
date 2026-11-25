// Captures d'écran pour la fiche App Store, avec les données de démo.
// Format iPhone 6,9 pouces exigé par Apple : 1320 × 2868 px (440 × 956 pt à ×3).
//
// Une seule fois :   npx playwright install chromium
// Puis :             npm run captures      (le serveur de dev est lancé automatiquement)
// Résultat :         docs/app-store/captures/*.png
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const out = fileURLToPath(new URL('../docs/app-store/captures/', import.meta.url));
mkdirSync(out, { recursive: true });

// Écrans retenus, dans l'ordre de la fiche App Store
// [fichier, onglet, élément à amener en haut de l'écran, revenir au dernier jour d'entraînement]
const SHOTS = [
  ['1-aujourdhui', 'aujourdhui', null, false],
  ['2-sommeil', 'sommeil', null, false],
  ['3-nuit', 'sommeil', '#fhyp', false],
  ['4-recuperation', 'recuperation', null, false],
  ['5-effort', 'effort', null, true],
  ['6-tendances', 'tendances', null, false],
];

// Barre d'état d'iPhone (heure, réseau, batterie), dessinée par-dessus l'appli
const STATUS_BAR = `<div id="cap-sbar" style="position:fixed;inset:0 0 auto 0;height:62px;z-index:999;display:flex;align-items:center;justify-content:space-between;padding:6px 36px 0 52px;font:600 17px/1 -apple-system,system-ui,sans-serif;color:var(--ink);pointer-events:none">
 <span>9:41</span><span style="display:flex;gap:7px;align-items:center">
 <svg viewBox="0 0 18 12" height="12" fill="currentColor"><rect x="0" y="8" width="3" height="4" rx="1"/><rect x="5" y="5.5" width="3" height="6.5" rx="1"/><rect x="10" y="3" width="3" height="9" rx="1"/><rect x="15" y="0" width="3" height="12" rx="1"/></svg>
 <svg viewBox="0 0 16 12" height="12" fill="currentColor"><path d="M8 2.2c2.3 0 4.4.9 6 2.4l1.2-1.3A10.4 10.4 0 0 0 8 .4 10.4 10.4 0 0 0 .8 3.3L2 4.6a8.6 8.6 0 0 1 6-2.4zm0 3.6c1.4 0 2.6.5 3.5 1.4l1.2-1.3A6.8 6.8 0 0 0 8 4a6.8 6.8 0 0 0-4.7 1.9l1.2 1.3c.9-.9 2.1-1.4 3.5-1.4zM8 9.4 10 7.3a2.9 2.9 0 0 0-4 0z"/></svg>
 <svg viewBox="0 0 27 12" height="13" fill="currentColor"><rect x=".5" y=".5" width="23" height="11" rx="3.5" fill="none" stroke="currentColor" opacity=".4"/><rect x="2" y="2" width="20" height="8" rx="2"/><path d="M25 4v4c.8-.3 1.3-1.1 1.3-2S25.8 4.3 25 4z" opacity=".4"/></svg></span></div>`;

const server = await createServer({ root, logLevel: 'error', server: { port: 5199, strictPort: false } });
await server.listen();
const url = server.resolvedUrls.local[0];
const browser = await chromium.launch();
try {
  for (const theme of ['light', 'dark']) {
    const ctx = await browser.newContext({
      viewport: { width: 440, height: 956 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true,
      colorScheme: theme, locale: 'fr-FR', timezoneId: 'Europe/Paris',
    });
    const page = await ctx.newPage();
    // Matin type : 9 h 41, comme sur les visuels d'Apple
    const d = new Date(); d.setHours(9, 41, 0, 0);
    await page.clock.setFixedTime(d);
    await page.goto(url);
    // Zones sûres d'un iPhone 16 Pro Max, pour que la mise en page soit celle de l'appareil
    await page.addStyleTag({ content: ':root{--sat:62px!important;--sab:34px!important}#demobar,#toast{display:none!important}' });
    await page.evaluate(() => window.carnet.loadDemo());
    await page.waitForFunction(() => document.querySelector('#onb').hidden && !!document.querySelector('#g3 svg'), null, { timeout: 30000 });
    await page.evaluate((html) => document.body.insertAdjacentHTML('beforeend', html), STATUS_BAR);
    for (const [name, hash, sel, workoutDay] of SHOTS) {
      await page.evaluate((h) => { location.hash = h; }, hash);
      await page.waitForTimeout(400);
      // Effort : on recule jusqu'au dernier jour avec un entraînement enregistré par la montre
      for (let k = 0; workoutDay && k < 7 && /Pas d'entraînement/.test(await page.textContent('#dz')); k++) {
        await page.click('[data-act="dprev"]'); await page.waitForTimeout(250);
      }
      await page.evaluate((s) => {
        const el = s && document.querySelector(s)?.closest('.panel');
        scrollTo(0, el ? el.getBoundingClientRect().top + scrollY - 74 : 0);
      }, sel);
      await page.waitForTimeout(500);
      await page.screenshot({ path: `${out}${name}-${theme}.png` });
      while (workoutDay && await page.isEnabled('[data-act="dnext"]')) await page.click('[data-act="dnext"]');
    }
    await ctx.close();
  }
  console.log('Captures enregistrées dans docs/app-store/captures/');
} finally {
  await browser.close();
  await server.close();
}
