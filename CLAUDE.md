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
  bleutée en sombre (`#0b0d12`), jamais le gris d'iOS ; police SF Pro Display (`--serif`, la police des titres d'iOS ; Inter hors appareils Apple) pour ce qui parle
  (grands titres, titre du jour, titres de cartes), SF Pro pour l'interface, SF Pro Rounded pour les
  chiffres ; ciel vivant (`#sky`) derrière les grands titres, qui suit l'heure et l'état du jour ;
  puces et icônes tirées de l'arc (bouts ronds, point-curseur au bout).
- Voix : tutoiement, phrases courtes, jamais culpabilisantes. Le Résumé répond dans l'ordre à « comment
  je vais » (titre du jour), « que faire » (jauges + plan), « que noter » (une action principale).
  Chaque carte commence par sa conclusion (`<p class="vd">`) ; les cartes pour experts portent la classe
  `adv` et restent repliées derrière « Analyse détaillée ».
- Dynamic Type : toutes les tailles de texte sont en `rem` (jamais en px), pour suivre la taille choisie
  dans les Réglages d'iOS (lue par `dynType()` dans `src/main.js`). Restent en px, comme dans les applis
  d'Apple : texte des SVG (jauges, graphiques), barre d'onglets, frise de la semaine. Les colonnes de
  libellés sont en `rem` aussi. `?dt=1.35` force une taille (simulateur, `npm run parcours`).
- Mouvement : les écrans glissent (View Transitions, `vt()` dans `src/main.js`), une jauge touchée
  s'agrandit jusqu'à sa page, les chiffres des jauges défilent ; gestes : glisser pour changer de jour,
  tirer pour synchroniser (appli iOS), tic haptique en parcourant un graphique. Ressorts à l'appui
  (`cubic-bezier(.25,1.6,.4,1)`). Tout s'arrête avec « Réduire les animations » ; les captures App Store
  sont faites dans ce mode pour montrer les valeurs finales.
- Barre d'onglets sur iPhone, dans l'ordre des jauges : Résumé · Dépense · Énergie · Sommeil · Plus (+ le bouton
  Noter). Nutrition et Tendances n'ont pas d'onglet : elles s'ouvrent depuis le Résumé (carte Nutrition, carte
  « Ta semaine ») ou depuis Plus, l'onglet d'origine reste allumé et « ‹ » y ramène. La nutrition reste mise en avant
  (carte en tête du Résumé, « Repas » en premier dans Noter).
- Noter (bouton +) : quatre gestes du quotidien en tuiles (Repas, Séance, Check-in, Poids), puis « Plus rarement »
  en liste (Mensurations, Rendez-vous médical). N'y ajouter que ce qui n'existe nulle part ailleurs : pas de doublon
  avec les pages (scan dans Repas, eau dans Hydratation, synchro dans la capsule Santé, respiration sur Énergie).
- Ne pas supposer que tout le monde fait de la muscu ou vise des protéines : `trackMu()` / `trackProt()` (objectif
  choisi à l'accueil ou dans Réglages, interrupteurs) décident ; classes `mu-only` / `prot-only` pour masquer, et tout
  nouveau contenu sur la muscu ou les protéines doit en tenir compte.
- Navigation (comme sur iPhone) : un onglet rouvert depuis une autre partie de l'appli repart de son
  point de départ (aujourd'hui pour les onglets de jour, menu pour Plus) ; toucher l'onglet où l'on est
  déjà y ramène aussi. Entre onglets de jour (Résumé, Sommeil, Énergie, Dépense), le jour choisi est
  gardé. Les raccourcis vers une sous-page de Plus (Noter → Rendez-vous, Importer Apple Santé…) l'ouvrent
  directement.
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
