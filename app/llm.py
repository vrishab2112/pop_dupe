from typing import List, Dict
from openai import OpenAI
from .config import settings


_client = OpenAI(api_key=settings.openai_api_key) if settings.openai_api_key else None


def ensure_client():
    if not settings.openai_api_key:
        raise RuntimeError("OPENAI_API_KEY is not set in .env")
    global _client
    if _client is None:
        _client = OpenAI(api_key=settings.openai_api_key)
    return _client


def embed_texts(texts: List[str]) -> List[List[float]]:
    client = ensure_client()
    resp = client.embeddings.create(model=settings.openai_embedding_model, input=texts)
    return [d.embedding for d in resp.data]


def _format_ts(seconds: float | int | None) -> str:
    try:
        s = int(seconds or 0)
        m, s = divmod(s, 60)
        return f"{m:02d}:{s:02d}"
    except Exception:
        return ""


def chat_answer(prompt: str, contexts: List[Dict]) -> str:
    client = ensure_client()
    # Keep generous context to allow multi-group answers, embedding timestamps when available
    blocks: List[str] = []
    for c in contexts:
        txt = c.get("text", "")
        ss = c.get("start_s") or c.get("start")
        ee = c.get("end_s") or c.get("end")
        ts = ""
        if ss is not None or ee is not None:
            ts1 = _format_ts(float(ss) if ss is not None else None)
            ts2 = _format_ts(float(ee) if ee is not None else None)
            if ts1 or ts2:
                ts = f"[{ts1}-{ts2}] "
        blocks.append(f"{ts}{txt}")
    context_text = "\n\n".join(blocks)[:20000]
    system = (
        "You are a helpful assistant. Use ONLY the provided context."
        " The context may contain blocks like '=== GROUP <name> ==='."
        " When the user asks about multiple groups, answer for EACH mentioned group with clear, separate bullets."
        " If a group's description is present but transcripts are thin, still provide 1–2 bullets consistent with that description."
        " When timestamp ranges like [mm:ss-mm:ss] are present, include them in your answer to cite evidence."
    )
    messages = [
        {"role": "system", "content": system},
        {"role": "user", "content": f"Here is the transcript context for the video(s):\n\n{context_text}\n\nQuestion: {prompt}"},
    ]
    resp = client.chat.completions.create(model=settings.openai_chat_model, messages=messages)
    return resp.choices[0].message.content or ""



