import express from 'express';
import { fromNodeHeaders } from 'better-auth/node';
import { auth } from './auth.js';
import * as db from './db.js';
import { HttpError } from './errors.js';
import { MAX_LINES, MAX_QTY_PER_LINE } from '../shared/config.js';
import { PAYMENT_METHODS, SHIPPING_FIELDS, validateShipping } from '../shared/validation.js';

const router = express.Router();

// The signed-in user's id, from the Better Auth session cookie. Browsing is public; everything
// that touches a person's orders goes through here. Records are always scoped by this id.
async function requireUser(req) {
  const session = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) });
  if (!session) throw new HttpError(401, 'Please sign in to continue');
  return session.user.id;
}

// Accepts [{ id, qty }], merges duplicate ids, and rejects anything else. Prices are never read.
function parseItems(raw) {
  if (!Array.isArray(raw) || raw.length === 0) throw new HttpError(400, 'Your cart is empty');
  if (raw.length > MAX_LINES * 4) throw new HttpError(400, 'Too many items');
  const merged = new Map();
  for (const item of raw) {
    if (!item || typeof item.id !== 'string' || !Number.isInteger(item.qty) || item.qty < 1) {
      throw new HttpError(400, 'Invalid cart item');
    }
    merged.set(item.id, (merged.get(item.id) ?? 0) + item.qty);
  }
  if (merged.size > MAX_LINES) throw new HttpError(400, `At most ${MAX_LINES} different items per order`);
  const items = [...merged].map(([id, qty]) => ({ id, qty }));
  if (items.some((i) => i.qty > MAX_QTY_PER_LINE)) {
    throw new HttpError(400, `At most ${MAX_QTY_PER_LINE} of one item per order`);
  }
  return items;
}

router.get('/health', async (req, res) => {
  await db.ping();
  res.json({ ok: true });
});

router.get('/categories', async (req, res) => res.json(await db.getCategories()));

router.get('/products', async (req, res) => res.json(await db.getProducts()));

router.get('/products/:id', async (req, res) => {
  const product = await db.getProduct(req.params.id);
  if (!product) throw new HttpError(404, 'Not found');
  res.json(product);
});

router.get('/orders', async (req, res) => {
  res.json(await db.getOrdersForUser(await requireUser(req)));
});

router.post('/orders', async (req, res) => {
  const userId = await requireUser(req);
  const { items, shipping, payment } = req.body ?? {};

  const parsed = parseItems(items);
  const errors = validateShipping(shipping);
  if (Object.keys(errors).length) throw new HttpError(400, 'Please fix the highlighted fields', errors);
  if (!PAYMENT_METHODS.some((m) => m.id === payment)) throw new HttpError(400, 'Choose a payment method');

  // Prices, stock and totals are decided by the database, never by the request.
  const order = await db.createOrder({
    userId,
    items: parsed,
    payment,
    // Keep only the known fields, trimmed.
    shipping: Object.fromEntries(SHIPPING_FIELDS.map((f) => [f.name, shipping[f.name].trim()])),
  });
  res.status(201).json(order);
});

router.post('/orders/:id/cancel', async (req, res) => {
  res.json(await db.cancelOrder(await requireUser(req), req.params.id));
});

router.use((req, res) => res.status(404).json({ error: 'Not found' }));

// Express 5 forwards errors thrown in handlers (sync or async) to this handler.
router.use((err, req, res, next) => {
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message, details: err.details });
  }
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON' });
  console.error(err);
  res.status(500).json({ error: 'Something went wrong' });
});

export default router;
