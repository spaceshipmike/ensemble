"""Local capability search — BM25-style term frequency matching over servers and tools."""

from __future__ import annotations

import math
import re
from dataclasses import dataclass, field

from mcpoyle.config import McpoyleConfig, Server


@dataclass
class SearchResult:
    """A single search result with relevance score."""
    server_name: str
    score: float
    matched_fields: list[str] = field(default_factory=list)
    # Matched tool names (if query matched tools)
    matched_tools: list[str] = field(default_factory=list)


def _tokenize(text: str) -> list[str]:
    """Split text into lowercase tokens, stripping punctuation."""
    return re.findall(r"[a-z0-9]+", text.lower())


def _term_frequency(tokens: list[str], term: str) -> float:
    """Count occurrences of term in token list."""
    return sum(1 for t in tokens if t == term or term in t)


def _bm25_score(
    tf: float,
    doc_len: int,
    avg_doc_len: float,
    df: int,
    n_docs: int,
    k1: float = 1.5,
    b: float = 0.75,
) -> float:
    """BM25 relevance score for a single term in a single document."""
    if df == 0 or n_docs == 0:
        return 0.0
    idf = math.log((n_docs - df + 0.5) / (df + 0.5) + 1)
    tf_norm = (tf * (k1 + 1)) / (tf + k1 * (1 - b + b * doc_len / max(avg_doc_len, 1)))
    return idf * tf_norm


def search_servers(cfg: McpoyleConfig, query: str, limit: int = 20) -> list[SearchResult]:
    """Search across all servers by name, description (from origin), and tool names/descriptions.

    Uses BM25-style scoring with field boosting:
      - Server name: 3x boost
      - Tool name: 2x boost
      - Tool description: 1x boost
    """
    query_terms = _tokenize(query)
    if not query_terms:
        return []

    servers = cfg.servers
    if not servers:
        return []

    # Build document representations
    docs: list[tuple[Server, list[str], int]] = []  # (server, all_tokens, doc_len)
    for s in servers:
        tokens: list[str] = []
        # Server name tokens (boosted by repeating)
        name_tokens = _tokenize(s.name)
        tokens.extend(name_tokens * 3)  # 3x name boost
        # Tool name and description tokens
        for tool in s.tools:
            tool_name_tokens = _tokenize(tool.name)
            tokens.extend(tool_name_tokens * 2)  # 2x tool name boost
            if tool.description:
                tokens.extend(_tokenize(tool.description))
        docs.append((s, tokens, len(tokens)))

    n_docs = len(docs)
    avg_doc_len = sum(d[2] for d in docs) / max(n_docs, 1)

    # Compute document frequency per query term
    df: dict[str, int] = {}
    for term in query_terms:
        df[term] = sum(1 for _, tokens, _ in docs if any(term in t for t in tokens))

    # Score each document
    results: list[SearchResult] = []
    for server, tokens, doc_len in docs:
        total_score = 0.0
        matched_fields: list[str] = []
        matched_tools: list[str] = []

        for term in query_terms:
            tf = _term_frequency(tokens, term)
            if tf > 0:
                total_score += _bm25_score(tf, doc_len, avg_doc_len, df[term], n_docs)

        if total_score > 0:
            # Determine which fields matched
            name_tokens = _tokenize(server.name)
            if any(term in t for term in query_terms for t in name_tokens):
                matched_fields.append("name")

            for tool in server.tools:
                tool_tokens = _tokenize(tool.name) + _tokenize(tool.description)
                if any(term in t for term in query_terms for t in tool_tokens):
                    matched_tools.append(tool.name)

            if matched_tools:
                matched_fields.append("tools")

            results.append(SearchResult(
                server_name=server.name,
                score=total_score,
                matched_fields=matched_fields,
                matched_tools=matched_tools[:5],  # Limit displayed matches
            ))

    # Sort by score descending
    results.sort(key=lambda r: r.score, reverse=True)
    return results[:limit]
