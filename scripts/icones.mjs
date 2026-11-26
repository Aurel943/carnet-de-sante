// Génère le logo d'Arden (arc tricolore sur tuile graphite) pour le web,
// avec exactement la géométrie de l'icône App Store
// (ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png).
//
//   node scripts/icones.mjs          → public/icon.svg + icônes PNG du site
//   node scripts/icones.mjs --svg    → affiche le SVG à coller dans index.html
//
// Les couleurs sont fixes (pas de variables de thème) : le logo est le même
// en mode clair et en mode sombre, comme l'icône de l'appli.
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const TUILE = '#16161a', DEPENSE = '#ff6e57', ENERGIE = '#2fd3c1', SOMMEIL = '#6b84ff';

// Arc de 270° (ouvert vers le bas) sur une grille de 32, centré en (16 ; 17,09).
const CX = 16, CY = 17.09, R = 10.64, TRAIT = 3.78;
const f = n => +n.toFixed(3);
const pt = deg => { const a = (deg * Math.PI) / 180; return [f(CX + R * Math.cos(a)), f(CY + R * Math.sin(a))]; };
// Angles en degrés (0 = droite, sens horaire, y vers le bas) ; petits écarts entre les segments.
const arc = (de, a, couleur) => {
  const [x1, y1] = pt(de), [x2, y2] = pt(a);
  return `<path d="M${x1} ${y1}A${R} ${R} 0 0 1 ${x2} ${y2}" stroke="${couleur}"/>`;
};
const [px, py] = pt(44.9);

/** Logo en SVG. `coins` : rayon des coins de la tuile (0 = carré plein, pour les icônes masquées). */
export function logo({ coins = 7.2, echelle = 1 } = {}) {
  const g = echelle === 1 ? '' : ` transform="translate(16 16) scale(${echelle}) translate(-16 -16)"`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="${coins}" fill="${TUILE}"/>`
    + `<g${g}><g fill="none" stroke-width="${TRAIT}" stroke-linecap="round">`
    + arc(135.1, 207, DEPENSE) + arc(229.1, 310.9, ENERGIE) + arc(333, 44.9, SOMMEIL)
    + `</g><circle cx="${px}" cy="${py}" r="0.89" fill="${TUILE}"/></g></svg>`;
}

const direct = process.argv[1] === fileURLToPath(import.meta.url);

if (direct && process.argv.includes('--svg')) {
  console.log(logo().replace(' xmlns="http://www.w3.org/2000/svg"', ''));
} else if (direct) {
  const { chromium } = await import('playwright');
  writeFileSync('public/icon.svg', logo() + '\n');
  const navigateur = await chromium.launch();
  const page = await navigateur.newPage();
  const png = async (fichier, taille, svg) => {
    await page.setViewportSize({ width: taille, height: taille });
    await page.setContent(`<style>*{margin:0}svg{display:block;width:${taille}px;height:${taille}px}</style>${svg}`);
    await page.screenshot({ path: fichier, omitBackground: true });
  };
  // Tuiles carrées : iOS et Android arrondissent eux-mêmes les coins.
  await png('public/icon-180.png', 180, logo({ coins: 0 }));
  await png('public/icon-192.png', 192, logo({ coins: 0 }));
  await png('public/icon-512.png', 512, logo({ coins: 0 }));
  // Version « maskable » : dessin réduit pour rester dans la zone sûre d'Android.
  await png('public/icon-512-maskable.png', 512, logo({ coins: 0, echelle: 0.74 }));
  await navigateur.close();
  console.log('Icônes du site régénérées.');
}
