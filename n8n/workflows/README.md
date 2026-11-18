# n8n workflows

Import: n8n → Workflows → Import from file (or `docker compose exec n8n n8n import:workflow --separate --input=/workflows`).

| File | What it does |
|---|---|
| 01-portal-email-intake | Reads the leads mailbox (IMAP), keeps 99acres / MagicBricks / Housing / NoBroker / Square Yards mails, posts them to `/webhooks/portal-email`. |
| 02-generic-lead-relay | Webhook `/webhook/rc-lead` for Google Sheets, Typeform, missed-call providers, etc. Maps fields and posts to `/webhooks/intake`. |
| 03-weekly-client-reports | Mondays 9:00 IST, drafts last week's report for every active client. Reports land in Approvals before anything goes to the client. |

Set the IMAP and Postgres credentials after import. The API URL, token and intake secret come from the container env (`RC_API_URL`, `RC_API_TOKEN`, `RC_INTAKE_SECRET`).
All workflows import inactive; switch them on once credentials are set.
