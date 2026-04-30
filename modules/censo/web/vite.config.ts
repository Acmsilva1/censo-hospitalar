import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    dedupe: ['react', 'react-dom'],
  },
  server: {
    port: 5278,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://localhost:3212',
        changeOrigin: true,
      },
      '/socket.io': {
        target: 'http://localhost:3212',
        ws: true,
      },
    },
  },
})
