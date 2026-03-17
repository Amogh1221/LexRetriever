import { useState, useRef, useEffect } from 'react'
import { Send, Bot, User, AlertTriangle, GripVertical, FileText, Scale, X } from 'lucide-react'

const API = '/api'

// ── Rich message renderer ─────────────────────────────────────────────────────
function RenderMessage({ text, sources }) {
  const renderInline = (line, key) => {
    const parts = line.split(/(\*\*[^*]+\*\*|\[LAW:[^\]]+\])/g)
    return (
      <span key={key}>
        {parts.map((part, i) => {
          if (part.startsWith('**') && part.endsWith('**'))
            return <strong key={i} className="font-semibold text-navy-800">{part.slice(2, -2)}</strong>
          if (part.startsWith('[LAW:'))
            return <span key={i} className="inline-flex items-center px-1.5 py-0.5 rounded-md
              bg-gold-500/15 text-gold-700 text-[10px] font-mono font-semibold mx-0.5">{part}</span>
          return <span key={i}>{part}</span>
        })}
      </span>
    )
  }

  const lines = text.split('\n')
  return (
    <div className="text-xs leading-relaxed text-navy-700 space-y-1">
      {lines.map((line, i) => {
        if (!line.trim()) return <div key={i} className="h-1.5" />
        if (line.trim().startsWith('•') || line.trim().startsWith('-'))
          return (
            <div key={i} className="flex gap-1.5 pl-1">
              <span className="text-navy-300 mt-0.5 flex-shrink-0">•</span>
              <span>{renderInline(line.replace(/^[\s•\-]+/, ''), i)}</span>
            </div>
          )
        if (/^\d+\./.test(line.trim()))
          return <div key={i} className="pl-1">{renderInline(line, i)}</div>
        return <div key={i}>{renderInline(line, i)}</div>
      })}

      {sources && sources.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2 pt-2 border-t border-navy-100">
          {sources.map((s, i) => (
            <span key={i} className="flex items-center gap-1 px-2 py-0.5 rounded-full
              bg-navy-100 text-navy-500 text-[10px] font-mono">
              <Scale size={8} />{s}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Dropped citation chip ─────────────────────────────────────────────────────
function DroppedCitation({ citation, onRemove }) {
  const name = (citation.file_name || 'Unknown')
    .replace(/_/g, ' ').replace(/\s+on\s+\d+.*$/i, '').trim()
  return (
    <div className="flex items-center gap-2 bg-navy-50 border border-navy-200
      rounded-xl px-3 py-2 mb-2 animate-slide-down">
      <FileText size={11} className="text-gold-500 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-xs text-navy-700 font-medium truncate">{name}</p>
        <p className="text-[10px] text-navy-400">
          {citation.year || '—'} · {Math.round((citation.score || 0) * 100)}% match · asking about this doc
        </p>
      </div>
      <button onClick={onRemove}
        className="p-0.5 rounded text-navy-300 hover:text-navy-600 transition-colors">
        <X size={11} />
      </button>
    </div>
  )
}

// ── Main ChatBot ──────────────────────────────────────────────────────────────
export default function ChatBot({ caseText }) {
  // Note: retrievedDocs prop intentionally removed —
  // LLM1 has NO knowledge of retrieved judgements.
  // Users drag citations in if they want to ask about them.

  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [droppedCitation, setDroppedCitation] = useState(null)
  const [isDragOver, setIsDragOver] = useState(false)
  const bottomRef = useRef()
  const inputRef = useRef()

  // Simple welcome message — no mention of judgements
  useEffect(() => {
    setMessages([{
      role: 'bot',
      text: `Hi! I'm LexMind, your Indian legal research assistant. How can I help you today?`,
      time: new Date(),
      sources: []
    }])
  }, [])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  // ── Drag & drop handlers ──
  const handleDragOver = (e) => { e.preventDefault(); setIsDragOver(true) }
  const handleDragLeave = () => setIsDragOver(false)
  const handleDrop = (e) => {
    e.preventDefault()
    setIsDragOver(false)
    try {
      const data = JSON.parse(e.dataTransfer.getData('application/citation'))
      setDroppedCitation(data)
      inputRef.current?.focus()
    } catch { }
  }

  // ── Extract [LAW:...] source pills from reply ──
  const extractSources = (text) => {
    const sources = new Set()
      ; (text.match(/\[LAW:[^\]]+\]/g) || []).forEach(m =>
        sources.add(m.replace(/\[LAW:|\]/g, '').trim())
      )
    return [...sources]
  }

  // ── Send message ──
  const sendMessage = async () => {
    const msg = input.trim()
    if (!msg || loading) return

    // Show citation context in user bubble if one was dropped
    const userDisplay = droppedCitation
      ? `[Re: ${(droppedCitation.file_name || '').replace(/_/g, ' ').replace(/\s+on\s+\d+.*$/i, '').trim().slice(0, 40)}] ${msg}`
      : msg

    setInput('')
    const citationForRequest = droppedCitation   // snapshot before clearing
    setDroppedCitation(null)
    setMessages(prev => [...prev, { role: 'user', text: userDisplay, time: new Date() }])
    setLoading(true)

    try {
      const r = await fetch(`${API}/smart-chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: msg,
          case_text: caseText || '',
          // Only send the dropped citation — NOT all retrieved docs
          dropped_citation: citationForRequest
            ? {
              file_name: citationForRequest.file_name,
              year: citationForRequest.year,
              content: (citationForRequest.content || '').slice(0, 3000),
              score: citationForRequest.score,
            }
            : null,
        })
      })

      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const data = await r.json()
      const reply = data.reply || ''

      setMessages(prev => [...prev, {
        role: 'bot',
        text: reply,
        time: new Date(),
        sources: extractSources(reply),
        intent: data.intent || 'chat',
      }])
    } catch {
      setMessages(prev => [...prev, {
        role: 'error',
        text: 'Could not connect to the backend. Please ensure the server is running.',
        time: new Date()
      }])
    } finally { setLoading(false) }
  }

  const handleKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() }
  }

  const fmt = (d) => d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`flex flex-col h-full bg-white border-l border-navy-100 transition-all duration-200
        ${isDragOver ? 'ring-2 ring-inset ring-gold-400 bg-gold-500/5' : ''}`}>

      {/* header — no judgement count */}
      <div className="flex items-center gap-3 px-5 py-4 border-b border-navy-100 bg-navy-800 flex-shrink-0">
        <div className="w-8 h-8 rounded-xl bg-gold-500/20 border border-gold-400/30
          flex items-center justify-center flex-shrink-0">
          <Bot size={15} className="text-gold-400" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-serif font-semibold text-white text-sm">LexMind Assistant</h3>
          <p className="text-navy-300 text-xs">Constitution · IPC · CrPC · BSA</p>
        </div>
        {/* green dot only when case is loaded */}
        {caseText && (
          <div className="w-2 h-2 rounded-full bg-emerald-400 shadow-sm shadow-emerald-400/50 flex-shrink-0" />
        )}
      </div>

      {/* drag-over banner */}
      {isDragOver && (
        <div className="mx-4 mt-3 flex items-center gap-2 bg-gold-500/10 border border-gold-400/30
          rounded-xl px-3 py-2.5 text-xs text-gold-600 font-medium animate-fade-in flex-shrink-0">
          <GripVertical size={13} />
          Drop citation here to ask a focused question about it
        </div>
      )}

      {/* messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-4">
        {messages.map((msg, i) => (
          <div key={i} className={`flex flex-col gap-1 animate-slide-up
            ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>

            {msg.role === 'error' ? (
              <div className="flex items-start gap-2 bg-red-50 border border-red-200
                rounded-xl px-3 py-2.5 max-w-[92%]">
                <AlertTriangle size={13} className="text-red-500 mt-0.5 flex-shrink-0" />
                <p className="text-xs text-red-600">{msg.text}</p>
              </div>
            ) : msg.role === 'user' ? (
              <div className="max-w-[92%] px-3.5 py-2.5 rounded-2xl rounded-br-sm
                bg-navy-800 text-white text-xs leading-relaxed">
                <p className="whitespace-pre-wrap">{msg.text}</p>
              </div>
            ) : (
              <div className="max-w-[95%] px-3.5 py-3 rounded-2xl rounded-bl-sm
                bg-navy-50 border border-navy-100">
                <RenderMessage text={msg.text} sources={msg.sources} />
              </div>
            )}

            <span className="text-[10px] text-navy-300 font-mono px-1">
              {msg.role === 'user' && <User size={9} className="inline mr-1" />}
              {fmt(msg.time)}
            </span>
          </div>
        ))}

        {/* typing indicator */}
        {loading && (
          <div className="flex items-start gap-2 animate-slide-up">
            <div className="bg-navy-50 border border-navy-100 rounded-2xl rounded-bl-sm px-4 py-3">
              <div className="flex gap-1.5">
                {[0, 1, 2].map(i => (
                  <div key={i} className="w-1.5 h-1.5 rounded-full bg-navy-400 animate-bounce-dot"
                    style={{ animationDelay: `${i * 0.2}s` }} />
                ))}
              </div>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* input area */}
      <div className="px-4 pb-4 pt-2 border-t border-navy-100 flex-shrink-0">

        {/* dropped citation chip */}
        {droppedCitation && (
          <DroppedCitation
            citation={droppedCitation}
            onRemove={() => setDroppedCitation(null)}
          />
        )}

        {/* drag hint — always visible */}
        {!droppedCitation && (
          <div className="flex items-center gap-1.5 text-[10px] text-navy-300 mb-2">
            <GripVertical size={10} />
            Drag a citation card here to ask about it
          </div>
        )}

        <div className="flex gap-2 items-end">
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKey}
            placeholder={
              droppedCitation
                ? `Ask about ${(droppedCitation.file_name || '').replace(/_/g, ' ').replace(/\s+on\s+\d+.*$/i, '').trim().slice(0, 30)}…`
                : 'Ask me anything…'
            }
            rows={1}
            className="flex-1 bg-navy-50 border border-navy-200 rounded-xl text-xs
              text-navy-700 placeholder-navy-300 px-3 py-2.5 outline-none resize-none
              focus:border-navy-400 focus:bg-white transition-all duration-200
              max-h-28 leading-relaxed"
            style={{ minHeight: '40px' }}
          />
          <button onClick={sendMessage}
            disabled={!input.trim() || loading}
            className="w-9 h-9 rounded-xl bg-navy-800 text-white flex items-center justify-center
              hover:bg-navy-700 disabled:opacity-40 disabled:cursor-not-allowed
              transition-all duration-200 flex-shrink-0">
            <Send size={13} />
          </button>
        </div>
        <p className="text-[10px] text-navy-300 text-center mt-2">
          LexMind · Indian Legal Research
        </p>
      </div>
    </div>
  )
}