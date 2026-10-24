import assert from 'node:assert/strict';
import { test } from 'node:test';
import { once } from 'node:events';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import app from '../src/config/app.js';
import { pool as applicationPool } from '../src/db/pool.js';
import { getFirebaseAuth } from '../src/auth/firebase.js';
import { migrate } from '../src/db/migrate.js';
import { withSetupDatabase } from '../test-support/setup-postgres.js';

test('TKT-05D complete setup through the production Express application', { timeout: 300000 }, async (t) => {
  await withSetupDatabase(t, async ({ pool }) => {
    // Exercise real route mounting, middleware, controllers and services. Only the
    // SDK token boundary and the database connection destination are substituted.
    let failAudit = false;
    let failRead = false;
    const queryMock = t.mock.method(applicationPool, 'query', (sql, values) =>
      failRead ? pool.query('SELECT * FROM missing_tkt05d_read_table') : pool.query(sql, values));
    const connectMock = t.mock.method(applicationPool, 'connect', async () => {
      const client = await pool.connect();
      return {
        query: (sql, values) => failAudit && /INSERT INTO audit_logs/.test(sql)
          ? client.query('SELECT * FROM missing_tkt05d_audit_table') : client.query(sql, values),
        release: (error) => client.release(error),
      };
    });
    const names = ['FIREBASE_PROJECT_ID', 'FIREBASE_CLIENT_EMAIL', 'FIREBASE_PRIVATE_KEY'];
    const previous = Object.fromEntries(names.map((name) => [name, process.env[name]]));
    process.env.FIREBASE_PROJECT_ID = 'setup-integration';
    delete process.env.FIREBASE_CLIENT_EMAIL;
    delete process.env.FIREBASE_PRIVATE_KEY;
    const sdk = initializeApp({ projectId: 'setup-integration', credential: {
      async getAccessToken() { throw new Error('Unexpected external credentials request'); },
    } });
    const verify = t.mock.method(getFirebaseAuth(), 'verifyIdToken', async (token, revoked) => {
      assert.equal(revoked, true, 'production verification must check revocation');
      if (['expired', 'revoked'].includes(token)) throw Object.assign(new Error('private token'), {
        code: token === 'expired' ? 'auth/id-token-expired' : 'auth/id-token-revoked',
      });
      if (token === 'unavailable') throw new Error('private credential');
      return { uid: 'verified-setup-admin', admin: token === 'admin' ? true : token === 'string-admin' ? 'true' : false };
    });
    const server = app.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const base = `http://127.0.0.1:${server.address().port}/api/admin/competitions`;
    async function request(path = '', method = 'GET', body, token = 'admin') {
      const response = await fetch(`${base}${path}`, { method,
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      const value = response.status === 204 ? null : await response.json();
      return { status: response.status, body: value, headers: response.headers };
    }
    async function success(path, method, body, key) {
      const result = await request(path, method, body);
      assert.equal(result.status, method === 'POST' ? 201 : 200, `${method} ${path}: ${JSON.stringify(result.body)}`);
      return key ? result.body[key] : result.body;
    }
    async function structure(id) {
      const [competition, settings, units, categories] = await Promise.all([
        success(`/${id}`, 'GET', undefined, 'competition'), success(`/${id}/settings`, 'GET', undefined, 'settings'),
        success(`/${id}/units`, 'GET', undefined, 'units'), success(`/${id}/categories`, 'GET', undefined, 'categories'),
      ]);
      return { competition, settings,
        units: await Promise.all(units.map(async (unit) => ({ ...unit,
          madrasas: await success(`/${id}/units/${unit.id}/madrasas`, 'GET', undefined, 'madrasas'),
        }))),
        categories: await Promise.all(categories.map(async (category) => ({ ...category,
          events: await success(`/${id}/categories/${category.id}/events`, 'GET', undefined, 'events'),
        }))),
      };
    }
    let competition;
    let other;
    let units;
    let madrasa;
    const categories = [];
    const events = [];
    let finalTree;
    let otherTree;
    try {
      await t.test('all migrations and their ordering indexes are present and reruns apply nothing', async () => {
        assert.deepEqual(await migrate(pool), []);
        const history = (await pool.query('SELECT name FROM schema_migrations ORDER BY name')).rows.map((r) => r.name);
        assert.deepEqual(history, [
          '0001_competition_structure.sql', '0002_candidates_and_results.sql', '0003_audit_and_integrity.sql',
          '0004_category_event_order.sql', '0005_protect_event_results.sql',
          '0006_restrict_client_database_access.sql',
          '0007_result_publications_and_corrections.sql',
        ]);
        const indexes = (await pool.query("SELECT indexname,indexdef FROM pg_indexes WHERE schemaname=current_schema() AND indexname IN ('categories_display_order_idx','events_display_order_idx')")).rows;
        assert.equal(indexes.length, 2);
        assert.match(indexes.find((r) => r.indexname === 'categories_display_order_idx').indexdef, /\(competition_id, sort_order, id\)/);
        assert.match(indexes.find((r) => r.indexname === 'events_display_order_idx').indexdef, /\(competition_id, category_id, sort_order, id\)/);
        const fk = (await pool.query("SELECT confdeltype FROM pg_constraint WHERE conname='event_results_event_id_competition_id_category_id_fkey' AND conrelid='event_results'::regclass")).rows[0];
        assert.equal(fk.confdeltype, 'a');
      });

      await t.test('create competition, shared points, three units and optional Madrassas via APIs', async () => {
        competition = await success('', 'POST', { code: 'setup-one', name: 'Setup One' }, 'competition');
        assert.equal(competition.status, 'draft');
        const points = await success(`/${competition.id}/settings`, 'PUT', { position_points: { 1: 5, 2: 3, 3: 1 } }, 'settings');
        assert.deepEqual(points.position_points, { 1: 5, 2: 3, 3: 1 });
        units = [];
        for (const name of ['North', 'South', 'Independent']) {
          units.push(await success(`/${competition.id}/units`, 'POST', { name }, 'unit'));
        }
        madrasa = await success(`/${competition.id}/units/${units[0].id}/madrasas`, 'POST', { name: 'Central' }, 'madrasa');
        await success(`/${competition.id}/units/${units[0].id}/madrasas`, 'POST', { name: 'West' }, 'madrasa');
        await success(`/${competition.id}/units/${units[1].id}/madrasas`, 'POST', { name: 'Central' }, 'madrasa');
        assert.deepEqual(await success(`/${competition.id}/units/${units[2].id}/madrasas`, 'GET', undefined, 'madrasas'), []);
      });

      await t.test('five default categories and two events per category are configured by callers, not business logic', async () => {
        const defaults = ['Kids', 'Children', 'Sub Junior', 'Junior', 'Teen'];
        for (const [index, name] of defaults.entries()) {
          const category = await success(`/${competition.id}/categories`, 'POST', { name, sort_order: index }, 'category');
          categories.push(category);
          for (const [order, eventName] of ['Recitation', 'Speech'].entries()) {
            events.push(await success(`/${competition.id}/categories/${category.id}/events`, 'POST', { name: eventName, sort_order: order }, 'event'));
          }
        }
        assert.deepEqual((await success(`/${competition.id}/categories`, 'GET', undefined, 'categories')).map((r) => r.name), defaults);
      });

      await t.test('edit names and order across modules; concurrent partial category edits preserve both fields', async () => {
        await success(`/${competition.id}`, 'PATCH', { name: 'Renamed Competition' }, 'competition');
        units[0] = await success(`/${competition.id}/units/${units[0].id}`, 'PATCH', { name: 'North Updated' }, 'unit');
        madrasa = await success(`/${competition.id}/units/${units[0].id}/madrasas/${madrasa.id}`, 'PATCH', { name: 'Central Updated' }, 'madrasa');
        await Promise.all([
          success(`/${competition.id}/categories/${categories[0].id}`, 'PATCH', { name: 'Kids Updated' }, 'category'),
          success(`/${competition.id}/categories/${categories[0].id}`, 'PATCH', { sort_order: 10 }, 'category'),
          success(`/${competition.id}/settings`, 'PUT', { position_points: { 1: 7, 2: 3, 3: 0 } }, 'settings'),
        ]);
        events[0] = await success(`/${competition.id}/categories/${categories[0].id}/events/${events[0].id}`, 'PATCH',
          { name: 'Recitation Updated', sort_order: 10 }, 'event');
        const updated = await success(`/${competition.id}/categories/${categories[0].id}`, 'GET', undefined, 'category');
        assert.equal(updated.name, 'Kids Updated');
        assert.equal(updated.sort_order, 10);
        assert.equal((await success(`/${competition.id}/status`, 'PATCH', { status: 'active' }, 'competition')).status, 'active');
      });

      await t.test('retrieve the complete structure and isolate a second competition reusing scoped names', async () => {
        finalTree = await structure(competition.id);
        assert.equal(finalTree.competition.name, 'Renamed Competition');
        assert.deepEqual(finalTree.settings.position_points, { 1: 7, 2: 3, 3: 0 });
        assert.equal(finalTree.units.length, 3);
        assert.deepEqual(finalTree.units.find((r) => r.id === units[2].id).madrasas, []);
        assert.equal(finalTree.units.find((r) => r.id === units[0].id).madrasas.length, 2);
        assert.equal(finalTree.categories.length, 5);
        assert.equal(finalTree.categories.at(-1).name, 'Kids Updated');
        assert.equal(finalTree.categories.flatMap((r) => r.events).length, 10);
        assert.equal(finalTree.categories.at(-1).events.at(-1).name, 'Recitation Updated');
        for (const row of [...finalTree.units, ...finalTree.categories, ...finalTree.categories.flatMap((r) => r.events)]) {
          assert.equal(row.competition_id, competition.id);
        }
        other = await success('', 'POST', { code: 'setup-two', name: 'Setup Two' }, 'competition');
        const otherUnit = await success(`/${other.id}/units`, 'POST', { name: units[0].name }, 'unit');
        await success(`/${other.id}/units/${otherUnit.id}/madrasas`, 'POST', { name: madrasa.name }, 'madrasa');
        const otherCategory = await success(`/${other.id}/categories`, 'POST', { name: 'Kids Updated' }, 'category');
        await success(`/${other.id}/categories/${otherCategory.id}/events`, 'POST', { name: events[0].name }, 'event');
        otherTree = await structure(other.id);
        assert.deepEqual(otherTree.settings.position_points, {});
        assert.equal(otherTree.units.length, 1);
        assert.equal(otherTree.categories.length, 1);
        assert.deepEqual(await structure(competition.id), finalTree);
      });

      await t.test('every production mutation rejects unauthenticated, non-admin, expired and revoked callers without database access', async () => {
        const root = `/${competition.id}`;
        const mutations = [
          ['', 'POST', { code: 'forbidden', name: 'Forbidden' }], [root, 'PATCH', { name: 'Forbidden' }],
          [`${root}/status`, 'PATCH', { status: 'archived' }], [`${root}/settings`, 'PUT', { position_points: {} }],
          [`${root}/units`, 'POST', { name: 'Forbidden' }], [`${root}/units/${units[0].id}`, 'PATCH', { name: 'Forbidden' }],
          [`${root}/units/${units[2].id}`, 'DELETE'], [`${root}/units/${units[0].id}/madrasas`, 'POST', { name: 'Forbidden' }],
          [`${root}/units/${units[0].id}/madrasas/${madrasa.id}`, 'PATCH', { name: 'Forbidden' }],
          [`${root}/units/${units[0].id}/madrasas/${madrasa.id}`, 'DELETE'],
          [`${root}/categories`, 'POST', { name: 'Forbidden' }], [`${root}/categories/${categories[0].id}`, 'PATCH', { name: 'Forbidden' }],
          [`${root}/categories/${categories[0].id}`, 'DELETE'],
          [`${root}/categories/${categories[0].id}/events`, 'POST', { name: 'Forbidden' }],
          [`${root}/categories/${categories[0].id}/events/${events[0].id}`, 'PATCH', { name: 'Forbidden' }],
          [`${root}/categories/${categories[0].id}/events/${events[0].id}`, 'DELETE'],
        ];
        const queries = queryMock.mock.calls.length;
        const connects = connectMock.mock.calls.length;
        for (const [path, method, body] of mutations) {
          for (const [token, status] of [[null, 401], ['member', 403], ['string-admin', 403], ['expired', 401], ['revoked', 401], ['unavailable', 503]]) {
            const result = await request(path, method, body, token);
            assert.equal(result.status, status, `${method} ${path}`);
            assert.equal(result.headers.get('cache-control'), 'no-store');
            assert.doesNotMatch(JSON.stringify(result.body), /private|credential|stack/);
          }
        }
        assert.equal(queryMock.mock.calls.length, queries);
        assert.equal(connectMock.mock.calls.length, connects);
        assert.ok(verify.mock.calls.length > 0);
      });

      await t.test('cross-competition, wrong-parent, duplicate and validation errors agree across mounted modules', async () => {
        for (const [path, method, body, status] of [
          [`/${other.id}/units/${units[0].id}`, 'GET', undefined, 404],
          [`/${other.id}/units/${units[0].id}/madrasas`, 'POST', { name: 'Wrong' }, 404],
          [`/${competition.id}/units/${units[1].id}/madrasas/${madrasa.id}`, 'PATCH', { name: 'Wrong' }, 404],
          [`/${other.id}/categories/${categories[0].id}/events`, 'GET', undefined, 404],
          [`/${competition.id}/categories/${categories[1].id}/events/${events[0].id}`, 'DELETE', undefined, 404],
          ['', 'POST', { code: 'setup-one', name: 'Duplicate' }, 409],
          [`/${competition.id}/units`, 'POST', { name: units[0].name }, 409],
          [`/${competition.id}/units/${units[0].id}/madrasas`, 'POST', { name: madrasa.name }, 409],
          [`/${competition.id}/categories`, 'POST', { name: 'Kids Updated' }, 409],
          [`/${competition.id}/categories/${categories[0].id}/events`, 'POST', { name: events[0].name }, 409],
          [`/${competition.id}/settings`, 'PUT', { position_points: { 1: -1 } }, 400],
          [`/${competition.id}/units/${units[0].id}`, 'PATCH', { competition_id: other.id }, 400],
          [`/${competition.id}/categories/${categories[0].id}/events/${events[0].id}`, 'PATCH', { category_id: categories[1].id }, 400],
          [`/${competition.id}/categories/${categories[0].id}`, 'PATCH', { sort_order: 1.5 }, 400],
          [`/${competition.id}/status`, 'PATCH', { status: 'draft' }, 409],
          [`/${competition.id}/units/${units[0].id}`, 'DELETE', undefined, 409],
          [`/${competition.id}/categories/${categories[0].id}`, 'DELETE', undefined, 409],
        ]) {
          const result = await request(path, method, body);
          assert.equal(result.status, status, `${method} ${path}`);
          assert.equal(typeof result.body.error, 'string');
          assert.doesNotMatch(JSON.stringify(result.body), /SELECT|constraint|postgres:|stack/);
        }
        assert.deepEqual(await structure(competition.id), finalTree);
        assert.deepEqual(await structure(other.id), otherTree);
      });

      await t.test('all successful production mutations have trusted audit attribution and no rejected request is audited', async () => {
        const { rows } = await pool.query('SELECT competition_id,actor_ref,action,details FROM audit_logs ORDER BY id');
        assert.equal(rows.length, 36);
        assert.ok(rows.every((row) => row.actor_ref === 'verified-setup-admin'));
        assert.equal(rows.filter((row) => row.competition_id === competition.id).length, 31);
        assert.equal(rows.filter((row) => row.competition_id === other.id).length, 5);
        for (const row of rows.filter((r) => r.details.after?.competition_id)) {
          assert.equal(row.details.after.competition_id, row.competition_id);
        }
        const edits = rows.filter((row) => row.action === 'category_updated');
        assert.equal(edits.length, 2);
        assert.deepEqual(edits[1].details.before, edits[0].details.after);
      });

      await t.test('production error handling sanitizes actual SQL failures and rolls back all setup modules', async (t) => {
        const logs = t.mock.method(console, 'error', () => {});
        failAudit = true;
        try {
          for (const [path, method, body] of [
            ['', 'POST', { code: 'failed-setup', name: 'Must roll back' }],
            [`/${competition.id}/settings`, 'PUT', { position_points: { 1: 999 } }],
            [`/${competition.id}/units`, 'POST', { name: 'Must roll back' }],
            [`/${competition.id}/units/${units[0].id}/madrasas`, 'POST', { name: 'Must roll back' }],
            [`/${competition.id}/categories`, 'POST', { name: 'Must roll back' }],
            [`/${competition.id}/categories/${categories[0].id}/events`, 'POST', { name: 'Must roll back' }],
          ]) {
            const result = await request(path, method, body);
            assert.equal(result.status, 500);
            assert.deepEqual(result.body, { error: 'Internal server error' });
          }
        } finally { failAudit = false; }
        failRead = true;
        try {
          const result = await request(`/${competition.id}`);
          assert.equal(result.status, 500);
          assert.deepEqual(result.body, { error: 'Internal server error' });
        } finally { failRead = false; }
        assert.equal(logs.mock.calls.length, 7);
        for (const call of logs.mock.calls) assert.deepEqual(call.arguments, ['API request failed']);
        assert.deepEqual(await structure(competition.id), finalTree);
        assert.deepEqual(await structure(other.id), otherTree);
        assert.equal((await pool.query('SELECT count(*) FROM audit_logs')).rows[0].count, '36');
        assert.equal((await pool.query('SELECT count(*) FROM competitions')).rows[0].count, '2');
      });
    } finally {
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
      verify.mock.restore();
      queryMock.mock.restore();
      connectMock.mock.restore();
      await deleteApp(sdk);
      for (const name of names) {
        if (previous[name] === undefined) delete process.env[name];
        else process.env[name] = previous[name];
      }
    }
  });
});
