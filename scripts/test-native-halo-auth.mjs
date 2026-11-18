import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createNativeHaloAuth } from '../src/scripts/halo-native-auth.mjs';

class Element extends EventTarget {
  open = false; value = ''; disabled = false; textContent = ''; valid = true;
  reportValidity() { return this.valid; }
  showModal() { this.open = true; }
  close() { this.open = false; this.dispatchEvent(new Event('close')); }
  focus() {}
}
function setup({ signedIn = false, missing = false } = {}) {
  const dialog = new Element(), form = new Element(), email = new Element();
  const send = new Element(), cancel = new Element(), status = new Element();
  let session = signedIn ? { access_token: 'synthetic-access' } : null;
  let sessionError = null, sendError = null, signOutError = null, callback;
  const scheduled = [], requests = [];
  let unsubscribed = false;
  const client = { auth: {
    async getSession() { return { data: { session }, error: sessionError }; },
    async signInWithOtp(input) { requests.push(input); return { error: sendError }; },
    async signOut() { return { error: signOutError }; },
    onAuthStateChange(fn) { callback = fn; return { data: { subscription: {
      unsubscribe() { unsubscribed = true; },
    } } }; },
  } };
  const auth = createNativeHaloAuth({ client: missing ? null : client, dialog, form, email,
    send, cancel, status, redirectTo: 'https://thehalomethod.co/my-halo/',
    schedule: (fn) => scheduled.push(fn) });
  return { auth, client, dialog, form, email, send, cancel, status, requests,
    async tick() { await Promise.resolve(); await Promise.resolve(); },
    event(event, nextSession) { session = nextSession; callback(event, session); },
    flush() { while (scheduled.length) scheduled.shift()(); },
    failSession() { sessionError = new Error('PRIVATE-session'); },
    failSend() { sendError = new Error('PRIVATE-send'); },
    failSignOut() { signOutError = new Error('PRIVATE-signout'); },
    get unsubscribed() { return unsubscribed; },
  };
}

test('existing session connects without dialog or OTP', async () => {
  const s = setup({ signedIn: true }); await s.auth.signIn();
  assert.equal(s.dialog.open, false); assert.equal(s.requests.length, 0);
  assert.equal(await s.auth.getAccessToken(), 'synthetic-access'); s.auth.dispose();
});
test('explicit submission sends one link to the fixed return URL and clears on sign-in', async () => {
  const s = setup(); const promise = s.auth.signIn(); await s.tick();
  assert.equal(s.dialog.open, true); assert.equal(s.requests.length, 0);
  s.email.value = 'synthetic@example.test'; s.form.dispatchEvent(new Event('submit'));
  await s.tick(); s.form.dispatchEvent(new Event('submit')); await s.tick();
  assert.deepEqual(s.requests, [{ email: 'synthetic@example.test', options: {
    emailRedirectTo: 'https://thehalomethod.co/my-halo/' } }]);
  s.event('SIGNED_IN', { access_token: 'new-synthetic-access' });
  assert.equal(s.dialog.open, true); s.flush(); await promise;
  assert.equal(s.dialog.open, false); assert.equal(s.email.value, ''); s.auth.dispose();
});
test('cancel preserves no entered account data and rejects with AbortError', async () => {
  const s = setup(); const promise = s.auth.signIn(); await s.tick();
  s.email.value = 'synthetic@example.test'; s.cancel.dispatchEvent(new Event('click'));
  await assert.rejects(promise, { name: 'AbortError' });
  assert.equal(s.email.value, ''); assert.equal(s.requests.length, 0); s.auth.dispose();
});
test('Escape and closed dialog cancel pending sign-in', async () => {
  for (const event of ['cancel','close']) {
    const s = setup(); const promise = s.auth.signIn(); await s.tick();
    if (event === 'close') s.dialog.open = false;
    s.dialog.dispatchEvent(new Event(event, { cancelable: true }));
    await assert.rejects(promise, { name: 'AbortError' }); s.auth.dispose();
  }
});
test('invalid form does not call OTP', async () => {
  const s = setup(); const promise = s.auth.signIn(); await s.tick(); s.form.valid = false;
  s.email.value = 'bad'; s.form.dispatchEvent(new Event('submit')); await s.tick();
  assert.equal(s.requests.length, 0); s.auth.dispose(); await assert.rejects(promise);
});
test('upstream failures have fixed UI messages and allow retry', async () => {
  const s = setup(); const promise = s.auth.signIn(); await s.tick();
  s.email.value = 'synthetic@example.test'; s.failSend(); s.form.dispatchEvent(new Event('submit'));
  await s.tick(); assert.match(s.status.textContent, /could not send/);
  assert.ok(!s.status.textContent.includes('PRIVATE')); assert.equal(s.send.disabled, false);
  s.auth.dispose(); await assert.rejects(promise);
});
test('session and signout errors never expose upstream contents', async () => {
  const s = setup(); s.failSession(); await assert.rejects(s.auth.signIn(), /session unavailable/);
  await assert.rejects(s.auth.getAccessToken(), /session unavailable/);
  s.failSignOut(); await assert.rejects(s.auth.signOut(), /sign-out unavailable/); s.auth.dispose();
});
test('events are scheduled outside Auth callback and initial session is ignored', async () => {
  const s = setup(); const events = []; const remove = s.auth.subscribe((value) => events.push(value));
  s.event('INITIAL_SESSION', null); s.flush(); assert.deepEqual(events, []);
  s.event('TOKEN_REFRESHED', { access_token: 'refreshed' }); assert.deepEqual(events, []);
  s.flush(); s.event('SIGNED_OUT', null); s.flush(); assert.deepEqual(events, [true,false]);
  remove(); s.event('SIGNED_IN', { access_token: 'later' }); s.flush();
  assert.deepEqual(events, [true,false]); s.auth.dispose(); assert.equal(s.unsubscribed,true);
});
test('unconfigured host is example-only and no provider is touched', async () => {
  const s = setup({ missing:true }); assert.equal(s.auth.available,false);
  assert.equal(await s.auth.getAccessToken(),null); await assert.rejects(s.auth.signIn());
  await s.auth.signOut(); s.auth.dispose();
});
test('late scheduled events do nothing after disposal', () => {
  const s=setup(); const events=[]; s.auth.subscribe((value)=>events.push(value));
  s.event('SIGNED_IN',{access_token:'later'}); s.auth.dispose(); s.flush();
  assert.deepEqual(events,[]);
});

test('late OTP response after cancellation cannot reopen or rewrite a new dialog', async()=>{
  const s=setup(); let resolve;
  s.client.auth.signInWithOtp=()=>new Promise((yes)=>{resolve=yes;});
  const first=s.auth.signIn(); await s.tick(); s.email.value='synthetic@example.test';
  s.form.dispatchEvent(new Event('submit')); s.cancel.dispatchEvent(new Event('click'));
  await assert.rejects(first,{name:'AbortError'});
  const second=s.auth.signIn(); await s.tick(); const text=s.status.textContent;
  resolve({error:null}); await s.tick();
  assert.equal(s.status.textContent,text); assert.equal(s.email.disabled,false);
  s.auth.dispose(); await assert.rejects(second,{name:'AbortError'});
});
