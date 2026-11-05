export const OWNER_EMAIL = 'ryan4125taylor@gmail.com';
export const SENDER = { email: 'bookings@ryantaylor.photos', name: 'Ryan Taylor Photography' };
const ALERT_SENDER = { email: SENDER.email, name: 'ryantaylor.photos monitor' };

export async function sendAlert(env: Env, subject: string, text: string): Promise<boolean> {
  try {
    await env.EMAIL.send({ to: OWNER_EMAIL, from: ALERT_SENDER, subject: `[alert] ${subject}`, text });
    return true;
  } catch (err) {
    console.error({ event: 'alert', outcome: 'error', subject, error: String(err) });
    return false;
  }
}
