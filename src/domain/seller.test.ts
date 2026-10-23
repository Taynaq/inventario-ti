import { describe, expect, it } from 'vitest';
import {
  applySellerDraft,
  countByStatus,
  createSeller,
  filterSellers,
  readSeller,
  sellerToText,
  toSeller,
  type SellerInput,
} from './seller';

const input = (over: Partial<SellerInput> = {}): SellerInput => ({
  name: 'Maria Souza',
  sellerCode: '120',
  personCode: '5543',
  company: '1',
  auxCode: '',
  sellerType: 'Interno',
  inactive: false,
  commTable: 'Padrão',
  commStart: '2026-10-01',
  commEnd: '',
  status: 'pendente',
  notes: '',
  ...over,
});

const make = (over: Partial<SellerInput> = {}, now = 1000, id = 'x') => {
  const r = readSeller(input(over));
  if ('error' in r) throw new Error(r.error);
  return createSeller(r.draft, 'ti@empresa.com', now, id);
};

describe('readSeller', () => {
  it('exige o nome', () => {
    expect(readSeller(input({ name: '  ' }))).toEqual({
      error: 'Informe o nome da vendedora.',
      focus: 'name',
    });
  });
  it('recusa fim da comissão antes do início', () => {
    const r = readSeller(input({ commStart: '2026-10-10', commEnd: '2026-10-01' }));
    expect(r).toMatchObject({ focus: 'commEnd' });
  });
  it('aceita só o nome', () => {
    const r = readSeller(
      input({ sellerCode: '', personCode: '', company: '', sellerType: '', commTable: '', commStart: '' }),
    );
    expect('draft' in r && r.draft.status).toBe('pendente');
  });
  it('usa pendente quando a situação é desconhecida', () => {
    const r = readSeller(input({ status: 'xyz' }));
    expect('draft' in r && r.draft.status).toBe('pendente');
  });
});

describe('toSeller', () => {
  it('ignora linhas sem id ou nome e corrige datas ruins', () => {
    expect(toSeller({ id: '', name: 'A' })).toBeNull();
    expect(toSeller({ id: '1', name: ' ' })).toBeNull();
    expect(toSeller({ id: '1', name: 'A', commStart: 'ontem' })?.commStart).toBe('');
  });
});

describe('filtro e contagem', () => {
  const a = make({ name: 'Ana', status: 'criado' }, 3, 'a');
  const b = make({ name: 'Bia' }, 1, 'b');
  const c = make({ name: 'Carla' }, 2, 'c');
  it('mostra pendentes primeiro, depois os mais novos', () => {
    expect(filterSellers([a, b, c], { query: '', status: 'all' }).map((x) => x.id)).toEqual(['c', 'b', 'a']);
  });
  it('filtra por situação e busca sem acento', () => {
    expect(filterSellers([a, b, c], { query: '', status: 'criado' }).map((x) => x.id)).toEqual(['a']);
    expect(filterSellers([a, b, c], { query: 'CARLA', status: 'all' }).map((x) => x.id)).toEqual(['c']);
  });
  it('conta por situação', () => {
    expect(countByStatus([a, b, c])).toEqual({ pendente: 2, criado: 1, cancelado: 0 });
  });
});

describe('sellerToText', () => {
  it('segue a ordem da tela PESFM009', () => {
    const t = sellerToText(make());
    expect(t.indexOf('VENDEDOR')).toBeLessThan(t.indexOf('INFORMAÇÃO DO VENDEDOR'));
    expect(t.indexOf('INFORMAÇÃO DO VENDEDOR')).toBeLessThan(t.indexOf('TABELA COMISSÃO'));
    expect(t).toContain('Nome: Maria Souza');
    expect(t).toContain('Dt. início: 01/10/2026');
    expect(t).toContain('Dt. fim: —');
  });
});

describe('applySellerDraft', () => {
  it('muda a situação e mantém quem pediu', () => {
    const s = make();
    const r = readSeller(input({ status: 'criado' }));
    if ('error' in r) throw new Error('x');
    const next = applySellerDraft(s, r.draft, 2000);
    expect(next).toMatchObject({ status: 'criado', requestedBy: 'ti@empresa.com', updatedAt: 2000 });
  });
});
