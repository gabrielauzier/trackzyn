import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'
import { defineConfig, loadEnv, type Plugin } from 'vite'
import { resolveAppVersion } from './build/version.ts'

function getFrontendHost(frontendUrl?: string) {
  if (!frontendUrl) return []
  const withoutProto = frontendUrl.replace(/^https?:\/\//, '')
  return [withoutProto.split(/[:/]/)[0]]
}

/**
 * The desktop renderer runs under a `default-src 'self'` CSP and must render
 * offline, so it drops the Google Fonts requests (the CSS font stack falls
 * back to Inter and the system font). The web build keeps them.
 */
function stripGoogleFonts(): Plugin {
  return {
    name: 'trackzyn-desktop-strip-google-fonts',
    enforce: 'pre',
    transformIndexHtml: (html) => html.replace(/^[ \t]*<link[^>]*fonts\.(googleapis|gstatic)\.com[^>]*>\r?\n/gm, ''),
    transform: (code, id) =>
      id.split('?')[0].endsWith('.css') && code.includes('fonts.googleapis.com')
        ? { code: code.replace(/^@import url\(['"]https:\/\/fonts\.googleapis\.com[^)]*\);?\r?\n/gm, ''), map: null }
        : null,
  }
}

export default defineConfig(async ({ mode }) => {
  const env = loadEnv(mode, import.meta.dirname, '')
  const frontendUrl = env.FRONTEND_URL || process.env.FRONTEND_URL
  const backendUrl = env.BACKEND_URL || process.env.BACKEND_URL
  const appVersionRoot = env.APP_VERSION_ROOT || process.env.APP_VERSION_ROOT
  const appVersion = await resolveAppVersion(
    appVersionRoot || import.meta.dirname,
    env.VITE_APP_VERSION || process.env.VITE_APP_VERSION,
  )

  return {
    define: {
      __APP_VERSION__: JSON.stringify(appVersion),
      // True only for the Electron renderer build (`vite build --mode desktop`);
      // lets the web bundle drop every reference to `window.trackzyn`.
      __DESKTOP_BUILD__: JSON.stringify(mode === 'desktop'),
    },
    build: {
      // The desktop build must not overwrite the web build in `dist/`.
      outDir: mode === 'desktop' ? 'dist-desktop' : 'dist',
      // Keep the existing per-chunk budget; optional locales load on demand.
      chunkSizeWarningLimit: 1000,
      // Emit hashed JS/CSS into `static/` instead of Vite's default `assets/`,
      // so an app route named `/assets` never collides with the build dir
      // under nginx's `try_files $uri $uri/ /index.html`.
      assetsDir: 'static',
    },
    plugins: [...(mode === 'desktop' ? [stripGoogleFonts()] : []), react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname, './src'),
      },
    },
    server: {
      port: 5173,
      host: '0.0.0.0',
      allowedHosts: getFrontendHost(frontendUrl),
      proxy: {
        '/api': {
          target: backendUrl ?? 'http://localhost:8000',
          changeOrigin: true,
        },
      },
      watch: {
        usePolling: true,
      },
    },
  }
})
