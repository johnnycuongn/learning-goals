import { useCallback, useEffect, useState } from 'react'
import { isDesktop } from './lib/platform'
import { go, useRoute } from './lib/router'
import { useTheme } from './lib/useTheme'
import { Dashboard } from './pages/Dashboard'
import { NewRoadmap } from './pages/NewRoadmap'
import { RoadmapPage } from './pages/RoadmapPage'
import { SettingsPage } from './pages/SettingsPage'
import { refreshIfDue } from './lib/briefing'

export default function App() {
  const route = useRoute()
  const { theme, toggle } = useTheme()
  const [error, setError] = useState<string | null>(null)

  const onError = useCallback((m: string) => setError(m), [])
  useEffect(() => {
    if (!error) return
    const t = setTimeout(() => setError(null), 9000)
    return () => clearTimeout(t)
  }, [error])

  // The daily "This week" refresh: on open, then every five minutes while open.
  useEffect(() => {
    if (!isDesktop) return
    void refreshIfDue()
    const t = setInterval(() => void refreshIfDue(), 5 * 60_000)
    return () => clearInterval(t)
  }, [])

  if (!isDesktop) {
    return (
      <div className="authwrap">
        <div className="card">
          <h1 className="h2">Learning Goals is a desktop app</h1>
          <p className="lede">Your roadmaps live in a database file on your Mac, so this page can't open them in a browser. Run <code>npm run app</code> instead, or install the app from the DMG.</p>
        </div>
      </div>
    )
  }

  return (
    <>
      {route.page === 'home' && <Dashboard onError={onError} />}
      {route.page === 'new' && <NewRoadmap onError={onError} />}
      {route.page === 'settings' && <SettingsPage onError={onError} />}
      {route.page === 'roadmap' && <RoadmapPage id={route.id} view={route.view} target={route.target} onError={onError} />}

      <div className="corner">
        <button type="button" className="iconbtn" onClick={toggle} aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}>{theme === 'dark' ? '☀' : '☾'}</button>
        <button type="button" className="iconbtn" onClick={() => go({ page: 'settings' })} aria-label="Settings">⚙</button>
      </div>

      {error && (
        <div className="toast" role="alert">
          <span>{error}</span>
          <button type="button" className="iconbtn" onClick={() => setError(null)}>Dismiss</button>
        </div>
      )}
    </>
  )
}
