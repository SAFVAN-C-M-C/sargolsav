export interface AdminUnit {
  id: string;
  competition_id: string;
  name: string;
}

export interface AdminMadrassa extends AdminUnit {
  unit_id: string;
}
