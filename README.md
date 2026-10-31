# Bazaarly

An eCommerce portal (catalog, cart, checkout, orders): React + Vite frontend and a Node.js + Express API, run as **one process from one package**, with data stored in **Neon serverless Postgres**.

## Run

1. Create a Neon project at https://console.neon.tech and copy its connection string (Connect button).
2. Copy `.env.example` to `.env`, set `DATABASE_URL` to that string and `BETTER_AUTH_SECRET` to a random 32+ character value (the file shows a one-line command to generate one).
3. Start the app:

```
npm install
npm run dev          # development: http://localhost:3000, with hot reload
```

On first start the server creates the tables and loads the starter data.

```
npm run build        # builds the frontend into dist/
npm start            # serves the API and the built app on http://localhost:3000
npm run smoke        # API checks against the running server (BASE_URL=... to target a deployment)
```

## Deploy (Render + Neon)

1. Push this folder to a GitHub repository (`.env` is git-ignored).
2. In Render choose **New > Blueprint**, pick the repository; `render.yaml` defines the service.
3. Set `DATABASE_URL` (your Neon connection string) when prompted.
4. After the first deploy: `BASE_URL=https://<your-service>.onrender.com npm run smoke`.

Any host that runs Node 22.9+ works: the build is `npm install --include=dev && npm run build` and the start command is `npm start`. The app keeps no data on local disk. Render's free plan sleeps after inactivity, so the first request after a pause is slow.

| Variable       | Default         | Purpose                          |
|----------------|-----------------|----------------------------------|
| `DATABASE_URL` | none (required) | Neon Postgres connection string  |
| `BETTER_AUTH_SECRET` | none (required) | Signs session cookies, 32+ characters |
| `BETTER_AUTH_URL` | `RENDER_EXTERNAL_URL`, else `http://localhost:PORT` | Public URL; set it on hosts other than Render |
| `PORT`         | `3000`          | HTTP port (set by most hosts)    |

## How it fits together

```
server/
  index.js    Entry point. API at /api; dev: Vite inside Express; prod: serves dist/
  dev.js      Dev runner: restarts index.js when server/ or shared/ code changes
  routes.js   API endpoints and request validation
  db.js       All SQL: schema, queries, the checkout transaction
  seed.js     Starter catalog, loaded into an empty database
shared/       Rules used by both browser and server (config, pricing, validation)
src/
  api/api.js  The only place the frontend calls the server
  context/    StoreContext: cart + wishlist (localStorage)
  pages/      Home, ProductDetail, Cart, Checkout, Orders, Wishlist, Login
```

### API

| Method | Path                                | Notes                                              |
|--------|-------------------------------------|----------------------------------------------------|
| GET    | `/api/health`                       | Health check                                       |
| GET    | `/api/categories`                   |                                                    |
| GET    | `/api/products`                     | Active products                                    |
| GET    | `/api/products/:id`                 | 404 if not found                                   |
| GET    | `/api/orders`                       | The caller's orders (sign-in required)             |
| POST   | `/api/orders`                       | `{ items: [{id, qty}], shipping, payment }`        |
| POST   | `/api/orders/:id/cancel`            | Owner only; restores stock; idempotent             |

Checkout is one transaction that locks the product rows, checks stock, prices from the database (free shipping from $50, 8% tax, see `shared/config.js`) and decrements stock; a `CHECK (stock >= 0)` backs it up. Prices and totals sent by the browser are ignored. Order lines copy name, emoji and price so catalog edits don't rewrite history.

Accounts use [Better Auth](https://www.better-auth.com) (email + password, cookie sessions; its endpoints live under `/api/auth/*`). Browsing is public; checkout, listing and cancelling orders need an account, and you only ever see your own orders. There is no email verification or password reset yet (that needs an email provider).

To reset the data, drop the tables in the Neon SQL editor and restart (the server recreates and reseeds them):

```sql
DROP TABLE order_items, orders, products, categories;
```

Payment is a demo: no card details are collected or stored. Cart and wishlist live in the browser (localStorage), not in the account.
