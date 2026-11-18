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

## Run the backend locally

```bash
npm install
npm run build
npm test
```

You need Postgres 16 with pgvector and Redis for the API. Without vendor keys, WhatsApp and email run in console mode and the AI runs on a local Ollama model.

## Status

Prototype and backend core are in place. Still to come: Docker Compose, `.env.example`, LiteLLM config, the Next.js web app, n8n workflows for portal email parsing and Meta Lead Ads, and a live database test.

---

RealCognix · +91 90190 88160 · Bengaluru 560064
