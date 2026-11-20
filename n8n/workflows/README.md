# n8n workflows

Import: n8n → Workflows → Import from file (or `docker compose exec n8n n8n import:workflow --separate --input=/workflows`).

| File | What it does |
|---|---|
| 01-portal-email-intake | Reads the leads mailbox (IMAP), keeps 99acres / MagicBricks / Housing / NoBroker / Square Yards mails, posts them to `/webhooks/portal-email`. |
| 02-generic-lead-relay | Webhook `/webhook/rc-lead` for Google Sheets, Typeform, missed-call providers, etc. Maps fields and posts to `/webhooks/intake`. |
| 03-weekly-client-reports | Mondays 9:00 IST, lists active clients via `GET /v1/clients?status=active` and drafts last week's report for each. Reports land in Approvals before anything goes to the client. Uses the service token, so it covers `DEFAULT_ORG_ID` only; the API worker already drafts the same reports for every org on the same schedule, so switch this on only if you run without the worker scheduler. |

Set the IMAP credentials after import. No workflow connects to the RealCognix database; they all go through the API. The API URL, token and intake secret come from the container env (`RC_API_URL`, `RC_API_TOKEN`, `RC_INTAKE_SECRET`).
All workflows import inactive; switch them on once credentials are set.
