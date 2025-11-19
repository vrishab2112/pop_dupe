from fastapi import FastAPI, UploadFile, Form
from fastapi.responses import JSONResponse, RedirectResponse
from typing import List, Optional

from .models import Board, Item, ChatQuery, ChatAnswer, Group
from .storage import list_boards, create_board, delete_board, list_items, list_chunks_by_item, delete_item_and_chunks, update_items_group, get_captions, list_groups, upsert_group, get_item, delete_group
from .ingest import (
    ingest_youtube,
    ingest_web_url,
    ingest_pdf,
    ingest_docx,
    ingest_txt,
    ingest_media,
)
from .vector_store import query as vs_query
from .llm import chat_answer


app = FastAPI()

try:
    from fastapi.middleware.cors import CORSMiddleware
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["http://localhost:5173", "http://127.0.0.1:5173", "*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
except Exception:
    pass


@app.get("/", include_in_schema=False)
def root():
    return RedirectResponse(url="/docs")


@app.get("/healthz", include_in_schema=False)
def health():
    return {"ok": True}


@app.get("/boards", response_model=List[Board])
def get_boards():
    return list_boards()


@app.post("/boards", response_model=Board)
def post_board(name: str = Form(...)):
    return create_board(name)


@app.delete("/boards/{board_id}")
def del_board(board_id: str):
    delete_board(board_id)
    return {"ok": True}


@app.get("/boards/{board_id}/items")
def get_items(board_id: str):
    return [i.model_dump() for i in list_items(board_id)]


@app.post("/ingest/youtube")
def api_ingest_youtube(board_id: str = Form(...), url: str = Form(...), title: Optional[str] = Form("")):
    item = ingest_youtube(board_id, url, title)
    return item.model_dump()


@app.delete("/items/{item_id}")
def api_delete_item(item_id: str):
    delete_item_and_chunks(item_id)
    return {"ok": True}


@app.post("/items/group")
def api_group_items(item_ids: str = Form(...), group: str = Form(...)):
    ids = [s for s in item_ids.split(",") if s]
    update_items_group(ids, group)
    return {"ok": True, "count": len(ids)}


@app.get("/boards/{board_id}/groups", response_model=list[Group])
def api_list_groups(board_id: str):
    return [g.model_dump() for g in list_groups(board_id)]


@app.post("/groups", response_model=Group)
def api_upsert_group(board_id: str = Form(...), name: str = Form(...), template: str = Form("")):
    g = upsert_group(board_id, name, template)
    return g.model_dump()


@app.delete("/groups")
def api_delete_group(board_id: str, name: str):
    removed = delete_group(board_id, name)
    return {"ok": True, "removed": removed}


@app.post("/ingest/web")
def api_ingest_web(board_id: str = Form(...), url: str = Form(...), title: Optional[str] = Form("")):
    item = ingest_web_url(board_id, url, title)
    return item.model_dump()


@app.post("/ingest/file")
async def api_ingest_file(board_id: str = Form(...), file: UploadFile = None, title: Optional[str] = Form("")):
    import os, tempfile

    if not file:
        return JSONResponse({"error": "file missing"}, status_code=400)

    suffix = "" if "." not in file.filename else file.filename[file.filename.rfind("."):]
    tmpdir = tempfile.mkdtemp()
    path = os.path.join(tmpdir, f"upload{suffix}")
    with open(path, "wb") as f:
        f.write(await file.read())

    ext = suffix.lower()
    if ext in [".pdf"]:
        item = ingest_pdf(board_id, path, title)
    elif ext in [".docx"]:
        item = ingest_docx(board_id, path, title)
    elif ext in [".txt", ".md"]:
        item = ingest_txt(board_id, path, title)
    elif ext in [".mp3", ".mp4", ".m4a", ".wav", ".webm"]:
        item = ingest_media(board_id, path, title)
    else:
        item = ingest_txt(board_id, path, title)

    return item.model_dump()


@app.post("/chat", response_model=ChatAnswer)
def api_chat(q: ChatQuery):
    # If exactly one item is selected, shortcut: use its transcript directly (no vector search)
    if q.item_ids and len(q.item_ids) == 1:
        chunks = list_chunks_by_item(q.item_ids[0])
        contexts = [{"text": c.text, "item_id": c.item_id, "start_s": getattr(c, "start_s", None), "end_s": getattr(c, "end_s", None)} for c in chunks]
        # Attach group description if present
        try:
            item = get_item(q.item_ids[0])
            if item and item.meta and item.meta.get("group") and q.board_id:
                groups = list_groups(q.board_id)
                gmap = {g.name: g.template for g in groups}
                gname = item.meta.get("group")
                if gname in gmap and gmap[gname].strip():
                    contexts.insert(0, {"text": f"Group {gname} description: {gmap[gname]}"})
        except Exception:
            pass
        answer = chat_answer(q.query, contexts)
        return ChatAnswer(answer=answer, contexts=contexts[:10])

    # If multiple items selected or none, do hybrid: vector search + per-source summaries fallback
    allowed = q.item_ids

    # Detect group names in the query and scope retrieval to items in those groups
    scoped_contexts = []
    try:
        if q.board_id:
            groups = list_groups(q.board_id)
            items = list_items(q.board_id)
            name_to_ids = {}
            for it in items:
                gname = (it.meta or {}).get("group")
                if not gname:
                    continue
                name_to_ids.setdefault(gname.lower().replace(" ", ""), []).append(it.id)

            mentioned = []
            qcanon = q.query.lower().replace(" ", "")
            for g in groups:
                canon = g.name.lower().replace(" ", "")
                if canon and canon in qcanon:
                    mentioned.append(g)

            if mentioned:
                # Build an aggregated context per mentioned group so the model answers per group
                k_each = max(4, (q.top_k // len(mentioned)) or 4)
                aggregated_by_group = []
                for g in mentioned:
                    texts: list[str] = []
                    if g.template.strip():
                        texts.append(f"Group {g.name} description: {g.template}")
                    ids = name_to_ids.get(g.name.lower().replace(" ", ""), [])
                    picked = []
                    if ids:
                        picked = vs_query(q.query, top_k=k_each, allowed_item_ids=ids)
                    if not picked and ids:
                        # Fallback: take first chunks from items in this group
                        for iid in ids:
                            chs = list_chunks_by_item(iid)[:8]
                            if chs:
                                texts.append("\n".join(c.text for c in chs))
                    else:
                        texts.extend(c.get("text", "") for c in picked)
                    # Always include a small base from each group's items so the model sees document text
                    try:
                        for iid in ids[:3]:
                            chs2 = list_chunks_by_item(iid)[:2]
                            if chs2:
                                texts.append("\n".join(c.text for c in chs2))
                    except Exception:
                        pass
                    if texts:
                        aggregated_by_group.append({"text": f"=== GROUP {g.name} ===\n" + "\n\n".join(texts)})
                scoped_contexts = aggregated_by_group
    except Exception:
        pass

    contexts = scoped_contexts if scoped_contexts else vs_query(q.query, top_k=q.top_k, allowed_item_ids=allowed)
    if not contexts and allowed:
        # Per-source summaries fallback
        from .storage import list_chunks_by_item
        summaries = []
        for iid in allowed:
            chunks = list_chunks_by_item(iid)[:20]
            if not chunks:
                continue
            summary_ctx = "\n\n".join(c.text for c in chunks)
            summary = chat_answer(
                prompt="Summarize the key points in 5 bullets.",
                contexts=[{"text": summary_ctx}],
            )
            summaries.append({"text": summary, "item_id": iid})
        if summaries:
            contexts = summaries
    # Always add group descriptions for the board (helps questions referencing groups by name)
    try:
        if q.board_id:
            groups = list_groups(q.board_id)
            for g in groups:
                if g.template.strip():
                    contexts.append({"text": f"Group {g.name} description: {g.template}"})
    except Exception:
        pass
    answer = chat_answer(q.query, contexts)
    return ChatAnswer(answer=answer, contexts=contexts)


