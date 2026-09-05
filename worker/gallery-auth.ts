import manifest from '../src/data/photos.json';

const COOKIE_PREFIX = 'gauth_';
const SESSION_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

interface ManifestPhoto {
  id: string;
  lqip: string;
}

interface ManifestGallery {
  slug: string;
  title: string;
  cover: string;
  photos: ManifestPhoto[];
  passwordHash: string | null;
}

interface ProtectedGallery {
  title: string;
  passwordHash: string;
  // The cover photo's existing blur-up placeholder (tiny, already-blurry
  // inline data URI) — reused as the lock screen's backdrop so it reads as
  // "blurred preview of the real gallery" without sending any real photo or
  // zip URL to a visitor who hasn't entered the password yet.
  coverLqip: string | null;
}

const protectedGalleries = new Map<string, ProtectedGallery>(
  (manifest.galleries as ManifestGallery[])
    .filter((g): g is ManifestGallery & { passwordHash: string } => !!g.passwordHash)
    .map((g) => {
      const cover = g.photos.find((p) => p.id === g.cover) ?? g.photos[0];
      return [g.slug, { title: g.title, passwordHash: g.passwordHash, coverLqip: cover?.lqip || null }];
    }),
);

export function protectedGallery(slug: string) {
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

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function renderLockPage(slug: string, title: string, coverLqip: string | null, invalid: boolean): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex,nofollow" />
<title>${escapeHtml(title)} — Ryan Taylor</title>
<style>
  :root { --bg: #fbfaf9; --fg: #16150f; --muted: #6f6c64; --border: #e4e1da; }
  @media (prefers-color-scheme: dark) {
    :root { --bg: #0d0c0a; --fg: #eeece7; --muted: #8e8a82; --border: #2a2822; }
  }
  * { box-sizing: border-box; }
  html, body { height: 100%; }
  body {
    margin: 0; color: var(--fg);
    font: 16px/1.5 -apple-system, "Segoe UI", Inter, system-ui, sans-serif;
  }
  .backdrop {
    position: fixed; inset: -5%;
    ${coverLqip ? `background-image: url("${coverLqip}");` : 'background: linear-gradient(135deg, #2a2822, #0d0c0a);'}
    background-size: cover; background-position: center;
    filter: blur(48px) saturate(1.15) brightness(0.85);
    transform: scale(1.1); /* keep the blur radius from revealing an unblurred edge */
  }
  .scrim {
    position: fixed; inset: 0; background: rgba(0, 0, 0, 0.4);
    display: flex; align-items: center; justify-content: center; padding: 1.5rem;
    transition: opacity 0.35s ease, transform 0.35s ease;
  }
  .scrim.is-dismissing { opacity: 0; transform: scale(1.02); pointer-events: none; }
  .card {
    width: 100%; max-width: 22rem; text-align: center;
    background: var(--bg); color: var(--fg);
    border-radius: 0.75rem; padding: 2rem 1.75rem;
    box-shadow: 0 1.5rem 4rem rgba(0, 0, 0, 0.35);
  }
  h1 { font-size: 1.15rem; font-weight: 500; margin: 0 0 0.35rem; }
  p { color: var(--muted); margin: 0 0 1.5rem; font-size: 0.9rem; }
  form { display: flex; flex-direction: column; gap: 0.75rem; }
  input {
    font: inherit; padding: 0.65rem 0.8rem; border-radius: 0.4rem;
    border: 1px solid var(--border); background: transparent; color: var(--fg);
  }
  input:focus { outline: 2px solid var(--fg); outline-offset: 1px; }
  button {
    font: inherit; padding: 0.65rem 0.8rem; border-radius: 0.4rem; border: none;
    background: var(--fg); color: var(--bg); cursor: pointer;
  }
  button:disabled { opacity: 0.6; cursor: default; }
  .error { color: #e08670; font-size: 0.85rem; margin: -0.5rem 0 0; }
</style>
</head>
<body>
<div class="backdrop"></div>
<div class="scrim" id="scrim">
  <main class="card">
    <h1>${escapeHtml(title)}</h1>
    <p>This gallery is password protected.</p>
    <form id="lock-form" method="post" action="/api/gallery-auth">
      <input type="hidden" name="slug" value="${escapeHtml(slug)}" />
      <input type="password" name="password" placeholder="Password" required autofocus />
      <p class="error" id="lock-error" ${invalid ? '' : 'hidden'}>Wrong password — try again.</p>
      <button type="submit">View gallery</button>
    </form>
  </main>
</div>
<script>
  // Progressive enhancement: without JS the form still works via a normal
  // POST + redirect (see worker/index.ts handleGalleryAuth). With JS, submit
  // in place so the scrim can fade out instead of round-tripping through a
  // full navigation to get back here.
  const form = document.getElementById('lock-form');
  const scrim = document.getElementById('scrim');
  const errorEl = document.getElementById('lock-error');
  const button = form.querySelector('button');

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    button.disabled = true;
    errorEl.hidden = true;

    try {
      const response = await fetch('/api/gallery-auth', { method: 'POST', body: new FormData(form) });
      if (response.ok) {
        scrim.classList.add('is-dismissing');
        setTimeout(() => location.reload(), 350);
      } else {
        errorEl.hidden = false;
        button.disabled = false;
      }
    } catch {
      errorEl.hidden = false;
      button.disabled = false;
    }
  });
</script>
</body>
</html>`;
}
