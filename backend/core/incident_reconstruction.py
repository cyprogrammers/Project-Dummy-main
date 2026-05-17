"""
LLM-only reconstruction of incident storylines from correlated timelines (no mock fallback).
"""

from __future__ import annotations

import asyncio
import json
import logging

from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import PydanticOutputParser

import config as cfg
from core.incident_correlation import IncidentTimeline
from core.storyline_replay import TimelineStorylineLLM

logger = logging.getLogger("IncidentReconstruction")


class StorylineLLMUnavailable(RuntimeError):
    """Raised when Ollama is required but missing or invocation fails."""


try:
    from langchain_ollama import OllamaLLM

    _timeline_llm = OllamaLLM(
        base_url=cfg.OLLAMA_BASE_URL,
        model=cfg.OLLAMA_MODEL,
        temperature=0.05,
    )
    _timeline_llm_ok = True
except Exception as exc:
    logger.warning("Timeline LLM init failed: %s", exc)
    _timeline_llm = None
    _timeline_llm_ok = False


_timeline_parser = PydanticOutputParser(pydantic_object=TimelineStorylineLLM)

_timeline_prompt = ChatPromptTemplate.from_messages(
    [
        (
            "system",
            "You are a principal SOC analyst. Given an ordered list of security telemetry events, "
            "reconstruct the attack storyline: phases must map to real events where possible. "
            "Each step must reference concrete fields from the events (IPs, users, actions). "
            "Respond ONLY with valid JSON matching the format instructions — no markdown.",
        ),
        (
            "user",
            "Correlation key: {correlation_key}\n\n"
            "Ordered events (JSON):\n{events_json}\n\n"
            "{format_instructions}",
        ),
    ]
)


async def invoke_timeline_llm(timeline: IncidentTimeline) -> TimelineStorylineLLM:
    """Run Ollama with strict JSON output. Raises StorylineLLMUnavailable on any failure."""
    if not _timeline_llm_ok or _timeline_llm is None:
        raise StorylineLLMUnavailable("Ollama LLM is not configured or failed to initialize.")

    chain = _timeline_prompt | _timeline_llm | _timeline_parser
    payload = {
        "correlation_key": timeline.correlation_key,
        "events_json": json.dumps(timeline.to_llm_payload(), indent=2)[:120000],
        "format_instructions": _timeline_parser.get_format_instructions(),
    }
    try:
        result = await asyncio.wait_for(
            asyncio.to_thread(chain.invoke, payload),
            timeout=cfg.OLLAMA_STORYLINE_TIMEOUT_SECONDS,
        )
        if not isinstance(result, TimelineStorylineLLM):
            raise StorylineLLMUnavailable("LLM returned unexpected payload type.")
        return result
    except asyncio.TimeoutError as exc:
        raise StorylineLLMUnavailable(
            f"Ollama timed out after {cfg.OLLAMA_STORYLINE_TIMEOUT_SECONDS}s"
        ) from exc
    except Exception as exc:
        logger.exception("Timeline LLM invocation failed")
        raise StorylineLLMUnavailable(str(exc)) from exc


def anomaly_metrics_block(detection_result: dict) -> dict:
    return {
        "mse": round(float(detection_result.get("mse", 0)), 4),
        "threshold": round(float(detection_result.get("threshold", 0)), 4),
        "execution_time_ms": round(float(detection_result.get("execution_time_ms", 0)), 2),
        "source": "ml_anomaly_with_es_context",
    }
