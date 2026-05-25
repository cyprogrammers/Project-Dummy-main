-- ============================================================
-- AITRMS Tasks Table Migration
-- Run this against your aitrms database before swapping to
-- the PostgreSQL-backed task_engine.py.
--
-- Usage:
--   psql -U postgres -d aitrms -f migration_tasks.sql
-- ============================================================

-- Enum types
DO $$ BEGIN
    CREATE TYPE task_status AS ENUM (
        'pending', 'in_progress', 'completed', 'cancelled', 'blocked'
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE task_priority AS ENUM ('P1', 'P2', 'P3', 'P4');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE task_category AS ENUM (
        'Backup', 'Security', 'Database', 'System', 'Network',
        'Auth / IAM', 'Incident Response', 'Patching', 'Monitoring', 'Other'
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Tasks table
CREATE TABLE IF NOT EXISTS tasks (
    id                  VARCHAR(20)      PRIMARY KEY,
    title               VARCHAR(200)     NOT NULL,
    description         TEXT             NOT NULL,
    category            task_category    NOT NULL,
    priority            task_priority    NOT NULL,
    status              task_status      NOT NULL DEFAULT 'pending',

    assigned_to_email   VARCHAR(255),
    assigned_to_name    VARCHAR(200),
    assigned_by_email   VARCHAR(255),
    assigned_by_name    VARCHAR(200),

    created_at          TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at          TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    due_date            TIMESTAMP WITH TIME ZONE,
    completed_at        TIMESTAMP WITH TIME ZONE,

    technician_notes    TEXT,
    admin_notes         TEXT,
    tags                JSONB            NOT NULL DEFAULT '[]',
    attachment_refs     JSONB            NOT NULL DEFAULT '[]'
);

-- Auto-update updated_at on every row change
CREATE OR REPLACE FUNCTION update_tasks_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tasks_updated_at_trigger ON tasks;
CREATE TRIGGER tasks_updated_at_trigger
    BEFORE UPDATE ON tasks
    FOR EACH ROW EXECUTE FUNCTION update_tasks_updated_at();

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_tasks_assigned_to  ON tasks (assigned_to_email);
CREATE INDEX IF NOT EXISTS idx_tasks_status        ON tasks (status);
CREATE INDEX IF NOT EXISTS idx_tasks_priority      ON tasks (priority);
CREATE INDEX IF NOT EXISTS idx_tasks_created_at    ON tasks (created_at DESC);
