import asyncio
import logging
import datetime
from elasticsearch import AsyncElasticsearch
import httpx
import config as cfg

from core.feature_extraction import extract_feature_vector_from_hit

logger = logging.getLogger("ELKIngestor")


def extract_feature_vector(hit: dict) -> list:
    """Transforms one Elasticsearch hit into a 32-dimensional input vector (ECS / Winlogbeat)."""
    return extract_feature_vector_from_hit(hit)

async def poll_elasticsearch():
    """
    Background worker that polls ELK for new security events, windowing them into 60-event chunks,
    and pushing them to the AITRMS telemetry ingress endpoint.
    """
    try:
        es = AsyncElasticsearch(cfg.ELASTICSEARCH_HOST)
        # Check connection
        if not await es.ping():
            logger.error(f"Cannot connect to Elasticsearch at {cfg.ELASTICSEARCH_HOST}")
            return
            
        logger.info(f"Connected to ELK. Polling index: {cfg.ELASTICSEARCH_INDEX}")
        
        last_polled = datetime.datetime.utcnow() - datetime.timedelta(minutes=cfg.ELASTICSEARCH_WINDOW_MINUTES)
        
        async with httpx.AsyncClient() as http_client:
            while True:
                now = datetime.datetime.utcnow()
                
                # Fetch recent events
                query = {
                    "query": {
                        "range": {
                            "@timestamp": {
                                "gte": last_polled.isoformat(),
                                "lt": now.isoformat()
                            }
                        }
                    },
                    "sort": [{"@timestamp": {"order": "asc"}}],
                    "size": 1000 
                }
                
                try:
                    resp = await es.search(index=cfg.ELASTICSEARCH_INDEX, body=query)
                    hits = resp["hits"]["hits"]
                    
                    if len(hits) >= 60:
                        # Windowing logic: chunk into 60 events
                        windows = [hits[i:i + 60] for i in range(0, len(hits), 60)]
                        
                        for window in windows:
                            if len(window) < 60:
                                continue # Wait for full window
                                
                            # Convert to 60x32 ML format
                            window_matrix = [extract_feature_vector(ev) for ev in window]
                            
                            # Deduce user/cluster from the first event heuristics
                            user_id = window[0]["_source"].get("user", {}).get("name", "sys_default")
                            cluster_id = "cluster_admin" if "admin" in user_id else "default"
                            
                            payload = {
                                "user_id": user_id,
                                "cluster_id": cluster_id,
                                "rbac_permissions": ["ingested_role"], # Real system would enrich or pass through Auth
                                "window_data": window_matrix
                            }
                            
                            # Push to core engine
                            headers = {}
                            if cfg.INTERNAL_INGEST_TOKEN:
                                headers["X-Internal-Ingest-Token"] = cfg.INTERNAL_INGEST_TOKEN
                            res = await http_client.post(
                                cfg.TELEMETRY_INGEST_URL,
                                json=payload,
                                timeout=5.0,
                                headers=headers,
                            )
                            if res.status_code == 200:
                                logger.info(f"Successfully ingested 60-event window for {user_id}")
                            else:
                                logger.warning(f"Engine rejected telemetry: {res.text}")
                                
                    last_polled = now
                except Exception as e:
                    logger.error(f"Error querying ELK: {e}")
                    
                # Sleep interval configurable via ES_POLL_INTERVAL
                await asyncio.sleep(cfg.ELASTICSEARCH_POLL_INTERVAL_SECONDS)
                
    except Exception as general_error:
        logger.error(f"ELK Poller crashed: {general_error}")

# Entry point for stand-alone execution
if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    asyncio.run(poll_elasticsearch())
