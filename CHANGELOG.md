# Changelog

All notable changes to this project are documented here.

## [Latest] - HTML-to-Text Table Conversion Fix

### Problem
Reports were posting raw HTML table code to Google Chat instead of formatted tables, resulting in unreadable output like:
```
<table border="1" cellpadding="8" cellspacing="0" style="..."><tr>...
```

### Root Cause
- HTML-to-image conversion API (`htmltoimage.app`) was unreliable in Google Apps Script context
- Fallback mechanism was posting raw HTML directly to webhook

### Solution
✅ **Replaced HTML-to-image conversion with HTML-to-text parsing**

- Created `htmlToFormattedText()` function that:
  - Parses HTML table structure with regex
  - Extracts data cells and headers
  - Formats as fixed-width monospace text with ASCII table separators
  - Properly handles metric extraction (Completed Yesterday, New Tickets)

- Updated `postToChat()` to use text formatting when image conversion fails

### Result
Reports now display as beautifully formatted text tables in Google Chat:

```
*03 Mar 2026 — White Team Status*

--- | --- | --- | --- | ---
Flag Added   | 4    | 1   | 0   | 5   
--- | --- | --- | --- | ---
Backlog      | 0    | 2   | 1   | 3   
Work in Progress | 6 | 1 | 2 | 9
Production Ready | 0 | 1 | 0 | 1
Verification | 0 | 0 | 0 | 0
--- | --- | --- | --- | ---
TOTAL        | 10   | 5   | 3   | 18  
--- | --- | --- | --- | ---

Completed Yesterday:: 2
New Tickets:: 3
```

### Files Changed
- `google_apps_script/wt_report.gs` — Added HTML-to-text conversion logic
- `README.md` — Updated documentation with formatted table examples

### How to Update
Copy the latest `google_apps_script/wt_report.gs` into your Google Apps Script editor and run `setupDailyTrigger()` to reregister.

---

## Previous Versions

### [v1.0] - Initial Google Apps Script Implementation
- Migrated from Python + Docker + GitHub Actions to Google Apps Script (zero cost)
- Implemented daily trigger at 10:00-11:00 AM IST
- Created Report 1 (status breakdown) and Report 2 (bug SLA)
- Integrated with Jira Agile Board API
- Posted to Google Chat via webhook
