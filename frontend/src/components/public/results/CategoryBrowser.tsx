import { CardArrowSpan, CategoryCardLink, CategoryCopySpan, CategoryGridUl, CategoryNumberSpan, CountBadgeSpan, EyebrowP, PublicIntroP, SectionHeadingDiv } from '../../../styles/components';
import { Link } from 'react-router-dom';
import type { Category } from '../../../types/public';
import { resultsPath } from '../../../utils/publicPaths';
import { EmptyState } from '../../common/PublicStates';
import { EventBrowser } from './EventBrowser';

export function CategoryBrowser({ competitionId, categories, categoryId, eventId }: {
  competitionId: string;
  categories: Category[];
  categoryId?: string;
  eventId?: string;
}) {
  const base = resultsPath(competitionId);
  if (categoryId) {
    const category = categories.find((item) => item.id === categoryId);
    if (!category) return <EmptyState title="Category not found">
      This category is not available in this competition. <Link to={base}>Browse categories</Link>.
    </EmptyState>;
    return <>{!eventId && <h2>{category.name}</h2>}
      <EventBrowser key={eventId ?? 'listing'} competitionId={competitionId} categoryId={categoryId} eventId={eventId} /></>;
  }
  return <section aria-labelledby="categories-title">
    <SectionHeadingDiv><div><EyebrowP variant="publicHeading">Find your category</EyebrowP>
      <h2 id="categories-title">Browse results</h2></div>
      <CountBadgeSpan>{categories.length} {categories.length === 1 ? 'category' : 'categories'}</CountBadgeSpan>
    </SectionHeadingDiv>
    <PublicIntroP>Choose a category to explore the competition.</PublicIntroP>
    {categories.length === 0 ? <EmptyState title="Categories are on the way">Categories have not been added to this competition yet.</EmptyState> :
      <CategoryGridUl>{categories.map((item, index) => <li key={item.id}>
        <CategoryCardLink to={`${base}/categories/${encodeURIComponent(item.id)}`}>
          <CategoryNumberSpan aria-hidden="true">{String(index + 1).padStart(2, '0')}</CategoryNumberSpan>
          <CategoryCopySpan><strong>{item.name}</strong><span>Explore category</span></CategoryCopySpan>
          <CardArrowSpan aria-hidden="true">↗</CardArrowSpan>
        </CategoryCardLink></li>)}</CategoryGridUl>}
  </section>;
}
