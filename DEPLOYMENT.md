# Cotrix production deployment

1. Use a Node.js hosting service that can run `npm install` and `npm start`.
2. Set these server environment variables in the hosting provider (do NOT commit them): `DATABASE_URL`, `SESSION_SECRET`, `ADMIN_MOBILE`, `ADMIN_PASSWORD`.
3. Set `NODE_ENV=production`.
4. Optional features require their own secrets: `GEMINI_API_KEY` for OCR/AI reading and Cloudinary variables for remote image storage.
5. Run `npm install` and `npm start`. The server initializes the PostgreSQL schema automatically.

Security changes in this build:
- No in-memory database fallback.
- Owner passwords are bcrypt-hashed.
- Owner/admin sessions are server-side and delivered via HttpOnly cookies.
- Cashier device tokens are random, HttpOnly and stored hashed server-side.
- Cashier API access is server-enforced, not just hidden in the UI.
- E-Way Bills are owner-scoped in PostgreSQL; browser localStorage is not used as their database.
- Demo/sample GSTR-2B records and fabricated OCR values are removed.
- PDF/image export uses real browser Blob/File APIs; unsupported native share falls back to a real download rather than pretending a file was sent.
- A missing database configuration is a startup error instead of silently losing data in memory.

Important: rotate any database/API credentials that were previously exposed in chat, source control, screenshots, or logs. Never put production secrets into the ZIP or frontend `VITE_*` variables unless they are intentionally public.

6. Netlify should host the Vite frontend (`npm run build`, publish `dist`).
7. On Netlify set `VITE_API_BASE_URL` to the exact Render backend URL, for example `https://your-service.onrender.com` (no trailing slash). This value is public by design; never put database/API secrets in `VITE_*`.
8. On Render, deploy the same GitHub repository as a Node Web Service with `npm start`, and set the server-only variables listed above.
9. The included `netlify.toml` provides the SPA fallback required for direct `/cashier` links.
10. After changing `VITE_API_BASE_URL`, trigger a fresh Netlify deploy so the value is compiled into the frontend.
