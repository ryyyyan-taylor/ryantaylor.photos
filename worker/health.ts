import manifest from '../src/data/photos.json';
import { sendAlert } from './alerts';

const SITE = 'https://ryantaylor.photos';
const IMG_BASE = 'https://img.ryantaylor.photos';
const ALERT_AFTER_MS = 10 * 60 * 1000;
const TIMEOUT_MS = 10_000;
const STATE_KEY = 'health:state';

interface Check {
  name: string;
  url: string;
  ok: (res: Response) => boolean;
}

interface CheckState {
  failingSince: number | null;
  alerted: boolean;
  lastStatus: number | null;
  lastMs: number;
  lastRun: number;
}

export type HealthState = Record<string, CheckState>;

const probeStem = manifest.galleries.find((g) => !g.passwordHash)?.photos.find((p) => p.kind === 'photo')?.stem;

const CHECKS: Check[] = [
  { name: 'site', url: `${SITE}/`, ok: (r) => r.status === 200 },
  { name: 'images', url: `${IMG_BASE}/${probeStem}-480.avif`, ok: (r) => r.status === 200 },
  {
    name: 'access-gate',
    url: `${SITE}/utils/`,
    ok: (r) => r.status === 302 && (r.headers.get('location') ?? '').includes('.cloudflareaccess.com/'),
  },
];

async function probe(check: Check): Promise<{ ok: boolean; status: number | null; ms: number }> {
  const started = Date.now();
  try {
    const res = await fetch(check.url, { redirect: 'manual', signal: AbortSignal.timeout(TIMEOUT_MS) });
    await res.body?.cancel();
    return { ok: check.ok(res), status: res.status, ms: Date.now() - started };
  } catch {
    return { ok: false, status: null, ms: Date.now() - started };
  }
}

export async function readHealth(env: Env): Promise<HealthState> {
  return (await env.MONITOR.get<HealthState>(STATE_KEY, 'json')) ?? {};
}

export async function runHealthChecks(env: Env): Promise<void> {
  const state = await readHealth(env);
  const now = Date.now();

  for (const check of CHECKS) {
    const result = await probe(check);
    const prev = state[check.name] ?? { failingSince: null, alerted: false };
    const next: CheckState = { ...prev, lastStatus: result.status, lastMs: result.ms, lastRun: now };

    env.METRICS.writeDataPoint({
      indexes: ['health'],
      blobs: ['health', check.name, result.ok ? 'up' : 'down'],
      doubles: [result.ms],
    });
    console.log({ event: 'health', outcome: result.ok ? 'up' : 'down', detail: check.name, status: result.status });

    if (result.ok) {
      if (prev.alerted) {
        await sendAlert(env, `${check.name} recovered`, `${check.url} is passing again (HTTP ${result.status}).`);
      }
      next.failingSince = null;
      next.alerted = false;
    } else {
      next.failingSince = prev.failingSince ?? now;
      if (!prev.alerted && now - next.failingSince >= ALERT_AFTER_MS) {
        next.alerted = await sendAlert(
          env,
          `${check.name} down`,
          `${check.url} has failed since ${new Date(next.failingSince).toISOString()} (last: HTTP ${result.status ?? 'timeout'}).`,
        );
      }
    }
    state[check.name] = next;
  }

  await env.MONITOR.put(STATE_KEY, JSON.stringify(state));
}

const FAILED_INQUIRY_TTL = 60 * 60 * 24 * 30;

export async function saveFailedInquiry(env: Env, text: string): Promise<void> {
  await env.MONITOR.put(`inquiry:${new Date().toISOString()}`, text, { expirationTtl: FAILED_INQUIRY_TTL });
}

export async function listFailedInquiries(env: Env): Promise<{ at: string; text: string }[]> {
  const { keys } = await env.MONITOR.list({ prefix: 'inquiry:' });
  return Promise.all(
    keys.map(async (k) => ({ at: k.name.slice('inquiry:'.length), text: (await env.MONITOR.get(k.name)) ?? '' })),
  );
}
