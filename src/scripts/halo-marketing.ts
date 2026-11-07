import blueprints from '../data/blueprints.json';

const token = import.meta.env.PUBLIC_POSTHOG_PROJECT_TOKEN;
const region = import.meta.env.PUBLIC_POSTHOG_REGION;
const host = region === 'eu' ? 'https://eu.i.posthog.com' : region === 'us' ? 'https://us.i.posthog.com' : '';
const consent = 'halo.analytics.opt-in';
const visitor = 'halo.analytics.visitor';
const attribution = 'halo.analytics.campaign';
const blueprintIds = new Set(blueprints.map(({ id }) => id));
const events = new Set(['halo_visit', 'blueprint_search', 'blueprint_viewed', 'blueprint_selected',
  '1607_started', 'daily_action_recorded', 'return_recorded', 'day7_completed', 'community_joined', 'community_posted']);
const surfaces: Record<string, string> = { '/': 'home', '/app/': 'practice', '/community/': 'community',
  '/1607/': 'protocol', '/build/': 'builder', '/book/': 'book' };
const surface = location.pathname.startsWith('/blueprints/') ? 'blueprint' : surfaces[location.pathname];
const campaignKeys = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'ref'];

function capture(event: string, details: { blueprint?: unknown; day?: unknown } = {}) {
  if (!host || !/^phc_[A-Za-z0-9_-]+$/.test(token || '') || !events.has(event)) return;
  try {
    if (localStorage.getItem(consent) !== 'yes' || navigator.doNotTrack === '1' ||
      (navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl) return;
    const distinctId = localStorage.getItem(visitor) || crypto.randomUUID();
    localStorage.setItem(visitor, distinctId);
    const query = new URLSearchParams(location.search);
    const previous = JSON.parse(localStorage.getItem(attribution) || '{}');
    const properties: Record<string, unknown> = { distinct_id: distinctId, $process_person_profile: false,
      $geoip_disable: true, halo_schema: 1, surface: surface || 'other' };
    const hasCampaign = campaignKeys.some((key) => /^[a-z0-9][a-z0-9_-]{0,63}$/i.test(query.get(key) || ''));
    const first = !previous.utm_source && !previous.utm_campaign && !previous.ref && hasCampaign;
    const campaign: Record<string, string> = {};
    for (const key of campaignKeys) {
      const value = first ? query.get(key) : previous[key];
      if (typeof value === 'string' && /^[a-z0-9][a-z0-9_-]{0,63}$/i.test(value)) campaign[key] = value.toLowerCase();
    }
    localStorage.setItem(attribution, JSON.stringify(campaign));
    Object.assign(properties, campaign);
    if (typeof details.blueprint === 'string' && blueprintIds.has(details.blueprint)) properties.blueprint = details.blueprint;
    if (typeof details.day === 'number' && Number.isInteger(details.day) && details.day >= 1 && details.day <= 7) properties.day = details.day;
    void fetch(host + '/i/v0/e/', { method: 'POST', body: JSON.stringify({ api_key: token, event, properties }),
      headers: { 'Content-Type': 'application/json' }, keepalive: true, credentials: 'omit',
      referrerPolicy: 'no-referrer' }).catch(() => {});
  } catch { /* Analytics must never interrupt HALO. */ }
}

function visit() {
  if (!surface) return;
  capture('halo_visit');
  if (surface === 'blueprint') capture('blueprint_viewed', { blueprint: location.pathname.split('/')[2] });
}

if (host && token) {
  for (const box of document.querySelectorAll<HTMLInputElement>('[data-halo-analytics]')) {
    box.closest('label')!.hidden = false;
    try { box.checked = localStorage.getItem(consent) === 'yes'; } catch {}
    box.addEventListener('change', () => {
      try {
        localStorage.setItem(consent, box.checked ? 'yes' : 'no');
        if (box.checked) visit();
        else { localStorage.removeItem(visitor); localStorage.removeItem(attribution); }
      } catch { box.checked = false; }
    });
  }
  visit();
  document.addEventListener('click', (event) => {
    const anchor = event.target instanceof Element && event.target.closest<HTMLAnchorElement>('a[href]');
    if (!anchor || anchor.origin !== location.origin || !['/app/', '/build/'].includes(anchor.pathname)) return;
    const blueprint = new URL(anchor.href).searchParams.get('blueprint');
    if (blueprint && blueprintIds.has(blueprint)) capture('blueprint_selected', { blueprint });
  });
  window.addEventListener('halo:marketing', (event) => {
    const details = (event as CustomEvent).detail;
    if (details && typeof details.event === 'string') capture(details.event, details);
  });
}
