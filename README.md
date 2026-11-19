# weBoost Website Issue Tracker

CX reports weboost.com issues; Brenden (Digital Merchandising) works them. Netlify hosts the site, Supabase (Sandbox project) stores tickets and screenshots, and Power Automate sends the Teams alert and emails.

```
site/index.html                 the tracker page
netlify/functions/tickets.mjs   list, create, update tickets; fires the alert
netlify/functions/upload-url.mjs   one-time screenshot upload links
netlify/functions/weekly-report.mjs   runs Mondays 15:00 UTC (8 AM Mountain)
netlify/lib/shared.mjs          Supabase, passcode, alert helpers
```

Already done in Supabase (Sandbox): table `wi_tickets` (locked to the server key, no public access) and private storage bucket `wi-screenshots` (10 MB per image).

## 1. Build the two Power Automate flows

Both use the trigger **When a Teams webhook request is received** (standard license, no premium).

### Flow 1: New ticket alert
1. Power Automate > Create > Instant cloud flow > Skip > add trigger **When a Teams webhook request is received**. Set **Who can trigger the flow** to **Anyone**.
2. Add **Microsoft Teams > Post card in a chat or channel**
   - Post as: **Flow bot**
   - Post in: **Chat with Flow bot**
   - Recipient: `bjarrett@wilsonconnectivity.com`
   - Adaptive Card (expression): `triggerBody()?['attachments']?[0]?['content']`
3. Add **Office 365 Outlook > Send an email (V2)**
   - To: `bjarrett@wilsonconnectivity.com`
   - CC: `cdrawe@wilsonconnectivity.com`
   - Subject (expression): `triggerBody()?['email']?['subject']`
   - Body: switch to code view `</>`, then expression: `triggerBody()?['email']?['html']`
4. Save. Open the trigger and copy the URL. This is `ALERT_WEBHOOK_URL`.

### Flow 2: Weekly report
1. Same trigger as above, **Anyone** can trigger.
2. Add **Office 365 Outlook > Send an email (V2)**
   - To: `bjarrett@wilsonconnectivity.com; aschlichting@wilsonconnectivity.com; bamerson@wilsonconnectivity.com; cdrawe@wilsonconnectivity.com; zbaker@wilsonconnectivity.com; amcclure@wilsonconnectivity.com; iswier@wilsonconnectivity.com; mbakker@wilsonconnectivity.com; csizemore@wilsonconnectivity.com; rkoford@wilsonconnectivity.com`
   - Subject (expression): `triggerBody()?['email']?['subject']`
   - Body: code view, expression `triggerBody()?['email']?['html']`
3. Save and copy the trigger URL. This is `REPORT_WEBHOOK_URL`.

## 2. Deploy to Netlify

Functions need a Git or CLI deploy (drag-and-drop only publishes the page).

- **GitHub:** push this folder to a repo, then Netlify > Add new site > Import from Git. No build command needed; `netlify.toml` sets everything.
- **CLI:** `npm i -g netlify-cli`, then from this folder run `netlify deploy --prod`.

## 3. Environment variables

Netlify > Site configuration > Environment variables:

| Name | Value |
|---|---|
| `SUPABASE_URL` | `https://jyaybgwfyxtfhvjvbxxw.supabase.co` |
| `SUPABASE_SECRET_KEY` | Supabase > Sandbox > Project Settings > API Keys > **secret** key (or legacy `service_role`). Never put this in the page. |
| `TEAM_PASSCODE` | The shared passcode you give the team |
| `ALERT_WEBHOOK_URL` | From Flow 1 |
| `REPORT_WEBHOOK_URL` | From Flow 2 |

Redeploy after adding them (Deploys > Trigger deploy).

## 4. Test
1. Open the site, enter the passcode, submit a test ticket with a pasted screenshot. Brenden should get the Teams card and email within a minute.
2. Netlify > Functions > `weekly-report` > **Run now** to test the report.
3. Delete test tickets in Supabase > Table Editor > `wi_tickets`.

## Notes
- **Changing the passcode:** update `TEAM_PASSCODE` and redeploy. Everyone is asked again on their next action.
- **Alert failed?** The ticket still saves; open it and click **Resend alert**.
- **Deleting tickets:** done in Supabase Table Editor (no delete button in the page, on purpose).
- Ticket numbers run `WEB-0001`, `WEB-0002`, and so on.
