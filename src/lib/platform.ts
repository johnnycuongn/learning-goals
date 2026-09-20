/**
 * One codebase, two shells. The desktop app (Tauri) can edit and can run the
 * AI, because the AI is the Claude Code CLI on this machine. The web build is a
 * viewer: same data, read-only, and no AI configuration at all.
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
