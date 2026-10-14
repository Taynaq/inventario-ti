import { describe, expect, it } from 'vitest';
import type { Equipment } from '../types';
import { createEquipment, toEquipment } from './equipment';
import { EMPTY_FILTERS, filterEquipment, summarize } from './filter';
import { formatDate, isoDateIn, normalize, parseMoney } from './format';
import { daysUntil, warrantyAlert } from './warranty';

const today = new Date(2026, 9, 13); // 13/10/2026

function make(over: Partial<Equipment> = {}): Equipment {
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

describe('parseMoney', () => {
  it('aceita formatos brasileiros e simples', () => {
    expect(parseMoney('3500')).toBe(3500);
    expect(parseMoney('3.500,00')).toBe(3500);
    expect(parseMoney('R$ 1.234,56')).toBe(1234.56);
    expect(parseMoney('12,5')).toBe(12.5);
  });
  it('devolve null para vazio, texto e negativo', () => {
    expect(parseMoney('')).toBeNull();
    expect(parseMoney('abc')).toBeNull();
    expect(parseMoney('-10')).toBeNull();
  });
});

describe('datas', () => {
  it('formata AAAA-MM-DD como DD/MM/AAAA', () => {
    expect(formatDate('2026-10-13')).toBe('13/10/2026');
    expect(formatDate('')).toBe('');
  });
  it('isoDateIn soma dias respeitando o fim do mês', () => {
    expect(isoDateIn(0, today)).toBe('2026-10-13');
    expect(isoDateIn(20, today)).toBe('2026-11-02');
    expect(isoDateIn(-13, today)).toBe('2026-09-30');
  });
  it('daysUntil conta dias e rejeita data inválida', () => {
    expect(daysUntil('2026-10-13', today)).toBe(0);
    expect(daysUntil('2026-10-20', today)).toBe(7);
    expect(daysUntil('2026-10-10', today)).toBe(-3);
    expect(daysUntil('lixo', today)).toBeNull();
  });
});

describe('warrantyAlert', () => {
  it('avisa vencida, hoje e próxima do fim', () => {
    expect(warrantyAlert({ status: 'uso', warrantyEnd: '2026-10-01' }, today)?.kind).toBe('bad');
    expect(warrantyAlert({ status: 'uso', warrantyEnd: '2026-10-13' }, today)?.text).toBe(
      'Garantia vence hoje',
    );
    expect(warrantyAlert({ status: 'uso', warrantyEnd: '2026-10-14' }, today)?.text).toBe('Garantia: 1 dia');
    expect(warrantyAlert({ status: 'uso', warrantyEnd: '2026-12-12' }, today)?.text).toBe(
      'Garantia: 60 dias',
    );
  });
  it('não avisa quando está longe, sem data ou baixado', () => {
    expect(warrantyAlert({ status: 'uso', warrantyEnd: '2026-12-13' }, today)).toBeNull();
    expect(warrantyAlert({ status: 'uso', warrantyEnd: '' }, today)).toBeNull();
    expect(warrantyAlert({ status: 'baixado', warrantyEnd: '2026-10-01' }, today)).toBeNull();
  });
});

describe('filterEquipment', () => {
  const items = [
    make({ name: 'Notebook Dell', owner: 'Ana Souza', tag: 'PAT-1', status: 'uso' }),
    make({ name: 'iPhone', category: 'celular', owner: 'Carlos', status: 'estoque' }),
    make({ name: 'Impressora', category: 'impressora', status: 'manutencao', warrantyEnd: '2026-10-01' }),
  ];

  it('busca ignorando acentos e maiúsculas, em vários campos', () => {
    expect(filterEquipment(items, { ...EMPTY_FILTERS, query: 'SOUZA' }, today).map((i) => i.name)).toEqual([
      'Notebook Dell',
    ]);
    expect(filterEquipment(items, { ...EMPTY_FILTERS, query: 'pat-1' }, today)).toHaveLength(1);
    expect(normalize('Manutenção')).toBe('manutencao');
  });
  it('filtra por status, categoria e garantia', () => {
    expect(filterEquipment(items, { ...EMPTY_FILTERS, status: 'estoque' }, today)).toHaveLength(1);
    expect(filterEquipment(items, { ...EMPTY_FILTERS, category: 'celular' }, today)).toHaveLength(1);
    expect(
      filterEquipment(items, { ...EMPTY_FILTERS, status: 'garantia' }, today).map((i) => i.name),
    ).toEqual(['Impressora']);
  });
  it('ordena por nome', () => {
    expect(filterEquipment(items, EMPTY_FILTERS, today).map((i) => i.name)).toEqual([
      'Impressora',
      'iPhone',
      'Notebook Dell',
    ]);
  });
});

describe('summarize', () => {
  it('soma valor só dos equipamentos não baixados', () => {
    const s = summarize(
      [
        make({ value: 1000 }),
        make({ value: 500, status: 'baixado' }),
        make({ value: null, status: 'estoque' }),
      ],
      today,
    );
    expect(s.total).toBe(3);
    expect(s.assetValue).toBe(1000);
    expect(s.byStatus).toEqual({ uso: 1, estoque: 1, manutencao: 0, baixado: 1 });
  });
});

describe('toEquipment', () => {
  it('preenche padrões e descarta registros sem id ou nome', () => {
    const e = toEquipment({ id: 'a', name: ' Roteador ', category: 'invalida' });
    expect(e?.name).toBe('Roteador');
    expect(e?.category).toBe('outro');
    expect(e?.status).toBe('uso');
    expect(e?.value).toBeNull();
    expect(toEquipment({ id: '', name: 'x' })).toBeNull();
    expect(toEquipment({ id: 'a', name: '  ' })).toBeNull();
    expect(toEquipment(null)).toBeNull();
  });
});
