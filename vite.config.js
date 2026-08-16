import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// GitHub Pages servește sub /anti-monopoly/
export default defineConfig({
  base: '/anti-monopoly/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['apple-touch-icon.png'],
      manifest: {
        name: 'Anti-Monopoly',
        short_name: 'Anti-Monopoly',
        description: 'Competiție vs Cartel — jocul secolului 21.',
        theme_color: '#16181A',
        background_color: '#E7E6E1',
        display: 'standalone',
        orientation: 'portrait',
        scope: '/anti-monopoly/',
        start_url: '/anti-monopoly/',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
});
