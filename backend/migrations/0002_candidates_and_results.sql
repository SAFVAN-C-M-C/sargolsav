-- TKT-03-B: one configurable points object per competition; no scoring defaults.
CREATE FUNCTION valid_position_points(points jsonb) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE STRICT AS $$
DECLARE item record;
BEGIN
  IF jsonb_typeof(points) <> 'object' THEN RETURN false; END IF;
  FOR item IN SELECT key, value FROM jsonb_each(points) LOOP
    IF item.key !~ '^[1-9][0-9]*$' THEN RETURN false; END IF;
    IF length(item.key) > 10 THEN RETURN false; END IF;
    IF item.key::numeric > 2147483647 THEN RETURN false; END IF;
    IF jsonb_typeof(item.value) <> 'number' THEN RETURN false; END IF;
  END LOOP;
  RETURN true;
END;
$$;

CREATE TABLE competition_settings (
  competition_id bigint PRIMARY KEY REFERENCES competitions(id) ON DELETE CASCADE,
  position_points jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (valid_position_points(position_points)),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE candidates (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  competition_id bigint NOT NULL REFERENCES competitions(id) ON DELETE CASCADE,
  unit_id bigint NOT NULL,
  madrasa_id bigint,
  category_id bigint NOT NULL,
  candidate_code text NOT NULL CHECK (btrim(candidate_code) <> ''),
  name text NOT NULL CHECK (btrim(name) <> ''),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (unit_id, competition_id) REFERENCES units(id, competition_id),
  FOREIGN KEY (madrasa_id, competition_id, unit_id) REFERENCES madrasas(id, competition_id, unit_id),
  FOREIGN KEY (category_id, competition_id) REFERENCES categories(id, competition_id),
  UNIQUE (competition_id, candidate_code),
  UNIQUE (id, competition_id, category_id)
);

CREATE TABLE event_results (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  competition_id bigint NOT NULL REFERENCES competitions(id) ON DELETE CASCADE,
  event_id bigint NOT NULL,
  category_id bigint NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'reviewed', 'published')),
  reviewed_at timestamptz,
  reviewed_by text CHECK (btrim(reviewed_by) <> ''),
  published_at timestamptz,
  published_by text CHECK (btrim(published_by) <> ''),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (event_id, competition_id, category_id)
    REFERENCES events(id, competition_id, category_id) ON DELETE CASCADE,
  UNIQUE (event_id),
  UNIQUE (id, competition_id, event_id, category_id),
  CHECK (
    (status = 'draft' AND reviewed_at IS NULL AND reviewed_by IS NULL
      AND published_at IS NULL AND published_by IS NULL)
    OR (status = 'reviewed' AND reviewed_at IS NOT NULL AND reviewed_by IS NOT NULL
      AND published_at IS NULL AND published_by IS NULL)
    OR (status = 'published' AND reviewed_at IS NOT NULL AND reviewed_by IS NOT NULL
      AND published_at IS NOT NULL AND published_by IS NOT NULL AND published_at >= reviewed_at)
  )
);

CREATE TABLE result_entries (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  competition_id bigint NOT NULL REFERENCES competitions(id) ON DELETE CASCADE,
  event_result_id bigint NOT NULL,
  event_id bigint NOT NULL,
  category_id bigint NOT NULL,
  candidate_id bigint NOT NULL,
  position integer NOT NULL CHECK (position > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (event_result_id, competition_id, event_id, category_id)
    REFERENCES event_results(id, competition_id, event_id, category_id) ON DELETE CASCADE,
  FOREIGN KEY (candidate_id, competition_id, category_id)
    REFERENCES candidates(id, competition_id, category_id),
  UNIQUE (event_id, candidate_id)
);
