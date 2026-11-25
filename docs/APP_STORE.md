# Publier Carnet de santé sur l'App Store

L'appli web est emballée dans une vraie appli iOS avec [Capacitor](https://capacitorjs.com/) :
le dossier `ios/` contient le projet Xcode, qui embarque la version compilée de l'appli (`dist/`).

## Ce qui est déjà prêt

- Projet Xcode (`ios/App`), iPhone uniquement, portrait, iOS 15 minimum, en français.
- Icône 1024 × 1024 et écran de lancement clair / sombre.
- Déclaration « pas de chiffrement non exempté » (`ITSAppUsesNonExemptEncryption = NO`) :
  pas de questionnaire d'export à remplir à chaque envoi.
- Interface iOS : barre d'onglets en bas, encoche et barre d'accueil prises en compte,
  police intégrée (aucun appel réseau).
- Premier lancement, données de démo, sauvegarde en fichier, suppression de toutes les données.
- Politique de confidentialité : `confidentialite.html` (publiée avec le site sur GitHub Pages).
- Captures d'écran au format iPhone 6,9 pouces : `docs/app-store/captures/` (`npm run captures`).

## Avant de soumettre : à compléter

1. **Politique de confidentialité** : remplacer `[nom de l'éditeur]` et `[adresse e-mail de contact]`
   dans `confidentialite.html`.
2. **Identifiant de l'appli** (`appId` dans `capacitor.config.json`, et « Bundle Identifier » dans
   Xcode) : `com.aurel943.carnetdesante` par défaut. Il doit être unique et ne pourra plus changer
   une fois l'appli publiée.
3. **Lecture native d'Apple Santé (fortement recommandée)** : voir « Risque de refus » plus bas.

## Ce qu'il faut

- Un Mac avec une version récente de Xcode (App Store), et Node.js 20 ou plus.
- Un compte [Apple Developer Program](https://developer.apple.com/programs/) (99 € par an).
- Un iPhone pour tester (facultatif mais conseillé).

## Étapes

```bash
git clone https://github.com/Aurel943/carnet-de-sante.git
```

```bash
cd carnet-de-sante && npm install
```

```bash
npm run ios
```

`npm run ios` compile l'appli, la copie dans le projet iOS et ouvre Xcode. Ensuite, dans Xcode :

1. Cible **App** → onglet **Signing & Capabilities** → **Team** : choisir ton compte développeur.
2. Brancher l'iPhone, le choisir en haut, puis **▶** pour tester sur l'appareil.
3. Pour publier : **Product → Archive**, puis **Distribute App → App Store Connect**.

Après chaque modification du code web : `npm run ios:sync` (compile et recopie dans `ios/`).

## Fiche App Store Connect

Sur [App Store Connect](https://appstoreconnect.apple.com/) → **Mes apps → +** :

| Champ | Proposition |
| --- | --- |
| Nom | Carnet de santé |
| Sous-titre (30 car.) | Sommeil, récup et effort |
| Catégorie | Santé et forme |
| Prix | Gratuit |
| URL de confidentialité | https://aurel943.github.io/carnet-de-sante/confidentialite.html |
| URL d'assistance | la page GitHub du projet, ou une adresse de contact |
| Classification par âge | 4+ (aucun contenu sensible) |
| Confidentialité de l'app | **Données non collectées** (rien ne quitte l'appareil) |
| Mots-clés (100 car.) | sommeil,récupération,VFC,fréquence cardiaque,muscu,coach,santé,Apple Watch,entraînement,nutrition |

**Description proposée :**

> Carnet de santé interprète chaque chiffre de ta montre, comme un coach personnel.
>
> Chaque matin, trois scores : effort, récupération et sommeil, avec le conseil qui va avec :
> quelle intensité viser aujourd'hui, à quelle heure te coucher ce soir.
>
> • Sommeil : score détaillé, phases de la nuit, fréquence cardiaque et VFC nocturnes, dette de sommeil.
> • Récupération : VFC, FC au repos, respiration, température au poignet, comparées à ta propre normale.
> • Effort : zones cardiaques, charge d'entraînement, journal de muscu, records et 1RM estimé.
> • Nutrition : repas, protéines, hydratation, compléments, dépense réelle.
> • Tendances : bilan santé, VO2 max, poids, mensurations, et ce que révèlent tes données.
> • Dossier médical : rendez-vous, vaccins, analyses, avec rappels.
>
> Privé par conception : pas de compte, pas de serveur, pas de publicité. Tes données restent sur ton iPhone.
>
> Carnet de santé n'est pas un dispositif médical et ne remplace pas l'avis d'un professionnel de santé.

**Notes pour l'équipe de revue d'Apple** (champ « Notes » de la version) :

> Aucun compte n'est nécessaire. Au premier lancement, choisir « Explorer avec des données de démo »
> pour voir toutes les fonctions avec deux mois de données fictives. Toutes les données restent sur l'appareil.

**Captures** : envoyer les fichiers de `docs/app-store/captures/` (1320 × 2868, iPhone 6,9 pouces) ;
Apple les réduit automatiquement pour les autres tailles d'iPhone. Clair ou sombre, au choix.

## Risque de refus : la règle 4.2 (fonctionnalité minimale)

Apple refuse souvent les applis qui ne sont « qu'un site web dans une coquille ». Aujourd'hui,
l'appli lit Apple Santé via le fichier d'export (`export.zip`), ce qui est lent pour
l'utilisateur et ne tire pas parti de l'iPhone.

La parade la plus solide est de **lire Apple Santé directement (HealthKit)** : l'utilisateur
autorise l'accès une fois, et les données se mettent à jour seules à chaque ouverture. Côté code,
c'est faisable sans toucher au moteur d'analyse : les mesures lues par HealthKit peuvent être
converties au format de l'export et passées au même analyseur (c'est déjà ce que font les
données de démo). Il faudra alors :

- ajouter un module Capacitor HealthKit et la capacité **HealthKit** dans Xcode ;
- renseigner `NSHealthShareUsageDescription` dans `Info.plist` (texte expliquant pourquoi l'appli lit tes données) ;
- tester sur un vrai iPhone (le simulateur Xcode n'a pas de données Santé réalistes).

D'autres ajouts natifs renforcent le dossier et servent vraiment l'utilisateur : notifications
locales (rappel du check-in, heure de coucher conseillée), retour haptique, widget « scores du jour ».
