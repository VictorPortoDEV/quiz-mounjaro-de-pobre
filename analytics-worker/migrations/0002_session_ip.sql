ALTER TABLE sessions ADD COLUMN ip_address TEXT;
ALTER TABLE sessions ADD COLUMN ip_recorded_at INTEGER;
CREATE INDEX IF NOT EXISTS idx_sessions_ip_recorded ON sessions(ip_recorded_at) WHERE ip_recorded_at IS NOT NULL;
