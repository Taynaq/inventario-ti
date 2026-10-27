import './styles.css';
import { AccessApi } from './data/access';
import { CloudBreakdownStore, LocalBreakdownStore, type BreakdownStore } from './data/breakdownStore';
import { CloudStore } from './data/cloudStore';
import { CloudIncidentStore, LocalIncidentStore, type IncidentStore } from './data/incidentStore';
import { LocalStore } from './data/localStore';
import { CloudRequestStore, LocalRequestStore, type RequestStore } from './data/requestStore';
import type { Store } from './data/store';
import { createSupabase } from './data/supabaseClient';
import { MODULE_IDS, type ModuleId } from './modules';
import { BreakdownView } from './ui/breakdownView';
import { $ } from './ui/dom';
import { requireMember, signOut } from './ui/auth';
import { HomeView } from './ui/homeView';
import { InventoryView } from './ui/inventoryView';
import { RequestView } from './ui/requestView';
import { Shell, type Screen } from './ui/shell';

async function main(): Promise<void> {
  const db = createSupabase();
  let shell: Shell | null = null;
  const setSummary = (text: string): void => {
    if (!shell?.isHome) $('#summary').textContent = text;
  };

  let store: Store;
  let breakdowns: BreakdownStore;
  let requests: RequestStore;
  let incidents: IncidentStore;
  let account = '';
  let modules: readonly ModuleId[] = MODULE_IDS;
  let access: AccessApi | null = null;
  let onSignOut: (() => void) | null = null;
  let options: ConstructorParameters<typeof InventoryView>[2] = {};

  if (!db) {
    // Sem as chaves do Supabase o app funciona sozinho, guardando tudo neste navegador.
    store = new LocalStore();
    breakdowns = new LocalBreakdownStore();
    requests = new LocalRequestStore();
    incidents = new LocalIncidentStore();
  } else {
    account = await requireMember(db);
    store = new CloudStore(db);
    breakdowns = new CloudBreakdownStore(db);
    requests = new CloudRequestStore(db);
    incidents = new CloudIncidentStore(db);
    const api = new AccessApi(db, account.toLowerCase());
    modules = await api.myModules();
    if (await api.isAdmin()) access = api;
    options = { account };
    const avatar = $('#avatar');
    avatar.textContent = (account.trim()[0] ?? '?').toUpperCase();
    avatar.title = account;
    avatar.hidden = false;
    onSignOut = () => void signOut(db);
  }

  const inventory = new InventoryView(store, incidents, options);
  const quebras = new BreakdownView(breakdowns, setSummary);
  const solicitacoes = new RequestView(requests, account, access !== null || !db, setSummary);
  // Só monta (e assina no banco) as telas que a pessoa pode usar.
  if (modules.includes('inventario')) inventory.mount();
  if (modules.includes('quebras')) quebras.mount();
  if (modules.includes('solicitacoes')) solicitacoes.mount();
  const screens: Record<ModuleId, Screen> = { inventario: inventory, quebras, solicitacoes };
  const home = new HomeView($('#modHome'), {
    modules,
    admin: access !== null || !db,
    account,
    store: modules.includes('inventario') ? store : null,
    breakdowns: modules.includes('quebras') ? breakdowns : null,
    requests: modules.includes('solicitacoes') ? requests : null,
    go: (section) => shell?.show(section),
  });
  home.mount();
  shell = new Shell(screens, modules, access, setSummary, home);
  shell.mount();
  if (onSignOut) {
    const out = document.getElementById('signOut');
    if (out) {
      out.hidden = false;
      out.addEventListener('click', onSignOut);
    }
  }
}

void main();
