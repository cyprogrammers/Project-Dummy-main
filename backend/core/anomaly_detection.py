import torch
import torch.nn as nn
from sklearn.ensemble import IsolationForest
import numpy as np
import time
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("NeuralAnomalyDetection")

class LSTMAutoencoder(nn.Module):
    def __init__(self, input_dim=32, hidden_dim=64, num_layers=2):
        super(LSTMAutoencoder, self).__init__()
        # Encoder
        self.encoder = nn.LSTM(
            input_size=input_dim, 
            hidden_size=hidden_dim, 
            num_layers=num_layers, 
            batch_first=True
        )
        # Decoder
        self.decoder = nn.LSTM(
            input_size=hidden_dim, 
            hidden_size=input_dim, 
            num_layers=num_layers, 
            batch_first=True
        )
        # Final projection to match exact input distribution if needed, 
        # but LSTM output can serve as reconstruction directly depending on activation
        self.linear = nn.Linear(input_dim, input_dim)

    def forward(self, x):
        # x shape: (batch_size, sequence_length, input_dim)
        _, (hidden, _) = self.encoder(x)
        
        # Take the hidden state of the last layer
        # hidden shape: (num_layers, batch_size, hidden_dim)
        last_hidden = hidden[-1]
        
        # Repeat the hidden state for the sequence length
        seq_len = x.size(1)
        encoded = last_hidden.unsqueeze(1).repeat(1, seq_len, 1)
        
        # Decode
        decoded, _ = self.decoder(encoded)
        
        output = self.linear(decoded)
        return output

class AnomalyDetector:
    def __init__(self, input_dim=32, seq_len=60, if_contamination=0.01):
        self.input_dim = input_dim
        self.seq_len = seq_len
        # Phase 1: Isolation Forest Pre-screen
        self.if_prescreen = IsolationForest(contamination=if_contamination, random_state=42)
        # Phase 1: LSTM-Autoencoder
        self.autoencoder = LSTMAutoencoder(input_dim=input_dim)
        self.autoencoder.eval() # Set to evaluation mode for inference
        
        self.cluster_thresholds = {}
        self.is_if_trained = False

    def train_isolation_forest(self, normal_sequences):
        """
        Train Isolation Forest on flattened normal sequences.
        normal_sequences shape expected: (num_samples, seq_len, input_dim)
        """
        flattened = [seq.flatten() for seq in normal_sequences]
        self.if_prescreen.fit(flattened)
        self.is_if_trained = True
        logger.info("Isolation Forest pre-screen trained.")

    def set_cluster_threshold(self, cluster_id, threshold):
        """
        Set the 99th percentile MSE threshold for a specific user cluster.
        """
        self.cluster_thresholds[cluster_id] = threshold
        logger.info(f"Threshold for cluster {cluster_id} set to {threshold:.4f}")

    def calculate_mse(self, original, reconstructed):
        # Calculate Mean Squared Error across feature and sequence dimensions
        criterion = nn.MSELoss(reduction='none')
        mse = criterion(reconstructed, original).mean()
        return mse.item()

    def analyze_sequence(self, sequence, cluster_id="default"):
        """
        Analyze a 60-event window (32-D input vector).
        """
        if sequence.shape != (self.seq_len, self.input_dim):
            raise ValueError(f"Expected sequence shape ({self.seq_len}, {self.input_dim}), got {sequence.shape}")

        start_time = time.time()
        
        # 1. Isolation Forest Pre-screen
        if self.is_if_trained:
            flattened_seq = sequence.flatten().reshape(1, -1)
            if_pred = self.if_prescreen.predict(flattened_seq)
            is_obvious_normal = (if_pred[0] == 1)
            
            elapsed_ms = (time.time() - start_time) * 1000
            
            # Suppress obvious normal events if IF was fast enough (< 5ms logic)
            if is_obvious_normal and elapsed_ms < 5.0:
                logger.debug(f"Suppressed by IF pre-screen in {elapsed_ms:.2f}ms")
                return {
                    "is_anomaly": False,
                    "reason": "Suppressed by Isolation Forest pre-screen",
                    "mse": 0.0,
                    "threshold": self.cluster_thresholds.get(cluster_id),
                    "execution_time_ms": elapsed_ms,
                    "layer": "IsolationForest"
                }

        # 2. LSTM-Autoencoder Reconstruction
        seq_tensor = torch.tensor(sequence, dtype=torch.float32).unsqueeze(0) # (1, 60, 32)
        
        with torch.no_grad():
            reconstructed = self.autoencoder(seq_tensor)
            
        mse = self.calculate_mse(seq_tensor, reconstructed)
        
        # 3. Threshold Evaluation
        threshold = self.cluster_thresholds.get(cluster_id)
        if threshold is None:
            # Fallback if cluster not configured; could use a global 99th percentile
            threshold = 0.5 
            
        is_anomaly = mse > threshold
        
        elapsed_ms = (time.time() - start_time) * 1000
        
        result = {
            "is_anomaly": bool(is_anomaly),
            "reason": f"MSE {mse:.4f} > Threshold {threshold:.4f}" if is_anomaly else "Normal",
            "mse": float(mse),
            "threshold": float(threshold),
            "execution_time_ms": elapsed_ms,
            "layer": "LSTM-Autoencoder"
        }
        
        if is_anomaly:
            logger.warning(f"Anomaly detected! {result['reason']}")
            
        return result
