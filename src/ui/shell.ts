import type { AccessApi } from '../data/access';
import { MODULES, isModuleId, moduleLabel, type ModuleId } from '../modules';
import { AccessView } from './accessView';
import { $, esc } from './dom';

export type Section = ModuleId | 'acessos';

/** Uma tela do app que pode ser mostrada ou escondida. */
export interface Screen {
  setActive(active: boolean): void;
}

const LAST_KEY = 'central-gestao:ultima-tela';

/** Menu do topo: troca entre as telas que a pessoa pode usar (e Acessos, para administradores). */
export class Shell {
  private current: Section | null = null;
  private access: AccessView | null = null;

  constructor(
    private readonly screens: Record<ModuleId, Screen>,
    private readonly modules: readonly ModuleId[],
    private readonly admin: AccessApi | null,
    private readonly setSummary: (text: string) => void,
  ) {}

  private sections(): { id: Section; label: string }[] {
    const list: { id: Section; label: string }[] = MODULES.filter((m) => this.modules.includes(m.id)).map(
      (m) => ({
        id: m.id,
        label: m.short,
      }),
    );
    if (this.admin) list.push({ id: 'acessos', label: 'Acessos' });
    return list;
  }

  mount(): void {
    $('#app').hidden = false;
    const sections = this.sections();
    const nav = $('#modules');
    nav.hidden = sections.length < 2;
    nav.innerHTML = sections
      .map((s) => `<button type="button" class="tab" data-section="${s.id}">${esc(s.label)}</button>`)
      .join('');
    nav.addEventListener('click', (e) => {
      const id = (e.target as Element).closest<HTMLElement>('[data-section]')?.dataset.section;
      if (id === 'acessos' || isModuleId(id)) this.show(id);
    });
    if (this.admin) this.access = new AccessView($('#modAccess'), this.admin);

    let saved = '';
    try {
      saved = localStorage.getItem(LAST_KEY) ?? '';
    } catch {
      // sem armazenamento do navegador: abre a primeira tela
    }
    const first = sections.find((s) => s.id === saved) ?? sections[0];
    if (first) this.show(first.id);
  }

  show(section: Section): void {
    this.current = section;
    document.querySelectorAll<HTMLElement>('[data-section]').forEach((b) => {
      if (b.dataset.section === section) b.setAttribute('aria-current', 'page');
      else b.removeAttribute('aria-current');
    });
    for (const m of MODULES) this.screens[m.id].setActive(section === m.id);
    $('#modAccess').hidden = section !== 'acessos';
    if (section === 'acessos') {
      this.setSummary('Quem pode usar o app');
      $('#addBtn').hidden = true;
      $('#addQ').hidden = true;
      void this.access?.refresh();
    }
    try {
      localStorage.setItem(LAST_KEY, section);
    } catch {
      // ignorado: lembrar a última tela é só uma comodidade
    }
    window.scrollTo(0, 0);
  }

  /** Nome da tela aberta, para títulos e testes. */
  get title(): string {
    return this.current === 'acessos' ? 'Acessos' : this.current ? moduleLabel(this.current) : '';
  }
}
