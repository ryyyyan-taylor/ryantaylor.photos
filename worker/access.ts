interface AccessJwk extends JsonWebKey {
  kid: string;
}

const decoder = new TextDecoder();

function fromBase64Url(input: string): Uint8Array {
  return Uint8Array.from(atob(input.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
}

function decodeSegment(input: string): Record<string, unknown> {
  return JSON.parse(decoder.decode(fromBase64Url(input)));
}

export async function verifyAccessJwt(token: string, teamDomain: string, aud: string): Promise<boolean> {
  const [headerB64, payloadB64, sigB64] = token.split('.');
  if (!headerB64 || !payloadB64 || !sigB64) return false;

  try {
    const header = decodeSegment(headerB64);
    const payload = decodeSegment(payloadB64);
    if (header.alg !== 'RS256') return false;

    const certs = await fetch(`${teamDomain}/cdn-cgi/access/certs`, { cf: { cacheTtl: 3600, cacheEverything: true } });
    const { keys } = await certs.json<{ keys: AccessJwk[] }>();
    const jwk = keys.find((k) => k.kid === header.kid);
    if (!jwk) return false;

    const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, [
      'verify',
    ]);
    const signed = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
    if (!(await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, fromBase64Url(sigB64), signed))) return false;

    return (
      payload.iss === teamDomain &&
      [payload.aud].flat().includes(aud) &&
      typeof payload.exp === 'number' &&
      payload.exp * 1000 > Date.now()
    );
  } catch {
    return false;
  }
}
