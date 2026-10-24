import { StrictMode } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { createPublicResource } from '../utils/publicResource';
import { usePollingResource } from './publicResource';
import type { PublicResource } from '../types/resource';
import { PublicApiError, PublicPayloadError } from '../api/publicErrors';
import { RefreshStatus } from '../components/common/RefreshStatus';

let visibility: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  vi.useFakeTimers();
  visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); });
const advance = async (ms = 0) => { await act(async () => { await vi.advanceTimersByTimeAsync(ms); }); };
function show(entry: PublicResource<string>) {
  return render(<StrictMode><Probe entry={entry} /></StrictMode>);
}
function Probe({ entry }: { entry: PublicResource<string> }) {
  const state = usePollingResource(entry);
  return <><div>{state.status === 'ready' ? state.data : state.status}</div><RefreshStatus state={state} retry={entry.retry} /></>;
}
function visible(value: DocumentVisibilityState) {
  visibility.mockReturnValue(value);
  act(() => { document.dispatchEvent(new Event('visibilitychange')); });
}

test('StrictMode has one initial request and one timer; unchanged refreshes retain the snapshot', async () => {
  const read = vi.fn(async () => 'Current data');
  const entry = createPublicResource(read);
  const view = show(entry);
  await advance();
  expect(read).toHaveBeenCalledTimes(1);
  expect(vi.getTimerCount()).toBe(1);
  const previous = entry.getSnapshot();
  await advance(14999);
  expect(read).toHaveBeenCalledTimes(1);
  await advance(1);
  expect(read).toHaveBeenCalledTimes(2);
  expect(entry.getSnapshot()).toBe(previous);
  expect(vi.getTimerCount()).toBe(1);
  view.unmount();
  expect(vi.getTimerCount()).toBe(0);
});

