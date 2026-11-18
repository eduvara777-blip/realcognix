# RealCognix OS

**Real Intelligence, Real Growth.** The marketing and sales operating system for real estate developers: from client onboarding and RERA checks, through ads, portals and microsites, to lead response in under five minutes, site visits, bookings and weekly client reports.

- **Clickable prototype:** the `docs/` folder (served by GitHub Pages). Sign in with any details. All data is fictitious.
- **Backend scaffold:** TypeScript monorepo (`packages/*`, `apps/api`) with Postgres + pgvector schema in `db/`.

## Structure

| Path | What it is |
| --- | --- |
| `docs/` | Static prototype (HTML, CSS, vanilla JS): 16 screens, light and dark themes |
| `db/schema.sql`, `db/seed.sql` | Postgres schema with row-level security per agency, pgvector, sample data |
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
| Prototype UI | http://localhost:8080 | the clickable app in `docs/` |
| API | http://localhost:4000/health | Fastify API (worker runs in its own container) |
| AI gateway | http://localhost:4001 | LiteLLM; swap models in `infra/litellm/config.yaml` |
| Automations | http://localhost:5678 | n8n; import `n8n/workflows/*.json` |
| Dev inbox | http://localhost:8025 | Mailpit catches every outgoing email |

Postgres loads `db/schema.sql` and `db/seed.sql` on first start. Without vendor keys, WhatsApp runs in console mode, email goes to Mailpit, and the AI runs on local Ollama. Add a Groq or Gemini key to `.env` for the free `fast` and `smart` aliases.

## Develop without Docker

```bash
npm install && npm run build && npm test
```

Needs Postgres 16 with pgvector and Redis.

## Status

Done: prototype UI, backend core (intake, dedupe, scoring, routing, SLA, cadences, compliance, approvals, agents), adapters, Docker stack, LiteLLM config, n8n workflows.
Next: real sign-in (Supabase Auth or Keycloak), the production web app wired to the API, Meta Lead Ads go-live, and a live database test.

---

RealCognix · +91 90190 88160 · Bengaluru 560064
