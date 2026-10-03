/**
 * Learning Goals only runs as the desktop app: the database is a file on this
 * Mac and the AI is a CLI on this Mac. Opened in a plain browser (say, with
 * `npm run dev`), it shows a note instead of half-working.
 */
export const isDesktop = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
export const canEdit = isDesktop

export async function openExternal(url: string) {
  if (isDesktop) {
    const { openUrl } = await import('@tauri-apps/plugin-opener')
    await openUrl(url)
  } else {
    window.open(url, '_blank', 'noopener,noreferrer')
  }
}
