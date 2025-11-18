import type { Board, Item, ChatAnswer, ChatQuery } from './types'

// Use API base from Vite env at build time; default to same-origin /api for Nginx proxy
const BASE = (import.meta as any)?.env?.VITE_API_BASE || '/api'

export async function listBoards(): Promise<Board[]> {
  const r = await fetch(`${BASE}/boards`)
  return await r.json()
}

export async function createBoard(name: string): Promise<Board> {
  const form = new FormData()
  form.append('name', name)
  const r = await fetch(`${BASE}/boards`, { method: 'POST', body: form })
  return await r.json()
}

export async function listItems(boardId: string): Promise<Item[]> {
  const r = await fetch(`${BASE}/boards/${boardId}/items`)
  return await r.json()
}

export async function deleteItem(itemId: string): Promise<void> {
  await fetch(`${BASE}/items/${itemId}`, { method: 'DELETE' })
}

export async function ingestYouTube(boardId: string, url: string, title?: string): Promise<Item> {
  const form = new FormData()
  form.append('board_id', boardId)
  form.append('url', url)
  if (title) form.append('title', title)
  const r = await fetch(`${BASE}/ingest/youtube`, { method: 'POST', body: form })
  if (!r.ok) {
    let msg = r.statusText
    try { const j = await r.json(); msg = (j?.error || j?.detail || msg) } catch {}
    throw new Error(`ingestYouTube failed: ${msg}`)
  }
  return await r.json()
}

export async function ingestWeb(boardId: string, url: string, title?: string): Promise<Item> {
  const form = new FormData()
  form.append('board_id', boardId)
  form.append('url', url)
  if (title) form.append('title', title)
  const r = await fetch(`${BASE}/ingest/web`, { method: 'POST', body: form })
  if (!r.ok) {
    let msg = r.statusText
    try { const j = await r.json(); msg = (j?.error || j?.detail || msg) } catch {}
    throw new Error(`ingestWeb failed: ${msg}`)
  }
  return await r.json()
}

export async function ingestFile(boardId: string, file: File, title?: string): Promise<Item> {
  const form = new FormData()
  form.append('board_id', boardId)
  form.append('file', file)
  if (title) form.append('title', title)
  const r = await fetch(`${BASE}/ingest/file`, { method: 'POST', body: form })
  if (!r.ok) {
    let msg = r.statusText
    try { const j = await r.json(); msg = (j?.error || j?.detail || msg) } catch {}
    throw new Error(`ingestFile failed: ${msg}`)
  }
  return await r.json()
}

export async function chat(query: ChatQuery): Promise<ChatAnswer> {
  const r = await fetch(`${BASE}/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(query) })
  return await r.json()
}

export async function listGroups(boardId: string): Promise<{ id: string; name: string; template: string }[]> {
  const r = await fetch(`${BASE}/boards/${boardId}/groups`)
  return await r.json()
}

export async function upsertGroup(boardId: string, name: string, template: string): Promise<{ id: string; name: string; template: string }>{
  const form = new FormData()
  form.append('board_id', boardId)
  form.append('name', name)
  form.append('template', template)
  const r = await fetch(`${BASE}/groups`, { method: 'POST', body: form })
  return await r.json()
}



