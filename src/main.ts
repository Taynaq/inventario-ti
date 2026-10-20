import './styles.css';
import { AccessApi } from './data/access';
import { CloudStore } from './data/cloudStore';
import { LocalStore } from './data/localStore';
import type { Store } from './data/store';
import { createSupabase } from './data/supabaseClient';
import { requireMember, signOut } from './ui/auth';
import { InventoryView } from './ui/inventoryView';

async function main(): Promise<void> {
  const db = createSupabase();

  // Sem as chaves do Supabase o app funciona sozinho, guardando tudo neste navegador.
  if (!db) {
    new InventoryView(new LocalStore()).mount();
    return;
  }

  const account = await requireMember(db);
  const store: Store = new CloudStore(db);
  new InventoryView(store, {
    account,
    onSignOut: () => void signOut(db),
    access: new AccessApi(db, account.toLowerCase()),
  }).mount();
}

void main();
