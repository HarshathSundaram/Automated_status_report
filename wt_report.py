#!/usr/bin/env python3
"""
WT Board Daily Report (refactored)

This file is the orchestration entrypoint; helpers live in `wt_report_lib`.
"""

import os
import sys
from datetime import datetime
from dotenv import load_dotenv

# Load environment before importing config-backed modules
load_dotenv()

from wt_report_lib.config import BOARD_ID, IST
from wt_report_lib.logger import log
from wt_report_lib.compute import compute_report1, compute_report2
from wt_report_lib.formatters import format_report1, format_report2
from wt_report_lib.gchat import post_to_gchat


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
