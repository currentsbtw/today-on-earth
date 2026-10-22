// Privacy: no IP, user agent, cookie or other header is read or kept and nothing is logged; only a random per-tab id and a timestamp, in memory.
//
// The observers count for Today On Earth. POST /ping {"id"} and POST /leave {"id"} return
// {"observers": N}; GET /count returns the same. N is the number of distinct ids that pinged in
// the last 75 seconds. One Durable Object ("global") holds the count for the whole site.
import { DurableObject } from 'cloudflare:workers';
import { Presence, isValidId } from './counter.ts';

interface Env {
  PRESENCE: DurableObjectNamespace<PresenceCounter>;
}

/** The count lives in memory only; if the object is evicted it refills within a minute. */
export class PresenceCounter extends DurableObject<Env> {
  readonly #presence = new Presence();

  ping(id: string): number {
    return this.#presence.ping(id, Date.now());
  }

  leave(id: string): number {
    return this.#presence.leave(id, Date.now());
  }

  count(): number {
    return this.#presence.count(Date.now());
  }
}

const SITE_ORIGIN = 'https://currentsbtw.github.io';
const MAX_BODY = 1024;

/** The live site, plus local development origins (localhost, *.localhost, 127.0.0.1). */
function allowedOrigin(origin: string | null): origin is string {
  if (!origin) return false;
  if (origin === SITE_ORIGIN) return true;
  try {
    const { protocol, hostname } = new URL(origin);
    if (protocol !== 'http:' && protocol !== 'https:') return false;
    return hostname === 'localhost' || hostname.endsWith('.localhost') || hostname === '127.0.0.1';
  } catch {
    return false;
  }
}

function headers(origin: string | null): Headers {
  const h = new Headers({ 'Cache-Control': 'no-store', Vary: 'Origin' });
  if (allowedOrigin(origin)) {
    h.set('Access-Control-Allow-Origin', origin);
    h.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    h.set('Access-Control-Allow-Headers', 'Content-Type');
    h.set('Access-Control-Max-Age', '86400');
  }
  return h;
}

function json(body: unknown, status: number, origin: string | null): Response {
  const h = headers(origin);
  h.set('Content-Type', 'application/json');
  return new Response(JSON.stringify(body), { status, headers: h });
}

/** The id from a small JSON body, or null. The content type is not checked, so a beacon of any type works. */
async function readId(request: Request): Promise<string | null> {
  if (Number(request.headers.get('Content-Length') ?? 0) > MAX_BODY) return null;
  const text = await request.text();
  if (text.length > MAX_BODY) return null;
  try {
    const body: unknown = JSON.parse(text);
    const id = body && typeof body === 'object' ? (body as { id?: unknown }).id : undefined;
    return isValidId(id) ? id : null;
  } catch {
    return null;
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = request.headers.get('Origin');
    const { pathname } = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: allowedOrigin(origin) ? 204 : 403, headers: headers(origin) });
    }

    const counter = env.PRESENCE.get(env.PRESENCE.idFromName('global'));
    if (request.method === 'GET' && pathname === '/count') {
      return json({ observers: await counter.count() }, 200, origin);
    }
    if (request.method === 'POST' && (pathname === '/ping' || pathname === '/leave')) {
      const id = await readId(request);
      if (!id) return json({ error: 'expected {"id": "<8-64 characters of A-Z a-z 0-9 _ ->"}' }, 400, origin);
      const observers = pathname === '/ping' ? await counter.ping(id) : await counter.leave(id);
      return json({ observers }, 200, origin);
    }
    return json({ error: 'not found' }, 404, origin);
  },
} satisfies ExportedHandler<Env>;
