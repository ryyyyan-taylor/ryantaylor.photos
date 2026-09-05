import manifest from '../src/data/photos.json';

const COOKIE_PREFIX = 'gauth_';
const SESSION_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

interface ManifestPhoto {
  lqip: string;
  width: number;
  height: number;
}

interface ManifestGallery {
  slug: string;
  title: string;
  photos: ManifestPhoto[];
  passwordHash: string | null;
}

export interface LockPreviewTile {
  lqip: string;
  aspect: number;
}

interface ProtectedGallery {
  title: string;
  passwordHash: string;
  // Every photo's existing blur-up placeholder (tiny, already-blurry inline
  // data URI) laid out in the real gallery's order — reused as the lock
  // screen's backdrop so it reads as a blurred preview of the actual page
  // without sending any real photo or zip URL to a visitor who hasn't
  // entered the password yet.
  tiles: LockPreviewTile[];
}

const protectedGalleries = new Map<string, ProtectedGallery>(
  (manifest.galleries as ManifestGallery[])
    .filter((g): g is ManifestGallery & { passwordHash: string } => !!g.passwordHash)
    .map((g) => [
      g.slug,
      {
        title: g.title,
        passwordHash: g.passwordHash,
        tiles: g.photos
          .filter((p) => p.lqip)
          .map((p) => ({ lqip: p.lqip, aspect: p.width / p.height })),
      },
    ]),
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

export function renderLockPage(slug: string, title: string, tiles: LockPreviewTile[], invalid: boolean): string {
  const tileHtml = tiles
    .map((t) => `<div class="tile" style="aspect-ratio:${t.aspect.toFixed(4)};background-image:url('${t.lqip}')"></div>`)
    .join('');

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
    margin: 0; color: var(--fg); background: var(--bg);
    font: 16px/1.5 -apple-system, "Segoe UI", Inter, system-ui, sans-serif;
    overflow: hidden; /* the preview underneath is decorative, never meant to scroll */
  }
  /* A stand-in for the real page — same header shape and a masonry grid of
     every photo's blur-up placeholder, laid out in gallery order — then the
     whole thing blurred hard as one composition. Every image here is the
     tiny (~24px) placeholder already shipped for lazy-loading, not a real
     photo, so blurring is presentation, not the only thing hiding anything. */
  .page-preview {
    position: fixed; inset: -6%;
    filter: blur(32px) saturate(1.1) brightness(0.92);
    transform: scale(1.08); /* keeps the blur radius from showing an unblurred edge */
  }
  .preview-header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 1.25rem 1.75rem; font-weight: 500;
  }
  .preview-header span:last-child { color: var(--muted); font-size: 0.9rem; }
  .preview-grid {
    column-count: 2; column-gap: 0.85rem; padding: 0 1.75rem;
  }
  @media (min-width: 40rem) { .preview-grid { column-count: 3; } }
  @media (min-width: 68rem) { .preview-grid { column-count: 4; } }
  .tile {
    break-inside: avoid; margin-bottom: 0.85rem; border-radius: 0.5rem;
    background-size: cover; background-position: center;
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
<div class="page-preview">
  <div class="preview-header"><span>Ryan Taylor</span><span>Work&nbsp;&nbsp;About</span></div>
  <div class="preview-grid">${tileHtml}</div>
</div>
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
