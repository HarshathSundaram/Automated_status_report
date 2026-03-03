# WT Board Daily Status Report

Automated daily status reports for the **WT Jira Board (Board ID: 21)** using **Google Apps Script**. Reports are generated daily at **10:00–11:00 AM IST** and posted directly to Google Chat.

## Features

✅ **Zero cost** — runs on Google's infrastructure (free tier sufficient)  
✅ **No setup complexity** — paste script into Google Sheets, add 4 credentials  
✅ **Automatic daily trigger** — fires at 10:00–11:00 AM IST every day  
✅ **Two formatted reports** — status breakdown + SLA tracking  
✅ **Google Chat integration** — posts beautifully formatted text tables via webhook  
✅ **Mobile-friendly** — monospace formatted tables display well on all devices  

---

## What's in the Reports?

### Report 1 — Active Ticket Status Count

Shows current workload broken down by category (Rently Bugs, Smarthome Bugs, Client Requests) across workflow sections:

| Section | What it is |
|---------|-----------|
| Flag Added (With Feature Team/3rd Party Dependency) | Tickets flagged for blockers, in backlog |
| Backlog | Unflagged, pending work |
| In Progress | Active development or code review |
| Ready for Deploy | Awaiting deployment to production |
| Verification | In QA/verification phase |

Also shows:
- **Completed Yesterday** — tickets resolved in the last 24h (10 AM IST window)
- **New Tickets** — tickets created in the last 24h (10 AM IST window)
- **Totals** — per-category and grand total

### Report 2 — Bug SLA Status

Shows open bugs grouped by **Priority** (rows) vs **Age** (columns) to track SLA adherence:

| Age Bucket | Range |
|-----------|-------|
| 0–1 days | Created 0 or 1 day ago |
| 2–3 days | Created 2 or 3 days ago |
| 4–5 days | Created 4 or 5 days ago |
| 6–10 days | Created 6 to 10 days ago |
| >10 days | Created more than 10 days ago |

**Note:** Client Requests are not included in bug SLA tracking.

---

## Setup (5 minutes)

### 1. Open Google Sheets Apps Script

1. Open any Google Sheet (or create a new one)
2. Click **Extensions → Apps Script**
3. Delete any existing code and paste the contents of `google_apps_script/wt_report.gs`

### 2. Add Credentials (Script Properties)

1. In the Apps Script editor, click **Project Settings** (⚙️ icon)
2. Scroll to **Script properties** → click **Add property**
3. Add these 4 properties:

| Property | Value |
|----------|-------|
| `JIRA_BASE_URL` | `https://rently.atlassian.net` |
| `JIRA_EMAIL` | Your Jira account email |
| `JIRA_API_TOKEN` | Your Jira API token (generate in Jira: Profile → Security → API Tokens) |
| `GCHAT_WEBHOOK_URL` | Your Google Chat incoming webhook URL |

### 3. Set Sheet Timezone

1. In your Google Sheet, click **File → Settings**
2. Set **Time zone** to **(UTC+05:30) India Standard Time**

This ensures the daily trigger fires at the correct IST time.

### 4. Register the Daily Trigger

1. In the Apps Script editor, select `setupDailyTrigger` from the function dropdown
2. Click the **▶ Run** button
3. Authorize when prompted

✅ Done! The report will now run automatically every day at 10:00–11:00 AM IST.

---

## Testing

To test the report manually:

1. In the Apps Script editor, select `runDailyReport` from the function dropdown
2. Click **▶ Run**
3. Check the execution log (bottom panel) for output
4. Check your Google Chat space for the two reports

---

## How It Works

The script:

1. **Fetches data from Jira** using the Agile Board API
   - Executes targeted JQL queries (one per section + bugs)
   - Only fetches required fields (IDs, priority, created date, labels, issue type)

2. **Processes data locally**
   - Categorizes issues (Rently Bugs, Smarthome Bugs, Client Requests)
   - Groups by status section (Flag Added, Backlog, In Progress, etc.)
   - Calculates age buckets for bug SLA tracking
   - Counts completed/new tickets in the 24h IST window (yesterday 10 AM → today 10 AM)

3. **Formats reports** as fixed-width monospace text tables for Google Chat
   - Tables include aligned columns, separators, and headers
   - Format is readable on desktop, mobile, and in chat threads

