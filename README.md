# RealCognix OS

**Real Intelligence, Real Growth.** The marketing and sales operating system for real estate developers: from client onboarding and RERA checks, through ads, portals and microsites, to lead response in under five minutes, site visits, bookings and weekly client reports.

- **Web app:** the `docs/` folder. On GitHub Pages it runs in **demo mode** (sample data, sign in with any details). Point it at the API and it runs in **live mode** with real sign-in and data.
- **Backend scaffold:** TypeScript monorepo (`packages/*`, `apps/api`) with Postgres + pgvector schema in `db/`.

## Structure

| Path | What it is |
| --- | --- |
| `docs/` | Web app (HTML, CSS, vanilla JS): 16 screens, light and dark themes, demo or live data |
| `db/schema.sql`, `db/seed.sql` | Postgres schema with row-level security per agency, pgvector, sample data |
| `db/migrations/` | Changes for databases created before them (`schema.sql` already includes them) |
| `packages/core` | Shared types, scoring, dedupe, compliance rules |
| `packages/adapters` | Swappable vendors: LLM (LiteLLM, Ollama, Gemini, Groq), WhatsApp Cloud API, email, Meta Lead Ads, Meta Ads, Google Ads, storage |
| `packages/agents` | LangGraph agents: lead qualifier, follow-up, reporting, creative (prompts in `prompts/`) |
| `apps/api` | Fastify API: webhooks, leads, site visits, approval gates, BullMQ queues |

## Principles

1. Free and open-source tools first. Every vendor and every AI model sits behind an adapter, so it can be replaced by changing configuration.
2. AI drafts, people approve. Anything that spends money or reaches buyers waits for a human.
3. Compliance is built in: RERA number on every ad and page, DPDP consent on every form, DND checks, no messages from 9 pm to 9 am.

## Run everything with Docker

```bash
cp .env.example .env          # then change every change-me value
docker compose up -d
docker compose exec ollama ollama pull qwen2.5:7b
docker compose exec ollama ollama pull nomic-embed-text
```

| Service | URL | What it is |
|---|---|---|
| Web app | http://localhost:8080 | `docs/` in live mode, signed in against the API |
| API | http://localhost:4000/health | Fastify API (worker runs in its own container) |
| AI gateway | http://localhost:4001 | LiteLLM; swap models in `infra/litellm/config.yaml` |
| Automations | http://localhost:5678 | n8n; import `n8n/workflows/*.json` |
| Dev inbox | http://localhost:8025 | Mailpit catches every outgoing email |

Set `JWT_SECRET` too (`openssl rand -hex 32`); the API refuses to start in production without it. Postgres loads `db/schema.sql` and `db/seed.sql` on first start. Without vendor keys, WhatsApp runs in console mode, email goes to Mailpit, and the AI runs on local Ollama. Add a Groq or Gemini key to `.env` for the free `fast` and `smart` aliases.

## Sign-in

The API has built-in email + password login. Passwords are hashed with scrypt (`node:crypto`, salted). A login returns a 15-minute access token (HS256 JWT) and a 30-day refresh token. Refresh tokens are random, stored only as a SHA-256 hash, and rotated on every use; replaying an old one ends that whole session.

| Endpoint | What it does |
|---|---|
| `POST /auth/login` | `{ email, password }` → `{ accessToken, refreshToken, expiresIn, user }` |
| `POST /auth/refresh` | `{ refreshToken }` → a new pair |
| `POST /auth/logout` | `{ refreshToken }` → ends the session |
| `GET /v1/me` | the signed-in user, role and org |

- **Failed logins** are limited per email + IP (5 per 15 minutes), shared across API processes through Redis, with an in-memory fallback if Redis is down or slow. After 10 failures in a row the account locks for 15 minutes. All limits are env vars.
- **Org scope** comes from the token, never from a header. Every `/v1` handler runs with `app.org_id` set to the caller's org, which the row-level security policies use.
- **Roles** come from `users.role_id`. Approval decisions need `admin` or `manager` (`owner` always passes).
- **n8n and other servers** keep using `Authorization: Bearer $API_TOKEN`. This service token may pick the org with `x-org-id`. Webhooks keep their `x-intake-secret`.
- **Keycloak or Supabase instead:** set `AUTH_PROVIDER=oidc`, `OIDC_ISSUER`, `OIDC_JWKS_URL` and `OIDC_AUDIENCE`, and put each user's `sub` in `users.auth_subject`. The API then verifies their RS256 tokens and password login is switched off. Both providers sit behind one `AuthProvider` adapter (`apps/api/src/auth/providers.ts`).

### Set the first password

There are no default passwords. Set one for a seeded user (for example the admin, `priya@realcognix.test`):

```bash
docker compose exec api node apps/api/dist/scripts/set-password.js --email priya@realcognix.test
# without Docker:
npm run build && npm run set-password -- --email priya@realcognix.test
```

You are asked for the password (hidden). For scripts, set `NEW_PASSWORD` (or `DEV_ADMIN_PASSWORD` in dev) instead. Use `--org <slug>` if the email exists in more than one org. Setting a password signs that user out everywhere.

### Upgrading an existing database

`schema.sql` only runs on an empty volume. For a database created before sign-in existed:

```bash
docker compose exec -T postgres psql -U realcognix -d realcognix < db/migrations/002_auth.sql
```

