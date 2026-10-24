-- TKT-05D: event deletion must not silently remove result sets or their entries.
-- NO ACTION checks at statement end, preserving intentional whole-competition
-- cascades: those delete both events and results through their competition FKs.
ALTER TABLE event_results
  DROP CONSTRAINT event_results_event_id_competition_id_category_id_fkey,
  ADD CONSTRAINT event_results_event_id_competition_id_category_id_fkey
    FOREIGN KEY (event_id, competition_id, category_id)
    REFERENCES events(id, competition_id, category_id) ON DELETE NO ACTION;
