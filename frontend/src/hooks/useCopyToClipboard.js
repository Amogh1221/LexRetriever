import { useState, useCallback } from 'react'

/**
 * useCopyToClipboard
 * Returns [copied, copy] where:
 *   copied — true for `resetMs` ms after a successful copy
 *   copy(text) — writes text to clipboard and flips `copied`
 */
export function useCopyToClipboard(resetMs = 2000) {
  const [copied, setCopied] = useState(false)

  const copy = useCallback(async (text) => {
    if (!text) return
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), resetMs)
    } catch (err) {
      console.error('Copy failed:', err)
    }
  }, [resetMs])

  return [copied, copy]
}
