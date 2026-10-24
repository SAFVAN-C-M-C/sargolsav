import { useMemo } from 'react';
import { Route, Routes } from 'react-router-dom';
import { createPublicApi } from '../api/publicApi';
import { PublicLayout } from '../layouts/PublicLayout';
import { CompetitionPage } from '../pages/public/CompetitionPage';
import { PublicHome } from '../pages/public/PublicHome';
import { NotFound } from '../pages/public/NotFound';

export function PublicApp({ fetcher }: { fetcher: typeof fetch }) {
  const api = useMemo(() => createPublicApi(fetcher), [fetcher]);
  return <Routes><Route element={<PublicLayout api={api} />}>
    <Route index element={<PublicHome />} />
    <Route path="leaderboards" element={<PublicHome leaderboards />} />
    <Route path="competitions/:competitionId/results" element={<CompetitionPage />} />
    <Route path="competitions/:competitionId/results/categories/:categoryId" element={<CompetitionPage />} />
    <Route path="competitions/:competitionId/results/categories/:categoryId/events/:eventId" element={<CompetitionPage />} />
    <Route path="competitions/:competitionId/leaderboards" element={<CompetitionPage leaderboards />} />
    <Route path="competitions/:competitionId/leaderboards/categories/:categoryId/units" element={<CompetitionPage leaderboards />} />
    <Route path="competitions/:competitionId/leaderboards/categories/:categoryId/candidates" element={<CompetitionPage leaderboards rankingType="candidates" />} />
    <Route path="*" element={<NotFound />} />
  </Route></Routes>;
}
