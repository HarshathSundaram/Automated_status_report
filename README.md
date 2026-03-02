# Automated Status Report (wt-daily-report)

A small utility to generate automated daily status reports.

**Repository**: Automated_status_report
**Owner**: HarshathSundaram

# Automated Status Report (wt-daily-report)

A small utility to generate automated daily status reports.

**Repository**: Automated_status_report
**Owner**: HarshathSundaram

**What it does:**
- Runs `wt_report.py` to produce status output and save logs to the `logs/` directory.

**Files of interest**
- [wt_report.py](wt_report.py) - main script that generates the report
- [Dockerfile](Dockerfile) - container definition
- [requirements.txt](requirements.txt) - Python dependencies
- `logs/` - directory where runtime logs are written

**Prerequisites**
- Python 3.8+ and `pip`
- (Optional) Docker for container runs

**Install**
```bash
pip install -r requirements.txt
```

**Run locally**
```bash
python wt_report.py
```

**Run with Docker**
```bash
docker build -t wt-daily-report .
docker run --rm -v "$(pwd)/logs":/app/logs wt-daily-report
```

**Logs**
- Runtime output and generated reports are placed in the `logs/` directory.

**Notes**
- No explicit configuration file is required by default; check `wt_report.py` for environment-specific options.

## Examples

### 1) Quick run (local)
Run the script directly:

```bash
python wt_report.py
```

Sample console output (example):

```
2026-03-02 09:00:00 INFO Generating daily status report
Report saved to logs/report_2026-03-02.txt
```

### 2) Inspect a generated report
Open a report file written to `logs/`, e.g. `logs/report_2026-03-02.txt`.

Example contents:

```
Date: 2026-03-02
Summary:
- Completed tasks: 3
- In progress: 2
- Blockers: None
```

### 3) Run in Docker (mount logs)
Build and run the image with host-mounted `logs/` so reports persist:

```bash
docker build -t wt-daily-report .
docker run --rm -v "$(pwd)/logs":/app/logs \
	-e TZ=UTC \
	wt-daily-report
```

### 4) Troubleshooting
- If you see missing dependencies, run `pip install -r requirements.txt`.
- If the container can't write to `logs/`, ensure the host `logs/` directory exists and has write permissions.

---

If you'd like, I can add a short `docker-compose.yml`, a CI job to lint/format, or expand examples with real sample outputs produced by `wt_report.py`.

## Refactor notes

The code was recently modularized into a small package to make it easier to read and test:

- `wt_report.py` — orchestration entrypoint (lightweight).
- `wt_report_lib/config.py` — environment-driven constants.
- `wt_report_lib/jira.py` — Jira API helpers (`fetch_issues`, `fetch_count`).
- `wt_report_lib/date_utils.py` — date parsing and window helpers.
- `wt_report_lib/compute.py` — report computation logic.
- `wt_report_lib/formatters.py` — message formatting for Google Chat.
- `wt_report_lib/gchat.py` — Google Chat poster.
- `wt_report_lib/logger.py` — simple logging helper.

This makes the code DRY and easier to write unit tests for individual pieces.

## Environment variables

The script requires the following environment variables for a full run:

- `JIRA_EMAIL` — Jira account email
- `JIRA_API_TOKEN` — Jira API token
- `GCHAT_WEBHOOK_URL` — Google Chat webhook URL (where reports are posted)

Optional overrides:

- `JIRA_BASE_URL` — default: `https://rently.atlassian.net`
- `BOARD_ID` — default: `21`

If any required variables are missing, the script will exit with an error.

## Run (local)

Install dependencies, then run the entrypoint:

```bash
pip install -r requirements.txt
python wt_report.py
```

The script writes a per-day log to `logs/run_YYYY-MM-DD.log`.

## Run with Docker

Build the image, then run it with the current project directory mounted so the code and `logs/` directory are available inside the container:

```bash
docker build -t wt-daily-report .
docker run --rm -v "$(pwd)":/app -w /app wt-daily-report
```

### Container notes (workflow error & fix)

If you run the GitHub Actions workflow or the container and see this error:

```
ModuleNotFoundError: No module named 'wt_report_lib'
```

Root cause: the Dockerfile only copied `wt_report.py` into the image and did not include the `wt_report_lib/` package, so Python couldn't import the new modules.

Fix applied: the `Dockerfile` now explicitly copies the package into the image:

```dockerfile
COPY wt_report.py .
COPY wt_report_lib ./wt_report_lib
COPY .env.example .
```

Rebuild the image and run locally to confirm:

```bash
docker build -t wt-daily-report .
docker run --rm -v "$(pwd)/logs":/app/logs wt-daily-report
```

If you prefer to copy the entire repo into the image instead, ensure you add a proper `.dockerignore` to exclude local artifacts (e.g., `venv/`, `.git`, `logs/`).


## Inspect logs and reports

Tail the current run log:

```bash
tail -n 200 logs/run_$(date +%F).log
```

Open a generated report (example):

```bash
less logs/report_2026-03-02.txt
```

## Troubleshooting

- Missing dependencies: `pip install -r requirements.txt`.
- Missing env vars: export the required variables before running.
- If posting to Google Chat fails, check `logs/run_*.log` for the HTTP error.

---

If you'd like, I can add unit tests for `wt_report_lib/` modules, a `docker-compose.yml`, or a CI workflow to run linting and tests on pushes.
