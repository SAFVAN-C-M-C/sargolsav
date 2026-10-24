import { StrictMode } from 'react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom';
import { AppRoutes } from '../../App';
import type { CandidateRanking, UnitRanking } from '../../types/public';

afterEach(cleanup);
beforeEach(() => { vi.spyOn(window, 'scrollTo').mockImplementation(() => {}); });
const competition = { id: '1', name: 'Festival 2026' };
const other = { id: '2', name: 'Other festival' };
const categories = [
  { id: '2', name: 'Junior', sort_order: 0 }, { id: '3', name: 'Senior', sort_order: 1 },
  { id: '4', name: 'Empty category', sort_order: 2 }, { id: '5', name: 'No published wins', sort_order: 3 },
];
const units: UnitRanking[] = [
  { unit_id: '7', unit_name: 'Zulu Unit', rank: '1', total_points: '18014398509481982', winning_entries: '2', position_wins: { '1': '2' } },
  { unit_id: '8', unit_name: 'Alpha Unit', rank: '1', total_points: '18014398509481982', winning_entries: '9007199254740993', position_wins: { '2': '9007199254740993' } },
  { unit_id: '9', unit_name: 'Zero Unit', rank: '3', total_points: '0', winning_entries: '0', position_wins: {} },
];
const candidates: CandidateRanking[] = [
  { ...units[0], candidate_id: '20', candidate_code: '001', candidate_name: 'Zahra First', madrasa_id: '10', madrasa_name: 'Madrassa One' },
  { ...units[0], candidate_id: '21', candidate_code: '1', candidate_name: 'Ameen Shared', madrasa_id: null, madrasa_name: null },
  { ...units[2], candidate_id: '22', candidate_code: '0010', candidate_name: 'Zero Candidate', madrasa_id: null, madrasa_name: null },
];
const base = '/competitions/1/leaderboards';
const endpoint = '/api/competitions/1/leaderboard/units';
const juniorUnits = '/api/competitions/1/categories/2/leaderboard/units';
const response = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body }) as Response;
function api() {
  return vi.fn<(url: string, options?: RequestInit) => Promise<Response>>(async (url) => {
    if (url === '/api/competitions') return response({ competitions: [competition, other] });
    if (url === '/api/competitions/1/categories') return response({ competition, categories });
    if (url === '/api/competitions/2/categories') return response({ competition: other, categories: [] });
    if (url.includes('/categories/4/leaderboard/')) return response({ leaderboard: [] });
    if (url.includes('/categories/5/leaderboard/')) return response({ leaderboard: units.map((row) => ({ ...row, rank: '1', total_points: '0', winning_entries: '0', position_wins: {} })) });
    if (url.includes('/categories/3/leaderboard/')) return response({ leaderboard: url.endsWith('/candidates') ? [{ ...candidates[0], candidate_name: 'Senior Candidate' }] : [{ ...units[0], unit_name: 'Senior Unit' }] });
    if (url.endsWith('/leaderboard/candidates')) return response({ leaderboard: candidates });
    if (url.endsWith('/leaderboard/units')) return response({ leaderboard: units });
    return response({}, 404);
  });
}
function Probe() {
  const location = useLocation();
  const navigate = useNavigate();
  return <><output data-testid="path">{location.pathname}</output>
    <button onClick={() => navigate(-1)}>Browser back</button><button onClick={() => navigate(1)}>Browser forward</button></>;
}
function setup(path = base, fetcher = api()) {
  const client = { subscribe: vi.fn(() => () => {}), signIn: vi.fn(), signOut: vi.fn() };
  render(<StrictMode><MemoryRouter initialEntries={[path]}><AppRoutes client={client} fetcher={fetcher as typeof fetch} /><Probe /></MemoryRouter></StrictMode>);
  return { user: userEvent.setup(), fetcher, client };
}
async function rankingRows(kind = 'Unit rankings') {
  return within(await screen.findByRole('list', { name: kind })).getAllByRole('listitem');
}

test('Leaderboards entry defaults to overall units, preserves backend ordering, exact totals, shared ranks and zero units', async () => {
  const { fetcher, client } = setup('/leaderboards');
  const rows = await rankingRows();
  expect(screen.getByTestId('path').textContent).toBe(base);
  expect(rows.map((row) => within(row).getByRole('heading').textContent)).toEqual(['Zulu Unit', 'Alpha Unit', 'Zero Unit']);
  expect(rows.map((row) => row.querySelector('.ranking-rank')?.textContent)).toEqual(['Rank 1', 'Rank 1', 'Rank 3']);
  expect(rows.map((row) => within(row).getByText(/^(18014398509481982|0)$/).textContent)).toEqual(['18014398509481982', '18014398509481982', '0']);
  expect(within(rows[0]).getByText(/Shared rank/)).toBeTruthy();
  expect(within(rows[2]).getByText('0 winning entries')).toBeTruthy();
  expect(fetcher.mock.calls.filter(([url]) => url === endpoint)).toHaveLength(1);
  expect(fetcher).toHaveBeenCalledWith(endpoint, { headers: { Accept: 'application/json' }, cache: 'no-store' });
  expect(fetcher.mock.calls.some(([url]) => url.endsWith('/candidates'))).toBe(false);
  expect(client.subscribe).not.toHaveBeenCalled();
});

