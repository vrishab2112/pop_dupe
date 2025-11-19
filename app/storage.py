import json
import os
import time
from typing import List, Dict, Optional
from .models import Board, Item, Chunk, Group
from .config import settings


DB_FILE = os.path.join(settings.data_dir, "db.json")


def _default_db() -> Dict:
    return {"boards": [], "items": [], "chunks": [], "groups": []}


def _load() -> Dict:
    if not os.path.exists(DB_FILE):
        return _default_db()
    try:
        with open(DB_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
    except Exception:
        # Corrupted JSON; back it up and start fresh to avoid crashes
        try:
            ts = int(time.time())
            corrupt_path = DB_FILE + f".corrupt-{ts}"
            try:
                os.replace(DB_FILE, corrupt_path)
            except Exception:
                pass
        finally:
            data = _default_db()
    # Ensure required keys exist (forward-compatible migrations)
    data.setdefault("boards", [])
    data.setdefault("items", [])
    data.setdefault("chunks", [])
    data.setdefault("groups", [])
    return data


def _save(data: Dict) -> None:
    os.makedirs(settings.data_dir, exist_ok=True)
    tmp_path = DB_FILE + ".tmp"
    with open(tmp_path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.flush()
        os.fsync(f.fileno())
    os.replace(tmp_path, DB_FILE)


def list_boards() -> List[Board]:
    data = _load()
    return [Board(**b) for b in data.get("boards", [])]


def create_board(name: str) -> Board:
    data = _load()
    board = Board(name=name)
    boards = data.get("boards", [])
    boards.append(board.model_dump())
    data["boards"] = boards
    _save(data)
    return board


def delete_board(board_id: str) -> None:
    data = _load()
    data["boards"] = [b for b in data.get("boards", []) if b["id"] != board_id]
    data["items"] = [i for i in data.get("items", []) if i["board_id"] != board_id]
    item_ids = {c["item_id"] for c in data.get("chunks", []) if c["item_id"]}
    data["chunks"] = [c for c in data.get("chunks", []) if c.get("item_id") not in item_ids]
    _save(data)


def list_items(board_id: str) -> List[Item]:
    data = _load()
    return [Item(**i) for i in data.get("items", []) if i["board_id"] == board_id]


def add_item(item: Item) -> Item:
    data = _load()
    items = data.get("items", [])
    items.append(item.model_dump())
    data["items"] = items
    _save(data)
    return item


def save_chunks(chunks: List[Chunk]) -> None:
    data = _load()
    existing = data.get("chunks", [])
    existing.extend([c.model_dump() for c in chunks])
    data["chunks"] = existing
    _save(data)


def get_item(item_id: str) -> Optional[Item]:
    data = _load()
    for i in data.get("items", []):
        if i["id"] == item_id:
            return Item(**i)
    return None


def list_chunks_by_item(item_id: str) -> List[Chunk]:
    data = _load()
    return [Chunk(**c) for c in data.get("chunks", []) if c.get("item_id") == item_id]


def delete_item_and_chunks(item_id: str) -> None:
    data = _load()
    data["items"] = [i for i in data.get("items", []) if i.get("id") != item_id]
    data["chunks"] = [c for c in data.get("chunks", []) if c.get("item_id") != item_id]
    _save(data)


def update_items_group(item_ids: List[str], group: str) -> None:
    data = _load()
    changed = False
    for i in data.get("items", []):
        if i.get("id") in item_ids:
            meta = i.get("meta") or {}
            meta["group"] = group
            i["meta"] = meta
            changed = True
    if changed:
        _save(data)


# Caption segments persistence (per item)
import json
def _captions_path(item_id: str) -> str:
    cap_dir = os.path.join(settings.data_dir, "captions")
    os.makedirs(cap_dir, exist_ok=True)
    return os.path.join(cap_dir, f"{item_id}.json")


def save_captions(item_id: str, segments: List[Dict]) -> None:
    path = _captions_path(item_id)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(segments, f, ensure_ascii=False)


def get_captions(item_id: str) -> List[Dict]:
    path = _captions_path(item_id)
    if not os.path.exists(path):
        return []
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


# Group templates
def list_groups(board_id: str) -> List[Group]:
    data = _load()
    return [Group(**g) for g in data.get("groups", []) if g.get("board_id") == board_id]


def upsert_group(board_id: str, name: str, template: str) -> Group:
    data = _load()
    groups = data.get("groups", [])
    found = None
    for g in groups:
        if g.get("board_id") == board_id and g.get("name") == name:
            found = g
            break
    if found is None:
        group = Group(board_id=board_id, name=name, template=template)
        groups.append(group.model_dump())
        data["groups"] = groups
        _save(data)
        return group
    else:
        found["template"] = template
        data["groups"] = groups
        _save(data)
        return Group(**found)


def delete_group(board_id: str, name: str) -> int:
    data = _load()
    groups = data.get("groups", [])
    before = len(groups)
    lname = (name or "").lower()
    groups = [g for g in groups if not (g.get("board_id") == board_id and (g.get("name") or "").lower() == lname)]
    data["groups"] = groups
    _save(data)
    return before - len(groups)



