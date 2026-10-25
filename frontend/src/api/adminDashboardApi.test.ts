import { expect, test, vi } from 'vitest';
import { loadCompetitions, loadOverview } from './adminDashboardApi';

test('overview sums every nested parent without losing concurrent counts', async () => {
  const parents = Array.from({ length: 9 }, (_, index) => ({ id: String(index + 1), name: `Parent ${index}` }));
  let inFlight = 0;
  let maximum = 0;
  const request = vi.fn(async (path: string) => {
    if (path.endsWith('/units')) return { units: parents };
    if (path.endsWith('/categories')) return { categories: parents };
    inFlight++;
    maximum = Math.max(maximum, inFlight);
    await new Promise((resolve) => setTimeout(resolve, 1));
    inFlight--;
    return path.endsWith('/events') ? { events: parents.slice(0, 2) } : { madrasas: parents.slice(0, 3) };
  });
  expect(await loadOverview(request, '9223372036854775807', new AbortController().signal)).toEqual({ units: 9, categories: 9, madrasas: 27, events: 18 });
  expect(maximum).toBeLessThanOrEqual(8);
  expect(request).toHaveBeenCalledTimes(20);
  expect(request.mock.calls.every(([path]) => path.startsWith('/api/admin/competitions/9223372036854775807/'))).toBe(true);
});

test('malformed lists fail rather than displaying fabricated zero counts', async () => {
  await expect(loadOverview(async () => ({}), '1', new AbortController().signal)).rejects.toThrow('Invalid admin response');
  await expect(loadCompetitions(async () => ({ competitions: [{ id: '1', name: 'Competition', code: '26', status: 'unknown' }] }), new AbortController().signal)).rejects.toThrow('Invalid competition response');
});

test('cancelled overview does not start nested requests', async () => {
  const controller = new AbortController();
  const request = vi.fn(async (path: string) => {
    controller.abort();
    return path.endsWith('/units') ? { units: [{ id: '2', name: 'Unit' }] } : { categories: [] };
  });
  await expect(loadOverview(request, '1', controller.signal)).rejects.toThrow();
  expect(request).toHaveBeenCalledTimes(2);
});
