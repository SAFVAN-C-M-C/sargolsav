import { expect, test, vi } from 'vitest';
import { AdminApiError } from './adminErrors';
import { configuredPositions, resultsApi } from './resultsApi';
import { winnerPayload } from '../utils/winnerEntry';
import type { WinnerRow } from '../types/adminResults';

const signal = () => new AbortController().signal;
const scope = { competitionId: '1', categoryId: '2', eventId: '3' };
test('candidate lookup encodes exact external codes and only candidate-not-found means a new record', async () => {
  const request = vi.fn().mockRejectedValue(new AdminApiError(404, 'Candidate not found'));
  expect(await resultsApi.lookup(request, '1', ' 001+A& ', signal())).toBeNull();
  expect(request.mock.calls[0][0]).toBe('/api/admin/competitions/1/candidates/lookup?candidate_code=%20001%2BA%26%20');
  request.mockRejectedValue(new AdminApiError(404, 'Competition not found'));
  await expect(resultsApi.lookup(request, '1', '001', signal())).rejects.toThrow('Competition not found');
});

test('draft versions stay opaque, complete entry sets contain only allowed winner fields', async () => {
  const request = vi.fn().mockResolvedValue({ draft: { id: '9', competition_id: '1', category_id: '2', event_id: '3', status: 'draft', updated_at: '2026-10-25', version: 'opaque:server-version', entries: [] } });
  const draft = await resultsApi.save(request, scope, '123:20261025000000.123456', [], signal());
  expect(draft.version).toBe('opaque:server-version'); expect(request.mock.calls[0][2]).toEqual({ method: 'PUT', body: { version: '123:20261025000000.123456', entries: [] } });
});

test('wrong-scope draft responses and malformed statuses are rejected', async () => {
  const request = vi.fn().mockResolvedValue({ draft: { id: '9', competition_id: '2', category_id: '2', event_id: '3', status: 'draft', version: 'version', updated_at: 'now', entries: [] } });
  await expect(resultsApi.read(request, scope, signal())).rejects.toThrow('Invalid draft response');
  request.mockResolvedValue({ results: [{ event_id: '3', category_id: '2', event_name: 'Event', status: 'unknown', event_result_id: null, updated_at: null }] });
  await expect(resultsApi.statuses(request, '1', signal())).rejects.toThrow('Invalid result status response');
});

test('missing drafts and protected lifecycle conflicts remain distinct from server failures', async () => {
  const request = vi.fn().mockRejectedValue(new AdminApiError(404, 'Result draft not found'));
  expect(await resultsApi.read(request, scope, signal())).toEqual({ kind: 'absent' });
  request.mockRejectedValue(new AdminApiError(409, 'Only draft results can be managed through this endpoint'));
  expect((await resultsApi.read(request, scope, signal())).kind).toBe('locked');
  request.mockRejectedValue(new AdminApiError(404, 'Event not found'));
  await expect(resultsApi.read(request, scope, signal())).rejects.toThrow('Event not found');
});

test('configured positions include gaps and zero-point positions without hardcoded defaults', () => {
  expect(configuredPositions({ '12': 0, '7': 0, '1': 5 })).toEqual(['1', '7', '12']); expect(configuredPositions({})).toEqual([]);
  expect(() => configuredPositions({ '01': 2 })).toThrow('Invalid configured positions');
});

test('winner validation accepts incomplete lists while enforcing lookup, identity and exact uniqueness', () => {
  const row: WinnerRow = { key: '1', candidate_code: '001', name: 'Winner', unit_id: '4', madrasa_id: '', position: '7', resolution: 'new' };
  expect(winnerPayload([row], ['1', '7'], ['4'])).toEqual([{ candidate_code: '001', name: 'Winner', unit_id: '4', madrasa_id: null, position: 7 }]);
  expect(winnerPayload([], [], [])).toEqual([]);
  expect(() => winnerPayload([{ ...row, resolution: 'unchecked' }], ['7'], ['4'])).toThrow('look up');
  expect(() => winnerPayload([row, { ...row, key: '2', candidate_code: '1' }], ['7'], ['4'])).toThrow('Duplicate positions');
  expect(() => winnerPayload([row, { ...row, key: '2', position: '1' }], ['1', '7'], ['4'])).toThrow('Duplicate candidate');
});
