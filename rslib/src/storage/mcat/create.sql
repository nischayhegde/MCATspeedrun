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
CREATE TABLE IF NOT EXISTS mcat_answer_log (
  revlog_id INTEGER NOT NULL PRIMARY KEY,
  card_id INTEGER NOT NULL,
  verdict TEXT NOT NULL,
  typed_answer TEXT NOT NULL,
  feedback TEXT NOT NULL,
  model TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_mcat_answer_log_card ON mcat_answer_log (card_id);