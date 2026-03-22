import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { Search, Filter, Bookmark, FileDown, X, GitCompare, Calendar, Loader, Download, ChevronDown } from 'lucide-react'
import CitationCard from './CitationCard'
import ChatBot from './ChatBot'
import ThemeToggle from './ThemeToggle'

const API = '/api'
const PAGE_SIZE = 10

const DECADES = [
  { label: 'All',      from: null, to: null },
  { label: 'Pre-1980', from: 1900, to: 1979 },
  { label: '1980s',    from: 1980, to: 1989 },
  { label: '1990s',    from: 1990, to: 1999 },
  { label: '2000s',    from: 2000, to: 2009 },
  { label: '2010s',    from: 2010, to: 2019 },
  { label: '2020s',    from: 2020, to: 2029 },
]
// ── Export Modal ──────────────────────────────────────────────────────────────
function ExportModal({ results, caseText, bookmarks, onClose }) {
  const [phase, setPhase] = useState('idle')   // idle | generating | done | error
  const [progress, setProgress] = useState(0)
  const [summaries, setSummaries] = useState([])
  const [reportText, setReportText] = useState('')

  const top10 = results.slice(0, 10)

  const cleanName = (r) =>
    (r.file_name || 'Unknown').replace(/_/g, ' ').replace(/\s+on\s+\d+.*$/i, '').trim()

  const generateReport = async () => {
    setPhase('generating')
    setProgress(0)
    const generated = []

    for (let i = 0; i < top10.length; i++) {
      const doc = top10[i]
      const name = cleanName(doc)
      setProgress(i + 1)

      try {
        const r = await fetch(`${API}/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: `You are a legal research assistant. Given the user's case and a retrieved judgement, do two things in plain text (no markdown):

1. SUMMARY (2-3 sentences): Summarize the key legal holding and facts of this judgement.
2. SIMILARITY (2-3 sentences): Explain specifically how and why this judgement is similar or relevant to the user's case.

Keep it concise and professional.`,
            context: `USER'S CASE:\n${caseText?.slice(0, 1000)}\n\nJUDGEMENT: ${name}\n${doc.content?.slice(0, 2000)}`,
          })
        })
        const data = await r.json()
        generated.push({ name, year: doc.year, score: doc.score, text: data.reply || 'Could not generate.' })
      } catch {
        generated.push({ name, year: doc.year, score: doc.score, text: 'Generation failed.' })
      }
    }

    setSummaries(generated)

    // Build full report text
    const lines = []
    lines.push('LEXMIND — LEGAL RESEARCH REPORT')
    lines.push('═'.repeat(60))
    lines.push(`Generated: ${new Date().toLocaleString()}`)
    lines.push(`Total Citations Retrieved: ${results.length}`)
    lines.push('')

    lines.push('CASE DESCRIPTION')
    lines.push('─'.repeat(60))
    lines.push(caseText || '(none)')
    lines.push('')

    if (bookmarks.length > 0) {
      lines.push('BOOKMARKED CITATIONS')
      lines.push('─'.repeat(60))
      bookmarks.forEach((r, i) => {
        lines.push(`${i + 1}. ${cleanName(r)} (${r.year || '?'}) — ${Math.round((r.score || 0) * 100)}% match`)
      })
      lines.push('')
    }

    lines.push('TOP 10 CITATIONS — AI ANALYSIS')
    lines.push('─'.repeat(60))
    generated.forEach((s, i) => {
      lines.push(`\n[${i + 1}] ${s.name}`)
      lines.push(`    Year: ${s.year || '?'} | Similarity: ${Math.round((s.score || 0) * 100)}%`)
      lines.push(`\n${s.text}`)
      lines.push('\n' + '─'.repeat(56))
    })

    setReportText(lines.join('\n'))
    setPhase('done')
  }

  const handleDownload = () => {
    const blob = new Blob([reportText], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `LexMind_Report_${new Date().toISOString().slice(0, 10)}.txt`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg animate-scale-in overflow-hidden">

        {/* header */}
        <div className="flex items-center justify-between px-6 py-4 bg-navy-800">
          <h2 className="font-serif font-semibold text-white text-base flex items-center gap-2">
            <FileDown size={16} className="text-gold-400" /> Export Research Report
          </h2>
          <button onClick={onClose}
            className="p-1.5 rounded-lg text-navy-300 hover:text-white hover:bg-white/10 transition-colors">
            <X size={16} />
          </button>
        </div>

        <div className="px-6 py-5">

          {/* idle state */}
          {phase === 'idle' && (
            <>
              <div className="bg-navy-50 rounded-xl p-4 text-xs text-navy-600 space-y-2 mb-4">
                <p className="font-semibold text-navy-800">Report will include:</p>
                <p>✓ Your case description</p>
                <p>✓ {bookmarks.length} bookmarked citation{bookmarks.length !== 1 ? 's' : ''}</p>
                <p>✓ AI-generated summary + similarity analysis for top {Math.min(10, results.length)} citations</p>
              </div>
              <p className="text-xs text-navy-400 mb-5">
                The AI will analyse each citation and explain how it relates to your case.
                This takes about {Math.min(10, results.length) * 5}–{Math.min(10, results.length) * 10} seconds.
              </p>
              <div className="flex gap-3">
                <button onClick={onClose}
                  className="flex-1 px-4 py-2 rounded-xl border border-navy-200 text-navy-600 text-sm font-medium hover:bg-navy-50 transition-colors">
                  Cancel
                </button>
                <button onClick={generateReport}
                  className="flex-1 px-4 py-2 rounded-xl bg-navy-800 text-white text-sm font-medium hover:bg-navy-700 transition-colors flex items-center justify-center gap-2">
                  <FileDown size={14} /> Generate Report
                </button>
              </div>
            </>
          )}

          {/* generating state */}
          {phase === 'generating' && (
            <div className="py-4">
              <div className="flex items-center gap-3 mb-4">
                <Loader size={18} className="animate-spin text-gold-500 flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium text-navy-700">Analysing citations…</p>
                  <p className="text-xs text-navy-400">Processing {progress} of {top10.length}</p>
                </div>
              </div>
              {/* progress bar */}
              <div className="w-full h-2 bg-navy-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gold-500 rounded-full transition-all duration-500"
                  style={{ width: `${(progress / top10.length) * 100}%` }}
                />
              </div>
              <p className="text-xs text-navy-300 mt-2 text-center">Please wait, do not close this window</p>
            </div>
          )}

          {/* done state */}
          {phase === 'done' && (
            <>
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 mb-4">
                <p className="text-sm font-semibold text-emerald-800 mb-1">✓ Report ready!</p>
                <p className="text-xs text-emerald-700">
                  Analysed {summaries.length} citations with AI summaries and similarity explanations.
                </p>
              </div>

              {/* preview of first summary */}
              {summaries[0] && (
                <div className="bg-navy-50 rounded-xl p-4 mb-4 max-h-32 overflow-y-auto">
                  <p className="text-[10px] text-navy-400 font-semibold uppercase tracking-wide mb-1">Preview — {summaries[0].name.slice(0, 40)}</p>
                  <p className="text-xs text-navy-600 leading-relaxed">{summaries[0].text.slice(0, 200)}…</p>
                </div>
              )}

              <div className="flex gap-3">
                <button onClick={onClose}
                  className="flex-1 px-4 py-2 rounded-xl border border-navy-200 text-navy-600 text-sm font-medium hover:bg-navy-50 transition-colors">
                  Close
                </button>
                <button onClick={handleDownload}
                  className="flex-1 px-4 py-2 rounded-xl bg-navy-800 text-white text-sm font-medium hover:bg-navy-700 transition-colors flex items-center justify-center gap-2">
                  <Download size={14} /> Download Report
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Bookmarks Panel ───────────────────────────────────────────────────────────
function BookmarksPanel({ bookmarks, onRemove, onClose }) {
  return (
    <div className="absolute top-full right-0 mt-2 w-80 bg-white dark:bg-navy-800 rounded-2xl shadow-xl border border-navy-100 dark:border-navy-700 z-40 animate-slide-down overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 bg-navy-800 dark:bg-navy-900">
        <h3 className="font-serif font-semibold text-white text-sm flex items-center gap-2">
          <Bookmark size={13} className="text-gold-400" fill="currentColor" />
          Bookmarks ({bookmarks.length})
        </h3>
        <button onClick={onClose} className="p-1 rounded text-navy-300 hover:text-white transition-colors">
          <X size={14} />
        </button>
      </div>
      <div className="max-h-80 overflow-y-auto">
        {bookmarks.length === 0 ? (
          <div className="px-4 py-8 text-center text-navy-400 dark:text-navy-500 text-xs">
            <Bookmark size={24} className="mx-auto mb-2 opacity-30" />
            No bookmarks yet. Click the bookmark icon on any citation.
          </div>
        ) : (
          bookmarks.map((r, i) => {
            const name = (r.file_name || '').replace(/_/g, ' ').replace(/\s+on\s+\d+.*$/i, '').trim()
            return (
              <div key={i} className="flex items-center gap-3 px-4 py-3 border-b border-navy-50 dark:border-navy-700 hover:bg-navy-50 dark:hover:bg-navy-700/50 transition-colors">
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-navy-700 dark:text-navy-200 truncate">{name}</p>
                  <p className="text-[10px] text-navy-400 dark:text-navy-400 flex items-center gap-2 mt-0.5">
                    <span className="flex items-center gap-1"><Calendar size={8} />{r.year || '?'}</span>
                    <span className="font-mono">{Math.round((r.score || 0) * 100)}%</span>
                  </p>
                </div>
                <button onClick={() => onRemove(r)}
                  className="p-1 rounded text-navy-300 hover:text-red-500 transition-colors flex-shrink-0">
                  <X size={12} />
                </button>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

// ── Main ResultsView ──────────────────────────────────────────────────────────
export default function ResultsView({ results: initialResults, caseText, onBack }) {
  const [query, setQuery] = useState('')
  const [allResults, setAllResults] = useState(initialResults)
  const [offset, setOffset] = useState(initialResults.length)
  const [page, setPage] = useState(1)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(true)

  const [bookmarks, setBookmarks] = useState([])
  const [showBookmarks, setShowBookmarks] = useState(false)
  const [showExport, setShowExport] = useState(false)
  const [compareTarget, setCompareTarget] = useState(null)
  const [activeDecade, setActiveDecade]   = useState(DECADES[0])
  const [customRange, setCustomRange]     = useState({ from: '', to: '' })
  const [showCustom, setShowCustom]       = useState(false)
  const [filterLoading, setFilterLoading] = useState(false)

const yearDist = useMemo(() => {
  const dist = {}
  DECADES.forEach(d => { if (d.label !== 'All') dist[d.label] = 0 })
  allResults.forEach(r => {
    const y = parseInt(r.year)
    if (!isNaN(y)) {
      const match = DECADES.find(d => d.from && y >= d.from && y <= d.to)
      if (match) dist[match.label] = (dist[match.label] || 0) + 1
    }
  })
  return dist
}, [allResults])
  const scrollRef = useRef()
  const sentinelRef = useRef()

  // Always show all — just filter by search query
  const filtered = allResults.filter(r =>
    !query || (r.file_name || '').toLowerCase().includes(query.toLowerCase())
  )

  const visibleResults = filtered.slice(0, page * PAGE_SIZE)
  const canShowMore = page * PAGE_SIZE < filtered.length
  const applyDecadeFilter = async (decade) => {
    if (filterLoading) return
    setActiveDecade(decade)
    setShowCustom(false)
    if (decade.label === 'All') {
      setAllResults(initialResults)
      setOffset(initialResults.length)
      setPage(1)
      setHasMore(true)
      return
    }
    setFilterLoading(true)
    try {
      const r = await fetch(`${API}/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: caseText, top_k: 20, offset: 0, year_from: decade.from, year_to: decade.to }),
      })
      if (!r.ok) throw new Error()
      const data = await r.json()
      const fetched = data.results || []
      setAllResults(fetched)
      setOffset(fetched.length)
      setPage(1)
      setHasMore(fetched.length >= 20)
    } catch {}
    finally { setFilterLoading(false) }
  }

  const applyCustomRange = async () => {
    const from = parseInt(customRange.from)
    const to   = parseInt(customRange.to)
    if (isNaN(from) || isNaN(to) || from > to) return
    const custom = { label: 'Custom', from, to }
    setActiveDecade(custom)
    setShowCustom(false)
    setFilterLoading(true)
    try {
      const r = await fetch(`${API}/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: caseText, top_k: 20, offset: 0, year_from: from, year_to: to }),
      })
      if (!r.ok) throw new Error()
      const data = await r.json()
      const fetched = data.results || []
      setAllResults(fetched)
      setOffset(fetched.length)
      setPage(1)
      setHasMore(fetched.length >= 20)
    } catch {}
    finally { setFilterLoading(false) }
  }
  const fetchMore = useCallback(async () => {
    if (loadingMore) return
    setLoadingMore(true)
    try {
      const r = await fetch(`${API}/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query:     caseText,
          top_k:     PAGE_SIZE,
          offset,
          year_from: activeDecade.from,
          year_to:   activeDecade.to,
        })
      })
      if (!r.ok) throw new Error()
      const data = await r.json()
      const newResults = data.results || []
      if (newResults.length === 0) setHasMore(false)
      else {
        setAllResults(prev => [...prev, ...newResults])
        setOffset(prev => prev + newResults.length)
      }
    } catch { setHasMore(false) }
    finally { setLoadingMore(false) }
  }, [loadingMore, offset, caseText, activeDecade])

  useEffect(() => {
    const sentinel = sentinelRef.current
    if (!sentinel) return
    const observer = new IntersectionObserver(
      async (entries) => {
        if (!entries[0].isIntersecting) return
        if (canShowMore) setPage(p => p + 1)
        else if (hasMore) { await fetchMore(); setPage(p => p + 1) }
      },
      { root: scrollRef.current, threshold: 0.1 }
    )
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [canShowMore, hasMore, fetchMore])

  const handleBookmarkToggle = (result) => {
    setBookmarks(prev => {
      const exists = prev.some(b => b.file_name === result.file_name)
      return exists ? prev.filter(b => b.file_name !== result.file_name) : [...prev, result]
    })
  }
  const isBookmarked = (result) => bookmarks.some(b => b.file_name === result.file_name)

  return (
    <div className="h-screen flex flex-col bg-navy-50 dark:bg-navy-900 transition-colors duration-300">

      {showExport && (
        <ExportModal
          results={allResults}
          caseText={caseText}
          bookmarks={bookmarks}
          onClose={() => setShowExport(false)}
        />
      )}

      {/* top bar */}
      <header className="flex items-center gap-4 px-6 py-3.5 bg-white dark:bg-navy-800 border-b border-navy-100 dark:border-navy-700 shadow-sm flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 bg-navy-800 dark:bg-navy-700 flex items-center justify-center"
            style={{ clipPath: 'polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)' }}>
            <span className="text-gold-500 font-serif font-bold text-xs">L</span>
          </div>
          <span className="font-serif font-bold text-navy-800 dark:text-white text-lg tracking-wide">
            Lex<span className="text-gold-500">Retriever</span>
          </span>
        </div>

        <div className="flex-1 mx-4 px-4 py-2 bg-navy-50 dark:bg-navy-700 border border-navy-200 dark:border-navy-600 rounded-xl
          text-xs text-navy-500 dark:text-navy-300 truncate max-w-lg" title={caseText}>
          <span className="text-navy-300 dark:text-navy-400 mr-2">Case:</span>
          {caseText?.slice(0, 80)}{caseText?.length > 80 ? '…' : ''}
        </div>

        <div className="flex items-center gap-2">
          {compareTarget && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-100 dark:bg-blue-900/30 border border-blue-300 dark:border-blue-700
              text-blue-700 dark:text-blue-300 text-xs rounded-xl font-medium">
              <GitCompare size={12} />
              <span className="truncate max-w-24">
                {(compareTarget.file_name || '').replace(/_/g, ' ').slice(0, 20)}
              </span>
              <button onClick={() => setCompareTarget(null)} className="ml-1 hover:text-blue-900 dark:hover:text-blue-100">
                <X size={11} />
              </button>
            </div>
          )}

          <div className="relative">
            <button onClick={() => setShowBookmarks(s => !s)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium border transition-colors
                ${showBookmarks || bookmarks.length > 0
                  ? 'bg-gold-500/10 border-gold-400/30 text-gold-600 dark:text-gold-400'
                  : 'bg-white dark:bg-navy-700 border-navy-200 dark:border-navy-600 text-navy-500 dark:text-navy-300 hover:bg-navy-50 dark:hover:bg-navy-600'}`}>
              <Bookmark size={13} fill={bookmarks.length > 0 ? 'currentColor' : 'none'} />
              {bookmarks.length > 0 && (
                <span className="w-4 h-4 rounded-full bg-gold-500 text-white text-[10px] font-bold
                  flex items-center justify-center">{bookmarks.length}</span>
              )}
            </button>
            {showBookmarks && (
              <BookmarksPanel
                bookmarks={bookmarks}
                onRemove={handleBookmarkToggle}
                onClose={() => setShowBookmarks(false)}
              />
            )}
          </div>

          <button onClick={() => setShowExport(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium
              bg-white dark:bg-navy-700 border border-navy-200 dark:border-navy-600 text-navy-500 dark:text-navy-300 hover:bg-navy-50 dark:hover:bg-navy-600 transition-colors">
            <FileDown size={13} /> Export
          </button>

          <button onClick={onBack}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium
              bg-navy-800 dark:bg-navy-600 text-white hover:bg-navy-700 dark:hover:bg-navy-500 transition-colors">
            <Search size={13} /> New Search
          </button>

          <ThemeToggle />
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 flex flex-col overflow-hidden">

          {/* results sub-header — count + search filter only, no High/Medium/Low */}
          <div className="flex items-center gap-4 px-6 py-3 bg-white dark:bg-navy-800 border-b border-navy-100 dark:border-navy-700 flex-shrink-0">
            <div>
              <span className="font-serif font-semibold text-navy-800 dark:text-white text-sm">
                {visibleResults.length} of {filtered.length} Citations
              </span>
              <span className="text-navy-400 dark:text-navy-400 text-xs ml-2">ranked by semantic similarity · scroll for more</span>
            </div>

            <div className="relative ml-auto">
              <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-navy-300 dark:text-navy-500" />
              <input
                value={query}
                onChange={e => { setQuery(e.target.value); setPage(1) }}
                placeholder="Filter cases…"
                className="pl-8 pr-3 py-1.5 bg-navy-50 dark:bg-navy-700 border border-navy-200 dark:border-navy-600 rounded-xl text-xs
                  text-navy-600 dark:text-navy-200 outline-none focus:border-navy-400 dark:focus:border-navy-400 w-40 placeholder-navy-300 dark:placeholder-navy-500 transition-colors"
              />
            </div>
          </div>
{/* ── Year / decade filter strip ── */}
          <div className="flex items-center gap-2 px-6 py-3 bg-white dark:bg-navy-800 border-b border-navy-100 dark:border-navy-700 flex-shrink-0 overflow-x-auto">
            <span className="text-[11px] font-semibold text-navy-400 uppercase tracking-wide flex-shrink-0 mr-1">
              Period
            </span>
            {DECADES.map(d => {
              const isActive = activeDecade.label === d.label
              const badge = d.label === 'All' ? allResults.length : (yearDist[d.label] || 0)
              return (
                <button key={d.label} onClick={() => applyDecadeFilter(d)} disabled={filterLoading}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium
                    flex-shrink-0 border transition-all duration-200
                    ${isActive ? 'bg-navy-800 text-white border-navy-800 shadow-sm'
                      : 'bg-white dark:bg-navy-700 text-navy-500 dark:text-navy-300 border-navy-200 dark:border-navy-600 hover:border-navy-400 hover:text-navy-700 disabled:opacity-50 disabled:cursor-not-allowed'}`}>
                  {d.label}
                  {badge > 0 && (
                    <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded-full leading-none
                      ${isActive ? 'bg-white/20 text-white' : 'bg-navy-100 dark:bg-navy-600 text-navy-400 dark:text-navy-300'}`}>
                      {badge}
                    </span>
                  )}
                </button>
              )
            })}
            <div className="relative flex-shrink-0">
              <button onClick={() => setShowCustom(s => !s)} disabled={filterLoading}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-all
                  ${activeDecade.label === 'Custom' ? 'bg-gold-500 text-white border-gold-500 shadow-sm'
                    : 'bg-white dark:bg-navy-700 text-navy-500 dark:text-navy-300 border-navy-200 dark:border-navy-600 hover:border-navy-400 disabled:opacity-50 disabled:cursor-not-allowed'}`}>
                {activeDecade.label === 'Custom' ? `${activeDecade.from}–${activeDecade.to}` : 'Custom'}
                <ChevronDown size={10} className={`transition-transform duration-200 ${showCustom ? 'rotate-180' : ''}`} />
              </button>
              {showCustom && (
                <div className="absolute top-full left-0 mt-2 z-30 w-52 animate-slide-down
                  bg-white dark:bg-navy-800 border border-navy-200 dark:border-navy-600 rounded-xl shadow-xl p-4">
                  <p className="text-[11px] font-semibold text-navy-600 dark:text-navy-300 uppercase tracking-wide mb-3">Custom year range</p>
                  <div className="flex items-end gap-2 mb-3">
                    <div className="flex-1">
                      <label className="text-[10px] text-navy-400 block mb-1">From</label>
                      <input type="number" placeholder="1950" min="1900" max="2030"
                        value={customRange.from}
                        onChange={e => setCustomRange(p => ({ ...p, from: e.target.value }))}
                        className="w-full px-2.5 py-1.5 border border-navy-200 dark:border-navy-600 rounded-lg text-xs
                          text-navy-700 dark:text-navy-200 bg-white dark:bg-navy-700 outline-none focus:border-navy-400" />
                    </div>
                    <span className="text-navy-300 text-sm pb-1.5">–</span>
                    <div className="flex-1">
                      <label className="text-[10px] text-navy-400 block mb-1">To</label>
                      <input type="number" placeholder="2024" min="1900" max="2030"
                        value={customRange.to}
                        onChange={e => setCustomRange(p => ({ ...p, to: e.target.value }))}
                        className="w-full px-2.5 py-1.5 border border-navy-200 dark:border-navy-600 rounded-lg text-xs
                          text-navy-700 dark:text-navy-200 bg-white dark:bg-navy-700 outline-none focus:border-navy-400" />
                    </div>
                  </div>
                  <button onClick={applyCustomRange} disabled={!customRange.from || !customRange.to}
                    className="w-full py-2 bg-navy-800 text-white text-xs font-semibold rounded-lg
                      disabled:opacity-40 disabled:cursor-not-allowed hover:bg-navy-700 transition-colors">
                    Apply range
                  </button>
                </div>
              )}
            </div>
            {filterLoading && (
              <div className="flex items-center gap-1.5 text-xs text-navy-400 flex-shrink-0 ml-1">
                <div className="w-3 h-3 border border-navy-300 border-t-navy-600 rounded-full animate-spin" />
                Searching…
              </div>
            )}
            {activeDecade.label !== 'All' && !filterLoading && (
              <div className="flex items-center gap-1.5 ml-auto flex-shrink-0">
                <span className="text-xs text-navy-400">
                  <span className="font-semibold text-navy-700 dark:text-white">{allResults.length}</span> result{allResults.length !== 1 ? 's' : ''} in this period
                </span>
                <button onClick={() => applyDecadeFilter(DECADES[0])}
                  className="p-1 rounded-full text-navy-300 hover:text-navy-600 hover:bg-navy-100 dark:hover:bg-navy-700 transition-colors">
                  <X size={11} />
                </button>
              </div>
            )}
          </div>
          {/* cards */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-6 bg-navy-50 dark:bg-navy-900">
            {visibleResults.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full gap-3 text-navy-400 dark:text-navy-500">
                <Filter size={32} className="opacity-30" />
                <p className="text-sm">No results match your filter.</p>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                  {visibleResults.map((r, i) => (
                    <CitationCard
                      key={r.file_name + i}
                      result={r}
                      index={i}
                      caseText={caseText}
                      isBookmarked={isBookmarked(r)}
                      onBookmarkToggle={handleBookmarkToggle}
                      compareTarget={compareTarget}
                      onSelectForCompare={setCompareTarget}
                    />
                  ))}
                </div>

                <div ref={sentinelRef} className="flex items-center justify-center py-8">
                  {loadingMore ? (
                    <div className="flex items-center gap-3 text-navy-400 dark:text-navy-500 text-sm">
                      <div className="w-5 h-5 border-2 border-navy-200 dark:border-navy-600 border-t-navy-500 dark:border-t-navy-300 rounded-full animate-spin" />
                      Loading more citations…
                    </div>
                  ) : (!canShowMore && !hasMore) ? (
                    <p className="text-xs text-navy-300 dark:text-navy-600 font-mono">— All {filtered.length} citations shown —</p>
                  ) : null}
                </div>
              </>
            )}
          </div>
        </div>

        <div className="w-96 flex-shrink-0">
          <ChatBot caseText={caseText} />
        </div>
      </div>
    </div>
  )
}