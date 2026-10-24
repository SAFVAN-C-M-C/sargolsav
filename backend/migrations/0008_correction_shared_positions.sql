-- TKT-06D: mirror the existing live-entry audit FK and ordinary-position guard.
ALTER TABLE correction_entries
  ADD COLUMN override_audit_id bigint,
  ADD COLUMN override_action text GENERATED ALWAYS AS ('shared_position_override'::text) STORED,
  ADD CONSTRAINT correction_entries_override_audit_fk
    FOREIGN KEY (override_audit_id, competition_id, event_id, override_action)
    REFERENCES audit_logs(id, competition_id, event_id, action),
  DROP CONSTRAINT correction_entries_correction_id_position_key;

CREATE UNIQUE INDEX correction_entries_ordinary_position_idx
  ON correction_entries(correction_id,position) WHERE override_audit_id IS NULL;
CREATE INDEX correction_entries_override_idx
  ON correction_entries(override_audit_id,competition_id,event_id,override_action)
  WHERE override_audit_id IS NOT NULL;
-- Existing table RLS/grants, candidate uniqueness and scoped FKs remain unchanged.
