export interface AdminCategory {
  id: string;
  competition_id: string;
  name: string;
  sort_order: number;
}

export interface AdminEvent extends AdminCategory {
  category_id: string;
}

export interface CatalogChanges {
  name?: string;
  sort_order?: number;
}
