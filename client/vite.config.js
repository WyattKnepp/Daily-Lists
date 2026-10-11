import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/lists': 'http://localhost:3001',
      '/list': 'http://localhost:3001',
      '/meta': 'http://localhost:3001',
      '/recurring': 'http://localhost:3001',
      '/gcal': 'http://localhost:3001',
    },
  },
})
