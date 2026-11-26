# Consignes pour Claude

## Git : toujours fusionner et pousser

Après chaque modification, sans attendre qu'on le demande :

1. vérifier (`npm run lint`, `npm run build`, et les tests de parcours `npm run parcours` si l'interface a changé) ;
2. committer ;
3. fusionner dans `main` (les branches de travail éventuelles y sont fusionnées) ;
4. pousser `main` sur GitHub (`git push origin main`), ce qui met aussi le site à jour.

Le propriétaire suit l'avancement sur https://github.com/Aurel943/carnet-de-sante et sur le site
https://aurel943.github.io/carnet-de-sante/ : rien ne doit rester seulement en local.

## Projet

- Appli web sans framework (Vite), en français, emballée pour iOS avec Capacitor (`ios/`).
- Design : langage visuel d'Apple (iOS 26) défini dans `src/styles.css`, avec une identité propre :
  pas de boutons ni de liens en bleu système. Actions principales en capsules graphite (`--tint`),
  secondaires en capsules grises (`--field`), icônes d'onglets aux couleurs de chaque section.
- Âme d'Arden (« ardeur », l'arc comme la courbe du jour) : fond ivoire chaud le jour (`#f4f1eb`) et nuit
  bleutée en sombre (`#0b0d12`), jamais le gris d'iOS ; police Fraunces (`--serif`) pour ce qui parle
  (grands titres, titre du jour, titres de cartes), SF Pro pour l'interface, SF Pro Rounded pour les
  chiffres ; ciel vivant (`#sky`) derrière les grands titres, qui suit l'heure et l'état du jour ;
  puces et icônes tirées de l'arc (bouts ronds, point-curseur au bout).
- Voix : tutoiement, phrases courtes, jamais culpabilisantes. Le Résumé répond dans l'ordre à « comment
  je vais » (titre du jour), « que faire » (jauges + plan), « que noter » (une action principale).
  Chaque carte commence par sa conclusion (`<p class="vd">`) ; les cartes pour experts portent la classe
  `adv` et restent repliées derrière « Analyse détaillée ».
- Unités des jauges : Dépense et Sommeil sur `/100`, Énergie en `%` ; la jauge Dépense montre sa zone
  conseillée sur l'arc.
- Identité d'Arden (nom de l'appli), à garder distincte des applis concurrentes : scores « Dépense »
  (corail, `--eff`), « Énergie » (turquoise, `--rec`) et « Sommeil » (bleu nuit, `--slp`) ; jauges en
  arc ouvert de 270° (jamais d'anneaux complets) ; frise de la semaine en mini-barres ; logo en arc
  tricolore sur tuile graphite aux couleurs fixes, identique à l'icône App Store (`npm run icones`
  régénère `public/icon.svg` et les icônes PNG du site ; le SVG du logo dans `index.html` s'obtient
  avec `node scripts/icones.mjs --svg`).
- Le site et l'appli iOS doivent toujours être identiques : le propriétaire code sur le site, puis
  ouvre Xcode chez lui après un simple `git pull`, sans rien compiler. `npm run build` compile le site
  **et** le recopie dans `ios/App/App/public` (versionné) : committer ces fichiers avec chaque
  modification. Ne jamais remettre `ios/App/App/public` dans `.gitignore`.
- Après une modification visuelle : régénérer les captures App Store (`npm run captures`).
- Détails : `README.md` et `docs/APP_STORE.md`.
