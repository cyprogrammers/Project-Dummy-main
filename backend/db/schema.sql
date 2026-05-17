-- AITRMS PostgreSQL Schema
-- Run this against your aitrms database to initialize the tables.

-- CVE Cache: populated by OpenVAS scan imports or NVD feed
CREATE TABLE IF NOT EXISTS cve_cache (
    id              VARCHAR(30) PRIMARY KEY,        -- e.g. CVE-2024-12345
    description     TEXT NOT NULL,
    cvss_v3         NUMERIC(4,1) NOT NULL,
    cvss_vector     TEXT,
    published_date  TIMESTAMP WITH TIME ZONE,
    modified_date   TIMESTAMP WITH TIME ZONE,
    affected_cpe    TEXT[],                         -- CPE identifiers
    created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- MITRE ATT&CK Techniques Cache (refreshed from TAXII feed)
CREATE TABLE IF NOT EXISTS mitre_techniques (
    technique_id    VARCHAR(20) PRIMARY KEY,        -- e.g. T1078
    name            TEXT NOT NULL,
    tactic          TEXT NOT NULL,                  -- e.g. Persistence
    description     TEXT,
    detection       TEXT,
    mitigation      TEXT,
    created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Seed with baseline MITRE entries
INSERT INTO mitre_techniques (technique_id, name, tactic, description)
VALUES
  ('T1078', 'Valid Accounts',                    'Persistence',        'Adversaries may obtain and abuse credentials to gain access.'),
  ('T1046', 'Network Service Discovery',         'Discovery',          'Adversaries may attempt to get a listing of services on remote hosts.'),
  ('T1059', 'Command and Scripting Interpreter', 'Execution',          'Adversaries may abuse command and script interpreters to execute commands.'),
  ('T1110', 'Brute Force',                       'Credential Access',  'Adversaries may use brute force techniques to gain access to accounts.'),
  ('T1071', 'Application Layer Protocol',        'Command and Control','Adversaries may communicate using application layer protocols to avoid detection.'),
  ('T1133', 'External Remote Services',          'Initial Access',     'Adversaries may leverage external-facing remote services to gain initial access.')
ON CONFLICT (technique_id) DO NOTHING;
