import { afterEach, expect, test, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom';
import { AppRoutes } from '../App';
import type { AuthClient, AuthUser } from '../types/auth';
import type { AdminCategory, AdminEvent } from '../types/adminCatalog';

afterEach(cleanup);
const reply = (body: unknown, status = 200) => ({ ok: status >= 200 && status < 300, status, json: vi.fn(async () => body) }) as unknown as Response;
const category = (id: string, competition_id: string, name: string, sort_order = 0): AdminCategory => ({ id, competition_id, name, sort_order });
const event = (id: string, competition_id: string, category_id: string, name: string, sort_order = 0): AdminEvent => ({ id, competition_id, category_id, name, sort_order });
const ordered = <T extends AdminCategory>(rows: T[]) => [...rows].sort((a, b) => a.sort_order - b.sort_order || (BigInt(a.id) < BigInt(b.id) ? -1 : 1));
function Probe() {
  const location = useLocation(); const navigate = useNavigate();
  return <><output data-testid="location">{location.pathname + location.search}</output><button onClick={() => void navigate(-1)}>Back</button><button onClick={() => void navigate(1)}>Forward</button></>;
}
function setup({ path = '/admin/categories?competition=1', empty = false, signedIn = true, override }: {
  path?: string; empty?: boolean; signedIn?: boolean;
  override?: (path: string, options: RequestInit) => Promise<Response | undefined>;
} = {}) {
  let categories = empty ? [] : [category('11', '1', 'Custom category', 10), category('12', '1', 'Empty category'), category('9007199254740993', '1', 'Later tie', 10), category('9007199254740992', '1', 'Earlier tie', 10), category('21', '2', 'Other competition category')];
  let events = empty ? [] : [event('111', '1', '11', 'Later event', 10), event('112', '1', '11', 'Earlier event'), event('211', '2', '21', 'Other competition event')];
  const currentUser: AuthUser = { uid: 'admin', email: 'admin@example.test', getIdToken: vi.fn(async (refresh) => refresh ? 'fresh' : 'opaque') };
  let listener: (user: AuthUser | null) => void;
  const client: AuthClient = {
    subscribe: (fn) => { listener = fn; queueMicrotask(() => fn(signedIn ? currentUser : null)); return () => {}; },
    signIn: vi.fn(async () => {}), signOut: vi.fn(async () => listener(null)),
  };
  const deletions: Response[] = [];
  const fetcher = vi.fn(async (url: string | URL | Request, options: RequestInit = {}) => {
    const path = String(url); const method = options.method ?? 'GET';
    if (path === '/api/admin/me') return reply({ uid: 'admin', email: currentUser.email, emailVerified: true, admin: true });
    const custom = await override?.(path, options); if (custom) return custom;
    if (path === '/api/admin/competitions') return reply({ competitions: [{ id: '1', name: 'First competition', code: 'C1', status: 'active' }, { id: '2', name: 'Second competition', code: 'C2', status: 'archived' }] });
    const segments = path.split('/'); const competitionId = segments[4]; const categoryId = segments[6]; const eventId = segments[8];
    const body = options.body ? JSON.parse(String(options.body)) : undefined;
    if (segments[7] === 'events') {
      if (!categories.some((row) => row.id === categoryId && row.competition_id === competitionId)) return reply({ error: 'Category not found' }, 404);
      if (method === 'POST') { const row = event('113', competitionId, categoryId, body.name, body.sort_order); events = [...events, row]; return reply({ event: row }, 201); }
      if (!eventId) return reply({ events: ordered(events.filter((row) => row.competition_id === competitionId && row.category_id === categoryId)) });
      const row = events.find((row) => row.id === eventId && row.competition_id === competitionId && row.category_id === categoryId);
      if (!row) return reply({ error: 'Event not found' }, 404);
      if (method === 'PATCH') { const saved = { ...row, ...body }; events = events.map((item) => item === row ? saved : item); return reply({ event: saved }); }
      if (method === 'DELETE') { events = events.filter((item) => item !== row); const response = reply(undefined, 204); deletions.push(response); return response; }
      return reply({ event: row });
    }
    if (segments[5] === 'categories') {
      if (method === 'POST') { const row = category('13', competitionId, body.name, body.sort_order); categories = [...categories, row]; return reply({ category: row }, 201); }
      if (!categoryId) return reply({ categories: ordered(categories.filter((row) => row.competition_id === competitionId)) });
      const row = categories.find((row) => row.id === categoryId && row.competition_id === competitionId);
      if (!row) return reply({ error: 'Category not found' }, 404);
      if (method === 'PATCH') { const saved = { ...row, ...body }; categories = categories.map((item) => item === row ? saved : item); return reply({ category: saved }); }
      if (method === 'DELETE') { categories = categories.filter((item) => item !== row); const response = reply(undefined, 204); deletions.push(response); return response; }
      return reply({ category: row });
    }
    return reply({ error: 'Not found' }, 404);
  });
  render(<MemoryRouter initialEntries={[path]}><AppRoutes client={client} fetcher={fetcher as typeof fetch} /><Probe /></MemoryRouter>);
  return { user: userEvent.setup(), fetcher, client, deletions,
    writes: () => fetcher.mock.calls.map(([path, options = {}]) => [path, options] as const).filter(([, options]) => options.method && options.method !== 'GET') };
}
const categoryPath = '/admin/categories?competition=1&category=11';
const eventPath = `${categoryPath}&event=111`;
const link = (name: string) => screen.getByRole('link', { name: new RegExp(`^${name} Order:`) });
async function enter(user: ReturnType<typeof userEvent.setup>, label: string, value: string) {
  const field = await screen.findByLabelText(label); await user.clear(field); if (value) await user.type(field, value); return field;
}

test('categories and events retain backend display order with bigint tie IDs', async () => {
  const { user } = setup();
  const list = await screen.findByRole('list', { name: 'Categories' });
  expect(within(list).getAllByRole('link').map((item) => item.textContent)).toEqual(['Empty category Order: 0', 'Custom category Order: 10', 'Earlier tie Order: 10', 'Later tie Order: 10']);
  expect(screen.queryByText('Other competition category')).toBeNull();
  await user.click(link('Custom category')); await screen.findByText('2 events');
  expect(within(screen.getByRole('list', { name: 'Events' })).getAllByRole('link').map((item) => item.textContent)).toEqual(['Earlier event Order: 0', 'Later event Order: 10']);
});

test('empty competitions support creating arbitrary category names and selecting the returned record', async () => {
  const { user, writes } = setup({ empty: true });
  await screen.findByRole('heading', { name: 'No categories yet' });
  await user.click(screen.getByRole('link', { name: 'New category' }));
  await enter(user, 'Category name', ' Bespoke category ');
  await user.click(screen.getByRole('button', { name: 'Create category' }));
  await screen.findByText('Category created.'); await screen.findByRole('heading', { name: 'No events yet' });
  expect(JSON.parse(String(writes()[0][1].body))).toEqual({ name: ' Bespoke category ', sort_order: 0 });
  expect(screen.getByTestId('location').textContent).toBe('/admin/categories?competition=1&category=13');
});

test('event creation keeps the category parent and refreshes list and count', async () => {
  const { user, writes } = setup({ path: '/admin/categories?competition=1&category=12' });
  await screen.findByText('0 events');
  await user.click(screen.getByRole('link', { name: 'New event' }));
  await enter(user, 'Event name', 'New event name'); await enter(user, 'Display order', '2147483647');
  await user.click(screen.getByRole('button', { name: 'Create event' }));
  await screen.findByText('Event created.'); await screen.findByText('1 event');
  await screen.findByRole('heading', { name: 'New event name' });
  expect(writes()[0][0]).toBe('/api/admin/competitions/1/categories/12/events');
  expect(JSON.parse(String(writes()[0][1].body))).toEqual({ name: 'New event name', sort_order: 2147483647 });
  expect(screen.getByTestId('location').textContent).toBe('/admin/categories?competition=1&category=12&event=113');
});

test.each(['category', 'event'] as const)('%s details and name edits use only changed fields and reread the list', async (kind) => {
  const { user, writes, fetcher } = setup({ path: kind === 'category' ? categoryPath : eventPath });
  await user.click(await screen.findByRole('link', { name: `Edit ${kind}` }));
  await enter(user, kind === 'category' ? 'Category name' : 'Event name', 'Renamed record');
  await user.click(screen.getByRole('button', { name: `Save ${kind}` }));
  await screen.findByText(kind === 'category' ? 'Category saved.' : 'Event saved.');
  await screen.findByRole('heading', { name: 'Renamed record' }); expect(link('Renamed record')).toBeTruthy();
  expect(JSON.parse(String(writes()[0][1].body))).toEqual({ name: 'Renamed record' });
  const listPath = `/api/admin/competitions/1/categories${kind === 'event' ? '/11/events' : ''}`;
  expect(fetcher.mock.calls.filter(([path]) => path === listPath)).toHaveLength(2);
});

test.each(['category', 'event'] as const)('%s order-only changes move records and preserve names on the server', async (kind) => {
  const { user, writes } = setup({ path: kind === 'category' ? categoryPath : eventPath });
  await user.click(await screen.findByRole('link', { name: `Edit ${kind}` }));
  expect((screen.getByLabelText('Display order') as HTMLInputElement).value).toBe('10');
  await enter(user, 'Display order', '0'); await user.click(screen.getByRole('button', { name: `Save ${kind}` }));
  await screen.findByText(kind === 'category' ? 'Category saved.' : 'Event saved.');
  await screen.findByText('Display order: 0');
  expect(JSON.parse(String(writes()[0][1].body))).toEqual({ sort_order: 0 });
  const links = within(screen.getByRole('list', { name: kind === 'category' ? 'Categories' : 'Events' })).getAllByRole('link');
  expect(links[0].textContent).toBe(kind === 'category' ? 'Custom category Order: 0' : 'Later event Order: 0');
});

test.each(['category', 'event'] as const)('%s deletion requires confirmation and consumes empty 204 without parsing', async (kind) => {
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
  const { user, writes, deletions } = setup({ path: kind === 'category' ? '/admin/categories?competition=1&category=12' : eventPath });
  await user.click(await screen.findByRole('button', { name: `Delete ${kind}` })); expect(writes()).toHaveLength(0);
  confirm.mockReturnValue(true); await user.click(screen.getByRole('button', { name: `Delete ${kind}` }));
  await screen.findByText(kind === 'category' ? 'Category deleted.' : 'Event deleted.');
  await waitFor(() => expect(screen.queryByRole('link', { name: new RegExp(`^${kind === 'category' ? 'Empty category' : 'Later event'} Order:`) })).toBeNull());
  expect(deletions[0].json).not.toHaveBeenCalled();
  expect(writes()[0][1]).toEqual(expect.objectContaining({ method: 'DELETE', headers: { Authorization: 'Bearer opaque', Accept: 'application/json' } }));
});

test.each(['category', 'event'] as const)('%s protected deletion keeps the record and explains actual dependencies', async (kind) => {
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  const { user } = setup({ path: kind === 'category' ? categoryPath : eventPath, override: async (_path, options) => options.method === 'DELETE' ? reply({ error: 'Referenced by dependent records' }, 409) : undefined });
  await user.click(await screen.findByRole('button', { name: `Delete ${kind}` }));
  const alert = await screen.findByRole('alert');
  expect(alert.textContent).toContain(kind === 'category' ? 'events or is referenced by candidates' : 'including an empty draft');
  expect(screen.getByRole('heading', { name: kind === 'category' ? 'Custom category' : 'Later event' })).toBeTruthy();
});

test.each(['category', 'event'] as const)('%s required names and duplicate errors preserve form values', async (kind) => {
  const { user, writes } = setup({ path: categoryPath, override: async (_path, options) => options.method === 'POST' ? reply({ error: `${kind} name already exists in this parent` }, 409) : undefined });
  await user.click(await screen.findByRole('link', { name: `New ${kind}` }));
  await user.click(screen.getByRole('button', { name: `Create ${kind}` }));
  expect((await screen.findByRole('alert')).textContent).toContain('Name is required'); expect(writes()).toHaveLength(0);
  const field = await enter(user, kind === 'category' ? 'Category name' : 'Event name', 'Duplicate');
  await user.click(screen.getByRole('button', { name: `Create ${kind}` }));
  expect((await screen.findByRole('alert')).textContent).toContain('name already exists'); expect((field as HTMLInputElement).value).toBe('Duplicate');
});

test.each(['-1', '1.5', '2147483648', ''])('invalid display order %s retains the edit without submitting', async (value) => {
  const { user, writes } = setup({ path: `${categoryPath}&catalogForm=category` });
  const field = await enter(user, 'Display order', value);
  await user.click(screen.getByRole('button', { name: 'Save category' }));
  expect((await screen.findByRole('alert')).textContent).toContain('Display order must'); expect(writes()).toHaveLength(0);
  expect((field as HTMLInputElement).value).toBe(value);
});

test('server order validation failures preserve name and order edits', async () => {
  const { user } = setup({ path: `${eventPath}&catalogForm=event`, override: async (_path, options) => options.method === 'PATCH' ? reply({ error: 'sort_order must be an integer between 0 and 2147483647' }, 400) : undefined });
  await enter(user, 'Event name', 'Preserved event'); const order = await enter(user, 'Display order', '8');
  await user.click(screen.getByRole('button', { name: 'Save event' }));
  expect((await screen.findByRole('alert')).textContent).toContain('sort_order must');
  expect((order as HTMLInputElement).value).toBe('8'); expect((screen.getByLabelText('Event name') as HTMLInputElement).value).toBe('Preserved event');
});

test.each(['category', 'event'] as const)('%s creation blocks repeated submit events while pending', async (kind) => {
  let done!: (response: Response) => void;
  const { user, writes } = setup({ path: categoryPath, override: async (_path, options) => options.method === 'POST' ? new Promise((resolve) => { done = resolve; }) : undefined });
  await user.click(await screen.findByRole('link', { name: `New ${kind}` }));
  await enter(user, kind === 'category' ? 'Category name' : 'Event name', 'Created');
  await user.dblClick(screen.getByRole('button', { name: `Create ${kind}` }));
  await waitFor(() => expect(writes()).toHaveLength(1)); expect(screen.getByRole('button', { name: 'Saving…' }).matches(':disabled')).toBe(true);
  fireEvent.submit(screen.getByRole('form', { name: `Create ${kind}` })); expect(writes()).toHaveLength(1);
  await act(async () => done(reply(kind === 'category' ? { category: category('13', '1', 'Created') } : { event: event('113', '1', '11', 'Created') }, 201)));
  await screen.findByText(kind === 'category' ? 'Category created.' : 'Event created.');
});

test('pending deletion prevents repeated requests', async () => {
  vi.spyOn(window, 'confirm').mockReturnValue(true); let done!: (response: Response) => void;
  const { user, writes } = setup({ path: eventPath, override: async (_path, options) => options.method === 'DELETE' ? new Promise((resolve) => { done = resolve; }) : undefined });
  await user.dblClick(await screen.findByRole('button', { name: 'Delete event' }));
  await waitFor(() => expect(writes()).toHaveLength(1)); expect(screen.getByRole('button', { name: 'Deleting…' }).matches(':disabled')).toBe(true);
  await act(async () => done(reply(undefined, 204))); await screen.findByText('Event deleted.');
});

test('direct links and browser Back/Forward restore category and event selection', async () => {
  const { user } = setup({ path: eventPath }); await screen.findByRole('heading', { name: 'Later event' });
  await user.click(link('Empty category')); await screen.findByText('0 events'); expect(screen.getByTestId('location').textContent).toBe('/admin/categories?competition=1&category=12');
  await user.click(screen.getByRole('button', { name: 'Back' })); await screen.findByRole('heading', { name: 'Later event' });
  await user.click(screen.getByRole('button', { name: 'Forward' })); await screen.findByText('0 events');
});

test('competition switching clears catalog selections and never requests the old category in the new scope', async () => {
  const { user, fetcher } = setup({ path: `${eventPath}&catalogForm=event` }); await screen.findByLabelText('Event name');
  await user.selectOptions(screen.getByRole('combobox'), '2'); await screen.findByRole('link', { name: 'Other competition category Order: 0' });
  expect(screen.getByTestId('location').textContent).toBe('/admin/categories?competition=2');
  expect(fetcher.mock.calls.some(([path]) => String(path).includes('/competitions/2/categories/11'))).toBe(false);
  expect(screen.queryByText('Custom category')).toBeNull();
});

test('dirty catalog forms reuse link, selection, Cancel and unload warnings', async () => {
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
  const { user } = setup({ path: `${eventPath}&catalogForm=event` }); const input = await enter(user, 'Display order', '7');
  expect(screen.queryByRole('button', { name: 'Delete category' })).toBeNull();
  await user.click(screen.getByRole('link', { name: 'Cancel' })); await user.click(link('Empty category'));
  await user.selectOptions(screen.getByRole('combobox'), '2'); expect(confirm).toHaveBeenCalledTimes(3); expect((input as HTMLInputElement).value).toBe('7');
  const unload = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(unload); expect(unload.defaultPrevented).toBe(true);
  confirm.mockReturnValue(true); await user.click(screen.getByRole('link', { name: 'Cancel' })); await screen.findByRole('heading', { name: 'Later event' });
});

test.each([401, 403])('catalog mutation denial %s removes protected forms', async (status) => {
  const { user, writes } = setup({ path: `${categoryPath}&catalogForm=category`, override: async (_path, options) => options.method === 'PATCH' ? reply({}, status) : undefined });
  await enter(user, 'Category name', 'Changed'); await user.click(screen.getByRole('button', { name: 'Save category' }));
  await screen.findByRole('heading', { name: status === 401 ? 'Sign in' : 'Access denied' }); expect(screen.queryByLabelText('Category name')).toBeNull();
  expect(writes()).toHaveLength(status === 401 ? 2 : 1);
});

test('signed-out catalog direct links never request admin APIs', async () => {
  const { fetcher } = setup({ path: eventPath, signedIn: false }); await screen.findByRole('heading', { name: 'Sign in' }); expect(fetcher).not.toHaveBeenCalled();
});

test('missing competition selection does not fetch catalog data', async () => {
  const { fetcher } = setup({ path: '/admin/categories' }); await screen.findByText('Select a competition above to manage its categories and events.');
  expect(fetcher).toHaveBeenCalledTimes(2); expect(screen.queryByRole('link', { name: 'New category' })).toBeNull();
});

test.each([
  ['categories', '/admin/categories?competition=1', '/api/admin/competitions/1/categories', 'Loading categories…'],
  ['category', categoryPath, '/api/admin/competitions/1/categories/11', 'Loading category details…'],
  ['events', categoryPath, '/api/admin/competitions/1/categories/11/events', 'Loading events…'],
  ['event', eventPath, '/api/admin/competitions/1/categories/11/events/111', 'Loading event details…'],
])('%s loading errors expose retry without pretending the data is empty', async (kind, page, target, loading) => {
  let first = true; let done!: (response: Response) => void;
  const { user } = setup({ path: page, override: async (path) => { if (path === target && first) { first = false; return new Promise((resolve) => { done = resolve; }); } } });
  await screen.findByText(loading); await waitFor(() => expect(done).toBeTypeOf('function'));
  await act(async () => done(reply({}, 500))); await screen.findByRole('alert');
  await user.click(screen.getByRole('button', { name: 'Try again' }));
  if (kind === 'categories' || kind === 'events') await screen.findByRole('list', { name: kind === 'categories' ? 'Categories' : 'Events' });
  else await screen.findByRole('link', { name: `Edit ${kind}` });
  expect(screen.queryByRole('alert')).toBeNull();
});

test('late categories from another competition do not appear after selection changes', async () => {
  let done!: (response: Response) => void;
  const { user } = setup({ override: async (path) => path === '/api/admin/competitions/1/categories' ? new Promise((resolve) => { done = resolve; }) : undefined });
  await screen.findByText('Loading categories…'); await waitFor(() => expect(done).toBeTypeOf('function'));
  await user.selectOptions(screen.getByRole('combobox'), '2'); await screen.findByRole('link', { name: 'Other competition category Order: 0' });
  await act(async () => done(reply({ categories: [category('11', '1', 'Late private category')] })));
  expect(screen.queryByText('Late private category')).toBeNull();
});

test('late events cannot overwrite the newly selected category', async () => {
  let done!: (response: Response) => void;
  const { user } = setup({ path: categoryPath, override: async (path) => path === '/api/admin/competitions/1/categories/11/events' ? new Promise((resolve) => { done = resolve; }) : undefined });
  await screen.findByText('Loading events…'); await waitFor(() => expect(done).toBeTypeOf('function'));
  await user.click(link('Empty category')); await screen.findByText('0 events');
  await act(async () => done(reply({ events: [event('111', '1', '11', 'Late private event')] })));
  expect(screen.queryByText('Late private event')).toBeNull(); expect(screen.getByRole('heading', { name: 'No events yet' })).toBeTruthy();
});

test('late mutation responses cannot update another competition URL or show a false success', async () => {
  vi.spyOn(window, 'confirm').mockReturnValue(true); let done!: (response: Response) => void;
  const { user } = setup({ path: `${categoryPath}&catalogForm=new-event`, override: async (_path, options) => options.method === 'POST' ? new Promise((resolve) => { done = resolve; }) : undefined });
  await enter(user, 'Event name', 'Old scope'); await user.click(screen.getByRole('button', { name: 'Create event' }));
  await waitFor(() => expect(done).toBeTypeOf('function'));
  await user.selectOptions(screen.getByRole('combobox'), '2'); await screen.findByRole('link', { name: 'Other competition category Order: 0' });
  await act(async () => done(reply({ event: event('113', '1', '11', 'Old scope') }, 201)));
  expect(screen.queryByText('Event created.')).toBeNull(); expect(screen.getByTestId('location').textContent).toBe('/admin/categories?competition=2');
});

test('wrong-parent direct event links do not expose another category event', async () => {
  const { fetcher } = setup({ path: '/admin/categories?competition=1&category=12&event=111' });
  await screen.findByRole('alert'); expect(screen.queryByRole('heading', { name: 'Later event' })).toBeNull();
  expect(fetcher).toHaveBeenCalledWith('/api/admin/competitions/1/categories/12/events/111', expect.anything());
});

test('foreign successful detail payloads are rejected before editing', async () => {
  setup({ path: eventPath, override: async (path) => path.endsWith('/events/111') ? reply({ event: event('111', '1', '12', 'Foreign payload') }) : undefined });
  await screen.findByRole('alert'); expect(screen.queryByText('Foreign payload')).toBeNull(); expect(screen.queryByRole('link', { name: 'Edit event' })).toBeNull();
});

test.each(['category', 'event'] as const)('%s server failures preserve inputs and never expose private transport errors', async (kind) => {
  const { user } = setup({ path: `${kind === 'category' ? categoryPath : eventPath}&catalogForm=${kind}`, override: async (_path, options) => { if (options.method === 'PATCH') throw new Error('private transport detail'); return undefined; } });
  const label = kind === 'category' ? 'Category name' : 'Event name'; await enter(user, label, 'Preserved');
  await user.click(screen.getByRole('button', { name: `Save ${kind}` })); await screen.findByRole('alert');
  expect((screen.getByLabelText(label) as HTMLInputElement).value).toBe('Preserved'); expect(document.body.textContent).not.toContain('private transport detail');
});

test('a formatting-only order edit never sends an empty PATCH', async () => {
  const { user, writes } = setup({ path: `${categoryPath}&catalogForm=category` });
  await enter(user, 'Display order', '010'); await user.click(screen.getByRole('button', { name: 'Save category' }));
  expect(writes()).toHaveLength(0); expect((screen.getByLabelText('Display order') as HTMLInputElement).value).toBe('10');
});

test('catalog read denial removes the protected screen', async () => {
  setup({ override: async (path) => path.endsWith('/categories') ? reply({}, 403) : undefined });
  await screen.findByRole('heading', { name: 'Access denied' }); expect(screen.queryByRole('link', { name: 'New category' })).toBeNull();
});
