-- TKT-03-C: actor references are supplied by future admin authentication.
-- Audit rows are competition data and never own or cascade to admin accounts.
CREATE TABLE audit_logs (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  competition_id bigint NOT NULL REFERENCES competitions(id) ON DELETE CASCADE,
  event_id bigint,
  actor_ref text NOT NULL CHECK (btrim(actor_ref) <> ''),
  action text NOT NULL CHECK (btrim(action) <> ''),
  reason text NOT NULL CHECK (btrim(reason) <> ''),
  details jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(details) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (event_id, competition_id) REFERENCES events(id, competition_id),
  UNIQUE (id, competition_id, event_id, action),
  CHECK (action <> 'shared_position_override' OR event_id IS NOT NULL)
);

ALTER TABLE result_entries
  ADD COLUMN override_audit_id bigint,
  ADD COLUMN override_action text GENERATED ALWAYS AS ('shared_position_override'::text) STORED,
  ADD CONSTRAINT result_entries_override_audit_fk
    FOREIGN KEY (override_audit_id, competition_id, event_id, override_action)
    REFERENCES audit_logs(id, competition_id, event_id, action);

-- One ordinary entry per position; additional entries need an explicit audit FK.
-- PostgreSQL uniqueness also serializes competing ordinary inserts safely.
CREATE UNIQUE INDEX result_entries_ordinary_position_idx
  ON result_entries(event_id, position) WHERE override_audit_id IS NULL;

CREATE INDEX candidates_unit_idx ON candidates(unit_id, competition_id);
CREATE INDEX candidates_madrasa_idx ON candidates(madrasa_id, competition_id, unit_id);
CREATE INDEX candidates_category_idx ON candidates(category_id, competition_id);
CREATE INDEX event_results_published_idx ON event_results(competition_id, event_id) WHERE status = 'published';
CREATE INDEX result_entries_result_idx ON result_entries(event_result_id, competition_id, event_id, category_id);
CREATE INDEX result_entries_candidate_idx ON result_entries(candidate_id, competition_id, category_id);
CREATE INDEX result_entries_override_idx ON result_entries(override_audit_id, competition_id, event_id, override_action)
  WHERE override_audit_id IS NOT NULL;
CREATE INDEX result_entries_competition_idx ON result_entries(competition_id);
CREATE INDEX event_results_competition_idx ON event_results(competition_id);
CREATE INDEX audit_logs_competition_time_idx ON audit_logs(competition_id, created_at, id);
CREATE INDEX audit_logs_event_idx ON audit_logs(event_id, competition_id);

CREATE FUNCTION set_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := clock_timestamp();
  RETURN NEW;
END;
$$;

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['competitions', 'units', 'madrasas', 'categories',
    'events', 'competition_settings', 'candidates', 'event_results', 'result_entries'] LOOP
    EXECUTE format('CREATE TRIGGER set_updated_at BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION set_updated_at()', table_name);
  END LOOP;
END;
$$;
