import { authed, json, rest, signRead, sendAlert, PRIORITIES, safeHref } from '../lib/shared.mjs';

const PATH_RE = /^t\/\d{4}-\d{2}\/[0-9a-f-]{36}\.(png|jpg|gif|webp)$/;
const COLS = 'id,description,url,priority,status,screenshots,reported_by,resolution_note,created_at,resolved_at,alert_sent';

export default async (req) => {
  if (!authed(req)) return json({ error: 'bad_passcode' }, 401);
  try {
    if (req.method === 'GET') return await list();
    const body = await req.json().catch(() => ({}));
    if (req.method === 'POST' && body.action === 'resend') return await resend(Number(body.id));
    if (req.method === 'POST') return await create(body);
    if (req.method === 'PATCH') return await update(Number(body.id), body);
    return json({ error: 'method_not_allowed' }, 405);
  } catch (e) {
    console.error(e);
    return json({ error: 'server_error' }, 500);
  }
};

async function list() {
  const rows = await rest(`wi_tickets?select=${COLS}&order=created_at.desc&limit=1000`);
  const urls = await signRead(rows.flatMap((r) => r.screenshots));
  for (const r of rows) r.screenshot_urls = r.screenshots.map((p) => urls[p]).filter(Boolean);
  return json(rows);
}

async function create(b) {
  const description = String(b.description || '').trim().slice(0, 5000);
  const url = String(b.url || '').trim().slice(0, 2000);
  const reported_by = String(b.reported_by || '').trim().slice(0, 100);
  const priority = PRIORITIES.includes(b.priority) ? b.priority : 'Medium';
  const screenshots = (Array.isArray(b.screenshots) ? b.screenshots : []).filter((p) => PATH_RE.test(p)).slice(0, 10);
  if (!description) return json({ error: 'Add a description of the issue.' }, 400);
  if (!reported_by) return json({ error: 'Add your name.' }, 400);
  if (url && !safeHref(url)) return json({ error: 'Enter the full URL, starting with https://, or leave it blank.' }, 400);

  const [t] = await rest(`wi_tickets?select=${COLS}`, {
    method: 'POST',
    prefer: 'return=representation',
    body: { description, url: url || null, priority, reported_by, screenshots },
  });

  let alert_sent = false;
  try {
    await sendAlert(t);
    await rest(`wi_tickets?id=eq.${t.id}`, { method: 'PATCH', body: { alert_sent: true } });
    alert_sent = true;
  } catch (e) {
    console.error('alert failed', e);
  }
  return json({ ...t, alert_sent }, 201);
}

async function update(id, b) {
  if (!Number.isInteger(id)) return json({ error: 'bad_id' }, 400);
  const patch = {};
  if (b.status === 'Open' || b.status === 'Resolved') patch.status = b.status;
  if (PRIORITIES.includes(b.priority)) patch.priority = b.priority;
  if (typeof b.resolution_note === 'string') patch.resolution_note = b.resolution_note.trim().slice(0, 2000);
  if (!Object.keys(patch).length) return json({ error: 'nothing_to_update' }, 400);
  const rows = await rest(`wi_tickets?id=eq.${id}&select=${COLS}`, { method: 'PATCH', prefer: 'return=representation', body: patch });
  if (!rows.length) return json({ error: 'not_found' }, 404);
  return json(rows[0]);
}

async function resend(id) {
  if (!Number.isInteger(id)) return json({ error: 'bad_id' }, 400);
  const rows = await rest(`wi_tickets?id=eq.${id}&select=${COLS}`);
  if (!rows.length) return json({ error: 'not_found' }, 404);
  try {
    await sendAlert(rows[0]);
  } catch (e) {
    console.error('resend failed', e);
    return json({ error: 'alert_failed' }, 502);
  }
  await rest(`wi_tickets?id=eq.${id}`, { method: 'PATCH', body: { alert_sent: true } });
  return json({ ok: true });
}

export const config = { path: '/api/tickets' };
