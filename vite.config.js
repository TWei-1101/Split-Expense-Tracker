import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['apple-touch-icon-192.png', 'apple-touch-icon-512.png'],
      manifest: {
        name: '分帳記帳簿',
        short_name: '分帳記帳簿',
        description: '多人分帳與旅遊記帳工具',
        lang: 'zh-TW',
        theme_color: '#2563eb',
        background_color: '#f8fafc',
        display: 'standalone',
        icons: [
          { src: 'apple-touch-icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'apple-touch-icon-512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
      workbox: {
        navigateFallback: '/index.html',
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
      },
    }),
  ],
})
