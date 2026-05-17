import pytest
from core.risk_engine import RiskEngine, ComponentRiskData

def test_risk_formula():
    engine = RiskEngine()
    
    c1 = ComponentRiskData(
        component_id="web-01",
        cves=[{"CVE-TEST-1": 10.0}],
        exposure=1.0, # Highly exposed
        criticality=2.0 # High value asset
    )
    engine.register_component(c1)
    
    score = engine.calculate_global_risk_score()
    
    # Hand calculation:
    # Base: (10.0 * 1.0 * 1.0) = 10.0
    # Final = Base * 2.0 (criticality) * 1.0 (incident_multiplier) * 1.0 (patch decay)
    # = 20.0
    assert score == 20.0

def test_incident_multiplier():
    engine = RiskEngine()
    
    c1 = ComponentRiskData(
        component_id="web-01",
        cves=[{"CVE-TEST-1": 10.0}],
        exposure=1.0, 
        criticality=2.0 
    )
    engine.register_component(c1)
    
    # Should result in 20.0 initially
    assert engine.calculate_global_risk_score() == 20.0
    
    # Add an incident
    engine.state.open_p1_p2_incidents = 1
    
    # Hand calculation:
    # Final = 20.0 * (1.0 + 0.5 * 1) = 20.0 * 1.5 = 30.0
    assert engine.calculate_global_risk_score() == 30.0

def test_max_score_ceiling():
    engine = RiskEngine()
    
    c1 = ComponentRiskData(
        component_id="web-01",
        cves=[{"CVE-TEST-1": 10.0}],
        exposure=1.0, 
        criticality=10.0 # Force extreme criticality
    )
    engine.register_component(c1)
    
    # Base: 10 * 1 * 1 = 10
    # Expected: 10 * 10 * 1 * 1 = 100
    # Add a massive incident multiplier ensuring it goes over ceiling
    engine.state.open_p1_p2_incidents = 10
    
    score = engine.calculate_global_risk_score()
    assert score == 100.0 # Bounded at 100
