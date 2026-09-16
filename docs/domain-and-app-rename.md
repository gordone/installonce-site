# The HALO Method domain and OneSixtySeven app rename

## Brand architecture

- Public method and website: The HALO Method
- Primary domain: `thehalomethod.co`
- App name: OneSixtySeven
- Behavioral shorthand: `1-60-7`
- Legacy domain: `installonce.ai`

## Render domain cutover

Attach these custom domains to the existing Render static site:

- `thehalomethod.co`
- `www.thehalomethod.co`
- `installonce.ai`
- `www.installonce.ai`

Set `thehalomethod.co` as the primary public URL after DNS verifies.

## DNS

Use the DNS records Render provides for each domain. Do not change Supabase,
Formspree, or analytics settings until the new domain is verified and serving.

## Legacy redirect

Redirect `installonce.ai/*` and `www.installonce.ai/*` to
`https://thehalomethod.co/*`.

Do this as a host-level rule in Render dashboard or Cloudflare. Do not add a
global `/*` redirect in `render.yaml`, because it would also redirect the new
primary domain and can create a redirect loop.

## App naming

Use OneSixtySeven for the app UI, app-store listing, PWA label, and mobile
screens. Keep HALO as the method name: `OneSixtySeven, powered by The HALO
Method`.
