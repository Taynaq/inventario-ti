import type { Equipment } from '../types';

/** Campos que podem ser alterados em um equipamento já salvo. */
export type EquipmentPatch = Partial<Omit<Equipment, 'id' | 'createdAt'>>;

/**
 * Contrato de armazenamento. A interface não sabe se os dados estão no
 * navegador (LocalStore) ou na nuvem (CloudStore).
 */
export interface Store {
  readonly kind: 'local' | 'cloud';
  /** Entrega a lista atual e depois a cada mudança. Devolve a função que cancela. */
  subscribe(onChange: (items: Equipment[]) => void, onError: (e: StoreError) => void): () => void;
  save(item: Equipment): Promise<void>;
  /** Salva vários de uma vez (usado na importação). */
  saveMany(items: readonly Equipment[]): Promise<void>;
  patch(id: string, fields: EquipmentPatch): Promise<void>;
  remove(id: string): Promise<void>;
  removeMany(ids: readonly string[]): Promise<void>;
}

export type StoreErrorCode = 'quota' | 'denied' | 'network' | 'unknown';

export class StoreError extends Error {
  constructor(
    readonly code: StoreErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'StoreError';
  }
}

/** Mensagem em português, pronta para mostrar à pessoa. */
export function describeError(e: unknown): string {
  const code = e instanceof StoreError ? e.code : 'unknown';
  switch (code) {
    case 'quota':
      return 'Sem espaço para salvar. Exclua itens e tente de novo.';
    case 'denied':
      return 'Você não tem permissão para salvar. Peça liberação ao administrador.';
    case 'network':
      return 'Sem conexão. Verifique a internet e tente de novo.';
    default:
      return 'Não foi possível salvar. Tente de novo.';
  }
}
