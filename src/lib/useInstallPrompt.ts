import { useCallback, useEffect, useState } from 'react'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const IOS_KEY = 'ai-roadmap:ios-hint-dismissed'

function isStandalone(): boolean {
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    // iOS Safari reports it here instead.
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  )
}

/**
 * Offer the install once, never nag. Chromium gives us an event; iOS Safari has
 * none, so it gets a one-line hint that stays dismissed.
 */
export function useInstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null)
  const [iosHint, setIosHint] = useState(false)

  useEffect(() => {
    const onBefore = (e: Event) => {
      e.preventDefault()
      setDeferred(e as BeforeInstallPromptEvent)
    }
    const onInstalled = () => setDeferred(null)
    window.addEventListener('beforeinstallprompt', onBefore)
    window.addEventListener('appinstalled', onInstalled)

    const ua = navigator.userAgent
    const isIosSafari = /iPad|iPhone|iPod/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua)
    let dismissed = false
    try {
      dismissed = localStorage.getItem(IOS_KEY) === '1'
    } catch {
      dismissed = false
    }
    if (isIosSafari && !isStandalone() && !dismissed) {
      // Not on load: give them a moment with the roadmap first.
      const t = setTimeout(() => setIosHint(true), 20000)
      return () => {
        clearTimeout(t)
        window.removeEventListener('beforeinstallprompt', onBefore)
        window.removeEventListener('appinstalled', onInstalled)
      }
    }
    return () => {
      window.removeEventListener('beforeinstallprompt', onBefore)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  const prompt = useCallback(async () => {
    if (!deferred) return
    await deferred.prompt()
    await deferred.userChoice
    setDeferred(null)
  }, [deferred])

  const dismissIosHint = useCallback(() => {
    setIosHint(false)
    try {
      localStorage.setItem(IOS_KEY, '1')
    } catch {
      /* storage unavailable */
    }
  }, [])

  return { canInstall: deferred !== null, prompt, iosHint, dismissIosHint }
}
