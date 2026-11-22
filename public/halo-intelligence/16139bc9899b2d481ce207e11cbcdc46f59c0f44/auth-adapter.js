// Trusted native host configuration only. Never read identity or endpoints from URL/storage.
const host = globalThis.__HALO_HOST__;
let origin = "";
let configured = false;
try {
  if (host && typeof host.apiOrigin === "string") {
    const parsed = new URL(host.apiOrigin);
    configured = parsed.protocol === "https:" && parsed.origin === host.apiOrigin
      && !parsed.username && !parsed.password && !parsed.port
      && host.auth?.available === true
      && ["signIn", "getAccessToken", "signOut"].every((key) => typeof host.auth[key] === "function");
    if (configured) origin = parsed.origin;
  }
} catch { /* Invalid configuration keeps the example-only fallback. */ }
export const apiOrigin = origin;
export const auth = configured ? Object.freeze({
  available: true,
  signIn: host.auth.signIn.bind(host.auth),
  getAccessToken: host.auth.getAccessToken.bind(host.auth),
  signOut: host.auth.signOut.bind(host.auth),
  autoConnect: host.auth.autoConnect === true,
  subscribe: typeof host.auth.subscribe === "function" ? host.auth.subscribe.bind(host.auth) : null,
}) : Object.freeze({
  available: false,
  async signIn() { throw new Error("Sign-in is not configured"); },
  async getAccessToken() { return null; },
  async signOut() {},
});
