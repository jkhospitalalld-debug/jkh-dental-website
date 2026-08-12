# J.K. Hospital Dental Care Center — Website with Case Photos Admin

## What's inside
- `public/index.html` — the website (now has a "Before & After Cases" gallery section)
- `public/admin.html` — password-protected admin page to add/delete case photos
- `public/assets/` — logo and doctor photo
- `src/index.js` — Cloudflare Worker backend (API + serves the website)
- `wrangler.toml` — Cloudflare configuration
- `schema.sql` — database table setup

## Admin password
Set in Cloudflare dashboard as a secret named `ADMIN_PASSWORD` (not written in code, so it stays private).

## Deploy steps (GitHub + Cloudflare dashboard only, no local tools needed)
1. Create a new GitHub repository and upload all these files (keep the folder structure).
2. In Cloudflare dashboard: create a D1 database named `jkh-website-db`.
3. Run the contents of `schema.sql` in the D1 console (Query tab) to create the `case_photos` table.
4. Copy the D1 database ID and paste it into `wrangler.toml` in place of `PASTE_YOUR_DATABASE_ID_HERE`.
5. In Cloudflare dashboard: create a new Worker, connect it to the GitHub repo (Workers Builds), so it auto-deploys on every push.
6. In the Worker's Settings → Variables, add a secret: `ADMIN_PASSWORD` = your chosen password.
7. In the Worker's Settings → Bindings, confirm the D1 binding `DB` and Assets binding `ASSETS` are attached (should pick up from wrangler.toml automatically).
8. Visit `your-worker-url.workers.dev/admin.html` to log in and add case photos.
9. Case photos will appear automatically on the main website under "Before & After Cases".
