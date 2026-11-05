import { listFailedInquiries, readHealth } from './health';

const API = 'https://api.cloudflare.com/client/v4';
const DATASET = 'ryantaylor_photos_events';

interface StatsEnv extends Env {
  STATS_API_TOKEN: string;
}

async function sql<T>(env: StatsEnv, query: string): Promise<T[]> {
  const res = await fetch(`${API}/accounts/${env.CF_ACCOUNT_ID}/analytics_engine/sql`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.STATS_API_TOKEN}` },
    body: query,
  });
  if (!res.ok) throw new Error(`analytics engine ${res.status}: ${await res.text()}`);
  return ((await res.json()) as { data: T[] }).data;
}

async function graphql<T>(env: StatsEnv, query: string, variables: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${API}/graphql`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.STATS_API_TOKEN}`, 'content-type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });
  const body = (await res.json()) as { data: T | null; errors?: { message: string }[] };
  if (body.errors?.length) throw new Error(body.errors.map((e) => e.message).join('; '));
  return body.data as T;
}

const EVENTS_SQL = `
  SELECT blob1 AS event, blob2 AS outcome, SUM(_sample_interval) AS count
  FROM ${DATASET}
  WHERE index1 NOT IN ('request', 'health') AND timestamp > NOW() - INTERVAL '7' DAY
  GROUP BY event, outcome ORDER BY event, count DESC`;

const REQUESTS_SQL = `
  SELECT blob2 AS route, blob3 AS status, SUM(_sample_interval) AS count,
         quantileWeighted(0.95, double2, _sample_interval) AS p95_ms
  FROM ${DATASET}
  WHERE index1 = 'request' AND timestamp > NOW() - INTERVAL '1' DAY
  GROUP BY route, status ORDER BY route, status`;

const UPTIME_SQL = `
  SELECT blob2 AS check, blob3 AS result, SUM(_sample_interval) AS count,
         quantileWeighted(0.95, double1, _sample_interval) AS p95_ms
  FROM ${DATASET}
  WHERE index1 = 'health' AND timestamp > NOW() - INTERVAL '7' DAY
  GROUP BY check, result`;

const ZONE_QUERY = `query ($zone: String!, $since: Date!) {
  viewer { zones(filter: { zoneTag: $zone }) {
    httpRequests1dGroups(limit: 7, filter: { date_geq: $since }, orderBy: [date_ASC]) {
      dimensions { date }
      sum { requests cachedRequests bytes cachedBytes }
    }
  } }
}`;

const RUM_QUERY = `query ($account: String!, $site: String!, $since: Time!) {
  viewer { accounts(filter: { accountTag: $account }) {
    pages: rumPageloadEventsAdaptiveGroups(
      limit: 10, filter: { siteTag: $site, datetime_geq: $since }, orderBy: [count_DESC]
    ) { count dimensions { requestPath } }
    referrers: rumPageloadEventsAdaptiveGroups(
      limit: 10, filter: { siteTag: $site, datetime_geq: $since }, orderBy: [count_DESC]
    ) { count dimensions { refererHost } }
    vitals: rumWebVitalsEventsAdaptiveGroups(limit: 1, filter: { siteTag: $site, datetime_geq: $since }) {
      quantiles { largestContentfulPaintP75 interactionToNextPaintP75 cumulativeLayoutShiftP75 }
    }
  } }
}`;

async function section<T>(fn: () => Promise<T>): Promise<T | { error: string }> {
  try {
    return await fn();
  } catch (err) {
    return { error: String(err) };
  }
}

export async function collectStats(env: StatsEnv) {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const [health, failedInquiries, events, requests, uptime, zone, rum] = await Promise.all([
    section(() => readHealth(env)),
    section(() => listFailedInquiries(env)),
    section(() => sql(env, EVENTS_SQL)),
    section(() => sql(env, REQUESTS_SQL)),
    section(() => sql(env, UPTIME_SQL)),
    section(() => graphql(env, ZONE_QUERY, { zone: env.CF_ZONE_ID, since: since.toISOString().slice(0, 10) })),
    section(() =>
      graphql(env, RUM_QUERY, {
        account: env.CF_ACCOUNT_ID,
        site: env.WEB_ANALYTICS_SITE_TAG,
        since: since.toISOString(),
      }),
    ),
  ]);
  return { generatedAt: new Date().toISOString(), health, failedInquiries, events, requests, uptime, zone, rum };
}
