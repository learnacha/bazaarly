// End-to-end check of auth and the ordering rules against a RUNNING server (npm run dev / npm start).
//   npm run smoke                      -> http://localhost:3000
//   BASE_URL=https://my-app.onrender.com npm run smoke
// It creates throwaway accounts, places real orders against the catalog (cancelling them so stock
// is restored), races two buyers for the last units, and deletes the accounts again.
import assert from 'node:assert/strict';
import { MAX_QTY_PER_LINE } from '../shared/config.js';
import { orderTotals } from '../shared/pricing.js';

const BASE = process.env.BASE_URL ?? 'http://localhost:3000';
const shipping = {
  fullName: 'Smoke Test', email: 'smoke@example.com', phone: '555 010 1234',
  address: '1 Test Street', city: 'Testville', postalCode: '12345',
};
const password = 'smoke-' + Math.random().toString(36).slice(2) + 'Aa1';

// A "browser": remembers cookies between calls.
function makeUser(label) {
  const jar = new Map();
  const email = `smoke-${label}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}@example.com`;
  async function call(path, { method = 'GET', body } = {}) {
    const res = await fetch(BASE + '/api' + path, {
      method,
      // Better Auth rejects cookie-bearing writes whose Origin is not the app's own address.
      headers: { 'Content-Type': 'application/json', Origin: BASE, Cookie: [...jar].map(([k, v]) => `${k}=${v}`).join('; ') },
      body: body && JSON.stringify(body),
    });
    for (const c of res.headers.getSetCookie()) {
      const [pair] = c.split(';');
      const i = pair.indexOf('=');
      pair.slice(i + 1) ? jar.set(pair.slice(0, i), pair.slice(i + 1)) : jar.delete(pair.slice(0, i));
    }
    return { status: res.status, data: await res.json().catch(() => null) };
  }
  return { email, call };
}
const step = (name) => console.log('•', name);
const anon = makeUser('anon');
const alice = makeUser('alice');
const bob = makeUser('bob');
const users = [alice, bob];
const placed = []; // [user, orderId] to cancel in `finally`

const stockOf = async (id) => (await anon.call(`/products/${id}`)).data.stock;
const order = (u, items, extra = {}) => u.call('/orders', { method: 'POST', body: { items, shipping, payment: 'card', ...extra } });
const track = (u, res) => { if (res.status === 201) placed.push([u, res.data.id]); return res; };

