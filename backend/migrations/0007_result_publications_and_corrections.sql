-- TKT-06C: immutable public projections and isolated correction workspaces.
ALTER TABLE event_results ADD COLUMN review_snapshot jsonb
  CHECK (review_snapshot IS NULL OR jsonb_typeof(review_snapshot) = 'object');

CREATE TABLE result_publications (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  competition_id bigint NOT NULL REFERENCES competitions(id) ON DELETE CASCADE,
  event_result_id bigint NOT NULL,
  event_id bigint NOT NULL,
  category_id bigint NOT NULL,
  reviewed_by text NOT NULL CHECK (btrim(reviewed_by) <> ''),
  reviewed_at timestamptz NOT NULL,
  published_by text NOT NULL CHECK (btrim(published_by) <> ''),
  published_at timestamptz NOT NULL,
  snapshot jsonb NOT NULL CHECK (jsonb_typeof(snapshot) = 'object'),
  FOREIGN KEY (event_result_id, competition_id, event_id, category_id)
    REFERENCES event_results(id, competition_id, event_id, category_id),
  UNIQUE (id, competition_id, event_result_id),
  CHECK (published_at >= reviewed_at)
);
CREATE INDEX result_publications_latest_idx ON result_publications(competition_id, event_id, id DESC);

-- Preserve existing publications at migration time, including their exact winner metadata.
INSERT INTO result_publications (competition_id,event_result_id,event_id,category_id,
  reviewed_by,reviewed_at,published_by,published_at,snapshot)
SELECT r.competition_id,r.id,r.event_id,r.category_id,r.reviewed_by,r.reviewed_at,r.published_by,r.published_at,
  jsonb_build_object('competition_id',r.competition_id::text,'event_id',r.event_id::text,
    'category_id',r.category_id::text,'event_name',e.name,'category_name',cat.name,
    'winners',COALESCE((SELECT jsonb_agg(jsonb_build_object('candidate_code',c.candidate_code,
      'name',c.name,'position',re.position,'unit',jsonb_build_object('id',u.id::text,'name',u.name),
      'madrasa',CASE WHEN m.id IS NULL THEN NULL ELSE jsonb_build_object('id',m.id::text,'name',m.name) END)
      ORDER BY re.position,re.id)
      FROM result_entries re JOIN candidates c ON c.id=re.candidate_id
      JOIN units u ON u.id=c.unit_id LEFT JOIN madrasas m ON m.id=c.madrasa_id
      WHERE re.event_result_id=r.id), '[]'::jsonb))
FROM event_results r JOIN events e ON e.id=r.event_id JOIN categories cat ON cat.id=r.category_id
WHERE r.status='published';

CREATE TABLE result_corrections (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  competition_id bigint NOT NULL REFERENCES competitions(id) ON DELETE CASCADE,
  event_result_id bigint NOT NULL,
  event_id bigint NOT NULL,
  category_id bigint NOT NULL,
  base_publication_id bigint NOT NULL,
  reason text NOT NULL CHECK (btrim(reason) <> ''),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','reviewed','applied')),
  reviewed_by text,
  reviewed_at timestamptz,
  applied_by text,
  applied_at timestamptz,
  review_snapshot jsonb CHECK (review_snapshot IS NULL OR jsonb_typeof(review_snapshot) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (event_result_id, competition_id, event_id, category_id)
    REFERENCES event_results(id, competition_id, event_id, category_id),
  FOREIGN KEY (base_publication_id, competition_id, event_result_id)
    REFERENCES result_publications(id, competition_id, event_result_id),
  UNIQUE (id, competition_id, event_id, category_id),
  CHECK ((status='draft' AND reviewed_by IS NULL AND reviewed_at IS NULL AND review_snapshot IS NULL AND applied_by IS NULL AND applied_at IS NULL)
    OR (status='reviewed' AND btrim(reviewed_by) <> '' AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL
      AND review_snapshot IS NOT NULL AND applied_by IS NULL AND applied_at IS NULL)
    OR (status='applied' AND btrim(reviewed_by) <> '' AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL
      AND review_snapshot IS NOT NULL AND btrim(applied_by) <> '' AND applied_by IS NOT NULL AND applied_at >= reviewed_at AND applied_at IS NOT NULL))
);
CREATE UNIQUE INDEX result_corrections_active_idx ON result_corrections(event_result_id) WHERE status IN ('draft','reviewed');
CREATE TRIGGER set_updated_at BEFORE UPDATE ON result_corrections FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE correction_entries (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  competition_id bigint NOT NULL REFERENCES competitions(id) ON DELETE CASCADE,
  correction_id bigint NOT NULL,
  event_id bigint NOT NULL,
  category_id bigint NOT NULL,
  candidate_id bigint NOT NULL,
  position integer NOT NULL CHECK (position > 0),
  FOREIGN KEY (correction_id, competition_id, event_id, category_id)
    REFERENCES result_corrections(id, competition_id, event_id, category_id),
  FOREIGN KEY (candidate_id, competition_id, category_id) REFERENCES candidates(id, competition_id, category_id),
  UNIQUE (correction_id,candidate_id),
  UNIQUE (correction_id,position)
);
CREATE INDEX correction_entries_candidate_idx ON correction_entries(candidate_id,competition_id,category_id);

-- New tables inherit the same server-only boundary as migration 0006.
DO $$
DECLARE table_name text; client_role text; sequence_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['result_publications','result_corrections','correction_entries'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',table_name);
    EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE %I FROM PUBLIC',table_name);
    sequence_name := pg_get_serial_sequence(format('%I',table_name),'id');
    EXECUTE format('REVOKE ALL PRIVILEGES ON SEQUENCE %s FROM PUBLIC',sequence_name);
    FOREACH client_role IN ARRAY ARRAY['anon','authenticated'] LOOP
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname=client_role) THEN
        EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE %I FROM %I',table_name,client_role);
        EXECUTE format('REVOKE ALL PRIVILEGES ON SEQUENCE %s FROM %I',sequence_name,client_role);
      END IF;
    END LOOP;
  END LOOP;
END;
$$;
