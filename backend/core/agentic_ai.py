import json
from pydantic import BaseModel, Field
from typing import List, Optional
from fastapi import APIRouter, HTTPException
import logging

# LangChain imports
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import PydanticOutputParser

# Config
import config as cfg

# Ollama LLM (open-source, self-hosted)
try:
    from langchain_ollama import OllamaLLM
    _ollama_llm = OllamaLLM(
        base_url=cfg.OLLAMA_BASE_URL,
        model=cfg.OLLAMA_MODEL,
        temperature=0.1  # Low temperature for deterministic security analysis
    )
    _llm_available = True
except Exception:
    _ollama_llm = None
    _llm_available = False

logger = logging.getLogger("AgenticAISecurityIntelligence")

agentic_router = APIRouter(prefix="/api/v1/intelligence")

# 1. Pydantic schema for strict JSON response (Layer 4 Output)
class IntelligenceResponse(BaseModel):
    threat_label: str = Field(description="Short, descriptive label for the identified threat.")
    confidence: float = Field(description="Confidence score between 0.0 and 1.0.")
    mitre_tactic: str = Field(description="Mapped MITRE ATT&CK tactic/technique (e.g., T1078 - Valid Accounts).")
    remediation_steps: List[str] = Field(description="Step-by-step actionable remediation instructions.")
    suggested_firewall_rules: List[str] = Field(description="Specific firewall rules to implement (e.g., 'iptables -A INPUT ...').")

import asyncio
from db.database import AsyncSessionLocal
from sqlalchemy import select
from db.database import CVECache, MITRETechnique

# 2. Live Tool Functions (Connected to PostgreSQL)
async def query_cve_database(cve_id: str) -> dict:
    """Query PostgreSQL database for CVE context."""
    logger.debug(f"Tool Call: query_cve_database({cve_id})")
    try:
        async with AsyncSessionLocal() as session:
            stmt = select(CVECache).where(CVECache.id == cve_id)
            result = await session.execute(stmt)
            cve_record = result.scalars().first()
            if cve_record:
                return {
                    "cve_id": cve_record.id,
                    "description": cve_record.description,
                    "cvss_v3": cve_record.cvss_v3
                }
    except Exception as exc:
        logger.warning(f"CVE DB lookup failed for {cve_id}: {exc}")
    # Fallback if DB missing or unavailable
    return {"cve_id": cve_id, "description": "CVE details not found in database", "cvss_v3": 0.0}

async def lookup_mitre_technique(technique_hint: str) -> dict:
    """Lookup MITRE technique in PostgreSQL."""
    logger.debug(f"Tool Call: lookup_mitre_technique({technique_hint})")
    try:
        async with AsyncSessionLocal() as session:
            # Simple match mimicking a text search
            stmt = select(MITRETechnique).where(MITRETechnique.description.ilike(f"%{technique_hint}%"))
            result = await session.execute(stmt)
            mitre_record = result.scalars().first()
            if mitre_record:
                return {
                    "technique_id": mitre_record.technique_id,
                    "name": mitre_record.name
                }
    except Exception as exc:
        logger.warning(f"MITRE lookup failed for hint '{technique_hint}': {exc}")
    # Fallback to T1059 if not found
    return {"technique_id": "T1059", "name": "Command and Scripting Interpreter (Mock Fallback)"}

async def propose_firewall_rule(ip_address: str, target_port: str) -> str:
    """Live firewall rule generation."""
    logger.debug(f"Tool Call: propose_firewall_rule({ip_address}, {target_port})")
    # This could connect to an edge router API like Palo Alto PAN-OS or simply format iptables
    # Using iptables format for the demo as requested
    return f"iptables -A INPUT -s {ip_address} -p tcp --dport {target_port} -j DROP"

# 3. Request Payload Model
class AnomalyContext(BaseModel):
    user_id: str
    cluster_id: str
    rbac_permissions: List[str]
    mse_score: float
    threshold: float
    cve_entries: List[str] = []
    events_summary: str = ""
    suspicious_ip: Optional[str] = None
    target_port: Optional[str] = "443"

