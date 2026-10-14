import type { Equipment, EquipmentDraft } from '../types';
import { isCategoryId, isStatusId } from './catalog';

const str = (v: unknown): string => (typeof v === 'string' ? v : '');

/**
 * Lê um objeto vindo de fora (localStorage, banco) e devolve um Equipment válido.
 * Campos ausentes ganham valores padrão. Sem `id` ou sem `name`, devolve null.
 */
export function toEquipment(raw: unknown): Equipment | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const id = str(r.id);
  const name = str(r.name).trim();
  if (!id || !name) return null;
  const now = Date.now();
  return {
    id,
    name,
    category: isCategoryId(r.category) ? r.category : 'outro',
    status: isStatusId(r.status) ? r.status : 'uso',
    owner: str(r.owner),
    brand: str(r.brand),
    serial: str(r.serial),
    tag: str(r.tag),
    location: str(r.location),
    buyDate: str(r.buyDate),
    warrantyEnd: str(r.warrantyEnd),
    value: typeof r.value === 'number' && Number.isFinite(r.value) ? r.value : null,
    notes: str(r.notes),
    example: r.example === true,
    createdAt: typeof r.createdAt === 'number' ? r.createdAt : now,
    updatedAt: typeof r.updatedAt === 'number' ? r.updatedAt : now,
  };
}

export function newId(): string {
  return crypto.randomUUID();
}

/** Cria um equipamento novo a partir do formulário. */
export function createEquipment(draft: EquipmentDraft, now: number = Date.now()): Equipment {
  return { ...draft, id: newId(), example: false, createdAt: now, updatedAt: now };
}

/** Aplica o formulário a um equipamento existente. */
export function applyDraft(prev: Equipment, draft: EquipmentDraft, now: number = Date.now()): Equipment {
  return { ...prev, ...draft, example: false, updatedAt: now };
}
