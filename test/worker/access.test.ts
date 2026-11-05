import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { verifyAccessJwt } from '../../worker/access';

const TEAM = 'https://team.cloudflareaccess.com';
const AUD = 'test-aud';

const b64url = (data: string | ArrayBuffer) =>
  btoa(typeof data === 'string' ? data : String.fromCharCode(...new Uint8Array(data)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

let keys: CryptoKeyPair;
let publicJwk: JsonWebKey & { kid: string };

async function sign(payload: Record<string, unknown>, header: Record<string, unknown> = { alg: 'RS256', kid: 'k1' }) {
  const signingInput = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', keys.privateKey, new TextEncoder().encode(signingInput));
  return `${signingInput}.${b64url(sig)}`;
}

const validPayload = () => ({ iss: TEAM, aud: [AUD], exp: Math.floor(Date.now() / 1000) + 300 });

beforeAll(async () => {
  keys = (await crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true,
    ['sign', 'verify'],
  )) as CryptoKeyPair;
  publicJwk = { ...((await crypto.subtle.exportKey('jwk', keys.publicKey)) as JsonWebKey), kid: 'k1' };
});

beforeEach(() => {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async () => Response.json({ keys: [publicJwk] }));
});

describe('verifyAccessJwt', () => {
  it('accepts a token signed by the team key for this app', async () => {
    expect(await verifyAccessJwt(await sign(validPayload()), TEAM, AUD)).toBe(true);
    expect(fetch).toHaveBeenCalledWith(`${TEAM}/cdn-cgi/access/certs`, expect.anything());
  });

  it('accepts a string aud claim', async () => {
    expect(await verifyAccessJwt(await sign({ ...validPayload(), aud: AUD }), TEAM, AUD)).toBe(true);
  });

  it.each([
    ['wrong audience', { aud: ['other-app'] }],
    ['wrong issuer', { iss: 'https://evil.cloudflareaccess.com' }],
    ['expired', { exp: Math.floor(Date.now() / 1000) - 1 }],
    ['missing exp', { exp: undefined }],
  ])('rejects %s', async (_, overrides) => {
    expect(await verifyAccessJwt(await sign({ ...validPayload(), ...overrides }), TEAM, AUD)).toBe(false);
  });

  it('rejects a tampered payload', async () => {
    const [header, , sig] = (await sign(validPayload())).split('.');
    const forged = b64url(JSON.stringify({ ...validPayload(), aud: [AUD], sub: 'attacker' }));
    expect(await verifyAccessJwt(`${header}.${forged}.${sig}`, TEAM, AUD)).toBe(false);
  });

  it('rejects an unknown key id', async () => {
    expect(await verifyAccessJwt(await sign(validPayload(), { alg: 'RS256', kid: 'other' }), TEAM, AUD)).toBe(false);
  });

  it('rejects alg none', async () => {
    const token = `${b64url(JSON.stringify({ alg: 'none', kid: 'k1' }))}.${b64url(JSON.stringify(validPayload()))}.`;
    expect(await verifyAccessJwt(token, TEAM, AUD)).toBe(false);
  });

  it.each(['', 'x', 'a.b.c', 'not-a-jwt.at.all'])('rejects malformed token %j', async (token) => {
    expect(await verifyAccessJwt(token, TEAM, AUD)).toBe(false);
  });

  it('fails closed when the certs endpoint is down', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response('nope', { status: 500 }));
    expect(await verifyAccessJwt(await sign(validPayload()), TEAM, AUD)).toBe(false);
  });
});
