import { StrictMode } from 'react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom';
import { AppRoutes } from '../App';
import type { PublishedResult } from './publicApi';

afterEach(cleanup);
beforeEach(() => { vi.spyOn(window, 'scrollTo').mockImplementation(() => {}); });
const competition = { id: '1', name: 'Festival 2026' };
const category = { id: '2', name: 'Junior', sort_order: 0 };
const events = [
  { id: '12', name: 'Storytelling', sort_order: 5, status: 'unpublished' },
  { id: '11', name: 'Recitation', sort_order: 0, status: 'published' },
  { id: '10', name: 'Poetry', sort_order: 5, status: 'published' },
];
const published: PublishedResult = {
  competition_id: '1', category_id: '2', event_id: '11', event_name: 'Recitation', category_name: 'Junior',
  publication_id: '8', published_at: '2026-10-24T12:00:00.000Z', winners: [
    { position: 3, candidate_code: '004', name: 'Third Winner', unit: { name: 'Unit Four' } },
    { position: 1, candidate_code: '002', name: 'Shared First B', unit: { name: 'Unit Two' }, madrasa: { name: 'Madrassa Two' } },
    { position: 2, candidate_code: '003', name: 'Second Winner', unit: { name: 'Unit Three' }, madrasa: null },
    { position: 1, candidate_code: '001', name: 'Shared First A', unit: { name: 'Unit One' }, madrasa: null },
  ],
};
const base = '/competitions/1/results/categories/2';
const apiBase = '/api/competitions/1/categories/2/events';
const response = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body }) as Response;
function api() {
  return vi.fn<(url: string, options?: RequestInit) => Promise<Response>>(async (url) => {
    if (url === '/api/competitions') return response({ competitions: [competition] });
    if (url === '/api/competitions/1/categories') return response({ competition, categories: [category] });
    if (url.endsWith('/events')) return response({ category, events });
    if (url.endsWith('/12/result/status')) return response({ availability: { category_id: '2', event_id: '12', status: 'unpublished' } });
    if (url.endsWith('/12/result')) return response({}, 404);
    if (url.endsWith('/11/result')) return response({ result: published });
    return response({}, 404);
  });
}
function Probe() {
  const location = useLocation();
  const navigate = useNavigate();
  return <><output data-testid="path">{location.pathname}</output><button onClick={() => navigate(-1)}>Browser back</button></>;
}
function setup(path = base, fetcher = api()) {
  const client = { subscribe: vi.fn(() => () => {}), signIn: vi.fn(), signOut: vi.fn() };
  render(<StrictMode><MemoryRouter initialEntries={[path]}><AppRoutes fetcher={fetcher as typeof fetch} client={client} /><Probe /></MemoryRouter></StrictMode>);
  return { user: userEvent.setup(), fetcher, client };
}

test('all events are ordered by display order then ID, with public statuses and no authentication', async () => {
  const { fetcher, client } = setup();
  const list = await screen.findByRole('region', { name: 'Category events' });
  expect(within(list).getAllByRole('link').map((link) => link.textContent)).toEqual([
    expect.stringContaining('RecitationPublished'), expect.stringContaining('PoetryPublished'), expect.stringContaining('StorytellingAwaiting Result'),
  ]);
  expect(fetcher).toHaveBeenCalledTimes(3);
  expect(fetcher).toHaveBeenCalledWith(apiBase, { headers: { Accept: 'application/json' }, cache: 'no-store' });
  expect(client.subscribe).not.toHaveBeenCalled();
  expect(document.body.textContent).not.toContain('Shared First');
});

test('event links, keyboard activation and browser back preserve category and competition URLs', async () => {
  const { user } = setup();
  (await screen.findByRole('link', { name: /Storytelling/ })).focus();
  await user.keyboard('{Enter}');
  expect(await screen.findByRole('heading', { name: 'Awaiting Result' })).toBeTruthy();
  expect(screen.getByTestId('path').textContent).toBe(`${base}/events/12`);
  expect(screen.getByRole('link', { name: '← All events' }).getAttribute('href')).toBe(base);
  await user.click(screen.getByRole('button', { name: 'Browser back' }));
  expect(await screen.findByRole('link', { name: /Recitation/ })).toBeTruthy();
  expect(screen.getByTestId('path').textContent).toBe(base);
  expect(document.activeElement?.id).toBe('public-content');
});

