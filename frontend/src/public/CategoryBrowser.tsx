import { Link } from 'react-router-dom';
import type { Category } from './publicApi';
import { resultsPath } from './publicPaths';
import { EmptyState } from './PublicStates';

export function CategoryBrowser({ competitionId, categories, categoryId }: {
  competitionId: string;
  categories: Category[];
  categoryId?: string;
}) {
  const base = resultsPath(competitionId);
  if (categoryId) {
    const category = categories.find((item) => item.id === categoryId);
    if (!category) return <EmptyState title="Category not found">
      This category is not available in this competition. <Link to={base}>Browse categories</Link>.
    </EmptyState>;
    return <><h2 className="section-title">{category.name}</h2>
      <EmptyState title="Event results are coming soon">You are browsing {category.name}. Event results will be available here in a future update.</EmptyState></>;
  }
  return <section aria-labelledby="categories-title">
    <div className="section-heading"><div><p className="eyebrow">Find your category</p>
      <h2 id="categories-title">Browse results</h2></div>
      <span className="count-badge">{categories.length} {categories.length === 1 ? 'category' : 'categories'}</span>
    </div>
    <p className="public-intro">Choose a category to explore the competition.</p>
    {categories.length === 0 ? <EmptyState title="Categories are on the way">Categories have not been added to this competition yet.</EmptyState> :
      <ul className="category-grid">{categories.map((item, index) => <li key={item.id}>
        <Link className="category-card" to={`${base}/categories/${encodeURIComponent(item.id)}`}>
          <span className="category-number" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
          <span className="category-copy"><strong>{item.name}</strong><span>Explore category</span></span>
          <span className="card-arrow" aria-hidden="true">↗</span>
        </Link></li>)}</ul>}
  </section>;
}
