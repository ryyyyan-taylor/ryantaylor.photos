import { describe, expect, it, vi } from 'vitest';
import { cookieNameFor, hasValidSession, issueSessionCookie, verifyGalleryPassword } from '../../worker/gallery-auth';

const SECRET = 'test-secret';
const SLUG = 'clients/smith-wedding';

const toHex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

// Same "<iterations>:<saltHex>:<hashHex>" format scripts/sync-photos.mjs writes.
async function hashPassword(password: string, iterations = 1000) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations, hash: 'SHA-256' }, key, 256);
  return `${iterations}:${toHex(salt.buffer)}:${toHex(bits)}`;
}

function requestWithCookie(setCookie: string) {
  return new Request(`https://ryantaylor.photos/${SLUG}/`, { headers: { Cookie: setCookie.split(';')[0] } });
}

describe('verifyGalleryPassword', () => {
  it('accepts the right password and rejects others', async () => {
    const hash = await hashPassword('hunter2');
    expect(await verifyGalleryPassword(hash, 'hunter2')).toBe(true);
    expect(await verifyGalleryPassword(hash, 'hunter3')).toBe(false);
    expect(await verifyGalleryPassword(hash, '')).toBe(false);
  });

  it.each(['', 'garbage', '0:aa:bb', '1000::'])('rejects malformed hash %j', async (hash) => {
    expect(await verifyGalleryPassword(hash, 'anything')).toBe(false);
  });
});

describe('gallery session cookie', () => {
  it('is scoped to the gallery path and hardened', async () => {
    const cookie = await issueSessionCookie(SLUG, SECRET);
    expect(cookie.startsWith(`${cookieNameFor(SLUG)}=`)).toBe(true);
    expect(cookie).toContain(`Path=/${SLUG}/`);
    expect(cookie).toMatch(/HttpOnly; Secure; SameSite=Lax/);
  });

  it('validates for the slug and secret it was issued for', async () => {
    const cookie = await issueSessionCookie(SLUG, SECRET);
    expect(await hasValidSession(requestWithCookie(cookie), SLUG, SECRET)).toBe(true);
    expect(await hasValidSession(requestWithCookie(cookie), SLUG, 'other-secret')).toBe(false);
  });

  it("doesn't unlock a different gallery", async () => {
    const cookie = await issueSessionCookie(SLUG, SECRET);
    const other = 'clients/jones';
    const forged = cookie.replace(cookieNameFor(SLUG), cookieNameFor(other));
    expect(await hasValidSession(requestWithCookie(forged), other, SECRET)).toBe(false);
  });

  it('rejects a tampered expiry', async () => {
    const cookie = await issueSessionCookie(SLUG, SECRET);
    const tampered = cookie.replace(/=(\d+)\./, (_, exp) => `=${Number(exp) + 1}.`);
    expect(await hasValidSession(requestWithCookie(tampered), SLUG, SECRET)).toBe(false);
  });

  it('expires after 30 days', async () => {
    const cookie = await issueSessionCookie(SLUG, SECRET);
    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 31 * 24 * 60 * 60 * 1000);
    expect(await hasValidSession(requestWithCookie(cookie), SLUG, SECRET)).toBe(false);
  });

  it('is absent without a cookie', async () => {
    expect(await hasValidSession(new Request('https://ryantaylor.photos/'), SLUG, SECRET)).toBe(false);
  });
});
