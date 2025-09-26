// src/modules/planos-manutencao/interfaces/planos-manutencao.interface.ts
export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface PlanoFilters {
  search?: string;
  equipamento_id?: string;
  planta_id?: string;
  status?: string;
  ativo?: boolean;
}

export interface SortOptions {
  sort_by?: string;
  sort_order?: 'asc' | 'desc';
}