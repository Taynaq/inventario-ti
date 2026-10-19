import type { Equipment } from '../types';
import { describeError, type Store } from '../data/store';
import { CATEGORY_LABELS, STATUS_LABELS } from '../domain/catalog';
import { createEquipment } from '../domain/equipment';
import {
  IMPORT_FIELDS,
  guessMapping,
  splitDuplicates,
  tableFromCsv,
  tableFromTextItems,
  toDrafts,
  type ImportField,
  type Mapping,
  type ParsedTable,
} from '../domain/importing';
import { $, esc, toast } from './dom';

const MAX_BYTES = 20 * 1024 * 1024;
const PREVIEW_ROWS = 5;

/** Lê o arquivo como texto. CSV do Excel brasileiro costuma vir em Windows-1252, não UTF-8. */
async function readText(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const utf8 = new TextDecoder('utf-8').decode(buf);
  return utf8.includes('�') ? new TextDecoder('windows-1252').decode(buf) : utf8;
}

export class ImportView {
  private table: ParsedTable | null = null;
  private mapping!: Mapping;
  private fileName = '';
  private skipDuplicates = true;
  private busy = false;
  private error = '';
  private result: { ids: string[]; ignored: number; blank: number } | null = null;

  constructor(
    private readonly root: HTMLElement,
    private readonly store: Store,
    private readonly getItems: () => readonly Equipment[],
    private readonly showList: () => void,
  ) {
    root.addEventListener('change', (e) => {
      const t = e.target as HTMLElement;
      if (t instanceof HTMLInputElement && t.id === 'imp-file') {
        const file = t.files?.[0];
        t.value = '';
        if (file) void this.load(file);
      } else if (t instanceof HTMLSelectElement && t.dataset.field) {
        this.mapping[t.dataset.field as ImportField] = t.value === '' ? null : Number(t.value);
        this.renderBody();
      } else if (t instanceof HTMLInputElement && t.id === 'imp-skip') {
        this.skipDuplicates = t.checked;
        this.renderBody();
      }
    });
    root.addEventListener('click', (e) => {
      const act = (e.target as Element).closest<HTMLElement>('[data-act]')?.dataset.act;
      if (act === 'imp-run') void this.run();
      else if (act === 'imp-reset') this.reset();
      else if (act === 'imp-undo') void this.undo();
      else if (act === 'imp-list') this.showList();
    });
    this.render();
  }

  /** Chamado quando a lista de equipamentos muda, para refazer a checagem de duplicados. */
  update(): void {
    if (this.table && !this.result) this.renderBody();
  }

  private reset(): void {
    this.table = null;
    this.result = null;
    this.error = '';
    this.fileName = '';
    this.render();
  }

  private render(): void {
    this.root.innerHTML =
      `<section class="imp-card"><h2>Importar equipamentos</h2>` +
      `<p class="muted">Escolha um arquivo <strong>PDF</strong> com a tabela dos seus equipamentos, ou um <strong>CSV</strong> ` +
      `(no Excel: Arquivo, Salvar como, CSV). Você confere tudo antes de importar.</p>` +
      `<label class="btn primary filebtn" for="imp-file">Escolher arquivo</label>` +
      `<input id="imp-file" type="file" accept=".pdf,.csv,.txt,application/pdf,text/csv" hidden />` +
      `<p class="msg bad" id="imp-err" role="alert"></p></section>` +
      `<div id="imp-body"></div>`;
    $('#imp-err').textContent = this.error;
    this.renderBody();
  }

  private setError(message: string): void {
    this.error = message;
    const el = this.root.querySelector('#imp-err');
    if (el) el.textContent = message;
  }

  private async load(file: File): Promise<void> {
    this.result = null;
    this.table = null;
    this.setError('');
    if (file.size > MAX_BYTES) {
      this.setError('O arquivo é grande demais (limite de 20 MB).');
      return this.renderBody();
    }
    this.busy = true;
    this.fileName = file.name;
    this.renderBody();
    try {
      let table: ParsedTable;
      if (/\.pdf$/i.test(file.name) || file.type === 'application/pdf') {
        const { readPdfText } = await import('../data/pdfText');
        table = tableFromTextItems(await readPdfText(file));
      } else {
        table = tableFromCsv(await readText(file));
      }
      if (table.rows.length === 0 || table.header.length === 0) {
        this.setError('Não encontrei nenhuma tabela de equipamentos nesse arquivo.');
      } else {
        this.table = table;
        this.mapping = guessMapping(table.header);
        // Se achou a coluna do nome, importa direto. A pessoa pode desfazer depois.
        if (this.mapping.name !== null) {
          const total = this.plan();
          if (total.toImport.length > 0) {
            this.busy = false;
            await this.run();
            return;
          }
          this.table = null;
          this.setError(
            `Os ${total.drafts.length} equipamentos desse arquivo já estão cadastrados. Nada foi importado.`,
          );
        }
      }
    } catch (e) {
      const code = (e as { code?: string }).code;
      this.setError(
        code === 'scanned'
          ? 'Esse PDF parece ser uma foto ou digitalização, sem texto para ler. Peça o arquivo original (do Excel ou do sistema) ou exporte como CSV.'
          : code === 'password'
            ? 'Esse PDF tem senha. Abra, salve uma cópia sem senha e tente de novo.'
            : 'Não consegui ler esse arquivo. Confira se é um PDF ou CSV válido.',
      );
    } finally {
      this.busy = false;
      this.renderBody();
    }
  }

  /** Calcula o que será importado com as escolhas atuais. */
  private plan() {
    const table = this.table as ParsedTable;
    const built = toDrafts(table.rows, this.mapping, table.header);
    const { fresh, duplicates } = splitDuplicates(this.getItems(), built.drafts);
    return { ...built, toImport: this.skipDuplicates ? fresh : built.drafts, duplicates };
  }

