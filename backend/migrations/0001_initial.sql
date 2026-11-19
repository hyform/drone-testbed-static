CREATE TABLE IF NOT EXISTS hyform_projects (
  id TEXT PRIMARY KEY,
  edit_token_hash TEXT NOT NULL,
  payload TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS hyform_projects_updated_at
  ON hyform_projects(updated_at);
