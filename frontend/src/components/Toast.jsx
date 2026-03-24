import { useEffect, useState } from 'react'
import { Check } from 'lucide-react'

/**
 * Toast
 * Shows a brief "Citation copied" popup at bottom-right.
 * Props:
 *   visible  — controls whether the toast is shown
 *   message  — text to display (default: 'Citation copied to clipboard')
 */
export default function Toast({ visible, message = 'Citation copied to clipboard' }) {
  const [rendered, setRendered] = useState(false)

  useEffect(() => {
    if (visible) {
      setRendered(true)
    } else {
      // Keep in DOM during fade-out (300 ms)
      const t = setTimeout(() => setRendered(false), 300)
      return () => clearTimeout(t)
    }
  }, [visible])

  if (!rendered) return null

  return (
    <div
      className={`fixed bottom-6 right-6 z-[9999] flex items-center gap-2
        px-4 py-2.5 rounded-xl shadow-lg text-sm font-medium
        bg-navy-800 dark:bg-navy-700 text-white
        border border-navy-700 dark:border-navy-600
        transition-all duration-300
        ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'}`}
    >
      <span className="flex items-center justify-center w-5 h-5 rounded-full bg-emerald-500 flex-shrink-0">
        <Check size={11} strokeWidth={3} />
      </span>
      {message}
    </div>
  )
}