Then apply `003_app_role.sql` as described under [Security](#security) before starting the new API and worker.

## Demo and live mode

The web app reads `docs/config.js`, loaded before `app.js`:

- `apiUrl: null` (default, GitHub Pages): **demo mode**. Sample data, any sign-in works, a "Demo data" badge sits next to the page title.
- `apiUrl: 'http://localhost:4000'`: **live mode**. The sign-in screen calls the API. The Docker `web` service mounts `infra/web/config.js`, which does this.
- The sign-in screen also has an **API URL** field, so you can try live mode from GitHub Pages without changing files. Leave it empty for demo data.

In live mode, Dashboard, Clients, Projects, Campaigns, Leads (with lead detail, stage changes and the pipeline), Conversations, Site visits and the approvals queue on AI agents load from the API. A "Live" badge shows on those screens. Screens without an endpoint yet (Bookings, Microsites, Automations, Channel partners, Team, Reports, Settings) keep sample data and show "Demo". So do sample sections inside live screens.

The access token stays in memory only. The refresh token is kept in `localStorage` ("Keep me signed in") or `sessionStorage`, so a reload keeps you signed in. Anything that can run script on the page could read it. Rotation and reuse detection limit the damage; an httpOnly cookie would be stronger but needs the UI and API on one site. The API allows the browser origins in `CORS_ORIGINS` (empty = any origin, dev only).

## Security

### Tenant isolation

Postgres enforces it, not just the code.

- **Three roles.** The owner (`POSTGRES_USER`) owns the tables and runs migrations; the API and worker never use it. The API, worker and `set-password` connect as `realcognix_app`: `NOBYPASSRLS`, owns nothing, no `DELETE`. `realcognix_system` (`NOLOGIN`, `BYPASSRLS`) only owns a few `SECURITY DEFINER` functions, so those are the only cross-tenant reads.
- **RLS on every table with `org_id`**, `ENABLE`d and `FORCE`d, keyed on `app.org_id`. If `app.org_id` is not set, no rows match.
- **Two ways in** (`apps/api/src/lib/db.ts`). `withOrg(orgId, fn)` runs a transaction with `app.org_id` set. Every `/v1` handler and every worker job uses it. `lookup(sql)` runs before the org is known (sign-in, webhook org resolution, the weekly report scheduler) and only accepts calls to the `SECURITY DEFINER` lookups, never a table.
- **Worker jobs carry `orgId`.** Raw webhooks (Meta Lead Ads, inbound WhatsApp) find their org through a lookup first, then run scoped.
- **IDs from another org are rejected in code** wherever a write takes one (marking a lead contacted, scheduling or editing a site visit, assigning a lead, sending a message).

New tables get no default grants. A migration that adds one must add `org_id`, enable and force RLS with the tenant policy, and grant to `realcognix_app`. Re-running `003_app_role.sql` does all of this.

### Environment

| Variable | What it does |
|---|---|
| `APP_DB_PASSWORD` | Password for `realcognix_app`. Required; Docker will not start without it. `DATABASE_URL` for the API and worker uses this role. |
| `TRUST_PROXY` | `false` by default, so `X-Forwarded-For` is ignored and clients cannot fake their IP. Behind your own proxy, list its addresses (`loopback`, `uniquelocal`, `10.0.0.5`) or set `true`. Hop counts are rejected. |
| `REDIS_URL` | Also holds the shared login limiter. If Redis is unreachable, each API process falls back to its own in-memory count. |

### Upgrading an existing install

1. Stop the API and worker.
2. Apply the role migration as the owner, then set the app role's password (on a fresh volume, `infra/postgres/04-app-role.sh` does both from `APP_DB_PASSWORD`):
   ```bash
   docker compose exec -T postgres psql -U realcognix -d realcognix < db/migrations/003_app_role.sql
   docker compose exec postgres psql -U realcognix -d realcognix -c "ALTER ROLE realcognix_app PASSWORD '...'"
   ```
3. Add `APP_DB_PASSWORD` to `.env`. Compose already points the API and worker at `realcognix_app`; without Docker, set `DATABASE_URL` to that role yourself.
4. Drain Redis queues first, or re-queue the jobs. Jobs queued before this change have no `orgId` and fail instead of running unscoped (SLA checks, cadence steps, visit reminders, client reports).
5. Start the new API and worker.
6. Keep n8n workflow `03-weekly-client-reports` inactive if the worker scheduler runs, since it already drafts the same reports for every org.

### Known limits

- Foreign keys are on `id` alone, not composite `(org_id, id)`. Postgres would accept a row in one org that points at another org's row, so cross-tenant references are only blocked in code.
- Inbound WhatsApp messages that match no known number, and webhooks whose org is unclear, go to `DEFAULT_ORG_ID`.
- n8n uses the Postgres superuser for its own metadata database. It reaches RealCognix data only through the API.
- LiteLLM loads the whole `.env` (`env_file`), so it can see every secret in it, database passwords included.
- The refresh token sits in browser storage (see [Demo and live mode](#demo-and-live-mode)).
- Isolation is tested on in-process Postgres (pglite) and on a real PostgreSQL 16.16 + pgvector 0.8.7 server initialised the way the Docker image does it (including `04-app-role.sh`), with the API and worker on real Redis 7. The Docker images and network themselves (and n8n, LiteLLM, Mailpit, Ollama) have not been run.

## Develop without Docker

```bash
npm install && npm run build && npm test
```

Needs Postgres 16 with pgvector and Redis.

## Status

Done: web app (demo and live), sign-in with roles and rotating sessions, backend core (intake, dedupe, scoring, routing, SLA, cadences, compliance, approvals, agents), adapters, Docker stack, LiteLLM config, n8n workflows.
Next: API endpoints for bookings, reports, team and automations, Meta Lead Ads go-live, and a first `docker compose up` on a Docker host.

---

RealCognix · +91 90190 88160 · Bengaluru 560064
