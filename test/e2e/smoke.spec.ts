import { expect, test } from '@playwright/test';
import manifest from '../../src/data/photos.json' with { type: 'json' };

const publicGallery = manifest.galleries.find((g) => !g.passwordHash && g.photos.some((p) => p.kind === 'photo'))!;
const lockedGallery = manifest.galleries.find((g) => g.passwordHash);

test('home page renders the hero and featured photos', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/Ryan Taylor/);
  const firstImage = page.locator('.feature-photos img').first();
  await expect(firstImage).toBeVisible();
  await expect.poll(() => firstImage.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
});

test('gallery lightbox opens, navigates and closes', async ({ page }) => {
  await page.goto(`/${publicGallery.slug}/`);
  await page.locator('button.tile').first().click();
  const lightbox = page.locator('#lightbox');
  await expect(lightbox).toBeVisible();
  const firstSrc = await page.locator('#lightbox-image').getAttribute('src');
  if (publicGallery.photos.length > 1) {
    await page.keyboard.press('ArrowRight');
    await expect(page.locator('#lightbox-image')).not.toHaveAttribute('src', firstSrc!);
  }
  await page.keyboard.press('Escape');
  await expect(lightbox).toBeHidden();
});

test('protected gallery shows the lock screen and rejects a wrong password', async ({ page }) => {
  test.skip(!lockedGallery, 'no protected gallery in the manifest');
  const response = await page.goto(`/${lockedGallery!.slug}/`);
  expect(response?.status()).toBe(401);
  await expect(page.locator('.tile img[src*="img."]')).toHaveCount(0);
  await page.getByPlaceholder('Password').fill('definitely-wrong');
  await page.getByRole('button', { name: 'View gallery' }).click();
  await expect(page.locator('#lock-error')).toBeVisible();
});

test('contact form submits and confirms', async ({ page }) => {
  await page.goto('/contact/?utm_source=e2e');
  await page.getByLabel('Name').fill('Playwright');
  await page.getByLabel('Email').fill('e2e@example.com');
  await page.getByLabel('Message').fill('Smoke test — please ignore.');
  await page.getByRole('button', { name: 'Send message' }).click();
  await expect(page.locator('#sent')).toBeVisible();
});

test('contact form blocks an empty submission', async ({ page }) => {
  await page.goto('/contact/');
  await page.getByRole('button', { name: 'Send message' }).click();
  await expect(page.locator('#sent')).toBeHidden();
  expect(await page.getByLabel('Name').evaluate((el: HTMLInputElement) => el.validity.valueMissing)).toBe(true);
});

test('legacy URLs redirect and unknown ones 404', async ({ page }) => {
  await page.goto('/about/');
  await expect(page).toHaveURL(/\/$/);
  const missing = await page.goto('/no-such-page/');
  expect(missing?.status()).toBe(404);
});

test('no horizontal scroll', async ({ page }) => {
  for (const path of ['/', `/${publicGallery.slug}/`, '/contact/']) {
    await page.goto(path);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
});
