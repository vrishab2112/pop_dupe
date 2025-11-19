export type ItemType = 'youtube' | 'document' | 'webpage' | 'audiovideo'

export interface Board {
  id: string
  name: string
  created_at: number
  updated_at: number
}

export interface Item {
  id: string
  board_id: string
  type: ItemType
  title: string
  source: string
  meta?: Record<string, string>
  created_at: number
  updated_at: number
}

export interface ChatQuery {
  board_id?: string
  item_ids?: string[]
  query: string
  top_k?: number
}

export interface ChatAnswer {
  answer: string
  contexts: { id?: string; item_id?: string; text: string }[]
}








