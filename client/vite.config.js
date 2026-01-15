import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';


export default defineConfig({
 
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon.png'],
      manifest: {
        name: 'SSC Impon Jewellery',      // <--- Fixed Full Name
        short_name: 'SSC Impon',          // <--- Fixed App Name (Home Screen)
        description: 'SSC Impon Jewellery Store App',
        theme_color: '#D4AF37',           // <--- Matched your Gold theme
        background_color: '#ffffff',
        display: 'standalone',            // <--- Forces "App" mode (no URL bar)
        start_url: '/',                   // <--- Ensures it opens the homepage
        orientation: 'portrait',
        icons: [
          {
            src: '/logo.webp', 
            sizes: '192x192',
            type: 'image/webp',
            purpose: 'any maskable'
          },
          {
            src: '/logo.webp',
            sizes: '512x512',
            type: 'image/webp',
            purpose: 'any maskable'
          }
        ]
      },
      workbox: {
        // This ensures the SW cleans up old files aggressively
        cleanupOutdatedCaches: true,
        skipWaiting: true,
        clientsClaim: true,
        // 3. Ensure the index.html is never cached blindly
        navigateFallback: 'index.html',
        navigateFallbackDenylist: [/^\/api/], // Don't cache API calls
      }
    })
  ],
});