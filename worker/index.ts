import { buildConfirmationEmail, buildIcsAttachment, type ConfirmationFields } from './emails/confirmation';
import {
  hasValidSession,
  issueSessionCookie,
  protectedGalleryPasswordHash,
  verifyGalleryPassword,
} from './gallery-auth';
import { legacyRedirect } from './legacy-redirects';
import { showcases } from '../src/lib/showcases';

const OWNER_EMAIL = 'ryan4125taylor@gmail.com';
const SENDER = { email: 'bookings@ryantaylor.photos', name: 'Ryan Taylor Photography' };
const REQUIRED_FIELDS = ['clientName', 'clientEmail', 'project', 'date', 'startTime', 'price'] as const;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;
const CONTACT_TOPICS = new Map([...showcases.map((s) => [s.slug, s.title] as const), ['other', 'Something else']]);

interface GalleryEnv extends Env {
  GALLERY_AUTH_SECRET: string;
}

class ApiError extends Error {}

export default {
  async fetch(request: Request, env: GalleryEnv): Promise<Response> {
    const url = new URL(request.url);

    // The __locked variant is only ever meant to be served internally, by
    // gateProtectedGallery below (a direct env.ASSETS.fetch call, which
    // never re-enters this fetch handler) — never as a page of its own.
    if (url.pathname.includes('/__locked')) {
      return new Response('Not Found', { status: 404 });
    }

    if (url.pathname.startsWith('/utils/api/')) {
      return handleApi(request, env, url);
    }

    if (url.pathname === '/api/gallery-auth') {
      return handleGalleryAuth(request, env);
    }

    if (url.pathname === '/api/contact') {
      return handleContact(request, env);
    }

    const redirect = legacyRedirect(url);
    if (redirect) return redirect;

    const gate = await gateProtectedGallery(request, env, url);
    if (gate) return gate;

    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<GalleryEnv>;

async function gateProtectedGallery(request: Request, env: GalleryEnv, url: URL): Promise<Response | null> {
  const slug = url.pathname.replace(/^\/|\/$/g, '');
  const passwordHash = protectedGalleryPasswordHash(slug);
  if (!passwordHash) return null;

  if (await hasValidSession(request, slug, env.GALLERY_AUTH_SECRET)) return null;

  // The real page, statically built with only blur-up placeholders and no
  // real photo/zip URL anywhere in it — see [...gallery].astro's `locked`
  // branch. Serve it as a 401 so it can't be mistaken for the real thing.
  const locked = await env.ASSETS.fetch(new Request(new URL(`/${slug}/__locked/`, request.url), request));
  return new Response(locked.body, { status: 401, headers: locked.headers });
}

async function handleGalleryAuth(request: Request, env: GalleryEnv): Promise<Response> {
  if (request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  const form = await request.formData().catch(() => null);
  const slug = form?.get('slug')?.toString() ?? '';
  const password = form?.get('password')?.toString() ?? '';
  const passwordHash = protectedGalleryPasswordHash(slug);

  if (!passwordHash || !(await verifyGalleryPassword(passwordHash, password))) {
    return Response.redirect(new URL(`/${slug}/?e=1`, request.url), 303);
  }

  const headers = new Headers({ Location: `/${slug}/` });
  headers.append('Set-Cookie', await issueSessionCookie(slug, env.GALLERY_AUTH_SECRET));
  return new Response(null, { status: 303, headers });
}

// Always delivers to OWNER_EMAIL only, so the form can't be used to mail
// anyone else. JS submits ask for JSON; a plain form post gets redirected to
// a #sent/#error anchor the page styles with :target.
async function handleContact(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  const wantsJson = request.headers.get('Accept')?.includes('application/json');
  const reply = (ok: boolean) =>
    wantsJson
      ? jsonResponse({ status: ok ? 'sent' : 'error' }, ok ? 200 : 400)
      : Response.redirect(new URL(`/contact/#${ok ? 'sent' : 'error'}`, request.url), 303);

  const form = await request.formData().catch(() => null);
  const field = (key: string, max: number) => (form?.get(key)?.toString().trim() ?? '').slice(0, max);

  // Honeypot: hidden from people, filled in by bots. Pretend it worked.
  if (field('website', 200)) return reply(true);

  const name = field('name', 100);
  const email = field('email', 200);
  const message = field('message', 5000);
  const topic = CONTACT_TOPICS.get(field('topic', 50)) ?? 'Something else';
  const date = field('date', 10);
  if (!name || !EMAIL_RE.test(email) || !message || (date && !DATE_RE.test(date))) return reply(false);

  const lines = [`Name: ${name}`, `Email: ${email}`, `Topic: ${topic}`, ...(date ? [`Date: ${date}`] : []), '', message];
  try {
    await env.EMAIL.send({
      to: OWNER_EMAIL,
      from: SENDER,
      replyTo: email,
      subject: `Inquiry: ${topic} from ${name}`,
      text: lines.join('\n'),
    });
    return reply(true);
  } catch (err) {
    console.error('contact email failed', err);
    return wantsJson ? jsonResponse({ status: 'error' }, 502) : reply(false);
  }
}

async function handleApi(request: Request, env: Env, url: URL): Promise<Response> {
  // Access is the real gate on /utils/*; this is a cheap backstop in case
  // that dashboard config is ever missing, so a hole there 403s instead of
  // turning this into an open relay for the sending domain.
  if (!request.headers.get('Cf-Access-Jwt-Assertion')) {
    return new Response('Forbidden', { status: 403 });
  }

  if (request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  try {
    if (url.pathname === '/utils/api/confirmation/preview') {
      return jsonResponse(buildConfirmationEmail(await readFields(request)), 200);
    }

    if (url.pathname === '/utils/api/confirmation/send') {
      const fields = await readFields(request);
      const email = buildConfirmationEmail(fields);
      const ics = buildIcsAttachment(fields);
      const result = await env.EMAIL.send({
        to: fields.clientEmail,
        from: SENDER,
        replyTo: OWNER_EMAIL,
        bcc: OWNER_EMAIL,
        subject: email.subject,
        html: email.html,
        text: email.text,
        attachments: [
          { content: ics.content, filename: ics.filename, type: ics.type, disposition: 'attachment' },
        ],
      });
      return jsonResponse({ status: 'sent', messageId: result.messageId }, 200);
    }

    return new Response('Not Found', { status: 404 });
  } catch (err) {
    if (err instanceof ApiError) {
      return jsonResponse({ error: err.message }, 400);
    }
    console.error('confirmation email failed', err);
    const message = err instanceof Error ? err.message : 'Unknown error';
    return jsonResponse({ error: message }, 502);
  }
}

async function readFields(request: Request): Promise<ConfirmationFields> {
  const body = await request.json().catch(() => {
    throw new ApiError('Invalid JSON body');
  });

  if (typeof body !== 'object' || body === null) {
    throw new ApiError('Invalid request body');
  }
  const record = body as Record<string, unknown>;

  for (const key of REQUIRED_FIELDS) {
    const value = record[key];
    if (typeof value !== 'string' || !value.trim()) {
      throw new ApiError(`Missing required field: ${key}`);
    }
  }

  const clientEmail = (record.clientEmail as string).trim();
  if (!EMAIL_RE.test(clientEmail)) {
    throw new ApiError('Client email looks invalid');
  }

  const date = (record.date as string).trim();
  if (!DATE_RE.test(date)) {
    throw new ApiError('Date must be in YYYY-MM-DD format');
  }

  const startTime = (record.startTime as string).trim();
  if (!TIME_RE.test(startTime)) {
    throw new ApiError('Start time must be in HH:MM format');
  }

  const endTimeRaw = typeof record.endTime === 'string' ? record.endTime.trim() : '';
  if (endTimeRaw && !TIME_RE.test(endTimeRaw)) {
    throw new ApiError('End time must be in HH:MM format');
  }
  if (endTimeRaw && endTimeRaw <= startTime) {
    throw new ApiError('End time must be after start time');
  }

  return {
    clientName: (record.clientName as string).trim(),
    clientEmail,
    project: (record.project as string).trim(),
    date,
    startTime,
    endTime: endTimeRaw,
    price: (record.price as string).trim(),
    details: typeof record.details === 'string' ? record.details.trim() : '',
  };
}

function jsonResponse(data: unknown, status: number): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
