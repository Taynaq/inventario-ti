import type { AccessApi } from '../data/access';
import { MODULES, isModuleId, moduleLabel, type ModuleId } from '../modules';
import { AccessView } from './accessView';
import { $, esc } from './dom';
import type { HomeView } from './homeView';
import { SECTION_ICONS } from './navIcons';

export type Section = ModuleId | 'acessos' | 'inicio';

/** Uma tela do app que pode ser mostrada ou escondida. */
export interface Screen {
  setActive(active: boolean): void;
}

/** Menu do topo: troca entre as telas que a pessoa pode usar (e Acessos, para administradores). */
export class Shell {
  private current: Section | null = null;
  private access: AccessView | null = null;

  constructor(
    private readonly screens: Record<ModuleId, Screen>,
    private readonly modules: readonly ModuleId[],
    private readonly admin: AccessApi | null,
    private readonly setSummary: (text: string) => void,
    private readonly home: HomeView,
  ) {}

  /** Verdadeiro enquanto a tela inicial está aberta (as outras telas não escrevem no subtítulo). */
  get isHome(): boolean {
    return this.current === 'inicio';
  }

  private sections(): { id: Section; label: string }[] {
    const list: { id: Section; label: string }[] = [{ id: 'inicio', label: 'Início' }];
    list.push(
      ...MODULES.filter((m) => this.modules.includes(m.id)).map((m) => ({
        id: m.id,
        label: m.short,
      })),
    );
    if (this.admin) list.push({ id: 'acessos', label: 'Acessos' });
    return list;
  }

  mount(): void {
    $('#app').hidden = false;
    const sections = this.sections();
    const nav = $('#modules');
    nav.innerHTML = sections
      .map(
        (s) =>
          `<button type="button" class="bn" data-section="${s.id}">${SECTION_ICONS[s.id]}<span>${esc(s.label)}</span></button>`,
      )
      .join('');
    nav.addEventListener('click', (e) => {
      const id = (e.target as Element).closest<HTMLElement>('[data-section]')?.dataset.section;
      if (id === 'inicio' || id === 'acessos' || isModuleId(id)) this.show(id);
    });
    if (this.admin) this.access = new AccessView($('#modAccess'), this.admin);

    this.show('inicio');
  }

  show(section: Section): void {
    this.current = section;
    document.querySelectorAll<HTMLElement>('[data-section]').forEach((b) => {
      if (b.dataset.section === section) b.setAttribute('aria-current', 'page');
      else b.removeAttribute('aria-current');
    });
    for (const m of MODULES) this.screens[m.id].setActive(section === m.id);
    $('#modAccess').hidden = section !== 'acessos';
    this.home.setActive(section === 'inicio');
    $('#pageTitle').textContent = this.title;
    if (section === 'inicio') {
      $('#summary').textContent = new Date().toLocaleDateString('pt-BR', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
      });
      $('#addBtn').hidden = true;
      $('#addQ').hidden = true;
    }
    if (section === 'acessos') {
      this.setSummary('Quem pode usar o app');
      $('#addBtn').hidden = true;
      $('#addQ').hidden = true;
      void this.access?.refresh();
    }
    window.scrollTo(0, 0);
  }

  /** Nome da tela aberta, para títulos e testes. */
  get title(): string {
    if (this.current === 'inicio') return 'Início';
    return this.current === 'acessos' ? 'Acessos' : this.current ? moduleLabel(this.current) : '';
  }
}
