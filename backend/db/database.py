"""
Async SQLAlchemy engine and session factory for the AITRMS PostgreSQL database.
Uses asyncpg as the database driver for non-blocking I/O.
"""
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase
from sqlalchemy import Column, String, Float, Text, ARRAY, DateTime, func
import config as cfg

engine = create_async_engine(cfg.DATABASE_URL, pool_pre_ping=True, echo=False)

AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False
)

class Base(DeclarativeBase):
    pass

# ─── ORM Models ──────────────────────────────────────────────────────────────

class CVECache(Base):
    __tablename__ = "cve_cache"

    id             = Column(String(30), primary_key=True)
    description    = Column(Text, nullable=False)
    cvss_v3        = Column(Float, nullable=False)
    cvss_vector    = Column(Text)
    affected_cpe   = Column(ARRAY(Text))
    published_date = Column(DateTime(timezone=True))
    modified_date  = Column(DateTime(timezone=True))
    created_at     = Column(DateTime(timezone=True), server_default=func.now())

class MITRETechnique(Base):
    __tablename__ = "mitre_techniques"

    technique_id = Column(String(20), primary_key=True)
    name         = Column(Text, nullable=False)
    tactic       = Column(Text, nullable=False)
    description  = Column(Text)
    detection    = Column(Text)
    mitigation   = Column(Text)
    created_at   = Column(DateTime(timezone=True), server_default=func.now())


async def get_db() -> AsyncSession:
    """FastAPI dependency for injecting an async DB session."""
    async with AsyncSessionLocal() as session:
        yield session
