import { test, expect, addFirstProduct, fillShipping, money } from './fixtures.js';

test.describe('checkout and orders', () => {
  test('place an order, see it, cancel it @smoke', async ({ page, user }) => {
    const name = await addFirstProduct(page);
    await page.goto('/cart');
    await page.getByRole('button', { name: 'Checkout' }).click();
    await expect(page).toHaveURL(/\/checkout/);
    await fillShipping(page);
    const placeLabel = await page.getByRole('button', { name: /Place order/ }).textContent();
    const total = money(placeLabel);
    await page.getByRole('button', { name: /Place order/ }).click();

    await expect(page).toHaveURL(/\/orders/);
    await expect(page.locator('.banner')).toContainText('has been placed');
    const order = page.locator('.order.highlight');
    await expect(order).toContainText(name);
    await expect(order.locator('.status')).toHaveText('Placed');
    expect(money(await order.locator('.order-head > strong').textContent())).toBeCloseTo(total, 2);
    await expect(page.locator('.nav .badge')).toHaveCount(0); // cart emptied

    page.once('dialog', (d) => d.accept());
    await order.getByRole('button', { name: 'Cancel order' }).click();
    await expect(order.locator('.status')).toHaveText('Cancelled');
  });

  test('cash on delivery can be chosen', async ({ page, user }) => {
    await addFirstProduct(page);
    await page.goto('/checkout');
    await page.getByLabel('Cash on delivery').check();
    await fillShipping(page);
    await page.getByRole('button', { name: /Place order/ }).click();
    await expect(page.locator('.banner')).toContainText('has been placed');
  });

  test('shipping form shows validation errors', async ({ page, user }) => {
    await addFirstProduct(page);
    await page.goto('/checkout');
    await page.getByLabel('Full name').fill('');
    await page.getByLabel('Email', { exact: true }).fill('bad');
    await page.getByLabel('Phone').fill('abc');
    await page.getByRole('button', { name: /Place order/ }).click();
    await expect(page.locator('.error', { hasText: 'Required' }).first()).toBeVisible();
    await expect(page.getByText('Enter a valid email')).toBeVisible();
    await expect(page.getByText('Enter a valid phone number')).toBeVisible();
    await expect(page).toHaveURL(/\/checkout/);
  });

  test('empty cart cannot be checked out', async ({ page, user }) => {
    await page.goto('/checkout');
    await expect(page).toHaveURL(/\/cart/);
  });

  test('orders page empty state for a new account', async ({ page, user }) => {
    await page.goto('/orders');
    await expect(page.getByText("You haven't placed any orders yet.")).toBeVisible();
  });

  test('guest is sent to sign in at checkout and returns after', async ({ page }) => {
    await addFirstProduct(page);
    await page.goto('/checkout');
    await expect(page).toHaveURL(/\/login/);
    await page.getByRole('button', { name: 'New here? Create an account' }).click();
    const email = `e2e-guest-${Date.now()}@example.com`;
    await page.getByLabel('Name').fill('Guest E2E');
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password').fill('Guest-pass-1Aa');
    await page.getByRole('button', { name: 'Create account' }).click();
    await expect(page).toHaveURL(/\/checkout/);
    // cleanup
    const api = page.context().request;
    await api.post('/api/auth/delete-user', { headers: { Origin: new URL(page.url()).origin }, data: { password: 'Guest-pass-1Aa' } });
  });
});
