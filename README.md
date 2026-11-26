# Arden

Application web mobile de suivi santé et forme, en français : trois jauges du jour
(**dépense**, **énergie**, **sommeil**), la phrase du coach, la frise cardiaque de la
journée, et une analyse détaillée par onglet. Les données viennent de l'export
**Apple Santé** (analysé entièrement dans le navigateur) et de ce que tu notes à la main.

Aucune donnée ne quitte l'appareil : tout est stocké localement, sans compte ni serveur.
L'appli fonctionne dans un navigateur, s'installe sur l'écran d'accueil (PWA) et est prête
à être publiée sur l'App Store (voir [docs/APP_STORE.md](docs/APP_STORE.md)).

## Fonctionnalités

| Onglet | Contenu |
| --- | --- |
| **Aujourd'hui** | Titre du jour et sa phrase, jauges dépense / énergie / sommeil (zone de dépense conseillée sur l'arc), plan du jour, action principale, carte du soir avant le coucher, moniteur de santé, tuiles (stress, VFC, FC au repos, activité, nutrition, hydratation), courbe cardiaque de la journée, activités, check-in (humeur, énergie, stress, courbatures, étiquettes) |
| **Sommeil** | Score et composantes, hypnogramme de la nuit avec FC et VFC, 14 dernières nuits, tendances, besoin de sommeil et heure de coucher conseillée |
| **Énergie** | Score, moniteur de santé (plage normale personnelle), VFC nocturne, FC nocturne, stress estimé, signes vitaux (SpO₂, respiration, température au poignet…) |
| **Dépense** | Zones cardiaques, journal de séances de muscu (séries, minuteur de repos, progression suggérée), autres sports, charge d'entraînement (ratio 7 j / 28 j), volume par groupe musculaire, 1RM estimé, records |
| **Nutrition** | Repas et macros, favoris, hydratation, compléments, besoins caloriques réels, 14 derniers jours |
| **Tendances** | Ta semaine en un coup d'œil (image à partager), bilan santé sur 30 jours, rigueur du suivi, semaine, corrélations observées, bien-être, poids, mensurations, masse grasse, VO2 max, activité quotidienne |
| **Plus** | Énergie et signes vitaux (aussi par un toucher sur la jauge Énergie), Nutrition, dossier médical (rendez-vous, vaccins, analyses, blessures + rappels), import Apple Santé, réglages et objectifs, données et confidentialité (sauvegarde en fichier, restauration, suppression) |

La tuile **Calories brûlées** donne la dépense depuis minuit, à l'instant présent : métabolisme de
base (formule de Mifflin-St Jeor à partir du poids, de la taille, de l'âge et du sexe, réparti sur
les 24 heures) + calories actives de la montre.

Un toucher sur une tuile (calories brûlées, stress, VFC, FC au repos, pas, nutrition, hydratation) ouvre sa page
de détail : courbe sur 7 jours, 30 jours ou 6 mois, moyenne, minimum, maximum, plage habituelle,
et une explication de ce que la recherche dit de cette mesure.

Les repères (normes de VO2 max par âge et sexe, masse grasse selon l'âge, FC max selon l'âge,
sommeil, pas, activité, protéines) s'appuient sur les recommandations et les grandes études de
cohorte ; ce sont des estimations, pas un diagnostic.

