import { useEffect, useMemo, useRef, useState } from 'react'
import './App.css'
import { createBoard, listBoards, listItems } from './api'
import type { Board, Item } from './types'
import Whiteboard from './components/Whiteboard'
import Sidebar from './components/Sidebar'
import ChatPanel from './components/ChatPanel'

function App() {
  const [boards, setBoards] = useState<Board[]>([])
  const [active, setActive] = useState<string | undefined>(undefined)
  const [items, setItems] = useState<Item[]>([])
  const [selected, setSelected] = useState<string[]>([])
  const [groupName, setGroupName] = useState('')
  const [chatFullscreen, setChatFullscreen] = useState(false)

  async function refreshBoards() {
    try {
      const b = await listBoards()
      setBoards(b)
      if (!active && b.length) setActive(b[0].id)
    } catch (e) {
      console.error('Failed to load boards', e)
    }
  }

  async function ensureDefaultBoard() {
    try {
      const b = await listBoards()
      if (b.length === 0) {
        const created = await createBoard('My Board')
        setBoards([created])
        setActive(created.id)
      } else {
        setBoards(b)
        setActive(b[0].id)
      }
    } catch (e) {
      console.warn('Backend not reachable yet. Start the FastAPI server and refresh.')
    }
  }

  const fetchingRef = useRef(false)
  const pendingRef = useRef(false)
  async function refreshItems() {
    if (!active) return
    if (fetchingRef.current) { pendingRef.current = true; return }
    fetchingRef.current = true
    try {
      const its = await listItems(active)
      setItems(its)
    } catch (e) {
      console.error('Failed to load items', e)
    } finally {
      fetchingRef.current = false
      if (pendingRef.current) { pendingRef.current = false; void refreshItems() }
    }
  }

  useEffect(() => {
    ensureDefaultBoard()
  }, [])

  useEffect(() => {
    refreshItems()
  }, [active])

  const header = (
    <div style={{ display: 'flex', gap: 8, padding: 8, borderBottom: '1px solid #333', alignItems: 'center' }}>
      <strong>BoardChat</strong>
      <select value={active} onChange={(e) => { setActive(e.target.value); setTimeout(() => refreshItems(), 0) }}>
        {boards.map((b) => (
          <option key={b.id} value={b.id}>{b.name}</option>
        ))}
      </select>
      <button onClick={async () => { const n = prompt('Board name?')?.trim(); if (n) { await createBoard(n); await refreshBoards(); await refreshItems() } }}>New Board</button>
      <button onClick={async () => { await ensureDefaultBoard(); await refreshItems() }}>Refresh</button>
      <span style={{ marginLeft: 'auto', opacity: 0.7 }}>Selected: {selected.length}</span>
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      {header}
      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        {active ? (
          <>
            <Sidebar boardId={active} onAdded={refreshItems} selectedItemIds={selected} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <Whiteboard items={items} onSelectionChange={(ids) => setSelected(ids)} onDeleted={refreshItems} onGroupSelect={(name) => setGroupName(name)} boardId={active} />
            </div>
            <ChatPanel boardId={active} selectedItemIds={selected} fullscreen={chatFullscreen} onToggleFullscreen={() => setChatFullscreen((v) => !v)} />
          </>
        ) : (
          <div style={{ padding: 16, display: 'flex', gap: 12, alignItems: 'center' }}>
            <span>Start the backend at http://127.0.0.1:8000 then click Retry.</span>
            <button onClick={async () => { await ensureDefaultBoard(); await refreshItems() }}>Retry</button>
          </div>
        )}
      </div>
    </div>
  )
}

export default App
