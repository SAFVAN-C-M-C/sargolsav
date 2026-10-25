// Keep the UI aligned with the existing backend meaningfulOverrideReason contract.
export function meaningfulOverrideReason(value: string): boolean {
  return !value.includes('\0') && value.trim().length <= 1000 &&
    (value.match(/[\p{L}\p{N}]/gu)?.length ?? 0) >= 10 &&
    value.trim().split(/\s+/u).filter((word) => /[\p{L}\p{N}]/u.test(word)).length >= 2;
}

export function sharedGroups<T extends { position: number | string }>(entries: T[]): { position: string; winners: T[] }[] {
  const positions = [...new Set(entries.map((entry) => String(entry.position)))];
  return positions.map((position) => ({ position, winners: entries.filter((entry) => String(entry.position) === position) }))
    .filter((group) => group.position && group.winners.length > 1).sort((a, b) => Number(a.position) - Number(b.position));
}