test('direct result links display all winner details in deterministic position/code order, including shared first place', async () => {
  const { fetcher, client } = setup(`${base}/events/11`);
  const first = await screen.findByRole('region', { name: '1st place' });
  expect(within(first).getAllByRole('heading', { level: 5 }).map((heading) => heading.textContent)).toEqual(['Shared First A', 'Shared First B']);
  expect(within(first).getByText('Shared position · 2 winners')).toBeTruthy();
  expect(within(screen.getByRole('region', { name: 'Recitation' })).getAllByRole('region')
    .map((region) => region.getAttribute('aria-label')).filter(Boolean)).toEqual(['1st place', '2nd place', '3rd place']);
  expect(screen.getByText('001')).toBeTruthy();
  expect(screen.getByText('Unit One')).toBeTruthy();
  expect(screen.getByText('Madrassa Two')).toBeTruthy();
  expect(screen.getAllByText('Madrassa', { exact: true })).toHaveLength(1);
  expect(screen.getByRole('region', { name: '2nd place' })).toBeTruthy();
  expect(screen.getByRole('region', { name: '3rd place' })).toBeTruthy();
  expect(fetcher.mock.calls.filter(([url]) => url.endsWith('/11/result'))).toHaveLength(1);
  expect(client.subscribe).not.toHaveBeenCalled();
});

test('absent candidate, unit and Madrassa metadata is rendered safely, with arbitrary positions', async () => {
  const fetcher = api();
  const original = api();
  fetcher.mockImplementation((url, options) => url.endsWith('/11/result') ? Promise.resolve(response({ result: { ...published,
    winners: [{ position: 11, name: null, candidate_code: null, unit: null, madrasa: null }] } })) : original(url, options));
  setup(`${base}/events/11`, fetcher);
  expect(await screen.findByText('Candidate name unavailable')).toBeTruthy();
  expect(screen.getByText('Unit unavailable')).toBeTruthy();
  expect(screen.getByText('Unavailable', { exact: true })).toBeTruthy();
  expect(screen.getByRole('region', { name: '11th place' })).toBeTruthy();
  expect(screen.queryByText('Madrassa', { exact: true })).toBeNull();
});

