"""
ECS / Winlogbeat → 32-dimensional feature vector for anomaly detection windows.

Each dimension is normalized to roughly [0, 1] where noted. Layout is stable for the ML pipeline:
  [0:4]   Temporal / severity hints
  [4:10]  Event taxonomy (category / type / outcome)
  [10:16] Network
  [16:21] Process / file activity
  [21:26] Identity / auth
  [26:32] Host / Winlog / misc context
"""

from __future__ import annotations

import math
from datetime import datetime
from typing import Any, Mapping


def _clamp01(x: float) -> float:
    return max(0.0, min(1.0, x))


def _hash_bucket(s: str, buckets: int = 16) -> float:
    """Stable pseudo-hash into [0,1] for categorical strings."""
    if not s:
        return 0.0
    h = 0
    for c in s:
        h = (h * 31 + ord(c)) & 0xFFFFFFFF
    return _clamp01((h % buckets) / float(max(1, buckets - 1)))


def _get_nested(src: Mapping[str, Any], path: str, default: Any = None) -> Any:
    cur: Any = src
    for part in path.split("."):
        if not isinstance(cur, Mapping) or part not in cur:
            return default
        cur = cur[part]
    return cur


def extract_feature_vector_from_source(source: Mapping[str, Any]) -> list[float]:
    """
    Build a 32-float vector from one Elasticsearch document `_source` (ECS-shaped).
    """
    # --- Temporal (4) ---
    ts = _get_nested(source, "@timestamp") or _get_nested(source, "event.created")
    hour_frac = 0.5
    if isinstance(ts, str):
        try:
            # ISO8601 variants
            ts_clean = ts.replace("Z", "+00:00")
            dt = datetime.fromisoformat(ts_clean)
            hour_frac = dt.hour / 23.0 if dt.hour <= 23 else 1.0
        except ValueError:
            hour_frac = 0.5

    sev = _get_nested(source, "event.severity")
    try:
        sev_n = _clamp01(float(sev) / 100.0) if sev is not None else 0.3
    except (TypeError, ValueError):
        sev_n = 0.3

    risk = _get_nested(source, "event.risk_score")
    try:
        risk_n = _clamp01(float(risk) / 100.0) if risk is not None else 0.2
    except (TypeError, ValueError):
        risk_n = 0.2

    seq_code = _get_nested(source, "event.sequence")
    try:
        seq_n = _clamp01(math.log1p(float(seq_code or 0)) / 10.0)
    except (TypeError, ValueError):
        seq_n = 0.0

    temporal = [hour_frac, sev_n, risk_n, seq_n]

    # --- Event taxonomy (6): categories / types encoded as buckets ---
    cat = str(_get_nested(source, "event.category") or "")
    typ = str(_get_nested(source, "event.type") or "")
    act = str(_get_nested(source, "event.action") or "")
    out = str(_get_nested(source, "event.outcome") or "")
    kind = str(_get_nested(source, "event.kind") or "")
    dataset = str(_get_nested(source, "event.dataset") or "")
    taxonomy = [
        _hash_bucket(cat),
        _hash_bucket(typ),
        _hash_bucket(act),
        1.0 if out.lower() == "failure" else (0.6 if out.lower() == "success" else 0.3),
        _hash_bucket(kind),
        _hash_bucket(dataset),
    ]

    # --- Network (6) ---
    sip = str(_get_nested(source, "source.ip") or "")
    dip = str(_get_nested(source, "destination.ip") or "")
    sport = _get_nested(source, "source.port")
    dport = _get_nested(source, "destination.port")
    proto = str(_get_nested(source, "network.protocol") or "")
    direction = str(_get_nested(source, "network.direction") or "")
    try:
        sp = _clamp01(math.log1p(float(sport or 0)) / 12.0)
    except (TypeError, ValueError):
        sp = 0.0
    try:
        dp = _clamp01(math.log1p(float(dport or 0)) / 12.0)
    except (TypeError, ValueError):
        dp = 0.0
    network = [
        _hash_bucket(sip, 64),
        _hash_bucket(dip, 64),
        sp,
        dp,
        _hash_bucket(proto),
        1.0 if direction.lower() == "ingress" else (0.5 if direction else 0.25),
    ]

    # --- Process / file (5) ---
    proc = str(_get_nested(source, "process.name") or "")
    exe = str(_get_nested(source, "process.executable") or "")
    cmd_line = str(_get_nested(source, "process.command_line") or "")
    parent = str(_get_nested(source, "process.parent.name") or "")
    file_path = str(_get_nested(source, "file.path") or "")
    proc_feats = [
        _hash_bucket(proc),
        _hash_bucket(exe),
        min(1.0, len(cmd_line) / 512.0),
        _hash_bucket(parent),
        min(1.0, len(file_path) / 256.0),
    ]

    # --- Identity (5) ---
    user = str(_get_nested(source, "user.name") or "")
    domain = str(_get_nested(source, "user.domain") or "")
    tgt_user = str(_get_nested(source, "winlog.event_data.TargetUserName") or "")
    identity = [
        _hash_bucket(user),
        _hash_bucket(domain),
        _hash_bucket(tgt_user),
        1.0 if "admin" in user.lower() or "administrator" in user.lower() else 0.2,
        1.0 if _get_nested(source, "event.category") == "authentication" else 0.3,
    ]

    # --- Host / Winlog / misc (6) ---
    host = str(_get_nested(source, "host.name") or "")
    os_type = str(_get_nested(source, "host.os.type") or "")
    evt_id = _get_nested(source, "winlog.event_id")
    channel = str(_get_nested(source, "winlog.channel") or "")
    agent_type = str(_get_nested(source, "agent.type") or "")
    msg_len = len(str(_get_nested(source, "message") or ""))
    try:
        eid_n = _clamp01(float(evt_id or 0) / 60000.0)
    except (TypeError, ValueError):
        eid_n = 0.0
    misc = [
        _hash_bucket(host),
        _hash_bucket(os_type),
        eid_n,
        _hash_bucket(channel),
        _hash_bucket(agent_type),
        min(1.0, msg_len / 2048.0),
    ]

    vec = temporal + taxonomy + network + proc_feats + identity + misc
    assert len(vec) == 32, f"expected 32 dims, got {len(vec)}"
    return vec


def extract_feature_vector_from_hit(hit: Mapping[str, Any]) -> list[float]:
    """Accept either full ES hit or raw `_source` mapping."""
    if "_source" in hit:
        src = hit["_source"]
    else:
        src = hit
    if not isinstance(src, Mapping):
        return [0.25] * 32
    return extract_feature_vector_from_source(src)
