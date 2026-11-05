// One call per business event: a structured Workers Logs line plus an
// Analytics Engine data point (blobs: event, outcome, detail; double: count).
export function track(env: Env, event: string, outcome: string, detail = '', extra: Record<string, unknown> = {}) {
  const line = { event, outcome, ...(detail && { detail }), ...extra };
  if (outcome === 'error') console.error(line);
  else console.log(line);
  env.METRICS.writeDataPoint({ indexes: [event], blobs: [event, outcome, detail], doubles: [1] });
}

export function routeGroup(pathname: string): string {
  if (pathname === '/api/contact') return 'contact';
  if (pathname === '/api/gallery-auth') return 'gallery-auth';
  if (pathname.startsWith('/utils/api/')) return 'utils-api';
  if (pathname.startsWith('/utils/')) return 'utils';
  return 'site';
}

// blobs: 'request', route group, status class; doubles: status, worker ms.
export function trackRequest(env: Env, pathname: string, status: number, ms: number) {
  const route = routeGroup(pathname);
  env.METRICS.writeDataPoint({
    indexes: ['request'],
    blobs: ['request', route, `${Math.floor(status / 100)}xx`],
    doubles: [status, ms],
  });
}
