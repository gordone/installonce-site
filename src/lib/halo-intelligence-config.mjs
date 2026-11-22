/** Public build-time configuration; values never come from visitor URLs or data. */
export function apiOrigin(value) {
  try {
    if (typeof value !== 'string') return null;
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.origin !== value || url.username || url.password || url.port) return null;
    return url.origin;
  } catch { return null; }
}
export function authOrigin(value) {
  const origin = apiOrigin(value);
  if (!origin) return null;
  return new URL(origin).hostname.endsWith('.supabase.co') ? origin : null;
}
export function isPublicProjectKey(value) {
  if (typeof value !== 'string' || value.length < 32 || value.length > 8192 || !/^[A-Za-z0-9._-]+$/.test(value)) return false;
  if (value.startsWith('sb_publishable_')) return true;
  try {
    const part = value.split('.')[1].replace(/-/g,'+').replace(/_/g,'/');
    return JSON.parse(atob(part)).role === 'anon';
  } catch { return false; }
}
export function intelligenceConfig(values) {
  const api = apiOrigin(values.PUBLIC_HALO_INTELLIGENCE_API_URL);
  const project = authOrigin(values.PUBLIC_SUPABASE_URL);
  const configured = !!api && !!project && isPublicProjectKey(values.PUBLIC_SUPABASE_ANON_KEY);
  const enabled = values.PUBLIC_HALO_INTELLIGENCE_ENABLED === '1';
  if (!['0','1',undefined].includes(values.PUBLIC_HALO_TIERS_ENABLED)) throw new Error('Explicit HALO tier UI switch required');
  const tiersEnabled = enabled && values.PUBLIC_HALO_TIERS_ENABLED === '1';
  if (enabled && !configured) throw new Error('HALO Intelligence requires a valid HTTPS API origin and public Supabase project configuration');
  return Object.freeze({ api, project, configured, enabled, tiersEnabled, myHaloPath: enabled ? (tiersEnabled ? '/my-halo/overview/' : '/my-halo/dashboard/') : '/app/' });
}
