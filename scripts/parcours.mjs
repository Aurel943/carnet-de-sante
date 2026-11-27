// Tests de parcours : l'appli est ouverte comme sur un iPhone et parcourue comme le ferait
// quelqu'un, du premier lancement aux rituels. Toute erreur JavaScript fait échouer le test.
//
// Lancer :  npm run parcours      (le serveur de dev est lancé automatiquement)
//           PARCOURS=gestes npm run parcours   pour une seule partie (jour, texte, gestes, repas, seance, objectif)
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
const only = process.env.PARCOURS || '', part = (k) => !only || only === k;
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
/* Tendances n'a pas d'onglet sur iPhone : elle s'ouvre depuis Plus */
async function tend(page) {
  await tab(page, 'plus');
  await page.click('#hub [data-go="tendances"]');
  await page.waitForSelector('#v-tendances:not([hidden])');
}
/* referme ce qui peut s'ouvrir tout seul : briefing du matin, célébration (« Dans ta zone »…) */
async function settle(page) {
  await page.waitForTimeout(700);
  if (await page.isVisible('#brief')) { await page.click('[data-act="briefok"]'); await page.waitForSelector('#brief', { state: 'hidden' }); }
  if (await page.isVisible('#cele')) { await page.click('#cele'); await page.waitForSelector('#cele', { state: 'hidden' }); }
}
/* recharge l'appli et laisse le briefing du matin s'ouvrir s'il doit le faire */
async function reload(page) { await page.reload(); await page.waitForTimeout(800); }

