"""LlamaIndex indexing for resume and interview knowledge base."""
import json

from langchain_core.messages import HumanMessage, SystemMessage
from llama_index.core import (
    SimpleDirectoryReader,
    VectorStoreIndex,
    StorageContext,
    load_index_from_storage,
    Settings as LlamaSettings,
)

from backend.config import settings
from backend.llm_provider import get_llama_llm, get_embedding, get_langchain_llm
from backend.reranker import rerank_documents

# In-memory index cache keyed by (user_id, topic_or_resume)
_index_cache: dict[tuple[str, str], "VectorStoreIndex"] = {}


def load_topics(user_id: str) -> dict:
    """Load topics from user's topics.json. Returns {key: {name, icon, dir}}."""
    from backend.preset_topics import ensure_preset_topics

    ensure_preset_topics(user_id)
    path = settings.user_topics_path(user_id)
    if path.exists():
        return json.loads(path.read_text(encoding="utf-8"))
    return {}


def save_topics(topics: dict, user_id: str):
    """Write topics back to user's topics.json."""
    path = settings.user_topics_path(user_id)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(topics, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


def get_topic_map(user_id: str) -> dict[str, str]:
    """Returns {key: dir_name}."""
    return {k: v["dir"] for k, v in load_topics(user_id).items()}


def _init_llama_settings():
    LlamaSettings.llm = get_llama_llm()
    LlamaSettings.embed_model = get_embedding()


def build_resume_index(user_id: str, force_rebuild: bool = False) -> VectorStoreIndex:
    """Build or load the resume index."""
    cache_key = (user_id, "resume")
    if cache_key in _index_cache and not force_rebuild:
        return _index_cache[cache_key]

    _init_llama_settings()
    resume_path = settings.user_resume_path(user_id)
    cache_dir = settings.user_index_cache_path(user_id) / "resume"

    if cache_dir.exists() and not force_rebuild:
        storage_context = StorageContext.from_defaults(persist_dir=str(cache_dir))
        index = load_index_from_storage(storage_context)
    else:
        docs = SimpleDirectoryReader(
            input_dir=str(resume_path),
            recursive=True,
        ).load_data()
        index = VectorStoreIndex.from_documents(docs)
        cache_dir.mkdir(parents=True, exist_ok=True)
        index.storage_context.persist(persist_dir=str(cache_dir))

    _index_cache[cache_key] = index
    return index


def build_topic_index(topic: str, user_id: str, force_rebuild: bool = False) -> VectorStoreIndex:
    """Build or load index for a specific knowledge topic."""
    cache_key = (user_id, topic)
    if cache_key in _index_cache and not force_rebuild:
        return _index_cache[cache_key]

    _init_llama_settings()

    topic_map = get_topic_map(user_id)
    if topic not in topic_map:
        raise ValueError(f"Unknown topic: {topic}. Available: {list(topic_map.keys())}")

    dir_name = topic_map[topic]
    topic_dir = settings.user_knowledge_path(user_id) / dir_name
    cache_dir = settings.user_index_cache_path(user_id) / topic

    if cache_dir.exists() and not force_rebuild:
        storage_context = StorageContext.from_defaults(persist_dir=str(cache_dir))
        index = load_index_from_storage(storage_context)
    else:
        if not topic_dir.exists():
            raise FileNotFoundError(f"Knowledge directory not found: {topic_dir}")

        docs = SimpleDirectoryReader(
            input_dir=str(topic_dir),
            recursive=True,
            required_exts=[".md", ".txt", ".py"],
        ).load_data()

        if not docs:
            raise ValueError(f"No documents found in {topic_dir}")

        index = VectorStoreIndex.from_documents(docs)
        cache_dir.mkdir(parents=True, exist_ok=True)
        index.storage_context.persist(persist_dir=str(cache_dir))

    _index_cache[cache_key] = index
    return index


def _dedupe_texts(texts: list[str]) -> list[str]:
    seen = set()
    out = []
    for text in texts:
        t = (text or "").strip()
        if not t:
            continue
        key = t[:300]
        if key in seen:
            continue
        seen.add(key)
        out.append(t)
    return out


def _retrieve_reranked_chunks(index: VectorStoreIndex, question: str, top_k: int, candidate_k: int | None = None) -> list[str]:
    initial_k = max(candidate_k or (top_k * 3), top_k)
    retriever = index.as_retriever(similarity_top_k=initial_k)
    nodes = retriever.retrieve(question)
    chunks = _dedupe_texts([node.get_content() for node in nodes])
    return rerank_documents(question, chunks, top_n=top_k)


def _synthesize_from_chunks(question: str, chunks: list[str]) -> str:
    if not chunks:
        return ""
    context = "\n\n---\n\n".join(chunks)[:12000]
    llm = get_langchain_llm()
    response = llm.invoke([
        SystemMessage(content=(
            "你是内部检索总结器。基于给定资料回答问题，只用资料中能支持的信息，"
            "不要虚构，不要输出与问题无关的铺垫。"
        )),
        HumanMessage(content=f"问题：{question}\n\n资料：\n{context}\n\n请直接给出简洁、信息密集的回答。"),
    ])
    return str(response.content).strip()


def retrieve_resume_context(question: str, user_id: str, top_k: int = 4) -> list[str]:
    index = build_resume_index(user_id)
    return _retrieve_reranked_chunks(index, question, top_k=top_k)


def query_resume(question: str, user_id: str, top_k: int = 3) -> str:
    """Query the resume index with vector retrieval + optional reranking."""
    chunks = retrieve_resume_context(question, user_id, top_k=top_k)
    return _synthesize_from_chunks(question, chunks)


def query_topic(topic: str, question: str, user_id: str, top_k: int = 5) -> str:
    """Query a topic knowledge base with vector retrieval + optional reranking."""
    chunks = retrieve_topic_context(topic, question, user_id, top_k=top_k)
    return _synthesize_from_chunks(question, chunks)


def retrieve_topic_context(topic: str, question: str, user_id: str, top_k: int = 5) -> list[str]:
    """Retrieve raw text chunks from topic index (for answer evaluation)."""
    index = build_topic_index(topic, user_id)
    return _retrieve_reranked_chunks(index, question, top_k=top_k)
