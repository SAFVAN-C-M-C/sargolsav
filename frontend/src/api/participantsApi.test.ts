import { expect, test, vi } from 'vitest';
import { madrassasApi, unitsApi } from './participantsApi';
import { AdminApiError } from './adminErrors';

const signal = () => new AbortController().signal;
test('scoped lists reject wrong competition or parent IDs even on successful HTTP responses', async () => {
  const request = vi.fn().mockResolvedValue({ units: [{ id: '2', competition_id: '9', name: 'Foreign' }] });
  await expect(unitsApi(request, '1').list(signal())).rejects.toThrow('Invalid participant response');
  request.mockResolvedValue({ madrasas: [{ id: '2', competition_id: '1', unit_id: '99', name: 'Foreign' }] });
  await expect(madrassasApi(request, '1', '3').list(signal())).rejects.toThrow('Invalid participant response');
});

test('detail IDs and canonical bigint paths are checked without rounding IDs', async () => {
  const request = vi.fn().mockResolvedValue({ unit: { id: '5', competition_id: '9223372036854775807', name: 'Unit' } });
  await expect(unitsApi(request, '9223372036854775807').get('4', signal())).rejects.toThrow('Invalid participant response');
  expect(request.mock.calls[0][0]).toBe('/api/admin/competitions/9223372036854775807/units/4');
  request.mockClear();
  await expect(unitsApi(request, '1').get('01', signal())).rejects.toThrow('Invalid participant ID');
  await expect(unitsApi(request, '1').get('9223372036854775808', signal())).rejects.toThrow('Invalid participant ID');
  expect(request).not.toHaveBeenCalled();
});

test('blank and null-character names fail before transport', async () => {
  const request = vi.fn();
  await expect(unitsApi(request, '1').save('  ', signal())).rejects.toThrow('Name is required');
  await expect(madrassasApi(request, '1', '2').save('Invalid\0name', signal())).rejects.toThrow('Name is required');
  expect(request).not.toHaveBeenCalled();
});

test('only deletion conflicts become dependency feedback; duplicate-name errors remain intact', async () => {
  const request = vi.fn().mockRejectedValue(new AdminApiError(409, 'Madrassa name already exists in this parent'));
  await expect(madrassasApi(request, '1', '2').save('Name', signal())).rejects.toThrow('Madrassa name already exists');
  await expect(madrassasApi(request, '1', '2').remove('3', signal())).rejects.toThrow('referenced by candidates or results');
});
