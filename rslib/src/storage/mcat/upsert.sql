INSERT INTO mcat_leaf_state (
    leaf_id,
    fluency,
    application,
    attempts,
    freshness,
    assessed,
    gate_open,
    updated_at
  )
VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(leaf_id) DO
UPDATE
SET fluency = excluded.fluency,
  application = excluded.application,
  attempts = excluded.attempts,
  freshness = excluded.freshness,
  assessed = excluded.assessed,
  gate_open = excluded.gate_open,
  updated_at = excluded.updated_at;