try {
  step('health');
  assert.equal((await anon.call('/health')).status, 200);

  step('catalog is public');
  const { data: products } = await anon.call('/products');
  assert.ok(products.length > 0, 'no products (is the database seeded?)');
  assert.ok((await anon.call('/categories')).data.length > 0);
  assert.equal((await anon.call('/products/nope')).status, 404);
  const stocked = products.filter((p) => p.stock >= 5);
  const widget = stocked[0];
  assert.ok(widget, 'need a product with stock >= 5');

  step('orders need a signed-in user (401)');
  assert.equal((await anon.call('/orders')).status, 401);
  assert.equal((await order(anon, [{ id: widget.id, qty: 1 }])).status, 401);
  assert.equal((await anon.call('/orders/ORD-NOPE/cancel', { method: 'POST' })).status, 401);

  step('sign up, session, wrong password refused');
  for (const u of users) {
    // Production rate-limits sign-ups to a few per 10 seconds; wait the window out rather than fail.
    let up;
    for (let attempt = 0; attempt < 6; attempt++) {
      up = await u.call('/auth/sign-up/email', { method: 'POST', body: { name: 'Smoke ' + u.email.split('-')[1], email: u.email, password } });
      if (up.status !== 429) break;
      await new Promise((r) => setTimeout(r, 11000));
    }
    assert.equal(up.status, 200, JSON.stringify(up.data));
  }
  assert.equal((await alice.call('/auth/get-session')).data?.user?.email, alice.email);
  assert.notEqual((await anon.call('/auth/sign-in/email', { method: 'POST', body: { email: alice.email, password: password + 'x' } })).status, 200);
  assert.equal((await anon.call('/auth/sign-up/email', { method: 'POST', body: { name: 'x', email: 'short@example.com', password: 'short' } })).status, 400, 'short password');

  step('rejects bad input without a 500');
  for (const body of [
    { items: [], shipping, payment: 'card' },
    { items: null, shipping, payment: 'card' },
    { items: [null], shipping, payment: 'card' },
    { items: [{ id: widget.id, qty: 0 }], shipping, payment: 'card' },
    { items: [{ id: widget.id, qty: 1.5 }], shipping, payment: 'card' },
    { items: [{ id: widget.id, qty: MAX_QTY_PER_LINE + 1 }], shipping, payment: 'card' },
    { items: [{ id: 'no-such-product', qty: 1 }], shipping, payment: 'card' },
    { items: [{ id: widget.id, qty: 1 }], shipping: null, payment: 'card' },
    { items: [{ id: widget.id, qty: 1 }], shipping: { ...shipping, email: 'nope' }, payment: 'card' },
    { items: [{ id: widget.id, qty: 1 }], shipping, payment: 'bitcoin' },
  ]) {
    const r = await alice.call('/orders', { method: 'POST', body });
    assert.equal(r.status, 400, `expected 400 for ${JSON.stringify(body).slice(0, 80)}, got ${r.status}`);
  }

  step('order is repriced from the database; client totals are ignored');
  const before = await stockOf(widget.id);
  // Fake prices and totals are attached on purpose; duplicate ids must merge.
  const good = track(alice, await alice.call('/orders', {
    method: 'POST',
    body: { items: [{ id: widget.id, qty: 2, price: 0.01 }, { id: widget.id, qty: 1 }], shipping, payment: 'cod', total: 0.01 },
  }));
  assert.equal(good.status, 201, JSON.stringify(good.data));
  const expected = orderTotals(widget.price * 3);
  assert.equal(good.data.total, expected.total);
  assert.equal(good.data.items.length, 1, 'duplicate lines merged');
  assert.equal(good.data.items[0].qty, 3);
  assert.equal(await stockOf(widget.id), before - 3, 'stock decremented');

  step('only the owner sees and can cancel it (404 for others)');
  assert.equal((await bob.call('/orders')).data.length, 0);
  assert.equal((await bob.call(`/orders/${good.data.id}/cancel`, { method: 'POST' })).status, 404);
  assert.ok((await alice.call('/orders')).data.some((o) => o.id === good.data.id));

  step('cancel restores stock (and is idempotent)');
  assert.equal((await alice.call(`/orders/${good.data.id}/cancel`, { method: 'POST' })).data.status, 'cancelled');
  assert.equal((await alice.call(`/orders/${good.data.id}/cancel`, { method: 'POST' })).data.status, 'cancelled');
  assert.equal(await stockOf(widget.id), before, 'stock restored exactly once');

  step('cannot buy more than is in stock (409)');
  const tooMany = stocked.find((p) => p.stock < MAX_QTY_PER_LINE);
  if (tooMany) {
    const r = await order(alice, [{ id: tooMany.id, qty: tooMany.stock + 1 }]);
    assert.equal(r.status, 409, JSON.stringify(r.data));
  } else console.log('  (skipped: every product has more stock than one order may hold)');
  const sold = products.find((p) => p.stock === 0);
  if (sold) assert.equal((await order(alice, [{ id: sold.id, qty: 1 }])).status, 409, 'out of stock');

  step('two buyers racing for the last units: exactly one wins');
  const scarce = products.filter((p) => p.stock > 0 && p.stock <= MAX_QTY_PER_LINE).sort((a, b) => a.stock - b.stock)[0];
  if (scarce) {
    const left = await stockOf(scarce.id);
    const [r1, r2] = await Promise.all([
      order(alice, [{ id: scarce.id, qty: left }]),
      order(bob, [{ id: scarce.id, qty: left }]),
    ]);
    track(alice, r1); track(bob, r2);
    assert.deepEqual([r1.status, r2.status].sort(), [201, 409], `race result ${r1.status}/${r2.status}`);
    assert.equal(await stockOf(scarce.id), 0);
  } else console.log('  (skipped: no scarce product)');

  step('sign out ends the session; sign in again works');
  await alice.call('/auth/sign-out', { method: 'POST', body: {} });
  assert.equal((await alice.call('/orders')).status, 401);
  assert.equal((await alice.call('/auth/sign-in/email', { method: 'POST', body: { email: alice.email, password } })).status, 200);
  assert.equal((await alice.call('/orders')).status, 200);
} finally {
  // Put every unit back and remove the throwaway accounts, even when a check failed.
  for (const [u, id] of placed) await u.call(`/orders/${id}/cancel`, { method: 'POST' }).catch(() => {});
  step('cancel leftover orders and delete the throwaway accounts');
  for (const u of users) await u.call('/auth/delete-user', { method: 'POST', body: { password } }).catch(() => {});
}
console.log('\nAll checks passed. Smoke orders were cancelled (stock restored) and the smoke accounts deleted.');
