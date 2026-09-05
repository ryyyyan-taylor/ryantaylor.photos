import manifest from '../src/data/photos.json';

const COOKIE_PREFIX = 'gauth_';
const SESSION_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

interface ManifestGallery {
  slug: string;
  passwordHash: string | null;
}

const protectedGalleries = new Map<string, string>(
  (manifest.galleries as ManifestGallery[])
    .filter((g): g is ManifestGallery & { passwordHash: string } => !!g.passwordHash)
    .map((g) => [g.slug, g.passwordHash]),
);

export function protectedGalleryPasswordHash(slug: string): string | null {
  return protectedGalleries.get(slug) ?? null;
}

export function cookieNameFor(slug: string): string {
  return COOKIE_PREFIX + slug.replace(/[^a-z0-9]+/g, '_');
}

function getCookie(request: Request, name: string): string | null {
  const header = request.headers.get('Cookie');
  if (!header) return null;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === name) return part.slice(eq + 1).trim();
  }
  return null;
}

function toHex(bytes: ArrayBuffer | Uint8Array): string {
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function fromHex(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return bytes;
}

// Constant-time-ish comparison — good enough for equal-length hex/token
// strings derived from a keyed HMAC or PBKDF2 output, where the caller
// (not the attacker) controls the length being compared.
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
  ]);
}

async function sign(slug: string, exp: number, secret: string): Promise<string> {
  const key = await hmacKey(secret);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${slug}.${exp}`));
  return toHex(sig);
}

export async function issueSessionCookie(slug: string, secret: string): Promise<string> {
  const exp = Date.now() + SESSION_MS;
  const sig = await sign(slug, exp, secret);
  const value = `${exp}.${sig}`;
  const maxAge = Math.floor(SESSION_MS / 1000);
  return `${cookieNameFor(slug)}=${value}; Path=/${slug}/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`;
}

export async function hasValidSession(request: Request, slug: string, secret: string): Promise<boolean> {
  const cookie = getCookie(request, cookieNameFor(slug));
  if (!cookie) return false;
  const [expStr, sig] = cookie.split('.');
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || Date.now() > exp) return false;
  const expected = await sign(slug, exp, secret);
  return timingSafeEqual(expected, sig ?? '');
}

// passwordHash format written by scripts/sync-photos.mjs: "<iterations>:<saltHex>:<hashHex>",
// PBKDF2-SHA256 — chosen over scrypt because both Node (sync script) and the
// Workers runtime (here, via SubtleCrypto) implement it natively.
export async function verifyGalleryPassword(passwordHash: string, password: string): Promise<boolean> {
  const [iterStr, saltHex, hashHex] = passwordHash.split(':');
  const iterations = Number(iterStr);
  if (!iterations || !saltHex || !hashHex) return false;

  const keyMaterial = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, [
    'deriveBits',
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: fromHex(saltHex), iterations, hash: 'SHA-256' },
    keyMaterial,
    (hashHex.length / 2) * 8,
  );
  return timingSafeEqual(toHex(bits), hashHex);
}
