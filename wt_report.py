#!/usr/bin/env python3
"""
WT Board Daily Report
- Fetches ticket stats from Jira WT board (Board ID 21)
- Generates 2 reports and posts them to a Google Chat webhook
- Run daily at 10 AM IST via cron: 30 4 * * * /path/to/venv/bin/python /path/to/wt_report.py
"""

import os
import sys
import requests
from datetime import datetime, timedelta
import pytz
from dotenv import load_dotenv

load_dotenv()

# ── Configuration ─────────────────────────────────────────────────────────────
JIRA_BASE_URL = os.getenv("JIRA_BASE_URL", "https://rently.atlassian.net")
JIRA_EMAIL = os.getenv("JIRA_EMAIL")
JIRA_API_TOKEN = os.getenv("JIRA_API_TOKEN")
GCHAT_WEBHOOK_URL = os.getenv("GCHAT_WEBHOOK_URL")
BOARD_ID = int(os.getenv("BOARD_ID", "21"))

SALESFORCE_CASE_FIELD = "customfield_10952"
FLAGGED_FIELD         = "customfield_10003"

IST = pytz.timezone("Asia/Kolkata")

# Report 2 priority order
PRIORITIES  = ["Code Red", "Highest", "High", "Medium", "Low", "Information"]
AGE_BUCKETS = ["0-1 days", "2-3 days", "4-5 days", "6-10 days", ">10 days"]

# JQL building blocks
SF_NOT_EMPTY = "cf[10952] is not EMPTY"
UNRESOLVED   = "resolution is EMPTY"
BASE_ACTIVE  = f"{SF_NOT_EMPTY} AND {UNRESOLVED}"

SECTION_KEYS = ["flag_added", "backlog", "in_progress", "ready_for_deploy", "verification"]
CAT_KEYS     = ["rently_bugs", "smarthome_bugs", "client_tasks"]


# ── Jira API helpers ───────────────────────────────────────────────────────────

def get_auth():
    return (JIRA_EMAIL, JIRA_API_TOKEN)


def _board_request(jql, fields, max_results, start_at=0):
    url = f"{JIRA_BASE_URL}/rest/agile/1.0/board/{BOARD_ID}/issue"
    params = {"jql": jql, "maxResults": max_results, "startAt": start_at}
    if fields:
        params["fields"] = fields
    resp = requests.get(url, auth=get_auth(), params=params, timeout=30)
    resp.raise_for_status()
    return resp.json()


def fetch_count(jql):
    """Return only the total issue count for a JQL query (no data transferred)."""
    return _board_request(jql, fields=None, max_results=0).get("total", 0)


def fetch_issues(jql, fields):
    """Paginate through board issues for the given JQL, fetching only requested fields."""
    issues, start = [], 0
    while True:
        data  = _board_request(jql, fields=fields, max_results=100, start_at=start)
        batch = data.get("issues", [])
        issues.extend(batch)
        start += len(batch)
        if start >= data.get("total", 0) or not batch:
            break
    return issues


# ── Date helpers ───────────────────────────────────────────────────────────────

def get_report_window():
    """Returns (yesterday_10am_IST, today_10am_IST) as timezone-aware datetimes."""
    now = datetime.now(IST)
    today_10am    = now.replace(hour=10, minute=0, second=0, microsecond=0)
    yesterday_10am = today_10am - timedelta(days=1)
    return yesterday_10am, today_10am


def parse_jira_dt(dt_str):
    """Parse a Jira datetime string and return IST-aware datetime."""
    if not dt_str:
        return None
    dt = datetime.fromisoformat(dt_str)
    if dt.tzinfo is None:
        dt = IST.localize(dt)
    return dt.astimezone(IST)


def age_bucket(days):
    if days <= 1:   return "0-1 days"
    elif days <= 3: return "2-3 days"
    elif days <= 5: return "4-5 days"
    elif days <= 10: return "6-10 days"
    else:           return ">10 days"


# ── Report computations ────────────────────────────────────────────────────────

