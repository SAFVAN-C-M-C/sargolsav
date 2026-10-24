-- Development fixture only. Example scores are data, never migration defaults.
DO $$
DECLARE competition bigint; unit bigint; category bigint; madrasa bigint; event bigint;
BEGIN
  INSERT INTO competitions(code, name) VALUES ('local-demo', 'Local development demo')
    ON CONFLICT (code) DO NOTHING RETURNING id INTO competition;
  IF competition IS NULL THEN RETURN; END IF;
  INSERT INTO competition_settings(competition_id, position_points)
    VALUES (competition, '{"1":5,"2":3,"3":1}');
  INSERT INTO units(competition_id, name) VALUES (competition, 'Demo unit') RETURNING id INTO unit;
  INSERT INTO madrasas(competition_id, unit_id, name)
    VALUES (competition, unit, 'Demo madrasa') RETURNING id INTO madrasa;
  INSERT INTO categories(competition_id, name) VALUES (competition, 'Demo category') RETURNING id INTO category;
  INSERT INTO events(competition_id, category_id, name)
    VALUES (competition, category, 'Demo event') RETURNING id INTO event;
  INSERT INTO candidates(competition_id, unit_id, madrasa_id, category_id, candidate_code, name)
    VALUES (competition, unit, madrasa, category, '001', 'Demo candidate one'),
      (competition, unit, NULL, category, '002', 'Demo candidate two');
  INSERT INTO event_results(competition_id, event_id, category_id) VALUES (competition, event, category);
END;
$$;
