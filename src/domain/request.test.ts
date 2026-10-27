import { describe, expect, it } from 'vitest';
import {
  STORES,
  countByRequestStatus,
  createRequest,
  filterRequests,
  mineOf,
  readRequest,
  setRequestStatus,
  toRequest,
  type RequestInput,
} from './request';

const input = (over: Partial<RequestInput> = {}): RequestInput => ({
  store: 'Loja 03',
  sector: 'Vendas',
  personName: 'Maria Souza',
  access: 'TOTVS Moda',
  notes: '',
  ...over,
});

const make = (over: Partial<RequestInput> = {}, by = 'rh@empresa.com', now = 1000, id = 'x') => {
  const r = readRequest(input(over));
  if ('error' in r) throw new Error(r.error);
  return createRequest(r.draft, by, now, id);
};

describe('STORES', () => {
  it('tem as 10 lojas', () => {
    expect(STORES).toHaveLength(10);
    expect(STORES[0]).toBe('Loja 01');
    expect(STORES[9]).toBe('Loja 10');
  });
});

describe('readRequest', () => {
  it('exige loja, setor e nome', () => {
    expect(readRequest(input({ store: '' }))).toMatchObject({ focus: 'store' });
    expect(readRequest(input({ sector: ' ' }))).toMatchObject({ focus: 'sector' });
    expect(readRequest(input({ personName: '' }))).toMatchObject({ focus: 'personName' });
  });
  it('aceita sem o acesso e sem observações', () => {
    expect('draft' in readRequest(input({ access: '', notes: '' }))).toBe(true);
  });
});

describe('toRequest', () => {
  it('ignora linhas sem id ou nome e assume pendente', () => {
    expect(toRequest({ id: '', personName: 'A' })).toBeNull();
    expect(toRequest({ id: '1', personName: ' ' })).toBeNull();
    expect(toRequest({ id: '1', personName: 'A', status: 'xyz' })?.status).toBe('pendente');
  });
});

describe('situação', () => {
  it('feito guarda o momento e reabrir apaga', () => {
    const s = make();
    const done = setRequestStatus(s, 'feito', 'usuário maria.s', 5000);
    expect(done).toMatchObject({ status: 'feito', doneAt: 5000, tiNotes: 'usuário maria.s' });
    expect(setRequestStatus(done, 'feito', 'x', 9000).doneAt).toBe(5000);
    expect(setRequestStatus(done, 'pendente', undefined, 9000).doneAt).toBeNull();
  });
});

describe('filtro e contagem', () => {
  const a = make({ personName: 'Ana', store: 'Loja 01' }, 'rh@e.com', 30, 'a');
  const b = make({ personName: 'Bia', store: 'Loja 02' }, 'rh@e.com', 10, 'b');
  const c = setRequestStatus(make({ personName: 'Carla', store: 'Loja 02' }, 'gp@e.com', 20, 'c'), 'feito');
  it('pendentes primeiro, os mais antigos antes', () => {
    expect(filterRequests([a, b, c], { query: '', status: 'all', store: 'all' }).map((x) => x.id)).toEqual([
      'b',
      'a',
      'c',
    ]);
  });
  it('filtra por loja, situação e busca sem acento', () => {
    expect(
      filterRequests([a, b, c], { query: '', status: 'all', store: 'Loja 02' }).map((x) => x.id),
    ).toEqual(['b', 'c']);
    expect(filterRequests([a, b, c], { query: '', status: 'feito', store: 'all' }).map((x) => x.id)).toEqual([
      'c',
    ]);
    expect(
      filterRequests([a, b, c], { query: 'CARLA', status: 'all', store: 'all' }).map((x) => x.id),
    ).toEqual(['c']);
  });
  it('conta por situação', () => {
    expect(countByRequestStatus([a, b, c])).toEqual({ pendente: 2, feito: 1, cancelado: 0 });
  });
  it('separa os pedidos de cada conta', () => {
    expect(mineOf([a, b, c], 'GP@e.com').map((x) => x.id)).toEqual(['c']);
    expect(mineOf([a, b, c], '')).toHaveLength(3);
  });
});
