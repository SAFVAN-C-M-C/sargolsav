import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createResultDraftService } from '../src/services/resultDrafts.js';
import { createResultLifecycleService, createPublicResultService } from '../src/services/resultLifecycle.js';
import { withParticipantDatabase } from '../test-support/postgres.js';
import { serveResultLifecycle } from '../test-support/result-lifecycle-http.js';

test('TKT-06D real PostgreSQL exceptional shared positions throughout the result workflow', { timeout: 600000 }, async (t) => {
  await withParticipantDatabase(t, async ({ db, pool }) => {
    const insert = async (sql, values) => (await pool.query(sql, values)).rows[0].id;
    const competition = await insert("INSERT INTO competitions(code,name) VALUES ('ties-one','One') RETURNING id");
    const other = await insert("INSERT INTO competitions(code,name) VALUES ('ties-other','Other') RETURNING id");
    const category = await insert("INSERT INTO categories(competition_id,name) VALUES ($1,'Category') RETURNING id", [competition]);
    const unit = await insert("INSERT INTO units(competition_id,name) VALUES ($1,'Unit') RETURNING id", [competition]);
    const madrasa = await insert("INSERT INTO madrasas(competition_id,unit_id,name) VALUES ($1,$2,'Madrassa') RETURNING id", [competition, unit]);
    const event = await insert("INSERT INTO events(competition_id,category_id,name) VALUES ($1,$2,'Tie event') RETURNING id", [competition, category]);
    const otherEvent = await insert("INSERT INTO events(competition_id,category_id,name) VALUES ($1,$2,'Other event') RETURNING id", [competition, category]);
    await pool.query('INSERT INTO competition_settings(competition_id,position_points) VALUES ($1,$2::jsonb)', [competition, JSON.stringify({ 1: 5, 2: 3 })]);
    const drafts = createResultDraftService(db);
    const lifecycle = createResultLifecycleService(db);
    const services = { drafts, lifecycle, publicResults: createPublicResultService(db) };
    const params = { competitionId: competition, categoryId: category, eventId: event };
    const root = `/api/admin/competitions/${competition}/categories/${category}/events/${event}`;
    const draftPath = `${root}/result-draft`;
    const sharedPath = `${draftPath}/shared-positions`;
    const resultPath = `${root}/result`;
    const publicPath = resultPath.replace('/api/admin/', '/api/');
    const a = { candidate_code: '001', name: 'First Winner', unit_id: unit, position: 1 };
    const b = { candidate_code: '002', name: 'Other First Winner', unit_id: unit, madrasa_id: madrasa, position: 1 };
    const c = { candidate_code: '003', name: 'Second Winner', unit_id: unit, position: 2 };
    const reason = 'Judges confirmed equal marks on the signed result sheet';
    const shared = (version, entries, explanation = reason) => ({ version, entries, shared_positions: true, reason: explanation });
    const counts = async () => (await pool.query(`SELECT (SELECT count(*) FROM candidates) AS candidates,
      (SELECT count(*) FROM audit_logs) AS audits,(SELECT count(*) FROM result_entries) AS entries,
      (SELECT count(*) FROM correction_entries) AS correction_entries,(SELECT count(*) FROM result_publications) AS publications`)).rows[0];
    let draft;
    let winners;
    let reviewed;
    let published;
    let originalPublic;
    let correction;
    let correctionPath;
    await serveResultLifecycle(services, async (request) => {
      const ok = async (path, method, body, key = 'draft', token = 'admin', status = 200) => {
        const response = await request(path, method, body, token);
        assert.equal(response.status, status, `${method} ${path}: ${JSON.stringify(response.body)}`);
        return response.body[key];
      };
      const publicView = () => ok(publicPath, 'GET', undefined, 'result', null);
      await t.test('duplicates remain rejected normally; explicit approval creates audited ties but requires complete position coverage for review', async () => {
        draft = await ok(draftPath, 'POST', {}, 'draft', 'admin', 201);
        const before = await counts();
        assert.equal((await request(draftPath, 'PUT', { version: draft.version, entries: [a,b] })).status, 400);
        assert.equal((await request(sharedPath, 'PUT', shared(draft.version, [a,a]))).status, 400);
        assert.equal((await request(sharedPath, 'PUT', shared(draft.version, [{ ...a, position: 3 },b]))).status, 400);
        assert.deepEqual(await counts(), before);
        draft = await ok(sharedPath, 'PUT', shared(draft.version, [b,a]));
        assert.deepEqual(draft.entries.map((e) => e.candidate_code), ['001','002']);
        assert.ok(draft.entries.every((e) => e.override_audit_id === draft.entries[0].override_audit_id));
        assert.ok(draft.entries[0].override_audit_id);
        const audit = (await pool.query('SELECT * FROM audit_logs WHERE id=$1', [draft.entries[0].override_audit_id])).rows[0];
        assert.equal(audit.action, 'shared_position_override'); assert.equal(audit.actor_ref, 'verified-admin');
        assert.equal(audit.reason, reason); assert.ok(audit.created_at);
        assert.equal(audit.details.event_result_id, draft.id); assert.equal(audit.details.correction_id, null);
        assert.deepEqual(audit.details.positions[0].candidate_ids, draft.entries.map((e) => e.candidate_id));
        assert.equal((await request(`${resultPath}/review`, 'POST', { version: draft.version })).status, 400);
        assert.equal((await request(publicPath, 'GET', undefined, null)).status, 404);
        assert.equal((await request(draftPath, 'PUT', { version: draft.version, entries: [a,c] })).status, 409);
        assert.equal((await request(sharedPath, 'PUT', shared(draft.version, [a,b,c]), 'reviewer')).status, 200, 'Any verified admin may approve; no extra role');
        draft = (await request(draftPath)).body.draft;
      });
      await t.test('same-version shared edits serialize and the loser creates no candidates or approvals', async () => {
        const before = await counts(); const oldVersion = draft.version;
        const raced = await Promise.all([
          request(sharedPath, 'PUT', shared(oldVersion, [a,{ ...b, candidate_code: '004', name: 'Race Four' },c])),
          request(sharedPath, 'PUT', shared(oldVersion, [a,{ ...b, candidate_code: '005', name: 'Race Five' },c])),
        ]);
        assert.deepEqual(raced.map((r) => r.status).sort(), [200,409]);
        draft = raced.find((r) => r.status === 200).body.draft;
        const after = await counts();
        assert.equal(BigInt(after.candidates), BigInt(before.candidates) + 1n);
        assert.equal(BigInt(after.audits), BigInt(before.audits) + 3n);
        assert.equal((await request(sharedPath, 'PUT', shared(oldVersion, [a,b,c]))).status, 409);
        winners = draft.entries.map((e) => ({ candidate_code: e.candidate_code, name: e.name, unit_id: e.unit_id, madrasa_id: e.madrasa_id, position: e.position }));
      });
      await t.test('reviewed shared results cannot be edited; returning to draft and changing the tie requires a new review', async () => {
        reviewed = await ok(`${resultPath}/review`, 'POST', { version: draft.version }, 'result', 'reviewer');
        const before = await counts();
        assert.equal((await request(sharedPath, 'PUT', shared(reviewed.version, [a,b,c]))).status, 409);
        assert.deepEqual(await counts(), before);
        const returned = await ok(`${resultPath}/return-to-draft`, 'POST', { version: reviewed.version }, 'result');
        assert.equal(returned.reviewed_at, null); assert.equal(returned.reviewed_by, null);
        draft = await ok(sharedPath, 'PUT', shared(returned.version, [a,b,c], 'Panel confirmed the original two tied candidates'));
        assert.equal((await request(`${resultPath}/publish`, 'POST', { version: reviewed.version })).status, 409);
        reviewed = await ok(`${resultPath}/review`, 'POST', { version: draft.version }, 'result', 'reviewer');
        winners = [a,b,c];
      });
      await t.test('publication revalidates tied membership and approval metadata; wrong groups or reasons cannot use a valid audit FK', async () => {
        const tied = reviewed.entries.filter((e) => e.position === 1);
        const idle = (await pool.query("SELECT id FROM candidates WHERE competition_id=$1 AND candidate_code IN ('004','005') ORDER BY id LIMIT 1", [competition])).rows[0].id;
        await pool.query('UPDATE result_entries SET candidate_id=$2 WHERE id=$1', [tied[1].id, idle]);
        assert.equal((await request(`${resultPath}/publish`, 'POST', { version: reviewed.version }, 'publisher')).status, 409);
        await pool.query('UPDATE result_entries SET candidate_id=$2 WHERE id=$1', [tied[1].id, tied[1].candidate_id]);
        const approval = tied[0].override_audit_id;
        const stored = (await pool.query('SELECT reason FROM audit_logs WHERE id=$1', [approval])).rows[0].reason;
        await pool.query('UPDATE audit_logs SET reason=$2 WHERE id=$1', [approval, 'Another explanatory reason changed after review']);
        assert.equal((await request(`${resultPath}/publish`, 'POST', { version: reviewed.version }, 'publisher')).status, 409);
        await pool.query('UPDATE audit_logs SET reason=$2 WHERE id=$1', [approval, stored]);
        published = await ok(`${resultPath}/publish`, 'POST', { version: reviewed.version }, 'result', 'publisher');
        originalPublic = await publicView();
        assert.deepEqual(originalPublic.winners.map((e) => [e.position,e.candidate_code]), [[1,'001'],[1,'002'],[2,'003']]);
        assert.equal(originalPublic.winners[1].madrasa.name, 'Madrassa');
        assert.doesNotMatch(JSON.stringify(originalPublic), /override|audit|reason|verified-|Panel|Judges|review_snapshot/);
        assert.deepEqual(await publicView(), originalPublic);
        const rows = (await pool.query('SELECT candidate_id,position FROM result_entries WHERE event_result_id=$1 ORDER BY position,candidate_id', [published.id])).rows;
        assert.equal(rows.filter((r) => r.position === 1).length, 2);
        assert.equal(new Set(rows.map((r) => r.candidate_id)).size, 3, 'Future scoring retains a separate ordinary position value for every winner');
        await assert.rejects(pool.query(`INSERT INTO result_entries(competition_id,event_result_id,event_id,category_id,candidate_id,position,override_audit_id)
          VALUES ($1,$2,$3,$4,$5,1,$6)`, [competition,published.id,event,category,rows[0].candidate_id,approval]), { code: '23505' });
      });
      await t.test('corrections inherit unchanged published approval without modifying the live result, but normal editing cannot bypass explicit approval', async () => {
        correction = await ok(`${resultPath}/corrections`, 'POST', { version: published.version, reason: 'Correct the tied source record' }, 'correction', 'admin', 201);
        correctionPath = `${resultPath}/corrections/${correction.id}`;
        const copied = await ok(`${correctionPath}/review`, 'POST', { version: correction.version }, 'correction', 'reviewer');
        correction = await ok(`${correctionPath}/return-to-draft`, 'POST', { version: copied.version }, 'correction');
        assert.equal((await request(correctionPath, 'PUT', { version: correction.version, entries: [a,c] })).status, 409);
        assert.equal((await request(correctionPath, 'PUT', { version: correction.version, entries: winners })).status, 400);
        assert.deepEqual(await publicView(), originalPublic);
        const before = await counts();
        assert.equal((await request(`${correctionPath}/shared-positions`, 'PUT', shared(correction.version, [
          { ...a, candidate_code: '000-partial' }, { ...b, name: 'Incorrect identity' }, c,
        ]))).status, 409);
        assert.deepEqual(await counts(), before);
        assert.equal((await request(`${correctionPath}/shared-positions`, 'PUT', shared(correction.version, winners.map((e) => ({ ...e, position: 3 }))))).status, 400);
      });
      await t.test('entry/audit failures roll back candidate resolution, approvals, replacements and versions for both save endpoints', async (t) => {
        t.mock.method(console, 'error', () => {});
        const fresh = await drafts.initialize({ ...params, eventId: otherEvent }, {}, 'fixture');
        const otherPath = sharedPath.replace(`/events/${event}/`, `/events/${otherEvent}/`);
        for (const which of ['draft','correction']) {
          const targetPath = which === 'draft' ? otherPath : `${correctionPath}/shared-positions`;
          const row = which === 'draft' ? fresh.draft : correction;
          for (const failAt of ['approval','mutation']) {
            const faultyDb = { transaction: (work) => db.transaction((query) => work((sql, values) =>
              (failAt === 'approval' && /'shared_position_override'/.test(sql) && /INSERT INTO audit_logs/.test(sql)) ||
              (failAt === 'mutation' && /INSERT INTO audit_logs/.test(sql) && ['result_draft_updated','result_correction_updated'].includes(values[3]))
                ? query('SELECT * FROM missing_tkt06d_failure') : query(sql, values))) };
            const before = await counts();
            await serveResultLifecycle({ ...services, drafts: createResultDraftService(faultyDb), lifecycle: createResultLifecycleService(faultyDb) }, async (faultyRequest) => {
              const response = await faultyRequest(targetPath, 'PUT', shared(row.version, [a,{ ...b, candidate_code: '006-rollback', name: 'Must Roll Back' },c]));
              assert.equal(response.status, 500); assert.deepEqual(response.body, { error: 'Internal server error' });
            });
            assert.deepEqual(await counts(), before); assert.deepEqual(await publicView(), originalPublic);
            const restored = which === 'draft' ? await drafts.get({ ...params, eventId: otherEvent }) : await lifecycle.get({ ...params, correctionId: correction.id }, true);
            assert.equal(restored.version, row.version); assert.equal(restored.entries.length, row.entries.length);
          }
        }
      });
      await t.test('correction shared saves serialize, retain provenance and obey the same scoped database constraints as live entries', async () => {
        const before = await counts();
        const raced = await Promise.all([
          request(`${correctionPath}/shared-positions`, 'PUT', shared(correction.version, [a,{ ...b, candidate_code: '007', name: 'Correction Seven' },c])),
          request(`${correctionPath}/shared-positions`, 'PUT', shared(correction.version, [a,{ ...b, candidate_code: '008', name: 'Correction Eight' },c])),
        ]);
        assert.deepEqual(raced.map((r) => r.status).sort(), [200,409]);
        correction = raced.find((r) => r.status === 200).body.correction;
        const after = await counts(); assert.equal(BigInt(after.candidates), BigInt(before.candidates) + 1n);
        assert.equal(BigInt(after.audits), BigInt(before.audits) + 3n);
        assert.deepEqual(await publicView(), originalPublic);
        const approval = correction.entries[0].override_audit_id;
        const audit = (await pool.query('SELECT * FROM audit_logs WHERE id=$1', [approval])).rows[0];
        assert.equal(audit.details.correction_id, correction.id); assert.equal(audit.details.event_result_id, published.id); assert.equal(audit.actor_ref, 'verified-admin');
        const wrongEventAudit = await insert("INSERT INTO audit_logs(competition_id,event_id,actor_ref,action,reason) VALUES ($1,$2,'fixture','shared_position_override','Approval for a different event') RETURNING id", [competition,otherEvent]);
        const unused = (await pool.query("SELECT id FROM candidates WHERE competition_id=$1 AND candidate_code='002'", [competition])).rows[0].id;
        await assert.rejects(pool.query(`INSERT INTO correction_entries(competition_id,correction_id,event_id,category_id,candidate_id,position,override_audit_id)
          VALUES ($1,$2,$3,$4,$5,1,$6)`, [competition,correction.id,event,category,unused,wrongEventAudit]), { code: '23503' });
        await assert.rejects(pool.query(`INSERT INTO correction_entries(competition_id,correction_id,event_id,category_id,candidate_id,position)
          VALUES ($1,$2,$3,$4,$5,2)`, [competition,correction.id,event,category,unused]), { code: '23505' });
        assert.equal((await request(`${correctionPath}/shared-positions`.replace(`/competitions/${competition}/`, `/competitions/${other}/`), 'PUT', shared(correction.version, winners))).status, 404);
      });
      await t.test('failed correction publication preserves live tied entries and public snapshots, then one concurrent publication succeeds', async (t) => {
        t.mock.method(console, 'error', () => {});
        correction = await ok(`${correctionPath}/review`, 'POST', { version: correction.version }, 'correction', 'reviewer');
        const before = await counts(); const live = await lifecycle.get(params);
        const faulty = createResultLifecycleService({ transaction: (work) => db.transaction((query) => work((sql, values) =>
          /INSERT INTO result_publications/.test(sql) ? query('SELECT * FROM missing_tkt06d_publication') : query(sql, values))) });
        await assert.rejects(faulty.publish({ ...params, correctionId: correction.id }, { version: correction.version }, 'verified-publisher', true), { code: '42P01' });
        assert.deepEqual(await counts(), before); assert.deepEqual(await lifecycle.get(params), live); assert.deepEqual(await publicView(), originalPublic);
        const raced = await Promise.all([request(`${correctionPath}/publish`, 'POST', { version: correction.version }, 'publisher'),request(`${correctionPath}/publish`, 'POST', { version: correction.version }, 'publisher')]);
        assert.deepEqual(raced.map((r) => r.status).sort(), [200,409]);
        correction = raced.find((r) => r.status === 200).body.correction;
        const current = await publicView(); assert.notEqual(current.publication_id, originalPublic.publication_id);
        assert.equal(current.winners.filter((e) => e.position === 1).length, 2);
        assert.deepEqual(current.winners.map((e) => e.candidate_code), ['001',correction.entries.find((e) => ['007','008'].includes(e.candidate_code)).candidate_code,'003']);
        assert.doesNotMatch(JSON.stringify(current), /override|audit|reason|verified-|Judges|review_snapshot/);
        const history = (await pool.query('SELECT snapshot FROM result_publications WHERE event_result_id=$1 ORDER BY id', [published.id])).rows;
        assert.deepEqual(history[0].snapshot.winners, originalPublic.winners); assert.equal(history.length, 2);
      });
      await t.test('a later correction can inherit correction-origin approval and explicitly remove ties without leaving an override enabled', async () => {
        const live = await lifecycle.get(params);
        let next = await ok(`${resultPath}/corrections`, 'POST', { version: live.version, reason: 'Remove a previously approved shared position' }, 'correction', 'admin', 201);
        const nextPath = `${resultPath}/corrections/${next.id}`;
        next = await ok(`${nextPath}/review`, 'POST', { version: next.version }, 'correction', 'reviewer');
        next = await ok(`${nextPath}/return-to-draft`, 'POST', { version: next.version }, 'correction');
        next = await ok(`${nextPath}/shared-positions`, 'PUT', shared(next.version, [a,c], 'Panel withdrew the additional tied winner'), 'correction');
        assert.ok(next.entries.every((e) => e.override_audit_id === null));
        next = await ok(nextPath, 'PUT', { version: next.version, entries: [a,c] }, 'correction');
        assert.equal((await request(nextPath, 'PUT', { version: next.version, entries: [a,b,c] })).status, 400);
        next = await ok(`${nextPath}/review`, 'POST', { version: next.version }, 'correction', 'reviewer');
        await ok(`${nextPath}/publish`, 'POST', { version: next.version }, 'correction', 'publisher');
        assert.deepEqual((await publicView()).winners.map((e) => [e.position,e.candidate_code]), [[1,'001'],[2,'003']]);
        const removal = (await pool.query("SELECT * FROM audit_logs WHERE action='shared_position_override' ORDER BY id DESC LIMIT 1")).rows[0];
        assert.deepEqual(removal.details.positions, []); assert.equal(removal.reason, 'Panel withdrew the additional tied winner');
      });
      await t.test('override audit history remains attributed and referenced approvals cannot be deleted', async () => {
        const approvals = (await pool.query("SELECT * FROM audit_logs WHERE action='shared_position_override' AND actor_ref <> 'fixture' ORDER BY id")).rows;
        assert.ok(approvals.length >= 5);
        assert.ok(approvals.every((r) => ['verified-admin','verified-reviewer'].includes(r.actor_ref) && r.competition_id === competition && r.event_id === event && r.created_at && r.details.event_result_id === published.id));
        assert.ok(approvals.some((r) => r.details.correction_id === correction.id));
        const referenced = (await pool.query('SELECT override_audit_id FROM correction_entries WHERE override_audit_id IS NOT NULL LIMIT 1')).rows[0].override_audit_id;
        await assert.rejects(pool.query('DELETE FROM audit_logs WHERE id=$1', [referenced]), { code: '23503' });
        assert.equal((await request(sharedPath, 'PUT', shared('1:20261024000000.000000', [a,b,c]))).status, 409);
      });
    });
    await pool.query('DELETE FROM competitions WHERE id=$1', [competition]);
    assert.equal((await pool.query('SELECT count(*) FROM correction_entries')).rows[0].count, '0');
  });
});