def _categorize(raw):
    """Bucket a raw Jira issue into rently_bugs / smarthome_bugs / client_tasks."""
    f = raw["fields"]
    issue_type = (f.get("issuetype") or {}).get("name", "").lower()
    labels     = [l.upper() for l in (f.get("labels") or [])]
    if issue_type == "bug":
        return "smarthome_bugs" if "SMARTHOME" in labels else "rently_bugs"
    return "client_tasks"


def compute_report1():
    yesterday_10am, today_10am = get_report_window()
    win_start = yesterday_10am.strftime("%Y-%m-%d %H:%M")
    win_end   = today_10am.strftime("%Y-%m-%d %H:%M")

    # One targeted JQL per section — only fetch issuetype + labels for categorisation
    section_jql = {
        "flag_added":       f'{BASE_ACTIVE} AND cf[10003] is not EMPTY AND status in ("Current Backlog", "Backlog")',
        "backlog":          f'{BASE_ACTIVE} AND cf[10003] is EMPTY AND status in ("Current Backlog", "Backlog")',
        "in_progress":      f'{BASE_ACTIVE} AND status in ("In Progress", "In Code Review", "For QE Verification")',
        "ready_for_deploy": f'{BASE_ACTIVE} AND status = "Ready for Deployment"',
        "verification":     f'{BASE_ACTIVE} AND status = "In Verification"',
    }

    counts = {cat: {sec: 0 for sec in SECTION_KEYS} for cat in CAT_KEYS}

    for sec_key, jql in section_jql.items():
        print(f"  [{sec_key}] fetching…")
        for raw in fetch_issues(jql, fields="issuetype,labels"):
            counts[_categorize(raw)][sec_key] += 1

    # Count-only queries — no issue data needed
    print("  [completed_yesterday] fetching…")
    completed_yesterday = fetch_count(
        f'{SF_NOT_EMPTY} AND resolutionDate >= "{win_start}" AND resolutionDate < "{win_end}"'
    )

    print("  [new_tickets] fetching…")
    new_tickets = fetch_count(
        f'{SF_NOT_EMPTY} AND created >= "{win_start}" AND created < "{win_end}"'
    )

    return counts, completed_yesterday, new_tickets


def compute_report2():
    # Fetch only priority + created for unresolved bugs with a Salesforce case
    jql = f"{SF_NOT_EMPTY} AND {UNRESOLVED} AND issuetype = Bug"
    print(f"  [report2 bugs] fetching…")
    raw_issues = fetch_issues(jql, fields="priority,created")

    table = {p: {b: 0 for b in AGE_BUCKETS} for p in PRIORITIES}

    for raw in raw_issues:
        f   = raw["fields"]
        pri = (f.get("priority") or {}).get("name", "Medium")
        matched = next((p for p in PRIORITIES if p.lower() == pri.lower()), "Medium")

        created_dt = parse_jira_dt(f.get("created"))
        days       = (datetime.now(IST).date() - created_dt.date()).days if created_dt else 0
        table[matched][age_bucket(days)] += 1

    return table


# ── Message formatting ─────────────────────────────────────────────────────────

