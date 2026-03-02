from datetime import datetime, timedelta
from .config import IST


def get_report_window():
    """Returns (yesterday_10am_IST, today_10am_IST) as timezone-aware datetimes."""
    now = datetime.now(IST)
    today_10am = now.replace(hour=10, minute=0, second=0, microsecond=0)
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
    if days <= 1:
        return "0-1 days"
    elif days <= 3:
        return "2-3 days"
    elif days <= 5:
        return "4-5 days"
    elif days <= 10:
        return "6-10 days"
    else:
        return ">10 days"
