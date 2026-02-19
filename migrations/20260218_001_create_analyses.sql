CREATE TABLE IF NOT EXISTS analyses (
    id VARCHAR(36) PRIMARY KEY,
    user_id VARCHAR(36) NOT NULL,
    status VARCHAR(32) NOT NULL,
    progress_stage VARCHAR(64) NOT NULL,
    upload_payload JSON NOT NULL,
    lab_payload JSON NOT NULL,
    result_payload JSON,
    failure_reason VARCHAR(64),
    error_message TEXT,
    created_at TIMESTAMP NOT NULL,
    updated_at TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS ix_analyses_user_id ON analyses (user_id);
CREATE INDEX IF NOT EXISTS ix_analyses_status ON analyses (status);
