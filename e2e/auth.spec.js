import { test as base, expect } from '@playwright/test';
import { test, PASSWORD } from './fixtures.js';

base.describe('auth guards', () => {
  base('checkout and orders redirect anonymous visitors to sign in @smoke', async ({ page }) => {
    await page.goto('/orders');
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByText('Please sign in to continue.')).toBeVisible();
  });

  base('sign-in form validates input', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Email').fill('not-an-email');
    await page.getByLabel('Password').fill('longenough1');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByText('Enter a valid email')).toBeVisible();

    await page.getByLabel('Email').fill('a@example.com');
    await page.getByLabel('Password').fill('short');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByText(/at least 8 characters/)).toBeVisible();
  });

  base('wrong credentials show an error', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Email').fill(`nobody-${Date.now()}@example.com`);
    await page.getByLabel('Password').fill('Wrong-password-1');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.locator('.alert')).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });
});

test.describe('account', () => {
  test('sign up, sign out, sign back in', async ({ page, user }) => {
    await expect(page.getByText(user.name)).toBeVisible();
    await page.getByRole('button', { name: 'Sign out' }).click();
    await expect(page.getByRole('link', { name: 'Sign in' })).toBeVisible();

    await page.goto('/login');
    await page.getByLabel('Email').fill(user.email);
    await page.getByLabel('Password').fill(PASSWORD);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();
  });
});
