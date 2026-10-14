import { describe, expect, it, vi } from 'vitest';
import { createEquipment } from '../domain/equipment';
import { fromRow, toRow } from './cloudStore';
import { LOCAL_KEY, LocalStore, type StorageLike } from './localStore';
import { StoreError, describeError } from './store';

function fakeStorage(initial: Record<string, string> = {}): StorageLike & { data: Record<string, string> } {
  const data = { ...initial };
  return {
    data,
    getItem: (k) => data[k] ?? null,
    setItem: (k, v) => {
      data[k] = v;
    },
  };
}

const draft = {
  name: 'Notebook',
  category: 'notebook' as const,
  status: 'uso' as const,
  owner: 'Ana',
  brand: '',
  serial: '',
  tag: 'PAT-1',
  location: '',
  buyDate: '',
  warrantyEnd: '',
  value: 1000,
  notes: '',
};

describe('LocalStore', () => {
  it('salva, altera e exclui, avisando quem assina', async () => {
    const store = new LocalStore(fakeStorage());
    const seen = vi.fn();
    store.subscribe(seen, () => {});
    expect(seen).toHaveBeenLastCalledWith([]);

    const item = createEquipment(draft);
    await store.save(item);
    expect(seen).toHaveBeenLastCalledWith([item]);

    await store.patch(item.id, { status: 'baixado' });
    expect(seen.mock.lastCall?.[0][0].status).toBe('baixado');

    await store.remove(item.id);
    expect(seen).toHaveBeenLastCalledWith([]);
  });

  it('ignora dados corrompidos no armazenamento', () => {
    const store = new LocalStore(fakeStorage({ [LOCAL_KEY]: '{isso nao e json' }));
    const seen = vi.fn();
    store.subscribe(seen, () => {});
    expect(seen).toHaveBeenCalledWith([]);
  });

  it('removeMany apaga só os ids pedidos', async () => {
    const store = new LocalStore(fakeStorage());
    const a = createEquipment(draft);
    const b = createEquipment({ ...draft, name: 'Outro' });
    await store.save(a);
    await store.save(b);
    await store.removeMany([a.id]);
    const seen = vi.fn();
    store.subscribe(seen, () => {});
    expect(seen.mock.lastCall?.[0].map((i: { id: string }) => i.id)).toEqual([b.id]);
  });

  it('avisa quando o navegador não tem mais espaço', async () => {
    const full: StorageLike = {
      getItem: () => null,
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
    };
    await expect(new LocalStore(full).save(createEquipment(draft))).rejects.toMatchObject({ code: 'quota' });
  });
});

describe('mapeamento do banco', () => {
  it('toRow troca nomes de campo por colunas e datas vazias por null', () => {
    const item = createEquipment({ ...draft, buyDate: '', warrantyEnd: '2027-01-31' });
    const row = toRow(item);
    expect(row).toMatchObject({
      id: item.id,
      name: 'Notebook',
      buy_date: null,
      warranty_end: '2027-01-31',
      is_example: false,
      value: 1000,
    });
    expect(row).not.toHaveProperty('createdAt');
  });

  it('toRow parcial só leva o que mudou', () => {
    expect(toRow({ status: 'baixado' })).toEqual({ status: 'baixado' });
  });

  it('fromRow volta ao formato do app, tratando null como vazio', () => {
    const e = fromRow({
      id: 'abc',
      name: 'Monitor',
      category: 'monitor',
      status: 'estoque',
      owner: '',
      buy_date: null,
      warranty_end: '2027-01-31',
      value: '1250.00',
      is_example: true,
      created_at: '2026-10-13T12:00:00Z',
      updated_at: '2026-10-13T12:00:00Z',
    });
    expect(e).toMatchObject({
      id: 'abc',
      buyDate: '',
      warrantyEnd: '2027-01-31',
      value: 1250,
      example: true,
    });
  });
});

describe('describeError', () => {
  it('traduz cada tipo de erro', () => {
    expect(describeError(new StoreError('network', 'x'))).toMatch(/conexão/);
    expect(describeError(new StoreError('denied', 'x'))).toMatch(/permissão/);
    expect(describeError(new Error('qualquer'))).toMatch(/Não foi possível/);
  });
});
