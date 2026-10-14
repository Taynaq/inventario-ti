import { describe, expect, it } from 'vitest';
import {
  guessCategory,
  guessMapping,
  guessStatus,
  parseCsvRows,
  parseDate,
  splitDuplicates,
  tableFromCsv,
  tableFromTextItems,
  toDrafts,
  type TextItem,
} from './importing';

describe('guessMapping', () => {
  it('reconhece títulos comuns em português, com ou sem acento', () => {
    const m = guessMapping([
      'Equipamento',
      'Nº de Série',
      'Patrimônio',
      'Responsável',
      'Setor',
      'Valor (R$)',
    ]);
    expect(m).toMatchObject({ name: 0, serial: 1, tag: 2, owner: 3, location: 4, value: 5 });
  });

  it('usa cada coluna uma vez só', () => {
    const m = guessMapping(['Nome', 'Marca/Modelo']);
    expect(m.name).toBe(0);
    expect(m.brand).toBe(1);
  });

  it('prefere a garantia final à data de compra quando os dois aparecem', () => {
    const m = guessMapping(['Item', 'Data de compra', 'Garantia até']);
    expect(m.buyDate).toBe(1);
    expect(m.warrantyEnd).toBe(2);
  });
});

describe('parseCsvRows', () => {
  it('lê ponto e vírgula (Excel brasileiro), aspas e vírgula dentro de aspas', () => {
    const rows = parseCsvRows('Nome;Valor\r\n"Monitor 27"", LG";1.250,00\r\nMouse;80,00\r\n');
    expect(rows).toEqual([
      ['Nome', 'Valor'],
      ['Monitor 27", LG', '1.250,00'],
      ['Mouse', '80,00'],
    ]);
  });

  it('lê vírgula e ignora o BOM e linhas vazias', () => {
    expect(parseCsvRows('﻿a,b\n\n1,2\n')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });
});

describe('tableFromCsv', () => {
  it('pula linhas de título do relatório até achar os cabeçalhos', () => {
    const t = tableFromCsv(
      'Relatório de equipamentos\n\nEquipamento;Patrimônio;Responsável\nNotebook;PAT-1;Ana\n',
    );
    expect(t.header).toEqual(['Equipamento', 'Patrimônio', 'Responsável']);
    expect(t.rows).toEqual([['Notebook', 'PAT-1', 'Ana']]);
  });
});

describe('parseDate', () => {
  it('converte formatos brasileiros e ISO', () => {
    expect(parseDate('13/10/2026')).toBe('2026-10-13');
    expect(parseDate('1/2/2027')).toBe('2027-02-01');
    expect(parseDate('13-10-26')).toBe('2026-10-13');
    expect(parseDate('2026-10-13')).toBe('2026-10-13');
  });
  it('recusa datas impossíveis ou texto', () => {
    expect(parseDate('31/02/2026')).toBe('');
    expect(parseDate('breve')).toBe('');
    expect(parseDate('')).toBe('');
  });
});

describe('guessCategory e guessStatus', () => {
  it('chuta a categoria pelo nome', () => {
    expect(guessCategory('Notebook Dell Latitude')).toBe('notebook');
    expect(guessCategory('iPhone 13')).toBe('celular');
    expect(guessCategory('Impressoras HP')).toBe('impressora');
    expect(guessCategory('Switch Cisco 24p')).toBe('rede');
    expect(guessCategory('Cadeira')).toBe('outro');
  });
  it('chuta o status', () => {
    expect(guessStatus('Em manutenção')).toBe('manutencao');
    expect(guessStatus('Estoque')).toBe('estoque');
    expect(guessStatus('Descartado')).toBe('baixado');
    expect(guessStatus('')).toBe('uso');
  });
});

describe('toDrafts', () => {
  const mapping = guessMapping(['Equipamento', 'Patrimônio', 'Compra', 'Valor']);
  it('monta os equipamentos e conta o que foi ignorado', () => {
    const r = toDrafts(
      [
        ['Notebook Dell', 'PAT-1', '10/01/2024', 'R$ 5.890,00'],
        ['', 'PAT-2', '', ''],
        ['Mouse', 'PAT-3', '32/13/2024', 'abc'],
      ],
      mapping,
    );
    expect(r.drafts).toHaveLength(2);
    expect(r.skippedNoName).toBe(1);
    expect(r.warnings).toBe(2);
    expect(r.drafts[0]).toMatchObject({
      name: 'Notebook Dell',
      category: 'notebook',
      tag: 'PAT-1',
      buyDate: '2024-01-10',
      value: 5890,
    });
    expect(r.drafts[1]).toMatchObject({ buyDate: '', value: null, category: 'periferico' });
  });
});

describe('splitDuplicates', () => {
  it('separa o que já existe por patrimônio ou série, e repetidos dentro do arquivo', () => {
    const base = {
      category: 'outro' as const,
      status: 'uso' as const,
      owner: '',
      brand: '',
      location: '',
      buyDate: '',
      warrantyEnd: '',
      value: null,
      notes: '',
    };
    const { fresh, duplicates } = splitDuplicates(
      [{ tag: 'PAT-1', serial: '' }],
      [
        { ...base, name: 'A', tag: 'pat-1', serial: '' },
        { ...base, name: 'B', tag: 'PAT-2', serial: 'S1' },
        { ...base, name: 'C', tag: 'PAT-2', serial: '' },
        { ...base, name: 'D', tag: '', serial: '' },
        { ...base, name: 'E', tag: '', serial: '' },
      ],
    );
    expect(duplicates.map((d) => d.name)).toEqual(['A', 'C']);
    expect(fresh.map((d) => d.name)).toEqual(['B', 'D', 'E']);
  });
});

describe('tableFromTextItems (texto de PDF)', () => {
  const t = (text: string, x: number, y: number, page = 1, width = text.length * 5): TextItem => ({
    text,
    x,
    y,
    width,
    height: 10,
    page,
  });

  it('reconstrói colunas, mantém célula vazia no lugar e junta palavras da mesma célula', () => {
    const items = [
      t('Relatório de Ativos', 40, 800),
      t('Equipamento', 40, 760),
      t('Patrimônio', 200, 760),
      t('Responsável', 300, 760),
      t('Valor', 420, 760),
      t('Notebook', 40, 740),
      t('Dell', 82, 740),
      t('PAT-0001', 200, 740),
      t('Ana', 300, 740),
      t('5890', 424, 740),
      t('Monitor', 40, 720),
      t('PAT-0002', 200, 720), // sem responsável
      t('1250', 424, 720),
    ];
    const table = tableFromTextItems(items);
    expect(table.header).toEqual(['Equipamento', 'Patrimônio', 'Responsável', 'Valor']);
    expect(table.rows).toEqual([
      ['Notebook Dell', 'PAT-0001', 'Ana', '5890'],
      ['Monitor', 'PAT-0002', '', '1250'],
    ]);
  });

  it('segue por várias páginas, ignora título repetido e rodapé de página', () => {
    const items = [
      t('Equipamento', 40, 760),
      t('Patrimônio', 200, 760),
      t('Mouse', 40, 740),
      t('PAT-1', 200, 740),
      t('Página 1 de 2', 40, 30),
      t('Equipamento', 40, 760, 2),
      t('Patrimônio', 200, 760, 2),
      t('Teclado', 40, 740, 2),
      t('PAT-2', 200, 740, 2),
    ];
    const table = tableFromTextItems(items);
    expect(table.rows).toEqual([
      ['Mouse', 'PAT-1'],
      ['Teclado', 'PAT-2'],
    ]);
  });

  it('junta células quebradas em duas linhas, inclusive nos títulos', () => {
    const w = (text: string, x: number, y: number): TextItem => ({
      text,
      x,
      y,
      width: text.length * 5,
      height: 10,
      page: 1,
    });
    const items: TextItem[] = [
      // título em duas linhas: "Nº de série" e "Data da compra"
      w('Equipamento', 40, 760),
      w('Nº de', 200, 760),
      w('série', 200, 749),
      w('Data da', 300, 760),
      w('compra', 300, 749),
    ];
    // 5 linhas da tabela, cada uma com o nome em duas linhas (espaço 11 dentro, 25 entre linhas)
    for (let i = 0; i < 5; i++) {
      const y = 715 - i * 36;
      items.push(w(`Notebook ${i}`, 40, y), w('Dell Latitude', 40, y - 11));
      items.push(w(`SN${i}00`, 200, y), w(`1${i}/01/2024`, 300, y));
    }
    const table = tableFromTextItems(items);
    expect(table.header).toEqual(['Equipamento', 'Nº de série', 'Data da compra']);
    expect(table.rows).toHaveLength(5);
    expect(table.rows[0]).toEqual(['Notebook 0 Dell Latitude', 'SN000', '10/01/2024']);
    expect(table.rows[4]).toEqual(['Notebook 4 Dell Latitude', 'SN400', '14/01/2024']);
  });

  it('devolve tabela vazia quando não há texto', () => {
    expect(tableFromTextItems([])).toEqual({ header: [], rows: [] });
  });
});
