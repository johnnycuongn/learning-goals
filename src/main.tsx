import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { isDesktop } from './lib/platform'
import './styles/tokens.css'
import './styles/app.css'
import './styles/pages.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Web production build only. Never on the dev server, and never inside the
// desktop app, where a cached shell would just hide new builds.
if (import.meta.env.PROD && !isDesktop && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => undefined)
  })
}
