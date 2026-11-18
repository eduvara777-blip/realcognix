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

- **Failed logins** are limited per email + IP (5 per 15 minutes, in memory per API process). After 10 failures in a row the account locks for 15 minutes. All limits are env vars.
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

## Demo and live mode

The web app reads `docs/config.js`, loaded before `app.js`:

- `apiUrl: null` (default, GitHub Pages): **demo mode**. Sample data, any sign-in works, a "Demo data" badge sits next to the page title.
- `apiUrl: 'http://localhost:4000'`: **live mode**. The sign-in screen calls the API. The Docker `web` service mounts `infra/web/config.js`, which does this.
- The sign-in screen also has an **API URL** field, so you can try live mode from GitHub Pages without changing files. Leave it empty for demo data.

In live mode, Dashboard, Clients, Projects, Campaigns, Leads (with lead detail, stage changes and the pipeline), Conversations, Site visits and the approvals queue on AI agents load from the API. A "Live" badge shows on those screens. Screens without an endpoint yet (Bookings, Microsites, Automations, Channel partners, Team, Reports, Settings) keep sample data and show "Demo". So do sample sections inside live screens.

The access token stays in memory only. The refresh token is kept in `localStorage` ("Keep me signed in") or `sessionStorage`, so a reload keeps you signed in. Anything that can run script on the page could read it. Rotation and reuse detection limit the damage; an httpOnly cookie would be stronger but needs the UI and API on one site. The API allows the browser origins in `CORS_ORIGINS` (empty = any origin, dev only).

## Develop without Docker

```bash
npm install && npm run build && npm test
```

Needs Postgres 16 with pgvector and Redis.

## Status

Done: web app (demo and live), sign-in with roles and rotating sessions, backend core (intake, dedupe, scoring, routing, SLA, cadences, compliance, approvals, agents), adapters, Docker stack, LiteLLM config, n8n workflows.
Next: API endpoints for bookings, reports, team and automations, Meta Lead Ads go-live, and a test run on a real Postgres.

---

RealCognix · +91 90190 88160 · Bengaluru 560064
