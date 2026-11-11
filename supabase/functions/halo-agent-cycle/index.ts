// Dedicated n8n ingestion endpoint. No sending, publishing, approval or execution tools.
const maxBytes = 220000;

function reply(status: number, body: object) {
  return new Response(JSON.stringify(body), {
    status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}

async function equalSecret(candidate: string, expected: string) {
  const encoder = new TextEncoder();
  const [left,right] = await Promise.all([candidate,expected].map(value =>
    crypto.subtle.digest('SHA-256',encoder.encode(value))));
  const a = new Uint8Array(left);
  const b = new Uint8Array(right);
  let difference = 0;
  for (let index = 0; index < a.length; index++) difference |= a[index] ^ b[index];
  return difference === 0;
}

Deno.serve(async request => {
  if (request.method !== 'POST') return reply(405,{ error: 'POST required' });
  const secret = Deno.env.get('HALO_N8N_INGEST_TOKEN');
  const databaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!secret || secret.length < 32 || !databaseUrl || !serviceKey) {
    return reply(503,{ error: 'Agent cycle bridge is not configured' });
  }
  if (!await equalSecret(request.headers.get('x-halo-ingest-token') ?? '',secret)) {
    return reply(401,{ error: 'Unauthorized' });
  }
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) {
    return reply(415,{ error: 'JSON required' });
  }
  const reader = request.body?.getReader();
  if (!reader) return reply(400,{ error: 'Request body required' });
  let bytes = 0;
  const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const { value,done } = await reader.read();
      if (done) break;
      bytes += value.length;
      if (bytes > maxBytes) {
        await reader.cancel();
        return reply(413,{ error: 'Report batch too large' });
      }
      chunks.push(value);
    }
    const data = new Uint8Array(bytes);
    let offset = 0;
    for (const chunk of chunks) { data.set(chunk,offset); offset += chunk.length; }
    const payload = JSON.parse(new TextDecoder().decode(data));
    if (typeof payload.source_execution !== 'string' || !Array.isArray(payload.reports)) {
      return reply(400,{ error: 'Execution identity and reports are required' });
    }
    const result = await fetch(databaseUrl + '/rest/v1/rpc/halo_ingest_agent_cycle',{
      method: 'POST', signal: AbortSignal.timeout(15000),
      headers: { apikey: serviceKey, Authorization: 'Bearer ' + serviceKey, 'content-type':'application/json' },
      body: JSON.stringify({ source_execution:payload.source_execution,reports:payload.reports }),
    });
    if (!result.ok) {
      // Never reflect raw database responses or credential-bearing request context.
      return reply(result.status >= 500 ? 503 : 422,{ error: 'Report batch rejected; check its schema and execution identity' });
    }
    return reply(200,{ cycle_id:await result.json(),status:'received' });
  } catch (error) {
    return reply(error instanceof SyntaxError ? 400 : 503,{
      error: error instanceof SyntaxError ? 'Invalid JSON' : 'Delivery failed; retry with the same execution identity',
    });
  }
});
