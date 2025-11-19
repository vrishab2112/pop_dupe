import React, { useRef, useState } from 'react'
import { ingestFile, ingestWeb, ingestYouTube, listGroups } from '../api'

type Props = { boardId: string; onAdded: () => void; selectedItemIds?: string[] }

export default function Sidebar({ boardId, onAdded, selectedItemIds = [] }: Props) {
  const [yt, setYt] = useState('')
  const [url, setUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  async function addYT() {
    if (!yt) return
    setBusy(true)
    try {
      // Prompt for target group first
      const g = await chooseGroup()
      setStatus('Fetching captions/transcript...')
      const item = await ingestYouTube(boardId, yt)
      setYt('')
      setStatus('Done')
      if (g) { await applyGroup(item.id, g) }
      onAdded()
    } catch (e: any) {
      setStatus('Failed to fetch video transcript')
      alert('Failed to fetch video transcript. Please check the URL and try again.')
    } finally {
      setBusy(false)
    }
  }

  async function addWeb() {
    if (!url) return
    setBusy(true)
    try {
      const g = await chooseGroup()
      const item = await ingestWeb(boardId, url)
      setUrl('')
      if (g) { await applyGroup(item.id, g) }
      onAdded()
    } finally {
      setBusy(false)
    }
  }

  async function addFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    setBusy(true)
    try {
      const g = await chooseGroup()
      const item = await ingestFile(boardId, f)
      if (fileRef.current) fileRef.current.value = ''
      if (g) { await applyGroup(item.id, g) }
      onAdded()
    } catch (err: any) {
      setStatus('Failed to extract document text')
      alert('Failed to extract document text. Try a different file or format.')
    } finally {
      setBusy(false)
    }
  }

  async function chooseGroup(): Promise<string> {
    try {
      const groups = await listGroups(boardId)
      const names = groups.map(g => g.name)
      const hint = names.length ? `Existing groups: ${names.join(', ')}` : 'No groups yet'
      const ans = window.prompt(`Add to which group? (leave blank for none)\n${hint}`) || ''
      return ans.trim()
    } catch {
      const ans = window.prompt('Add to which group? (leave blank for none)') || ''
      return ans.trim()
    }
  }

  async function applyGroup(itemId: string, group: string) {
    const form = new FormData()
    form.append('item_ids', itemId)
    form.append('group', group)
    await fetch('http://127.0.0.1:8000/items/group', { method: 'POST', body: form })
  }

  return (
    <div style={{ width: 320, padding: 12, borderRight: '1px solid #333', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <h3 style={{ margin: 0 }}>Add Sources</h3>
      <div>
        <input placeholder="YouTube URL" value={yt} onChange={(e) => setYt(e.target.value)} style={{ width: '100%' }} />
        <button disabled={busy} onClick={addYT} style={{ marginTop: 6, width: '100%' }}>{busy ? 'Fetching…' : 'Fetch Transcript'}</button>
      </div>
      <div>
        <input placeholder="Web URL" value={url} onChange={(e) => setUrl(e.target.value)} style={{ width: '100%' }} />
        <button disabled={busy} onClick={addWeb} style={{ marginTop: 6, width: '100%' }}>{busy ? 'Adding…' : 'Add Web'}</button>
      </div>
      <div>
        <input ref={fileRef} type="file" onChange={addFile} />
      </div>
      <div style={{ fontSize: 12, opacity: 0.7 }}>{status}</div>
    </div>
  )
}



