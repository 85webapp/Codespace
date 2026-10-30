# Cotrix — Render deployment

This project is designed to run as one Render Node Web Service. The same service serves the Vite-built frontend from `dist/` and the Express API under `/api/*`.

## Render settings
- Runtime: Node
- Build Command: `npm install && npm run build`
- Start Command: `npm start`
- Node: use the current Node runtime supplied by Render; `package.json` is ESM and uses `tsx`.

## Required environment variables
Set these in Render Environment (never commit real values):
- `NODE_ENV=production`
- `DATABASE_URL=<Neon PostgreSQL connection string>`
- `SESSION_SECRET=<long random secret>`
- `ADMIN_MOBILE=<admin mobile>`
- `ADMIN_PASSWORD=<admin password>`
- `CLOUDINARY_CLOUD_NAME=<Cloudinary cloud name>`
- `CLOUDINARY_API_KEY=<Cloudinary API key>`
- `CLOUDINARY_API_SECRET=<Cloudinary API secret>`
- `GEMINI_API_KEY=<Gemini API key>`

Do not add these values to GitHub or the ZIP.

## Important
The application initializes/updates its PostgreSQL tables on startup. A failed database connection should be treated as a deployment/runtime configuration problem, not silently replaced with an in-memory database.

After a successful deploy, use the Render URL as the complete app URL. No separate Netlify frontend is required for this architecture.
