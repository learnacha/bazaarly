// Postgres data access, using Neon's serverless driver. This is the only file with SQL.
// The Pool talks to Neon over WebSockets, which supports full transactions (needed for checkout).
import { randomUUID } from 'node:crypto';
import { Pool } from '@neondatabase/serverless';
import { MAX_ACTIVE_ORDERS_PER_USER } from '../shared/config.js';
import { orderTotals } from '../shared/pricing.js';
import { HttpError } from './errors.js';
import { CATEGORIES, PRODUCTS } from './seed.js';

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is not set. Add your Neon connection string to .env (see .env.example).');
  process.exit(1);
}

export const pool = new Pool({ connectionString: process.env.DATABASE_URL });
pool.on('error', (err) => console.error('Database connection error:', err.message));

// Idempotent, so it is safe to run on every start. There is no migration tool: a change to an
// existing table needs a manual ALTER (add it here too so fresh databases match).
//
// CHECK (stock >= 0) is the backstop for overselling; createOrder's row locks make the loser of
// a race fail with a clean message instead of tripping it. Order lines copy name, emoji and
// price so editing the catalog later doesn't rewrite history.
const SCHEMA = `
  CREATE TABLE IF NOT EXISTS categories (
    name text PRIMARY KEY,
    sort integer NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS products (
    id          text PRIMARY KEY,
    name        text NOT NULL,
    category    text NOT NULL REFERENCES categories(name),
    price       numeric(10, 2) NOT NULL CHECK (price >= 0),
    rating      numeric(2, 1) NOT NULL DEFAULT 0,
    stock       integer NOT NULL CHECK (stock >= 0),
    emoji       text NOT NULL DEFAULT '',
    description text NOT NULL DEFAULT '',
    active      boolean NOT NULL DEFAULT true
  );

  CREATE TABLE IF NOT EXISTS orders (
    id           text PRIMARY KEY,
    user_id      text NOT NULL,
    status       text NOT NULL DEFAULT 'placed' CHECK (status IN ('placed', 'cancelled')),
    shipping     jsonb NOT NULL,
    payment      text NOT NULL,
    subtotal     numeric(10, 2) NOT NULL,
    shipping_fee numeric(10, 2) NOT NULL,
    tax          numeric(10, 2) NOT NULL,
    total        numeric(10, 2) NOT NULL,
    created_at   timestamptz NOT NULL DEFAULT now()
  );
  CREATE INDEX IF NOT EXISTS orders_user_idx ON orders (user_id, created_at DESC);

  CREATE TABLE IF NOT EXISTS order_items (
    order_id   text NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    product_id text NOT NULL REFERENCES products(id),
    name       text NOT NULL,
    emoji      text NOT NULL,
    price      numeric(10, 2) NOT NULL,
    qty        integer NOT NULL CHECK (qty > 0),
    PRIMARY KEY (order_id, product_id)
  );
`;

async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

// Creates the tables and, on an empty database, loads the starter data.
export async function init() {
  await pool.query(SCHEMA);
  await withTransaction(async (client) => {
    const { rows } = await client.query('SELECT count(*)::int AS n FROM products');
    if (rows[0].n > 0) return;
    for (const [i, name] of CATEGORIES.entries()) {
      await client.query('INSERT INTO categories (name, sort) VALUES ($1, $2) ON CONFLICT DO NOTHING', [name, i]);
    }
    for (const p of PRODUCTS) {
      await client.query(
        `INSERT INTO products (id, name, category, price, rating, stock, emoji, description)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) ON CONFLICT DO NOTHING`,
        [p.id, p.name, p.category, p.price, p.rating, p.stock, p.emoji, p.description],
      );
    }
    console.log(`Seeded ${PRODUCTS.length} products`);
  });
}

export async function ping() {
  await pool.query('SELECT 1');
}

// Postgres returns numeric columns as strings to avoid precision loss; prices fit in a JS number.
const toProduct = (r) => ({
  id: r.id,
  name: r.name,
  category: r.category,
  price: Number(r.price),
  rating: Number(r.rating),
  stock: r.stock,
  emoji: r.emoji,
  description: r.description,
});

const toOrder = (r, items) => ({
  id: r.id,
  status: r.status,
  shipping: r.shipping,
  payment: r.payment,
  subtotal: Number(r.subtotal),
  shippingFee: Number(r.shipping_fee),
  tax: Number(r.tax),
  total: Number(r.total),
  createdAt: r.created_at,
  items: items.map((i) => ({
    productId: i.product_id, name: i.name, emoji: i.emoji, price: Number(i.price), qty: i.qty,
  })),
});

