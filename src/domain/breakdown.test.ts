import { describe, expect, it } from 'vitest';
import {
  EMPTY_BREAKDOWN_FILTERS,
  createBreakdown,
  filterBreakdowns,
  groupsOf,
  addDays,
  dailySeries,
  periodKpis,
  periodRange,
  rangeLabel,
  summarizeDays,
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
    expect(
      filterBreakdowns(sample, {
        ...EMPTY_BREAKDOWN_FILTERS,
        period: 'custom',
        from: '2026-09-01',
        to: '2026-09-30',
      }),
    ).toHaveLength(1);
    expect(filterBreakdowns(sample, { ...EMPTY_BREAKDOWN_FILTERS, query: 'overlock' })).toHaveLength(1);
  });

  it('ordena do dia mais recente para o mais antigo', () => {
    const days = filterBreakdowns(sample, EMPTY_BREAKDOWN_FILTERS).map((b) => b.day);
    expect(days).toEqual(['2026-10-19', '2026-10-19', '2026-10-19', '2026-09-30']);
  });

  it('lista meses e grupos sem repetir', () => {
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

  it('transforma o período escolhido em datas', () => {
    const today = new Date(2026, 9, 22); // 22/10/2026
    const f = EMPTY_BREAKDOWN_FILTERS;
    expect(periodRange({ ...f, period: 'all' }, today)).toEqual({ from: '', to: '' });
    expect(periodRange({ ...f, period: 'today' }, today)).toEqual({ from: '2026-10-22', to: '2026-10-22' });
    expect(periodRange({ ...f, period: '7d' }, today)).toEqual({ from: '2026-10-16', to: '2026-10-22' });
    expect(periodRange({ ...f, period: '30d' }, today)).toEqual({ from: '2026-09-23', to: '2026-10-22' });
    expect(periodRange({ ...f, period: 'month' }, today)).toEqual({ from: '2026-10-01', to: '2026-10-31' });
    expect(periodRange({ ...f, period: 'lastmonth' }, today)).toEqual({
      from: '2026-09-01',
      to: '2026-09-30',
    });
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(rangeLabel({ from: '2026-10-16', to: '2026-10-22' })).toBe('16/10/2026 a 22/10/2026');
  });

  it('filtra por período e agrupa por dia', () => {
    const today = new Date(2026, 9, 20);
    expect(filterBreakdowns(sample, { ...EMPTY_BREAKDOWN_FILTERS, period: '7d' }, today)).toHaveLength(3);
    const days = summarizeDays(sample);
    expect(days.map((d) => d.day)).toEqual(['2026-10-19', '2026-09-30']);
    expect(days[0]).toMatchObject({ breaks: 3, lostParts: 66, machines: ['RETA'] });
    expect(periodKpis(sample)).toEqual({ breaks: 4, machines: 2, lostParts: 71, daysWithBreaks: 2 });
  });

  it('monta a série diária preenchendo dias sem quebra', () => {
    const days = summarizeDays(sample);
    const { points } = dailySeries(days, { from: '2026-10-17', to: '2026-10-20' });
    expect(points.map((p) => [p.day, p.breaks])).toEqual([
      ['2026-10-17', 0],
      ['2026-10-18', 0],
      ['2026-10-19', 3],
      ['2026-10-20', 0],
    ]);
    // sem período: de 30/09 a 19/10 são 20 dias, todos aparecem (os sem quebra com zero)
    const all = dailySeries(days, { from: '', to: '' }).points;
    expect(all).toHaveLength(20);
    expect(all[0]).toMatchObject({ day: '2026-09-30', breaks: 1 });
    // mais de 31 dias: só os dias com quebra
    const far = summarizeDays([...sample, make('2026-05-01', 'RETA', 'G1', 1, 9)]);
    expect(dailySeries(far, { from: '', to: '' }).points.map((p) => p.day)).toEqual([
      '2026-05-01',
      '2026-09-30',
      '2026-10-19',
    ]);
  });
});
