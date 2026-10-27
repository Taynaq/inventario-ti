import { describe, expect, it } from 'vitest';
import type { Equipment } from '../types';
import {
  countByEquipment,
  createIncident,
  incidentsOf,
  readIncident,
  reasonSuggestions,
  toIncident,
  topProblemEquipment,
} from './incident';

const mk = (
  equipmentId: string,
  day: string,
  reason: string,
  resolved = false,
  id: string = crypto.randomUUID(),
) => {
  const r = readIncident({ day, reason, solution: '', resolved });
  if ('error' in r) throw new Error(r.error);
  return createIncident(equipmentId, r.draft, Date.parse(day), id);
};

describe('readIncident', () => {
  it('exige o dia e o motivo', () => {
    expect(readIncident({ day: '', reason: 'x', solution: '', resolved: false })).toMatchObject({
      focus: 'day',
    });
    expect(readIncident({ day: '2026-10-26', reason: '  ', solution: '', resolved: false })).toMatchObject({
      focus: 'reason',
    });
  });
});

describe('toIncident', () => {
  it('ignora linhas incompletas', () => {
    expect(toIncident({ id: '1', equipmentId: '', day: '2026-10-26', reason: 'x' })).toBeNull();
    expect(toIncident({ id: '1', equipmentId: 'e', day: 'ontem', reason: 'x' })).toBeNull();
  });
});

describe('histórico', () => {
  const list = [
    mk('a', '2026-10-01', 'Queda de energia', true, '1'),
    mk('a', '2026-10-20', 'queda de energia', false, '2'),
    mk('b', '2026-10-10', 'HD com defeito', true, '3'),
  ];
  it('ordena do mais recente para o mais antigo', () => {
    expect(incidentsOf(list, 'a').map((i) => i.id)).toEqual(['2', '1']);
  });
  it('conta o total, inclusive os já resolvidos, e os em aberto', () => {
    expect(countByEquipment(list).get('a')).toEqual({ total: 2, open: 1 });
    expect(countByEquipment(list).get('b')).toEqual({ total: 1, open: 0 });
  });
  it('sugere motivos juntando maiúsculas e minúsculas', () => {
    expect(reasonSuggestions(list)[0]?.toLowerCase()).toBe('queda de energia');
    expect(reasonSuggestions(list)).toHaveLength(2);
  });
  it('lista os equipamentos com mais problemas', () => {
    const eq = (id: string, name: string) => ({ id, name }) as Equipment;
    expect(topProblemEquipment(list, [eq('a', 'Dell'), eq('b', 'Acer'), eq('c', 'HP')])).toEqual([
      { key: 'Dell', label: 'Dell', n: 2 },
      { key: 'Acer', label: 'Acer', n: 1 },
    ]);
  });
});
