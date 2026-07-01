// Copyright: Ankitects Pty Ltd and contributors
// License: GNU AGPL, version 3 or later; http://www.gnu.org/licenses/agpl.html

use rusqlite::params;
use rusqlite::Row;

use super::SqliteStorage;
use crate::error::Result;
use crate::mcat::model::LeafState;

fn row_to_leaf_state(row: &Row) -> Result<LeafState> {
    Ok(LeafState {
        id: row.get::<_, String>(0)?,
        fluency: row.get::<_, f64>(1)? as f32,
        application: row.get::<_, f64>(2)? as f32,
        // effective (fractional) evidence; rusqlite reads legacy integer rows
        // as f64 too, so no migration is needed
        attempts: row.get::<_, f64>(3)? as f32,
        freshness: row.get::<_, f64>(4)? as f32,
        assessed: row.get::<_, i64>(5)? != 0,
        gate_open: row.get::<_, i64>(6)? != 0,
    })
}

impl SqliteStorage {
    /// Idempotently create the MCAT scoring tables. Safe to call on every
    /// collection open; uses `CREATE TABLE IF NOT EXISTS` so it never clobbers
    /// existing data and does not require a schema-version bump.
    pub(crate) fn create_mcat_tables(&self) -> Result<()> {
        self.db.execute_batch(include_str!("create.sql"))?;
        Ok(())
    }

    #[allow(dead_code)] // single-leaf accessor kept for the upcoming RPC layer
    pub(crate) fn get_mcat_leaf_state(&self, leaf_id: &str) -> Result<Option<LeafState>> {
        self.db
            .prepare_cached(concat!(include_str!("get.sql"), " where leaf_id = ?"))?
            .query_and_then([leaf_id], row_to_leaf_state)?
            .next()
            .transpose()
    }

    pub(crate) fn all_mcat_leaf_states(&self) -> Result<Vec<LeafState>> {
        self.db
            .prepare_cached(include_str!("get.sql"))?
            .query_and_then([], row_to_leaf_state)?
            .collect()
    }

    /// Delete every persisted leaf state (used by the full progress reset).
    pub(crate) fn clear_mcat_leaf_states(&self) -> Result<()> {
        self.db.execute("delete from mcat_leaf_state", [])?;
        Ok(())
    }

    /// Delete all review-log rows for the given cards (used by the full
    /// progress reset so recomputed leaf states start from a clean slate).
    pub(crate) fn clear_revlog_for_cards(&self, cids: &[i64]) -> Result<()> {
        let mut stmt = self.db.prepare_cached("delete from revlog where cid = ?")?;
        for cid in cids {
            stmt.execute([cid])?;
        }
        Ok(())
    }

    pub(crate) fn upsert_mcat_leaf_state(&self, s: &LeafState, now_ms: i64) -> Result<()> {
        self.db
            .prepare_cached(include_str!("upsert.sql"))?
            .execute(params![
                &s.id,
                s.fluency as f64,
                s.application as f64,
                s.attempts as f64,
                s.freshness as f64,
                i64::from(s.assessed),
                i64::from(s.gate_open),
                now_ms,
            ])?;
        Ok(())
    }
}
