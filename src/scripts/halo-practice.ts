import { supabase } from './halo-account';

type Snapshot = { state: { onboarded?: boolean }; caps: Record<string, string> };
declare global {
  interface Window {
    haloPractice: { useAccount: () => void; apply: (snapshot: Snapshot | null) => void; browserRun: () => Snapshot };
  }
}

if (supabase) {
  const client = supabase;
  const account = document.querySelector<HTMLDetailsElement>('.workspace-account')!;
  const status = document.querySelector<HTMLElement>('[data-sync-status]')!;
  const retry = document.querySelector<HTMLButtonElement>('[data-sync-retry]')!;
  const importRun = document.querySelector<HTMLButtonElement>('[data-import-run]')!;
  const practice = document.querySelectorAll<HTMLElement>('.screens, .onboard');
  let userId: string | null | undefined;
  let revision: number | null = null;
  let pending: Snapshot | null = null;
  let busy = false;
  let loaded = false;
  let conflict = false;

  function lock(value: boolean) { practice.forEach((element) => { element.inert = value; }); }

  async function load(id: string) {
    lock(true);
    retry.hidden = true;
    status.textContent = 'Loading account practice…';
    const { data, error } = await client.from('halo_practice').select('snapshot, revision').eq('user_id', id).maybeSingle();
    if (userId !== id) return;
    if (error) {
      account.open = true;
      status.textContent = 'Could not load account practice.';
      retry.hidden = false;
      return;
    }
    revision = data?.revision ?? null;
    window.haloPractice.apply(data?.snapshot ?? null);
    loaded = true;
    lock(false);
    status.textContent = data ? 'Saved to your HALO account.' : 'New account practice.';
    importRun.hidden = Boolean(data) || !window.haloPractice.browserRun().state?.onboarded;
  }

  async function save() {
    if (!userId || !loaded || busy || conflict || !pending) return;
    const id = userId;
    const snapshot = pending;
    const nextRevision = (revision ?? 0) + 1;
    busy = true;
    retry.hidden = true;
    status.textContent = 'Saving to your account…';
    const result = revision === null
      ? await client.from('halo_practice').insert({ user_id: id, snapshot }).select('revision').single()
      : await client.from('halo_practice').update({ snapshot, revision: nextRevision })
        .eq('user_id', id).eq('revision', revision).select('revision').maybeSingle();
    busy = false;
    if (userId !== id) return;
    if (result.error?.code === '23505' || (!result.error && !result.data)) {
      conflict = true;
      account.open = true;
      status.textContent = 'Another device saved a newer version. This screen still has your changes.';
      retry.textContent = 'Load account version';
      retry.hidden = false;
      return;
    }
    if (result.error) {
      account.open = true;
      status.textContent = 'Account save failed. Your changes are still on this screen.';
      retry.hidden = false;
      return;
    }
    revision = result.data.revision;
    if (pending === snapshot) pending = null;
    status.textContent = 'Saved to your HALO account.';
    if (pending) void save();
  }

  client.auth.onAuthStateChange((_event, session) => {
    const id = session?.user.id ?? null;
    if (id === userId) return;
    if (userId && id !== userId) {
      userId = id;
      lock(true);
      window.haloPractice.apply(null);
      location.reload();
      return;
    }
    userId = id;
    if (!id) {
      lock(false);
      status.textContent = 'Saved in this browser. Sign in to sync.';
      return;
    }
    window.haloPractice.useAccount();
    window.setTimeout(() => { if (userId === id) void load(id); }, 0);
  });

  window.addEventListener('halo:practice-save', (event) => {
    pending = (event as CustomEvent<Snapshot>).detail;
    importRun.hidden = true;
    void save();
  });
  retry.addEventListener('click', () => {
    if (!userId) return;
    if (conflict) {
      if (!confirm('Load the account version and discard the unsynced changes on this screen?')) return;
      conflict = false;
      pending = null;
      loaded = false;
      retry.textContent = 'Retry';
    }
    if (loaded) void save();
    else void load(userId);
  });
  importRun.addEventListener('click', () => {
    if (!loaded || revision !== null || pending) return;
    const snapshot = window.haloPractice.browserRun();
    window.haloPractice.apply(snapshot);
    pending = snapshot;
    importRun.hidden = true;
    void save();
  });
  window.addEventListener('beforeunload', (event) => {
    if (pending) { event.preventDefault(); event.returnValue = true; }
  });
  window.addEventListener('halo:before-sign-out', (event) => {
    if (pending) {
      event.preventDefault();
      status.textContent = 'Resolve the unsynced changes before signing out.';
    }
  });
}
