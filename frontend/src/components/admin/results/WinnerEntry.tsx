import { AppButton, ButtonSecondaryButton, CandidateLookupDiv, FormErrorP, FormInput, FieldLabel, NoticeDiv, WinnerEntryFieldset } from '../../../styles/components';
import { useEffect, useId, useRef, useState, useCallback } from 'react';
import { resultsApi } from '../../../api/resultsApi';
import { madrassasApi } from '../../../api/participantsApi';
import { adminErrorMessage } from '../../../api/adminErrors';
import { useAdminAuth } from '../../../hooks/useAdminAuth';
import { useAdminResource } from '../../../hooks/useAdminResource';
import type { AdminUnit } from '../../../types/adminParticipants';
import type { Candidate, WinnerRow } from '../../../types/adminResults';

export function WinnerEntry({ row, index, competitionId, categoryId, categoryName, units, positions, onChange, onRemove }: {
  row: WinnerRow; index: number; competitionId: string; categoryId: string; categoryName: string;
  units: AdminUnit[]; positions: string[]; onChange: (changes: Partial<WinnerRow>) => void; onRemove: () => void;
}) {
  const { request } = useAdminAuth(); const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null); const lookupRef = useRef<AbortController | null>(null);
  const [pending, setPending] = useState(false); const [error, setError] = useState(''); const [found, setFound] = useState<Candidate>();
  useEffect(() => { if (row.key.startsWith('new-')) inputRef.current?.focus(); return () => lookupRef.current?.abort(); }, [row.key]);
  const load = useCallback((signal: AbortSignal) => row.unit_id ? madrassasApi(request, competitionId, row.unit_id).list(signal) : Promise.resolve([]), [request, competitionId, row.unit_id]);
  const { state: madrasas, retry } = useAdminResource(load);
  const locked = row.resolution === 'existing' || row.resolution === 'saved';
  const apply = (candidate: Candidate) => onChange({ name: candidate.name, unit_id: candidate.unit_id, madrasa_id: candidate.madrasa_id ?? '', resolution: 'existing' });
  const lookup = async () => {
    if (pending) return;
    lookupRef.current?.abort(); const controller = new AbortController(); lookupRef.current = controller;
    setPending(true); setError(''); setFound(undefined); onChange({ resolution: 'unchecked' });
    try {
      const candidate = await resultsApi.lookup(request, competitionId, row.candidate_code, controller.signal);
      if (controller.signal.aborted) return;
      if (!candidate) { onChange({ resolution: 'new' }); return; }
      setFound(candidate);
      const conflicts = (row.name !== '' && row.name !== candidate.name) || (row.unit_id !== '' && row.unit_id !== candidate.unit_id) ||
        ((row.name !== '' || row.unit_id !== '' || row.madrasa_id !== '') && row.madrasa_id !== (candidate.madrasa_id ?? ''));
      if (candidate.category_id !== categoryId || conflicts) onChange({ resolution: 'conflict' });
      else apply(candidate);
    } catch (error) { if (!controller.signal.aborted) setError(adminErrorMessage(error)); }
    finally { if (!controller.signal.aborted) setPending(false); }
  };
  return <WinnerEntryFieldset><legend>Winner {index + 1}</legend>
    <FieldLabel htmlFor={`${inputId}-code`}>External candidate ID</FieldLabel><CandidateLookupDiv><FormInput ref={inputRef} id={`${inputId}-code`} value={row.candidate_code} required onChange={(event) => {
      lookupRef.current?.abort(); setPending(false); setFound(undefined); setError('');
      onChange({ candidate_code: event.target.value, name: '', unit_id: '', madrasa_id: '', resolution: 'unchecked' });
    }} /><AppButton type="button" disabled={pending || !row.candidate_code.trim()} onClick={() => void lookup()}>{pending ? 'Looking up…' : 'Look up candidate'}</AppButton></CandidateLookupDiv>
    {error && <FormErrorP role="alert">{error}</FormErrorP>}
    {pending && <p role="status">Looking up candidate…</p>}
    {locked && <p role="status">Existing candidate. Registered identity and affiliations are read-only.</p>}
    {row.resolution === 'new' && <p role="status">New candidate. A record will be created only when this draft is saved.</p>}
    {row.resolution === 'conflict' && found && <NoticeDiv sx={{ marginBlock: '.25rem', overflowWrap: 'anywhere' }} role="alert"><p>Candidate identity or category conflict. Entered information has not been replaced.</p>
      <p>Registered: {found.name}; unit ID {found.unit_id}; category ID {found.category_id}; Madrassa ID {found.madrasa_id ?? 'none'}.</p>
      {found.category_id === categoryId ? <AppButton type="button" onClick={() => apply(found)}>Use registered candidate</AppButton> : <p>This candidate belongs to another category and cannot be entered here.</p>}
    </NoticeDiv>}
    <p>Category: {categoryName}</p>
    <FieldLabel htmlFor={`${inputId}-name`}>Candidate name</FieldLabel><FormInput id={`${inputId}-name`} value={row.name} readOnly={locked || pending} required onChange={(event) => onChange({ name: event.target.value })} />
    <FieldLabel htmlFor={`${inputId}-unit`}>Unit</FieldLabel><select id={`${inputId}-unit`} value={row.unit_id} disabled={locked || pending} required onChange={(event) => onChange({ unit_id: event.target.value, madrasa_id: '' })}>
      <option value="">Select a unit</option>{units.map((unit) => <option value={unit.id} key={unit.id}>{unit.name}</option>)}
    </select>
    <FieldLabel htmlFor={`${inputId}-madrassa`}>Madrassa (optional)</FieldLabel><select id={`${inputId}-madrassa`} value={row.madrasa_id} disabled={locked || pending || !row.unit_id || madrasas.status !== 'ready'} onChange={(event) => onChange({ madrasa_id: event.target.value })}>
      <option value="">No Madrassa</option>{row.madrasa_id && (madrasas.status !== 'ready' || !madrasas.data.some((item) => item.id === row.madrasa_id)) && <option value={row.madrasa_id}>Registered Madrassa ID {row.madrasa_id}</option>}
      {madrasas.status === 'ready' && madrasas.data.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
    </select>
    {row.unit_id && madrasas.status === 'loading' && <p role="status">Loading this unit's Madrassas…</p>}
    {madrasas.status === 'error' && <p role="alert">Madrassas could not be loaded. <ButtonSecondaryButton type="button" onClick={retry}>Retry Madrassas</ButtonSecondaryButton></p>}
    <FieldLabel htmlFor={`${inputId}-position`}>Winning position</FieldLabel><select id={`${inputId}-position`} value={row.position} required onChange={(event) => onChange({ position: event.target.value })}>
      <option value="">Select a position</option>{row.position && !positions.includes(row.position) && <option value={row.position}>Position {row.position} (no longer configured)</option>}
      {positions.map((position) => <option key={position} value={position}>Position {position}</option>)}
    </select>
    <ButtonSecondaryButton type="button" onClick={onRemove}>Remove winner {index + 1}</ButtonSecondaryButton>
  </WinnerEntryFieldset>;
}
