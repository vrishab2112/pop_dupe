from typing import List, Dict
import chromadb
from chromadb.config import Settings as ChromaSettings
from .config import settings
from .llm import embed_texts


_client = chromadb.PersistentClient(path=settings.chroma_dir, settings=ChromaSettings())
# Namespace collections by embedding model to avoid dimension conflicts
_collection_name = f"chunks__{settings.openai_embedding_model}"
_collection = _client.get_or_create_collection(name=_collection_name)


def add_chunks(item_id: str, chunk_texts: List[str], embeddings: List[List[float]], metadatas: List[Dict] | None = None):
    ids = [f"{item_id}-{i}" for i in range(len(chunk_texts))]
    metas = metadatas if metadatas and len(metadatas) == len(chunk_texts) else [{"item_id": item_id}] * len(chunk_texts)
    # Always stamp item_id
    for m in metas:
        m.setdefault("item_id", item_id)
    _collection.add(ids=ids, embeddings=embeddings, documents=chunk_texts, metadatas=metas)


def _cosine_similarity(a: List[float], b: List[float]) -> float:
    import math
    dot = sum(x * y for x, y in zip(a, b))
    na = math.sqrt(sum(x * x for x in a)) or 1.0
    nb = math.sqrt(sum(y * y for y in b)) or 1.0
    return dot / (na * nb)


def _mmr_rerank(query_emb: List[float], doc_texts: List[str], doc_metas: List[Dict], lambda_mult: float = 0.7, top_k: int = 20) -> List[Dict]:
    if not doc_texts:
        return []
    doc_embs = embed_texts(doc_texts)
    selected: List[int] = []
    candidates = list(range(len(doc_texts)))
    q_sims = [_cosine_similarity(query_emb, e) if query_emb and e else 0.0 for e in doc_embs]
    while candidates and len(selected) < min(top_k, len(doc_texts)):
        best_idx = None
        best_score = -1e9
        for idx in candidates:
            max_sim_selected = max((_cosine_similarity(doc_embs[idx], doc_embs[j]) for j in selected), default=0.0)
            score = lambda_mult * q_sims[idx] - (1.0 - lambda_mult) * max_sim_selected
            if score > best_score:
                best_score = score
                best_idx = idx
        candidates.remove(best_idx)  # type: ignore[arg-type]
        selected.append(best_idx)  # type: ignore[arg-type]
    return [{"text": doc_texts[i], **(doc_metas[i] or {})} for i in selected if i is not None]


def query(text: str, top_k: int = 12, where: Dict = None, allowed_item_ids: List[str] = None):
    filter_where = None
    if where and allowed_item_ids:
        filter_where = {"$and": [where, {"item_id": {"$in": allowed_item_ids}}]}
    elif allowed_item_ids:
        filter_where = {"item_id": {"$in": allowed_item_ids}}
    else:
        filter_where = where  # can be None
    q_emb = embed_texts([text])[0]
    pre_k = max(top_k * 3, 30)
    results = _collection.query(query_embeddings=[q_emb], n_results=pre_k, where=filter_where, include=["documents", "metadatas"]) 
    docs: List[str] = []
    metas: List[Dict] = []
    if results and results.get("documents"):
        docs = results["documents"][0]
        metas_raw = results.get("metadatas", [[]])[0]
        ids = results.get("ids", [[]])[0]
        for i, dmeta in enumerate(metas_raw):
            meta = dmeta or {}
            meta["id"] = ids[i] if i < len(ids) else ""
            metas.append(meta)
    reranked = _mmr_rerank(q_emb, docs, metas, lambda_mult=0.7, top_k=top_k)
    return reranked