Au premier lancement, un accueil en trois écrans présente l'appli, demande le profil
(facultatif) et propose d'importer Apple Santé, d'explorer **des données de démo** (deux mois
d'un profil fictif) ou de commencer sans données.

Raccourcis clavier sur ordinateur : `←` `→` changer de jour, `1`–`7` onglets, `N` noter, `Échap` fermer.

## Démarrer

Prérequis : Node.js 20 ou plus.

```bash
npm install
```

```bash
npm run dev
```

Puis ouvrir l'URL affichée (par défaut http://localhost:5173).

Autres commandes :

```bash
npm run build     # version de production dans dist/
```

```bash
npm run preview   # sert dist/ localement
```

```bash
npm run lint      # ESLint
```

```bash
npm run parcours  # tests de parcours : l'appli parcourue comme sur un iPhone, le matin et le soir
```

Chaque matin, à la première ouverture avant midi, un **briefing** plein écran donne le titre du
jour, les trois jauges et le plan. Le soir, une carte « Ce soir » compte à rebours jusqu'à l'heure de
coucher conseillée. Le lundi, le bilan de la semaine attend sur le Résumé, et Tendances le propose en
image à partager (dessinée sur l'appareil). Un record, une dépense qui entre dans sa zone ou sept
check-ins d'affilée déclenchent une petite célébration.

## Tester comme sur un iPhone

```bash
npm run sim
```

Ouvre le **simulateur iPhone** (`simulateur.html`) : l'appli dans un cadre d'iPhone 16,
16 Pro Max, 13 mini ou SE, avec encoche, barre d'état, barre d'accueil et zones sûres.
Le panneau de gauche change d'appareil, passe en clair ou sombre, saute d'un onglet à
l'autre, charge les données de démo ou revient au premier lancement.
Il est aussi en ligne : `https://<compte>.github.io/carnet-de-sante/simulateur.html`.
La case **Appli iOS (Apple Santé simulé)** montre l'appli comme sur iPhone : connexion directe
à Apple Santé, avec un faux HealthKit qui renvoie les mesures du profil de démo.

## Appli iOS

Le projet Xcode (`ios/`) contient déjà, sur GitHub, la dernière version du site : `npm run build`
compile le site **et** le recopie dans `ios/App/App/public`, et cette copie est versionnée.
Sur le Mac, il suffit donc de récupérer le dépôt et d'ouvrir Xcode :

```bash
git pull
npm install         # la première fois, puis seulement si package.json a changé
open ios/App/App.xcodeproj    # ou : npx cap open ios
```

```bash
npm run captures    # captures d'écran App Store (1320 × 2868) avec les données de démo
```

Tout le parcours de publication (compte développeur, Xcode, fiche App Store, points de
vigilance de la revue d'Apple) est décrit dans [docs/APP_STORE.md](docs/APP_STORE.md).

## Apple Santé

**Dans l'appli iOS**, Apple Santé est lu directement (HealthKit, lecture seule) : on autorise
l'accès une fois, puis les données se mettent à jour à chaque ouverture.

**Sur le web**, on importe le fichier d'export :

1. Sur l'iPhone : app **Santé** → photo de profil en haut à droite → **Exporter toutes les données de santé**.
2. Récupérer le fichier `export.zip` (AirDrop, Fichiers, mail…).
3. Dans l'appli : **Plus → Apple Santé → Choisir le fichier d'export** (le `.zip` tel quel ou le `export.xml` qu'il contient).

Le fichier est lu en flux, minute par minute, sans être envoyé nulle part. Sont conservés
13 mois de résumés quotidiens et le détail des 35 dernières nuits et journées.

## Structure

```
index.html              Structure des vues (onglets, panneaux, formulaires)
src/
  styles.css            Thème clair/sombre (light-dark), mise en page mobile et ordinateur
  utils.js              Utilitaires : DOM, dates, nombres, statistiques
  constants.js          Exercices, sports, repas, groupes musculaires, réglages par défaut
  health-import.js      Analyse de l'export Apple Santé (sommeil, FC, VFC/RMSSD, zones, stress…)
  healthkit.js          Lecture directe d'Apple Santé dans l'appli iOS (conversion vers l'analyseur)
  healthkit-mock.js     HealthKit simulé, pour le simulateur
  demo.js               Données de démo : faux export Apple Santé + saisies, sur 60 jours
  main.js               État, stockage, moteur d'interprétation (scores, coach), graphiques SVG,
                        rendu des vues, premier lancement, sauvegarde et gestion des événements
simulateur.html         Simulateur iPhone pour tester sur ordinateur (outil de développement)
confidentialite.html    Politique de confidentialité (exigée par l'App Store)
ios/                    Projet Xcode généré par Capacitor
scripts/                Génération des captures App Store
docs/                   Guide de publication App Store et captures
public/
  manifest.webmanifest  Installation sur l'écran d'accueil (PWA)
  sw.js                 Fonctionnement hors connexion
  icon*.png, icon.svg   Icônes
```

Aucun framework : JavaScript natif, graphiques en SVG générés à la main. Dépendances
d'exécution : [JSZip](https://stuk.github.io/jszip/) (chargée à la demande pour ouvrir le `.zip`),
la police Plus Jakarta Sans intégrée à l'appli, et [Capacitor](https://capacitorjs.com/) pour iOS.

## Installer sur iPhone

Une fois l'appli en ligne (voir ci-dessous), l'ouvrir dans Safari → **Partager** →
**Sur l'écran d'accueil**. Elle s'ouvre alors en plein écran et fonctionne hors connexion.

## Déploiement (GitHub Pages)

Le workflow `.github/workflows/deploy.yml` vérifie (lint + build) chaque push et chaque
pull request, puis publie `dist/` sur GitHub Pages à chaque push sur `main`.
Une seule fois : **Settings → Pages → Build and deployment → Source : GitHub Actions**.

## Données et sauvegarde

- Stockage : `localStorage`, clé `carnet-muscu-v1`, propre à chaque navigateur et appareil.
- **Plus → Données et confidentialité** enregistre une sauvegarde en fichier (séances, nutrition,
  journal, dossier et réglages), la restaure (ou la transfère sur un autre appareil), et efface
  toutes les données. Les données Apple Santé se réimportent depuis l'iPhone.

## Avertissement

Les scores, repères et analyses sont des estimations à partir de tes données ; ils ne
remplacent pas un avis médical.
