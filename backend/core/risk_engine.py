import time
import asyncio
from pydantic import BaseModel
from typing import List, Dict
import logging

logger = logging.getLogger("DynamicRiskAssessmentEngine")

class ComponentRiskData(BaseModel):
    component_id: str
    cves: List[Dict[str, float]] # e.g., [{"CVE-2024-12345": 9.8}]
    exposure: float # 1.0 (Internet-facing) to 0.1 (Air-gapped)
    weight: float = 1.0
    criticality: float = 1.0 # 0.10 to 3.00

class EnvironmentState(BaseModel):
    open_p1_p2_incidents: int = 0
    patch_decay_factor: float = 1.0 # Starts at 1.0, increases if patches are delayed
    mttr_days: float = 0.0 # Mean Time To Remediate (Critical/High)
    patch_compliance: float = 100.0 # Percentage of compliant assets

class RiskEngine:
    """
    Composite risk scoring algorithm adapted from NIST SP 800-30.
    Formula: Risk Score = min(100, Sigma (CVSS_i * Exposure_i * W_i) 
                          * Criticality * Incident_Multiplier * Patch_Decay)
    """
    def __init__(self):
        # In-memory "database" of risk states
        self.state = EnvironmentState()
        self.components: Dict[str, ComponentRiskData] = {}
        self.last_recalculated = 0

    def register_component(self, comp_data: ComponentRiskData):
        self.components[comp_data.component_id] = comp_data
        logger.info(f"Registered component {comp_data.component_id} for risk tracking.")

    def calculate_base_risk(self, component: ComponentRiskData) -> float:
        """
        Calculates Sigma(CVSS_i * Exposure_i * W_i) for a single component.
        """
        sigma_risk = 0.0
        for cve_obj in component.cves:
            # Each dictionary expects 1 key (the CVE ID) and the value is the CVSS base score
            for cve_id, cvss_score in cve_obj.items():
                risk = cvss_score * component.exposure * component.weight
                sigma_risk += risk
        return sigma_risk

    def calculate_global_risk_score(self) -> float:
        """
        Executes the full composite algorithm.
        """
        if not self.components:
            return 0.0
            
        # Incident Multiplier: +0.5 per open P1/P2 incident (base 1.0 if 0 incidents)
        incident_multiplier = 1.0 + (0.5 * self.state.open_p1_p2_incidents)
        
        # Calculate sum across all components
        total_system_risk = 0.0
        for comp in self.components.values():
            base = self.calculate_base_risk(comp)
            # Apply individual criticality, global incident multiplier, global patch decay
            comp_final_risk = base * comp.criticality * incident_multiplier * self.state.patch_decay_factor
            total_system_risk += comp_final_risk
            
        # Final Score capping at 100
        final_risk_score = min(100.0, total_system_risk)
        
        self.last_recalculated = time.time()
        logger.info(f"Recalculated System Risk Score: {final_risk_score:.2f} (Time: {self.last_recalculated})")
        return final_risk_score

    async def trigger_recalculation(self, reason: str):
        """
        Triggered within 30 seconds of any new CVE ingestion, scan completion, or incident registration.
        """
        logger.warning(f"Risk recalculation triggered by Event: {reason}")
        # Introduce the slight intentional async delay as required (e.g. up to 30s batching)
        # Here we do a short 2s simulate for immediate responsiveness while observing the constraint
        await asyncio.sleep(2) 
        score = self.calculate_global_risk_score()
        return score

# Global Singleton Instance
risk_engine = RiskEngine()
