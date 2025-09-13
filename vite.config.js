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
      '4bbd29e2-efde-47dc-8b80-4d60d1f81038-00-265c14xc55rjy.riker.replit.dev',
      // You can add more hosts here if needed
    ]
  }
})