def format_report1(counts, completed_yesterday, new_tickets):
    today_str = datetime.now(IST).strftime("%d %b %Y")
    lines = [f"*📊 WT Board Daily Report 1 — {today_str}*", ""]

    categories = [
        ("rently_bugs",    "Rently Bugs"),
        ("smarthome_bugs", "Smarthome Bugs"),
        ("client_tasks",   "Client Tasks"),
    ]
    sections = [
        ("flag_added",       "Flag Added"),
        ("backlog",          "Backlog"),
        ("in_progress",      "In Progress"),
        ("ready_for_deploy", "Ready for Deploy"),
        ("verification",     "Verification"),
    ]

    # Transpose: sections as rows, categories as columns
    # "Ready for Deploy" (16 chars) drives row-header width → ~62 chars total
    sec_w      = max(len(s[1]) for s in sections) + 2
    col_widths = [max(len(c[1]) + 2, 6) for c in categories]

    header   = f"{'Section':<{sec_w}}" + "".join(f"{c[1]:^{col_widths[i]}}" for i, c in enumerate(categories))
    sep      = "=" * len(header)
    thin_sep = "-" * len(header)

    lines.append(f"```\n{sep}")
    lines.append(header)
    lines.append(sep)

    for sec_key, sec_label in sections:
        row = f"{sec_label:<{sec_w}}" + "".join(
            f"{counts[cat_key][sec_key]:^{col_widths[i]}}" for i, (cat_key, _) in enumerate(categories)
        )
        lines.append(row)
        lines.append(thin_sep)

    lines.append("```")

    # Totals shown separately below the table
    cat_totals  = {cat_key: sum(counts[cat_key][s] for s, _ in sections) for cat_key, _ in categories}
    grand_total = sum(cat_totals.values())
    lines.append("")
    lines.append(f"🔴 *Rently Bugs Total:*      {cat_totals['rently_bugs']}")
    lines.append(f"🏠 *Smarthome Bugs Total:*   {cat_totals['smarthome_bugs']}")
    lines.append(f"📋 *Client Tasks Total:*     {cat_totals['client_tasks']}")
    lines.append(f"📊 *Grand Total:*            {grand_total}")
    lines.append("")
    lines.append(f"✅ *Completed Yesterday:*    {completed_yesterday}")
    lines.append(f"🆕 *New Tickets (last 24h):* {new_tickets}")

    return "\n".join(lines)


def format_report2(table):
    today_str = datetime.now(IST).strftime("%d %b %Y")
    lines = [f"*🐛 WT Board Daily Report 2 — Bug SLA Status — {today_str}*", ""]

    # Build plain-text table
    col_w = 10
    pri_w = 12
    header = f"{'Priority':<{pri_w}}" + "".join(f"{b:>{col_w}}" for b in AGE_BUCKETS)
    sep    = "-" * len(header)
    lines.append(f"```\n{header}")
    lines.append(sep)
    for priority in PRIORITIES:
        row = f"{priority:<{pri_w}}" + "".join(f"{table[priority][b]:>{col_w}}" for b in AGE_BUCKETS)
        lines.append(row)
    lines.append("```")

    return "\n".join(lines)


# ── Google Chat ────────────────────────────────────────────────────────────────

def post_to_gchat(text):
    resp = requests.post(GCHAT_WEBHOOK_URL, json={"text": text}, timeout=15)
    resp.raise_for_status()


# ── Entry point ────────────────────────────────────────────────────────────────

def log(msg, file=None):
    line = f"[{datetime.now(IST).strftime('%Y-%m-%d %H:%M:%S IST')}] {msg}"
    print(line)
    if file:
        file.write(line + "\n")
        file.flush()


def main():
    missing = [v for v in ("JIRA_EMAIL", "JIRA_API_TOKEN", "GCHAT_WEBHOOK_URL") if not os.getenv(v)]
    if missing:
        print(f"ERROR: Missing environment variables: {', '.join(missing)}", file=sys.stderr)
        sys.exit(1)

    log_dir = os.path.join(os.path.dirname(__file__), "logs")
    os.makedirs(log_dir, exist_ok=True)
    log_file_path = os.path.join(log_dir, f"run_{datetime.now(IST).strftime('%Y-%m-%d')}.log")

    with open(log_file_path, "a") as lf:
        log(f"=== Run started (Board {BOARD_ID}) ===", lf)

        try:
            log("Report 1 — fetching section data via JQL...", lf)
            counts, completed_yesterday, new_tickets = compute_report1()
            msg1 = format_report1(counts, completed_yesterday, new_tickets)
            log("Report 1 computed successfully.", lf)

            log("Report 2 — fetching bug data via JQL...", lf)
            table = compute_report2()
            msg2 = format_report2(table)
            log("Report 2 computed successfully.", lf)

            log("Posting Report 1 to Google Chat...", lf)
            post_to_gchat(msg1)

            log("Posting Report 2 to Google Chat...", lf)
            post_to_gchat(msg2)

            log("=== Run completed successfully ===", lf)

        except Exception as e:
            log(f"ERROR: {e}", lf)
            raise


if __name__ == "__main__":
    main()
