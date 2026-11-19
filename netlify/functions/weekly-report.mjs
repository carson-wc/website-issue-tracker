import { rest, postWebhook, ref, esc, safeHref, fmt, SITE_URL, PRIORITIES } from '../lib/shared.mjs';

// Runs Mondays at 15:00 UTC (8 AM Mountain in winter, 9 AM in summer).
export const config = { schedule: '0 15 * * 1' };

const rank = (p) => PRIORITIES.indexOf(p);
const day = (d) => d.toLocaleDateString('en-US', { timeZone: 'America/Denver', month: 'short', day: 'numeric' });

export default async () => {
  const end = new Date();
  const start = new Date(end.getTime() - 7 * 864e5);
  const s = start.toISOString();

  const week = await rest(`wi_tickets?select=*&created_at=gte.${s}&order=created_at.desc`);
  const older = await rest(`wi_tickets?select=*&created_at=lt.${s}&status=eq.Open&order=created_at.asc`);
  const resolvedThisWeek = await rest(`wi_tickets?select=id&resolved_at=gte.${s}`);
  week.sort((a, b) => rank(a.priority) - rank(b.priority));
  older.sort((a, b) => rank(a.priority) - rank(b.priority));

  const head = '<tr><th>Ticket</th><th>Priority</th><th>Status</th><th>Issue</th><th>URL</th><th>Reported</th></tr>';
  const row = (t) => {
    const h = safeHref(t.url);
    return `<tr><td>${ref(t.id)}</td><td>${esc(t.priority)}</td><td>${esc(t.status)}</td><td>${esc(t.description.replace(/\s+/g, ' ').slice(0, 140))}</td><td>${h ? `<a href="${esc(h)}">${esc(t.url)}</a>` : 'None'}</td><td>${esc(fmt(t.created_at))}</td></tr>`;
  };
  const table = (rows) => (rows.length ? `<table border="1" cellpadding="4">${head}${rows.map(row).join('')}</table>` : '<p>None.</p>');
  const open = week.filter((t) => t.status === 'Open').length;

  const subject = `Website Issue Tracker: Weekly Report (${day(start)} to ${day(end)})`;
  const html = `<p><strong>Website Issue Tracker: ${day(start)} to ${day(end)}</strong></p>
<ul>
<li>New issues reported: ${week.length} (${open} open, ${week.length - open} resolved)</li>
<li>Resolved this week (any age): ${resolvedThisWeek.length}</li>
<li>Still open from earlier weeks: ${older.length}</li>
</ul>
<p><strong>Reported this week</strong></p>
${table(week)}
<p><strong>Still open from earlier weeks</strong></p>
${table(older)}
<p><a href="${esc(SITE_URL)}">Open the Website Issue Tracker</a></p>`;

  await postWebhook(process.env.REPORT_WEBHOOK_URL, {
    type: 'message',
    attachments: [],
    email: { to: process.env.REPORT_TO || '', subject, html },
  });
  console.log(`Weekly report sent: ${week.length} new, ${older.length} older open`);
};
