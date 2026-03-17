import { useEffect, useState } from 'react'

export default function SplashScreen({ onDone }) {
  const [phase, setPhase] = useState(0)

  useEffect(() => {
    const t1 = setTimeout(() => setPhase(1), 300)
    const t2 = setTimeout(() => setPhase(2), 1200)
    const t3 = setTimeout(() => setPhase(3), 2000)
    const t4 = setTimeout(() => onDone(), 2600)
    return () => [t1,t2,t3,t4].forEach(clearTimeout)
  }, [onDone])

  return (
    <div className={`fixed inset-0 z-50 flex flex-col items-center justify-center
      bg-navy-800 transition-opacity duration-500
      ${phase === 3 ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>

      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 rounded-full bg-gold-500/10 blur-3xl animate-pulse-gold" />
        <div className="absolute bottom-1/4 right-1/4 w-80 h-80 rounded-full bg-navy-500/30 blur-3xl animate-pulse-gold" style={{animationDelay:'1s'}} />
      </div>

      <div className={`relative flex flex-col items-center gap-6 transition-all duration-700
        ${phase >= 1 ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>

        <div className="relative">
          <svg width="72" height="72" viewBox="0 0 72 72">
            <polygon
              points="36,4 68,20 68,52 36,68 4,52 4,20"
              fill="none" stroke="#c9a84c" strokeWidth="2"
              className={`transition-all duration-700 ${phase >= 1 ? 'opacity-100' : 'opacity-0'}`}
              style={{ strokeDasharray: 220, strokeDashoffset: phase >= 1 ? 0 : 220, transition: 'stroke-dashoffset 1s ease' }}
            />
            <text x="36" y="42" textAnchor="middle" fill="#c9a84c" fontSize="22" fontFamily="Playfair Display" fontWeight="700">L</text>
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <div className={`w-20 h-20 rounded-full border border-gold-500/20 transition-all duration-1000
              ${phase >= 1 ? 'scale-100 opacity-100' : 'scale-50 opacity-0'}`}
              style={{ animation: phase >= 1 ? 'spin 8s linear infinite' : 'none' }} />
          </div>
        </div>

        <div className={`text-center transition-all duration-500 delay-300
          ${phase >= 1 ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
          <h1 className="font-serif text-4xl font-bold text-white tracking-wide">
            Lex<span className="text-gold-500">Retriever</span>
          </h1>
          <p className={`mt-2 text-navy-300 text-sm tracking-widest uppercase font-light transition-all duration-500
            ${phase >= 2 ? 'opacity-100' : 'opacity-0'}`}>
            AI Legal Research Assistant
          </p>
        </div>

        <div className={`w-48 h-0.5 bg-navy-600 rounded-full overflow-hidden transition-all duration-500
          ${phase >= 2 ? 'opacity-100' : 'opacity-0'}`}>
          <div className={`h-full bg-gold-500 rounded-full transition-all duration-700
            ${phase >= 2 ? 'w-full' : 'w-0'}`} />
        </div>
      </div>
    </div>
  )
}