4. **Posts to Google Chat** via webhook

All computation happens on Google's servers. No credentials are logged; only execution events appear in the Apps Script logger.

---

## Report Format

Reports are displayed as **fixed-width monospace text tables** that render beautifully in Google Chat on all devices.

### Report 1 Example

```
*03 Mar 2026 — White Team Status*

--- | --- | --- | --- | ---
With Feature Team | 4 | 1 | 0 | 5
Backlog          | 0 | 2 | 1 | 3
Work in Progress | 6 | 1 | 2 | 9
Production Ready | 0 | 1 | 0 | 1
Verification     | 0 | 0 | 0 | 0
--- | --- | --- | --- | ---
TOTAL            | 10| 5 | 3 | 18

**Completed Yesterday:** 2 | **New Tickets:** 3
```

**Columns:**
- Section name
- Rently (bug count)
- Smart Home (bug count)  
- Client Requests (task count)
- Total

### Report 2 Example

```
*🐛 Open Bugs SLA — 03 Mar 2026*

--- | --- | --- | --- | --- | ---
Code Red    | 0 | 0 | 0 | 0 | 0
Highest     | 0 | 0 | 0 | 0 | 0
High        | 0 | 1 | 2 | 0 | 1
Medium      | 0 | 0 | 3 | 1 | 5
Low         | 0 | 0 | 0 | 0 | 0
Information | 0 | 0 | 0 | 0 | 0

⚠️ Client Requests are not part of SLA
```

**Columns:** Priority level → Age buckets (0-1 days, 2-3 days, 4-5 days, 6-10 days, >10 days)

---

## Troubleshooting

### Tables display as HTML code instead of formatted text
- **This was an issue in earlier versions.** The script now converts HTML tables to readable monospace text for Google Chat.
- If you see raw `<table>` HTML in Google Chat, your script is using the old version. Re-paste the latest code from `google_apps_script/wt_report.gs` into your Apps Script editor.

### Script doesn't run at the scheduled time
- Check that your Google Sheet timezone is set to **Asia/Kolkata** (File → Settings)
- The trigger fires between 10:00–11:00 AM IST; the exact minute varies

### "Authorization required" error
- Click **Review permissions** when prompted and authorize the script
- Google Apps Script needs permission to call external APIs (Jira, Google Chat)

### No data in reports
- Verify all 4 credentials are correct in Script Properties
- Run `runDailyReport()` manually to see error logs at the bottom of the editor
- Check that the Salesforce Case field (`cf[10952]`) is populated on at least one ticket

### Reports not posting to Google Chat
- Verify the webhook URL is correct (should start with `https://chat.googleapis.com/...`)
- Test the webhook manually: `curl -X POST -H 'Content-Type: application/json' -d '{"text":"test"}' <WEBHOOK_URL>`

---

## Editing the Script

The script is fully modular. Common edits:

**Change the schedule:** Modify the `atHour(10)` call in `setupDailyTrigger()`  
**Change report sections:** Update the `sections` array in `formatReport1()`  
**Change bug priorities:** Edit the `PRIORITIES` array at the top of the script  

After edits, delete the old trigger (in Triggers panel) and run `setupDailyTrigger()` again.

---

## File Structure

```
Automated_status_report/
├── google_apps_script/
│   └── wt_report.gs         # Main Apps Script (copy-paste into Google Sheets)
├── README.md                # This file
└── .gitignore               # Git configuration
```

---

## Jira API Details

The script makes **8 targeted JQL queries**:

- 5 queries for Report 1 sections (fetch only issue type + labels)
- 2 count-only queries for completed/new tickets (maxResults=0, minimal data transfer)
- 1 query for Report 2 bugs (fetch only priority + created date)

**Custom fields used:**
- `customfield_10952` — Salesforce Case # (pre-condition: must not be empty)
- `customfield_10003` — Flagged field (identifies "Flag Added" section)

All queries use the Jira Agile REST API endpoint: `/rest/agile/1.0/board/21/issue`

---

## Support

For issues or questions:
1. Check the **Troubleshooting** section above
2. Run `runDailyReport()` manually to see detailed logs in the Apps Script editor
3. Verify Jira credentials have read access to the WT board
4. Ensure Google Chat webhook is accessible from Google's servers (should be no issues)

---

## License

This project is provided as-is for internal use at Rently.
