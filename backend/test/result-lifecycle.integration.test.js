import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { createResultDraftService } from '../src/services/resultDrafts.js';
import { createCandidateService } from '../src/services/candidates.js';
import { createResultLifecycleService, createPublicResultService } from '../src/services/resultLifecycle.js';
import { withParticipantDatabase } from '../test-support/postgres.js';
import { serveResultLifecycle } from '../test-support/result-lifecycle-http.js';

test('TKT-06C PostgreSQL review, publication, public privacy and corrections', { timeout: 480000 }, async (t) => {
  await withParticipantDatabase(t, async ({ db, pool }) => {
    const insert = async (sql, values) => (await pool.query(sql, values)).rows[0].id;
    const competition = await insert("INSERT INTO competitions(code,name) VALUES ('life-one','One') RETURNING id");
    const other = await insert("INSERT INTO competitions(code,name) VALUES ('life-two','Other') RETURNING id");
    const category = await insert("INSERT INTO categories(competition_id,name) VALUES ($1,'Category') RETURNING id", [competition]);
    const foreignCategory = await insert("INSERT INTO categories(competition_id,name) VALUES ($1,'Foreign') RETURNING id", [other]);
    const unit = await insert("INSERT INTO units(competition_id,name) VALUES ($1,'Unit') RETURNING id", [competition]);
    const foreignUnit = await insert("INSERT INTO units(competition_id,name) VALUES ($1,'Foreign') RETURNING id", [other]);
    const madrasa = await insert("INSERT INTO madrasas(competition_id,unit_id,name) VALUES ($1,$2,'Madrassa') RETURNING id", [competition, unit]);
    const event = await insert("INSERT INTO events(competition_id,category_id,name) VALUES ($1,$2,'One') RETURNING id", [competition, category]);
    const secondEvent = await insert("INSERT INTO events(competition_id,category_id,name) VALUES ($1,$2,'Two') RETURNING id", [competition, category]);
    const legacyEvent = await insert("INSERT INTO events(competition_id,category_id,name) VALUES ($1,$2,'Legacy') RETURNING id", [competition, category]);
    await pool.query('INSERT INTO competition_settings(competition_id,position_points) VALUES ($1,$2::jsonb)', [competition, JSON.stringify({ 1: 10, 2: 0 })]);
    const drafts = createResultDraftService(db);
    const lifecycle = createResultLifecycleService(db);
    const publicResults = createPublicResultService(db);
    const candidates = createCandidateService(db);
    const services = { drafts, lifecycle, publicResults };
    const params = { competitionId: competition, categoryId: category, eventId: event };
    const secondParams = { ...params, eventId: secondEvent };
    const root = `/api/admin/competitions/${competition}/categories/${category}/events/${event}/result`;
    const secondRoot = root.replace(`/events/${event}/`, `/events/${secondEvent}/`);
    const publicRoot = root.replace('/api/admin/', '/api/');
    const winner = { candidate_code: '001', name: 'Winner One', unit_id: unit, position: 1 };
    const winner2 = { candidate_code: '002', name: 'Winner Two', unit_id: unit, madrasa_id: madrasa, position: 2 };
    const candidate = await candidates.create({ competitionId: competition }, {
      candidate_code: winner.candidate_code, name: winner.name, unit_id: unit, category_id: category,
    }, 'fixture');
    const counts = async () => (await pool.query(`SELECT (SELECT count(*) FROM candidates) AS candidates,
      (SELECT count(*) FROM result_entries) AS entries,(SELECT count(*) FROM result_publications) AS publications,
      (SELECT count(*) FROM result_corrections) AS corrections,(SELECT count(*) FROM correction_entries) AS correction_entries,
      (SELECT count(*) FROM audit_logs) AS audits`)).rows[0];
    await t.test('migration backfills legacy publications without exposing reviewer metadata', async () => {
      const sql = await readFile(new URL('../migrations/0007_result_publications_and_corrections.sql', import.meta.url), 'utf8');
      const rollback = new Error('intentional migration-test rollback');
      await assert.rejects(db.transaction(async (query) => {
        await query('DROP TABLE correction_entries; DROP TABLE result_corrections; DROP TABLE result_publications; ALTER TABLE event_results DROP COLUMN review_snapshot');
        const { rows: [legacy] } = await query(`INSERT INTO event_results(competition_id,event_id,category_id,status,reviewed_by,reviewed_at,published_by,published_at)
          VALUES ($1,$2,$3,'published','legacy-reviewer',now(),'legacy-publisher',now()) RETURNING id`, [competition, legacyEvent, category]);
        await query('INSERT INTO result_entries(competition_id,event_result_id,event_id,category_id,candidate_id,position) VALUES ($1,$2,$3,$4,$5,1)', [competition, legacy.id, legacyEvent, category, candidate.id]);
        await query(sql);
        const rows = (await query('SELECT * FROM result_publications')).rows;
        assert.equal(rows.length, 1); assert.equal(rows[0].snapshot.winners[0].candidate_code, '001');
        assert.equal(rows[0].snapshot.winners[0].unit.name, 'Unit');
        assert.equal(rows[0].reviewed_by, 'legacy-reviewer');
        assert.doesNotMatch(JSON.stringify(rows[0].snapshot), /legacy-reviewer|legacy-publisher/);
        throw rollback;
      }), (error) => error === rollback);
    });
    let draft;
    let reviewed;
    let published;
    let originalPublic;
    let correction;
    let correctionPath;
    await serveResultLifecycle(services, async (request) => {
      const ok = async (url, method, body, key = 'result', token = 'admin', status = 200) => {
        const response = await request(url, method, body, token);
        assert.equal(response.status, status, `${method} ${url}: ${JSON.stringify(response.body)}`);
        return response.body[key];
      };
      const publishedView = () => ok(publicRoot, 'GET', undefined, 'result', null);
      await t.test('uninitialized, draft and incomplete results remain private and cannot be published/reviewed', async () => {
        assert.equal((await request(publicRoot, 'GET', undefined, null)).status, 404);
        assert.equal((await request(`${publicRoot}/status`, 'GET', undefined, null)).body.availability.status, 'unpublished');
        assert.deepEqual((await request(`/api/competitions/${competition}/results`, 'GET', undefined, null)).body.results, []);
        draft = await ok(`${root}-draft`, 'POST', {}, 'draft', 'admin', 201);
        assert.equal((await request(`${root}/publish`, 'POST', { version: draft.version })).status, 409);
        assert.equal((await request(`${root}/review`, 'POST', { version: draft.version })).status, 400);
        draft = await ok(`${root}-draft`, 'PUT', { version: draft.version, entries: [winner] }, 'draft');
        const before = await counts();
        assert.equal((await request(`${root}/review`, 'POST', { version: draft.version })).status, 400);
        assert.deepEqual(await counts(), before);
        assert.equal((await request(publicRoot, 'GET', undefined, null)).status, 404);
      });
      await t.test('review requires all configured positions, records reviewer and can be returned to draft', async () => {
        draft = await ok(`${root}-draft`, 'PUT', { version: draft.version, entries: [winner2, winner] }, 'draft');
        reviewed = await ok(`${root}/review`, 'POST', { version: draft.version }, 'result', 'reviewer');
        assert.equal(reviewed.status, 'reviewed'); assert.equal(reviewed.reviewed_by, 'verified-reviewer'); assert.ok(reviewed.reviewed_at);
        assert.deepEqual((await request(root)).body.result, { ...reviewed, active_correction_id: null });
        assert.equal((await request(`${root}/review`, 'POST', { version: reviewed.version })).status, 409);
        assert.equal((await request(`${root}-draft`, 'PUT', { version: reviewed.version, entries: [] })).status, 409);
        assert.equal((await request(publicRoot, 'GET', undefined, null)).status, 404);
        assert.equal((await request(`${publicRoot}/status`, 'GET', undefined, null)).body.availability.status, 'unpublished');
        const returned = await ok(`${root}/return-to-draft`, 'POST', { version: reviewed.version });
        assert.equal(returned.status, 'draft'); assert.equal(returned.reviewed_by, null); assert.equal(returned.reviewed_at, null);
        assert.equal((await request(`${root}/publish`, 'POST', { version: reviewed.version })).status, 409);
        reviewed = await ok(`${root}/review`, 'POST', { version: returned.version }, 'result', 'reviewer');
      });
      await t.test('changed settings invalidate review; concurrent publications create one public version and one audit', async () => {
        await pool.query('UPDATE competition_settings SET position_points=$2::jsonb WHERE competition_id=$1', [competition, JSON.stringify({ 1: 11, 2: 0 })]);
        assert.equal((await request(`${root}/publish`, 'POST', { version: reviewed.version })).status, 409);
        const returned = await ok(`${root}/return-to-draft`, 'POST', { version: reviewed.version });
        reviewed = await ok(`${root}/review`, 'POST', { version: returned.version }, 'result', 'reviewer');
        const before = await counts();
        const raced = await Promise.all([request(`${root}/publish`, 'POST', { version: reviewed.version }, 'publisher'), request(`${root}/publish`, 'POST', { version: reviewed.version }, 'publisher')]);
        assert.deepEqual(raced.map((r) => r.status).sort(), [200,409]);
        published = raced.find((r) => r.status === 200).body.result;
        assert.equal(published.status, 'published'); assert.equal(published.published_by, 'verified-publisher'); assert.ok(published.published_at);
        assert.equal(BigInt((await counts()).publications), BigInt(before.publications) + 1n);
        assert.equal(BigInt((await counts()).audits), BigInt(before.audits) + 1n);
        originalPublic = await publishedView();
        assert.deepEqual(originalPublic.winners.map((r) => r.candidate_code), ['001','002']);
        assert.deepEqual(originalPublic.winners.map((r) => r.position), [1,2]);
        assert.equal(originalPublic.winners[0].madrasa, null); assert.equal(originalPublic.winners[1].madrasa.name, 'Madrassa');
        assert.doesNotMatch(JSON.stringify(originalPublic), /verified-|review_snapshot|actor_ref|reason/);
        assert.equal((await request(`${root}/publish`, 'POST', { version: published.version })).status, 409);
        assert.equal((await request(`${root}/return-to-draft`, 'POST', { version: published.version })).status, 409);
        for (const method of ['GET','POST','PUT']) assert.equal((await request(`${root}-draft`, method, method === 'PUT' ? { version: published.version, entries: [] } : method === 'POST' ? {} : undefined)).status, 409);
        assert.deepEqual((await request(`/api/competitions/${competition}/results?category_id=${category}`, 'GET', undefined, null)).body.results, [originalPublic]);
        assert.deepEqual((await request(`/api/competitions/${competition}/categories/${category}/results`, 'GET', undefined, null)).body.results, [originalPublic]);
        assert.equal((await request(`${publicRoot}/status`, 'GET', undefined, null)).body.availability.status, 'published');
      });
      await t.test('correction preparation has separate entries and leaves the published result visible', async () => {
        correction = await ok(`${root}/corrections`, 'POST', { version: published.version, reason: 'Correct the second winner' }, 'correction', 'admin', 201);
        correctionPath = `${root}/corrections/${correction.id}`;
        assert.equal(correction.status, 'draft'); assert.equal(correction.entries.length, 2);
        assert.equal((await request(root)).body.result.active_correction_id, correction.id);
        assert.equal((await request(`${root}/corrections`, 'POST', { version: published.version, reason: 'Duplicate' })).status, 409);
        const originalLiveEntries = (await pool.query('SELECT candidate_id,position FROM result_entries WHERE event_result_id=$1 ORDER BY position', [published.id])).rows;
        correction = await ok(correctionPath, 'PUT', { version: correction.version, entries: [winner, { ...winner2, candidate_code: '003', name: 'New Winner', madrasa_id: null }] }, 'correction');
        assert.deepEqual(await publishedView(), originalPublic);
        assert.deepEqual((await pool.query('SELECT candidate_id,position FROM result_entries WHERE event_result_id=$1 ORDER BY position', [published.id])).rows, originalLiveEntries);
        assert.equal((await request(root)).body.result.version, published.version);
        const before = await counts();
        assert.equal((await request(correctionPath, 'PUT', { version: correction.version, entries: [
          { ...winner, candidate_code: '000-rollback' }, { ...winner2, name: 'Conflict' },
        ] })).status, 409);
        assert.deepEqual(await counts(), before); assert.deepEqual(await publishedView(), originalPublic);
        assert.equal((await request(correctionPath, 'PUT', { version: correction.version, entries: [{ ...winner, unit_id: foreignUnit }] })).status, 400);
        assert.deepEqual(await counts(), before);
      });
      await t.test('concurrent correction save/review rejects one stale editor; identity changes invalidate review without changing public names', async () => {
        const desired = [winner, { ...winner2, candidate_code: '003', name: 'New Winner', madrasa_id: null }];
        const raced = await Promise.all([request(correctionPath, 'PUT', { version: correction.version, entries: desired }), request(`${correctionPath}/review`, 'POST', { version: correction.version }, 'reviewer')]);
        assert.deepEqual(raced.map((r) => r.status).sort(), [200,409]);
        correction = raced.find((r) => r.status === 200).body.correction;
        if (correction.status === 'draft') correction = await ok(`${correctionPath}/review`, 'POST', { version: correction.version }, 'correction', 'reviewer');
        assert.equal((await request(correctionPath, 'PUT', { version: correction.version, entries: [] })).status, 409);
        await candidates.update({ competitionId: competition, candidateId: candidate.id }, { name: 'Corrected Winner One' }, 'fixture');
        assert.equal((await request(`${correctionPath}/publish`, 'POST', { version: correction.version }, 'publisher')).status, 409);
        assert.deepEqual(await publishedView(), originalPublic);
        correction = await ok(`${correctionPath}/return-to-draft`, 'POST', { version: correction.version }, 'correction');
        assert.equal(correction.reviewed_by, null);
        correction = await ok(`${correctionPath}/review`, 'POST', { version: correction.version }, 'correction', 'reviewer');
      });
      await t.test('failed correction publication rolls back live entries, header, publication history, correction status and audits', async (t) => {
        t.mock.method(console, 'error', () => {});
        const before = await counts(); const beforeLive = await lifecycle.get(params); const beforeCorrection = await lifecycle.get({ ...params, correctionId: correction.id }, true);
        for (const failure of ['publication','audit']) {
          const faulty = createResultLifecycleService({ transaction: (work) => db.transaction((query) => work((sql, values) =>
            (failure === 'publication' && /INSERT INTO result_publications/.test(sql)) || (failure === 'audit' && /INSERT INTO audit_logs/.test(sql) && values[3] === 'result_correction_published')
              ? query('SELECT * FROM missing_tkt06c_failure') : query(sql, values))) });
          await serveResultLifecycle({ ...services, lifecycle: faulty }, async (faultyRequest) => {
            const response = await faultyRequest(`${correctionPath}/publish`, 'POST', { version: correction.version }, 'publisher');
            assert.equal(response.status, 500); assert.deepEqual(response.body, { error: 'Internal server error' });
          });
          assert.deepEqual(await counts(), before); assert.deepEqual(await lifecycle.get(params), beforeLive);
          assert.deepEqual(await lifecycle.get({ ...params, correctionId: correction.id }, true), beforeCorrection);
          assert.deepEqual(await publishedView(), originalPublic);
        }
      });
      await t.test('publishing the correction atomically replaces public winners and preserves previous publication history', async () => {
        const raced = await Promise.all([request(`${correctionPath}/publish`, 'POST', { version: correction.version }, 'publisher'), request(`${correctionPath}/publish`, 'POST', { version: correction.version }, 'publisher')]);
        assert.deepEqual(raced.map((r) => r.status).sort(), [200,409]);
        correction = raced.find((r) => r.status === 200).body.correction;
        assert.equal(correction.status, 'applied'); assert.equal(correction.applied_by, 'verified-publisher');
        const replacement = await publishedView();
        assert.notEqual(replacement.publication_id, originalPublic.publication_id);
        assert.deepEqual(replacement.winners.map((r) => r.candidate_code), ['001','003']);
        assert.equal(replacement.winners[0].name, 'Corrected Winner One');
        const history = (await pool.query('SELECT snapshot FROM result_publications WHERE event_result_id=$1 ORDER BY id', [published.id])).rows;
        assert.equal(history.length, 2); assert.equal(history[0].snapshot.winners[0].name, 'Winner One');
        assert.equal(history[0].snapshot.winners[1].candidate_code, '002');
        assert.equal((await request(root)).body.result.active_correction_id, null);
        assert.equal((await request(correctionPath, 'PUT', { version: correction.version, entries: [] })).status, 409);
        assert.equal((await request(`${correctionPath}/return-to-draft`, 'POST', { version: correction.version })).status, 409);
        await assert.rejects(pool.query('DELETE FROM events WHERE id=$1', [event]), { code: '23503' });
        await assert.rejects(pool.query('DELETE FROM event_results WHERE id=$1', [published.id]), { code: '23503' });
      });
      await t.test('competing return-to-draft and publication never overwrite each other', async () => {
        const initialized = await ok(`${secondRoot}-draft`, 'POST', {}, 'draft', 'admin', 201);
        const saved = await ok(`${secondRoot}-draft`, 'PUT', { version: initialized.version, entries: [{ ...winner, name: 'Corrected Winner One' },winner2] }, 'draft');
        const reviewed = await ok(`${secondRoot}/review`, 'POST', { version: saved.version }, 'result', 'reviewer');
        const raced = await Promise.all([request(`${secondRoot}/publish`, 'POST', { version: reviewed.version }, 'publisher'), request(`${secondRoot}/return-to-draft`, 'POST', { version: reviewed.version })]);
        assert.deepEqual(raced.map((r) => r.status).sort(), [200,409]);
        const current = raced.find((r) => r.status === 200).body.result;
        const availability = await publicResults.status(secondParams);
        assert.equal(availability.status, current.status === 'published' ? 'published' : 'unpublished');
        if (current.status === 'draft') assert.equal(current.reviewed_by, null);
      });
      await t.test('cross-competition/category requests cannot read or mutate results, corrections or public projections', async () => {
        const before = await counts();
        const badRoot = root.replace(`/competitions/${competition}/`, `/competitions/${other}/`);
        for (const suffix of ['', '/review', '/publish', '/return-to-draft', '/corrections', `/corrections/${correction.id}`, `/corrections/${correction.id}/publish`]) {
          const isGet = suffix === '' || suffix === `/corrections/${correction.id}`;
          assert.equal((await request(`${badRoot}${suffix}`, isGet ? 'GET' : 'POST', isGet ? undefined : { version: correction.version, ...(suffix === '/corrections' ? { reason: 'Wrong' } : {}) })).status, 404);
        }
        assert.equal((await request(root.replace(`/categories/${category}/`, `/categories/${foreignCategory}/`))).status, 404);
        assert.equal((await request(publicRoot.replace(`/competitions/${competition}/`, `/competitions/${other}/`), 'GET', undefined, null)).status, 404);
        assert.equal((await request(`/api/competitions/${competition}/results?category_id=${foreignCategory}`, 'GET', undefined, null)).status, 404);
        assert.deepEqual((await request(`/api/competitions/${other}/results`, 'GET', undefined, null)).body.results, []);
        assert.deepEqual(await counts(), before);
        assert.equal((await request(`${root}/corrections/${correction.id}`, 'PUT', { version: correction.version, entries: [{ ...winner, unit_id: foreignUnit }] })).status, 409);
      });
      await t.test('successful lifecycle and correction audits retain verified attribution, reasons and before/after details', async () => {
        const audits = (await pool.query("SELECT * FROM audit_logs WHERE action IN ('result_reviewed','result_returned_to_draft','result_published') OR action LIKE 'result_correction_%' ORDER BY id")).rows;
        assert.ok(audits.length > 10); assert.ok(audits.every((a) => a.competition_id === competition && [event,secondEvent].includes(a.event_id) && a.actor_ref.startsWith('verified-')));
        assert.ok(audits.filter((a) => a.action.endsWith('_reviewed')).every((a) => a.actor_ref === 'verified-reviewer'));
        assert.ok(audits.filter((a) => a.action.endsWith('_published')).every((a) => a.actor_ref === 'verified-publisher'));
        const corrected = audits.find((a) => a.action === 'result_correction_published');
        assert.equal(corrected.reason, 'Correct the second winner');
        assert.equal(corrected.details.before.status, 'reviewed'); assert.equal(corrected.details.after.status, 'applied');
        assert.ok(corrected.details.after.publication_id); assert.ok(corrected.details.before.entries.length);
      });
    });
    await t.test('audit failures during review, initial publication and correction start leave no partial state', async () => {
      const thirdParams = { ...params, eventId: legacyEvent };
      const { draft } = await drafts.initialize(thirdParams, {}, 'fixture');
      const saved = await drafts.save(thirdParams, { version: draft.version, entries: [{ ...winner, name: 'Corrected Winner One' },winner2] }, 'fixture');
      const faulty = createResultLifecycleService({ transaction: (work) => db.transaction((query) => work((sql, values) =>
        /INSERT INTO audit_logs/.test(sql) ? query('SELECT * FROM missing_tkt06c_audit') : query(sql, values))) });
      const before = await counts();
      await assert.rejects(faulty.review(thirdParams, { version: saved.version }, 'verified-reviewer'), { code: '42P01' });
      assert.equal((await lifecycle.get(thirdParams)).version, saved.version); assert.deepEqual(await counts(), before);
      const reviewed = await lifecycle.review(thirdParams, { version: saved.version }, 'verified-reviewer');
      const afterReview = await counts();
      await assert.rejects(faulty.publish(thirdParams, { version: reviewed.version }, 'verified-publisher'), { code: '42P01' });
      assert.deepEqual(await counts(), afterReview); assert.equal((await publicResults.status(thirdParams)).status, 'unpublished');
      const currentLive = await lifecycle.get(params);
      await assert.rejects(faulty.startCorrection(params, { version: currentLive.version, reason: 'Must roll back' }, 'verified-admin'), { code: '42P01' });
      assert.deepEqual(await counts(), afterReview);
    });
    await t.test('whole-competition cleanup remains possible in the isolated schema', async () => {
      await pool.query('DELETE FROM competitions WHERE id=$1', [competition]);
      for (const table of ['result_publications','result_corrections','correction_entries','event_results','result_entries']) {
        assert.equal((await pool.query(`SELECT count(*) FROM ${table}`)).rows[0].count, '0');
      }
    });
  });
});
