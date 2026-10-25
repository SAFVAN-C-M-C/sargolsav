import type { LifecycleEntry } from '../types/resultLifecycle';

export function reviewProblems(entries: LifecycleEntry[], positions: string[]): string[] {
  const problems: string[] = [];
  if (positions.length === 0) problems.push('Configure at least one winning position before review.');
  const missing = positions.filter((position) => !entries.some((entry) => String(entry.position) === position));
  if (missing.length) problems.push(`Missing required positions: ${missing.join(', ')}.`);
  if (entries.some((entry) => !positions.includes(String(entry.position)))) problems.push('Some winners have unconfigured positions.');
  if (new Set(entries.map((entry) => entry.candidate_code)).size !== entries.length) problems.push('Duplicate candidate IDs are not allowed.');
  if (entries.some((entry) => entries.filter((other) => other.position === entry.position).length > 1 && entry.override_audit_id === null)) problems.push('Ordinary duplicate positions are not allowed.');
  if (entries.some((entry) => !entry.name.trim() || !entry.unit_name.trim() || (entry.madrasa_id !== null && !entry.madrasa_name?.trim()))) problems.push('Winner identity or affiliation metadata is incomplete.');
  return problems;
}
