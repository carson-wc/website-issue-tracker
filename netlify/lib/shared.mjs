import crypto from 'node:crypto';

const SB = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const KEY = process.env.SUPABASE_SECRET_KEY || '';
export const BUCKET = 'wi-screenshots';
export const PRIORITIES = ['Urgent', 'High', 'Medium', 'Low'];
export const SITE_URL = process.env.URL || '';

export const ref = (id) => 'WEB-' + String(id).padStart(4, '0');
export const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

// Shared team passcode, compared in constant time.
export function authed(req) {
  const want = process.env.TEAM_PASSCODE || '';
  const got = req.headers.get('x-team-passcode') || '';
  if (!want) return false;
  const a = Buffer.from(got), b = Buffer.from(want);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function sbHeaders(extra = {}) {
  const h = { apikey: KEY, ...extra };
  // Legacy service_role keys are JWTs and go in Authorization too; new sb_secret_ keys only use apikey.
  if (!KEY.startsWith('sb_')) h.Authorization = 'Bearer ' + KEY;
  return h;
}

export async function rest(path, { method = 'GET', body, prefer } = {}) {
  const r = await fetch(`${SB}/rest/v1/${path}`, {
    method,
    headers: sbHeaders({ 'Content-Type': 'application/json', ...(prefer ? { Prefer: prefer } : {}) }),
    body: body ? JSON.stringify(body) : undefined,
  });
  const t = await r.text();
  if (!r.ok) throw new Error(`Supabase ${r.status}: ${t}`);
  return t ? JSON.parse(t) : null;
}

// Signed links to view screenshots. Returns {path: url}.
export async function signRead(paths, expiresIn = 3600) {
  if (!paths.length) return {};
  const r = await fetch(`${SB}/storage/v1/object/sign/${BUCKET}`, {
    method: 'POST',
    headers: sbHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ expiresIn, paths }),
  });
  if (!r.ok) throw new Error(`Storage sign ${r.status}: ${await r.text()}`);
  const out = {};
  for (const x of await r.json()) if (x.signedURL) out[x.path] = `${SB}/storage/v1${x.signedURL}`;
  return out;
}

// One-time link the browser uploads a screenshot to.
export async function signUpload(path) {
  const r = await fetch(`${SB}/storage/v1/object/upload/sign/${BUCKET}/${path}`, {
    method: 'POST',
    headers: sbHeaders(),
  });
  if (!r.ok) throw new Error(`Storage upload sign ${r.status}: ${await r.text()}`);
  const j = await r.json();
  return `${SB}/storage/v1${j.url}`;
}

export async function postWebhook(url, payload) {
  if (!url) throw new Error('Webhook URL not set');
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!r.ok) throw new Error(`Webhook ${r.status}: ${await r.text()}`);
}

export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export const safeHref = (u) => {
  try { const x = new URL(u); return x.protocol === 'https:' || x.protocol === 'http:' ? x.href : null; } catch { return null; }
};

const fmt = (iso) =>
  new Date(iso).toLocaleString('en-US', { timeZone: 'America/Denver', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
export { fmt };

// Payload for the "new ticket" Power Automate flow: a Teams card plus a ready-made email.
export async function sendAlert(t) {
  const shots = await signRead(t.screenshots || [], 60 * 60 * 24 * 7);
  const shotLinks = (t.screenshots || []).map((p, i) => shots[p]).filter(Boolean);
  const href = safeHref(t.url);
  const short = t.description.replace(/\s+/g, ' ').slice(0, 60);
  const subject = `[Web Issue Ticket] ${ref(t.id)} | ${t.priority} | ${short}`;
  const html = `<p><strong>New website issue reported</strong></p>
<table>
<tr><td><strong>Ticket</strong></td><td>${ref(t.id)}</td></tr>
<tr><td><strong>Priority</strong></td><td>${esc(t.priority)}</td></tr>
<tr><td><strong>URL affected</strong></td><td>${href ? `<a href="${esc(href)}">${esc(t.url)}</a>` : 'Not provided'}</td></tr>
<tr><td><strong>Reported by</strong></td><td>${esc(t.reported_by)}</td></tr>
<tr><td><strong>Screenshots</strong></td><td>${shotLinks.length ? shotLinks.map((u, i) => `<a href="${esc(u)}">Screenshot ${i + 1}</a>`).join(' | ') : 'None'}</td></tr>
</table>
<p><strong>Description</strong><br>${esc(t.description).replace(/\n/g, '<br>')}</p>
<p><a href="${esc(SITE_URL)}">Open the Website Issue Tracker</a></p>`;

  const card = {
    type: 'AdaptiveCard',
    $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
    version: '1.4',
    body: [
      { type: 'TextBlock', text: `New website issue: ${ref(t.id)}`, weight: 'Bolder', size: 'Medium', wrap: true },
      {
        type: 'FactSet',
        facts: [
          { title: 'Priority', value: t.priority },
          { title: 'URL', value: t.url || 'Not provided' },
          { title: 'Reported by', value: t.reported_by },
          { title: 'Screenshots', value: String(shotLinks.length) },
        ],
      },
      { type: 'TextBlock', text: t.description.slice(0, 1000), wrap: true },
    ],
    actions: [{ type: 'Action.OpenUrl', title: 'Open tracker', url: SITE_URL || 'https://example.com' }],
  };

  await postWebhook(process.env.ALERT_WEBHOOK_URL, {
    type: 'message',
    attachments: [{ contentType: 'application/vnd.microsoft.card.adaptive', contentUrl: null, content: card }],
    email: { to: process.env.ALERT_TO || '', subject, html },
    ticket: { ref: ref(t.id), priority: t.priority, url: t.url || '', description: t.description, reported_by: t.reported_by },
  });
}
