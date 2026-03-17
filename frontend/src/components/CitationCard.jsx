import { useState } from 'react'
import {
  X, Copy, Sparkles, Calendar, Scale, BookOpen, Download,
  Bookmark, GripVertical, GitCompare, FileText, Brain, Loader
} from 'lucide-react'

const API = '/api'

// ── helpers ───────────────────────────────────────────────────────────────────
const cleanName = (r) =>
  (r?.file_name || 'Unknown').replace(/_/g, ' ').replace(/\s+on\s+\d+.*$/i, '').trim()

const downloadTxt = (filename, content) => {
  const blob = new Blob([content], { type: 'text/plain' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename; a.click()
  URL.revokeObjectURL(url)
}

// ── Full Judgement Modal ──────────────────────────────────────────────────────
function JudgementModal({ result, onClose }) {
  const name = cleanName(result)
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden animate-scale-in
        bg-white dark:bg-navy-800">

        <div className="flex items-start gap-3 px-6 py-4 flex-shrink-0 bg-navy-800 dark:bg-navy-900">
          <div className="flex-1 min-w-0">
            <h2 className="font-serif font-semibold text-white text-base leading-snug">{name}</h2>
            <div className="flex items-center gap-4 mt-1.5 text-xs text-navy-300">
              <span className="flex items-center gap-1"><Calendar size={10} />{result.year || '—'}</span>
              <span className="flex items-center gap-1"><Scale size={10} />Supreme Court of India</span>
              <span className="font-mono text-gold-400">{Math.round((result.score || 0) * 100)}% match</span>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button onClick={() => downloadTxt(
              `${(result.file_name || 'judgement').replace(/\s+/g, '_')}.txt`,
              `${name}\nYear: ${result.year || '?'} | Supreme Court of India\n\n${'─'.repeat(60)}\n\n${result.content || ''}`
            )} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-white text-xs font-medium transition-colors
              bg-white/10 hover:bg-white/20 border border-white/20">
              <Download size={12} /> Download
            </button>
            <button onClick={onClose} className="p-1.5 rounded-lg text-navy-300 hover:text-white hover:bg-white/10 transition-colors">
              <X size={16} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-8 py-6">
          {(result.content || '').split('\n').map((p, i) =>
            p.trim()
              ? <p key={i} className="text-sm leading-relaxed mb-3 text-navy-700 dark:text-navy-200">{p}</p>
              : <div key={i} className="h-2" />
          )}
        </div>

        <div className="flex items-center justify-between px-6 py-3 flex-shrink-0
          border-t border-navy-100 dark:border-navy-700
          bg-navy-50 dark:bg-navy-700/50">
          <span className="text-xs text-navy-400 font-mono">{(result.content || '').length.toLocaleString()} chars</span>
          <button onClick={onClose} className="px-4 py-1.5 rounded-lg text-xs font-medium transition-colors
            bg-navy-800 dark:bg-navy-600 text-white hover:bg-navy-700 dark:hover:bg-navy-500">
            Close
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Compare Mode Picker ───────────────────────────────────────────────────────
function CompareModePicker({ result, compareTarget, caseText, onClose, onSelectMode }) {
  const hasTarget = !!compareTarget
  const hasCase = !!caseText?.trim()

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="rounded-2xl shadow-2xl w-full max-w-sm animate-scale-in overflow-hidden
        bg-white dark:bg-navy-800">

        <div className="flex items-center justify-between px-5 py-4 bg-navy-800 dark:bg-navy-900">
          <h2 className="font-serif font-semibold text-white text-sm flex items-center gap-2">
            <GitCompare size={15} className="text-gold-400" /> Compare with…
          </h2>
          <button onClick={onClose} className="p-1 rounded text-navy-300 hover:text-white transition-colors">
            <X size={15} />
          </button>
        </div>

        <div className="p-4 space-y-3">
          {/* vs another doc */}
          <button
            onClick={() => onSelectMode('doc')}
            disabled={!hasTarget}
            className={`w-full flex items-start gap-3 p-4 rounded-xl border text-left transition-all
              ${hasTarget
                ? 'border-blue-200 dark:border-blue-700 bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/30 cursor-pointer'
                : 'border-navy-100 dark:border-navy-700 bg-navy-50 dark:bg-navy-700/30 opacity-50 cursor-not-allowed'}`}>
            <GitCompare size={18} className={hasTarget ? 'text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0' : 'text-navy-300 mt-0.5 flex-shrink-0'} />
            <div>
              <p className={`text-sm font-semibold ${hasTarget ? 'text-blue-800 dark:text-blue-300' : 'text-navy-400'}`}>
                vs Another Judgement
              </p>
              <p className="text-xs text-navy-400 dark:text-navy-400 mt-0.5">
                {hasTarget
                  ? `Side by side with: ${cleanName(compareTarget).slice(0, 40)}…`
                  : 'Select a judgement first using the Compare button on another card'}
              </p>
            </div>
          </button>

          {/* vs your case */}
          <button
            onClick={() => onSelectMode('case')}
            disabled={!hasCase}
            className={`w-full flex items-start gap-3 p-4 rounded-xl border text-left transition-all
              ${hasCase
                ? 'border-emerald-200 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-900/20 hover:bg-emerald-100 dark:hover:bg-emerald-900/30 cursor-pointer'
                : 'border-navy-100 dark:border-navy-700 bg-navy-50 dark:bg-navy-700/30 opacity-50 cursor-not-allowed'}`}>
            <FileText size={18} className={hasCase ? 'text-emerald-600 dark:text-emerald-400 mt-0.5 flex-shrink-0' : 'text-navy-300 mt-0.5 flex-shrink-0'} />
            <div>
              <p className={`text-sm font-semibold ${hasCase ? 'text-emerald-800 dark:text-emerald-300' : 'text-navy-400'}`}>
                vs Your Case
              </p>
              <p className="text-xs text-navy-400 dark:text-navy-400 mt-0.5">
                {hasCase
                  ? 'Side by side with your case description'
                  : 'No case description found — describe your case first'}
              </p>
            </div>
          </button>

          {/* AI Analysis */}
          <button
            onClick={() => onSelectMode('ai')}
            className="w-full flex items-start gap-3 p-4 rounded-xl border text-left transition-all cursor-pointer
              border-gold-400/30 dark:border-gold-500/30
              bg-gold-500/5 dark:bg-gold-500/10
              hover:bg-gold-500/10 dark:hover:bg-gold-500/15">
            <Brain size={18} className="text-gold-600 dark:text-gold-400 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-sm font-semibold text-gold-800 dark:text-gold-300">AI Analysis</p>
              <p className="text-xs text-navy-400 dark:text-navy-400 mt-0.5">
                {hasTarget
                  ? `AI will compare this vs ${cleanName(compareTarget).slice(0, 30)}…`
                  : hasCase
                    ? 'AI will compare this judgement vs your case'
                    : 'AI will analyse key legal points of this judgement'}
              </p>
            </div>
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Side-by-side Modal ────────────────────────────────────────────────────────
function SideBySideModal({ leftLabel, leftContent, leftMeta, rightLabel, rightContent, rightMeta, onClose }) {
  const handleDownload = () => {
    downloadTxt(
      `Compare_${Date.now()}.txt`,
      `LEXMIND COMPARISON\n${'═'.repeat(60)}\n\n` +
      `LEFT: ${leftLabel}\n${'─'.repeat(60)}\n${leftContent}\n\n` +
      `RIGHT: ${rightLabel}\n${'─'.repeat(60)}\n${rightContent}`
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="rounded-2xl shadow-2xl w-full max-w-6xl max-h-[92vh] flex flex-col overflow-hidden animate-scale-in
        bg-white dark:bg-navy-800">

        <div className="flex items-center justify-between px-6 py-4 flex-shrink-0 bg-navy-800 dark:bg-navy-900">
          <h2 className="font-serif font-semibold text-white text-base flex items-center gap-2">
            <GitCompare size={16} className="text-gold-400" /> Side-by-Side Comparison
          </h2>
          <div className="flex items-center gap-2">
            <button onClick={handleDownload}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-white text-xs font-medium transition-colors
                bg-white/10 hover:bg-white/20 border border-white/20">
              <Download size={12} /> Download
            </button>
            <button onClick={onClose} className="p-1.5 rounded-lg text-navy-300 hover:text-white hover:bg-white/10 transition-colors">
              <X size={16} />
            </button>
          </div>
        </div>

        <div className="flex-1 flex overflow-hidden">
          {/* Left */}
          <div className="flex-1 flex flex-col overflow-hidden border-r border-navy-100 dark:border-navy-700">
            <div className="px-5 py-3 flex-shrink-0 border-b border-navy-100 dark:border-navy-700
              bg-emerald-50 dark:bg-emerald-900/20">
              <p className="font-serif font-semibold text-sm leading-snug truncate text-emerald-800 dark:text-emerald-300">{leftLabel}</p>
              {leftMeta && <p className="text-xs text-navy-400 mt-0.5">{leftMeta}</p>}
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-4">
              {(leftContent || '').split('\n').map((p, i) =>
                p.trim()
                  ? <p key={i} className="text-xs leading-relaxed mb-2 text-navy-700 dark:text-navy-200">{p}</p>
                  : <div key={i} className="h-1.5" />
              )}
            </div>
          </div>

          {/* Right */}
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="px-5 py-3 flex-shrink-0 border-b border-navy-100 dark:border-navy-700
              bg-blue-50 dark:bg-blue-900/20">
              <p className="font-serif font-semibold text-sm leading-snug truncate text-blue-800 dark:text-blue-300">{rightLabel}</p>
              {rightMeta && <p className="text-xs text-navy-400 mt-0.5">{rightMeta}</p>}
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-4">
              {(rightContent || '').split('\n').map((p, i) =>
                p.trim()
                  ? <p key={i} className="text-xs leading-relaxed mb-2 text-navy-700 dark:text-navy-200">{p}</p>
                  : <div key={i} className="h-1.5" />
              )}
            </div>
          </div>
        </div>

        <div className="flex justify-end px-6 py-3 flex-shrink-0
          border-t border-navy-100 dark:border-navy-700
          bg-navy-50 dark:bg-navy-700/50">
          <button onClick={onClose} className="px-4 py-1.5 rounded-lg text-xs font-medium transition-colors
            bg-navy-800 dark:bg-navy-600 text-white hover:bg-navy-700 dark:hover:bg-navy-500">
            Close
          </button>
        </div>
      </div>
    </div>
  )
}

// ── AI Analysis Modal ─────────────────────────────────────────────────────────
function AICompareModal({ docA, docALabel, docB, docBLabel, onClose }) {
  const [analysis, setAnalysis] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useState(() => {
    const run = async () => {
      try {
        const prompt = docB
          ? `You are a legal analyst. Compare these two legal documents and provide a structured analysis.

DOCUMENT A: ${docALabel}
${(docA || '').slice(0, 2000)}

DOCUMENT B: ${docBLabel}
${(docB || '').slice(0, 2000)}

Provide your analysis in this exact format:

SIMILAR LEGAL ISSUES:
- List each common legal issue or topic

COMMON LEGAL PRINCIPLES:
- List each shared legal principle, doctrine, or statute referenced

KEY DIFFERENCES:
- List the most important differences in facts, holdings, or outcomes

APPLICABILITY:
- Explain how Document A's holding relates to / supports / differs from Document B

Keep each point concise and specific. Use plain professional legal language.`
          : `You are a legal analyst. Analyze this judgement and identify key legal points.

JUDGEMENT: ${docALabel}
${(docA || '').slice(0, 3000)}

Provide your analysis in this format:

KEY LEGAL ISSUES:
- List the main legal questions addressed

LEGAL PRINCIPLES ESTABLISHED:
- List the holdings and principles set out

STATUTES REFERENCED:
- List any acts, sections, or articles mentioned

SIGNIFICANCE:
- Why this judgement matters and when it would be cited`

        const r = await fetch(`${API}/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: prompt, context: '', model_override: '' })
        })
        if (!r.ok) throw new Error('API error')
        const data = await r.json()
        setAnalysis(data.reply || 'No analysis returned.')
      } catch {
        setError('Could not generate analysis. Please check the backend connection.')
      } finally { setLoading(false) }
    }
    run()
  }, [])

  const handleDownload = () => {
    downloadTxt(
      `AI_Analysis_${Date.now()}.txt`,
      `LEXMIND AI ANALYSIS\n${'═'.repeat(60)}\n\n` +
      `Document A: ${docALabel}\nDocument B: ${docBLabel || 'N/A'}\n\n` +
      `${'─'.repeat(60)}\n\n${analysis}`
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="rounded-2xl shadow-2xl w-full max-w-2xl max-h-[88vh] flex flex-col overflow-hidden animate-scale-in
        bg-white dark:bg-navy-800">

        <div className="flex items-center justify-between px-6 py-4 flex-shrink-0 bg-navy-800 dark:bg-navy-900">
          <div className="flex-1 min-w-0">
            <h2 className="font-serif font-semibold text-white text-sm flex items-center gap-2">
              <Brain size={15} className="text-gold-400" /> AI Comparison Analysis
            </h2>
            <p className="text-navy-300 text-xs mt-0.5 truncate">
              {docALabel.slice(0, 35)} {docBLabel ? `vs ${docBLabel.slice(0, 35)}` : ''}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {analysis && (
              <button onClick={handleDownload}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-white text-xs font-medium transition-colors
                  bg-white/10 hover:bg-white/20 border border-white/20">
                <Download size={12} /> Download
              </button>
            )}
            <button onClick={onClose} className="p-1.5 rounded-lg text-navy-300 hover:text-white hover:bg-white/10 transition-colors">
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Doc labels */}
        <div className="flex gap-3 px-6 py-3 flex-shrink-0
          bg-gold-500/5 dark:bg-gold-500/10
          border-b border-gold-400/20 dark:border-gold-500/20">
          <div className="flex items-center gap-2 text-xs text-navy-600 dark:text-navy-300">
            <div className="w-2 h-2 rounded-full bg-emerald-500" />
            <span className="font-medium truncate max-w-52">{docALabel}</span>
          </div>
          {docBLabel && (
            <>
              <span className="text-navy-300 dark:text-navy-500">vs</span>
              <div className="flex items-center gap-2 text-xs text-navy-600 dark:text-navy-300">
                <div className="w-2 h-2 rounded-full bg-blue-500" />
                <span className="font-medium truncate max-w-52">{docBLabel}</span>
              </div>
            </>
          )}
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          {loading ? (
            <div className="flex flex-col items-center justify-center h-40 gap-4 text-navy-400">
              <Loader size={24} className="animate-spin text-gold-500" />
              <div className="text-center">
                <p className="text-sm font-medium text-navy-600 dark:text-navy-300">AI is analysing…</p>
                <p className="text-xs mt-1 text-navy-400">Comparing legal documents, this may take a moment</p>
              </div>
            </div>
          ) : error ? (
            <div className="flex items-center gap-2 text-red-500 dark:text-red-400 text-xs rounded-xl px-4 py-3
              bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
              {error}
            </div>
          ) : (
            <div className="space-y-4">
              {analysis.split('\n').map((line, i) => {
                if (!line.trim()) return <div key={i} className="h-1" />
                if (/^[A-Z][A-Z\s]+:/.test(line.trim()))
                  return (
                    <div key={i} className="flex items-center gap-2 mt-4 first:mt-0">
                      <div className="w-1 h-4 rounded-full bg-gold-500 flex-shrink-0" />
                      <h3 className="text-xs font-bold text-navy-800 dark:text-white uppercase tracking-wide">{line.trim()}</h3>
                    </div>
                  )
                if (line.trim().startsWith('-') || line.trim().startsWith('•'))
                  return (
                    <div key={i} className="flex gap-2 pl-4">
                      <span className="text-gold-500 flex-shrink-0 mt-0.5">•</span>
                      <p className="text-xs leading-relaxed text-navy-700 dark:text-navy-200">{line.replace(/^[\s\-•]+/, '')}</p>
                    </div>
                  )
                return <p key={i} className="text-xs leading-relaxed pl-4 text-navy-700 dark:text-navy-200">{line}</p>
              })}
            </div>
          )}
        </div>

        <div className="flex justify-end px-6 py-3 flex-shrink-0
          border-t border-navy-100 dark:border-navy-700
          bg-navy-50 dark:bg-navy-700/50">
          <button onClick={onClose} className="px-4 py-1.5 rounded-lg text-xs font-medium transition-colors
            bg-navy-800 dark:bg-navy-600 text-white hover:bg-navy-700 dark:hover:bg-navy-500">
            Close
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Citation Card ─────────────────────────────────────────────────────────────
export default function CitationCard({
  result, index, caseText,
  isBookmarked, onBookmarkToggle,
  compareTarget, onSelectForCompare
}) {
  const [copied, setCopied] = useState(false)
  const [summarizing, setSummarizing] = useState(false)
  const [summary, setSummary] = useState('')
  const [showSummary, setShowSummary] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [showModePicker, setShowModePicker] = useState(false)
  const [compareMode, setCompareMode] = useState(null)

  const score = result.score
  const pct = Math.round(score * 100)
  const caseName = cleanName(result)

  const scoreColor =
    score >= 0.75 ? 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30 border-emerald-200 dark:border-emerald-700' :
      score >= 0.50 ? 'text-gold-600 dark:text-gold-400 bg-gold-500/10 border-gold-400/30' :
        'text-navy-400 dark:text-navy-500 bg-navy-50 dark:bg-navy-700/50 border-navy-200 dark:border-navy-600'

  const barColor =
    score >= 0.75 ? 'bg-emerald-500' :
      score >= 0.50 ? 'bg-gold-500' : 'bg-navy-300 dark:bg-navy-600'

  const isSelectedForCompare = compareTarget?.file_name === result.file_name

  const handleSummarize = async () => {
    if (summary) { setShowSummary(s => !s); return }
    setSummarizing(true); setShowSummary(true)
    try {
      const r = await fetch(`${API}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: `Summarize this judgement in 100-200 words. Cover: (1) core legal issue, (2) key holding, (3) reasoning, (4) relevance. Plain English, flowing paragraphs, no bullet points.`,
          context: `USER'S CASE:\n${caseText}\n\nJUDGEMENT:\n${result.content?.slice(0, 4000)}`,
          model_override: 'llama3.2:3b'
        })
      })
      const data = await r.json()
      setSummary(data.reply || 'Could not generate summary.')
    } catch { setSummary('Failed to generate summary.') }
    finally { setSummarizing(false) }
  }

  const handleDragStart = (e) => {
    e.dataTransfer.effectAllowed = 'copy'
    e.dataTransfer.setData('application/citation', JSON.stringify(result))
  }

  const handleSelectMode = (mode) => {
    setShowModePicker(false)
    setCompareMode(mode)
  }

  const closeCompare = () => setCompareMode(null)

  return (
    <>
      {showModal && <JudgementModal result={result} onClose={() => setShowModal(false)} />}

      {showModePicker && (
        <CompareModePicker
          result={result}
          compareTarget={compareTarget}
          caseText={caseText}
          onClose={() => setShowModePicker(false)}
          onSelectMode={handleSelectMode}
        />
      )}

      {compareMode === 'doc' && compareTarget && (
        <SideBySideModal
          leftLabel={cleanName(compareTarget)}
          leftContent={compareTarget.content}
          leftMeta={`${compareTarget.year || '?'} · ${Math.round((compareTarget.score || 0) * 100)}% match`}
          rightLabel={caseName}
          rightContent={result.content}
          rightMeta={`${result.year || '?'} · ${pct}% match`}
          onClose={closeCompare}
        />
      )}

      {compareMode === 'case' && (
        <SideBySideModal
          leftLabel="Your Case Description"
          leftContent={caseText}
          leftMeta="Submitted case facts"
          rightLabel={caseName}
          rightContent={result.content}
          rightMeta={`${result.year || '?'} · ${pct}% match`}
          onClose={closeCompare}
        />
      )}

      {compareMode === 'ai' && (
        <AICompareModal
          docA={result.content}
          docALabel={caseName}
          docB={compareTarget ? compareTarget.content : caseText}
          docBLabel={compareTarget ? cleanName(compareTarget) : (caseText ? 'Your Case' : null)}
          onClose={closeCompare}
        />
      )}

      {/* ── Card ── */}
      <div
        draggable
        onDragStart={handleDragStart}
        className={`rounded-2xl overflow-hidden cursor-grab active:cursor-grabbing
          shadow-sm hover:shadow-md transition-all duration-300 animate-slide-up
          bg-white dark:bg-navy-800
          ${isSelectedForCompare
            ? 'border-2 border-blue-400 ring-2 ring-blue-200 dark:ring-blue-900/50'
            : 'border border-navy-100 dark:border-navy-700 hover:border-navy-200 dark:hover:border-navy-600'
          }`}
        style={{ animationDelay: `${index * 0.07}s`, animationFillMode: 'both' }}>

        {/* header */}
        <div className="px-5 pt-5 pb-4">
          <div className="flex items-start gap-3 mb-3">
            <div className="flex items-center gap-1 flex-shrink-0">
              <GripVertical size={12} className="text-navy-300 dark:text-navy-600" />
              <div className="w-7 h-7 rounded-lg bg-navy-800 dark:bg-navy-700 flex items-center justify-center text-white font-mono text-xs font-bold">
                {index + 1}
              </div>
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-serif font-semibold text-sm leading-snug line-clamp-2 text-navy-800 dark:text-white">
                {caseName}
              </h3>
              <div className="flex items-center gap-3 mt-1.5 text-xs text-navy-400 dark:text-navy-400">
                <span className="flex items-center gap-1"><Calendar size={10} />{result.year || '—'}</span>
                <span className="flex items-center gap-1"><Scale size={10} />Supreme Court</span>
              </div>
            </div>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <button onClick={() => onBookmarkToggle?.(result)}
                className={`p-1.5 rounded-lg transition-colors
                  ${isBookmarked
                    ? 'text-gold-500 bg-gold-500/10'
                    : 'text-navy-300 dark:text-navy-600 hover:text-gold-500 hover:bg-gold-500/10'}`}>
                <Bookmark size={13} fill={isBookmarked ? 'currentColor' : 'none'} />
              </button>
              <div className={`px-2.5 py-1 rounded-lg border text-xs font-mono font-semibold ${scoreColor}`}>
                {pct}%
              </div>
            </div>
          </div>

          {/* Score bar */}
          <div className="w-full h-1 rounded-full overflow-hidden mb-4 bg-navy-100 dark:bg-navy-700">
            <div className={`h-full rounded-full score-bar-fill ${barColor}`} style={{ width: `${pct}%` }} />
          </div>

          <p className="text-xs leading-relaxed line-clamp-3 text-navy-500 dark:text-navy-300">
            {result.content || ''}
          </p>
        </div>

        {/* Drag hint */}
        <div className="mx-5 mb-3 flex items-center gap-1.5 text-[10px] text-navy-300 dark:text-navy-600">
          <GripVertical size={9} /> Drag to chatbot to ask a focused question
        </div>

        {/* AI summary */}
        {showSummary && (
          <div className="mx-5 mb-4 rounded-xl p-4
            bg-gold-500/5 dark:bg-gold-500/10
            border border-gold-400/20 dark:border-gold-500/20">
            <div className="flex items-center gap-2 mb-2 text-xs font-semibold uppercase tracking-wide text-gold-600 dark:text-gold-400">
              <Sparkles size={12} /> AI Summary
            </div>
            {summarizing ? (
              <div className="flex items-center gap-2 text-navy-400 text-xs">
                <div className="flex gap-1">
                  {[0, 1, 2].map(i => (
                    <div key={i} className="w-1.5 h-1.5 rounded-full bg-gold-500 animate-bounce-dot"
                      style={{ animationDelay: `${i * 0.2}s` }} />
                  ))}
                </div>
                Generating summary…
              </div>
            ) : (
              <p className="text-xs leading-relaxed text-navy-600 dark:text-navy-300">{summary}</p>
            )}
          </div>
        )}

        {/* Footer actions */}
        <div className="flex items-center gap-2 px-5 pb-4 pt-1 flex-wrap gap-y-2
          border-t border-navy-50 dark:border-navy-700/60">

          <button onClick={() => setShowModal(true)}
            className="flex items-center gap-1 text-xs font-medium transition-colors
              text-navy-400 dark:text-navy-400 hover:text-navy-700 dark:hover:text-white">
            <BookOpen size={13} /> Read full
          </button>

          <button onClick={() => onSelectForCompare?.(isSelectedForCompare ? null : result)}
            className={`flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg border transition-all font-medium
              ${isSelectedForCompare
                ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border-blue-300 dark:border-blue-700'
                : 'bg-navy-50 dark:bg-navy-700/50 text-navy-400 dark:text-navy-400 border-navy-200 dark:border-navy-600 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20'
              }`}>
            <GitCompare size={11} />
            {isSelectedForCompare ? 'Selected' : 'Select'}
          </button>

          <button onClick={() => setShowModePicker(true)}
            className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg border font-medium transition-all
              bg-blue-600 dark:bg-blue-700 text-white border-blue-600 dark:border-blue-700
              hover:bg-blue-700 dark:hover:bg-blue-600">
            <GitCompare size={11} /> Compare
          </button>

          <button onClick={handleSummarize}
            className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg ml-auto font-medium transition-all border
              bg-gold-500/10 dark:bg-gold-500/15 text-gold-600 dark:text-gold-400
              hover:bg-gold-500/20 dark:hover:bg-gold-500/25
              border-gold-400/20 dark:border-gold-500/30">
            <Sparkles size={11} />
            {showSummary && summary ? (summarizing ? 'Summarizing…' : 'Hide') : 'Summarize'}
          </button>

          <button
            onClick={() => {
              navigator.clipboard.writeText(caseName)
              setCopied(true)
              setTimeout(() => setCopied(false), 2000)
            }}
            className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg font-medium transition-all border
              bg-navy-50 dark:bg-navy-700/50 text-navy-500 dark:text-navy-400
              hover:bg-navy-100 dark:hover:bg-navy-700
              border-navy-200 dark:border-navy-600">
            <Copy size={11} />
            {copied ? 'Copied!' : 'Copy'}
          </button>
        </div>
      </div>
    </>
  )
}