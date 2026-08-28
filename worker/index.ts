import { buildConfirmationEmail, buildIcsAttachment, type ConfirmationFields } from './emails/confirmation';

const OWNER_EMAIL = 'ryan4125taylor@gmail.com';
const SENDER = { email: 'bookings@ryantaylor.photos', name: 'Ryan Taylor Photography' };
const REQUIRED_FIELDS = ['clientName', 'clientEmail', 'project', 'date', 'startTime', 'price'] as const;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;

class ApiError extends Error {}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname.startsWith('/utils/api/')) {
      return handleApi(request, env, url);
    }

    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;

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
