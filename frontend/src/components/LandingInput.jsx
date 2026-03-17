import { useState, useRef, useEffect } from 'react'
import { Mic, MicOff, Upload, Search, Scale, X, FileText, Eye } from 'lucide-react'
import ThemeToggle from './ThemeToggle'

const API = '/api'

export default function LandingInput({ onResults, onCaseText }) {
  const [text, setText] = useState('')
  const [fileName, setFileName] = useState('')
  const [pdfFile, setPdfFile] = useState(null)
  const [pdfUrl, setPdfUrl] = useState('')
  const [showPdfPreview, setShowPdfPreview] = useState(false)
  const [listening, setListening] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [mounted, setMounted] = useState(false)
  const fileRef = useRef()
  const textRef = useRef()
  const mediaRef = useRef()

  useEffect(() => { setTimeout(() => setMounted(true), 100) }, [])
  useEffect(() => { return () => { if (pdfUrl) URL.revokeObjectURL(pdfUrl) } }, [pdfUrl])

  const toggleVoice = () => {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      setError('Voice input is not supported in this browser. Please use Chrome.')
      return
    }
    if (listening) { mediaRef.current?.stop(); setListening(false); return }
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    const rec = new SR()
    rec.continuous = true; rec.interimResults = true; rec.lang = 'en-IN'
    rec.onresult = (e) => setText(Array.from(e.results).map(r => r[0].transcript).join(' '))
    rec.onerror = () => { setListening(false); setError('Voice recognition failed.') }
    rec.onend = () => setListening(false)
    mediaRef.current = rec; rec.start(); setListening(true); setError('')
  }

  const handleFile = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    if (pdfUrl) URL.revokeObjectURL(pdfUrl)
    const url = URL.createObjectURL(file)
    setPdfFile(file); setPdfUrl(url); setFileName(file.name)
    setLoading(true); setError('')
    try {
      const fd = new FormData(); fd.append('file', file)
      const r = await fetch(`${API}/extract-pdf`, { method: 'POST', body: fd })
      if (!r.ok) throw new Error()
      const data = await r.json()
      setText(data.text || '')
    } catch { setError('Could not extract PDF. Please type your case description manually.') }
    finally { setLoading(false) }
  }

  const handleSearch = async () => {
    if (!text.trim()) { setError('Please describe your case first.'); return }
    setLoading(true); setError('')
    try {
      const r = await fetch(`${API}/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: text, top_k: 10 })
      })
      if (!r.ok) throw new Error()
      const data = await r.json()
      onCaseText(text); onResults(data.results || [], text)
    } catch { setError('Search failed. Make sure the backend is running at localhost:8000') }
    finally { setLoading(false) }
  }

  const handleKey = (e) => { if (e.key === 'Enter' && e.ctrlKey) handleSearch() }

  const clearAll = () => {
    setText(''); setFileName(''); setPdfFile(null)
    if (pdfUrl) URL.revokeObjectURL(pdfUrl)
    setPdfUrl(''); setShowPdfPreview(false)
  }

  return (
    <div className="min-h-screen flex flex-col
      bg-gradient-to-br from-navy-50 via-white to-navy-100
      dark:from-navy-900 dark:via-[#0a1220] dark:to-navy-900
      transition-colors duration-300">

      {/* PDF Preview Modal */}
      {showPdfPreview && pdfUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-navy-800 rounded-2xl shadow-2xl w-[90vw] h-[90vh] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3.5
              border-b border-navy-100 dark:border-navy-700 bg-navy-800">
              <div className="flex items-center gap-2">
                <FileText size={15} className="text-gold-400" />
                <span className="font-serif font-semibold text-white text-sm truncate max-w-lg">{fileName}</span>
              </div>
              <button onClick={() => setShowPdfPreview(false)}
                className="p-1.5 rounded-lg text-navy-300 hover:text-white hover:bg-white/10 transition-colors">
                <X size={16} />
              </button>
            </div>
            <iframe src={pdfUrl} className="flex-1 w-full" title={fileName} />
          </div>
        </div>
      )}

      {/* ── Header ── */}
      <header className="flex items-center justify-between px-8 py-5">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-navy-800 dark:bg-navy-700 flex items-center justify-center"
            style={{ clipPath: 'polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)' }}>
            <span className="text-gold-500 font-serif font-bold text-sm">L</span>
          </div>
          <span className="font-serif font-bold text-navy-800 dark:text-white text-xl tracking-wide">
            Lex<span className="text-gold-500">Retriever</span>
          </span>
        </div>
        <div className="flex items-center gap-3">
          <div className="hidden sm:flex items-center gap-2 text-xs text-navy-400">
            <Scale size={13} />
            <span>Supreme Court of India · 13,500+ Judgements</span>
          </div>
          <ThemeToggle />
        </div>
      </header>

      {/* ── Hero ── */}
      <div className={`flex-1 flex flex-col items-center justify-center px-4 pb-16
        transition-all duration-700 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>

        <div className="text-center mb-10 max-w-xl">
          <h1 className="font-serif text-5xl font-bold text-navy-800 dark:text-white leading-tight text-balance mb-4">
            Find the right<br />
            <span className="text-gold-500">precedents</span> instantly
          </h1>
        </div>

        {/* Main input card */}
        <div className={`w-full max-w-2xl rounded-2xl shadow-xl overflow-hidden
          bg-white dark:bg-navy-800
          border border-navy-100 dark:border-navy-700
          shadow-navy-200/40 dark:shadow-black/40
          transition-all duration-700 delay-200 ${mounted ? 'opacity-100 scale-100' : 'opacity-0 scale-95'}`}>

          {fileName && (
            <div className="flex items-center gap-2 px-5 pt-4 pb-0">
              <div className="flex items-center gap-2 bg-gold-500/10 border border-gold-400/30
                rounded-xl px-3 py-2 text-xs text-gold-700 dark:text-gold-400 flex-1 min-w-0">
                <FileText size={12} className="text-gold-500 flex-shrink-0" />
                <span className="truncate font-mono">{fileName}</span>
                <button onClick={() => setShowPdfPreview(true)}
                  className="ml-auto flex items-center gap-1 text-gold-600 dark:text-gold-400
                    hover:text-gold-800 dark:hover:text-gold-300 font-medium flex-shrink-0 transition-colors">
                  <Eye size={11} /> View PDF
                </button>
              </div>
            </div>
          )}

          <div className="relative">
            <textarea
              ref={textRef}
              value={text}
              onChange={e => setText(e.target.value)}
              onKeyDown={handleKey}
              placeholder={`Describe the legal issue, facts of the case, or relevant statutes…\nE.g. 'Dispute over mortgage by deposit of title deeds under Section 58(f) of the Transfer of Property Act…'`}
              className="w-full min-h-44 max-h-64 resize-none px-6 pt-5 pb-4 text-sm outline-none leading-relaxed
                bg-transparent
                text-navy-700 dark:text-navy-100
                placeholder-navy-300 dark:placeholder-navy-500
                border-b border-navy-100 dark:border-navy-700
                transition-colors duration-200"
            />
            {listening && (
              <div className="absolute top-4 right-4 flex items-center gap-2
                bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700
                text-red-500 dark:text-red-400 text-xs px-3 py-1.5 rounded-full">
                <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" /> Listening…
              </div>
            )}
            <div className="absolute bottom-3 right-4 text-xs text-navy-300 dark:text-navy-500 font-mono">
              {text.length.toLocaleString()} chars
            </div>
          </div>

          <div className="flex items-center gap-3 px-5 py-4">
            <button onClick={toggleVoice}
              className={`relative flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200
                ${listening
                  ? 'bg-red-500 text-white shadow-lg shadow-red-200 dark:shadow-red-900/40'
                  : 'bg-navy-50 dark:bg-navy-700 text-navy-500 dark:text-navy-300 hover:bg-navy-100 dark:hover:bg-navy-600 border border-navy-200 dark:border-navy-600'
                }`}>
              {listening ? (
                <><span className="absolute inset-0 rounded-xl bg-red-400 voice-ripple" />
                  <span className="absolute inset-0 rounded-xl bg-red-400 voice-ripple-2" />
                  <MicOff size={14} className="relative z-10" />
                  <span className="relative z-10">Stop</span></>
              ) : (<><Mic size={14} />Voice</>)}
            </button>

            <button onClick={() => fileRef.current.click()}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium
                bg-navy-50 dark:bg-navy-700 text-navy-500 dark:text-navy-300
                hover:bg-navy-100 dark:hover:bg-navy-600
                border border-navy-200 dark:border-navy-600 transition-all duration-200">
              <Upload size={14} />
              {fileName ? 'Replace PDF' : 'Upload PDF'}
            </button>
            <input ref={fileRef} type="file" accept=".pdf" onChange={handleFile} className="hidden" />

            {(text || fileName) && (
              <button onClick={clearAll}
                className="p-2 rounded-xl text-navy-400 dark:text-navy-500
                  hover:text-navy-600 dark:hover:text-navy-300
                  hover:bg-navy-50 dark:hover:bg-navy-700 transition-colors">
                <X size={14} />
              </button>
            )}

            <button onClick={handleSearch} disabled={loading || !text.trim()}
              className="ml-auto flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-semibold
                bg-navy-800 dark:bg-navy-600 text-white
                hover:bg-navy-700 dark:hover:bg-navy-500
                disabled:opacity-40 disabled:cursor-not-allowed
                transition-all duration-200 shadow-md shadow-navy-300/30 dark:shadow-black/30">
              {loading ? (
                <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Searching…</>
              ) : (
                <><Search size={14} />Find Citations
                  <span className="text-navy-400 dark:text-navy-300 text-xs font-normal ml-1">Ctrl+Enter</span></>
              )}
            </button>
          </div>
        </div>

        {error && (
          <div className="mt-4 flex items-center gap-2 text-sm
            text-red-500 dark:text-red-400
            bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800
            px-4 py-2.5 rounded-xl animate-slide-down">
            <X size={14} />{error}
          </div>
        )}

        <div className={`mt-8 flex flex-wrap items-center justify-center gap-3
          transition-all duration-700 delay-300 ${mounted ? 'opacity-100' : 'opacity-0'}`}>
          {['Mortgage disputes', 'Section 420 IPC', 'Land partition', 'Bail conditions', 'Contract breach'].map(hint => (
            <button key={hint} onClick={() => setText(hint)}
              className="flex items-center gap-1.5 px-3 py-1.5
                bg-white dark:bg-navy-800 border border-navy-200 dark:border-navy-700
                text-navy-500 dark:text-navy-300 text-xs rounded-full
                hover:border-gold-400 hover:text-gold-600 dark:hover:border-gold-500/60 dark:hover:text-gold-400
                transition-all duration-200 shadow-sm">
              <FileText size={10} />{hint}
            </button>
          ))}
        </div>
      </div>

      <div className="text-center py-4 text-xs text-navy-300 dark:text-navy-600">
        Supreme Court of India · 13,500+ Judgements
      </div>
    </div>
  )
}