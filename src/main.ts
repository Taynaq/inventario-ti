import './styles.css';
import { AccessApi } from './data/access';
import { CloudBreakdownStore, LocalBreakdownStore, type BreakdownStore } from './data/breakdownStore';
import { CloudStore } from './data/cloudStore';
import { CloudIncidentStore, LocalIncidentStore, type IncidentStore } from './data/incidentStore';
import { LocalStore } from './data/localStore';
import { CloudSellerStore, LocalSellerStore, type SellerStore } from './data/sellerStore';
import type { Store } from './data/store';
import { createSupabase } from './data/supabaseClient';
import { MODULE_IDS, type ModuleId } from './modules';
import { BreakdownView } from './ui/breakdownView';
import { $ } from './ui/dom';
import { requireMember, signOut } from './ui/auth';
import { HomeView } from './ui/homeView';
import { InventoryView } from './ui/inventoryView';
import { SellerView } from './ui/sellerView';
import { Shell, type Screen } from './ui/shell';

async function main(): Promise<void> {
  const db = createSupabase();
  let shell: Shell | null = null;
  const setSummary = (text: string): void => {
    if (!shell?.isHome) $('#summary').textContent = text;
  };

  let store: Store;
  let breakdowns: BreakdownStore;
  let sellers: SellerStore;
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
    sellers = new LocalSellerStore();
    incidents = new LocalIncidentStore();
  } else {
    account = await requireMember(db);
    store = new CloudStore(db);
    breakdowns = new CloudBreakdownStore(db);
    sellers = new CloudSellerStore(db);
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
  const vendedores = new SellerView(sellers, account, setSummary);
  // Só monta (e assina no banco) as telas que a pessoa pode usar.
  if (modules.includes('inventario')) inventory.mount();
  if (modules.includes('quebras')) quebras.mount();
  if (modules.includes('vendedores')) vendedores.mount();
  const screens: Record<ModuleId, Screen> = { inventario: inventory, quebras, vendedores };
  const home = new HomeView($('#modHome'), {
    modules,
    admin: access !== null,
    store: modules.includes('inventario') ? store : null,
    breakdowns: modules.includes('quebras') ? breakdowns : null,
    sellers: modules.includes('vendedores') ? sellers : null,
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
