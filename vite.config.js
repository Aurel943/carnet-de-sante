import { defineConfig } from 'vite';

// base relative : l'appli fonctionne aussi bien à la racine d'un domaine
// que dans un sous-dossier (GitHub Pages : https://<compte>.github.io/carnet-de-sante/).
export default defineConfig({
  base: './',
  build: { target: 'es2022' },
});
