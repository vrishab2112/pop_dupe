import React, { useCallback, useEffect, useState } from 'react'
import ReactFlow, { Background, Controls, addEdge, MiniMap, useNodesState, useEdgesState } from 'reactflow'
import type { Connection, Edge, Node, NodeMouseHandler, NodeDragHandler, NodeProps } from 'reactflow'
import 'reactflow/dist/style.css'
import type { Item } from '../types'
import { deleteItem, listGroups, upsertGroup } from '../api'

type Props = {
  items: Item[]
  onSelectionChange?: (selectedIds: string[]) => void
  onDeleted?: () => void
  onGroupSelect?: (name: string) => void
  boardId?: string
}

function NodeLabel({ id, label, onDeleted }: { id: string; label: string; onDeleted?: () => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ fontWeight: 600 }}>{label}</span>
      <button title="Delete" onClick={async (e) => { e.stopPropagation(); try { await deleteItem(id); onDeleted?.() } catch {} }} style={{ border: 'none', background: 'transparent', color: '#f66', cursor: 'pointer' }}>🗑</button>
    </div>
  )
}

export default function Whiteboard({ items, onSelectionChange, onDeleted, onGroupSelect, boardId }: Props) {
  const [nodes, setNodes, onNodesChange] = useNodesState([])
  const [edges, setEdges, onEdgesChange] = useEdgesState([])
  const [groupNodes, setGroupNodes] = useState<Node[]>([] as any)

  const onConnect = useCallback((params: Edge | Connection) => setEdges((eds) => addEdge({ ...params, animated: true }, eds)), [])

  const onSelection = useCallback((sel: { nodes: Node[]; edges: Edge[] }) => {
    onSelectionChange?.(sel.nodes.map((n) => n.id))
  }, [onSelectionChange])

  const onNodeContextMenu: NodeMouseHandler = useCallback(async (event, node) => {
    event.preventDefault()
    const labelRaw = (node?.data as any)?.label
    const labelStr = typeof labelRaw === 'string' ? labelRaw : (typeof (node as any).id === 'string' ? node.id : 'item')
    // Determine if node is currently grouped by checking state
    const stateNode = nodes.find((n) => n.id === node.id)
    if (node.type === 'group') {
      const okDel = confirm(`Delete group "${labelStr}"? Items will be kept.`)
      if (!okDel) return
      // Detach children and remove the group box only
      const childrenIds: string[] = nodes.filter((n) => (n as any).parentNode === node.id && n.type !== 'group').map((n) => n.id)
      setNodes((ns) => ns
        .map((n) => (n as any).parentNode === node.id ? { ...n, parentNode: undefined, extent: undefined } : n)
        .filter((n) => n.id !== node.id)
      )
      setGroupNodes((gs) => gs.filter((g) => g.id !== node.id))
      // Persist: clear group assignment for detached items
      if (childrenIds.length) {
        try {
          const form = new FormData(); form.append('item_ids', childrenIds.join(',')); form.append('group', '')
          await fetch('http://127.0.0.1:8000/items/group', { method: 'POST', body: form })
        } catch {}
      }
      // Persist: delete the group record so it disappears from chooser
      try {
        const gname = String(((node.data as any)?.groupName) || ((node.data as any)?.label) || node.id)
        if (boardId) {
          const url = new URL('http://127.0.0.1:8000/groups')
          url.searchParams.set('board_id', boardId)
          url.searchParams.set('name', gname)
          await fetch(url.toString(), { method: 'DELETE' })
        }
      } catch {}
      return
    }
    if (stateNode && (stateNode as any).parentNode) {
      const ok = confirm('Remove from group?')
      if (!ok) return
      setNodes((ns) => ns.map((n) => n.id === node.id ? { ...n, parentNode: undefined, extent: undefined } : n))
      try {
        const form = new FormData(); form.append('item_ids', node.id); form.append('group', '')
        await fetch('http://127.0.0.1:8000/items/group', { method: 'POST', body: form })
      } catch {}
      return
    }
    const ok = confirm(`Delete "${labelStr}"?`)
    if (!ok) return
    try { await deleteItem(node.id); onDeleted?.() } catch {}
  }, [nodes, onDeleted])

  const onKeyDown = useCallback(async (e: React.KeyboardEvent) => {
    if ((e.key === 'Delete' || e.key === 'Backspace') && nodes.length) {
      e.preventDefault()
      const selected = nodes.filter((n) => n.selected).map((n) => n.id)
      for (const id of selected) {
        try { await deleteItem(id) } catch {}
      }
      onDeleted?.()
    }
  }, [nodes])

  const onDragStop: NodeDragHandler = useCallback(async (evt, node) => {
    if (node.type === 'group') {
      // Persist moved group position so it doesn't snap back on next render
      setGroupNodes((gs) => gs.map((g) => g.id === node.id ? { ...g, position: { ...node.position } } as any : g))
      return
    }
    const groups = groupNodes
    const within = groups.find((g) => {
      const gw = (g as any).width ?? 360
      const gh = (g as any).height ?? 260
      return (
        node.position.x >= g.position.x && node.position.x <= g.position.x + gw &&
        node.position.y >= g.position.y && node.position.y <= g.position.y + gh
      )
    })
    if (within) {
      setNodes((ns) => ns.map((n) => n.id === node.id ? { ...n, parentNode: within.id, position: { x: node.position.x - within.position.x, y: node.position.y - within.position.y }, extent: 'parent' } : n))
      const groupName = (within.data as any)?.groupName || (within.data as any)?.label || within.id
      try {
        const form = new FormData(); form.append('item_ids', node.id); form.append('group', String(groupName))
        await fetch('http://127.0.0.1:8000/items/group', { method: 'POST', body: form })
      } catch {}
    } else if (node.parentNode) {
      setNodes((ns) => ns.map((n) => n.id === node.id ? { ...n, parentNode: undefined } : n))
      try {
        const form = new FormData(); form.append('item_ids', node.id); form.append('group', '')
        await fetch('http://127.0.0.1:8000/items/group', { method: 'POST', body: form })
      } catch {}
    }
  }, [groupNodes, setNodes])

  const editGroup = useCallback(async (name: string) => {
    try {
      if (!boardId) return
      const groups = await listGroups(boardId)
      const existing = groups.find(g => g.name === name)
      const current = existing?.template || ''
      const updated = prompt(`Define a prompt template for ${name}.\nThis will be used as guidance when asking questions about this group.`, current)
      if (updated !== null) {
        await upsertGroup(boardId, name, updated)
      }
    } catch {}
  }, [boardId])

  const addGroup = useCallback(async () => {
    const name = prompt('Group name?')?.trim(); if (!name) return
    // Ask for definition before the group appears
    await editGroup(name)
    const id = `group-${Date.now()}`
    const offset = groupNodes.length
    const g: Node = { id, type: 'group', position: { x: 100 + offset * 40, y: 100 + offset * 40 }, data: { label: name, groupName: name, onEdit: () => editGroup(name) }, style: { width: 360, height: 260, background: '#0b0b0b', border: '1px dashed #555', borderRadius: 8, padding: 8, cursor: 'pointer' }, selectable: true } as any
    setGroupNodes((gs) => { const next = [...gs, g]; setNodes((ns) => [g, ...ns]); return next })
    onGroupSelect?.(name)
  }, [setNodes, setGroupNodes, editGroup, groupNodes.length, onGroupSelect])

  useEffect(() => {
    // Map existing, user-created groups by name (case-insensitive)
    const groupsByNameLower = new Map(groupNodes.map((g) => [String((g.data as any)?.groupName).toLowerCase(), g]))
    // Keep per-group stacking index so items don't overlap and appear "deleted"
    const stackIndex: Record<string, number> = {}
    const mapped: Node[] = items.map((it, idx) => {
      const base: Node = { id: it.id, position: { x: 80 + (idx % 5) * 220, y: 80 + Math.floor(idx / 5) * 160 }, data: { label: <NodeLabel id={it.id} label={`${it.title}`} onDeleted={onDeleted} /> }, type: 'default' } as any
      const gname = (it as any).meta?.group
      if (gname && groupsByNameLower.has(String(gname).toLowerCase())) {
        const g = groupsByNameLower.get(String(gname).toLowerCase())!
        base.parentNode = g.id
        base.extent = 'parent' as any
        const idxInGroup = (stackIndex[gname] = (stackIndex[gname] ?? 0))
        base.position = { x: 20, y: 40 + idxInGroup * 100 }
        stackIndex[gname] = idxInGroup + 1
      }
      return base
    })
    setNodes([...(groupNodes as any), ...mapped])
  }, [items, setNodes, groupNodes, editGroup])

  return (
    <div style={{ width: '100%', height: '100%' }} tabIndex={0} onKeyDown={onKeyDown}>
      <div style={{ position: 'absolute', zIndex: 10, left: 8, top: 8 }}>
        <button onClick={addGroup}>Add Group</button>
      </div>
      <ReactFlow nodeTypes={{ group: GroupNode }} nodes={nodes} edges={edges} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onConnect={onConnect} onSelectionChange={onSelection} onNodeContextMenu={onNodeContextMenu} onNodeDragStop={onDragStop} onNodeClick={async (e, n) => {
        if (n.type === 'group') {
          const name = String((n.data as any)?.groupName || (n.data as any)?.label || n.id)
          onGroupSelect?.(name)
          const onEdit = (n.data as any)?.onEdit
          if (typeof onEdit === 'function') onEdit()
        }
      }} onNodeDoubleClick={async (e, n) => {
        if (n.type !== 'group') return
        const name = String((n.data as any)?.groupName || (n.data as any)?.label || n.id)
        onGroupSelect?.(name)
        const onEdit = (n.data as any)?.onEdit
        if (typeof onEdit === 'function') onEdit()
      }} fitView>
        <MiniMap />
        <Controls />
        <Background variant="dots" gap={12} size={1} />
      </ReactFlow>
    </div>
  )
}

function GroupNode({ data }: NodeProps) {
  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'flex-start', cursor: 'pointer' }} onClick={(e) => { e.stopPropagation(); const fn = (data as any)?.onEdit; if (typeof fn === 'function') fn() }} onDoubleClick={(e) => { e.stopPropagation(); const fn = (data as any)?.onEdit; if (typeof fn === 'function') fn() }}>
      <div style={{ fontWeight: 700, color: '#ccc' }}>{String((data as any)?.label ?? 'Group')}</div>
    </div>
  )
}


