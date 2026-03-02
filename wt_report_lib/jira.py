import requests
from .config import JIRA_BASE_URL, BOARD_ID, JIRA_EMAIL, JIRA_API_TOKEN


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
        data = _board_request(jql, fields=fields, max_results=100, start_at=start)
        batch = data.get("issues", [])
        issues.extend(batch)
        start += len(batch)
        if start >= data.get("total", 0) or not batch:
            break
    return issues