test('slow requests never overlap timers or repeated manual refreshes and retain old data', async () => {
  let finish!: (value: string) => void;
  const read = vi.fn(async () => 'Previous data');
  const entry = createPublicResource(read);
  show(entry);
  await advance();
  read.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
  await advance(15000);
  expect(screen.getByText('Previous data')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Refresh live data' }));
  fireEvent.click(screen.getByRole('button', { name: 'Refresh live data' }));
  await advance(120000);
  expect(read).toHaveBeenCalledTimes(2);
  expect(vi.getTimerCount()).toBe(0);
  await act(async () => finish('New data'));
  expect(screen.getByText('New data')).toBeTruthy();
  expect(vi.getTimerCount()).toBe(1);
});

test('multiple consumers share one loop until the last consumer unmounts', async () => {
  const read = vi.fn(async () => 'Shared data');
  const entry = createPublicResource(read);
  const view = render(<StrictMode><Probe key="one" entry={entry} /><Probe key="two" entry={entry} /></StrictMode>);
  await advance();
  expect(read).toHaveBeenCalledTimes(1);
  expect(vi.getTimerCount()).toBe(1);
  view.rerender(<StrictMode><Probe key="one" entry={entry} /></StrictMode>);
  await advance(15000);
  expect(read).toHaveBeenCalledTimes(2);
  expect(vi.getTimerCount()).toBe(1);
  view.unmount();
  expect(vi.getTimerCount()).toBe(0);
});

test('an initial transient failure retries automatically without a rapid loop', async () => {
  const read = vi.fn().mockRejectedValueOnce(new PublicApiError(503)).mockResolvedValue('Recovered data');
  show(createPublicResource<string>(read));
  await advance();
  expect(screen.getByText('error')).toBeTruthy();
  await advance(14999);
  expect(read).toHaveBeenCalledTimes(1);
  await advance(1);
  expect(screen.getByText('Recovered data')).toBeTruthy();
  expect(read).toHaveBeenCalledTimes(2);
});

test('hidden tabs perform no initial polling or scheduled reads and restore promptly once', async () => {
  visibility.mockReturnValue('hidden');
  const read = vi.fn(async () => 'Visible data');
  show(createPublicResource(read));
  await advance(120000);
  expect(read).not.toHaveBeenCalled();
  visible('visible');
  await advance();
  expect(read).toHaveBeenCalledTimes(1);
  visible('hidden');
  await advance(120000);
  expect(read).toHaveBeenCalledTimes(1);
  expect(vi.getTimerCount()).toBe(0);
  visible('visible');
  await advance();
  expect(read).toHaveBeenCalledTimes(2);
  visible('visible');
  await advance();
  expect(read).toHaveBeenCalledTimes(2);
});

test('visibility restoration during a pending request queues just one fresh read after it settles', async () => {
  let finish!: (value: string) => void;
  const read = vi.fn(() => new Promise<string>((resolve) => { finish = resolve; }));
  show(createPublicResource(read));
  visible('hidden');
  visible('visible');
  visible('visible');
  expect(read).toHaveBeenCalledTimes(1);
  read.mockResolvedValue('Returned data');
  await act(async () => finish('Earlier data'));
  await advance();
  expect(read).toHaveBeenCalledTimes(2);
  expect(screen.getByText('Returned data')).toBeTruthy();
  expect(vi.getTimerCount()).toBe(1);
});

test('transient failures retain data, back off at 15/30/60 seconds, then reset after success', async () => {
  const read = vi.fn().mockResolvedValueOnce('Saved data')
    .mockRejectedValueOnce(new Error('network'))
    .mockRejectedValueOnce(new PublicApiError(503))
    .mockRejectedValueOnce(new PublicApiError(429))
    .mockRejectedValueOnce(new PublicApiError(408))
    .mockResolvedValue('Recovered data');
  const entry = createPublicResource<string>(read);
  show(entry);
  await advance();
  await advance(15000);
  expect(screen.getByText('Saved data')).toBeTruthy();
  expect(screen.getByRole('status').textContent).toContain('Retrying updates');
  await advance(14999); expect(read).toHaveBeenCalledTimes(2);
  await advance(1); expect(read).toHaveBeenCalledTimes(3);
  await advance(29999); expect(read).toHaveBeenCalledTimes(3);
  await advance(1); expect(read).toHaveBeenCalledTimes(4);
  await advance(59999); expect(read).toHaveBeenCalledTimes(4);
  await advance(1); expect(read).toHaveBeenCalledTimes(5);
  await advance(59999); expect(read).toHaveBeenCalledTimes(5);
  await advance(1);
  expect(screen.getByText('Recovered data')).toBeTruthy();
  expect(screen.getByRole('status').textContent).toContain('Updates every 15 seconds');
  await advance(15000); expect(read).toHaveBeenCalledTimes(7);
});

test('initial invalid IDs, missing resources and malformed payloads stop timers and visibility retries', async () => {
  for (const error of [new PublicApiError(400), new PublicApiError(404), new PublicPayloadError()]) {
    const read = vi.fn(async () => { throw error; });
    const entry = createPublicResource(read);
    const view = show(entry);
    await advance(300000);
    expect(read).toHaveBeenCalledTimes(1);
    expect(entry.getSnapshot().status).toBe('error');
    expect(vi.getTimerCount()).toBe(0);
    visible('hidden'); visible('visible'); await advance();
    expect(read).toHaveBeenCalledTimes(1);
    view.unmount();
  }
});

test('a background 404 preserves saved data, stops polling, and allows deliberate manual recovery', async () => {
  const read = vi.fn().mockResolvedValueOnce('Saved data').mockRejectedValueOnce(new PublicApiError(404)).mockResolvedValue('Recovered data');
  show(createPublicResource<string>(read));
  await advance(15000);
  expect(screen.getByText('Saved data')).toBeTruthy();
  expect(screen.getByRole('status').textContent).toContain('Updates stopped');
  await advance(300000);
  expect(read).toHaveBeenCalledTimes(2);
  expect(vi.getTimerCount()).toBe(0);
  fireEvent.click(screen.getByRole('button', { name: 'Refresh live data' }));
  await advance();
  expect(screen.getByText('Recovered data')).toBeTruthy();
  expect(vi.getTimerCount()).toBe(1);
});

test('unmount removes visibility handlers, timers and ignores a pending completion', async () => {
  let finish!: (value: string) => void;
  const add = vi.spyOn(document, 'addEventListener');
  const remove = vi.spyOn(document, 'removeEventListener');
  const read = vi.fn(() => new Promise<string>((resolve) => { finish = resolve; }));
  const entry = createPublicResource(read);
  const view = show(entry);
  view.unmount();
  const previous = entry.getSnapshot();
  await act(async () => finish('Late data'));
  visible('hidden'); visible('visible');
  await advance(300000);
  expect(read).toHaveBeenCalledTimes(1);
  expect(entry.getSnapshot()).toBe(previous);
  expect(vi.getTimerCount()).toBe(0);
  expect(add.mock.calls.filter(([name]) => name === 'visibilitychange')).toEqual(remove.mock.calls.filter(([name]) => name === 'visibilitychange'));
});

test('changing resources ignores the earlier response while the new view retains its own scheduler', async () => {
  let finish!: (value: string) => void;
  const old = createPublicResource(() => new Promise<string>((resolve) => { finish = resolve; }));
  const current = createPublicResource(async () => 'Current category');
  const view = show(old);
  view.rerender(<StrictMode><Probe entry={current} /></StrictMode>);
  await advance();
  await act(async () => finish('Old category'));
  expect(screen.getByText('Current category')).toBeTruthy();
  expect(screen.queryByText('Old category')).toBeNull();
  expect(old.getSnapshot().status).toBe('loading');
  expect(vi.getTimerCount()).toBe(1);
});
