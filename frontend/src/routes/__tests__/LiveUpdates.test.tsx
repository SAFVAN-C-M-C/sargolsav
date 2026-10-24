import { StrictMode } from 'react';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { AppRoutes } from '../../App';

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); });
const advance = async (ms = 0) => { await act(async () => { await vi.advanceTimersByTimeAsync(ms); }); };
const response = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body }) as Response;
const base = '/competitions/1/results/categories/2';
function fixture() {
  const state = { published: false, corrected: false, score: '0', fail: false };
  const competition = { id: '1', name: 'Festival' };
  const category = { id: '2', name: 'Junior', sort_order: 0 };
  const fetcher = vi.fn<(url: string, options?: RequestInit) => Promise<Response>>(async (url) => {
    if (url === '/api/competitions') return response({ competitions: [competition] });
    if (url === '/api/competitions/1/categories') return response({ competition, categories: [category] });
    if (state.fail) return response({}, 503);
    if (url.endsWith('/events')) return response({ category, events: [{ id: '11', name: 'Recitation', sort_order: 0, status: state.published ? 'published' : 'unpublished' }] });
    if (url.endsWith('/result/status')) return response({ availability: { event_id: '11', category_id: '2', status: state.published ? 'published' : 'unpublished' } });
    if (url.endsWith('/result')) return state.published ? response({ result: {
      competition_id: '1', category_id: '2', event_id: '11', category_name: 'Junior', event_name: 'Recitation',
      publication_id: state.corrected ? '9' : '8', published_at: '2026-10-24T12:00:00Z', winners: [
        { position: 1, name: state.corrected ? 'Corrected winner' : 'Original winner', candidate_code: '001', unit: { name: 'Unit A' }, madrasa: null },
      ],
    } }) : response({}, 404);
    if (url.includes('/leaderboard/')) return response({ leaderboard: ['7', '8'].map((id) => ({
      unit_id: id, unit_name: `Unit ${id}`, rank: '1', total_points: state.score, winning_entries: '1', position_wins: { '1': '1' },
      ...(url.endsWith('/candidates') ? { candidate_id: id, candidate_name: `Candidate ${id}`, candidate_code: `00${id}`, madrasa_id: null, madrasa_name: null } : {}),
    })) });
    return response({}, 404);
  });
  return { state, fetcher };
}
function Location() { return <output data-testid="path">{useLocation().pathname}</output>; }
function setup(path: string, fetcher: ReturnType<typeof fixture>['fetcher']) {
  const client = { subscribe: vi.fn(() => () => {}), signIn: vi.fn(), signOut: vi.fn() };
  const view = render(<StrictMode><MemoryRouter initialEntries={[path]}><AppRoutes client={client} fetcher={fetcher as typeof fetch} /><Location /></MemoryRouter></StrictMode>);
  return { ...view, client };
}

test('event availability updates automatically while static metadata is fetched only once', async () => {
  const { state, fetcher } = fixture();
  const { client } = setup(base, fetcher);
  await advance();
  expect(screen.getByRole('link', { name: /Recitation.*Awaiting Result/ })).toBeTruthy();
  state.published = true;
  await advance(15000);
  expect(screen.getByRole('link', { name: /Recitation.*Published/ })).toBeTruthy();
  expect(fetcher.mock.calls.filter(([url]) => url.endsWith('/events'))).toHaveLength(2);
  expect(fetcher.mock.calls.filter(([url]) => url === '/api/competitions')).toHaveLength(1);
  expect(fetcher.mock.calls.filter(([url]) => url === '/api/competitions/1/categories')).toHaveLength(1);
  expect(client.subscribe).not.toHaveBeenCalled();
});

test('awaiting results use lightweight status polls, then publications and corrections replace winners automatically', async () => {
  const { state, fetcher } = fixture();
  setup(`${base}/events/11`, fetcher);
  await advance();
  expect(screen.getByRole('heading', { name: 'Awaiting Result' })).toBeTruthy();
  await advance(15000);
  expect(fetcher.mock.calls.filter(([url]) => url.endsWith('/result'))).toHaveLength(1);
  expect(fetcher.mock.calls.filter(([url]) => url.endsWith('/result/status'))).toHaveLength(2);
  state.published = true;
  await advance(15000);
  expect(screen.getByText('Original winner')).toBeTruthy();
  state.corrected = true;
  await advance(15000);
  expect(screen.getByText('Corrected winner')).toBeTruthy();
  expect(screen.queryByText('Original winner')).toBeNull();
  expect(fetcher.mock.calls.filter(([url]) => url.endsWith('/events'))).toHaveLength(1);
  expect(fetcher.mock.calls.filter(([url]) => url.endsWith('/result/status'))).toHaveLength(3);
  expect(screen.getByTestId('path').textContent).toBe(`${base}/events/11`);
});

test('all leaderboard types update exact strings/shared ranks while preserving disclosures, focus and scroll', async () => {
  for (const suffix of ['', '/categories/2/units', '/categories/2/candidates']) {
    const { state, fetcher } = fixture();
    setup(`/competitions/1/leaderboards${suffix}`, fetcher);
    await advance();
    const listName = suffix.endsWith('candidates') ? 'Candidate rankings' : 'Unit rankings';
    const rows = within(screen.getByRole('list', { name: listName })).getAllByRole('listitem');
    const summary = within(rows[0]).getByText('Position wins');
    fireEvent.click(summary);
    const disclosure = summary.closest('details')!;
    disclosure.open = true;
    summary.focus();
    const scrolled = vi.mocked(window.scrollTo).mock.calls.length;
    state.score = '18014398509481982';
    await advance(15000);
    expect(screen.getAllByText('18014398509481982')).toHaveLength(2);
    expect(disclosure.open).toBe(true);
    expect(document.activeElement).toBe(summary);
    expect(vi.mocked(window.scrollTo).mock.calls.length).toBe(scrolled);
    expect(screen.getAllByText(/Shared rank/)).toHaveLength(2);
    expect(fetcher.mock.calls.filter(([url]) => url.includes('/leaderboard/'))).toHaveLength(2);
    cleanup();
    expect(vi.getTimerCount()).toBe(0);
  }
});

test('background errors retain rows and interaction state until automatic recovery', async () => {
  const { state, fetcher } = fixture();
  setup('/competitions/1/leaderboards', fetcher);
  await advance();
  const previous = screen.getByRole('heading', { name: 'Unit 7' });
  state.fail = true;
  await advance(15000);
  expect(screen.getByRole('heading', { name: 'Unit 7' })).toBe(previous);
  expect(screen.getByText('Showing saved data. Retrying updates.')).toBeTruthy();
  expect(screen.queryByRole('status', { name: 'Loading leaderboard' })).toBeNull();
  state.fail = false;
  state.score = '999';
  await advance(15000);
  expect(screen.getAllByText('999')).toHaveLength(2);
  expect(screen.queryByText('Showing saved data. Retrying updates.')).toBeNull();
});

test('navigating from results to leaderboards stops unrelated polling and preserves public navigation', async () => {
  const { fetcher } = fixture();
  setup(base, fetcher);
  await advance();
  fireEvent.click(screen.getByRole('link', { name: 'Leaderboards' }));
  await advance();
  await advance(45000);
  expect(fetcher.mock.calls.filter(([url]) => url.endsWith('/events'))).toHaveLength(1);
  expect(fetcher.mock.calls.filter(([url]) => url.endsWith('/leaderboard/units'))).toHaveLength(4);
  expect(screen.getByTestId('path').textContent).toBe('/competitions/1/leaderboards');
});
