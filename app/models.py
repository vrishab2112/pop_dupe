from typing import List, Optional, Literal, Dict
from pydantic import BaseModel, Field
from uuid import uuid4
import time


class Board(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid4()))
    name: str
    created_at: float = Field(default_factory=lambda: time.time())
    updated_at: float = Field(default_factory=lambda: time.time())


class ItemType:
    YOUTUBE = "youtube"
    DOCUMENT = "document"
    WEBPAGE = "webpage"
    AUDIOVIDEO = "audiovideo"


class Item(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid4()))
    board_id: str
    type: Literal[
        ItemType.YOUTUBE,
        ItemType.DOCUMENT,
        ItemType.WEBPAGE,
        ItemType.AUDIOVIDEO,
    ]
    title: str
    source: str  # path or URL
    meta: Dict[str, str] = {}
    created_at: float = Field(default_factory=lambda: time.time())
    updated_at: float = Field(default_factory=lambda: time.time())


class Chunk(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid4()))
    item_id: str
    text: str
    order: int
    start_s: float | None = None
    end_s: float | None = None


class ChatQuery(BaseModel):
    board_id: Optional[str] = None
    item_ids: Optional[List[str]] = None
    query: str
    top_k: int = 20


class ChatAnswer(BaseModel):
    answer: str
    contexts: List[Dict]


class Group(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid4()))
    board_id: str
    name: str
    template: str = ""
    created_at: float = Field(default_factory=lambda: time.time())
    updated_at: float = Field(default_factory=lambda: time.time())