test('empty categories, nonexistent events and malformed event IDs have recovery states', async () => {
  const fetcher = api();
  const original = api();
  fetcher.mockImplementation((url, options) => url.endsWith('/events') ? Promise.resolve(response({ category, events: [] })) : original(url, options));
  setup(base, fetcher);
  expect(await screen.findByRole('heading', { name: 'Events are on the way' })).toBeTruthy();
  for (const id of ['99', '01', 'invalid', '9223372036854775808']) {
    cleanup();
    setup(`${base}/events/${id}`);
    expect(await screen.findByRole('heading', { name: 'Event not found' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Browse events' }).getAttribute('href')).toBe(base);
  }
});

test('event loading and API failure can recover through retry', async () => {
  let finish!: (value: Response) => void;
  const fetcher = api();
  const original = api();
  let first = true;
  fetcher.mockImplementation((url, options) => {
    if (url.endsWith('/events') && first) { first = false; return new Promise((resolve) => { finish = resolve; }); }
    return original(url, options);
  });
  const { user } = setup(base, fetcher);
  expect(await screen.findByRole('status', { name: 'Loading events' })).toBeTruthy();
  await act(async () => finish(response({}, 503)));
  await user.click(await screen.findByRole('button', { name: 'Try again' }));
  expect(await screen.findByRole('link', { name: /Recitation/ })).toBeTruthy();
});

test('result loading, failed networks and malformed/cross-scope payloads never reveal stale winners', async () => {
  let finish!: (value: Response) => void;
  const fetcher = api();
  const original = api();
  let first = true;
  fetcher.mockImplementation((url, options) => {
    if (url.endsWith('/11/result') && first) { first = false; return new Promise((resolve) => { finish = resolve; }); }
    return original(url, options);
  });
  const { user } = setup(`${base}/events/11`, fetcher);
  expect(await screen.findByRole('status', { name: 'Loading published result' })).toBeTruthy();
  await act(async () => finish(response({ result: { ...published, category_id: 'other' } })));
  expect(await screen.findByRole('alert')).toBeTruthy();
  expect(screen.queryByText('Shared First A')).toBeNull();
  await user.click(screen.getByRole('button', { name: 'Try again' }));
  expect(await screen.findByText('Shared First A')).toBeTruthy();
  cleanup();
  fetcher.mockImplementation((url, options) => url.endsWith('/11/result') ? Promise.reject(new Error('private network details')) : original(url, options));
  setup(`${base}/events/11`, fetcher);
  expect(await screen.findByRole('alert')).toBeTruthy();
  expect(document.body.textContent).not.toContain('private network details');
});

test('awaiting is shown only for verified unpublished availability; missing scope and status errors remain distinct', async () => {
  for (const status of [404, 503]) {
    const fetcher = api();
    const original = api();
    fetcher.mockImplementation((url, options) => url.endsWith('/12/result/status') ? Promise.resolve(response({}, status)) : original(url, options));
    setup(`${base}/events/12`, fetcher);
    expect(await screen.findByRole('heading', { name: status === 404 ? 'Event unavailable' : 'Unable to load this page' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Awaiting Result' })).toBeNull();
    cleanup();
  }
});

test('reopening an event fetches the newly published correction instead of cached historical winners', async () => {
  const fetcher = api();
  const original = api();
  let corrected = false;
  fetcher.mockImplementation((url, options) => url.endsWith('/11/result') && corrected ? Promise.resolve(response({ result: {
    ...published, publication_id: '9', winners: [{ position: 1, name: 'Corrected Winner', candidate_code: '099', unit: { name: 'Unit One' } }],
  } })) : original(url, options));
  const { user } = setup(`${base}/events/11`, fetcher);
  await screen.findByText('Shared First A');
  corrected = true;
  await user.click(screen.getByRole('link', { name: '← All events' }));
  await user.click(await screen.findByRole('link', { name: /Recitation/ }));
  expect(await screen.findByText('Corrected Winner')).toBeTruthy();
  expect(screen.queryByText('Shared First A')).toBeNull();
  expect(fetcher.mock.calls.filter(([url]) => url.endsWith('/11/result'))).toHaveLength(2);
});

test('a late result cannot overwrite navigation to another event', async () => {
  let finish!: (value: Response) => void;
  const fetcher = api();
  const original = api();
  fetcher.mockImplementation((url, options) => url.endsWith('/11/result') ? new Promise((resolve) => { finish = resolve; }) : original(url, options));
  const { user } = setup(base, fetcher);
  await user.click(await screen.findByRole('link', { name: /Recitation/ }));
  await waitFor(() => expect(finish).toBeTypeOf('function'));
  await user.click(screen.getByRole('link', { name: '← All events' }));
  await user.click(await screen.findByRole('link', { name: /Storytelling/ }));
  await screen.findByRole('heading', { name: 'Awaiting Result' });
  await act(async () => finish(response({ result: published })));
  expect(screen.getByTestId('path').textContent).toBe(`${base}/events/12`);
  expect(screen.queryByText('Shared First A')).toBeNull();
});

test('publication between result and availability reads is fetched once and shown as published', async () => {
  const fetcher = api();
  const original = api();
  let first = true;
  fetcher.mockImplementation((url, options) => {
    if (url.endsWith('/11/result') && first) { first = false; return Promise.resolve(response({}, 404)); }
    if (url.endsWith('/11/result/status')) return Promise.resolve(response({ availability: { category_id: '2', event_id: '11', status: 'published' } }));
    return original(url, options);
  });
  setup(`${base}/events/11`, fetcher);
  expect(await screen.findByText('Shared First A')).toBeTruthy();
  expect(screen.queryByRole('heading', { name: 'Awaiting Result' })).toBeNull();
  expect(fetcher.mock.calls.filter(([url]) => url.endsWith('/11/result'))).toHaveLength(2);
});
