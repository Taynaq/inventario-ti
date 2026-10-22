/** Nome do app. Para trocar, basta mudar aqui e em index.html, manifest e supabase (títulos). */
export const APP_NAME = 'Central de Gestão';

/** Telas (módulos) do app. Para criar uma nova, acrescente aqui e libere pela aba Acessos. */
export const MODULES = [
  { id: 'inventario', label: 'Inventário de TI', short: 'Inventário' },
  { id: 'quebras', label: 'Quebra de máquinas', short: 'Quebras' },
] as const;

export type ModuleId = (typeof MODULES)[number]['id'];

export const MODULE_IDS: readonly ModuleId[] = MODULES.map((m) => m.id);

export function isModuleId(v: unknown): v is ModuleId {
  return typeof v === 'string' && (MODULE_IDS as readonly string[]).includes(v);
}

export const moduleLabel = (id: ModuleId): string => MODULES.find((m) => m.id === id)?.label ?? id;
