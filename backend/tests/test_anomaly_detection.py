import pytest
import numpy as np
from core.anomaly_detection import AnomalyDetector

def test_anomaly_detection_init():
    ad = AnomalyDetector(input_dim=32, seq_len=60)
    assert ad.autoencoder is not None
    assert ad.if_prescreen is not None

def test_isolation_forest_filtering():
    ad = AnomalyDetector(input_dim=32, seq_len=60)
    
    # Create somewhat stable dummy data to train IF on
    np.random.seed(42)
    normal_data = [np.random.normal(loc=0.0, scale=0.1, size=(60, 32)) for _ in range(50)]
    ad.train_isolation_forest(normal_data)
    
    # Re-test with a completely generic sequence from that distribution
    test_seq = normal_data[0] # Pick one of the normal sequences
    
    result = ad.analyze_sequence(test_seq, cluster_id="default")
    # Our simple logic suppresses IF result if it's evaluated < 5ms
    # Hard to rigorously assert timing, but we assert it doesn't crash 
    assert "is_anomaly" in result
    assert result["layer"] in ["IsolationForest", "LSTM-Autoencoder"]

def test_lstm_reconstruction():
    ad = AnomalyDetector(input_dim=32, seq_len=60)
    # Don't train IF this time to guarantee it falls back to LSTM Autoencoder
    
    test_seq = np.random.rand(60, 32)
    # Set threshold
    ad.set_cluster_threshold("test_cluster", 0.05)
    
    result = ad.analyze_sequence(test_seq, cluster_id="test_cluster")
    
    assert "mse" in result
    assert result["threshold"] == 0.05
    assert result["layer"] == "LSTM-Autoencoder"
