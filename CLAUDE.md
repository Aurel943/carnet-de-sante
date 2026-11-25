# Consignes pour Claude

## Git : toujours fusionner et pousser

Après chaque modification, sans attendre qu'on le demande :

1. vérifier (`npm run lint`, `npm run build`, et les tests de parcours si l'interface a changé) ;
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
- Identité d'Arden (nom de l'appli), à garder distincte des applis concurrentes : scores « Dépense »
  (corail, `--eff`), « Énergie » (turquoise, `--rec`) et « Sommeil » (bleu nuit, `--slp`) ; jauges en
  arc ouvert de 270° (jamais d'anneaux complets) ; frise de la semaine en mini-barres ; logo en arc
  tricolore sur tuile graphite (généré par script, voir l'historique git).
- Après une modification du code web destinée à l'appli iOS : `npx cap sync ios`.
- Après une modification visuelle : régénérer les captures App Store (`npm run captures`).
- Détails : `README.md` et `docs/APP_STORE.md`.
