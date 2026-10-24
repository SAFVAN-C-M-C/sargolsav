-- TKT-03-A: competition-owned configuration. IDs never encode business codes.
CREATE TABLE competitions (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  code text NOT NULL UNIQUE CHECK (btrim(code) <> ''),
  name text NOT NULL CHECK (btrim(name) <> ''),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'archived')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE units (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  competition_id bigint NOT NULL REFERENCES competitions(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (btrim(name) <> ''),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, competition_id),
  UNIQUE (competition_id, name)
);

CREATE TABLE madrasas (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  competition_id bigint NOT NULL REFERENCES competitions(id) ON DELETE CASCADE,
  unit_id bigint NOT NULL,
  name text NOT NULL CHECK (btrim(name) <> ''),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (unit_id, competition_id) REFERENCES units(id, competition_id),
  UNIQUE (id, competition_id, unit_id),
  UNIQUE (competition_id, unit_id, name)
);

CREATE TABLE categories (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  competition_id bigint NOT NULL REFERENCES competitions(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (btrim(name) <> ''),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, competition_id),
  UNIQUE (competition_id, name)
);

CREATE TABLE events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  competition_id bigint NOT NULL REFERENCES competitions(id) ON DELETE CASCADE,
  category_id bigint NOT NULL,
  name text NOT NULL CHECK (btrim(name) <> ''),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (category_id, competition_id) REFERENCES categories(id, competition_id),
  UNIQUE (id, competition_id),
  UNIQUE (id, competition_id, category_id),
  UNIQUE (competition_id, category_id, name)
);

CREATE INDEX madrasas_unit_idx ON madrasas(unit_id, competition_id);
CREATE INDEX events_category_idx ON events(category_id, competition_id);
