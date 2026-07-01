CREATE TABLE IF NOT EXISTS mcat_leaf_state (
  leaf_id TEXT NOT NULL PRIMARY KEY,
  fluency REAL NOT NULL,
  application REAL NOT NULL,
  attempts INTEGER NOT NULL,
  freshness REAL NOT NULL,
  assessed INTEGER NOT NULL,
  gate_open INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
) WITHOUT ROWID;