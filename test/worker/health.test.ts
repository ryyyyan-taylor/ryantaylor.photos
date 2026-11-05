import { env } from 'cloudflare:test';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readHealth, runHealthChecks } from '../../worker/health';

const send = vi.fn();
const testEnv = () => ({ ...env, EMAIL: { send } }) as unknown as Env;
const MIN = 60 * 1000;
let now = Date.UTC(2026, 10, 5, 12, 0);
let imagesUp = true;

function respond(url: string): Response {
  if (url.endsWith('/utils/')) {
    return new Response(null, { status: 302, headers: { location: 'https://team.cloudflareaccess.com/login' } });
  }
  if (url.includes('img.') && !imagesUp) return new Response('gone', { status: 503 });
  return new Response('ok');
}

async function tick(minutes: number) {
  now += minutes * MIN;
  await runHealthChecks(testEnv());
}

const alerts = () => send.mock.calls.map(([m]) => m.subject);

beforeEach(async () => {
  send.mockReset().mockResolvedValue({});
  imagesUp = true;
  vi.spyOn(Date, 'now').mockImplementation(() => now);
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => respond(String(input instanceof Request ? input.url : input)));
  await env.MONITOR.delete('health:state');
});

describe('runHealthChecks', () => {
  it('records all checks as up', async () => {
    await tick(5);
    const state = await readHealth(testEnv());
    expect(Object.keys(state).sort()).toEqual(['access-gate', 'images', 'site']);
    expect(Object.values(state).every((c) => c.failingSince === null)).toBe(true);
    expect(send).not.toHaveBeenCalled();
  });

  it('alerts once after 10 minutes down, then on recovery', async () => {
    imagesUp = false;
    await tick(5);
    await tick(5);
    expect(alerts()).toEqual([]);

    await tick(5);
    expect(alerts()).toEqual(['[alert] images down']);

    await tick(5);
    expect(alerts()).toHaveLength(1);

    imagesUp = true;
    await tick(5);
    expect(alerts()).toEqual(['[alert] images down', '[alert] images recovered']);
    expect((await readHealth(testEnv())).images.failingSince).toBeNull();
  });

  it("doesn't alert on a blip shorter than the threshold", async () => {
    imagesUp = false;
    await tick(5);
    imagesUp = true;
    await tick(5);
    expect(send).not.toHaveBeenCalled();
  });

  it('treats an Access gate that stops redirecting as down', async () => {
    vi.mocked(fetch).mockImplementation(async () => new Response('open'));
    await tick(5);
    expect((await readHealth(testEnv()))['access-gate'].failingSince).toBe(now);
  });

  it('retries the alert next run if sending it failed', async () => {
    imagesUp = false;
    send.mockRejectedValueOnce(new Error('mail down'));
    await tick(5);
    await tick(10);
    await tick(5);
    expect(send).toHaveBeenCalledTimes(2);
  });
});
