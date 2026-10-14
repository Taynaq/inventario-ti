export const CATEGORY_IDS = [
  'notebook',
  'desktop',
  'celular',
  'tablet',
  'monitor',
  'impressora',
  'rede',
  'periferico',
  'servidor',
  'outro',
] as const;
export type CategoryId = (typeof CATEGORY_IDS)[number];

export const STATUS_IDS = ['uso', 'estoque', 'manutencao', 'baixado'] as const;
export type StatusId = (typeof STATUS_IDS)[number];

export interface Equipment {
  id: string;
  name: string;
  category: CategoryId;
  status: StatusId;
  owner: string;
  brand: string;
  serial: string;
  /** Número de patrimônio (etiqueta). */
  tag: string;
  location: string;
  /** Data no formato AAAA-MM-DD, ou vazio. */
  buyDate: string;
  /** Data no formato AAAA-MM-DD, ou vazio. */
  warrantyEnd: string;
  value: number | null;
  notes: string;
  /** Equipamento de demonstração, removível com um toque. */
  example: boolean;
  /** Milissegundos desde 1970. */
  createdAt: number;
  updatedAt: number;
}

/** Campos que a pessoa preenche no formulário. */
export type EquipmentDraft = Omit<Equipment, 'id' | 'example' | 'createdAt' | 'updatedAt'>;

export type StatusFilter = 'all' | 'garantia' | StatusId;

export interface Filters {
  query: string;
  status: StatusFilter;
  category: 'all' | CategoryId;
}
