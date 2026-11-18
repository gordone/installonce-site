/** Supabase session bridge. UI methods never assert an owner or log account data. */
export function createNativeHaloAuth({ client, dialog, form, email, send, cancel, status, redirectTo,
  schedule = (callback) => setTimeout(callback, 0) }) {
  const listeners = new Set();
  let pending = null;
  let disposed = false;
  function finish(accepted) {
    const current = pending;
    if (!current) return;
    pending = null;
    email.value = ''; email.disabled = false; send.disabled = false; status.textContent = '';
    if (dialog.open) dialog.close();
    if (accepted) current.resolve();
    else current.reject(new DOMException('Sign-in cancelled', 'AbortError'));
  }
  function onClose() { if (!dialog.open) finish(false); }
  function onCancel(event) { event.preventDefault(); finish(false); }
  function onCancelButton() { finish(false); }
  async function onSubmit(event) {
    event.preventDefault();
    const current = pending;
    if (!current || current.sending || current.sent || !form.reportValidity()) return;
    const address = email.value.trim();
    if (!address || address.length > 254) return;
    current.sending = true; send.disabled = true; email.disabled = true;
    status.textContent = 'Sending your sign-in link…';
    try {
      const { error } = await client.auth.signInWithOtp({ email: address,
        options: { emailRedirectTo: redirectTo } });
      if (pending !== current) return;
      if (error) throw new Error();
      current.sent = true;
      status.textContent = 'Check your inbox. Open the sign-in link in this browser, then return here. You can close this window while you wait.';
    } catch {
      if (pending !== current) return;
      current.sending = false; send.disabled = false; email.disabled = false;
      status.textContent = 'We could not send the sign-in link. Please try again.';
    }
  }
  form.addEventListener('submit', onSubmit);
  dialog.addEventListener('cancel', onCancel);
  dialog.addEventListener('close', onClose);
  cancel.addEventListener('click', onCancelButton);
  const subscription = client?.auth.onAuthStateChange((event, session) => {
    if (event === 'INITIAL_SESSION') return;
    if (!['SIGNED_IN', 'SIGNED_OUT', 'TOKEN_REFRESHED', 'USER_UPDATED'].includes(event)) return;
    // Supabase's callback stays synchronous; session reads happen after its lock releases.
    schedule(() => {
      if (disposed) return;
      const signedIn = !!session?.access_token;
      if (signedIn) finish(true);
      for (const listener of listeners) listener(signedIn);
    });
  })?.data?.subscription;
  return Object.freeze({
    available: !!client,
    autoConnect: true,
    async signIn() {
      if (!client || disposed) throw new Error('Account sign-in unavailable');
      const { data, error } = await client.auth.getSession();
      if (error) throw new Error('Account session unavailable');
      if (data.session?.access_token) return;
      if (pending) return pending.promise;
      let resolve, reject;
      const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
      pending = { promise, resolve, reject, sending: false, sent: false };
      email.value = ''; email.disabled = false; send.disabled = false;
      status.textContent = 'Use your HALO account email. New accounts follow the existing HALO sign-up settings.';
      dialog.showModal(); email.focus();
      return promise;
    },
    async getAccessToken() {
      if (!client || disposed) return null;
      const { data, error } = await client.auth.getSession();
      if (error) throw new Error('Account session unavailable');
      return data.session?.access_token || null;
    },
    async signOut() {
      if (!client || disposed) return;
      const { error } = await client.auth.signOut();
      if (error) throw new Error('Account sign-out unavailable');
    },
    subscribe(callback) { listeners.add(callback); return () => listeners.delete(callback); },
    dispose() {
      if (disposed) return;
      disposed = true; finish(false); listeners.clear(); subscription?.unsubscribe();
      form.removeEventListener('submit', onSubmit); dialog.removeEventListener('cancel', onCancel);
      dialog.removeEventListener('close', onClose); cancel.removeEventListener('click', onCancelButton);
    },
  });
}
