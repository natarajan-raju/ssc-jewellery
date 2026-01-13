import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'masked-icon.svg'],
      manifest: {
        name: 'SSC Impon Admin',
        short_name: 'SSC Admin',
        description: 'SSC Impon Jewellery Store Admin Dashboard',
        theme_color: '#0A192F',
        icons: [
          {
            src: '/logo.webp', // You need to add these images later
            sizes: '192x192',
            type: 'image/webp'
          },
          {
            src: '/logo.webp',
            sizes: '512x512',
            type: 'image/webp'
          }
        ]
      }
    })
  ],
});