export async function getCategories() {
  const { rows } = await pool.query('SELECT name FROM categories ORDER BY sort, name');
  return rows.map((r) => r.name);
}

export async function getProducts() {
  const { rows } = await pool.query('SELECT * FROM products WHERE active ORDER BY name');
  return rows.map(toProduct);
}

export async function getProduct(id) {
  const { rows } = await pool.query('SELECT * FROM products WHERE id = $1 AND active', [id]);
  return rows[0] ? toProduct(rows[0]) : null;
}

async function attachItems(orderRows) {
  if (!orderRows.length) return [];
  const { rows: items } = await pool.query(
    'SELECT * FROM order_items WHERE order_id = ANY($1) ORDER BY name',
    [orderRows.map((o) => o.id)],
  );
  return orderRows.map((o) => toOrder(o, items.filter((i) => i.order_id === o.id)));
}

export async function getOrdersForUser(userId) {
  const { rows } = await pool.query('SELECT * FROM orders WHERE user_id = $1 ORDER BY created_at DESC', [userId]);
  return attachItems(rows);
}

// The client sends only what the customer chose: [{ id, qty }] plus shipping and payment. The
// server loads the rows, checks stock, prices from the database and ignores any price or total
// in the request. All of it is one transaction.
export async function createOrder({ userId, items, shipping, payment }) {
  return withTransaction(async (client) => {
    // Lock the rows being bought (in id order, so two checkouts can't deadlock) so that two
    // customers can't both take the last item.
    const { rows } = await client.query(
      'SELECT * FROM products WHERE id = ANY($1) AND active ORDER BY id FOR UPDATE',
      [items.map((i) => i.id)],
    );
    const products = new Map(rows.map((r) => [r.id, toProduct(r)]));
    const lines = items.map(({ id, qty }) => {
      const product = products.get(id);
      if (!product) throw new HttpError(400, `Product ${id} is no longer available`);
      if (qty > product.stock) {
        throw new HttpError(409, product.stock === 0
          ? `${product.name} is out of stock`
          : `Only ${product.stock} ${product.name} left in stock`);
      }
      return { product, qty };
    });

    const { rows: [{ n: active }] } = await client.query(
      `SELECT count(*)::int AS n FROM orders WHERE user_id = $1 AND status = 'placed'`,
      [userId],
    );
    if (active >= MAX_ACTIVE_ORDERS_PER_USER) {
      throw new HttpError(409, `You can have at most ${MAX_ACTIVE_ORDERS_PER_USER} active orders. Cancel one first.`);
    }

    const totals = orderTotals(lines.reduce((sum, l) => sum + l.product.price * l.qty, 0));
    const id = 'ORD-' + randomUUID().slice(0, 8).toUpperCase();
    const { rows: [order] } = await client.query(
      `INSERT INTO orders (id, user_id, shipping, payment, subtotal, shipping_fee, tax, total)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [id, userId, shipping, payment, totals.subtotal, totals.shipping, totals.tax, totals.total],
    );
    const itemRows = [];
    for (const { product, qty } of lines) {
      await client.query('UPDATE products SET stock = stock - $2 WHERE id = $1', [product.id, qty]);
      const { rows: [row] } = await client.query(
        `INSERT INTO order_items (order_id, product_id, name, emoji, price, qty)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [id, product.id, product.name, product.emoji, product.price, qty],
      );
      itemRows.push(row);
    }
    return toOrder(order, itemRows);
  });
}

// Customers can only cancel their own orders; the stock goes back on the shelf.
// Idempotent: cancelling an already-cancelled order succeeds.
export async function cancelOrder(userId, id) {
  return withTransaction(async (client) => {
    const { rows: [o] } = await client.query(
      'SELECT * FROM orders WHERE id = $1 AND user_id = $2 FOR UPDATE',
      [id, userId],
    );
    // Someone else's order looks the same as a missing one.
    if (!o) throw new HttpError(404, 'Order not found');
    const { rows: items } = await client.query('SELECT * FROM order_items WHERE order_id = $1 ORDER BY product_id', [id]);
    if (o.status === 'cancelled') return toOrder(o, items);
    for (const i of items) {
      await client.query('UPDATE products SET stock = stock + $2 WHERE id = $1', [i.product_id, i.qty]);
    }
    const { rows: [updated] } = await client.query(
      `UPDATE orders SET status = 'cancelled' WHERE id = $1 RETURNING *`,
      [id],
    );
    return toOrder(updated, items);
  });
}

export async function close() {
  await pool.end();
}
