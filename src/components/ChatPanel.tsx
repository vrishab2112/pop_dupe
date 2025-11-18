import React, { useEffect, useRef, useState } from 'react'
import { chat } from '../api'

type Props = { boardId?: string; selectedItemIds: string[]; fullscreen?: boolean; onToggleFullscreen?: () => void }

export default function ChatPanel({ boardId, selectedItemIds, fullscreen = false, onToggleFullscreen }: Props) {
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(false)
  const [messages, setMessages] = useState<{ role: 'user' | 'assistant'; text: string }[]>([])
  const onlyOne = selectedItemIds.length === 1
  const listRef = useRef<HTMLDivElement | null>(null)
  const [open, setOpen] = useState(true)

  async function ask() {
    if (!q.trim()) return
    setBusy(true)
    const question = q.trim()
    setMessages((m) => [...m, { role: 'user', text: question }])
    setQ('')
    try {
      const topK = selectedItemIds.length > 1 ? 24 : 16
      const res = await chat({ board_id: boardId, item_ids: selectedItemIds.length ? selectedItemIds : undefined, query: q, top_k: topK })
      setMessages((m) => [...m, { role: 'assistant', text: res.answer || '' }])
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    // Keep scrolled to bottom on new messages
    const el = listRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages])

  function clearChat() {
    setMessages([])
  }

  async function copyLast() {
    const last = [...messages].reverse().find((m) => m.role === 'assistant')
    if (last?.text) {
      await navigator.clipboard.writeText(last.text)
    }
  }

  const isOpen = fullscreen ? true : open

  return (
    <div className={`chat-drawer ${fullscreen ? 'fullscreen' : (isOpen ? 'open' : 'collapsed')}`} style={{ height: '100%' }}>
      {!fullscreen && <button className="drawer-toggle" onClick={() => setOpen(!open)} title={isOpen ? 'Collapse' : 'Expand'}>
        {open ? '⟩' : '⟨'}
        {!open && <div className="drawer-label">Chat</div>}
      </button>}
      {isOpen && (
        <div className="chat-panel" style={{ height: '100%' }}>
          <div className="chat-header">
            <h3 style={{ margin: 0 }}>Chat</h3>
            <div className="chat-actions">
              <button onClick={onToggleFullscreen} title={fullscreen ? 'Minimize' : 'Fullscreen'}>
                {fullscreen ? 'Minimize' : 'Fullscreen'}
              </button>
              <button onClick={clearChat} title="Clear conversation">Clear</button>
              <button onClick={copyLast} title="Copy last answer">Copy</button>
            </div>
          </div>
          <div className={`chat-body ${fullscreen ? 'full' : ''}`}>
            <div ref={listRef} className="chat-messages">
              {messages.map((m, i) => (
                <div key={i} className={`message ${m.role === 'user' ? 'user' : 'bot'}`}>
                  <div className="bubble">
                    <div className="bubble-meta">{m.role === 'user' ? 'You' : 'Assistant'}</div>
                    <div className="bubble-text">{m.text}</div>
                  </div>
                </div>
              ))}
              {!messages.length && <div style={{ opacity: 0.6 }}>Ask about selected nodes or the whole board. Answers appear here.</div>}
            </div>
            <div className={`chat-composer ${fullscreen ? 'fullscreen' : ''}`}>
              <div className="composer-inner">
                <textarea
                  className="composer-input"
                  rows={1}
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Ask a question..."
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void ask() } }}
                />
                <div className="composer-actions">
                  <button disabled={busy || !q.trim()} onClick={ask}>{busy ? 'Thinking…' : 'Send'}</button>
                </div>
              </div>
              {!fullscreen && <small style={{ opacity: 0.7, marginTop: 6 }}>Tip: Reference groups in your question, e.g. “Suggest timestamps for group3 using group1 as positive and avoiding group2 patterns”.</small>}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}