  private renderBody(): void {
    const body = this.root.querySelector<HTMLElement>('#imp-body');
    if (!body) return;

    if (this.busy) {
      body.innerHTML = `<section class="imp-card"><p class="muted">Lendo ${esc(this.fileName)}…</p></section>`;
      return;
    }

    if (this.result) {
      const n = this.result.ids.length;
      body.innerHTML =
        `<section class="imp-card"><h2>${n} ${n === 1 ? 'equipamento importado' : 'equipamentos importados'}</h2>` +
        `<p class="muted">Eles já estão na lista.` +
        (this.result.ignored > 0 ? ` ${this.result.ignored} já cadastrados foram ignorados.` : '') +
        (this.result.blank > 0
          ? ` ${this.result.blank} datas ou valores não foram entendidos e ficaram em branco.`
          : '') +
        ` Se algo ficou errado, você pode desfazer esta importação.</p>` +
        `<div class="row-btns"><button type="button" class="btn" data-act="imp-undo">Desfazer importação</button>` +
        `<button type="button" class="btn primary" data-act="imp-list">Ver na lista</button></div></section>`;
      return;
    }

    if (!this.table) {
      body.innerHTML = '';
      return;
    }

    const { header } = this.table;
    const plan = this.plan();
    const canRun = this.mapping.name !== null && plan.toImport.length > 0;

    const selects = IMPORT_FIELDS.map((f) => {
      const current = this.mapping[f.id];
      const options =
        `<option value="">— não importar —</option>` +
        header
          .map(
            (h, i) =>
              `<option value="${i}"${current === i ? ' selected' : ''}>${esc(h || `Coluna ${i + 1}`)}</option>`,
          )
          .join('');
      return (
        `<div class="field"><label for="map-${f.id}">${esc(f.label)}${f.required ? ' <span class="req">(obrigatório)</span>' : ''}</label>` +
        `<select id="map-${f.id}" data-field="${f.id}">${options}</select></div>`
      );
    }).join('');

    const preview = plan.toImport
      .slice(0, PREVIEW_ROWS)
      .map((d) => {
        const line = [CATEGORY_LABELS[d.category], STATUS_LABELS[d.status], d.owner, d.location]
          .filter(Boolean)
          .join(' · ');
        return (
          `<li class="pv"><span class="name">${esc(d.name)}</span>` +
          `<span class="sub">${esc(line)}</span>` +
          (d.tag || d.serial
            ? `<span class="sub mono">${esc([d.tag, d.serial].filter(Boolean).join(' · '))}</span>`
            : '') +
          `</li>`
        );
      })
      .join('');

    const notes: string[] = [];
    if (this.skipDuplicates && plan.duplicates.length > 0) {
      notes.push(`${plan.duplicates.length} já cadastrados (mesmo patrimônio ou série) serão ignorados`);
    }
    if (plan.skippedNoName > 0) notes.push(`${plan.skippedNoName} linhas sem nome serão ignoradas`);
    if (plan.warnings > 0) notes.push(`${plan.warnings} datas ou valores não entendidos ficarão em branco`);

    body.innerHTML =
      `<section class="imp-card"><h2>Confira as colunas</h2>` +
      `<p class="muted">Arquivo <strong>${esc(this.fileName)}</strong>: ${this.table.rows.length} linhas lidas. ` +
      `Ajuste se alguma coluna foi reconhecida errado.</p>` +
      `<div class="map-grid">${selects}</div></section>` +
      `<section class="imp-card"><h2>Prévia</h2>` +
      (this.mapping.name === null
        ? `<p class="msg bad">Escolha qual coluna é o nome do equipamento.</p>`
        : plan.toImport.length === 0
          ? `<p class="msg bad">Nada para importar com essas escolhas.</p>`
          : `<ul class="pv-list">${preview}</ul>` +
            (plan.toImport.length > PREVIEW_ROWS
              ? `<p class="panel-note">e mais ${plan.toImport.length - PREVIEW_ROWS}…</p>`
              : '')) +
      (notes.length ? `<p class="panel-note">${esc(notes.join('. '))}.</p>` : '') +
      `<label class="checkrow"><input id="imp-skip" type="checkbox"${this.skipDuplicates ? ' checked' : ''} />` +
      `Ignorar equipamentos que já existem (mesmo patrimônio ou número de série)</label>` +
      `<div class="row-btns"><button type="button" class="btn" data-act="imp-reset">Escolher outro arquivo</button>` +
      `<button type="button" class="btn primary" data-act="imp-run"${canRun ? '' : ' disabled'}>` +
      `Importar ${plan.toImport.length} ${plan.toImport.length === 1 ? 'equipamento' : 'equipamentos'}</button></div></section>`;
  }

  private async run(): Promise<void> {
    if (!this.table || this.busy) return;
    const plan = this.plan();
    const items = plan.toImport.map((d) => createEquipment(d));
    this.busy = true;
    this.renderBody();
    try {
      await this.store.saveMany(items);
      this.result = {
        ids: items.map((i) => i.id),
        ignored: this.skipDuplicates ? plan.duplicates.length : 0,
        blank: plan.warnings,
      };
      this.table = null;
      toast(`${items.length} equipamentos importados`);
    } catch (e) {
      this.setError(describeError(e));
    } finally {
      this.busy = false;
      this.renderBody();
    }
  }

  private async undo(): Promise<void> {
    if (!this.result) return;
    try {
      await this.store.removeMany(this.result.ids);
      toast('Importação desfeita');
      this.reset();
    } catch (e) {
      toast(describeError(e));
    }
  }
}
