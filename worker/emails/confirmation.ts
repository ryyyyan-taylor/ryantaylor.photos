export interface ConfirmationFields {
  clientName: string;
  clientEmail: string;
  project: string;
  date: string; // YYYY-MM-DD
  startTime: string; // HH:MM (24h)
  endTime: string; // HH:MM (24h), may be empty
  price: string;
  details: string;
}

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

export interface IcsAttachment {
  filename: string;
  content: string;
  type: string;
}

const TIMEZONE = 'America/Denver';
const TERMS_URL = 'https://ryantaylor.photos/terms/';
const DEFAULT_DURATION_MINUTES = 60;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function nl2br(value: string): string {
  return escapeHtml(value).replace(/\n/g, '<br />');
}

// Resolves a wall-clock date/time in `timeZone` to the UTC instant it represents,
// correctly accounting for DST on that specific date.
function zonedTimeToUtc(dateStr: string, timeStr: string, timeZone: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number);
  const [hour, minute] = timeStr.split(':').map(Number);
  const utcGuess = Date.UTC(year, month - 1, day, hour, minute);

  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(utcGuess));

  const map: Record<string, string> = {};
  for (const part of parts) map[part.type] = part.value;

  const asUtc = Date.UTC(
    Number(map.year),
    Number(map.month) - 1,
    Number(map.day),
    Number(map.hour) === 24 ? 0 : Number(map.hour),
    Number(map.minute),
    Number(map.second),
  );

  return new Date(utcGuess - (asUtc - utcGuess));
}

function resolveEventWindow(fields: ConfirmationFields): { start: Date; end: Date } {
  const start = zonedTimeToUtc(fields.date, fields.startTime, TIMEZONE);
  const end = fields.endTime
    ? zonedTimeToUtc(fields.date, fields.endTime, TIMEZONE)
    : new Date(start.getTime() + DEFAULT_DURATION_MINUTES * 60_000);
  return { start, end };
}

function formatDisplayDate(dateStr: string): string {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

function formatDisplayTime(timeStr: string): string {
  const [hour, minute] = timeStr.split(':').map(Number);
  const period = hour >= 12 ? 'PM' : 'AM';
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${hour12}:${String(minute).padStart(2, '0')} ${period}`;
}

function formatIcsDate(date: Date): string {
  return date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
}

function icsEscape(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');
}

function googleCalendarUrl(fields: ConfirmationFields, start: Date, end: Date): string {
  const details = `Booking with Ryan Taylor Photography.${fields.details ? `\n\n${fields.details}` : ''}`;
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: fields.project,
    dates: `${formatIcsDate(start)}/${formatIcsDate(end)}`,
    details,
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

const ROW_LABEL_STYLE =
  'padding:10px 0;border-bottom:1px solid #e2ded7;color:#6f6c64;font-size:13px;letter-spacing:0.04em;text-transform:uppercase;width:35%;vertical-align:top;';
const ROW_VALUE_STYLE = 'padding:10px 0;border-bottom:1px solid #e2ded7;color:#16150f;font-size:15px;vertical-align:top;';

export function buildConfirmationEmail(fields: ConfirmationFields): RenderedEmail {
  const { start, end } = resolveEventWindow(fields);
  const subject = `Booking confirmed: ${fields.project} — ${formatDisplayDate(fields.date)}`;
  const timeDisplay = fields.endTime
    ? `${formatDisplayTime(fields.startTime)} – ${formatDisplayTime(fields.endTime)}`
    : formatDisplayTime(fields.startTime);
  const calendarUrl = googleCalendarUrl(fields, start, end);

  const rows: [string, string][] = [
    ['Client', fields.clientName],
    ['Project', fields.project],
    ['Date', formatDisplayDate(fields.date)],
    ['Time', timeDisplay],
    ['Price', fields.price],
  ];

  const rowsHtml = rows
    .map(
      ([label, value]) => `
        <tr>
          <td style="${ROW_LABEL_STYLE}">${escapeHtml(label)}</td>
          <td style="${ROW_VALUE_STYLE}">${escapeHtml(value)}</td>
        </tr>`,
    )
    .join('');

  const detailsHtml = fields.details
    ? `
        <tr>
          <td colspan="2" style="padding:20px 0 0;">
            <p style="margin:0 0 6px;color:#6f6c64;font-size:13px;letter-spacing:0.04em;text-transform:uppercase;">Details</p>
            <p style="margin:0;color:#16150f;font-size:15px;line-height:1.6;">${nl2br(fields.details)}</p>
          </td>
        </tr>`
    : '';

  const html = `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#fbfaf9;font-family:Georgia,'Times New Roman',serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fbfaf9;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border:1px solid #e2ded7;">
            <tr>
              <td style="padding:32px 40px 8px;">
                <p style="margin:0;font-size:12px;letter-spacing:0.14em;text-transform:uppercase;color:#6f6c64;">Ryan Taylor Photography</p>
                <h1 style="margin:8px 0 0;font-size:24px;font-weight:400;color:#16150f;">Booking confirmed</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:8px 40px 0;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                  ${rowsHtml}${detailsHtml}
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:24px 40px 8px;">
                <a href="${calendarUrl}" style="display:inline-block;padding:10px 22px;border:1px solid #16150f;color:#16150f;text-decoration:none;font-size:13px;letter-spacing:0.04em;">Add to Google Calendar</a>
              </td>
            </tr>
            <tr>
              <td style="padding:20px 40px 8px;color:#6f6c64;font-size:13px;line-height:1.6;">
                Questions? Just reply to this email.
              </td>
            </tr>
            <tr>
              <td style="padding:8px 40px 28px;color:#9a968d;font-size:11px;line-height:1.6;">
                By booking, you agree to the <a href="${TERMS_URL}" style="color:#9a968d;">terms &amp; conditions</a>.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  const text = [
    'Booking confirmed — Ryan Taylor Photography',
    '',
    `Client: ${fields.clientName}`,
    `Project: ${fields.project}`,
    `Date: ${formatDisplayDate(fields.date)}`,
    `Time: ${timeDisplay}`,
    `Price: ${fields.price}`,
    ...(fields.details ? ['', 'Details:', fields.details] : []),
    '',
    `Add to Google Calendar: ${calendarUrl}`,
    '',
    'Questions? Just reply to this email.',
    '',
    `By booking, you agree to the terms & conditions: ${TERMS_URL}`,
  ].join('\n');

  return { subject, html, text };
}

export function buildIcsAttachment(fields: ConfirmationFields): IcsAttachment {
  const { start, end } = resolveEventWindow(fields);
  const uid = `${crypto.randomUUID()}@ryantaylor.photos`;
  const description = `Booking with Ryan Taylor Photography.${fields.details ? `\n\n${fields.details}` : ''}`;

  const content = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Ryan Taylor Photography//Booking Confirmation//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${formatIcsDate(new Date())}`,
    `DTSTART:${formatIcsDate(start)}`,
    `DTEND:${formatIcsDate(end)}`,
    `SUMMARY:${icsEscape(fields.project)}`,
    `DESCRIPTION:${icsEscape(description)}`,
    'END:VEVENT',
    'END:VCALENDAR',
    '',
  ].join('\r\n');

  return { filename: 'appointment.ics', content, type: 'text/calendar' };
}