try {
  for (const [theme, hour] of part('jour') ? [['light', 8], ['dark', 21]] : []) {
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
      expect(await page.isVisible('#appbar .abdate'), 'barre du haut sans la date');
      expect((await page.$$('#vitals .vit')).length >= 4, 'moniteur de santé : tuiles manquantes');
      expect(await page.isVisible('#bal .balc'), 'pas de bilan dépensé / mangé');
      expect((await page.$$('#chrono .ev')).length >= 1, 'chronologie vide');
    });

    await step('barre d\'onglets : Résumé, Dépense, Énergie, Sommeil, Plus (l\'ordre des jauges)', async () => {
      const labels = await page.$$eval('#tabs a', (a) => a.filter((x) => x.offsetParent).map((x) => x.innerText.trim()));
      expect(labels.join('|') === 'Résumé|Dépense|Énergie|Sommeil|Plus', 'onglets visibles : ' + labels.join(', '));
      for (const [h, vd] of [['effort', '#vd-heat'], ['recuperation', '#vd-hv'], ['sommeil', '#vd-s14'], ['plus', null]]) {
        await tab(page, h);
        if (vd) expect((await text(page, vd)).length > 10, `pas de conclusion en tête de carte (${vd})`);
      }
      await tend(page);
      expect((await text(page, '#vd-mk')).length > 10, 'pas de conclusion en tête de carte (#vd-mk)');
    });

    await step('nombres : milliers séparés par une espace visible, sur chaque onglet', async () => {
      for (const h of ['aujourdhui', 'effort', 'recuperation', 'sommeil']) {
        await tab(page, h);
        const bad = await page.evaluate(() => {
          const out = []; const w = document.createTreeWalker(document.querySelector('main'), NodeFilter.SHOW_TEXT); let n;
          while ((n = w.nextNode())) {
            const el = n.parentElement; if (!el || !el.offsetParent && el.tagName !== 'tspan' && el.tagName !== 'text') continue;
            const t = n.textContent; if (t.includes('\u202F')) out.push('espace fine : ' + t.trim().slice(0, 30));
            for (const m of t.matchAll(/(?<![\d\/:,.\-])\d{4,}(?![\d\/:])/g)) if (!(+m[0] >= 1900 && +m[0] <= 2100)) out.push(t.trim().slice(0, 40));
          }
          return out;
        });
        expect(!bad.length, `${h} : ${bad.slice(0, 3).join(' | ')}`);
      }
    });

    await step('onglet Plus : toujours le menu, même après une sous-page', async () => {
      await tab(page, 'plus');
      await page.click('#hub [data-s="reglages"]');
      await page.waitForSelector('[data-sub="reglages"]:not([hidden])');
      await tab(page, 'sommeil');
      await tab(page, 'plus');
      expect(await page.isVisible('#hub'), 'Plus rouvre la sous-page au lieu du menu');
      await page.click('#hub [data-s="dossier"]');
      await page.waitForSelector('[data-sub="dossier"]:not([hidden])');
      await page.click('#tabs a[href="#plus"]');
      await page.waitForSelector('#hub:not([hidden])');
      expect(await page.isHidden('[data-sub="dossier"]'), 'la sous-page reste affichée');
      await tab(page, 'aujourdhui');
      await page.click('.tplus'); await page.click('#sheet [data-q="med"]');
      await page.waitForSelector('[data-sub="dossier"]:not([hidden])');
      expect(await page.isHidden('#hub'), 'un raccourci vers une sous-page de Plus doit l\'ouvrir directement');
    });

    await step('Noter → Poids : une petite fenêtre, la pesée gardée', async () => {
      await tab(page, 'aujourdhui');
      await page.click('.tplus'); await page.click('#sheet [data-q="bw"]');
      await page.waitForSelector('#dlgw');
      expect(await page.isVisible('#v-aujourdhui'), 'la pesée ne doit pas changer de page');
      await page.fill('#dlgw', '74,8'); await page.press('#dlgw', 'Enter');
      await page.waitForSelector('#dlg', { state: 'hidden' });
      const bw = await page.evaluate(() => { const d = JSON.parse(localStorage.getItem('carnet-muscu-v1')).days; const t = new Date(); const k = new Date(t - t.getTimezoneOffset() * 6e4).toISOString().slice(0, 10); return d[k] && d[k].bw; });
      expect(bw === 74.8, 'pesée non enregistrée : ' + bw);
    });

    await step('Noter : quatre gestes du quotidien, le reste en liste, sans doublon', async () => {
      await tab(page, 'aujourdhui');
      await page.click('.tplus');
      const qs = await page.$$eval('#sheet [data-q]', (a) => a.map((x) => x.dataset.q).filter((q) => q !== 'close'));
      expect(qs.join(',') === 'food,mu,ci,bw,meas,med', 'actions inattendues : ' + qs.join(','));
      await page.click('#sheet [data-q="meas"]');
      await page.waitForSelector('#v-tendances:not([hidden])');
      await page.waitForSelector('#mf', { state: 'visible', timeout: 3000 }).catch(() => { throw new Error('Noter → Mensurations doit ouvrir le formulaire'); });
      await page.click('[data-act="mfopen"]');
      await tab(page, 'aujourdhui');
      await page.click('.tplus'); await page.click('#sheet [data-q="med"]');
      await page.waitForSelector('[data-sub="dossier"]:not([hidden])');
    });

    await step('dossier médical : ce qui est prévu d\'abord, formulaire ouvert par « Ajouter » ou par Noter', async () => {
      await page.waitForSelector('#medf', { state: 'visible', timeout: 3000 }).catch(() => { throw new Error('Noter → Rendez-vous doit ouvrir le formulaire'); });
      await page.fill('#mti', 'Ophtalmo');
      await page.click('#medf .btn.pri');
      await page.waitForSelector('#medf', { state: 'hidden' });
      expect(/Ophtalmo/.test(await text(page, '#medup')), 'le rendez-vous ajouté n\'apparaît pas dans « À venir »');
      await page.click('[data-act="medopen"]');
      expect(await page.isVisible('#medf'), '« Ajouter » n\'ouvre pas le formulaire');
      await page.click('[data-act="medopen"]');
      expect(await page.isHidden('#medf'), '« Fermer » ne replie pas le formulaire');
    });

    await step('menus qui défilent de côté : fondu sur le bord où il reste des choix', async () => {
      await tab(page, 'plus');
      await page.click('#hub [data-s="dossier"]');
      await page.waitForSelector('#medflt button');
      const cls = () => page.$eval('#medflt', (e) => [e.classList.contains('ef-l'), e.classList.contains('ef-r')].join());
      await page.waitForFunction(() => document.querySelector('#medflt').classList.contains('ef-r'), null, { timeout: 2000 }).catch(() => {});
      expect(await cls() === 'false,true', 'au départ, fondu à droite seulement : ' + await cls());
      await page.$eval('#medflt', (e) => { e.scrollLeft = e.scrollWidth; });
      await page.waitForFunction(() => document.querySelector('#medflt').classList.contains('ef-l'));
      expect(await cls() === 'true,false', 'à la fin, fondu à gauche seulement : ' + await cls());
    });

    await step('réglages : groupés, un objectif changé est gardé, étiquettes en pastilles', async () => {
      await tab(page, 'plus');
      await page.click('#hub [data-s="reglages"]');
      await page.waitForSelector('[data-sub="reglages"]:not([hidden])');
      const groups = await page.$$eval('[data-sub="reglages"] .sgh', (a) => a.map((x) => x.textContent.trim()));
      expect(groups.join('|') === 'Tes données|Ton objectif|Ton profil|Objectifs du jour|Nutrition|Musculation|Check-in|Avancé', 'groupes : ' + groups.join(', '));
      await page.fill('#s-prot', '150'); await page.press('#s-prot', 'Tab');
      await page.waitForFunction(() => JSON.parse(localStorage.getItem('carnet-muscu-v1') || '{}').set?.prot === 150, null, { timeout: 2000 }).catch(() => { throw new Error('objectif de protéines non gardé'); });
      const n = await page.$$eval('#taglist .schip', (a) => a.length);
      await page.fill('#tagn', 'Sieste'); await page.press('#tagn', 'Enter');
      await page.waitForFunction((k) => document.querySelectorAll('#taglist .schip').length === k + 1, n);
      await page.click('#taglist .schip:last-child button');
      await page.waitForFunction((k) => document.querySelectorAll('#taglist .schip').length === k, n);
      await page.fill('#s-prot', '140'); await page.press('#s-prot', 'Tab');
      // Calculer pour moi : une proposition expliquée, appliquée seulement si on accepte
      await page.click('[data-act="kcalc"]');
      await page.waitForSelector('#dlg:not([hidden])');
      expect(/kcal/.test(await text(page, '#dlgt')) && /Calculé à partir de/.test(await text(page, '#dlgm')), 'proposition attendue : ' + await text(page, '#dlgt'));
      const kc = Number((await text(page, '#dlgt')).replace(/\D*kcal.*/, '').replace(/\D/g, ''));
      await page.click('[data-dlg="ok"]');
      await page.waitForFunction((k) => Number(document.querySelector('#s-kcal').value.replace(/\D/g, '')) === k, kc);
      // Apple Santé et Sauvegarde sont rangées dans les Réglages, et y ramènent
      await page.click('[data-sub="reglages"] [data-s="donnees"]');
      await page.waitForSelector('[data-sub="donnees"]:not([hidden])');
      expect((await text(page, '#subback')) === '‹ Réglages', 'le retour doit ramener aux Réglages');
      await page.click('#subback');
      await page.waitForSelector('[data-sub="reglages"]:not([hidden])');
      await page.click('#subback');
      await page.waitForSelector('#hub:not([hidden])');
      const hub = await page.$$eval('#hub .hr b', (a) => a.map((x) => x.textContent));
      expect(hub.join('|') === 'Nutrition|Tendances|Dossier médical|Réglages', 'menu Plus : ' + hub.join(', '));
    });

    await step('onglets de jour : aujourd\'hui au retour, jour gardé entre eux, toucher = revenir', async () => {
      await tab(page, 'sommeil');
      await page.$eval('[data-act="dprev"]', (b) => b.click()); // flèches cachées sur téléphone (glisser ou frise)
      await page.waitForFunction(() => /^Hier/.test(document.querySelector('#dsub').textContent));
      await tab(page, 'effort');
      expect(/^Hier/.test(await text(page, '#dsub')), 'le jour choisi doit suivre entre Sommeil et Dépense');
      await page.click('#tabs a[href="#effort"]');
      await page.waitForFunction(() => /^Aujourd/.test(document.querySelector('#dsub').textContent));
      await page.$eval('[data-act="dprev"]', (b) => b.click()); // flèches cachées sur téléphone (glisser ou frise)
      await page.waitForFunction(() => /^Hier/.test(document.querySelector('#dsub').textContent));
      await tab(page, 'plus');
      await tab(page, 'sommeil');
      expect(/^Aujourd/.test(await text(page, '#dsub')), 'au retour, l\'onglet doit rouvrir aujourd\'hui');
      await tab(page, 'aujourdhui');
    });

    await step('Énergie : un onglet, ouvert aussi par sa jauge, sans bouton retour', async () => {
      await tab(page, 'aujourdhui');
      await page.click('#g3 [data-go="recuperation"]');
      await page.waitForSelector('#v-recuperation:not([hidden])');
      expect(await page.$eval('#tabs a[href="#recuperation"]', (a) => a.getAttribute('aria-current') === 'page'), 'onglet Énergie non allumé');
      expect(await page.isHidden('#abback'), 'un onglet n\'a pas de bouton retour');
    });

    await step('Nutrition et Tendances depuis le Résumé, puis retour', async () => {
      await tab(page, 'aujourdhui');
      await page.click('#bal .nuth');
      await page.waitForSelector('#v-nutrition:not([hidden])');
      expect(await visible(page, '#abback'), 'bouton retour absent de la barre du haut');
      expect(await page.$eval('#tabs a[href="#aujourdhui"]', (a) => a.classList.contains('sub-on')), 'Résumé non surligné');
      await page.click('#abback');
      await page.waitForSelector('#v-aujourdhui:not([hidden])');
      if (await page.$('#wkc .wkcard')) {
        await page.click('#wkc .wkcard');
        await page.waitForSelector('#v-tendances:not([hidden])');
        expect((await text(page, '#dback')) === '‹ Résumé', 'le retour doit ramener au Résumé');
        await page.click('#dback');
        await page.waitForSelector('#v-aujourdhui:not([hidden])');
      }
      await tend(page);
      expect((await text(page, '#dback')) === '‹ Plus', 'depuis Plus, le retour doit ramener à Plus');
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
      await page.waitForSelector('#timer:not([hidden])');
      await page.waitForTimeout(600);
      const arc = await page.$eval('#tarc', (e) => [e.getAttribute('d'), e.style.strokeDashoffset]);
      expect(arc[0] && arc[0].startsWith('M') && arc[1] !== '', 'l\'arc du minuteur n\'est pas piloté');
      await page.click('.foot [data-act="finish"]');
      await page.waitForSelector('#cele.on', { timeout: 4000 });
      expect(/record/i.test(await text(page, '#cet')), 'pas de célébration de record');
      await page.click('#cele');
    });

    await step('image de la semaine à partager', async () => {
      await tend(page);
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

    await step('lexique : un « ? » à côté des termes techniques, une phrase pour comprendre', async () => {
      await tab(page, 'recuperation');
      await page.waitForSelector('#v-recuperation .glq[data-g="vfc"]');
      await page.click('#v-recuperation .glq[data-g="vfc"]');
      await page.waitForSelector('#dlg:not([hidden])');
      expect(await text(page, '#dlgt') === 'VFC' && /variabilité/i.test(await text(page, '#dlgm')), 'définition de la VFC attendue');
      await page.click('[data-dlg="ok"]');
      await page.waitForSelector('#dlg', { state: 'hidden' });
      expect(await page.$$eval('#v-recuperation .glq[data-g="vfc"]', (a) => a.length) === 1, 'un seul « ? » par terme et par écran');
    });

    await step('séance notée + montre : une seule entrée, complétée par la montre, sans doublon', async () => {
      await tab(page, 'aujourdhui');
      let seen = 0;
      // neuf jours en arrière : toujours au moins un lundi ou un jeudi de muscu de la démo, quel que soit le jour du test
      for (let i = 0; i < 9; i++) {
        if (i) { const before = await text(page, '#dsub'); await page.$eval('[data-act="dprev"]', (b) => b.click()); await page.waitForFunction((x) => document.querySelector('#dsub').textContent.trim() !== x, before); await page.waitForTimeout(250); }
        const d = i, t = await text(page, '#chrono');
        if (!/Haut du corps|Jambes/.test(t)) continue;
        seen++;
        expect(/avec la montre/.test(t), `${d} : la séance devrait être complétée par la montre`);
        expect(!/Musculation/.test(t), `${d} : l'entraînement de la montre apparaît en double`);
      }
      expect(seen > 0, 'aucun jour de muscu dans la semaine de démo');
      await page.click('#tabs a[href="#aujourdhui"]');
    });

    await step('frise : chaque jour dit ses chiffres (toucher long, survol, VoiceOver)', async () => {
      await tab(page, 'aujourdhui');
      const lab = await page.$eval('#wk .wd:not([disabled])', (b) => b.getAttribute('aria-label') + ' | ' + b.dataset.tip);
      expect(/Dépense/.test(lab) && /Énergie/.test(lab) && /Sommeil/.test(lab), 'chiffres du jour absents : ' + lab);
    });

    await step('séance : la date tient en une ligne, « Aujourd\'hui »', async () => {
      await page.click('.tplus'); await page.click('#sheet [data-q="mu"]');
      await page.waitForSelector('#msheet:not([hidden])');
      if (await page.$('.drow .dval')) expect((await text(page, '.drow .dval')) === 'Aujourd\'hui', 'date du jour attendue');
      await page.click('#msl');
      await page.waitForSelector('#msheet', { state: 'hidden' });
    });

    await step('séance de la montre pas notée : proposition, détail noté, puis rapprochée', async () => {
      await tab(page, 'aujourdhui');
      // la démo laisse la dernière séance de muscu à la seule montre (si elle date des trois derniers jours)
      if (!(await visible(page, '#wkask .wkask'))) return;
      await page.click('#wkask [data-act="wknote"]');
      await page.waitForSelector('#msheet:not([hidden]) .wkfor');
      await page.click('#editor [data-act="tpl"]');
      await page.waitForSelector('#editor [data-f="r"]');
      await page.$$eval('#editor [data-f="r"]', (a) => a.slice(0, 3).forEach((x) => { x.value = '10'; x.dispatchEvent(new Event('input', { bubbles: true })); }));
      await page.waitForTimeout(1100);
      await page.click('#editor [data-act="finish"]');
      await page.waitForSelector('#msheet', { state: 'hidden' });
      await settle(page);
      await tab(page, 'aujourdhui');
      expect(!(await visible(page, '#wkask .wkask')), 'une fois notée, la séance de la montre ne doit plus être proposée');
    });

    await step('objectif : chaque objectif met en avant ce qui compte pour lui', async () => {
      const goal = async (g) => { await tab(page, 'plus'); await page.click('#hub [data-s="reglages"]'); await page.selectOption('#s-goal', g); };
      await goal('sommeil'); await tab(page, 'aujourdhui');
      expect(await visible(page, '#nightc .nightc'), '« Mieux dormir » : la carte « Ta nuit » manque');
      await goal('poids'); await tab(page, 'aujourdhui');
      expect(await visible(page, '#wtc .wtc'), '« Perdre du poids » : la carte du poids manque');
      expect(!(await visible(page, '#nightc .nightc')), 'la carte « Ta nuit » ne doit pas rester');
      await goal('endurance'); await tab(page, 'effort');
      expect(await visible(page, '#v-effort .panel:has(#z28)'), '« Endurance » : les zones cardiaques doivent être dépliées');
      await goal('muscle');
    });
    await ctx.close();
  }

  console.log('\nParcours en grande taille de texte (Dynamic Type)');
  for (const dt of part('texte') ? [1.35, 1.6] : []) {
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
            .filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.right > W + 1 && !e.closest('.scroll,.seg,#favs,.fig,.chips,.wave'); })
            .slice(0, 3).map((e) => e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') + '.' + String(e.className).split(' ')[0]);
        });
        expect(!over.length, `${h} : ${over.join(', ')} dépasse de l'écran`);
      }
    });
    await ctx.close();
  }

  /* ---------- repas : banque d'aliments et scan ---------- */
  /* ---------- gestes et animations ---------- */
  if (part('gestes')) {
  console.log('\nParcours gestes et animations');
    const ctx = await browser.newContext({ viewport: { width: 393, height: 852 }, isMobile: true, hasTouch: true, locale: 'fr-FR', timezoneId: 'Europe/Paris' });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errs.push('[gestes] ' + e.message));
    const d = new Date(); d.setHours(10, 5, 0, 0); await page.clock.setFixedTime(d);
    await page.goto(url + '?ios=1');
    await page.waitForSelector('#onb:not([hidden])');
    await page.evaluate(() => window.carnet.loadDemo());
    await page.waitForFunction(() => document.querySelector('#plan li'), null, { timeout: 30000 });
    /* glisser du doigt : une suite d'événements tactiles, comme sur l'iPhone */
    const swipe = (x0, y0, x1, y1) => page.evaluate(async ([x0, y0, x1, y1]) => {
      const el = document.querySelector('#v-aujourdhui .hero');
      const ev = (type, x, y) => { const t = new Touch({ identifier: 7, target: el, clientX: x, clientY: y }); el.dispatchEvent(new TouchEvent(type, { touches: type === 'touchend' ? [] : [t], changedTouches: [t], bubbles: true })); };
      ev('touchstart', x0, y0);
      for (let i = 1; i <= 10; i++) { ev('touchmove', x0 + (x1 - x0) * i / 10, y0 + (y1 - y0) * i / 10); await new Promise((r) => setTimeout(r, 16)); }
      ev('touchend', x1, y1);
    }, [x0, y0, x1, y1]);

    await step('les chiffres des jauges défilent jusqu\'à leur valeur', async () => {
      await page.waitForTimeout(1300);
      const g = await page.$$eval('#g3 .gv', (a) => a.map((t) => [t.textContent, t.dataset.to]));
      expect(g.every(([t, to]) => to == null || t === to), 'valeurs finales inattendues : ' + JSON.stringify(g));
    });

    await step('glisser pour changer de jour, et revenir', async () => {
      await swipe(60, 420, 300, 424);
      await page.waitForFunction(() => /^Hier/.test(document.querySelector('#dsub').textContent));
      await swipe(300, 420, 60, 424);
      await page.waitForFunction(() => /^Aujourd'hui/.test(document.querySelector('#dsub').textContent));
      await swipe(300, 420, 60, 424);
      await page.waitForTimeout(500);
      expect(/^Aujourd'hui/.test(await text(page, '#dsub')), 'on ne doit pas aller après aujourd\'hui');
    });

    await step('tirer vers le bas pour synchroniser Apple Santé (appli iOS)', async () => {
      await page.evaluate(() => scrollTo(0, 0));
      await swipe(200, 260, 200, 520);
      await page.waitForFunction(() => document.querySelector('#ptr').classList.contains('spin'), null, { timeout: 3000 });
      await page.waitForFunction(() => !document.querySelector('#ptr').classList.contains('spin'), null, { timeout: 30000 });
      const src = await page.evaluate(() => JSON.parse(localStorage.getItem('carnet-muscu-v1')).health.src);
      expect(src === 'hk', 'Apple Santé non synchronisé');
    });

    await step('check-in : cadran tourné au doigt, cran touché', async () => {
      await settle(page);
      await page.click('.tplus'); await page.click('#sheet [data-q="ci"]');
      await page.waitForSelector('.dial[data-k="mood"]');
      await page.waitForTimeout(450); // la feuille finit de monter
      const b = await (await page.$('.dial[data-k="mood"] svg')).boundingBox();
      await page.mouse.move(b.x + b.width * 0.15, b.y + b.height * 0.8); await page.mouse.down();
      await page.mouse.move(b.x + b.width * 0.5, b.y + b.height * 0.05, { steps: 6 });
      await page.mouse.move(b.x + b.width * 0.86, b.y + b.height * 0.4, { steps: 6 });
      await page.mouse.up();
      await page.click('[data-act="jset"][data-k="energy"][data-v="2"]');
      await page.waitForTimeout(250); // l'enregistrement se fait à l'image suivante
      const j = await page.evaluate(() => { const d = JSON.parse(localStorage.getItem('carnet-muscu-v1')).days, t = new Date(), k = new Date(t - t.getTimezoneOffset() * 6e4).toISOString().slice(0, 10); return (d[k] || {}).j || {}; });
      expect(j.mood === 4 && j.energy === 2, 'valeurs du check-in : ' + JSON.stringify(j));
      await page.click('#msr [data-act="msclose"]');
    });

    await step('eau : la vague monte dans la tuile', async () => {
      await page.waitForSelector('#msheet', { state: 'hidden' });
      const lv = () => page.$eval('#tiles .wave', (w) => parseFloat(w.style.getPropertyValue('--lv')));
      const a = await lv();
      await page.click('#tiles [data-act="water"][data-v="500"]');
      await page.waitForTimeout(300);
      expect((await lv()) > a, 'le niveau d\'eau ne monte pas');
    });

    await step('respiration guidée : inspire, expire, puis fermer', async () => {
      await tab(page, 'recuperation'); await page.click('#v-recuperation [data-act="breath"]');
      await page.waitForSelector('#breath:not([hidden])');
      await page.click('[data-act="bzgo"]');
      await page.waitForTimeout(1500);
      expect(await text(page, '#bzw') === 'Inspire', 'pas d\'inspiration');
      await page.waitForTimeout(3300);
      expect(await text(page, '#bzw') === 'Expire', 'pas d\'expiration');
      await page.click('#breath [data-act="bzclose"]');
      expect(/écourtée/.test(await text(page, '#bzw')), 'fin de séance non affichée');
      await page.click('#bzend [data-act="bzclose"]');
      await page.waitForSelector('#breath', { state: 'hidden' });
      await tab(page, 'aujourdhui');
    });

    await step('page de détail : le grand chiffre suit le doigt sur le graphique', async () => {
      await page.click('#vitals [data-k="rhr"]'); // FC au repos, dans le moniteur de santé
      await page.waitForSelector('#mfig svg circle');
      await page.waitForTimeout(450); // la feuille finit de monter
      const h0 = await text(page, '#mdet .mhead');
      const b = await (await page.$('#mfig')).boundingBox();
      await page.mouse.move(b.x + b.width * 0.5, b.y + b.height * 0.5);
      await page.waitForTimeout(100);
      const h1 = await text(page, '#mdet .mhead');
      expect(h1 !== h0 && !/Moyenne/.test(h1), 'l\'en-tête ne suit pas le doigt');
      await page.mouse.move(b.x + b.width * 0.5, b.y - 60);
      await page.waitForTimeout(100);
      expect(await text(page, '#mdet .mhead') === h0, 'l\'en-tête ne revient pas à la moyenne');
      await page.click('#msr [data-act="msclose"]');
    });
    await ctx.close();
  }

  if (part('repas')) {
  console.log('\nParcours repas : recherche, scan, produit inconnu');
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
    const items = () => page.evaluate(() => { const d = JSON.parse(localStorage.getItem('carnet-muscu-v1')); const t = new Date(); const k = new Date(t - t.getTimezoneOffset() * 6e4).toISOString().slice(0, 10); return (d.days[k] && d.days[k].items || []).map((x) => x.n + (x.q ? ` (${x.q} g)` : '')); });
    const done = async () => { await page.click('#fbasket [data-act="msclose"]'); await page.waitForSelector('#msheet', { state: 'hidden' }); };

    await step('recherche : favoris et banque d\'aliments', async () => {
      await page.click('.tplus'); await page.click('#sheet [data-q="food"]');
      await page.waitForSelector('#msheet:not([hidden])');
      await page.fill('#fq', 'whey');
      await page.waitForSelector('#fres [data-act="fav"]');
      // aliments courants embarqués : toujours trouvés, avec une portion naturelle
      await page.fill('#fq', 'riz');
      await page.waitForSelector('#fres [data-act="fpick"]');
      expect(/Riz blanc/.test(await text(page, '#fres')), 'aliment courant introuvable');
      await page.click('#fres [data-act="fpick"]');
      await page.fill('#pq', '150');
      expect(/kcal/.test(await text(page, '#pkr')), 'pas de total calculé');
      await page.click('[data-act="pickadd"]');
      await page.waitForSelector('#fbasket:not([hidden])');
      expect((await items()).some((x) => /150 g/.test(x)), 'aliment courant non ajouté');
      await page.fill('#fq', 'zzzz');
      expect(/Aucun/.test(await text(page, '#fres')), 'pas de message sans résultat');
      await page.fill('#fq', '');
      await done();
    });

    await step('en un toucher : récent, « comme hier », ajout rapide', async () => {
      const n0 = (await items()).length;
      await page.click('.tplus'); await page.click('#sheet [data-q="food"]');
      await page.waitForSelector('#frec [data-act="rplus"]');
      await page.click('#frec [data-act="rplus"]');
      await page.waitForFunction(() => /1 ajouté/.test(document.querySelector('#fbasket').textContent));
      await page.click('[data-act="fquick"]');
      await page.fill('#qk-k', '320');
      await page.fill('#qk-n', 'Plat du midi');
      await page.click('[data-act="pickadd"]');
      await page.waitForFunction(() => /2 ajoutés/.test(document.querySelector('#fbasket').textContent));
      await done();
      expect((await items()).length === n0 + 2, 'les deux ajouts manquent');
      // l'écran Nutrition : repas, et « comme hier » quand un repas est vide
      await page.evaluate(() => { location.hash = 'nutrition'; });
      await page.waitForSelector('#v-nutrition:not([hidden]) #meals .meal');
      expect(/kcal/.test(await text(page, '#nhero')), 'pas de total du jour');
      const likey = await page.$('#meals [data-act="likey"]');
      if (likey) { const n1 = (await items()).length; await likey.click(); await page.waitForTimeout(200); expect((await items()).length > n1, '« comme hier » n\'ajoute rien'); }
      await page.click('#meals [data-act="fedit"]');
      await page.waitForSelector('#fpick:not([hidden]) [data-act="pkdel"]');
      const n2 = (await items()).length;
      await page.click('[data-act="pkdel"]');
      await page.waitForSelector('#msheet', { state: 'hidden' });
      expect((await items()).length === n2 - 1, 'aliment non supprimé');
    });

    await step('scan à la caméra, Open Food Facts, portion, ajout', async () => {
      await page.click('.tplus'); await page.click('#sheet [data-q="food"]'); await page.click('#msheet .scanb');
      await page.waitForSelector('#fpick:not([hidden])', { timeout: 15000 });
      expect(/Pâte à tartiner/.test(await text(page, '#fpick')), 'produit scanné absent');
      expect(await page.isHidden('#scan'), 'la caméra reste ouverte');
      await page.click('[data-act="pickq"][data-q="15"]');
      expect(/81 kcal/.test(await text(page, '#pkr')), 'portion mal calculée : ' + await text(page, '#pkr'));
      await page.click('[data-act="pickadd"]');
      await done();
      expect((await items()).some((x) => /Pâte à tartiner.*15 g/.test(x)), 'produit scanné non ajouté');
    });

    await step('produit déjà scanné : retrouvé hors connexion', async () => {
      offline = true; asked = [];
      await page.click('.tplus'); await page.click('#sheet [data-q="food"]'); await page.click('#msheet .scanb');
      await page.waitForSelector('#fpick:not([hidden])', { timeout: 15000 });
      expect(/Pâte à tartiner/.test(await text(page, '#fpick')), 'produit mémorisé non retrouvé');
      expect(!asked.length, 'Open Food Facts interrogé pour un produit connu');
      await page.click('#msl');
      offline = false;
    });

    const typeCode = async (c) => {
      await page.click('.tplus'); await page.click('#sheet [data-q="food"]'); await page.click('#msheet .scanb');
      await page.waitForSelector('#scan:not([hidden])');
      await page.fill('#sccode', c);
      await page.press('#sccode', 'Enter');
      await page.waitForSelector('#dlg:not([hidden])', { timeout: 8000 });
    };
    await step('produit inconnu : alerte, puis « Annuler » sans rien ouvrir', async () => {
      await typeCode('12345670');
      expect(/Produit inconnu/.test(await text(page, '#dlgt')), 'alerte attendue : ' + await text(page, '#dlgt'));
      expect(!(await page.$('#pk-n')), 'la fiche ne doit pas s\'ouvrir avant le choix');
      await page.click('[data-dlg="cancel"]');
      await page.waitForSelector('#dlg', { state: 'hidden' });
      expect(!(await page.$('#pk-n')), 'rien ne doit s\'ouvrir après « Annuler »');
      // on revient à la recherche du repas, d'où le scan est parti
      expect(await visible(page, '#fq'), 'la recherche du repas doit rester ouverte');
      await page.click('#msl');
      await page.waitForSelector('#msheet', { state: 'hidden' });
    });

    await step('pas de connexion : « Réessayer », puis « Ajouter moi-même »', async () => {
      offline = true;
      await typeCode('12345670');
      expect(/Pas de connexion/.test(await text(page, '#dlgt')), 'alerte hors connexion attendue');
      offline = false;
      await page.click('[data-dlg="retry"]');
      await page.waitForFunction(() => /Produit inconnu/.test(document.querySelector('#dlgt').textContent) && !document.querySelector('#dlg').hidden);
      await page.click('[data-dlg="add"]');
      await page.waitForSelector('#pk-n', { timeout: 8000 });
      expect(asked.includes('12345670'), 'seul le code-barres devait partir vers Open Food Facts');
      await page.fill('#pk-n', 'Yaourt maison');
      await page.fill('#pk-k', '95');
      await page.fill('#pk-p', '4');
      await page.fill('#pq', '125');
      await page.click('[data-act="pickadd"]');
      await done();
      expect((await items()).some((x) => /Yaourt maison \(125 g\)/.test(x)), 'produit inconnu non ajouté');
      const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('carnet-muscu-v1')).set.prods.map((p) => p.id));
      expect(saved.includes('12345670'), 'produit inconnu non mémorisé');
    });
    await cb.close();
  }

  /* Démo avec une séance de muscu en cours (?demo=seance, ou le menu du bandeau de démo) */
  if (part('seance')) {
    console.log('\nParcours démo avec une séance en cours');
    const { ctx, page } = await phone('light', 18);

    await step('?demo=seance : la démo s\'ouvre avec une séance en cours', async () => {
      await page.goto(url + '?demo=seance');
      await page.waitForFunction(() => document.querySelector('#plan li'), null, { timeout: 30000 });
      await settle(page);
      expect(/Séance en cours · \d+ min/.test(await text(page, '#heroact .btn.pri')), 'action principale attendue : « Séance en cours · 26 min »');
      expect(!page.url().includes('demo='), 'le paramètre doit disparaître de l\'adresse');
      await page.click('#heroact .btn.pri');
      await page.waitForSelector('#msheet:not([hidden])');
      const reps = await page.$$eval('[data-f="r"]', (a) => a.filter((x) => x.value).length);
      expect(reps >= 6, 'séries déjà faites attendues : ' + reps);
      const w = await page.$$eval('[data-f="w"]', (a) => a.map((x) => x.value).join(' '));
      expect(!/\d\.\d/.test(w), 'charges écrites avec un point au lieu d\'une virgule : ' + w);
      await page.click('#msl');
      await page.waitForSelector('#msheet', { state: 'hidden' });
    });

    await step('bandeau de démo : recharger sans séance en cours', async () => {
      await page.click('#demobar .dlab');
      await page.waitForSelector('#dlg:not([hidden])');
      await page.click('[data-dlg="plain"]');
      await page.waitForFunction(() => !/Séance en cours/.test(document.querySelector('#heroact').textContent), null, { timeout: 30000 });
    });

    await step('appli iPhone : la FC de la montre arrive en direct, sans redessiner l\'écran', async () => {
      page.on('dialog', (dl) => dl.accept());
      await page.goto(url + '?ios=1&demo=seance');
      await page.waitForFunction(() => document.querySelector('#plan li'), null, { timeout: 30000 });
      await settle(page);
      await page.click('#heroact .btn.pri');
      await page.waitForSelector('#live');
      await page.waitForFunction(() => /^\d+$/.test(document.querySelector('#lvHr')?.textContent || ''), null, { timeout: 8000 })
        .catch(() => { throw new Error('la fréquence cardiaque n\'arrive pas'); });
      const z = await text(page, '#lvZ');
      expect(/^Z[1-5] /.test(z), 'zone cardiaque attendue : ' + z);
      await page.evaluate(() => { window.__lv = document.getElementById('live'); });
      await page.waitForTimeout(2500);
      // (l'horloge des tests est figée : le chrono ne peut pas avancer ici)
      expect(await page.evaluate(() => window.__lv === document.getElementById('live')), 'le bandeau a été redessiné');
      await page.click('#msl');
      await page.waitForSelector('#msheet', { state: 'hidden' });
    });
    await ctx.close();
  }

  /* L'objectif choisi à l'accueil : sans muscu ni protéines, l'appli ne les impose pas */
  if (part('objectif')) {
    console.log('\nParcours objectif : « Être en forme », sans muscu ni protéines');
    const { ctx, page } = await phone('light', 14);
    const hidden = (sel) => page.$$eval(sel, (a) => a.length > 0 && a.every((x) => getComputedStyle(x).display === 'none' || !x.offsetParent));

    await step('accueil : l\'objectif se choisit en un toucher', async () => {
      await page.waitForSelector('#onb:not([hidden])');
      await page.click('#onb [data-act="onb"][data-to="1"]');
      await page.click('#onb [data-act="obgoal"][data-g="forme"]');
      expect(await page.$eval('#onb [data-g="forme"]', (b) => b.getAttribute('aria-checked') === 'true'), 'objectif non sélectionné');
      await page.click('#onb [data-act="onb"][data-to="2"]:not([data-skip])');
      await page.click('#onb [data-go2="empty"]');
      await page.waitForSelector('#onb', { state: 'hidden' });
    });

    await step('sans muscu ni protéines : Réglages, Dépense et Noter s\'adaptent', async () => {
      await tab(page, 'plus');
      await page.click('#hub [data-s="reglages"]');
      await page.waitForSelector('[data-sub="reglages"]:not([hidden])');
      expect(await page.inputValue('#s-goal') === 'forme', 'objectif non gardé');
      expect(!(await page.isChecked('#s-tmu')) && !(await page.isChecked('#s-tprot')), 'muscu et protéines devraient être éteintes');
      expect(await hidden('[data-sub="reglages"] .mu-only'), 'le groupe Musculation reste affiché');
      expect(await hidden('#s-prot'), 'l\'objectif de protéines reste affiché');
      await tab(page, 'effort');
      expect(await page.evaluate(() => document.documentElement.classList.contains('no-mu')), 'la muscu devrait être masquée');
      expect(await hidden('#v-effort .mu-only'), 'Force et Records restent affichés');
      await page.click('.tplus'); await page.click('#sheet [data-q="mu"]');
      await page.waitForSelector('#msheet:not([hidden])');
      expect(await page.$eval('[data-act="smode"][data-m="sp"]', (b) => b.classList.contains('on')), 'Noter → Séance doit proposer le sport');
      await page.click('#msl');
      await page.waitForSelector('#msheet', { state: 'hidden' });
    });

    await step('sans montre : le Résumé parle de ce qu\'on note, une ligne discrète pour Apple Santé', async () => {
      await tab(page, 'aujourdhui');
      expect(await visible(page, '#dnote .watchl'), 'lien « Tu as une Apple Watch ? » attendu');
      expect(!(await page.$('#dnote .emptyv')), 'la grande carte « Ajoute tes données Santé » ne doit plus s\'afficher');
      expect(/repas/.test(await text(page, '#dlede')), 'phrase du jour sans montre attendue');
    });

    await step('effort ressenti : dix crans à toucher', async () => {
      await page.click('.tplus'); await page.click('#sheet [data-q="mu"]');
      await page.waitForSelector('#msheet:not([hidden])');
      await page.click('.rps [data-v="6"]');
      expect(await page.inputValue('#spr') === '6' && /6\/10 · modéré/.test(await text(page, '.rph b')), 'ressenti non noté');
      await page.click('.rps [data-v="6"]');
      expect(await page.inputValue('#spr') === '', 'toucher le même cran doit l\'effacer');
      await page.click('#msl');
      await page.waitForSelector('#msheet', { state: 'hidden' });
    });

    await step('sans Apple Santé, Nutrition s\'ouvre et se remplit normalement', async () => {
      await tab(page, 'plus');
      await page.click('#hub [data-go="nutrition"]');
      await page.waitForSelector('#v-nutrition:not([hidden])');
      expect(await page.$$eval('#meals .meal', (a) => a.length) === 4, 'les quatre repas manquent');
      expect((await text(page, '#dnote')) === '', 'pas d\'écran « pas encore de données » sur Nutrition');
      expect(await page.$eval('#tabs a[href="#plus"]', (a) => a.classList.contains('sub-on')), 'Plus doit rester allumé');
    });

    await step('l\'objectif « Prendre du muscle » rallume muscu et protéines', async () => {
      await tab(page, 'plus');
      await page.click('#hub [data-s="reglages"]');
      await page.selectOption('#s-goal', 'muscle');
      await page.waitForFunction(() => document.querySelector('#s-tmu').checked && document.querySelector('#s-tprot').checked);
      expect(!(await hidden('[data-sub="reglages"] .mu-only')), 'le groupe Musculation devrait revenir');
      await page.click('#s-tprot + span');
      await page.waitForFunction(() => !document.querySelector('#s-tprot').checked && document.documentElement.classList.contains('no-prot'));
    });
    await ctx.close();
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