test('category unit direct links show exact win counts and expandable achievements', async () => {
  const { user, fetcher } = setup(`${base}/categories/2/units`);
  const rows = await rankingRows();
  expect(screen.getByRole('heading', { name: 'Junior · Unit rankings' })).toBeTruthy();
  expect(screen.getByRole('link', { name: 'Units' }).getAttribute('aria-current')).toBe('page');
  expect(within(rows[1]).getByText('9007199254740993 winning entries')).toBeTruthy();
  await user.click(within(rows[1]).getByText('Position wins'));
  expect(within(rows[1]).getByText('Position 2')).toBeTruthy();
  expect(within(rows[1]).getByText('9007199254740993 wins')).toBeTruthy();
  expect(fetcher.mock.calls.filter(([url]) => url === juniorUnits)).toHaveLength(1);
});

test('candidate direct links retain names, external codes, units, optional Madrassa, shared ranks and zero candidates', async () => {
  setup(`${base}/categories/2/candidates`);
  const rows = await rankingRows('Candidate rankings');
  expect(rows.map((row) => within(row).getByRole('heading').textContent)).toEqual(['Zahra First', 'Ameen Shared', 'Zero Candidate']);
  expect(within(rows[0]).getByText('001')).toBeTruthy();
  expect(within(rows[1]).getByText('1', { selector: 'bdi' })).toBeTruthy();
  expect(within(rows[0]).getByText('Zulu Unit')).toBeTruthy();
  expect(within(rows[0]).getByText('Madrassa One')).toBeTruthy();
  expect(within(rows[1]).queryByText('Madrassa', { exact: true })).toBeNull();
  expect(within(rows[2]).getByText('0', { exact: true })).toBeTruthy();
  expect(within(rows[1]).getByText(/Shared rank/)).toBeTruthy();
});

test('category and type selectors use scoped URLs, retain the selected type, and support back and forward', async () => {
  const { user } = setup();
  await rankingRows();
  await user.selectOptions(screen.getByLabelText('View competition or category'), '2');
  await rankingRows();
  expect(screen.getByTestId('path').textContent).toBe(`${base}/categories/2/units`);
  (screen.getByRole('link', { name: 'Candidates' })).focus();
  await user.keyboard('{Enter}');
  await screen.findByRole('heading', { name: 'Zahra First' });
  await user.selectOptions(screen.getByLabelText('View competition or category'), '3');
  await screen.findByRole('heading', { name: 'Senior Candidate' });
  expect(screen.getByTestId('path').textContent).toBe(`${base}/categories/3/candidates`);
  expect(screen.queryByRole('heading', { name: 'Zahra First' })).toBeNull();
  await user.selectOptions(screen.getByLabelText('View competition or category'), '');
  await rankingRows();
  expect(screen.getByTestId('path').textContent).toBe(base);
  await user.click(screen.getByRole('button', { name: 'Browser back' }));
  await screen.findByRole('heading', { name: 'Senior Candidate' });
  await user.click(screen.getByRole('button', { name: 'Browser forward' }));
  await rankingRows();
  expect(screen.getByTestId('path').textContent).toBe(base);
});

test('competition switching resets category scope and overall rankings work without categories', async () => {
  const { user, fetcher } = setup(`${base}/categories/2/candidates`);
  await rankingRows('Candidate rankings');
  await user.click(screen.getByRole('link', { name: 'Other festival' }));
  await rankingRows();
  expect(screen.getByTestId('path').textContent).toBe('/competitions/2/leaderboards');
  expect(screen.queryByRole('link', { name: 'Candidates' })).toBeNull();
  expect(fetcher).toHaveBeenCalledWith('/api/competitions/2/leaderboard/units', expect.anything());
});

test('categories without published results keep all zero-point participants and shared backend ranks', async () => {
  setup(`${base}/categories/5/units`);
  const rows = await rankingRows();
  expect(rows).toHaveLength(3);
  expect(rows.every((row) => row.textContent?.includes('0 winning entries'))).toBe(true);
  expect(screen.getByText(/No published wins for these participants yet/)).toBeTruthy();
  expect(screen.queryByRole('heading', { name: 'No units to display' })).toBeNull();
});

