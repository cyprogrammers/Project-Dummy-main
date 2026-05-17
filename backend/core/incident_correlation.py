"""
Correlate Elasticsearch security events into ordered timelines grouped by host + network/identity entity.
"""

from __future__ import annotations

import hashlib
import json
import logging
from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any

from elasticsearch import AsyncElasticsearch

import config as cfg

logger = logging.getLogger("IncidentCorrelation")


def _iso_ts(raw: Any) -> str | None:
    if raw is None:
        return None
    if isinstance(raw, str):
        try:
            cleaned = raw.replace("Z", "+00:00")
            datetime.fromisoformat(cleaned)
            return raw if raw.endswith("Z") or "+" in raw else raw + "Z"
        except ValueError:
            return None
    return None


def correlation_key_from_source(src: dict[str, Any]) -> str:
    """Stable primary key for grouping related events."""
    host = str(src.get("host", {}).get("name") or src.get("agent", {}).get("hostname") or "unknown-host")
    sip = str(src.get("source", {}).get("ip") or "")
    user = str(src.get("user", {}).get("name") or "")
    if sip:
        return f"{host}|src:{sip}"
    if user:
        return f"{host}|user:{user.lower()}"
    return f"{host}|misc"


def normalized_event_from_hit(hit: dict[str, Any]) -> dict[str, Any]:
    """Flatten ES hit into an analyst-friendly timeline row."""
    src = hit.get("_source") or {}
    hid = hit.get("_id", "")
    idx = hit.get("_index", "")
    ts = _iso_ts(src.get("@timestamp")) or _iso_ts(src.get("event", {}).get("created"))
    cat = src.get("event", {}).get("category") or ""
    typ = src.get("event", {}).get("type") or ""
    act = src.get("event", {}).get("action") or ""
    outcome = src.get("event", {}).get("outcome") or ""
    sip = src.get("source", {}).get("ip") or ""
    dip = src.get("destination", {}).get("ip") or ""
    user = src.get("user", {}).get("name") or ""
    proc = src.get("process", {}).get("name") or ""
    msg = (src.get("message") or "")[:400]
    summary_parts = [p for p in (cat, typ, act, outcome) if p]
    summary = " | ".join(summary_parts) if summary_parts else (msg[:200] or "security event")

    return {
        "@timestamp": ts or "",
        "summary": summary,
        "message_excerpt": msg[:300],
        "source_ip": sip or None,
        "destination_ip": dip or None,
        "user_name": user or None,
        "process_name": proc or None,
        "correlation_key": correlation_key_from_source(src),
        "raw_ref": {"_index": idx, "_id": hid},
        "ecs_fields_used": {
            "event.category": cat,
            "event.type": typ,
            "event.action": act,
            "event.outcome": outcome,
        },
    }


def _parse_ts_for_sort(ts: str | None) -> datetime:
    if not ts:
        return datetime.min.replace(tzinfo=timezone.utc)
    try:
        cleaned = ts.replace("Z", "+00:00")
        return datetime.fromisoformat(cleaned)
    except ValueError:
        return datetime.min.replace(tzinfo=timezone.utc)


@dataclass
class IncidentTimeline:
    correlation_key: str
    events: list[dict[str, Any]]
    fingerprint: str

    def to_llm_payload(self) -> dict[str, Any]:
        return {
            "correlation_key": self.correlation_key,
            "event_count": len(self.events),
            "events": self.events,
        }


def timeline_fingerprint(correlation_key: str, events: list[dict[str, Any]]) -> str:
    if not events:
        return hashlib.sha256(b"empty").hexdigest()
    first = events[0].get("@timestamp") or ""
    last = events[-1].get("@timestamp") or ""
    payload = f"{correlation_key}|{first}|{last}|{len(events)}"
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


async def fetch_events_in_window(
    es: AsyncElasticsearch,
    *,
    start: datetime,
    end: datetime,
    max_size: int = 2000,
) -> list[dict[str, Any]]:
    query = {
        "query": {
            "range": {
                "@timestamp": {
                    "gte": start.isoformat(),
                    "lte": end.isoformat(),
                }
            }
        },
        "sort": [{"@timestamp": {"order": "asc"}}],
        "size": max_size,
    }
    resp = await es.search(index=cfg.ELASTICSEARCH_INDEX, body=query)
    return resp.get("hits", {}).get("hits", [])


def cluster_hits_into_timelines(
    hits: list[dict[str, Any]],
    *,
    max_events_per_incident: int,
    min_events: int,
) -> list[IncidentTimeline]:
    """Group hits by correlation_key; sort; cap length; filter small clusters."""
    buckets: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for hit in hits:
        src = hit.get("_source") or {}
        key = correlation_key_from_source(src)
        buckets[key].append(hit)

    timelines: list[IncidentTimeline] = []
    for key, group_hits in buckets.items():
        group_hits.sort(key=lambda h: _parse_ts_for_sort(_iso_ts((h.get("_source") or {}).get("@timestamp"))))
        trimmed = group_hits[-max_events_per_incident:]
        events = [normalized_event_from_hit(h) for h in trimmed]
        events.sort(key=lambda e: _parse_ts_for_sort(e.get("@timestamp")))
        if len(events) < min_events:
            continue
        fp = timeline_fingerprint(key, events)
        timelines.append(IncidentTimeline(correlation_key=key, events=events, fingerprint=fp))

    return timelines


