import { useMemo } from 'react'
import DOMPurify from 'dompurify'
import { marked } from 'marked'
import { openExternal } from '../lib/platform'

/** Notes are the person's own, but still sanitised: pasted HTML should never run script. */
export function Markdown({ source }: { source: string }) {
  const html = useMemo(
    () => DOMPurify.sanitize(marked.parse(source, { async: false, gfm: true, breaks: true }) as string),
    [source],
  )
  return (
    <div
      className="md"
      onClick={(e) => {
        const a = (e.target as HTMLElement).closest('a')
        if (a?.href) {
          e.preventDefault()
          void openExternal(a.href)
        }
      }}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}
