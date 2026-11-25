import { defineConfig } from 'vite';
import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

// base relative : l'appli fonctionne aussi bien à la racine d'un domaine
// que dans un sous-dossier (GitHub Pages : https://<compte>.github.io/carnet-de-sante/)
// et dans l'appli iOS (Capacitor).
export default defineConfig({
  base: './',
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  build: {
    target: 'es2022',
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        simulateur: resolve(import.meta.dirname, 'simulateur.html'),
        confidentialite: resolve(import.meta.dirname, 'confidentialite.html'),
      },
    },
  },
});
