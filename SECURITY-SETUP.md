# Cotrix security & production setup

## Secrets
Never commit real Neon, Gemini, Cloudinary, Firebase, admin, or session secrets to git or the ZIP. Put them in the server environment (`.env` locally / hosting secret manager in production).

Because credentials may have been pasted into a chat during development, rotate exposed credentials before production deployment. Production startup now fails closed if `DATABASE_URL` or a sufficiently long `SESSION_SECRET` is missing; PostgreSQL errors are not silently redirected to volatile in-memory storage.

Required server variables:
- `DATABASE_URL`
- `GEMINI_API_KEY`
- `CLOUDINARY_CLOUD_NAME`
- `CLOUDINARY_API_KEY`
- `CLOUDINARY_API_SECRET`
- `ADMIN_MOBILE`
- `ADMIN_PASSWORD`
- `SESSION_SECRET` (at least 32 characters)
- `CORS_ALLOWED_ORIGINS` (comma-separated exact browser origins if the frontend is hosted on a different domain from the API; e.g. your production Vercel URL)

Client Firebase variables are only needed if the Firebase-dependent features are enabled.

## Data isolation
Owner identity is taken from the HttpOnly `cotrix_session` cookie or a server-verified bearer session. Client-supplied `x-user-mobile` is not an authority. Cashier identity is taken from the approved device cookie and its hashed server-side record.

## Cashier
Cashier access is limited server-side to approved data-entry APIs. Reports, ledgers, dashboards, settings, admin APIs, and other owner data are rejected even if a cashier manually calls the API.

## Reconciliation data
GSTR-2B portal cache and temporary OCR purchase staging are kept separate from permanent purchase/accounting ledgers until the user explicitly confirms a purchase. BRS bank-statement rows are stored only in the bank reconciliation dataset and are not automatically posted to the ledger.
