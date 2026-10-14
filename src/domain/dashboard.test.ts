import { describe, expect, it } from 'vitest';
import type { Equipment } from '../types';
import { buildDashboard, foldTop } from './dashboard';
import { createEquipment } from './equipment';

const today = new Date(2026, 9, 14); // 14/10/2026

function make(over: Partial<Equipment>): Equipment {
  return {
    ...createEquipment({
      name: 'Item',
      category: 'notebook',
      status: 'uso',
      owner: '',
      brand: '',
      serial: '',
      tag: '',
      location: '',
      buyDate: '',
      warrantyEnd: '',
      value: null,
      notes: '',
    }),
    ...over,
  };
}

describe('buildDashboard', () => {
  const items = [
    make({ category: 'notebook', location: 'Financeiro', owner: 'Ana', value: 5000, buyDate: '2026-01-10' }),
    make({ category: 'notebook', location: 'financeiro', owner: 'ana', value: 3000, buyDate: '2022-01-10' }),
    make({ category: 'celular', location: 'Comercial', status: 'manutencao', warrantyEnd: '2026-10-30' }),
    make({ category: 'monitor', location: '', status: 'estoque', warrantyEnd: '2026-09-01', value: 500 }),
    make({ category: 'notebook', status: 'baixado', value: 900, location: 'Antigo', buyDate: '2015-01-01' }),
  ];
  const d = buildDashboard(items, today);

  it('conta totais e separa os baixados', () => {
    expect(d.total).toBe(5);
    expect(d.active).toBe(4);
    expect(d.inMaintenance).toBe(1);
    expect(d.assetValue).toBe(8500); // sem o baixado
    expect(d.withoutValue).toBe(1);
    expect(d.byStatus.map((s) => s.n)).toEqual([2, 1, 1, 1]);
  });

  it('agrupa local e responsável sem diferenciar maiúsculas, e põe "sem" por último em empate', () => {
    expect(d.byLocation[0]).toMatchObject({ label: 'Financeiro', n: 2, key: 'Financeiro' });
    const sem = d.byLocation.find((c) => c.label === 'Sem local');
    expect(sem).toMatchObject({ n: 1, key: '' });
    expect(d.byLocation.some((c) => c.label === 'Antigo')).toBe(false); // baixado fora
    expect(d.byOwner[0]).toMatchObject({ label: 'Ana', n: 2 });
  });

  it('conta categorias só dos ativos', () => {
    expect(d.byCategory).toEqual([
      { key: 'notebook', label: 'Notebook', n: 2 },
      { key: 'celular', label: 'Celular', n: 1 },
      { key: 'monitor', label: 'Monitor', n: 1 },
    ]);
  });

  it('distribui a idade nas faixas na ordem fixa', () => {
    expect(d.age.map((a) => a.n)).toEqual([1, 0, 1, 0, 2]);
  });

  it('lista garantias vencidas e perto de vencer, mais atrasada primeiro', () => {
    expect(d.warranty.map((w) => w.days)).toEqual([-43, 16]);
    expect(d.warrantyExpired).toBe(1);
  });
});

describe('foldTop', () => {
  it('junta o resto em "Outros"', () => {
    const counts = Array.from({ length: 9 }, (_, i) => ({ key: `k${i}`, label: `L${i}`, n: 9 - i }));
    const f = foldTop(counts, 6);
    expect(f).toHaveLength(6);
    expect(f[5]).toEqual({ key: '', label: 'Outros (4)', n: 4 + 3 + 2 + 1 });
  });
  it('não mexe quando cabe', () => {
    const counts = [{ key: 'a', label: 'A', n: 1 }];
    expect(foldTop(counts)).toBe(counts);
  });
});
