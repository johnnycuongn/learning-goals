import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// The frontend of the Learning Goals desktop app. Tauri expects a fixed dev port.
export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: { port: 1420, strictPort: true },
  build: { target: 'es2020', sourcemap: false },
})
