import { defineConfig } from 'electron-vite'
import { isSignedBuild } from './src/main/signed-build'

// Only the main and preload bundles are built here. The renderer is the
// frontend's own `vite build --mode desktop` output (frontend/dist-desktop),
// served by the app:// protocol, so aliases, Tailwind and i18n stay in one place.
export default defineConfig({
  main: {
    // Only a build made with TRACKZYN_DESKTOP_SIGNED=true (the release workflow
    // with signing secrets) may start the auto updater.
    define: { __SIGNED_BUILD__: JSON.stringify(isSignedBuild(process.env)) },
    build: { rollupOptions: { input: { index: 'src/main/index.ts' } } },
  },
  preload: {
    build: { rollupOptions: { input: { index: 'src/preload/index.ts' } } },
  },
})
