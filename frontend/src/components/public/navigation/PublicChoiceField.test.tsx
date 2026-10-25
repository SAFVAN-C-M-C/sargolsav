import { afterEach, expect, test, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AppThemeProvider } from '../../../providers/AppThemeProvider';
import { PublicChoiceField } from './PublicChoiceField';

afterEach(cleanup);

const options = [{ value: 'junior', label: 'Junior' }, { value: 'senior', label: 'Senior' }];
function setup(items = options) {
  const onChange = vi.fn();
  render(<AppThemeProvider><PublicChoiceField label="Choose category" value="junior" options={items} onChange={onChange} /></AppThemeProvider>);
  return { user: userEvent.setup(), onChange, trigger: screen.getByRole('button', { name: 'Choose category' }) };
}

test('the sheet identifies the current choice and supports keyboard selection', async () => {
  const { user, onChange, trigger } = setup();
  await user.click(trigger);
  const selected = await screen.findByRole('option', { name: 'Junior' });
  expect(selected.getAttribute('aria-selected')).toBe('true');
  await waitFor(() => expect(document.activeElement).toBe(selected));
  await user.keyboard('{ArrowDown}{Enter}');
  expect(onChange).toHaveBeenCalledExactlyOnceWith('senior');
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
});

test('Escape closes the sheet, restores focus, and keeps the current category', async () => {
  const { user, onChange, trigger } = setup();
  await user.click(trigger);
  await screen.findByRole('dialog');
  await user.keyboard('{Escape}');
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(document.activeElement).toBe(trigger);
  expect(onChange).not.toHaveBeenCalled();
  expect(trigger.getAttribute('aria-expanded')).toBe('false');
});

test('choosing the current category closes without navigating again', async () => {
  const { user, onChange, trigger } = setup();
  await user.click(trigger);
  await user.click(await screen.findByRole('option', { name: 'Junior' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(onChange).not.toHaveBeenCalled();
});

test('long lists can be searched and the search resets when dismissed', async () => {
  const { user, trigger } = setup([...options, ...Array.from({ length: 8 }, (_, index) => ({ value: String(index), label: `Category ${index}` }))]);
  await user.click(trigger);
  await user.type(await screen.findByRole('textbox', { name: 'Search options' }), 'missing');
  expect(screen.getByRole('status').textContent).toBe('No matching options.');
  await user.click(screen.getByRole('button', { name: 'Close Choose category' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  await user.click(trigger);
  expect((await screen.findByRole('textbox', { name: 'Search options' }) as HTMLInputElement).value).toBe('');
  expect(screen.getAllByRole('option')).toHaveLength(10);
});
