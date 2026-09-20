import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// One codebase, two shells: the Tauri desktop app (full editing + AI) and a
// read-only web viewer. Tauri expects a fixed dev port.
export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: { port: 1420, strictPort: true },
  build: { target: 'es2020', sourcemap: false },
})
