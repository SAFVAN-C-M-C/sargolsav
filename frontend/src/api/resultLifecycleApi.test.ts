import { expect, test, vi } from 'vitest';
import { resultLifecycleApi } from './resultLifecycleApi';
import { reviewProblems } from '../utils/resultReview';
import type { EventResult, ResultCorrection } from '../types/resultLifecycle';

const scope = { competitionId: '1', categoryId: '2', eventId: '3' };
const signal = () => new AbortController().signal;
const result = (): EventResult => ({ id: '4', competition_id: '1', category_id: '2', event_id: '3', status: 'draft', version: 'opaque:version', updated_at: 'now', reviewed_by: null, reviewed_at: null, published_by: null, published_at: null, active_correction_id: null, entries: [{ id: '5', candidate_id: '6', candidate_code: '001', name: 'Winner', unit_id: '7', unit_name: 'Unit', madrasa_id: null, madrasa_name: null, position: 1, override_audit_id: null }] });
const correction = (): ResultCorrection => ({ ...result(), id: '8', status: 'draft', event_result_id: '4', base_publication_id: '9', reason: 'Verify source', applied_by: null, applied_at: null });

test('lifecycle transitions send only the exact opaque version to existing paths', async () => {
  const request = vi.fn().mockResolvedValue({ result: { ...result(), status: 'reviewed', version: 'new:opaque', reviewed_by: 'admin', reviewed_at: 'now' } });
  const response = await resultLifecycleApi.transition(request, scope, 'review', 'original:opaque', signal());
  expect(request.mock.calls[0][0]).toBe('/api/admin/competitions/1/categories/2/events/3/result/review'); expect(request.mock.calls[0][2]).toEqual({ method: 'POST', body: { version: 'original:opaque' } }); expect(response.version).toBe('new:opaque');
});

test('correction creation, saves and review/publish have their independent versions and envelopes', async () => {
  const request = vi.fn().mockResolvedValue({ correction: correction() });
  await resultLifecycleApi.startCorrection(request, scope, 'main:version', ' Exact reason ', signal());
  expect(request.mock.calls[0][2]).toEqual({ method: 'POST', body: { version: 'main:version', reason: ' Exact reason ' } });
  await resultLifecycleApi.saveCorrection(request, scope, '8', 'correction:version', [], signal()); expect(request.mock.calls[1][0]).toMatch(/\/corrections\/8$/); expect(request.mock.calls[1][2]).toEqual({ method: 'PUT', body: { version: 'correction:version', entries: [] } });
  request.mockResolvedValue({ correction: { ...correction(), status: 'applied' } }); await resultLifecycleApi.correctionTransition(request, scope, '8', 'publish', 'reviewed:version', signal()); expect(request.mock.calls[2][2]).toEqual({ method: 'POST', body: { version: 'reviewed:version' } });
});

test('wrong scopes, correction IDs and malformed successful transitions are rejected', async () => {
  const request = vi.fn().mockResolvedValue({ result: { ...result(), competition_id: '9' } }); await expect(resultLifecycleApi.get(request, scope, signal())).rejects.toThrow('Invalid lifecycle response');
  request.mockResolvedValue({ correction: { ...correction(), id: '99' } }); await expect(resultLifecycleApi.correction(request, scope, '8', signal())).rejects.toThrow('Invalid correction response');
  request.mockResolvedValue({ result: result() }); await expect(resultLifecycleApi.transition(request, scope, 'publish', 'version', signal())).rejects.toThrow('Unexpected lifecycle transition');
});

test('public projection reads use the existing frozen snapshot endpoint and validate scope', async () => {
  const read = vi.fn().mockResolvedValue({ result: { competition_id: '1', category_id: '2', event_id: '3', event_name: 'Event', category_name: 'Category', publication_id: '9', published_at: 'now', winners: [{ position: 1, candidate_code: '001', name: 'Frozen name', unit: { id: '7', name: 'Frozen unit' }, madrasa: null }] } });
  expect((await resultLifecycleApi.published(read, scope, signal())).winners[0].candidate_code).toBe('001'); expect(read.mock.calls[0][0]).toBe('/api/competitions/1/categories/2/events/3/result');
  read.mockResolvedValue({ result: { competition_id: '9' } }); await expect(resultLifecycleApi.published(read, scope, signal())).rejects.toThrow('Invalid published projection');
});

test('review requires every configured position including zero-point keys and rejects ordinary duplicates', () => {
  const entries = result().entries;
  expect(reviewProblems(entries, ['1', '7'])).toContain('Missing required positions: 7.'); expect(reviewProblems(entries, [])).toContain('Configure at least one winning position before review.');
  expect(reviewProblems([...entries, { ...entries[0], candidate_code: '002', id: '9' }], ['1'])).toContain('Ordinary duplicate positions are not allowed.');
  expect(reviewProblems([{ ...entries[0], override_audit_id: '11' }, { ...entries[0], id: '9', candidate_code: '002', override_audit_id: '11' }], ['1'])).toEqual([]);
});
