from .date_utils import parse_jira_dt, age_bucket, get_report_window
from .jira import fetch_issues, fetch_count
from .config import SF_NOT_EMPTY, UNRESOLVED, BASE_ACTIVE, SECTION_KEYS, CAT_KEYS, PRIORITIES, AGE_BUCKETS
from datetime import datetime


def _categorize(raw):
    """Bucket a raw Jira issue into rently_bugs / smarthome_bugs / client_tasks."""
    f = raw["fields"]
    issue_type = (f.get("issuetype") or {}).get("name", "").lower()
    labels = [l.upper() for l in (f.get("labels") or [])]
    if issue_type == "bug":
        return "smarthome_bugs" if "SMARTHOME" in labels else "rently_bugs"
    return "client_tasks"


def compute_report1():
    yesterday_10am, today_10am = get_report_window()
    win_start = yesterday_10am.strftime("%Y-%m-%d %H:%M")
    win_end = today_10am.strftime("%Y-%m-%d %H:%M")

    section_jql = {
        "flag_added": f'{BASE_ACTIVE} AND cf[10003] is not EMPTY AND status in ("Current Backlog", "Backlog")',
        "backlog": f'{BASE_ACTIVE} AND cf[10003] is EMPTY AND status in ("Current Backlog", "Backlog")',
        "in_progress": f'{BASE_ACTIVE} AND status in ("In Progress", "In Code Review", "For QE Verification")',
        "ready_for_deploy": f'{BASE_ACTIVE} AND status = "Ready for Deployment"',
        "verification": f'{BASE_ACTIVE} AND status = "In Verification"',
    }

    counts = {cat: {sec: 0 for sec in SECTION_KEYS} for cat in CAT_KEYS}

    for sec_key, jql in section_jql.items():
        print(f"  [{sec_key}] fetching…")
        for raw in fetch_issues(jql, fields="issuetype,labels"):
            counts[_categorize(raw)][sec_key] += 1

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
    jql = f"{SF_NOT_EMPTY} AND {UNRESOLVED} AND issuetype = Bug"
    print(f"  [report2 bugs] fetching…")
    raw_issues = fetch_issues(jql, fields="priority,created")

    table = {p: {b: 0 for b in AGE_BUCKETS} for p in PRIORITIES}

    for raw in raw_issues:
        f = raw["fields"]
        pri = (f.get("priority") or {}).get("name", "Medium")
        matched = next((p for p in PRIORITIES if p.lower() == pri.lower()), "Medium")

        created_dt = parse_jira_dt(f.get("created"))
        days = (datetime.now().date() - created_dt.date()).days if created_dt else 0
        table[matched][age_bucket(days)] += 1

    return table
