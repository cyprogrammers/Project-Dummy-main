"""
AITRMS Central Configuration
All environment-specific settings are loaded here.
Production deployments should override these via environment variables.
"""
import os

# ─── LLM / Ollama ────────────────────────────────────────────────────────────
OLLAMA_BASE_URL: str = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
OLLAMA_MODEL: str    = os.getenv("OLLAMA_MODEL", "tinyllama")

# ─── PostgreSQL ──────────────────────────────────────────────────────────────
DATABASE_URL: str = os.getenv(
    "DATABASE_URL",
    "postgresql+asyncpg://postgres:1062@localhost:5432/aitrms"
)

# ─── Keycloak ────────────────────────────────────────────────────────────────
KEYCLOAK_BASE_URL: str = os.getenv("KEYCLOAK_BASE_URL", "http://localhost:8080")
KEYCLOAK_REALM: str    = os.getenv("KEYCLOAK_REALM", "aitrms")
KEYCLOAK_CLIENT_ID: str = os.getenv("KEYCLOAK_CLIENT_ID", "aitrms-api")
KEYCLOAK_ALGORITHM: str = "RS256"

# ─── Elasticsearch / ELK ─────────────────────────────────────────────────────
ELASTICSEARCH_HOST: str = os.getenv("ELASTICSEARCH_HOST", "http://localhost:9200")
ELASTICSEARCH_INDEX: str = os.getenv("ELASTICSEARCH_INDEX", "filebeat-*")
ELASTICSEARCH_POLL_INTERVAL_SECONDS: int = int(os.getenv("ES_POLL_INTERVAL", "30"))
ELASTICSEARCH_WINDOW_MINUTES: int = int(os.getenv("ES_WINDOW_MINUTES", "30"))

# Incident correlation + storyline reconstruction
CORRELATION_WINDOW_MINUTES: int = int(os.getenv("CORRELATION_WINDOW_MINUTES", "45"))
CORRELATION_POLL_INTERVAL_SECONDS: int = int(os.getenv("CORRELATION_POLL_INTERVAL_SECONDS", "45"))
CORRELATION_MAX_EVENTS_PER_INCIDENT: int = int(os.getenv("CORRELATION_MAX_EVENTS_PER_INCIDENT", "80"))
CORRELATION_MIN_EVENTS_PER_SESSION: int = int(os.getenv("CORRELATION_MIN_EVENTS_PER_SESSION", "4"))
OLLAMA_STORYLINE_TIMEOUT_SECONDS: float = float(os.getenv("OLLAMA_STORYLINE_TIMEOUT_SECONDS", "120"))

# Legacy `/api/v1/intelligence/analyze` may use mock when LLM fails (set false for strict lab)
ALLOW_MOCK_INTELLIGENCE: bool = os.getenv("ALLOW_MOCK_INTELLIGENCE", "true").lower() in (
    "1",
    "true",
    "yes",
)

# Enable/disable Elasticsearch background tasks (for development without ES)
ENABLE_ELASTICSEARCH_POLLING: bool = os.getenv("ENABLE_ELASTICSEARCH_POLLING", "false").lower() in (
    "1",
    "true",
    "yes",
)

# Optional shared secret so ELK poller can call telemetry ingest without Keycloak JWT
INTERNAL_INGEST_TOKEN: str = os.getenv("INTERNAL_INGEST_TOKEN", "aitrms-internal-ingest-secret")

# ─── Architecture ────────────────────────────────────────────────────────────
TELEMETRY_INGEST_URL: str = os.getenv(
    "TELEMETRY_INGEST_URL",
    "http://localhost:8000/api/v1/telemetry/ingest"
)
