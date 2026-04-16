"""Lightweight reranker client for local / external rerank services."""

from __future__ import annotations

import logging

import requests

from backend.config import settings

logger = logging.getLogger("uvicorn")


def rerank_documents(query: str, documents: list[str], top_n: int | None = None) -> list[str]:
    """Rerank documents with an optional external service.

    Falls back to original order on any error.
    """
    if not documents:
        return []

    limit = min(top_n or len(documents), len(documents))
    docs = [d for d in documents if isinstance(d, str) and d.strip()]
    if not docs:
        return []

    if not settings.rerank_enabled():
        return docs[:limit]

    base = settings.rerank_api_base.rstrip("/")
    url = f"{base}/rerank"
    headers = {"Content-Type": "application/json"}
    if settings.effective_rerank_api_key:
        headers["Authorization"] = f"Bearer {settings.effective_rerank_api_key}"

    payload = {
        "model": settings.rerank_api_model,
        "query": query,
        "documents": docs,
        "top_n": limit,
        "return_documents": True,
    }

    try:
        resp = requests.post(
            url,
            json=payload,
            headers=headers,
            timeout=settings.rerank_timeout_seconds,
        )
        resp.raise_for_status()
        data = resp.json()
        results = data.get("results") or []
        reranked = [item.get("document", "") for item in results if item.get("document")]
        if reranked:
            return reranked[:limit]
        logger.warning("Reranker returned no usable documents; falling back to vector order.")
    except Exception as exc:
        logger.warning(f"Reranker request failed, fallback to vector order: {exc}")

    return docs[:limit]
