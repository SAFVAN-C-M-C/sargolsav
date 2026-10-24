-- TKT-05D: Firebase-authorized backend connections own the data boundary.
-- Supabase client roles must not bypass API validation or forge audit/history rows.
-- No client policies are added: future public results need an explicit projection.
DO $$
DECLARE
  table_name text;
  client_role text;
  sequence_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['competitions', 'competition_settings', 'units',
    'madrasas', 'categories', 'events', 'candidates', 'event_results', 'result_entries',
    'audit_logs', 'schema_migrations'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE %I FROM PUBLIC', table_name);
    sequence_name := NULL;
    IF table_name NOT IN ('competition_settings', 'schema_migrations') THEN
      sequence_name := pg_get_serial_sequence(format('%I', table_name), 'id');
      IF sequence_name IS NOT NULL THEN
        EXECUTE format('REVOKE ALL PRIVILEGES ON SEQUENCE %s FROM PUBLIC', sequence_name);
      END IF;
    END IF;
    FOREACH client_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = client_role) THEN
        EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE %I FROM %I', table_name, client_role);
        IF sequence_name IS NOT NULL THEN
          EXECUTE format('REVOKE ALL PRIVILEGES ON SEQUENCE %s FROM %I', sequence_name, client_role);
        END IF;
      END IF;
    END LOOP;
  END LOOP;
END;
$$;
