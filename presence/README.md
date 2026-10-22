# presence

The live "Observers · N" count on the map page: a Cloudflare Worker with one Durable Object that counts how many browser tabs have the site open now. The site is static, so this is the only part that runs on a server, and it is optional: without it the label reads plain "Observers".

## API

- `POST /ping` with `{"id": "<session id>"}` marks the id as seen and returns `{"observers": N}`.
- `POST /leave` with the same body forgets the id and returns `{"observers": N}`.
- `GET /count` returns `{"observers": N}`.

N is the number of distinct ids that pinged in the last 75 seconds. An id is 8 to 64 characters of `A-Z a-z 0-9 _ -`; anything else, or a body over 1 KB, gets a 400. The body is parsed as JSON whatever its content type (the page's leave beacon is sent as `text/plain` so it needs no CORS preflight). CORS allows `https://currentsbtw.github.io` and local development origins (`localhost`, `*.localhost`, `127.0.0.1`, any port); every response carries `Cache-Control: no-store`.

One Durable Object instance (`idFromName("global")`) holds a `Map<id, lastSeen>` in memory and prunes it on every call. Nothing is written to storage; if the object is evicted the map is lost and refills within a minute, because every open tab pings every 30 seconds. At most 50,000 ids are held at once.

## Privacy

The page sends only a random id that each tab makes for itself (`crypto.randomUUID()`, kept in `sessionStorage` so a reload is not counted twice). The Worker reads no IP address, user agent, cookie or other header besides `Origin` (for CORS), sets no cookies, keeps only the id and the time it was last seen, in memory, and logs nothing (`[observability] enabled = false` in `wrangler.toml`).

## Develop and test

```sh
npm install
npm test                    # node --test on the counting and pruning logic (src/counter.ts)
npm run typecheck
npm run dev                 # wrangler dev on http://localhost:8787, offline, no login
```

Then run the site against it: `cd ../web && VITE_PRESENCE_URL=http://localhost:8787 npm run dev`.

## Going live

1. Create a Cloudflare account (the Workers Free plan is enough) and open Workers & Pages once so the account has a `workers.dev` subdomain.
2. Create an API token: My Profile → API Tokens → Create Token → the "Edit Cloudflare Workers" template, limited to this account (no zone is needed). Copy the account ID from the Workers & Pages overview.
3. In the GitHub repository, add the secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` (Settings → Secrets and variables → Actions → Secrets).
4. Run Actions → Presence → Run workflow (it also runs on every push to `main` that touches `presence/`). The log ends with the Worker's URL, `https://today-on-earth-presence.<subdomain>.workers.dev`. Until both secrets exist the workflow logs "secrets not set; skipping" and passes. To deploy from a machine instead: `npx wrangler login`, then `npm run deploy`.
5. Add the repository variable `PRESENCE_URL` with that URL, no trailing slash (Settings → Secrets and variables → Actions → Variables).
6. Run Actions → Snapshot → Run workflow (or wait for the next 15-minute run): the build bakes the URL into the site and the label starts showing the count.

To turn the count off, delete the `PRESENCE_URL` variable; the next snapshot build leaves the label plain and the page stops requesting anything.

## Free plan budget

On the Workers Free plan, Durable Objects get 100,000 requests and 13,000 GB-s of duration a day, SQLite-backed objects only (developers.cloudflare.com/durable-objects/platform/pricing/, checked 2026-10-22), and the Worker itself has a daily request quota of its own (developers.cloudflare.com/workers/platform/limits/). Each ping costs one Worker request and one Durable Object request; CORS preflights cost a Worker request only. A tab left open and visible pings 2,880 times a day, so the daily request quota covers roughly 35 tab-days of continuous viewing; hidden tabs do not ping. The single object stays in memory while pings keep arriving; at 128 MB that is at most about 10,800 GB-s a day. Past a free limit, requests fail until 00:00 UTC and the label falls back to plain "Observers".
