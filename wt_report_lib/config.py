import os
import pytz

# Basic configuration populated from environment
JIRA_BASE_URL = os.getenv("JIRA_BASE_URL", "https://rently.atlassian.net")
JIRA_EMAIL = os.getenv("JIRA_EMAIL")
JIRA_API_TOKEN = os.getenv("JIRA_API_TOKEN")
GCHAT_WEBHOOK_URL = os.getenv("GCHAT_WEBHOOK_URL")
BOARD_ID = int(os.getenv("BOARD_ID", "21"))

SALESFORCE_CASE_FIELD = "customfield_10952"
FLAGGED_FIELD = "customfield_10003"

IST = pytz.timezone("Asia/Kolkata")

# Report 2 priority order
PRIORITIES = ["Code Red", "Highest", "High", "Medium", "Low", "Information"]
AGE_BUCKETS = ["0-1 days", "2-3 days", "4-5 days", "6-10 days", ">10 days"]

# JQL building blocks
SF_NOT_EMPTY = "cf[10952] is not EMPTY"
UNRESOLVED = "resolution is EMPTY"
BASE_ACTIVE = f"{SF_NOT_EMPTY} AND {UNRESOLVED}"

SECTION_KEYS = ["flag_added", "backlog", "in_progress", "ready_for_deploy", "verification"]
CAT_KEYS = ["rently_bugs", "smarthome_bugs", "client_tasks"]
