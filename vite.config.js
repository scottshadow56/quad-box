import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import tailwindcss from '@tailwindcss/vite'
import process from 'process'

export default defineConfig({
  plugins: [
    tailwindcss(),
    svelte(),
  ],
  base: process.env.BASE_PATH || './',
  server: {
    host: '0.0.0.0', // This is often necessary for Replit to work correctly
    allowedHosts: [
      'quad-box-production.up.railway.app'
    ]
  }
})
