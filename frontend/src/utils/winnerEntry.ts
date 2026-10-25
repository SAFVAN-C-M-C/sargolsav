import type { ResultDraft, WinnerPayload, WinnerRow } from '../types/adminResults';

export function draftRows(draft: ResultDraft): WinnerRow[] {
  return draft.entries.map((entry) => ({ key: `saved-${entry.id}`, candidate_code: entry.candidate_code, name: entry.name, unit_id: entry.unit_id, madrasa_id: entry.madrasa_id ?? '', position: String(entry.position), resolution: 'saved' }));
}
export const winnerSnapshot = (rows: WinnerRow[]) => JSON.stringify(rows.map(({ candidate_code, name, unit_id, madrasa_id, position }) => ({ candidate_code, name, unit_id, madrasa_id, position })));
export function winnerPayload(rows: WinnerRow[], positions: string[], unitIds: string[]): WinnerPayload[] {
  const codes = new Set<string>(); const used = new Set<string>();
  return rows.map((row, index) => {
    const prefix = `Winner ${index + 1}: `;
    if (!row.candidate_code.trim() || row.candidate_code.includes('\0')) throw new Error(prefix + 'external candidate ID is required.');
    if (codes.has(row.candidate_code)) throw new Error('Duplicate candidate IDs are not allowed.'); codes.add(row.candidate_code);
    if (!positions.includes(row.position)) throw new Error(prefix + 'select a configured winning position.');
    if (used.has(row.position)) throw new Error('Duplicate positions are not allowed. Shared positions are unavailable.'); used.add(row.position);
    if (row.resolution === 'unchecked') throw new Error(prefix + 'look up the current candidate ID before saving.');
    if (row.resolution === 'conflict') throw new Error(prefix + 'resolve the candidate identity or category conflict before saving.');
    if (!row.name.trim() || row.name.includes('\0')) throw new Error(prefix + 'candidate name is required.');
    if (!unitIds.includes(row.unit_id)) throw new Error(prefix + 'select a registered unit in this competition.');
    return { candidate_code: row.candidate_code, name: row.name, unit_id: row.unit_id, madrasa_id: row.madrasa_id || null, position: Number(row.position) };
  });
}
