/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        gold: {
          300: '#f0d080',
          400: '#e8c050',
          500: '#c9a84c',
          600: '#a07830',
        },
        navy: {
          50:  '#f0f4ff',
          100: '#e0e8ff',
          200: '#c0d0f0',
          300: '#8090c0',
          400: '#506090',
          500: '#2a3a5c',
          600: '#1e2d4a',
          700: '#152238',
          800: '#0e1828',
          900: '#080f1a',
        }
      },
      fontFamily: {
        serif:  ['"Playfair Display"', 'Georgia', 'serif'],
        sans:   ['"DM Sans"', 'system-ui', 'sans-serif'],
        mono:   ['"DM Mono"', 'monospace'],
      },
      animation: {
        'fade-in':    'fadeIn 0.4s ease forwards',
        'slide-up':   'slideUp 0.4s ease forwards',
        'slide-down': 'slideDown 0.3s ease forwards',
        'scale-in':   'scaleIn 0.3s ease forwards',
        'spin-slow':  'spin 3s linear infinite',
        'pulse-gold': 'pulseGold 2s ease-in-out infinite',
        'shimmer':    'shimmer 1.5s infinite',
        'bounce-dot': 'bounceDot 1.2s infinite',
      },
      keyframes: {
        fadeIn:    { from: { opacity: 0 }, to: { opacity: 1 } },
        slideUp:   { from: { opacity: 0, transform: 'translateY(20px)' }, to: { opacity: 1, transform: 'translateY(0)' } },
        slideDown: { from: { opacity: 0, transform: 'translateY(-10px)' }, to: { opacity: 1, transform: 'translateY(0)' } },
        scaleIn:   { from: { opacity: 0, transform: 'scale(0.95)' }, to: { opacity: 1, transform: 'scale(1)' } },
        pulseGold: { '0%,100%': { opacity: 1 }, '50%': { opacity: 0.5 } },
        shimmer:   { '0%': { backgroundPosition: '-200% 0' }, '100%': { backgroundPosition: '200% 0' } },
        bounceDot: { '0%,60%,100%': { transform: 'translateY(0)', opacity: 0.4 }, '30%': { transform: 'translateY(-6px)', opacity: 1 } },
      }
    },
  },
  plugins: [],
}