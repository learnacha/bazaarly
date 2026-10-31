# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```
npm run dev      # dev server on http://localhost:3000 (API + Vite with HMR, one process)
npm run build    # build the frontend into dist/
npm start        # production: serves the API and dist/ on PORT (default 3000)
npm run smoke    # end-to-end API checks against a RUNNING server (BASE_URL to target a deployment)
```

There is no unit-test suite, linter or formatter. Verify changes with `npm run build`, `npm run smoke`, and curl against a running server.

Requires Node >= 22.9 (uses `--env-file-if-exists` and the global `WebSocket` that Neon's Pool needs). `DATABASE_URL` (a Neon Postgres connection string) must be set in `.env` or the environment, otherwise the server exits on startup. See `.env.example`.

## Architecture

A single deployable package: one Express process serves both the JSON API and the React app. There is no separate frontend server and no CORS. The browser calls same-origin `/api/*`.

- `server/index.js` mounts the API at `/api`, then either runs Vite in middleware mode (dev) or serves `dist/` with an `index.html` fallback for client-side routes (prod, chosen with `--prod` or `NODE_ENV=production`). It runs `db.init()` before listening. Vite is only imported in dev mode.
- `server/dev.js` is the dev runner. It spawns `index.js` and restarts it when a `.js` file under `server/` or `shared/` changes. **Do not replace it with `node --watch` / `--watch-path`.** On Windows these react to Vite writing `node_modules/.vite/deps_temp_*` and loop forever. For the same reason `index.js` imports `vite.config.js` itself and passes `configFile: false` to Vite.
- `server/db.js` is the only place with SQL. It uses `Pool` from `@neondatabase/serverless` (WebSocket, so interactive transactions work). The schema is idempotent `CREATE ... IF NOT EXISTS` run on every start, and `server/seed.js` is inserted only when `products` is empty. There is no migration tool, so schema changes to existing tables need a manual `ALTER` (and the same change in `SCHEMA` for fresh databases). Postgres `numeric` columns come back as strings and are converted with `Number()` in `toProduct` / `toOrder`.
- `createOrder` is the core invariant. In one transaction it locks the product rows (`ORDER BY id FOR UPDATE`), checks stock (409), reprices from the database via `shared/pricing.js`, decrements stock and inserts the order plus `order_items` snapshots (name, emoji, price). The client sends only `{items:[{id,qty}], shipping, payment}`; prices it sends are ignored. `cancelOrder` restores stock under the order row lock and is idempotent.
- `server/routes.js` handles request validation, and `HttpError` (`server/errors.js`) becomes `{error, details}` JSON. Express 5 forwards async throws to the error handler, so handlers simply `throw`.
- `shared/` is imported by both the server and the browser so the two can't disagree: `config.js` (vocabulary, tax, shipping, limits), `pricing.js` (`orderTotals`), `validation.js` (shipping form + payment methods). Keep it dependency-free. The frontend imports it as `../../shared/...`.

### Authentication (Better Auth)

Email + password accounts with cookie sessions, using `better-auth`. `server/auth.js` builds the instance on db.js's Neon Pool; `initAuth()` (called from `server/index.js` after `db.init()`) creates its four tables, prefixed `bazaarly_` so they can share a database with other apps. `server/index.js` mounts `toNodeHandler(auth)` at `/api/auth/*splat` **before** `express.json()` (Better Auth needs the raw body; Express 5 needs the named wildcard). Browsing is public; `requireUser` in `server/routes.js` resolves the session to `user.id` (401 otherwise) and every order is scoped by it (`orders.user_id`). Another user's order is a 404.

Needs `BETTER_AUTH_SECRET` (32+ chars; the server exits without it). The public URL comes from `BETTER_AUTH_URL`, else Render's `RENDER_EXTERNAL_URL`, else `http://localhost:PORT`; it must match the address in the browser or Better Auth rejects writes. There is no email provider, so no email verification or password reset (account deletion with password is enabled, and the smoke test uses it to clean up).

Client side: `src/api/auth.js` wraps `createAuthClient` (`useSession`, `signIn`, `signUp`, `signOut`); `RequireAuth` guards `/checkout` and `/orders` and returns the visitor (with router state) after `/login`.

### Frontend (`src/`)

- `src/api/api.js` is the only module that calls the server. It throws `ApiError` with `status` and `details` (per-field errors the form displays).
- `StoreContext` keeps cart and wishlist (product snapshots) in localStorage via `storage.js`; snapshots can be stale, the server is the authority at submit. Checkout guards `cart.length === 0 && !submitting` and navigates before `clearCart()` so a successful order doesn't bounce to /cart. Effects that fetch on user input use an `off` flag.
- Routing uses react-router v6 (`src/App.jsx`). Styling is a single global `src/index.css` with CSS variables, no CSS framework. Images are emoji.

## Local environment notes

- Port 3000 may be held by another project (a Docker container did here); run with `PORT=3100 npm run dev` and `BASE_URL=http://localhost:3100 npm run smoke`. Only kill processes you started.
- Smoke leaves cancelled order rows behind (accounts are deleted, orders have no FK to them); stock is restored.

## Deploy

See `README.md`. Render needs `npm install --include=dev` for the build step because Vite is a devDependency (`render.yaml` does this).
