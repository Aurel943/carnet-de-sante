# Publier Arden sur l'App Store

L'appli web est emballée dans une vraie appli iOS avec [Capacitor](https://capacitorjs.com/) :
le dossier `ios/` contient le projet Xcode, qui embarque la version compilée de l'appli (`dist/`).

## Ce qui est déjà prêt

- Projet Xcode (`ios/App`), iPhone uniquement, portrait, iOS 17.5 minimum (nécessaire aux couleurs clair / sombre de l’interface), en français.
- **Lecture directe d'Apple Santé (HealthKit)**, en lecture seule : module natif
  `ios/App/App/HealthSyncPlugin.swift`, capacité HealthKit (`App.entitlements`) et texte
  d'autorisation (`NSHealthShareUsageDescription` dans `Info.plist`). Voir plus bas.
- Icône 1024 × 1024 et écran de lancement clair / sombre.
- Déclaration « pas de chiffrement non exempté » (`ITSAppUsesNonExemptEncryption = NO`) :
  pas de questionnaire d'export à remplir à chaque envoi.
- Interface iOS : barre d'onglets en bas, encoche et barre d'accueil prises en compte,
  police intégrée (aucun appel réseau).
- Scan des aliments : caméra lue dans la vue web (`NSCameraUsageDescription` dans `Info.plist`),
  décodage sur l'appareil ; seul le numéro du code-barres part vers Open Food Facts.
- Premier lancement, données de démo, sauvegarde en fichier, suppression de toutes les données.
- Politique de confidentialité : `confidentialite.html` (publiée avec le site sur GitHub Pages).
- Captures d'écran au format iPhone 6,9 pouces : `docs/app-store/captures/` (`npm run captures`).

## Avant de soumettre : à compléter

1. **Politique de confidentialité** : remplacer `[nom de l'éditeur]` et `[adresse e-mail de contact]`
   dans `confidentialite.html`.
