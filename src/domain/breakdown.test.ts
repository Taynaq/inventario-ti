import { describe, expect, it } from 'vitest';
import {
  EMPTY_BREAKDOWN_FILTERS,
  createBreakdown,
  filterBreakdowns,
  groupsOf,
  monthLabel,
  monthsOf,
  readBreakdown,
  summarizeBreakdowns,
  toBreakdown,
} from './breakdown';

const make = (day: string, machine: string, group: string, parts: number, at = 1) =>
  createBreakdown(
    { day, machine, group, lostParts: parts, notes: '' },
    at,
    `${day}-${machine}-${group}-${at}`,
  );

const sample = [
  make('2026-10-19', 'RETA', 'G1', 22, 1),
  make('2026-10-19', 'Reta', 'G1', 22, 2),
  make('2026-10-19', 'RETA', 'G5', 22, 3),
  make('2026-09-30', 'Overlock', 'g1', 5, 4),
];

describe('readBreakdown', () => {
  it('aceita um registro completo', () => {
    expect(
      readBreakdown({ day: '2026-10-19', machine: ' RETA ', group: 'G1', parts: '22', notes: '' }),
    ).toEqual({
      draft: { day: '2026-10-19', machine: 'RETA', group: 'G1', lostParts: 22, notes: '' },
    });
  });

  it('exige dia e máquina, e peças inteiras', () => {
    expect(readBreakdown({ day: '', machine: 'A', group: '', parts: '1', notes: '' })).toMatchObject({
      focus: 'day',
    });
    expect(
      readBreakdown({ day: '2026-10-19', machine: ' ', group: '', parts: '1', notes: '' }),
    ).toMatchObject({
      focus: 'machine',
    });
    expect(
      readBreakdown({ day: '2026-10-19', machine: 'A', group: '', parts: '2,5', notes: '' }),
    ).toMatchObject({
      focus: 'parts',
    });
    expect(
      readBreakdown({ day: '2026-10-19', machine: 'A', group: '', parts: '-1', notes: '' }),
    ).toMatchObject({
      focus: 'parts',
    });
  });

  it('peças vazias contam como zero', () => {
    expect(readBreakdown({ day: '2026-10-19', machine: 'A', group: '', parts: '', notes: '' })).toMatchObject(
      {
        draft: { lostParts: 0 },
      },
    );
  });
});

describe('toBreakdown', () => {
  it('descarta o que não tem id, dia válido ou máquina', () => {
    expect(toBreakdown(null)).toBeNull();
    expect(toBreakdown({ id: 'x', day: 'ontem', machine: 'A' })).toBeNull();
    expect(toBreakdown({ id: 'x', day: '2026-10-19', machine: '' })).toBeNull();
    expect(
      toBreakdown({ id: 'x', day: '2026-10-19T00:00:00Z', machine: 'A', lostParts: '7' })?.lostParts,
    ).toBe(7);
  });
});

describe('filtros e resumo', () => {
  it('filtra por grupo sem diferenciar maiúsculas e por mês', () => {
    const g1 = filterBreakdowns(sample, { ...EMPTY_BREAKDOWN_FILTERS, group: 'G1' });
    expect(g1).toHaveLength(3);
    expect(filterBreakdowns(sample, { ...EMPTY_BREAKDOWN_FILTERS, month: '2026-09' })).toHaveLength(1);
    expect(filterBreakdowns(sample, { ...EMPTY_BREAKDOWN_FILTERS, query: 'overlock' })).toHaveLength(1);
  });

  it('ordena do dia mais recente para o mais antigo', () => {
    const days = filterBreakdowns(sample, EMPTY_BREAKDOWN_FILTERS).map((b) => b.day);
    expect(days).toEqual(['2026-10-19', '2026-10-19', '2026-10-19', '2026-09-30']);
  });

  it('lista meses e grupos sem repetir', () => {
    expect(monthsOf(sample)).toEqual(['2026-10', '2026-09']);
    expect(monthLabel('2026-10')).toBe('Outubro de 2026');
    expect(groupsOf(sample)).toEqual(['G1', 'G5']);
  });

  it('soma peças por máquina (RETA e Reta são a mesma) e conta quebras', () => {
    const s = summarizeBreakdowns(sample);
    expect(s.records).toBe(4);
    expect(s.lostParts).toBe(71);
    expect(s.byMachine[0]).toMatchObject({ n: 66 });
    expect(s.byMachine[1]).toMatchObject({ label: 'Overlock', n: 5 });
    expect(s.breaksByMachine[0]).toMatchObject({ n: 3 });
    expect(s.byGroup.map((g) => g.n)).toEqual([49, 22]);
    expect(s.byDay[0]).toMatchObject({ key: '2026-10-19', label: '19/10', n: 66 });
  });
});
