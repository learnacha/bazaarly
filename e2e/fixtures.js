import { test as base, expect } from '@playwright/test';

export const PASSWORD = 'E2e-' + Math.random().toString(36).slice(2) + 'Aa1';
export const SHIPPING = {
  'Full name': 'E2E Tester', Email: 'e2e@example.com', Phone: '555 010 1234',
  'Street address': '1 Test Street', City: 'Testville', 'Postal code': '12345',
};

export const money = (text) => Number(text.replace(/[^0-9.]/g, ''));

// `user`: a fresh account signed up through the UI. Its orders are cancelled (stock restored)
// and the account deleted afterwards, so runs leave the database as they found it.
export const test = base.extend({
  user: async ({ page }, use) => {
    const email = `e2e-${Date.now()}-${Math.random().toString(16).slice(2, 8)}@example.com`;
    const name = 'E2E User';
    await page.goto('/login');
    await page.getByRole('button', { name: 'New here? Create an account' }).click();
    await page.getByLabel('Name').fill(name);
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password').fill(PASSWORD);
    await page.getByRole('button', { name: 'Create account' }).click();
    await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();

    await use({ email, name, password: PASSWORD });

    const api = page.context().request;
    const origin = new URL(page.url()).origin;
    const headers = { Origin: origin };
    const orders = await api.get('/api/orders').then((r) => (r.ok() ? r.json() : [])).catch(() => []);
    for (const o of orders) if (o.status === 'placed') await api.post(`/api/orders/${o.id}/cancel`, { headers }).catch(() => {});
    await api.post('/api/auth/delete-user', { headers, data: { password: PASSWORD } }).catch(() => {});
  },
});

export { expect };

export async function fillShipping(page, values = SHIPPING) {
  for (const [label, value] of Object.entries(values)) await page.getByLabel(label, { exact: true }).fill(value);
}

// Add the first in-stock product to the cart from the shop page and return its name.
export async function addFirstProduct(page) {
  await page.goto('/');
  const card = page.locator('.card', { has: page.getByRole('button', { name: 'Add to cart' }) }).first();
  const name = (await card.locator('h3').textContent()).trim();
  await card.getByRole('button', { name: 'Add to cart' }).click();
  return name;
}