2. **Identifiant de l'appli** (`appId` dans `capacitor.config.json`, et « Bundle Identifier » dans
   Xcode) : `com.aurel943.arden` par défaut. Il doit être unique et ne pourra plus changer
   une fois l'appli publiée.

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
open ios/App/App.xcodeproj
```

Le projet iOS contient déjà la dernière version du site (`ios/App/App/public`, mise à jour par
`npm run build` et versionnée) : pas besoin de compiler sur le Mac. Ensuite, dans Xcode :

1. Cible **App** → onglet **Signing & Capabilities** → **Team** : choisir ton compte développeur.
   La capacité **HealthKit** doit apparaître dans la liste (elle vient de `App.entitlements`) ;
   la signature automatique l'active aussi sur l'identifiant de l'appli chez Apple.
2. Brancher l'iPhone, le choisir en haut, puis **▶** pour tester sur l'appareil.
   Au premier lancement, choisir **Connecter Apple Santé** : iOS affiche sa demande
   d'autorisation, puis l'appli lit 13 mois de données (quelques secondes à une minute).
3. Pour publier : **Product → Archive**, puis **Distribute App → App Store Connect**.

Après chaque modification du code web, `npm run build` recopie le site dans `ios/` ; il suffit de
committer et pousser. Sur le Mac : `git pull` (et `npm install` si `package.json` a changé), puis ▶ dans Xcode.

## Fiche App Store Connect

Sur [App Store Connect](https://appstoreconnect.apple.com/) → **Mes apps → +** :

| Champ | Proposition |
| --- | --- |
| Nom | Arden |
| Sous-titre (30 car.) | Sommeil, énergie et dépense |
| Catégorie | Santé et forme |
| Prix | Gratuit |
| URL de confidentialité | https://aurel943.github.io/carnet-de-sante/confidentialite.html |
| URL d'assistance | la page GitHub du projet, ou une adresse de contact |
| Classification par âge | 4+ (aucun contenu sensible) |
| Confidentialité de l'app | **Données non collectées** : rien ne quitte l'appareil, sauf le numéro du code-barres d'un aliment scanné, envoyé sans identifiant à Open Food Facts (base publique) pour trouver le produit ; ce n'est ni une donnée personnelle ni une donnée liée à l'utilisateur |
| Mots-clés (100 car.) | sommeil,récupération,VFC,fréquence cardiaque,muscu,coach,santé,Apple Watch,entraînement,nutrition |

**Description proposée :**

> Arden interprète chaque chiffre de ta montre, comme un coach personnel.
> Il se connecte directement à Apple Santé et se met à jour à chaque ouverture.
>
> Chaque matin, trois scores : dépense, énergie et sommeil, avec le conseil qui va avec :
> quelle intensité viser aujourd'hui, à quelle heure te coucher ce soir.
>
> • Sommeil : score détaillé, phases de la nuit, fréquence cardiaque et VFC nocturnes, dette de sommeil.
> • Énergie : VFC, FC au repos, respiration, température au poignet, comparées à ta propre normale.
> • Dépense : zones cardiaques, charge d'entraînement, journal de muscu, records et 1RM estimé.
> • Nutrition : banque de 3 000 aliments (table Ciqual de l'ANSES), scan des codes-barres (Open Food Facts), repas, protéines, hydratation, besoins caloriques réels.
> • Tendances : bilan santé, VO2 max, poids, mensurations, et ce que révèlent tes données.
> • Dossier médical : rendez-vous, vaccins, analyses, avec rappels.
>
> Privé par conception : pas de compte, pas de serveur, pas de publicité. Tes données restent sur ton iPhone.
>
> Arden n'est pas un dispositif médical et ne remplace pas l'avis d'un professionnel de santé.

**Notes pour l'équipe de revue d'Apple** (champ « Notes » de la version) :

> Aucun compte n'est nécessaire. Au premier lancement, « Connecter Apple Santé » lit les données
> Santé de l'appareil (lecture seule). Sur un appareil sans données Santé, choisir « Explorer avec
> des données de démo » pour voir toutes les fonctions avec deux mois de données fictives.
> Toutes les données restent sur l'appareil ; rien n'est envoyé sur un serveur. Seule exception :
> le scan d'un aliment (Nutrition → Scanner) envoie le numéro du code-barres à Open Food Facts
> pour trouver le produit, sans aucune autre information.

**Captures** : envoyer les fichiers de `docs/app-store/captures/` (1320 × 2868, iPhone 6,9 pouces) ;
Apple les réduit automatiquement pour les autres tailles d'iPhone. Clair ou sombre, au choix.

## Apple Santé en direct (HealthKit)

Dans l'appli iOS, Apple Santé est lu directement : plus besoin du fichier d'export.

- **Premier lancement** : « Connecter Apple Santé » affiche la demande d'autorisation d'iOS, puis
  lit les 13 derniers mois, par tranches de 30 jours (barre de progression en haut de l'écran).
- **Ensuite** : mise à jour automatique à chaque ouverture (et au retour dans l'appli après
  15 minutes), en ne relisant que les derniers jours. Bouton « Synchroniser maintenant » dans
  **Plus → Apple Santé**, la capsule Santé en haut de l'écran, ou en tirant l'écran vers le bas.
- **Lecture seule** : l'appli n'écrit rien dans Apple Santé.
- **Comment ça marche** : le module natif (`HealthSyncPlugin.swift`) renvoie les mesures brutes,
  et `src/healthkit.js` les convertit au format de l'export Apple avant de les passer au même
  analyseur que les fichiers. Sur deux mois de données de test, les résultats sont identiques
  à ceux d'un import de fichier. Seule différence : la fréquence cardiaque est lue en moyenne
  minute par minute, ce qui peut décaler la FC moyenne d'une journée de 1 bpm.
- **Pas disponible en direct** : la VFC recalculée en RMSSD battement par battement (elle
  demande les intervalles entre battements). Elle reste possible avec un fichier d'export, qu'on
  peut toujours importer depuis **Plus → Apple Santé**.
- **Si iOS refuse l'accès**, il ne le dit pas à l'appli : les lectures reviennent simplement
  vides, et l'appli indique où rétablir l'accès (Réglages → Santé → Accès aux données et
  appareils → Arden).

**Tester sur ordinateur** : dans le simulateur (`npm run sim`), cocher **Appli iOS (Apple Santé
simulé)**. L'appli se comporte alors comme sur iPhone, avec un faux HealthKit qui renvoie les
mesures du profil de démo.

**Points à vérifier sur iPhone** (impossibles à tester ici, faute de Mac) : la compilation du
module Swift dans Xcode, la demande d'autorisation, et la durée de la première lecture avec
une vraie Apple Watch (beaucoup plus de mesures que dans les données de test).

## Autres ajouts natifs possibles

Pour aller plus loin : notifications locales (rappel du check-in, heure de coucher conseillée),
retour haptique, widget « scores du jour ».
