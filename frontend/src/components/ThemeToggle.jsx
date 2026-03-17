import { useState, useRef, useEffect } from 'react'
import { Sun, Moon, Monitor, ChevronDown } from 'lucide-react'
import { useTheme } from './ThemeContext'

const OPTIONS = [
  { value: 'light',  label: 'Light',  Icon: Sun     },
  { value: 'dark',   label: 'Dark',   Icon: Moon    },
  { value: 'system', label: 'System', Icon: Monitor },
]

export default function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  // Close on outside click
  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const current = OPTIONS.find(o => o.value === theme) ?? OPTIONS[2]
  const { Icon } = current

  return (
    <div ref={ref} className="relative flex-shrink-0">
      <button
        onClick={() => setOpen(o => !o)}
        aria-label="Change colour theme"
        className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium
          border border-navy-200 dark:border-navy-600
          bg-white dark:bg-navy-700
          text-navy-500 dark:text-navy-200
          hover:bg-navy-50 dark:hover:bg-navy-600
          shadow-sm transition-all duration-200 select-none"
      >
        <Icon size={13} strokeWidth={2} />
        <span className="hidden sm:inline text-xs">{current.label}</span>
        <ChevronDown
          size={11}
          strokeWidth={2.5}
          className={`transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div
          className="absolute right-0 mt-1.5 w-36 z-[200] animate-slide-down
            bg-white dark:bg-navy-800
            border border-navy-100 dark:border-navy-600
            rounded-xl shadow-xl overflow-hidden"
        >
          {OPTIONS.map(({ value, label, Icon: Ico }) => {
            const active = theme === value
            return (
              <button
                key={value}
                onClick={() => { setTheme(value); setOpen(false) }}
                className={`w-full flex items-center gap-2.5 px-4 py-2.5 text-xs font-medium
                  transition-colors duration-150
                  ${active
                    ? 'bg-gold-500/15 dark:bg-gold-500/20 text-gold-600 dark:text-gold-400'
                    : 'text-navy-600 dark:text-navy-300 hover:bg-navy-50 dark:hover:bg-navy-700'
                  }`}
              >
                <Ico size={13} strokeWidth={2} />
                <span>{label}</span>
                {active && (
                  <span className="ml-auto w-1.5 h-1.5 rounded-full bg-gold-500" />
                )}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}