async def fetch_and_cluster_recent_timelines(
    *,
    window_minutes: int | None = None,
) -> list[IncidentTimeline]:
    """Pull ES for [now-window, now] and emit correlation timelines."""
    window_minutes = window_minutes if window_minutes is not None else cfg.CORRELATION_WINDOW_MINUTES
    es = AsyncElasticsearch(cfg.ELASTICSEARCH_HOST)
    try:
        if not await es.ping():
            logger.error("Elasticsearch ping failed for correlation")
            return []
        end = datetime.now(timezone.utc)
        start = end - timedelta(minutes=window_minutes)
        hits = await fetch_events_in_window(es, start=start, end=end)
        return cluster_hits_into_timelines(
            hits,
            max_events_per_incident=cfg.CORRELATION_MAX_EVENTS_PER_INCIDENT,
            min_events=cfg.CORRELATION_MIN_EVENTS_PER_SESSION,
        )
    finally:
        await es.close()


class FingerprintStore:
    """Persist seen storyline fingerprints to avoid duplicate incidents."""

    def __init__(self, path=None):
        from pathlib import Path

        base = Path(__file__).resolve().parents[1] / "db"
        self._path = path or base / "incident_fingerprints.json"
        self._seen: set[str] = set()
        self._load()

    def _load(self) -> None:
        if not self._path.exists():
            return
        try:
            data = json.loads(self._path.read_text(encoding="utf-8"))
            if isinstance(data, list):
                self._seen = set(str(x) for x in data)
        except (OSError, json.JSONDecodeError, TypeError):
            self._seen = set()

    def _persist(self) -> None:
        self._path.parent.mkdir(parents=True, exist_ok=True)
        self._path.write_text(json.dumps(sorted(self._seen), indent=2), encoding="utf-8")

    def is_new(self, fingerprint: str) -> bool:
        return fingerprint not in self._seen

    def add(self, fingerprint: str) -> None:
        self._seen.add(fingerprint)
        self._persist()


fingerprint_store = FingerprintStore()


def build_minimal_timeline_from_anomaly(
    *,
    correlation_key: str,
    user_id: str,
    summary: str,
    suspicious_ip: str | None,
    detection_snippet: dict[str, Any],
) -> IncidentTimeline:
    """When ES has no rows, still give the LLM structured context from ML detection."""
    ts = datetime.now(timezone.utc).isoformat()
    events = [
        {
            "@timestamp": ts,
            "summary": "Neural anomaly — behavioral sequence exceeded cluster baseline",
            "message_excerpt": json.dumps(detection_snippet, default=str)[:400],
            "source_ip": suspicious_ip,
            "destination_ip": None,
            "user_name": user_id,
            "process_name": None,
            "correlation_key": correlation_key,
            "raw_ref": {"_index": "synthetic", "_id": "ml-anomaly"},
            "ecs_fields_used": {"source": "isolation_forest_lstm_pipeline"},
        },
        {
            "@timestamp": ts,
            "summary": summary,
            "message_excerpt": "",
            "source_ip": suspicious_ip,
            "destination_ip": None,
            "user_name": user_id,
            "process_name": None,
            "correlation_key": correlation_key,
            "raw_ref": {"_index": "synthetic", "_id": "analyst-context"},
            "ecs_fields_used": {"source": "layer_3_detection"},
        },
    ]
    fp = timeline_fingerprint(correlation_key, events)
    return IncidentTimeline(correlation_key=correlation_key, events=events, fingerprint=fp)


async def fetch_context_timeline_for_anomaly(
    *,
    suspicious_ip: str | None,
    user_name: str | None,
    window_minutes: int = 20,
    max_events: int = 120,
) -> IncidentTimeline | None:
    """
    Pull recent ES events filtered by source.ip or user.name for anomaly follow-up.
    """
    es = AsyncElasticsearch(cfg.ELASTICSEARCH_HOST)
    try:
        if not await es.ping():
            return None
        end = datetime.now(timezone.utc)
        start = end - timedelta(minutes=window_minutes)
        must = [{"range": {"@timestamp": {"gte": start.isoformat(), "lte": end.isoformat()}}}]
        if suspicious_ip:
            must.append({"term": {"source.ip": suspicious_ip}})
        elif user_name:
            must.append({"match": {"user.name": {"query": user_name, "operator": "and"}}})
        else:
            return None
        query = {
            "query": {"bool": {"must": must}},
            "sort": [{"@timestamp": {"order": "asc"}}],
            "size": max_events,
        }
        resp = await es.search(index=cfg.ELASTICSEARCH_INDEX, body=query)
        hits = resp.get("hits", {}).get("hits", [])
        if len(hits) < 1:
            return None
        events = [normalized_event_from_hit(h) for h in hits]
        key = events[0].get("correlation_key") or "anomaly-context"
        fp = timeline_fingerprint(key, events)
        return IncidentTimeline(correlation_key=key, events=events, fingerprint=fp)
    finally:
        await es.close()
