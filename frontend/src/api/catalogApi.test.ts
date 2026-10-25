import { expect, test, vi } from 'vitest';
import { categoriesApi, eventsApi } from './catalogApi';
import { AdminApiError } from './adminErrors';

const signal = () => new AbortController().signal;
test('returned scope and detail IDs are validated before use', async () => {
  const request = vi.fn().mockResolvedValue({ categories: [{ id: '2', competition_id: '9', name: 'Foreign', sort_order: 0 }] });
  await expect(categoriesApi(request, '1').list(signal())).rejects.toThrow('Invalid catalog response');
  request.mockResolvedValue({ events: [{ id: '2', competition_id: '1', category_id: '99', name: 'Foreign', sort_order: 0 }] });
  await expect(eventsApi(request, '1', '3').list(signal())).rejects.toThrow('Invalid catalog response');
  request.mockResolvedValue({ event: { id: '2', competition_id: '1', category_id: '3', name: 'Wrong ID', sort_order: 0 } });
  await expect(eventsApi(request, '1', '3').get('4', signal())).rejects.toThrow('Invalid catalog response');
});

test('bigint paths remain exact and invalid IDs never start a request', async () => {
  const request = vi.fn().mockResolvedValue({ category: { id: '9223372036854775807', competition_id: '1', name: 'Record', sort_order: 0 } });
  await categoriesApi(request, '1').get('9223372036854775807', signal());
  expect(request.mock.calls[0][0]).toBe('/api/admin/competitions/1/categories/9223372036854775807'); request.mockClear();
  await expect(categoriesApi(request, '1').get('01', signal())).rejects.toThrow('Invalid catalog ID');
  await expect(categoriesApi(request, '1').get('9223372036854775808', signal())).rejects.toThrow('Invalid catalog ID');
  expect(request).not.toHaveBeenCalled();
});

test('names, order bounds and empty updates are checked before transport', async () => {
  const request = vi.fn();
  await expect(categoriesApi(request, '1').save({ name: ' ' }, signal())).rejects.toThrow('Name is required');
  await expect(eventsApi(request, '1', '2').save({ name: 'Invalid\0name' }, signal())).rejects.toThrow('Name is required');
  await expect(categoriesApi(request, '1').save({ sort_order: -1 }, signal(), '2')).rejects.toThrow('Display order must');
  await expect(categoriesApi(request, '1').save({ sort_order: 2147483648 }, signal(), '2')).rejects.toThrow('Display order must');
  await expect(categoriesApi(request, '1').save({}, signal(), '2')).rejects.toThrow('Invalid catalog fields');
  expect(request).not.toHaveBeenCalled();
});

test('malformed sort orders cannot become editable defaults', async () => {
  const request = vi.fn().mockResolvedValue({ categories: [{ id: '2', competition_id: '1', name: 'Record', sort_order: '0' }] });
  await expect(categoriesApi(request, '1').list(signal())).rejects.toThrow('Invalid catalog response');
});

test('only deletion conflicts become dependency errors; duplicate names retain their server message', async () => {
  const request = vi.fn().mockRejectedValue(new AdminApiError(409, 'Event name already exists in this parent'));
  await expect(eventsApi(request, '1', '2').save({ name: 'Duplicate' }, signal())).rejects.toThrow('Event name already exists');
  await expect(eventsApi(request, '1', '2').remove('3', signal())).rejects.toThrow('including an empty draft');
});
