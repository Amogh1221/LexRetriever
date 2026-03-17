import { useState, useCallback } from 'react'
import { ThemeProvider } from './components/ThemeContext'
import SplashScreen from './components/SplashScreen'
import LandingInput from './components/LandingInput'
import ResultsView  from './components/ResultsView'

export default function App() {
  const [showSplash, setShowSplash] = useState(true)
  const [view, setView]             = useState('landing') // 'landing' | 'results'
  const [results, setResults]       = useState([])
  const [caseText, setCaseText]     = useState('')

  const handleResults = useCallback((res) => {
    setResults(res)
    setView('results')
  }, [])

  const handleBack = useCallback(() => {
    setView('landing')
    setResults([])
  }, [])

  return (
    <ThemeProvider>
      {showSplash && <SplashScreen onDone={() => setShowSplash(false)} />}

      {view === 'landing' && (
        <LandingInput
          onResults={handleResults}
          onCaseText={setCaseText}
        />
      )}

      {view === 'results' && (
        <ResultsView
          results={results}
          caseText={caseText}
          onBack={handleBack}
        />
      )}
    </ThemeProvider>
  )
}