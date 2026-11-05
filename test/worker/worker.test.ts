import { env } from 'cloudflare:test';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import manifest from '../../src/data/photos.json';
import worker from '../../worker/index';
import { listFailedInquiries } from '../../worker/health';

const send = vi.fn();
const testEnv = () => ({ ...env, EMAIL: { send } }) as unknown as Parameters<typeof worker.fetch>[1];
const call = (path: string, init?: RequestInit) =>
  worker.fetch(new Request(`https://ryantaylor.photos${path}`, init), testEnv());

function contact(fields: Record<string, string>) {
  const body = new FormData();
  for (const [k, v] of Object.entries(fields)) body.set(k, v);
  return call('/api/contact', { method: 'POST', body, headers: { Accept: 'application/json' } });
}

const valid = { name: 'Ada', email: 'ada@example.com', message: 'Hi there', topic: 'other' };

beforeEach(() => {
  send.mockReset().mockResolvedValue({ messageId: 'm1' });
});

describe('contact form', () => {
  it('only accepts POST', async () => {
    expect((await call('/api/contact')).status).toBe(405);
  });

  it('emails the owner only, with reply-to set to the sender', async () => {
    const res = await contact(valid);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'sent' });
    expect(send).toHaveBeenCalledOnce();
    const message = send.mock.calls[0][0];
    expect(message.to).toBe('ryan4125taylor@gmail.com');
    expect(message.replyTo).toBe('ada@example.com');
    expect(message.subject).toBe('Inquiry: Something else from Ada');
  });

  it('includes the visit source', async () => {
    const landing = JSON.stringify({ path: '/archive/', referrer: 'instagram.com', utm: { utm_source: 'IG', utm_campaign: 'bio' } });
    await contact({ ...valid, landing });
    expect(send.mock.calls[0][0].text).toContain('Source: utm_source=IG · utm_campaign=bio · referrer instagram.com · landed on /archive/');
  });

  it('labels a visit without a source as direct, and ignores junk', async () => {
    await contact({ ...valid, landing: '{not json' });
    expect(send.mock.calls[0][0].text).toContain('Source: direct');
  });

  it('pretends a honeypot submission worked without sending', async () => {
    const res = await contact({ ...valid, website: 'http://spam.example' });
    expect(await res.json()).toEqual({ status: 'sent' });
    expect(send).not.toHaveBeenCalled();
  });

  it.each([
    ['missing name', { name: '' }],
    ['bad email', { email: 'not-an-email' }],
    ['missing message', { message: '' }],
    ['bad date', { date: '11/05/2026' }],
  ])('rejects %s', async (_, overrides) => {
    const res = await contact({ ...valid, ...overrides });
    expect(res.status).toBe(400);
    expect(send).not.toHaveBeenCalled();
  });

  it('keeps the inquiry and alerts when sending fails', async () => {
    send.mockRejectedValueOnce(new Error('upstream down')).mockResolvedValue({});
    const res = await contact({ ...valid, message: 'please keep me' });
    expect(res.status).toBe(502);
    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[1][0].subject).toBe('[alert] contact email failed');
    const saved = await listFailedInquiries(testEnv());
    expect(saved.some((i) => i.text.includes('please keep me'))).toBe(true);
  });
});

describe('/utils/api', () => {
  it.each(['/utils/api/stats', '/utils/api/confirmation/send'])('403s %s without a valid Access token', async (path) => {
    for (const headers of [{}, { 'Cf-Access-Jwt-Assertion': 'forged.token.value' }] as Record<string, string>[]) {
      const res = await call(path, { method: path.endsWith('stats') ? 'GET' : 'POST', headers });
      expect(res.status).toBe(403);
    }
    expect(send).not.toHaveBeenCalled();
  });
});

describe('protected galleries', () => {
  const locked = manifest.galleries.find((g) => g.passwordHash)!;

  it("never serves the __locked variant directly", async () => {
    expect((await call(`/${locked.slug}/__locked/`)).status).toBe(404);
  });

  it('serves the lock screen as a 401 without a session', async () => {
    expect((await call(`/${locked.slug}/`)).status).toBe(401);
  });

  it('bounces a wrong password back with an error flag', async () => {
    const body = new FormData();
    body.set('slug', locked.slug);
    body.set('password', 'definitely-wrong');
    const res = await call('/api/gallery-auth', { method: 'POST', body });
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toBe(`https://ryantaylor.photos/${locked.slug}/?e=1`);
    expect(res.headers.get('set-cookie')).toBeNull();
  });
});
