import { StrictMode } from 'react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom';
import { AppRoutes } from '../App';

afterEach(cleanup);
beforeEach(() => { vi.spyOn(window, 'scrollTo').mockImplementation(() => {}); });
const competitions = [{ id: '1', name: 'Sargolsav 2026' }, { id: '2', name: 'Community Festival' }];
const categories = [{ id: '9', name: 'Custom junior group', sort_order: 1 }, { id: '4', name: 'Senior scholars', sort_order: 10 }];
const response = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body }) as Response;
function api(list = competitions) {
  return vi.fn(async (url: string) => url.includes('/leaderboard/') ? response({ leaderboard: [] }) : url.endsWith('/events') ? response({ category: { id: url.split('/').at(-2), name: 'Category' }, events: [] }) : url === '/api/competitions' ? response({ competitions: list }) :
    response({ competition: url.includes('/2/') ? competitions[1] : competitions[0], categories: url.includes('/2/') ? [] : categories }));
}
function Probe() {
  const location = useLocation();
  const navigate = useNavigate();
  return <><output data-testid="path">{location.pathname}</output><button onClick={() => navigate(-1)}>Browser back</button></>;
}
function setup(path = '/', fetcher = api()) {
  render(<StrictMode><MemoryRouter initialEntries={[path]}><AppRoutes fetcher={fetcher as typeof fetch} /><Probe /></MemoryRouter></StrictMode>);
  return { user: userEvent.setup(), fetcher };
}

test('home loads backend categories, canonical competition URL, and deduplicates StrictMode requests', async () => {
  const { fetcher } = setup('/', api([competitions[0]]));
  expect(screen.getByRole('status', { name: 'Loading competitions and categories' })).toBeTruthy();
  await screen.findByRole('link', { name: /Custom junior group/ });
  expect(screen.getByTestId('path').textContent).toBe('/competitions/1/results');
  expect(screen.getAllByRole('link', { name: /Explore category/ }).map((link) => link.textContent)).toEqual([
    expect.stringContaining('Custom junior group'), expect.stringContaining('Senior scholars'),
  ]);
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(screen.getByRole('link', { name: /Results$/ }).getAttribute('aria-current')).toBe('page');
});

test('category deep links, tabs and browser back preserve competition context and refresh event availability', async () => {
  const { user, fetcher } = setup();
  await user.click(await screen.findByRole('link', { name: /Senior scholars.*Explore/ }));
  expect(screen.getByTestId('path').textContent).toBe('/competitions/1/results/categories/4');
  expect(await screen.findByRole('heading', { name: 'Senior scholars' })).toBeTruthy();
  await user.click(screen.getByRole('link', { name: /Leaderboards$/ }));
  expect(await screen.findByRole('heading', { name: 'Overall unit rankings' })).toBeTruthy();
  expect(screen.getByTestId('path').textContent).toBe('/competitions/1/leaderboards');
  await user.click(screen.getByRole('button', { name: 'Browser back' }));
  expect(await screen.findByRole('heading', { name: 'Senior scholars' })).toBeTruthy();
  await screen.findByRole('heading', { name: 'Events are on the way' });
  expect(fetcher).toHaveBeenCalledTimes(5);
});

test('multiple competitions remain selectable, including a competition without categories', async () => {
  const { user } = setup();
  await user.click(await screen.findByRole('link', { name: 'Community Festival' }));
  expect(await screen.findByRole('heading', { name: 'Categories are on the way' })).toBeTruthy();
  expect(screen.getByTestId('path').textContent).toBe('/competitions/2/results');
  expect(screen.queryByRole('link', { name: /Custom junior group/ })).toBeNull();
  await user.click(screen.getByRole('link', { name: /Leaderboards$/ }));
  await user.click(screen.getByRole('link', { name: 'Sargolsav 2026' }));
  expect(screen.getByTestId('path').textContent).toBe('/competitions/1/leaderboards');
});

test('direct category and leaderboard URLs render without visiting home', async () => {
  setup('/competitions/1/results/categories/9');
  expect(await screen.findByRole('heading', { name: 'Custom junior group' })).toBeTruthy();
  cleanup();
  setup('/competitions/2/leaderboards');
  expect(await screen.findByRole('heading', { name: 'Overall unit rankings' })).toBeTruthy();
});

test('empty competitions and unknown routes have useful navigation', async () => {
  setup('/', api([]));
  expect(await screen.findByRole('heading', { name: 'No active competition' })).toBeTruthy();
  cleanup();
  setup('/missing');
  expect(screen.getByRole('heading', { name: 'Page not found' })).toBeTruthy();
});

test('network failures and malformed responses are safe and retryable', async () => {
  const fetcher = api();
  fetcher.mockRejectedValueOnce(new Error('private network detail'));
  const { user } = setup('/', fetcher);
  expect(await screen.findByRole('alert')).toBeTruthy();
  expect(document.body.textContent).not.toContain('private network detail');
  await user.click(screen.getByRole('button', { name: 'Try again' }));
  await screen.findByRole('link', { name: /Custom junior group/ });
  cleanup();
  setup('/', vi.fn(async () => response({ competitions: [{ id: 1 }] })));
  expect(await screen.findByRole('alert')).toBeTruthy();
});

test('failed category HTTP responses can be retried and unavailable scope is distinguished', async () => {
  const fetcher = api();
  const read = api();
  let failCategories = true;
  fetcher.mockImplementation(async (url) => {
    if (url.includes('/categories') && failCategories) {
      failCategories = false;
      return response({}, 503);
    }
    return read(url);
  });
  const { user } = setup('/competitions/1/results', fetcher);
  expect(await screen.findByRole('heading', { name: 'Unable to load this page' })).toBeTruthy();
  await user.click(screen.getByRole('button', { name: 'Try again' }));
  await screen.findByRole('link', { name: /Custom junior group/ });
  cleanup();
  setup('/competitions/99/results', vi.fn(async (url) => url === '/api/competitions' ? response({ competitions }) : response({}, 404)));
  expect(await screen.findByRole('heading', { name: 'Competition unavailable' })).toBeTruthy();
  cleanup();
  setup('/competitions/1/results/categories/99');
  expect(await screen.findByRole('heading', { name: 'Category not found' })).toBeTruthy();
});

test('late category response never replaces a newer competition screen', async () => {
  let finish!: (value: Response) => void;
  const fetcher = api();
  fetcher.mockImplementation(async (url) => url === '/api/competitions' ? response({ competitions }) : url.includes('/1/') ?
    new Promise<Response>((resolve) => { finish = resolve; }) : response({ competition: competitions[1], categories: [] }));
  const { user } = setup('/competitions/1/results', fetcher);
  await waitFor(() => expect(finish).toBeTypeOf('function'));
  await user.click(await screen.findByRole('link', { name: 'Community Festival' }));
  await screen.findByRole('heading', { name: 'Categories are on the way' });
  await act(async () => finish(response({ competition: competitions[0], categories })));
  expect(screen.getByRole('heading', { name: 'Community Festival' })).toBeTruthy();
  expect(screen.queryByRole('link', { name: /Custom junior group/ })).toBeNull();
});
