import { afterEach, expect, test } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AppThemeProvider } from './AppThemeProvider';
import { AppButton, AppForm, CategoryCopySpan, FormInput, FieldLabel, RankingRankSpan, ResultStatusSpan } from '../styles/components';

afterEach(cleanup);

test('the application theme applies the brand palette to the document and MUI controls', () => {
  render(<AppThemeProvider><AppButton>Continue</AppButton></AppThemeProvider>);
  expect(getComputedStyle(document.body).backgroundColor).toBe('rgb(244, 247, 243)');
  expect(getComputedStyle(screen.getByRole('button')).backgroundColor).toBe('rgb(23, 107, 89)');
});

test('styled form controls retain labels, native validation, and explicit submit behavior', async () => {
  let submits = 0;
  const user = userEvent.setup();
  render(<AppThemeProvider><AppForm onSubmit={(event) => { event.preventDefault(); submits += 1; }}>
    <FieldLabel htmlFor="theme-email">Email</FieldLabel>
    <FormInput id="theme-email" type="email" required />
    <AppButton type="button">Preview</AppButton>
    <AppButton type="submit">Save</AppButton>
  </AppForm></AppThemeProvider>);
  await user.click(screen.getByRole('button', { name: 'Save' }));
  expect(submits).toBe(0);
  await user.type(screen.getByLabelText('Email'), 'admin@example.test');
  await user.click(screen.getByRole('button', { name: 'Preview' }));
  expect(submits).toBe(0);
  await user.click(screen.getByRole('button', { name: 'Save' }));
  expect(submits).toBe(1);
});

test('ranking and publication styles update through props without leaking styling attributes', () => {
  const content = (rank: string, published: boolean) => <AppThemeProvider>
    <RankingRankSpan rank={rank} sx={{ fontWeight: 700 }}>Rank</RankingRankSpan>
    <CategoryCopySpan><ResultStatusSpan published={published}>Result status</ResultStatusSpan></CategoryCopySpan>
  </AppThemeProvider>;
  const { rerender } = render(content('1', true));
  const rank = screen.getByText('Rank');
  const status = screen.getByText('Result status');
  expect(getComputedStyle(rank).backgroundColor).toBe('rgb(250, 240, 217)');
  expect(getComputedStyle(status).color).toBe('rgb(20, 83, 62)');
  expect(getComputedStyle(status).display).toBe('inline-block');
  expect(rank.hasAttribute('rank')).toBe(false);
  expect(rank.hasAttribute('sx')).toBe(false);
  expect(status.hasAttribute('published')).toBe(false);

  rerender(content('4', false));
  expect(getComputedStyle(rank).backgroundColor).toBe('rgb(234, 241, 235)');
  expect(getComputedStyle(status).color).toBe('rgb(121, 83, 27)');
});