test('empty overall, category unit and candidate leaderboards have distinct useful states', async () => {
  const fetcher = api();
  const original = api();
  fetcher.mockImplementation((url, options) => url === endpoint ? Promise.resolve(response({ leaderboard: [] })) : original(url, options));
  setup(base, fetcher);
  expect(await screen.findByRole('heading', { name: 'No units to display' })).toBeTruthy();
  cleanup();
  setup(`${base}/categories/4/units`);
  expect(await screen.findByRole('heading', { name: 'No units to display' })).toBeTruthy();
  cleanup();
  setup(`${base}/categories/4/candidates`);
  expect(await screen.findByRole('heading', { name: 'No candidates to display' })).toBeTruthy();
});

test('loading and HTTP failures hide rankings and recover with explicit retry', async () => {
  let finish!: (value: Response) => void;
  const fetcher = api();
  const original = api();
  let first = true;
  fetcher.mockImplementation((url, options) => {
    if (url === endpoint && first) { first = false; return new Promise((resolve) => { finish = resolve; }); }
    return original(url, options);
  });
  const { user } = setup(base, fetcher);
  expect(await screen.findByRole('status', { name: 'Loading leaderboard' })).toBeTruthy();
  expect(screen.queryByRole('list', { name: 'Unit rankings' })).toBeNull();
  await act(async () => finish(response({}, 503)));
  await user.click(await screen.findByRole('button', { name: 'Try again' }));
  await rankingRows();
});

test('network and malformed numeric responses show safe errors instead of rounding or guessing scores', async () => {
  const original = api();
  for (const bad of [response({ leaderboard: [{ ...units[0], total_points: 9007199254740992 }] }),
    response({ leaderboard: [{ ...units[0], rank: 1 }] }), response({ leaderboard: [{ ...units[0], position_wins: { '1': 2 } }] })]) {
    const fetcher = api();
    fetcher.mockImplementation((url, options) => url === endpoint ? Promise.resolve(bad) : original(url, options));
    setup(base, fetcher);
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.queryByRole('list', { name: 'Unit rankings' })).toBeNull();
    cleanup();
  }
  const fetcher = api();
  fetcher.mockImplementation((url, options) => url === endpoint ? Promise.reject(new Error('private network details')) : original(url, options));
  setup(base, fetcher);
  expect(await screen.findByRole('alert')).toBeTruthy();
  expect(document.body.textContent).not.toContain('private network details');
});

test('invalid and unavailable competition/category scopes never display unrelated rankings', async () => {
  for (const id of ['99', '01', 'invalid', '9223372036854775808']) {
    const { fetcher } = setup(`${base}/categories/${id}/candidates`);
    expect(await screen.findByRole('heading', { name: 'Category not found' })).toBeTruthy();
    expect(fetcher.mock.calls.some(([url]) => url.includes('/leaderboard/'))).toBe(false);
    cleanup();
  }
  const original = api();
  for (const status of [400, 404]) {
    const fetcher = api();
    fetcher.mockImplementation((url, options) => url === juniorUnits ? Promise.resolve(response({}, status)) : original(url, options));
    setup(`${base}/categories/2/units`, fetcher);
    expect(await screen.findByRole('heading', { name: 'Leaderboard unavailable' })).toBeTruthy();
    cleanup();
  }
  setup('/competitions/invalid/leaderboards');
  expect(await screen.findByRole('heading', { name: 'Competition unavailable' })).toBeTruthy();
});

test('late responses cannot replace newer category selections', async () => {
  let finish!: (value: Response) => void;
  const fetcher = api();
  const original = api();
  fetcher.mockImplementation((url, options) => url === juniorUnits ? new Promise((resolve) => { finish = resolve; }) : original(url, options));
  const { user } = setup(`${base}/categories/2/units`, fetcher);
  await waitFor(() => expect(finish).toBeTypeOf('function'));
  await user.selectOptions(screen.getByLabelText('View competition or category'), '3');
  await screen.findByRole('heading', { name: 'Senior Unit' });
  await act(async () => finish(response({ leaderboard: units })));
  expect(screen.getByTestId('path').textContent).toBe(`${base}/categories/3/units`);
  expect(screen.queryByRole('heading', { name: 'Zulu Unit' })).toBeNull();
});

test('reopening standings requests a fresh snapshot without duplicate StrictMode requests', async () => {
  const fetcher = api();
  const original = api();
  let changed = false;
  fetcher.mockImplementation((url, options) => url === endpoint && changed ? Promise.resolve(response({ leaderboard: [{ ...units[0], total_points: '42' }] })) : original(url, options));
  const { user } = setup(base, fetcher);
  await rankingRows();
  changed = true;
  await user.selectOptions(screen.getByLabelText('View competition or category'), '2');
  await rankingRows();
  await user.selectOptions(screen.getByLabelText('View competition or category'), '');
  const rows = await rankingRows();
  expect(within(rows[0]).getByText('42')).toBeTruthy();
  expect(fetcher.mock.calls.filter(([url]) => url === endpoint)).toHaveLength(2);
});