# 4. Agentic AI Processing Logic (Principal Security Analyst Persona)
class SecurityAnalystAgent:
    def __init__(self, llm=None):
        """
        Initialize the LangChain-based Security Analyst Agent.
        Pass a LangChain LLM instance (e.g., ChatOpenAI) for live inference.
        """
        self.llm = llm
        self.parser = PydanticOutputParser(pydantic_object=IntelligenceResponse)
        
        # System prompt defines the persona and task constraints
        self.prompt = ChatPromptTemplate.from_messages([
            ("system", 
             "You are a Principal Experienced Security Analyst embedded in the AITRMS platform. "
             "Your goal is to synthesize Neural Anomaly Detection signatures with MITRE ATT&CK framework data to provide rapid incident response. "
             "You MUST respond ONLY in the requested strict JSON format."),
            ("user", 
             "Anomaly Context:\n{anomaly_context}\n\n"
             "Actor RBAC Permissions:\n{rbac}\n\n"
             "Enriched CVE Data:\n{cves}\n\n"
             "Enriched MITRE Data:\n{mitre}\n\n"
             "Format Instructions:\n{format_instructions}")
        ])
        
        if self.llm:
            self.chain = self.prompt | self.llm | self.parser
        else:
            self.chain = None
            logger.warning("No LLM provided to initialized SecurityAnalystAgent. Will use mock response pipeline.")

    async def analyze(self, context: AnomalyContext) -> IntelligenceResponse:
        """
        Transform raw ML flags into actionable security recommendations.
        """
        # Step 1: Tool Execution / Enrichment (Now async)
        cve_data_tasks = [query_cve_database(cve) for cve in context.cve_entries]
        try:
            cve_data = await asyncio.wait_for(asyncio.gather(*cve_data_tasks), timeout=1.5)
        except Exception as exc:
            logger.warning(f"CVE enrichment timed out/unavailable; using fallback: {exc}")
            cve_data = [
                {"cve_id": cve, "description": "CVE details not found in database", "cvss_v3": 0.0}
                for cve in context.cve_entries
            ]

        try:
            mitre_data = await asyncio.wait_for(lookup_mitre_technique(context.events_summary), timeout=1.5)
        except Exception as exc:
            logger.warning(f"MITRE enrichment timed out/unavailable; using fallback: {exc}")
            mitre_data = {"technique_id": "T1059", "name": "Command and Scripting Interpreter (Mock Fallback)"}
        
        # Determine strict threshold breach magnitude
        severity_ratio = context.mse_score / context.threshold if context.threshold > 0 else 0
        
        # Step 2: LLM Invocation with resilient fallback
        if self.chain:
            try:
                payload = {
                    "anomaly_context": json.dumps({"mse_score": context.mse_score, "threshold": context.threshold, "severity_ratio": severity_ratio, "summary": context.events_summary}),
                    "rbac": json.dumps(context.rbac_permissions),
                    "cves": json.dumps(cve_data),
                    "mitre": json.dumps(mitre_data),
                    "format_instructions": self.parser.get_format_instructions()
                }
                result = await asyncio.wait_for(
                    asyncio.to_thread(self.chain.invoke, payload),
                    timeout=2.5,
                )
                return result
            except Exception as exc:
                logger.warning(f"LLM chain unavailable or timed out; using fallback reasoning: {exc}")
                if not cfg.ALLOW_MOCK_INTELLIGENCE:
                    raise

        if not self.chain and not cfg.ALLOW_MOCK_INTELLIGENCE:
            raise RuntimeError("Intelligence LLM is required but Ollama is not available.")

        return await self._mock_response(context, severity_ratio, mitre_data)

    async def _mock_response(self, context: AnomalyContext, severity_ratio: float, mitre_data: dict) -> IntelligenceResponse:
        logger.info("Executing mock agent reasoning.")
        rules = []
        if context.suspicious_ip and context.target_port:
            rules.append(await propose_firewall_rule(str(context.suspicious_ip), str(context.target_port)))

        threat_label = f"Anomalous Behavior ({severity_ratio:.1f}x Threshold)"
        if context.cve_entries:
            threat_label += f" targeting {context.cve_entries[0]}"

        return IntelligenceResponse(
            threat_label=threat_label,
            confidence=float(min(0.95, 0.5 + (severity_ratio * 0.1))),
            mitre_tactic=f"{mitre_data['technique_id']} - {mitre_data['name']}",
            remediation_steps=[
                f"Isolate user session for {context.user_id}",
                "Review RBAC logs for lateral movement attempts",
                "Patch system for mentioned CVEs if applicable"
            ],
            suggested_firewall_rules=rules
        )

# Global Instance — wire Ollama LLM if available
if _llm_available:
    logger.info(f"Wiring Ollama LLM '{cfg.OLLAMA_MODEL}' into SecurityAnalystAgent.")
analyst_agent = SecurityAnalystAgent(llm=_ollama_llm if _llm_available else None)

@agentic_router.post("/analyze", response_model=IntelligenceResponse)
async def analyze_anomaly(context: AnomalyContext):
    """
    Endpoint mapping Layer 3 Neural signatures to Layer 4 Agentic Intelligence.
    """
    try:
        response = await analyst_agent.analyze(context)
        return response
    except Exception as e:
        logger.error(f"Intelligence orchestration failed: {e}")
        raise HTTPException(status_code=500, detail="Failed to synthesize security intelligence.")
