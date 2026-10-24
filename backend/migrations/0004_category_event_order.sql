-- TKT-05C: configurable display order; preserve all existing names and relationships.
ALTER TABLE categories ADD COLUMN sort_order integer NOT NULL DEFAULT 0 CHECK (sort_order >= 0);
ALTER TABLE events ADD COLUMN sort_order integer NOT NULL DEFAULT 0 CHECK (sort_order >= 0);

CREATE INDEX categories_display_order_idx ON categories(competition_id, sort_order, id);
CREATE INDEX events_display_order_idx ON events(competition_id, category_id, sort_order, id);
