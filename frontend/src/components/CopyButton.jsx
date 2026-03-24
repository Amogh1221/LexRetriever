import { Check, Copy } from 'lucide-react'
import { useCopyToClipboard } from '../hooks/useCopyToClipboard'

/**
 * CopyButton
 * Props:
 *   text      — the string to copy
 *   label     — button label when idle   (default: 'Copy citation')
 *   className — extra classes for the button element
 */
export default function CopyButton({ text, label = 'Copy citation', className = '', onCopy }) {
  const [copied, copy] = useCopyToClipboard(2000)

  const handleClick = () => {
    copy(text)
    onCopy?.()
  }

  return (
    <button
      onClick={handleClick}
      title={copied ? 'Copied!' : label}
      className={`flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg font-medium
        transition-all duration-200 border select-none
        ${copied
          ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 border-emerald-300 dark:border-emerald-700'
          : 'bg-navy-50 dark:bg-navy-700/50 text-navy-500 dark:text-navy-400 border-navy-200 dark:border-navy-600 hover:bg-navy-100 dark:hover:bg-navy-700 hover:text-navy-700 dark:hover:text-navy-200'
        } ${className}`}
    >
      {copied
        ? <><Check size={11} className="flex-shrink-0" />Copied!</>
        : <><Copy  size={11} className="flex-shrink-0" />{label}</>
      }
    </button>
  )
}
