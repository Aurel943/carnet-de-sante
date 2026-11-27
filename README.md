# Arden

Application web mobile de suivi santé et forme, en français : trois jauges du jour
(**dépense**, **énergie**, **sommeil**), la phrase du coach, la frise cardiaque de la
journée, et une analyse détaillée par onglet. Les données viennent de l'export
**Apple Santé** (analysé entièrement dans le navigateur) et de ce que tu notes à la main.

Aucune donnée ne quitte l'appareil : tout est stocké localement, sans compte ni serveur.
L'appli fonctionne dans un navigateur, s'installe sur l'écran d'accueil (PWA) et est prête
à être publiée sur l'App Store (voir [docs/APP_STORE.md](docs/APP_STORE.md)).

## Fonctionnalités

**Ton objectif** (choisi à l'accueil, modifiable dans Réglages) : être en forme, perdre du poids, prendre du muscle, endurance ou mieux dormir. Arden n'impose ni la musculation ni les protéines : « Prendre du muscle » allume les deux, « Perdre du poids » les protéines, les autres objectifs aucun des deux. Deux interrupteurs ajustent. Sans musculation, ni Force, ni Records, ni volume par muscle, ni réglages de séries, et « Séance » propose le sport ; la muscu s'allume d'elle-même dès qu'une séance de muscu est notée. Sans objectif de protéines, elles restent visibles dans les repas, sans chiffre à atteindre (ni plan, ni bilan, ni carte de suivi). Les installations faites avant ce choix gardent tout affiché.
L'objectif met aussi en avant ce qui compte pour lui : « Mieux dormir » place la carte « Ta nuit » (durée, score, phases, horaires) en tête du Résumé, sort la carte du soir dès 16 h et met le sommeil en tête du plan ; « Perdre du poids » ajoute la carte « Ton poids » (moyenne sur 7 jours, tendance sur 4 semaines, ce qu'il reste vers l'objectif) sous la nutrition et remonte la courbe de poids dans Tendances ; « Endurance » déplie les zones cardiaques et la charge d'entraînement juste sous la jauge Dépense.

**Mini-lexique** : un petit « ? » suit les termes techniques (VFC, SDNN/RMSSD, FC au repos, baisse de FC nocturne, SpO₂, fréquence respiratoire, température au poignet, sommeil paradoxal, profond, léger, 1RM, VO2 max, zones cardiaques, charge d'entraînement, tonnage, stress estimé, métabolisme de base) dans les titres, libellés, légendes et en-têtes de tableau, une fois par terme et par écran ; un toucher l'explique en une phrase.

**Frise de la semaine** : un toucher long sur un jour montre ses chiffres (« Mer. 25 · Dépense 72 · Énergie 81 % · Sommeil 90 ») ; au survol sur ordinateur, et lus par VoiceOver. Une astuce le signale la première fois. **Séance** : la date tient en une ligne, « Aujourd'hui › », un toucher ouvre le calendrier.

Le bouton **+** (Noter) va droit à l'essentiel : **Repas, Séance, Check-in, Poids** en grand, puis « Plus rarement » : **Mensurations** et **Rendez-vous médical**. Rien n'y est en double : le scan est dans la recherche du repas, l'eau dans la tuile Hydratation, le choix muscu / autre sport dans la feuille Séance, la synchro Apple Santé dans la capsule en haut, la respiration guidée sur la page Énergie.

Sur iPhone, la barre d'onglets suit l'ordre des jauges : **Résumé · Dépense · Énergie · Sommeil · Plus**, avec le bouton **+** (Noter) à côté. **Nutrition** s'ouvre depuis sa carte du Résumé ou depuis Plus, **Tendances** depuis la carte « Ta semaine » du Résumé ou depuis Plus ; le bouton « ‹ » ramène à l'onglet d'où l'on vient, qui reste allumé. Sur ordinateur, tous les onglets sont dans la barre latérale.

| Onglet | Contenu |
| --- | --- |
| **Aujourd'hui** | Titre du jour et sa phrase, jauges dépense / énergie / sommeil (zone de dépense conseillée sur l'arc), plan du jour, action principale, carte du soir avant le coucher, carte **Nutrition** (ce qu'il reste à manger, protéines, dépense en regard, prochain repas à noter en un toucher ou « Comme hier »), moniteur de santé, carte « Ta semaine » qui mène à Tendances, tuiles (stress, VFC, FC au repos, activité, nutrition, hydratation), courbe cardiaque de la journée, activités, check-in (humeur, énergie, stress, courbatures, étiquettes) |
| **Sommeil** | Score et composantes, hypnogramme de la nuit avec FC et VFC, 14 dernières nuits, tendances, besoin de sommeil et heure de coucher conseillée |
| **Énergie** | Score, moniteur de santé (plage normale personnelle), VFC nocturne, FC nocturne, stress estimé, signes vitaux (SpO₂, respiration, température au poignet…) |
| **Dépense** | Zones cardiaques, journal de séances de muscu (séries, minuteur de repos, progression suggérée), autres sports, charge d'entraînement (ratio 7 j / 28 j), volume par groupe musculaire, 1RM estimé, records |
| **Nutrition** | Ce qu'il reste à manger aujourd'hui (arc des calories, protéines, glucides, lipides), les quatre repas avec ajout en un toucher (« Comme hier », récents), eau, compléments, poids du matin, la semaine ; en analyse détaillée : besoins caloriques réels, protéines sur 14 jours |
| **Tendances** | Ta semaine en un coup d'œil (image à partager), bilan santé sur 30 jours, corrélations observées, mensurations (« Noter » ouvre le formulaire), poids ; en analyse détaillée : la semaine mesure par mesure, rigueur du suivi, bien-être, masse grasse, VO2 max, activité quotidienne |
| **Plus** | Nutrition, Tendances, dossier médical (ce qui est prévu d'abord, rappels à leur date ; « Ajouter » ouvre le formulaire) ; puis **Réglages**, groupés comme sur iPhone, chaque groupe avec une phrase qui dit à quoi il sert : tes données (Apple Santé, sauvegarde et confidentialité), profil, objectifs du jour, nutrition (avec **Calculer pour moi**, compléments et favoris), musculation, étiquettes du check-in, et « Avancé » pour le calcul de la VFC |

**Calculer pour moi** (Réglages → Nutrition) propose calories et protéines, avec le détail du calcul, appliqué seulement si tu acceptes. La dépense vient, du plus fiable au plus approché : de ta dépense réelle (repas notés et pente du poids sur 3 semaines, gardée seulement si elle concorde à 20 % près avec la suivante), du métabolisme de base plus les calories actives de la montre, de la dépense Apple, ou du métabolisme de base × 1,45. Puis −450 kcal pour perdre (environ 0,4 kg par semaine) ou +300 pour prendre, vers le poids visé, sans jamais descendre sous le métabolisme de base. Protéines : 1,6 g par kg.

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

Le texte suit la taille choisie dans les Réglages de l'iPhone (Dynamic Type), jusqu'aux tailles
d'accessibilité ; sur ordinateur, c'est la taille de police du navigateur qui s'applique. Le simulateur
propose les mêmes tailles (« Taille du texte »).

**Gestes et mouvement** : glisser à gauche ou à droite change de jour ; dans l'appli iOS, tirer
l'écran vers le bas synchronise Apple Santé (l'arc du logo se dessine puis tourne). Les écrans
glissent d'un jour à l'autre, une jauge touchée s'agrandit jusqu'à sa page, ses chiffres défilent.
Dans les pages de détail, le grand chiffre suit le doigt sur le graphique, avec un tic haptique par
jour. Le check-in se règle avec des cadrans à tourner du doigt, l'eau monte dans la tuile
Hydratation, le minuteur de repos est un arc qui se vide, et le ciel dérive lentement (étoiles la
nuit). **Respiration guidée** (page Énergie, ou depuis le plan les jours de stress) : 1, 3 ou
5 min à six respirations par minute, guidées par l'arc et les vibrations, notées dans la journée.
Tout le mouvement s'arrête si « Réduire les animations » est activé sur l'iPhone.

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
npm run aliments  # (ré)importe la table Ciqual de l'ANSES dans src/data/ciqual.json
```

La feuille **Repas** est faite pour noter vite, sans jamais devoir peser : en haut, le repas
(petit-déj, déjeuner, collation, dîner) ; dessous, « Comme hier » et tes **récents** (ceux de ce repas : au
petit-déjeuner, « Au petit-déjeuner, d'habitude ») et **favoris**,
chacun avec un bouton **+** qui l'ajoute en un toucher (la feuille reste ouverte pour enchaîner, puis
« Terminé »). La recherche trouve d'abord une centaine d'**aliments courants** embarqués
(`src/basics.js`, valeurs moyennes pour 100 g) avec une **portion naturelle** (« 1 pomme », « 1 pot »,
« 1 portion ») ; puis la table Ciqual de l'ANSES si elle est installée, et tes produits scannés. La
quantité se règle d'un toucher (½, 1, 1½, 2 portions, ou ± au gramme près), avec le total en grand.
**Ajout rapide** : juste les calories (nom et protéines facultatifs). Toucher un aliment noté permet
d'en changer la quantité ou de le supprimer. **Scanner** lit le code-barres avec la caméra (décodage
sur l'appareil) et cherche le produit sur Open Food Facts : seul le numéro du code-barres est envoyé,
et le produit est gardé sur l'appareil. Un produit inconnu se complète une fois et reste mémorisé.

Table Ciqual (environ 3 000 aliments génériques) : `npm run aliments` la télécharge depuis le site de
l'ANSES et l'écrit dans `src/data/ciqual.json`, à committer. Si le site ne répond pas, télécharger
« Table au format XML » sur https://ciqual.anses.fr puis `npm run aliments -- chemin/vers/l-archive.zip`.

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
