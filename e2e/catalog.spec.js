import { test, expect, money } from './fixtures.js';

test.describe('catalog', () => {
  test('lists products and filters by category @smoke', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: /Everything you need/ })).toBeVisible();
    const cards = page.locator('.card');
    await expect(cards.first()).toBeVisible();
    const all = await cards.count();

    const chips = page.locator('.chip:not(.active)');
    const label = (await chips.first().textContent()).trim();
    await chips.first().click();
    await expect(page.locator('.chip.active')).toHaveText(label);
    for (const c of await page.locator('.card .card-body > span.muted').allTextContents()) expect(c).toBe(label);
    expect(await cards.count()).toBeLessThanOrEqual(all);
  });

  test('search narrows results and shows an empty state', async ({ page }) => {
    await page.goto('/');
    const first = page.locator('.card h3').first();
    const name = (await first.textContent()).trim();
    await page.getByPlaceholder('Search products…').fill(name);
    await expect(page.locator('.card h3', { hasText: name }).first()).toBeVisible();
    await page.getByPlaceholder('Search products…').fill('zzz-no-such-product-zzz');
    await expect(page.getByText('No products match your filters.')).toBeVisible();
  });

  test('sorts by price low to high', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.card').first()).toBeVisible();
    await page.getByLabel('Sort').selectOption('low');
    const prices = (await page.locator('.card .price').allTextContents()).map(money);
    expect(prices).toEqual([...prices].sort((a, b) => a - b));
    await page.getByLabel('Sort').selectOption('high');
    const desc = (await page.locator('.card .price').allTextContents()).map(money);
    expect(desc).toEqual([...desc].sort((a, b) => b - a));
  });

  test('product detail page and unknown product', async ({ page }) => {
    await page.goto('/');
    const name = (await page.locator('.card h3').first().textContent()).trim();
    await page.locator('.card-link').first().click();
    await expect(page).toHaveURL(/\/product\//);
    await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();

    await page.goto('/product/does-not-exist');
    await expect(page.getByRole('heading', { name: 'Product not found' })).toBeVisible();
  });

  test('unknown route shows not-found page', async ({ page }) => {
    await page.goto('/no/such/page');
    await expect(page.getByRole('link', { name: /Shop|Back|home/i }).first()).toBeVisible();
  });
});
