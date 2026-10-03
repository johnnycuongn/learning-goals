import { useEffect, useState } from 'react'
import type { View } from './types'

export type Route =
  | { page: 'home' }
  | { page: 'new' }
  | { page: 'settings' }
  | { page: 'roadmap'; id: string; view: View; target: string | null }

export function parse(hash: string): Route {
  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean)
  if (parts[0] === 'new') return { page: 'new' }
  if (parts[0] === 'settings') return { page: 'settings' }
  if (parts[0] === 'r' && parts[1]) {
    return {
      page: 'roadmap',
      id: parts[1],
      view: parts[2] === 'resources' ? 'resources' : 'topics',
      target: parts[3] ?? null,
    }
  }
  return { page: 'home' }
}

export function format(r: Route): string {
  if (r.page === 'new') return '#/new'
  if (r.page === 'settings') return '#/settings'
  if (r.page === 'roadmap') return `#/r/${r.id}/${r.view}${r.target ? `/${r.target}` : ''}`
  return '#/'
}

/** Pages push (so Back works with no browser chrome); panel changes replace. */
export function go(r: Route, replace = false) {
  const next = format(r)
  if (next === window.location.hash) return
  if (replace) window.history.replaceState(null, '', next)
  else window.history.pushState(null, '', next)
  window.dispatchEvent(new Event('app:route'))
}

export function useRoute(): Route {
  const [route, set] = useState<Route>(() => parse(window.location.hash))
  useEffect(() => {
    const read = () => set(parse(window.location.hash))
    for (const e of ['hashchange', 'popstate', 'app:route']) window.addEventListener(e, read)
    return () => {
      for (const e of ['hashchange', 'popstate', 'app:route']) window.removeEventListener(e, read)
    }
  }, [])
  return route
}
