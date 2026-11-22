import { test, expect, money, addFirstProduct } from './fixtures.js';

test.describe('cart', () => {
  test('empty cart state', async ({ page }) => {
    await page.goto('/cart');
    await expect(page.getByRole('heading', { name: 'Your cart is empty' })).toBeVisible();
  });

  test('add, change quantity, remove @smoke', async ({ page }) => {
    const name = await addFirstProduct(page);
    await expect(page.locator('.nav .badge')).toHaveText('1');
    await page.getByRole('link', { name: /^Cart/ }).click();
    await expect(page.getByRole('link', { name })).toBeVisible();

    const unit = money(await page.locator('.line .line-info .muted').textContent());
    await page.getByRole('button', { name: 'Increase' }).click();
    await expect(page.locator('.qty span')).toHaveText('2');
    expect(money(await page.locator('.line-total').textContent())).toBeCloseTo(unit * 2, 2);

    await page.getByRole('button', { name: 'Decrease' }).click();
    await expect(page.locator('.qty span')).toHaveText('1');
    await page.getByRole('button', { name: 'Remove' }).click();
    await expect(page.getByRole('heading', { name: 'Your cart is empty' })).toBeVisible();
  });

  test('order summary adds up (subtotal + shipping + tax = total)', async ({ page }) => {
    await addFirstProduct(page);
    await page.goto('/cart');
    const v = async (label) => money(await page.locator('dl.summary dt').getByText(new RegExp('^' + label)).locator('xpath=following-sibling::dd[1]').textContent());
    const subtotal = await v('Subtotal');
    const shippingText = await page.locator('dl.summary dt').getByText('Shipping').locator('xpath=following-sibling::dd[1]').textContent();
    const shipping = shippingText === 'Free' ? 0 : money(shippingText);
    const tax = await v('Tax');
    const total = await v('Total');
    expect(subtotal + shipping + tax).toBeCloseTo(total, 1);
  });

  test('cart persists across reload', async ({ page }) => {
    await addFirstProduct(page);
    await page.reload();
    await expect(page.locator('.nav .badge')).toHaveText('1');
  });

  test('clear cart', async ({ page }) => {
    await addFirstProduct(page);
    await page.goto('/cart');
    await page.getByRole('button', { name: 'Clear cart' }).click();
    await expect(page.getByRole('heading', { name: 'Your cart is empty' })).toBeVisible();
  });

  test('add from product detail with quantity', async ({ page }) => {
    await page.goto('/');
    await page.locator('.card-link').first().click();
    await page.locator('.qty button', { hasText: '+' }).click();
    await page.getByRole('button', { name: 'Add to cart' }).click();
    await expect(page.getByText('Added to your cart.')).toBeVisible();
    await expect(page.locator('.nav .badge')).toHaveText('2');
  });
});

test.describe('wishlist', () => {
  test('save and remove', async ({ page }) => {
    await page.goto('/wishlist');
    await expect(page.getByText('Nothing saved yet.')).toBeVisible();

    await page.goto('/');
    const card = page.locator('.card').first();
    const name = (await card.locator('h3').textContent()).trim();
    await card.getByRole('button', { name: 'Add to wishlist' }).click();
    await expect(page.locator('.nav .badge')).toHaveText('1');

    await page.getByRole('link', { name: /^Wishlist/ }).click();
    await expect(page.locator('.card h3', { hasText: name })).toBeVisible();
    await page.getByRole('button', { name: 'Remove from wishlist' }).click();
    await expect(page.getByText('Nothing saved yet.')).toBeVisible();
  });
});
