import { expect, test } from 'vitest';
import { meaningfulOverrideReason, sharedGroups } from './sharedPositions';
import { winnerPayload } from './winnerEntry';
import type { WinnerRow } from '../types/adminResults';

test.each(['', '!!! ???', 'Judgesconfirmed', 'tie now', 'a'.repeat(1001) + ' second', 'Judges confirm\0ties'])('rejects nonmeaningful override reason %j', (reason) => {
  expect(meaningfulOverrideReason(reason)).toBe(false);
});
test.each(['Judges confirmed equal marks', '  Judges confirmed  ', 'വിധികർത്താക്കൾ തുല്യമാർക്ക് സ്ഥിരീകരിച്ചു'])('accepts meaningful Unicode reasons %j', (reason) => {
  expect(meaningfulOverrideReason(reason)).toBe(true);
});
test('sharing requires explicit validation opt-in and never permits duplicate candidates or unresolved identities', () => {
  const row: WinnerRow = { key: '1', candidate_code: '001', name: 'Winner', unit_id: '4', madrasa_id: '', position: '1', resolution: 'saved' };
  const second = { ...row, key: '2', candidate_code: '1' };
  expect(() => winnerPayload([row, second], ['1'], ['4'])).toThrow('Duplicate positions');
  expect(winnerPayload([row, second], ['1'], ['4'], true).map((entry) => entry.candidate_code)).toEqual(['001', '1']);
  expect(() => winnerPayload([row, { ...second, candidate_code: '001' }], ['1'], ['4'], true)).toThrow('Duplicate candidate');
  expect(() => winnerPayload([{ ...row, resolution: 'unchecked' }], ['1'], ['4'], true)).toThrow('look up');
  expect(sharedGroups([{ position: 7 }, { position: 1 }, { position: 7 }, { position: 1 }, { position: 12 }]).map((group) => group.position)).toEqual(['1', '7']);
});
